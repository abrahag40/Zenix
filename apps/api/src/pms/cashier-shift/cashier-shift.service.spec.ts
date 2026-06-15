import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import {
  CashOpeningSource,
  CashierShiftStatus,
  JwtPayload,
  PaymentMethod,
  StaffRole,
} from '@zenix/shared'
import { CashierShiftService } from './cashier-shift.service'
import { PrismaService } from '../../prisma/prisma.service'
import { TenantContextService } from '../../common/tenant-context.service'

const PROP = 'prop-1'
const ORG = 'org-1'

const recept = (id = 'staff-A'): JwtPayload =>
  ({ sub: id, email: `${id}@z.co`, role: StaffRole.RECEPTIONIST, propertyId: PROP, organizationId: ORG }) as JwtPayload
const supervisor = (id = 'sup-1'): JwtPayload =>
  ({ sub: id, email: `${id}@z.co`, role: StaffRole.SUPERVISOR, propertyId: PROP, organizationId: ORG }) as JwtPayload

describe('CashierShiftService — Sprint 1 (apertura + handover + link)', () => {
  let service: CashierShiftService
  const prisma = {
    cashierShift: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    propertySettings: { findUnique: jest.fn() },
  }
  const tenant = {
    getOrganizationId: jest.fn(() => ORG),
    getPropertyId: jest.fn(() => PROP),
  }

  beforeEach(async () => {
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        CashierShiftService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContextService, useValue: tenant },
      ],
    }).compile()
    service = mod.get(CashierShiftService)
    jest.resetAllMocks() // resetea también la cola de mockResolvedValueOnce entre tests
    tenant.getOrganizationId.mockReturnValue(ORG)
    tenant.getPropertyId.mockReturnValue(PROP)
    prisma.cashierShift.create.mockImplementation((args: any) => Promise.resolve({ id: 'shift-new', ...args.data }))
  })

  describe('openShift', () => {
    it('abre un turno FRESH_BANK cuando el cajero no tiene turno abierto', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(null) // no open shift
      const res = await service.openShift({ openingFloat: { MXN: 2000, USD: 50 } }, recept())
      expect(prisma.cashierShift.create).toHaveBeenCalledTimes(1)
      const data = prisma.cashierShift.create.mock.calls[0][0].data
      expect(data.staffId).toBe('staff-A')
      expect(data.propertyId).toBe(PROP)
      expect(data.openingSource).toBe(CashOpeningSource.FRESH_BANK)
      expect(data.openingFloat).toEqual({ MXN: 2000, USD: 50 })
      expect(res.id).toBe('shift-new')
    })

    it('rechaza abrir un segundo turno si ya hay uno OPEN (1 por cajero)', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce({ id: 'shift-open' })
      await expect(service.openShift({ openingFloat: { MXN: 1000 } }, recept())).rejects.toBeInstanceOf(
        ConflictException,
      )
      expect(prisma.cashierShift.create).not.toHaveBeenCalled()
    })

    it('valida openingFloat (objeto vacío → BadRequest)', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(null)
      await expect(service.openShift({ openingFloat: {} }, recept())).rejects.toBeInstanceOf(BadRequestException)
    })

    it('valida openingFloat (divisa no ISO 4217 → BadRequest)', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(null)
      await expect(service.openShift({ openingFloat: { pesos: 100 } as any }, recept())).rejects.toBeInstanceOf(
        BadRequestException,
      )
    })

    it('HANDOVER: encadena cuando el fondo recibido iguala el cierre del turno saliente', async () => {
      prisma.cashierShift.findFirst
        .mockResolvedValueOnce(null) // no open shift propio
        .mockResolvedValueOnce({ id: 'prev', status: CashierShiftStatus.RECONCILED, actualClose: { MXN: 1500, USD: 0 } })
      const res = await service.openShift(
        { openingFloat: { MXN: 1500, USD: 0 }, openingSource: CashOpeningSource.HANDOVER, handoverFromShiftId: 'prev' },
        recept('staff-B'),
      )
      const data = prisma.cashierShift.create.mock.calls[0][0].data
      expect(data.handoverFromShiftId).toBe('prev')
      expect(data.openingAcceptedById).toBe('staff-B') // el entrante acepta (transfiere responsabilidad)
      expect(res.id).toBe('shift-new')
    })

    it('HANDOVER: rechaza si el fondo recibido NO coincide con el cierre del saliente', async () => {
      prisma.cashierShift.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'prev', status: CashierShiftStatus.RECONCILED, actualClose: { MXN: 1500 } })
      await expect(
        service.openShift(
          { openingFloat: { MXN: 1400 }, openingSource: CashOpeningSource.HANDOVER, handoverFromShiftId: 'prev' },
          recept('staff-B'),
        ),
      ).rejects.toBeInstanceOf(ConflictException)
    })

    it('HANDOVER: exige handoverFromShiftId', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(null)
      await expect(
        service.openShift({ openingFloat: { MXN: 100 }, openingSource: CashOpeningSource.HANDOVER }, recept()),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('HANDOVER: turno de origen inexistente → NotFound', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      await expect(
        service.openShift(
          { openingFloat: { MXN: 100 }, openingSource: CashOpeningSource.HANDOVER, handoverFromShiftId: 'ghost' },
          recept(),
        ),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('HANDOVER: turno de origen aún abierto → Conflict', async () => {
      prisma.cashierShift.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'prev', status: CashierShiftStatus.OPEN, actualClose: null })
      await expect(
        service.openShift(
          { openingFloat: { MXN: 100 }, openingSource: CashOpeningSource.HANDOVER, handoverFromShiftId: 'prev' },
          recept(),
        ),
      ).rejects.toBeInstanceOf(ConflictException)
    })
  })

  describe('listShifts — RBAC D-CASH10', () => {
    it('SUPERVISOR ve todos los turnos de la propiedad (sin filtro de staff)', async () => {
      prisma.cashierShift.findMany.mockResolvedValueOnce([])
      await service.listShifts({}, supervisor())
      expect(prisma.cashierShift.findMany.mock.calls[0][0].where).toEqual({ propertyId: PROP })
    })

    it('el cajero ve sólo SUS turnos', async () => {
      prisma.cashierShift.findMany.mockResolvedValueOnce([])
      await service.listShifts({}, recept('staff-A'))
      expect(prisma.cashierShift.findMany.mock.calls[0][0].where).toMatchObject({ propertyId: PROP, staffId: 'staff-A' })
    })
  })

  describe('resolveShiftForCashPayment — link D-CASH14 + enforcement D-CASH4', () => {
    it('no-CASH → null sin consultar turnos', async () => {
      const id = await service.resolveShiftForCashPayment(PROP, 'staff-A', PaymentMethod.CARD_TERMINAL)
      expect(id).toBeNull()
      expect(prisma.cashierShift.findFirst).not.toHaveBeenCalled()
    })

    it('CASH con turno abierto → devuelve el id del turno', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce({ id: 'shift-open' })
      const id = await service.resolveShiftForCashPayment(PROP, 'staff-A', PaymentMethod.CASH)
      expect(id).toBe('shift-open')
    })

    it('CASH sin turno y cashShiftRequired=false → null (cero regresión)', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(null)
      prisma.propertySettings.findUnique.mockResolvedValueOnce({ cashShiftRequired: false })
      const id = await service.resolveShiftForCashPayment(PROP, 'staff-A', PaymentMethod.CASH)
      expect(id).toBeNull()
    })

    it('CASH sin turno y cashShiftRequired=true → ConflictException', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(null)
      prisma.propertySettings.findUnique.mockResolvedValueOnce({ cashShiftRequired: true })
      await expect(service.resolveShiftForCashPayment(PROP, 'staff-A', PaymentMethod.CASH)).rejects.toBeInstanceOf(
        ConflictException,
      )
    })
  })
})
