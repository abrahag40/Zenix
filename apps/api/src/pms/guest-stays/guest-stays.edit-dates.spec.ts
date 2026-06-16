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
    room: { property: { settings: { timezone: 'UTC' } } },
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
    room: { findUnique: jest.fn().mockResolvedValue({ status: 'AVAILABLE' }) },
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
      ],
    }).compile()

    service = module.get<GuestStaysService>(GuestStaysService)
    jest.clearAllMocks()
    prismaMock.room.findUnique.mockResolvedValue({ status: 'AVAILABLE' })
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
  it('valida disponibilidad excluyéndose a sí misma (excludeStayIds)', async () => {
    prismaMock.guestStay.findFirst.mockResolvedValue(makeStay())

    await service.editReservationDates(STAY_ID, dto(), ACTOR_ID)

    expect(availabilityMock.check).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: ROOM_ID, excludeStayIds: [STAY_ID] }),
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
})
