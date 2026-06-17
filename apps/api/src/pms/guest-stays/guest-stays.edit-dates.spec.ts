/**
 * guest-stays.edit-dates.spec.ts — Sprint RESERVATION-EDIT-PRECHECKIN (Sprint 1)
 *
 * Cubre editReservationDates: guards de elegibilidad (HU-1.1), disponibilidad
 * con self-exclusion (HU-1.2), aplicación + recálculo de noches/saldo (HU-1.3),
 * y la rama OTA (D-REP-1).
 */

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { GuestStaysService } from './guest-stays.service'
import { PrismaService } from '../../prisma/prisma.service'
import { TenantContextService } from '../../common/tenant-context.service'
import { EmailService } from '../../common/email/email.service'
import { StayJourneyService } from '../stay-journeys/stay-journeys.service'
import { ChannexGateway } from '../../integrations/channex/channex.gateway'
import { NotificationCenterService } from '../../notification-center/notification-center.service'
import { AssignmentService } from '../../assignment/assignment.service'
import { PushService } from '../../notifications/push.service'
import { NotificationsService } from '../../notifications/notifications.service'
import { AuditOutboxService } from '../../common/audit/audit-outbox.service'
import { AvailabilityService } from '../availability/availability.service'
import { RatesService } from '../rates/rates.service'
import { RESERVATION_OTA_DATES_ADJUST } from '../../integrations/channex/outbound/channex-outbound-notif.service'

const ORG_ID = 'org-test-1'
const STAY_ID = 'stay-test-1'
const ROOM_ID = 'room-test-1'
const ACTOR_ID = 'staff-1'

/** ISO a mediodía UTC, `n` días desde hoy (evita edge de medianoche en tz). */
function dayFromNow(n: number): string {
  const d = new Date()
  d.setUTCHours(12, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString()
}

function makeStay(overrides: Record<string, unknown> = {}) {
  return {
    id: STAY_ID,
    organizationId: ORG_ID,
    propertyId: 'property-test-1',
    roomId: ROOM_ID,
    guestName: 'Ana García',
    ratePerNight: new Prisma.Decimal(120),
    totalAmount: new Prisma.Decimal(360), // 3 noches
    amountPaid: new Prisma.Decimal(0),
    currency: 'USD',
    checkinAt: new Date(dayFromNow(10)),
    scheduledCheckout: new Date(dayFromNow(13)),
    actualCheckin: null,
    actualCheckout: null,
    cancelledAt: null,
    noShowAt: null,
    channexBookingId: null,
    channexOtaName: null,
    stayJourney: {
      id: 'journey-1',
      segments: [{ id: 'seg-1', status: 'ACTIVE', reason: 'ORIGINAL', roomId: ROOM_ID }],
    },
    room: { roomTypeId: 'rt-1', property: { settings: { timezone: 'UTC' } } },
    ...overrides,
  }
}

describe('GuestStaysService — editReservationDates (RESERVATION-EDIT-PRECHECKIN)', () => {
  let service: GuestStaysService

  const tx = {
    guestStay: { update: jest.fn().mockResolvedValue({}) },
    stayJourney: { update: jest.fn().mockResolvedValue({}) },
    staySegment: { update: jest.fn().mockResolvedValue({}) },
    guestStayLog: { create: jest.fn().mockResolvedValue({}) },
  }

  const prismaMock = {
    guestStay: { findFirst: jest.fn() },
    room: {
      findUnique: jest.fn().mockResolvedValue({ status: 'AVAILABLE', roomTypeId: 'rt-1' }),
      findFirst: jest.fn().mockResolvedValue({ id: 'room-9' }), // validación de property OK por default
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  }

  const tenantMock = {
    getOrganizationId: jest.fn().mockReturnValue(ORG_ID),
    getPropertyId: jest.fn().mockReturnValue('property-test-1'),
  }
  const eventsMock = { emit: jest.fn() }
  const availabilityMock = {
    check: jest.fn().mockResolvedValue({ available: true, conflicts: [] }),
    notifyRelease: jest.fn().mockResolvedValue(undefined),
    notifyReservation: jest.fn().mockResolvedValue(undefined),
  }
  // Recotización: $100/noche flat para cualquier rango (rt-1).
  const ratesMock = {
    getRateQuoteGrid: jest.fn(async (_pid: string, from: Date, to: Date) => {
      const grid: Record<string, Record<string, number>> = { 'rt-1': {} }
      const dayMs = 86400000
      const f = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
      const t = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
      for (let x = f; x <= t; x += dayMs) grid['rt-1'][new Date(x).toISOString().slice(0, 10)] = 100
      return { grid, currency: 'USD', roomTypes: [], dates: [], ratePlanId: null }
    }),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuestStaysService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TenantContextService, useValue: tenantMock },
        { provide: EventEmitter2, useValue: eventsMock },
        { provide: EmailService, useValue: { send: jest.fn() } },
        { provide: StayJourneyService, useValue: {} },
        { provide: ChannexGateway, useValue: {} },
        { provide: NotificationCenterService, useValue: {} },
        { provide: AssignmentService, useValue: {} },
        { provide: PushService, useValue: {} },
        { provide: NotificationsService, useValue: { emit: jest.fn() } },
        { provide: AuditOutboxService, useValue: { emit: jest.fn() } },
        { provide: AvailabilityService, useValue: availabilityMock },
        { provide: RatesService, useValue: ratesMock },
      ],
    }).compile()

    service = module.get<GuestStaysService>(GuestStaysService)
    jest.clearAllMocks()
    prismaMock.room.findUnique.mockResolvedValue({ status: 'AVAILABLE', roomTypeId: 'rt-1' })
    prismaMock.room.findFirst.mockResolvedValue({ id: 'room-9' })
    prismaMock.room.findMany.mockResolvedValue([])
    availabilityMock.check.mockResolvedValue({ available: true, conflicts: [] })
    prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
  })

  const dto = (over: Record<string, unknown> = {}) => ({
    checkInAt: dayFromNow(20),
    scheduledCheckout: dayFromNow(25), // 5 noches
    ...over,
  })

  // ── HU-1.3 happy path ──────────────────────────────────────────────────
  it('reprograma el rango: recalcula noches/total, escribe DATES_EDITED y emite stay.updated', async () => {
    prismaMock.guestStay.findFirst.mockResolvedValue(makeStay())

    const res = await service.editReservationDates(STAY_ID, dto(), ACTOR_ID)

    expect(res.ok).toBe(true)
    expect(res.nights).toBe(5)
    expect(res.totalAmount).toBe(600) // 120 × 5
    expect(res.paymentStatus).toBe('PENDING')
    expect(res.requiresOtaManualAdjust).toBe(false)

    // GuestStay + journey + segment actualizados dentro de la tx
    expect(tx.guestStay.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ totalAmount: 600 }) }),
    )
    expect(tx.stayJourney.update).toHaveBeenCalled()
    expect(tx.staySegment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'seg-1' } }),
    )
    // Audit append-only
    expect(tx.guestStayLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'DATES_EDITED', actorId: ACTOR_ID }) }),
    )
    // SSE refresco
    expect(eventsMock.emit).toHaveBeenCalledWith(
      'stay.updated',
      expect.objectContaining({ stayId: STAY_ID, changedFields: expect.arrayContaining(['checkinAt', 'scheduledCheckout']) }),
    )
    // Channex ARI best-effort
    expect(availabilityMock.notifyRelease).toHaveBeenCalled()
    expect(availabilityMock.notifyReservation).toHaveBeenCalled()
  })

  // ── HU-1.2 self-exclusion ──────────────────────────────────────────────
  it('valida disponibilidad excluyéndose a sí misma (stay + journey)', async () => {
    prismaMock.guestStay.findFirst.mockResolvedValue(makeStay())

    await service.editReservationDates(STAY_ID, dto(), ACTOR_ID)

    // Excluye la fila GuestStay Y su journey — sin el journey, el segmento
    // ORIGINAL propio contaría como conflicto al alargar/acortar el rango.
    expect(availabilityMock.check).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: ROOM_ID,
        excludeStayIds: [STAY_ID],
        excludeJourneyId: 'journey-1',
      }),
    )
  })

  // ── HU-1.1 guards ──────────────────────────────────────────────────────
  it('NOT_PRECHECKIN si ya hizo check-in', async () => {
    prismaMock.guestStay.findFirst.mockResolvedValue(makeStay({ actualCheckin: new Date() }))
    await expect(service.editReservationDates(STAY_ID, dto(), ACTOR_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NOT_PRECHECKIN' }),
    })
  })

  it('CANCELLED si la reserva está cancelada', async () => {
    prismaMock.guestStay.findFirst.mockResolvedValue(makeStay({ cancelledAt: new Date() }))
    await expect(service.editReservationDates(STAY_ID, dto(), ACTOR_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CANCELLED' }),
    })
  })

  it('NOSHOW_LOCKED si está marcada como no-show', async () => {
    prismaMock.guestStay.findFirst.mockResolvedValue(makeStay({ noShowAt: new Date() }))
    await expect(service.editReservationDates(STAY_ID, dto(), ACTOR_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NOSHOW_LOCKED' }),
    })
  })

  it('HAS_EXTENSIONS si el journey tiene más de un segmento activo', async () => {
    prismaMock.guestStay.findFirst.mockResolvedValue(
      makeStay({
        stayJourney: {
          id: 'journey-1',
          segments: [
            { id: 'seg-1', status: 'ACTIVE', reason: 'ORIGINAL', roomId: ROOM_ID },
            { id: 'seg-2', status: 'ACTIVE', reason: 'EXTENSION_NEW_ROOM', roomId: 'room-2' },
          ],
        },
      }),
    )
    await expect(service.editReservationDates(STAY_ID, dto(), ACTOR_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'HAS_EXTENSIONS' }),
    })
  })

  it('INVALID_RANGE si checkOut <= checkIn', async () => {
    prismaMock.guestStay.findFirst.mockResolvedValue(makeStay())
    await expect(
      service.editReservationDates(STAY_ID, dto({ checkInAt: dayFromNow(25), scheduledCheckout: dayFromNow(20) }), ACTOR_ID),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'INVALID_RANGE' }) })
  })

  it('PAST_ARRIVAL si la llegada cae antes de hoy', async () => {
    prismaMock.guestStay.findFirst.mockResolvedValue(makeStay())
    await expect(
      service.editReservationDates(STAY_ID, dto({ checkInAt: dayFromNow(-3), scheduledCheckout: dayFromNow(2) }), ACTOR_ID),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PAST_ARRIVAL' }) })
  })

  it('RANGE_UNAVAILABLE si el nuevo rango está ocupado', async () => {
    prismaMock.guestStay.findFirst.mockResolvedValue(makeStay())
    availabilityMock.check.mockResolvedValue({
      available: false,
      conflicts: [{ source: 'LOCAL_STAY', label: 'Otro Huésped', from: new Date(), to: new Date() }],
    })
    await expect(service.editReservationDates(STAY_ID, dto(), ACTOR_ID)).rejects.toBeInstanceOf(ConflictException)
  })

  it('NotFoundException si la reserva no existe', async () => {
    prismaMock.guestStay.findFirst.mockResolvedValue(null)
    await expect(service.editReservationDates(STAY_ID, dto(), ACTOR_ID)).rejects.toBeInstanceOf(NotFoundException)
  })

  // ── Bug-hunt fixes ─────────────────────────────────────────────────────
  it('overbooking: re-check DENTRO del lock atrapa la race (disponible al pre-check, ocupado al re-check)', async () => {
    prismaMock.guestStay.findFirst.mockResolvedValue(makeStay())
    // 1ª llamada (pre-check) disponible; 2ª (re-check dentro del lock) ocupado.
    availabilityMock.check
      .mockResolvedValueOnce({ available: true, conflicts: [] })
      .mockResolvedValueOnce({
        available: false,
        conflicts: [{ source: 'LOCAL_STAY', severity: 'HARD', guestName: 'Otro', from: new Date(), to: new Date() }],
      })
    await expect(service.editReservationDates(STAY_ID, dto(), ACTOR_ID)).rejects.toBeInstanceOf(ConflictException)
    // No se escribió nada: la tx abortó en el re-check.
    expect(tx.guestStay.update).not.toHaveBeenCalled()
  })

  it('ROOM_NOT_IN_PROPERTY si la habitación alternativa no pertenece a la propiedad', async () => {
    prismaMock.guestStay.findFirst.mockResolvedValue(makeStay())
    prismaMock.room.findFirst.mockResolvedValueOnce(null) // newRoomId de otra property
    await expect(
      service.editReservationDates(STAY_ID, dto({ newRoomId: 'room-otra-prop' }), ACTOR_ID),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'ROOM_NOT_IN_PROPERTY' }) })
  })

  // ── D-REP-1 rama OTA ───────────────────────────────────────────────────
  it('OTA: emite el evento de ajuste manual y marca requiresOtaManualAdjust', async () => {
    prismaMock.guestStay.findFirst.mockResolvedValue(
      makeStay({ channexBookingId: 'chx-123', channexOtaName: 'BookingCom' }),
    )

    const res = await service.editReservationDates(STAY_ID, dto(), ACTOR_ID)

    expect(res.requiresOtaManualAdjust).toBe(true)
    expect(res.otaName).toBe('BookingCom')
    expect(eventsMock.emit).toHaveBeenCalledWith(
      RESERVATION_OTA_DATES_ADJUST,
      expect.objectContaining({ stayId: STAY_ID, otaName: 'BookingCom' }),
    )
  })

  // ── D-REP-3 cambio de habitación por conflicto ─────────────────────────
  it('newRoomId: actualiza roomId en stay+segment y reporta roomChanged', async () => {
    prismaMock.guestStay.findFirst.mockResolvedValue(makeStay())

    const res = await service.editReservationDates(STAY_ID, dto({ newRoomId: 'room-9' }), ACTOR_ID)

    expect(res.roomChanged).toBe(true)
    expect(res.roomId).toBe('room-9')
    expect(availabilityMock.check).toHaveBeenCalledWith(expect.objectContaining({ roomId: 'room-9' }))
    expect(tx.guestStay.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ roomId: 'room-9' }) }),
    )
  })

  // ── recálculo de paymentStatus ─────────────────────────────────────────
  it('paymentStatus PAID si lo pagado cubre el nuevo total (acortar)', async () => {
    prismaMock.guestStay.findFirst.mockResolvedValue(
      makeStay({ amountPaid: new Prisma.Decimal(360) }),
    )
    // 3 noches × 120 = 360 → pagado 360 cubre
    const res = await service.editReservationDates(
      STAY_ID,
      dto({ checkInAt: dayFromNow(20), scheduledCheckout: dayFromNow(23) }),
      ACTOR_ID,
    )
    expect(res.nights).toBe(3)
    expect(res.totalAmount).toBe(360)
    expect(res.paymentStatus).toBe('PAID')
  })

  // ── D-REP-4 reprice (Sprint 2) ─────────────────────────────────────────
  describe('reprice (D-REP-4)', () => {
    it('reprice=true recotiza al precio vigente ($100/noche) y marca repriced', async () => {
      prismaMock.guestStay.findFirst.mockResolvedValue(makeStay()) // pactada 130
      const res = await service.editReservationDates(STAY_ID, dto({ reprice: true }), ACTOR_ID) // 5 noches
      expect(res.repriced).toBe(true)
      expect(res.ratePerNight).toBe(100)
      expect(res.totalAmount).toBe(500) // 100 × 5
      expect(tx.guestStay.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ratePerNight: 100, totalAmount: 500 }) }),
      )
    })

    it('reprice=true sin tarifas configurables → conserva la pactada (graceful)', async () => {
      prismaMock.guestStay.findFirst.mockResolvedValue(makeStay())
      ratesMock.getRateQuoteGrid.mockResolvedValueOnce({ grid: {}, currency: 'USD', roomTypes: [], dates: [], ratePlanId: null })
      const res = await service.editReservationDates(STAY_ID, dto({ reprice: true }), ACTOR_ID)
      expect(res.repriced).toBe(false)
      expect(res.ratePerNight).toBe(120) // pactada conservada
      expect(res.totalAmount).toBe(600) // 120 × 5
    })

    it('default (sin reprice) conserva la pactada — no consulta tarifas', async () => {
      prismaMock.guestStay.findFirst.mockResolvedValue(makeStay())
      await service.editReservationDates(STAY_ID, dto(), ACTOR_ID)
      expect(ratesMock.getRateQuoteGrid).not.toHaveBeenCalled()
    })
  })

  // ── HU-2.2 preview ─────────────────────────────────────────────────────
  describe('getEditDatesPreview', () => {
    it('elegible + disponible: nights/nightsDelta + keptTotal + repricedTotal', async () => {
      prismaMock.guestStay.findFirst.mockResolvedValue(makeStay()) // actual 3 noches, rate 130

      const p = await service.getEditDatesPreview(STAY_ID, dayFromNow(20), dayFromNow(25)) // 5 noches

      expect(p.eligible).toBe(true)
      expect(p.rangeError).toBeNull()
      expect(p.available).toBe(true)
      expect(p.nights).toBe(5)
      expect(p.nightsDelta).toBe(2) // 5 − 3
      expect(p.keptTotal).toBe(600) // 120 × 5
      expect(p.repricedRate).toBe(100)
      expect(p.repricedTotal).toBe(500) // 100 × 5
      expect(p.alternatives).toEqual([])
    })

    it('ineligible (cancelada): eligible=false + ineligibleReason', async () => {
      prismaMock.guestStay.findFirst.mockResolvedValue(makeStay({ cancelledAt: new Date() }))
      const p = await service.getEditDatesPreview(STAY_ID, dayFromNow(20), dayFromNow(25))
      expect(p.eligible).toBe(false)
      expect(p.ineligibleReason?.code).toBe('CANCELLED')
    })

    it('rangeError PAST_ARRIVAL si la llegada es pasada', async () => {
      prismaMock.guestStay.findFirst.mockResolvedValue(makeStay())
      const p = await service.getEditDatesPreview(STAY_ID, dayFromNow(-3), dayFromNow(2))
      expect(p.rangeError?.code).toBe('PAST_ARRIVAL')
    })

    it('conflicto: available=false + lista habitaciones alternativas del mismo tipo', async () => {
      prismaMock.guestStay.findFirst.mockResolvedValue(makeStay())
      availabilityMock.check
        .mockResolvedValueOnce({ available: false, conflicts: [{ source: 'LOCAL_STAY', label: 'X', from: new Date(), to: new Date() }] }) // hab actual
        .mockResolvedValue({ available: true, conflicts: [] }) // alternativas libres
      prismaMock.room.findMany.mockResolvedValueOnce([
        { id: 'room-A', number: '201' },
        { id: 'room-B', number: '202' },
      ])

      const p = await service.getEditDatesPreview(STAY_ID, dayFromNow(20), dayFromNow(25))

      expect(p.available).toBe(false)
      expect(p.alternatives).toEqual([
        { roomId: 'room-A', number: '201' },
        { roomId: 'room-B', number: '202' },
      ])
    })
  })
})
