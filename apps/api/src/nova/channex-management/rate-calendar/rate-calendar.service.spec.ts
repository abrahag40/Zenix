/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 6 unit tests.
 *
 * Cubre:
 *   · Pure helpers (generateDateRange, isoWeekdayFromYmd, violatesCap)
 *   · getMatrix happy path (Channex live)
 *   · getMatrix fallback (Channex caído → fromChannex:false, rates desde defaultRate)
 *   · getMatrix cap violation flag
 *   · getMatrix parity issues (spread > threshold)
 *   · bulkUpdate validates cap → rejected entry
 *   · bulkUpdate empty entries → BadRequest
 *   · bulkUpdate cap 5000 → BadRequest
 *   · bulkUpdate happy path → emit event + audit SUCCESS
 *   · bulkUpdate rejected → audit FAILURE + accepted 0
 *   · expandTemplate fills only matching weekdays
 */
import { BadRequestException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import {
  RateCalendarService,
  generateDateRange,
  isYmd,
  isoWeekdayFromYmd,
  violatesCap,
  capViolationMessage,
} from './rate-calendar.service'
import { CHANNEX_RESTRICTION_UPDATED } from '../../../integrations/channex/outbound/channex-outbound-events'

describe('RateCalendarService — Day 6', () => {
  const PROPERTY_ID = 'prop-1'
  const CHANNEX_PROPERTY_ID = 'channex-prop-1'
  const ORG_ID = 'org-1'
  const ACTOR_ID = 'user-1'

  // ── Pure helpers ────────────────────────────────────────────────────────

  describe('pure helpers', () => {
    it('isYmd reconoce solo formato YYYY-MM-DD', () => {
      expect(isYmd('2026-05-24')).toBe(true)
      expect(isYmd('26-5-24')).toBe(false)
      expect(isYmd('2026/05/24')).toBe(false)
      expect(isYmd('')).toBe(false)
    })

    it('generateDateRange genera fechas inclusive (TZ-safe UTC)', () => {
      expect(generateDateRange('2026-05-24', '2026-05-24')).toEqual(['2026-05-24'])
      expect(generateDateRange('2026-05-24', '2026-05-26')).toEqual([
        '2026-05-24',
        '2026-05-25',
        '2026-05-26',
      ])
    })

    it('isoWeekdayFromYmd mapea correctamente (2026-05-24 fue domingo)', () => {
      expect(isoWeekdayFromYmd('2026-05-24')).toBe('su')
      expect(isoWeekdayFromYmd('2026-05-25')).toBe('mo')
      expect(isoWeekdayFromYmd('2026-05-30')).toBe('sa')
    })

    it('violatesCap respeta null bounds (no constraint)', () => {
      expect(violatesCap(100, null, null)).toBe(false)
      expect(violatesCap(100, 50, 150)).toBe(false)
      expect(violatesCap(40, 50, 150)).toBe(true)
      expect(violatesCap(160, 50, 150)).toBe(true)
      expect(violatesCap(100, null, 150)).toBe(false)
      expect(violatesCap(100, null, 99)).toBe(true)
    })

    it('capViolationMessage incluye razón del consultor si está', () => {
      const msg = capViolationMessage(40, 50, 150, 'Temporada baja minimum')
      expect(msg).toContain('min=50')
      expect(msg).toContain('max=150')
      expect(msg).toContain('Temporada baja minimum')
    })
  })

  // ── Service unit tests with mocked deps ─────────────────────────────────

  function buildService(opts: {
    mappings?: any[]
    settings?: any
    propertyExists?: boolean
    channexRestrictions?: { fromChannex: boolean; rows: any[] }[]
  } = {}) {
    const prisma: any = {
      property: { findFirst: jest.fn() },
      propertySettings: { findUnique: jest.fn() },
      channexRatePlanMapping: { findMany: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'user-1', email: 'a@b', systemRole: 'PLATFORM_ADMIN' }),
      },
    }
    prisma.property.findFirst.mockResolvedValue(
      opts.propertyExists === false ? null : { id: PROPERTY_ID },
    )
    prisma.propertySettings.findUnique.mockResolvedValue(
      opts.settings ?? {
        channexPropertyId: CHANNEX_PROPERTY_ID,
        rateParityThresholdPct: 5,
      },
    )
    prisma.channexRatePlanMapping.findMany.mockResolvedValue(opts.mappings ?? [])

    const gateway: any = {
      listRestrictions: jest.fn(),
    }
    const restrictions = opts.channexRestrictions ?? []
    restrictions.forEach((r, i) => gateway.listRestrictions.mockResolvedValueOnce(r))
    // Default for any extra calls
    gateway.listRestrictions.mockResolvedValue({ fromChannex: true, rows: [] })

    const tenant: any = {
      getActingOrgIdOrThrow: jest.fn().mockReturnValue(ORG_ID),
    }
    const events = new EventEmitter2()
    jest.spyOn(events, 'emit')

    const auditLog: any = {
      write: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    }

    const service = new RateCalendarService(prisma, tenant, gateway, events, auditLog)
    return { service, prisma, gateway, tenant, events, auditLog }
  }

  // ── getMatrix ──────────────────────────────────────────────────────────

  describe('getMatrix', () => {
    it('matriz vacía cuando no hay rate plans', async () => {
      const { service } = buildService({ mappings: [] })
      const out = await service.getMatrix(PROPERTY_ID, '2026-06-01', '2026-06-03')
      expect(out.ratePlans).toEqual([])
      expect(out.parityIssues).toEqual([])
      expect(out.dateFrom).toBe('2026-06-01')
      expect(out.dateTo).toBe('2026-06-03')
    })

    it('arma matriz con rates desde Channex live', async () => {
      const mappings = [
        {
          id: 'm1',
          channexRatePlanId: 'rp-1',
          channexRoomTypeId: 'rt-1',
          title: 'BAR Estándar',
          currency: 'USD',
          sellMode: 'per_room',
          rateMode: 'manual',
          defaultRate: 70,
          defaultOccupancy: 2,
          rateCap: null,
        },
      ]
      const { service, gateway } = buildService({
        mappings,
        channexRestrictions: [
          {
            fromChannex: true,
            rows: [
              { property_id: CHANNEX_PROPERTY_ID, rate_plan_id: 'rp-1', date: '2026-06-01', rate: '80.00' },
              { property_id: CHANNEX_PROPERTY_ID, rate_plan_id: 'rp-1', date: '2026-06-02', rate: '85.00' },
            ],
          },
        ],
      })
      const out = await service.getMatrix(PROPERTY_ID, '2026-06-01', '2026-06-03')
      expect(out.fromChannex).toBe(true)
      expect(out.ratePlans).toHaveLength(1)
      expect(out.ratePlans[0].cells).toHaveLength(3)
      // Día 1+2 desde Channex, día 3 fallback al defaultRate
      expect(out.ratePlans[0].cells[0]).toMatchObject({ rate: 80, rateSource: 'CHANNEX' })
      expect(out.ratePlans[0].cells[1]).toMatchObject({ rate: 85, rateSource: 'CHANNEX' })
      expect(out.ratePlans[0].cells[2]).toMatchObject({ rate: 70, rateSource: 'DEFAULT' })
      expect(gateway.listRestrictions).toHaveBeenCalledTimes(1)
    })

    it('fromChannex:false cuando Channex falla → fallback a defaultRate', async () => {
      const mappings = [
        {
          id: 'm1',
          channexRatePlanId: 'rp-1',
          channexRoomTypeId: 'rt-1',
          title: 'BAR',
          currency: 'USD',
          sellMode: 'per_room',
          rateMode: 'manual',
          defaultRate: 70,
          defaultOccupancy: 2,
          rateCap: null,
        },
      ]
      const { service } = buildService({
        mappings,
        channexRestrictions: [{ fromChannex: false, rows: [] }],
      })
      const out = await service.getMatrix(PROPERTY_ID, '2026-06-01', '2026-06-02')
      expect(out.fromChannex).toBe(false)
      expect(out.ratePlans[0].cells[0].rate).toBe(70)
      expect(out.ratePlans[0].cells[0].rateSource).toBe('DEFAULT')
    })

    it('capViolation flag set si cell rate fuera de bounds', async () => {
      const mappings = [
        {
          id: 'm1',
          channexRatePlanId: 'rp-1',
          channexRoomTypeId: 'rt-1',
          title: 'BAR',
          currency: 'USD',
          sellMode: 'per_room',
          rateMode: 'manual',
          defaultRate: 70,
          defaultOccupancy: 2,
          rateCap: { rateCapMin: 60, rateCapMax: 75, reason: 'Sandbox' },
        },
      ]
      const { service } = buildService({
        mappings,
        channexRestrictions: [
          {
            fromChannex: true,
            rows: [
              { property_id: CHANNEX_PROPERTY_ID, rate_plan_id: 'rp-1', date: '2026-06-01', rate: '50.00' },
              { property_id: CHANNEX_PROPERTY_ID, rate_plan_id: 'rp-1', date: '2026-06-02', rate: '70.00' },
              { property_id: CHANNEX_PROPERTY_ID, rate_plan_id: 'rp-1', date: '2026-06-03', rate: '90.00' },
            ],
          },
        ],
      })
      const out = await service.getMatrix(PROPERTY_ID, '2026-06-01', '2026-06-03')
      expect(out.ratePlans[0].cells[0].capViolation).toBe(true) // 50 < 60
      expect(out.ratePlans[0].cells[1].capViolation).toBe(false) // 70 OK
      expect(out.ratePlans[0].cells[2].capViolation).toBe(true) // 90 > 75
    })

    it('detecta parity issues cross rate-plans del mismo room type', async () => {
      const mappings = [
        {
          id: 'm1',
          channexRatePlanId: 'rp-1',
          channexRoomTypeId: 'rt-1',
          title: 'BAR',
          currency: 'USD',
          sellMode: 'per_room',
          rateMode: 'manual',
          defaultRate: 70,
          defaultOccupancy: 2,
          rateCap: null,
        },
        {
          id: 'm2',
          channexRatePlanId: 'rp-2',
          channexRoomTypeId: 'rt-1',
          title: 'NRR',
          currency: 'USD',
          sellMode: 'per_room',
          rateMode: 'manual',
          defaultRate: 60,
          defaultOccupancy: 2,
          rateCap: null,
        },
      ]
      const { service } = buildService({
        mappings,
        settings: { channexPropertyId: CHANNEX_PROPERTY_ID, rateParityThresholdPct: 10 },
        channexRestrictions: [
          {
            fromChannex: true,
            rows: [
              { property_id: CHANNEX_PROPERTY_ID, rate_plan_id: 'rp-1', date: '2026-06-01', rate: '100.00' },
            ],
          },
          {
            fromChannex: true,
            rows: [
              { property_id: CHANNEX_PROPERTY_ID, rate_plan_id: 'rp-2', date: '2026-06-01', rate: '80.00' },
            ],
          },
        ],
      })
      const out = await service.getMatrix(PROPERTY_ID, '2026-06-01', '2026-06-01')
      expect(out.parityIssues).toHaveLength(1)
      expect(out.parityIssues[0]).toMatchObject({
        date: '2026-06-01',
        channexRoomTypeId: 'rt-1',
        minRate: 80,
        maxRate: 100,
      })
      expect(out.parityIssues[0].spreadPct).toBeCloseTo(25, 1) // (100-80)/80 = 25%
    })

    it('rechaza rango inválido', async () => {
      const { service } = buildService()
      await expect(service.getMatrix(PROPERTY_ID, '2026-06-10', '2026-06-01')).rejects.toThrow(
        BadRequestException,
      )
    })

    it('rechaza rango > 365 días', async () => {
      const { service } = buildService()
      await expect(service.getMatrix(PROPERTY_ID, '2026-01-01', '2027-12-31')).rejects.toThrow(
        BadRequestException,
      )
    })
  })

  // ── bulkUpdate ─────────────────────────────────────────────────────────

  describe('bulkUpdate', () => {
    const mapping = {
      id: 'm1',
      channexRatePlanId: 'rp-1',
      channexRoomTypeId: 'rt-1',
      title: 'BAR',
      currency: 'USD',
      defaultRate: 70,
      isActive: true,
      rateCap: { rateCapMin: 60, rateCapMax: 100, reason: null },
    }

    it('rechaza entries vacíos', async () => {
      const { service } = buildService({ mappings: [mapping] })
      await expect(
        service.bulkUpdate(PROPERTY_ID, [], ACTOR_ID, 'PLATFORM_ADMIN'),
      ).rejects.toThrow(BadRequestException)
    })

    it('rechaza > 5000 entries', async () => {
      const { service } = buildService({ mappings: [mapping] })
      const huge = new Array(5001).fill({ ratePlanId: 'rp-1', date: '2026-06-01', rate: 80 })
      await expect(
        service.bulkUpdate(PROPERTY_ID, huge, ACTOR_ID, 'PLATFORM_ADMIN'),
      ).rejects.toThrow(/5000/)
    })

    it('atomic reject — un cap violation aborta todo el bulk', async () => {
      const { service, events, auditLog } = buildService({ mappings: [mapping] })
      const result = await service.bulkUpdate(
        PROPERTY_ID,
        [
          { ratePlanId: 'rp-1', date: '2026-06-01', rate: 80 }, // OK
          { ratePlanId: 'rp-1', date: '2026-06-02', rate: 200 }, // viola max=100
        ],
        ACTOR_ID,
        'PLATFORM_ADMIN',
      )
      expect(result.accepted).toBe(0)
      expect(result.rejected.length).toBe(1)
      expect(result.rejected[0].reason).toMatch(/max=100/)
      expect(events.emit).not.toHaveBeenCalled()
      expect(auditLog.write).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILURE' }),
      )
    })

    it('rate plan no-encontrado → rejected', async () => {
      const { service } = buildService({ mappings: [] })
      const result = await service.bulkUpdate(
        PROPERTY_ID,
        [{ ratePlanId: 'rp-fantasma', date: '2026-06-01', rate: 70 }],
        ACTOR_ID,
        'PLATFORM_ADMIN',
      )
      expect(result.accepted).toBe(0)
      expect(result.rejected[0].reason).toMatch(/no pertenece a property/)
    })

    it('entry sin ningún field → rejected', async () => {
      const { service } = buildService({ mappings: [mapping] })
      const result = await service.bulkUpdate(
        PROPERTY_ID,
        [{ ratePlanId: 'rp-1', date: '2026-06-01' }],
        ACTOR_ID,
        'PLATFORM_ADMIN',
      )
      expect(result.accepted).toBe(0)
      expect(result.rejected[0].reason).toMatch(/restriction field/)
    })

    it('happy path — emite event + escribe audit SUCCESS', async () => {
      const { service, events, auditLog } = buildService({ mappings: [mapping] })
      const result = await service.bulkUpdate(
        PROPERTY_ID,
        [
          { ratePlanId: 'rp-1', date: '2026-06-01', rate: 80 },
          { ratePlanId: 'rp-1', date: '2026-06-02', rate: 85, stopSell: false },
        ],
        ACTOR_ID,
        'PLATFORM_ADMIN',
        undefined,
        'Ajuste temporada media',
      )
      expect(result.accepted).toBe(2)
      expect(result.rejected).toEqual([])
      expect(events.emit).toHaveBeenCalledWith(
        CHANNEX_RESTRICTION_UPDATED,
        expect.objectContaining({
          propertyId: CHANNEX_PROPERTY_ID,
          entries: expect.arrayContaining([
            expect.objectContaining({ ratePlanId: 'rp-1', date: '2026-06-01', rate: 80 }),
            expect.objectContaining({
              ratePlanId: 'rp-1',
              date: '2026-06-02',
              rate: 85,
              stopSell: false,
            }),
          ]),
        }),
      )
      expect(auditLog.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CHANNEX_RATE_CALENDAR_BULK_UPDATE',
          status: 'SUCCESS',
          payload: expect.objectContaining({ acceptedCount: 2 }),
          reason: 'Ajuste temporada media',
        }),
      )
    })

    it('property sin channexPropertyId → ForbiddenException', async () => {
      const { service } = buildService({
        mappings: [mapping],
        settings: { channexPropertyId: null, rateParityThresholdPct: 5 },
      })
      await expect(
        service.bulkUpdate(
          PROPERTY_ID,
          [{ ratePlanId: 'rp-1', date: '2026-06-01', rate: 80 }],
          ACTOR_ID,
          'PLATFORM_ADMIN',
        ),
      ).rejects.toThrow(/channexPropertyId/)
    })
  })

  // ── expandTemplate ────────────────────────────────────────────────────

  describe('expandTemplate', () => {
    it('expande solo weekdays presentes en weekdayRates', () => {
      const { service } = buildService()
      // 2026-06-01 (Mon) → 2026-06-07 (Sun) = lun..dom
      const entries = service.expandTemplate({
        ratePlanId: 'rp-1',
        dateFrom: '2026-06-01',
        dateTo: '2026-06-07',
        weekdayRates: { mo: 80, fr: 100, sa: 120, su: 110 },
      })
      // Mon=80, Fri=100, Sat=120, Sun=110 → 4 entries
      expect(entries).toHaveLength(4)
      const dates = entries.map((e) => e.date)
      expect(dates).toEqual(['2026-06-01', '2026-06-05', '2026-06-06', '2026-06-07'])
      expect(entries[0]).toMatchObject({ date: '2026-06-01', rate: 80 })
      expect(entries[2]).toMatchObject({ date: '2026-06-06', rate: 120 })
    })

    it('rechaza rango inválido', () => {
      const { service } = buildService()
      expect(() =>
        service.expandTemplate({
          ratePlanId: 'rp-1',
          dateFrom: '2026-06-10',
          dateTo: '2026-06-01',
          weekdayRates: { mo: 80 },
        }),
      ).toThrow(BadRequestException)
    })
  })
})
