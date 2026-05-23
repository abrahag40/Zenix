/**
 * BookingCancelHandler — D-CHX7 policy tests.
 *
 * Cubre:
 *   - not_found → idempotent success (Channex retry tras nuestra purga)
 *   - already_cancelled → idempotent refresh sync
 *   - no-show terminal → manual_review notif
 *   - checked-out terminal → manual_review notif
 *   - checked-in → manual_review (no auto-cancel guests in-house)
 *   - ARRIVING + amountPaid=0 → cancelled, requiresFiscalReview=false
 *   - ARRIVING + amountPaid>0 → cancelled, requiresFiscalReview=true (seed v1.0.2 CFDI E)
 *   - cascade: journey + segments + StayJourneyEvent
 *   - audit: GuestStayLog event=CANCELLED actorType=SYSTEM
 *   - room.status flip a AVAILABLE cuando es la única active
 */

import { Test } from '@nestjs/testing'
import { Prisma } from '@prisma/client'
import { ChannexBookingRevision } from '../../channex.gateway'
import { NotificationsService } from '../../../../notifications/notifications.service'
import { PrismaService } from '../../../../prisma/prisma.service'
import { ChannexSystemStaffService } from '../channex-system-staff.service'
import { BookingCancelHandler } from './booking-cancel.handler'

function makeRevision(overrides: Partial<ChannexBookingRevision> = {}): ChannexBookingRevision {
  return {
    id: 'rev-c1',
    property_id: 'prop-1',
    booking_id: 'book-1',
    ota_name: 'Booking.com',
    ota_reservation_code: 'BDC-1234',
    status: 'cancelled',
    arrival_date: '2026-06-01',
    departure_date: '2026-06-04',
    rooms: [],
    inserted_at: '2026-05-25T10:00:00.000Z',
    ...overrides,
  }
}

function makeExistingStay(overrides: Record<string, unknown> = {}) {
  return {
    id: 'stay-1',
    organizationId: 'org-1',
    propertyId: 'prop-1',
    roomId: 'room-a1',
    amountPaid: new Prisma.Decimal(0),
    cancelledAt: null,
    noShowAt: null,
    actualCheckin: null,
    actualCheckout: null,
    stayJourney: { id: 'journey-1' },
    room: { id: 'room-a1', status: 'OCCUPIED' },
    ...overrides,
  }
}

function makePrismaMock() {
  const guestStayUpdate = jest.fn().mockResolvedValue({})
  const guestStayCount = jest.fn().mockResolvedValue(0)
  const staySegmentUpdateMany = jest.fn().mockResolvedValue({ count: 1 })
  const stayJourneyUpdate = jest.fn().mockResolvedValue({})
  const stayJourneyEventCreate = jest.fn().mockResolvedValue({})
  const roomUpdate = jest.fn().mockResolvedValue({})
  const guestStayLogCreate = jest.fn().mockResolvedValue({})

  const tx = {
    guestStay: { update: guestStayUpdate, count: guestStayCount },
    staySegment: { updateMany: staySegmentUpdateMany },
    stayJourney: { update: stayJourneyUpdate },
    stayJourneyEvent: { create: stayJourneyEventCreate },
    room: { update: roomUpdate },
    guestStayLog: { create: guestStayLogCreate },
  }

  return {
    tx,
    guestStay: {
      findUnique: jest.fn(),
      update: guestStayUpdate, // outside-tx idempotent path
    },
    $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    // expose tx methods for assertions
    _staySegmentUpdateMany: staySegmentUpdateMany,
    _stayJourneyEventCreate: stayJourneyEventCreate,
    _roomUpdate: roomUpdate,
    _guestStayLogCreate: guestStayLogCreate,
    _guestStayCount: guestStayCount,
  }
}

describe('BookingCancelHandler', () => {
  let handler: BookingCancelHandler
  let prisma: ReturnType<typeof makePrismaMock>
  let notifications: { emit: jest.Mock }
  let systemStaff: { getOrCreate: jest.Mock }

  beforeEach(async () => {
    prisma = makePrismaMock()
    notifications = { emit: jest.fn() }
    systemStaff = { getOrCreate: jest.fn().mockResolvedValue('staff-system-1') }

    const mod = await Test.createTestingModule({
      providers: [
        BookingCancelHandler,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: ChannexSystemStaffService, useValue: systemStaff },
      ],
    }).compile()
    handler = mod.get(BookingCancelHandler)
  })

  it('not_found → idempotent success (no error, no notif)', async () => {
    prisma.guestStay.findUnique.mockResolvedValue(null)

    const result = await handler.handle(makeRevision())

    expect(result).toEqual({ kind: 'not_found', bookingId: 'book-1' })
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(notifications.emit).not.toHaveBeenCalled()
  })

  it('already_cancelled → idempotent refresh syncAt', async () => {
    prisma.guestStay.findUnique.mockResolvedValue(
      makeExistingStay({ cancelledAt: new Date('2026-05-20T00:00:00Z') }),
    )

    const result = await handler.handle(makeRevision())

    expect(result.kind).toBe('already_cancelled')
    expect(prisma.guestStay.update).toHaveBeenCalledWith({
      where: { id: 'stay-1' },
      data: { channexLastSyncAt: expect.any(Date) },
    })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('checked-in → manual_review GUEST_ALREADY_CHECKED_IN (NO auto-cancel)', async () => {
    prisma.guestStay.findUnique.mockResolvedValue(
      makeExistingStay({ actualCheckin: new Date('2026-06-01T22:00:00Z') }),
    )

    const result = await handler.handle(makeRevision())

    expect(result).toEqual({
      kind: 'manual_review',
      stayId: 'stay-1',
      reason: 'GUEST_ALREADY_CHECKED_IN',
    })
    expect(notifications.emit).toHaveBeenCalledWith(
      'prop-1',
      'channex:stay:conflict',
      expect.objectContaining({ reason: 'CANCEL_GUEST_ALREADY_CHECKED_IN' }),
    )
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('no-show → manual_review STAY_MARKED_NO_SHOW', async () => {
    prisma.guestStay.findUnique.mockResolvedValue(
      makeExistingStay({ noShowAt: new Date('2026-06-01T03:00:00Z') }),
    )
    const result = await handler.handle(makeRevision())
    expect((result as { reason: string }).reason).toBe('STAY_MARKED_NO_SHOW')
  })

  it('checked-out → manual_review STAY_ALREADY_CHECKED_OUT', async () => {
    prisma.guestStay.findUnique.mockResolvedValue(
      makeExistingStay({ actualCheckout: new Date('2026-06-04T15:00:00Z') }),
    )
    const result = await handler.handle(makeRevision())
    expect((result as { reason: string }).reason).toBe('STAY_ALREADY_CHECKED_OUT')
  })

  it('ARRIVING happy path: cascade journey/segments/audit + SSE + room AVAILABLE', async () => {
    prisma.guestStay.findUnique.mockResolvedValue(makeExistingStay())

    const result = await handler.handle(makeRevision())

    expect(result).toEqual({ kind: 'cancelled', stayId: 'stay-1' })

    // Transactional writes
    const updateCall = prisma.tx.guestStay.update.mock.calls[0][0]
    expect(updateCall.where.id).toBe('stay-1')
    expect(updateCall.data.cancelledAt).toBeInstanceOf(Date)
    expect(updateCall.data.cancelInitiator).toBe('OTA')
    expect(updateCall.data.cancelledFromChannel).toBe('CHANNEX_WEBHOOK')
    expect(updateCall.data.requiresFiscalReview).toBe(false)
    expect(updateCall.data.cancelMetadata).toMatchObject({
      channexRevisionId: 'rev-c1',
      channexBookingId: 'book-1',
      otaName: 'Booking.com',
      otaReservationCode: 'BDC-1234',
      cancelledByOTA: true,
    })

    // Cascade
    expect(prisma._staySegmentUpdateMany).toHaveBeenCalled()
    expect(prisma._stayJourneyEventCreate).toHaveBeenCalled()

    // Room freed (count returned 0 others active)
    expect(prisma._roomUpdate).toHaveBeenCalledWith({
      where: { id: 'room-a1' },
      data: { status: 'AVAILABLE' },
    })

    // Audit
    const logCall = prisma._guestStayLogCreate.mock.calls[0][0]
    expect(logCall.data.event).toBe('CANCELLED')
    expect(logCall.data.actorType).toBe('SYSTEM')
    expect(logCall.data.metadata.initiator).toBe('OTA')

    // SSE
    expect(notifications.emit).toHaveBeenCalledWith(
      'prop-1',
      'channex:stay:cancelled',
      expect.objectContaining({ stayId: 'stay-1', bookingId: 'book-1' }),
    )
  })

  it('ARRIVING + amountPaid > 0 → requiresFiscalReview=true (seed v1.0.2 CFDI E)', async () => {
    prisma.guestStay.findUnique.mockResolvedValue(
      makeExistingStay({ amountPaid: new Prisma.Decimal('150.00') }),
    )

    const result = await handler.handle(makeRevision())

    expect(result.kind).toBe('cancelled')
    const updateCall = prisma.tx.guestStay.update.mock.calls[0][0]
    expect(updateCall.data.requiresFiscalReview).toBe(true)
  })

  it('NO libera room cuando hay otra stay activa en el mismo room', async () => {
    prisma.guestStay.findUnique.mockResolvedValue(makeExistingStay())
    prisma._guestStayCount.mockResolvedValue(1) // another active stay

    await handler.handle(makeRevision())

    expect(prisma._roomUpdate).not.toHaveBeenCalled()
  })

  it('sin journey: cascade segments NO se dispara (stays sin journey legacy)', async () => {
    prisma.guestStay.findUnique.mockResolvedValue(
      makeExistingStay({ stayJourney: null }),
    )

    await handler.handle(makeRevision())

    expect(prisma._staySegmentUpdateMany).not.toHaveBeenCalled()
    expect(prisma._stayJourneyEventCreate).not.toHaveBeenCalled()
    // Main cancel still committed
    expect(prisma.tx.guestStay.update).toHaveBeenCalled()
  })
})
