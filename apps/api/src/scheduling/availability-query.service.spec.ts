/**
 * Tests para AvailabilityQueryService — fuente de verdad de "quién está en turno".
 *
 * Cobertura:
 *   - Helpers timezone-aware (toLocalDate, toLocalDayOfWeek, toLocalTime)
 *   - isWithinShift: turnos normales + overnight + edge cases
 *   - getOnShiftStaff con turnos recurrentes
 *   - getOnShiftStaff con StaffShiftException OFF (precedencia absoluta)
 *   - getOnShiftStaff con StaffShiftException MODIFIED y EXTRA
 *   - Multi-timezone: la misma hora UTC produce resultados distintos según timezone
 */
import { Test, TestingModule } from '@nestjs/testing'
import { AvailabilityQueryService } from './availability-query.service'
import { PrismaService } from '../prisma/prisma.service'

describe('AvailabilityQueryService', () => {
  let service: AvailabilityQueryService

  const prismaMock = {
    propertySettings: { findUnique: jest.fn() },
    staffShiftException: { findMany: jest.fn() },
    staffShift: { findMany: jest.fn() },
    housekeepingStaff: { findMany: jest.fn() },
  }

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityQueryService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile()
    service = moduleRef.get(AvailabilityQueryService)
    jest.clearAllMocks()
  })

  // ── Helpers ───────────────────────────────────────────────────────────────

  describe('isWithinShift helper', () => {
    it('detecta hora dentro de turno normal (07:00-15:00)', () => {
      expect(AvailabilityQueryService._isWithinShift('10:30', '07:00', '15:00')).toBe(true)
    })

    it('rechaza hora fuera de turno normal', () => {
      expect(AvailabilityQueryService._isWithinShift('06:00', '07:00', '15:00')).toBe(false)
      expect(AvailabilityQueryService._isWithinShift('15:00', '07:00', '15:00')).toBe(false)
      expect(AvailabilityQueryService._isWithinShift('22:00', '07:00', '15:00')).toBe(false)
    })

    it('detecta hora dentro de turno overnight (22:00-06:00)', () => {
      expect(AvailabilityQueryService._isWithinShift('23:30', '22:00', '06:00')).toBe(true)
      expect(AvailabilityQueryService._isWithinShift('03:00', '22:00', '06:00')).toBe(true)
    })

    it('rechaza hora fuera de turno overnight', () => {
      expect(AvailabilityQueryService._isWithinShift('21:00', '22:00', '06:00')).toBe(false)
      expect(AvailabilityQueryService._isWithinShift('06:00', '22:00', '06:00')).toBe(false)
      expect(AvailabilityQueryService._isWithinShift('12:00', '22:00', '06:00')).toBe(false)
    })

    it('rechaza shift vacío (start === end)', () => {
      expect(AvailabilityQueryService._isWithinShift('10:00', '07:00', '07:00')).toBe(false)
    })
  })

  describe('toLocalDate / toLocalDayOfWeek / toLocalTime', () => {
    it('toLocalDate retorna YYYY-MM-DD en la timezone correcta', () => {
      // 2026-04-29 03:00 UTC = 2026-04-28 22:00 en America/Cancun (UTC-5)
      const date = new Date('2026-04-29T03:00:00Z')
      expect(AvailabilityQueryService._toLocalDate(date, 'America/Cancun')).toBe('2026-04-28')
      expect(AvailabilityQueryService._toLocalDate(date, 'UTC')).toBe('2026-04-29')
    })

    it('toLocalDayOfWeek retorna 0=Sun..6=Sat', () => {
      // 2026-04-29 fue miércoles
      const wed = new Date('2026-04-29T15:00:00Z')
      expect(AvailabilityQueryService._toLocalDayOfWeek(wed, 'UTC')).toBe(3)
    })

    it('toLocalTime retorna HH:mm en formato 24h', () => {
      const date = new Date('2026-04-29T15:00:00Z')
      expect(AvailabilityQueryService._toLocalTime(date, 'UTC')).toBe('15:00')
      expect(AvailabilityQueryService._toLocalTime(date, 'America/Cancun')).toBe('10:00')
    })
  })

  // ── getOnShiftStaff ──────────────────────────────────────────────────────

  describe('getOnShiftStaff', () => {
    const propertyId = 'prop-1'

    function setupProperty(timezone = 'America/Cancun') {
      prismaMock.propertySettings.findUnique.mockResolvedValue({ timezone })
    }

    it('retorna staff con shift recurrente que cubre la hora', async () => {
      setupProperty('UTC')
      // Miércoles 10:00 UTC, María tiene shift Mié 07-15
      const wed10am = new Date('2026-04-29T10:00:00Z')
      prismaMock.staffShiftException.findMany.mockResolvedValue([])
      prismaMock.staffShift.findMany.mockResolvedValue([
        {
          staffId: 'maria',
          startTime: '07:00',
          endTime: '15:00',
          staff: { id: 'maria', name: 'María', role: 'HOUSEKEEPER', capabilities: ['CLEANING'] },
        },
      ])

      const result = await service.getOnShiftStaff(propertyId, wed10am)

      expect(result).toHaveLength(1)
      expect(result[0].staffId).toBe('maria')
      expect(result[0].source).toBe('RECURRING')
    })

    it('excluye staff fuera de horario', async () => {
      setupProperty('UTC')
      const sat10am = new Date('2026-05-02T10:00:00Z') // sábado
      prismaMock.staffShiftException.findMany.mockResolvedValue([])
      prismaMock.staffShift.findMany.mockResolvedValue([])  // María no trabaja sábados

      const result = await service.getOnShiftStaff(propertyId, sat10am)
      expect(result).toHaveLength(0)
    })

    it('StaffShiftException OFF tiene precedencia: staff queda excluido aunque haya shift recurrente', async () => {
      setupProperty('UTC')
      const wed10am = new Date('2026-04-29T10:00:00Z')
      prismaMock.staffShiftException.findMany.mockResolvedValue([
        { staffId: 'maria', type: 'OFF', startTime: null, endTime: null },
      ])
      prismaMock.staffShift.findMany.mockResolvedValue([
        {
          staffId: 'maria',
          startTime: '07:00', endTime: '15:00',
          staff: { id: 'maria', name: 'María', role: 'HOUSEKEEPER', capabilities: ['CLEANING'] },
        },
      ])

      const result = await service.getOnShiftStaff(propertyId, wed10am)
      expect(result).toHaveLength(0)
    })

    it('StaffShiftException EXTRA añade staff con horarios distintos', async () => {
      setupProperty('UTC')
      const wed10am = new Date('2026-04-29T10:00:00Z')
      prismaMock.staffShiftException.findMany.mockResolvedValue([
        { staffId: 'pedro', type: 'EXTRA', startTime: '08:00', endTime: '12:00' },
      ])
      prismaMock.staffShift.findMany.mockResolvedValue([])
      prismaMock.housekeepingStaff.findMany.mockResolvedValue([
        { id: 'pedro', name: 'Pedro', role: 'HOUSEKEEPER', capabilities: ['CLEANING'] },
      ])

      const result = await service.getOnShiftStaff(propertyId, wed10am)
      expect(result).toHaveLength(1)
      expect(result[0].staffId).toBe('pedro')
      expect(result[0].source).toBe('EXTRA')
    })

    it('StaffShiftException MODIFIED reemplaza el horario recurrente del día', async () => {
      setupProperty('UTC')
      const wed10am = new Date('2026-04-29T10:00:00Z')
      prismaMock.staffShiftException.findMany.mockResolvedValue([
        { staffId: 'maria', type: 'MODIFIED', startTime: '12:00', endTime: '20:00' },
      ])
      prismaMock.staffShift.findMany.mockResolvedValue([
        {
          staffId: 'maria',
          startTime: '07:00', endTime: '15:00',
          staff: { id: 'maria', name: 'María', role: 'HOUSEKEEPER', capabilities: ['CLEANING'] },
        },
      ])
      prismaMock.housekeepingStaff.findMany.mockResolvedValue([
        { id: 'maria', name: 'María', role: 'HOUSEKEEPER', capabilities: ['CLEANING'] },
      ])

      // 10:00 NO está en el horario MODIFIED (12-20), así que queda excluida
      const result = await service.getOnShiftStaff(propertyId, wed10am)
      expect(result).toHaveLength(0)
    })

    it('multi-timezone: misma hora UTC produce resultados distintos según tz', async () => {
      // 2026-04-29 13:00 UTC = 08:00 America/Cancun (UTC-5) = 15:00 Europe/Madrid (UTC+2)
      const utc1300 = new Date('2026-04-29T13:00:00Z')
      const baseShift = (tz: string) => ({ propertyId: 'p' + tz })

      // Para Cancun (08:00) → María (07-15) está en turno
      setupProperty('America/Cancun')
      prismaMock.staffShiftException.findMany.mockResolvedValue([])
      prismaMock.staffShift.findMany.mockResolvedValue([
        {
          staffId: 'maria', startTime: '07:00', endTime: '15:00',
          staff: { id: 'maria', name: 'M', role: 'HOUSEKEEPER', capabilities: ['CLEANING'] },
        },
      ])
      const cancunResult = await service.getOnShiftStaff('p1', utc1300)
      expect(cancunResult).toHaveLength(1)

      // Para Madrid (15:00) → María (07-15) NO está en turno (15 es exclusivo)
      setupProperty('Europe/Madrid')
      const madridResult = await service.getOnShiftStaff('p1', utc1300)
      expect(madridResult).toHaveLength(0)
    })
  })

  // ── isStaffOnShift ──────────────────────────────────────────────────────

  describe('isStaffOnShift', () => {
    it('retorna true si staff aparece en getOnShiftStaff', async () => {
      prismaMock.propertySettings.findUnique.mockResolvedValue({ timezone: 'UTC' })
      prismaMock.staffShiftException.findMany.mockResolvedValue([])
      prismaMock.staffShift.findMany.mockResolvedValue([
        {
          staffId: 'maria', startTime: '07:00', endTime: '15:00',
          staff: { id: 'maria', name: 'María', role: 'HOUSEKEEPER', capabilities: ['CLEANING'] },
        },
      ])

      const wed10am = new Date('2026-04-29T10:00:00Z')
      expect(await service.isStaffOnShift('maria', 'p1', wed10am)).toBe(true)
      expect(await service.isStaffOnShift('pedro', 'p1', wed10am)).toBe(false)
    })
  })
})
