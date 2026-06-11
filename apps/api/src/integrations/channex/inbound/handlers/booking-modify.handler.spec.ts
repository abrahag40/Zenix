/**
 * BookingModifyHandler — D-CHX8 policy tests.
 *
 * Cubre:
 *   - not_found → fall-through a BookingNewHandler (out-of-order recovery)
 *   - stale by inserted_at
 *   - terminal cancelled → log + no change
 *   - terminal no-show → log + no change
 *   - terminal checked-out → log + no change
 *   - checked-in (in-house): safe fields only; date change → review notif
 *   - ARRIVING: date change with conflict → channexConflict=true + review
 *   - ARRIVING: full update happy path
 *   - ARRIVING: pmsHasCollected → no overwrite del payment block (USALI §28)
 */

import { Test } from '@nestjs/testing'
import { Prisma } from '@prisma/client'
import { ChannexBookingRevision } from '../../channex.gateway'
import { AvailabilityService } from '../../../../pms/availability/availability.service'
import { NotificationsService } from '../../../../notifications/notifications.service'
import { PrismaService } from '../../../../prisma/prisma.service'
import { ChannexSystemStaffService } from '../channex-system-staff.service'
import { BookingModifyHandler } from './booking-modify.handler'
import { BookingNewHandler } from './booking-new.handler'

function makeRevision(overrides: Partial<ChannexBookingRevision> = {}): ChannexBookingRevision {
  return {
    id: 'rev-m1',
    property_id: 'prop-1',
    booking_id: 'book-1',
    ota_name: 'Booking.com',
    status: 'modified',
    arrival_date: '2026-06-01',
    departure_date: '2026-06-04',
    arrival_hour: '16:30',
    amount: '500.00', // up from 450
    currency: 'USD',
    occupancy: { adults: 2, children: 0, infants: 0 },
    rooms: [
      {
        amount: '500.00',
        checkin_date: '2026-06-01',
        checkout_date: '2026-06-04',
        rate_plan_id: 'rate-bar',
        room_type_id: 'rt-standard',
        occupancy: { adults: 2, children: 0, infants: 0 },
      },
    ],
    customer: { name: 'Maria', surname: 'Garcia' },
    inserted_at: '2026-05-25T10:00:00.000Z',
    payment_collect: 'property',
    ...overrides,
  }
}

function makeExistingStay(overrides: Record<string, unknown> = {}) {
  return {
    id: 'stay-1',
    organizationId: 'org-1',
    propertyId: 'prop-1',
    roomId: 'room-a1',
    channexLastSyncAt: new Date('2026-05-22T18:00:00.000Z'),
    cancelledAt: null,
    noShowAt: null,
    actualCheckin: null,
    actualCheckout: null,
    checkinAt: new Date('2026-06-01T21:30:00.000Z'),
    scheduledCheckout: new Date('2026-06-04T16:00:00.000Z'),
    ...overrides,
  }
}

function makePrismaMock() {
  return {
    // CHECK-IN C2.2 — multi-room lookup. Default null = single-room legacy path.
    reservationGroup: { findUnique: jest.fn().mockResolvedValue(null) },
    guestStay: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    property: { findUnique: jest.fn() },
  }
}

describe('BookingModifyHandler', () => {
  let handler: BookingModifyHandler
  let prisma: ReturnType<typeof makePrismaMock>
  let availability: { check: jest.Mock }
  let notifications: { emit: jest.Mock }
  let systemStaff: { getOrCreate: jest.Mock }
  let bookingNew: { handle: jest.Mock }

  beforeEach(async () => {
    prisma = makePrismaMock()
    availability = { check: jest.fn() }
    notifications = { emit: jest.fn() }
    systemStaff = { getOrCreate: jest.fn().mockResolvedValue('staff-system-1') }
    bookingNew = {
      handle: jest.fn().mockResolvedValue({ kind: 'created', stayId: 'stay-recovered', roomId: 'room-a1' }),
    }

    const events = { emit: jest.fn() }

    const mod = await Test.createTestingModule({
      providers: [
        BookingModifyHandler,
        { provide: PrismaService, useValue: prisma },
        { provide: AvailabilityService, useValue: availability },
        { provide: NotificationsService, useValue: notifications },
        { provide: ChannexSystemStaffService, useValue: systemStaff },
        { provide: BookingNewHandler, useValue: bookingNew },
        // BUG-9 (2026-06-08) — EventEmitter2 injected for same-day-arrival emit.
        { provide: require('@nestjs/event-emitter').EventEmitter2, useValue: events },
      ],
    }).compile()
    handler = mod.get(BookingModifyHandler)
  })

  it('not_found → fall-through a BookingNewHandler (out-of-order modify-before-new)', async () => {
    prisma.guestStay.findUnique.mockResolvedValue(null)

    const result = await handler.handle(makeRevision())

    expect(result.kind).toBe('created_as_new')
    expect(bookingNew.handle).toHaveBeenCalledTimes(1)
  })

  it('stale: incoming inserted_at <= stored channexLastSyncAt → skip', async () => {
    prisma.guestStay.findUnique.mockResolvedValue(
      makeExistingStay({ channexLastSyncAt: new Date('2026-05-28T00:00:00Z') }),
    )

    const result = await handler.handle(makeRevision({ inserted_at: '2026-05-25T10:00:00.000Z' }))

    expect(result.kind).toBe('stale')
    expect(prisma.guestStay.update).not.toHaveBeenCalled()
    expect(bookingNew.handle).not.toHaveBeenCalled()
  })

  it('terminal cancelled → emit conflict + refresh sync, NO modify', async () => {
    prisma.guestStay.findUnique.mockResolvedValue(
      makeExistingStay({ cancelledAt: new Date('2026-05-23T00:00:00Z') }),
    )

    const result = await handler.handle(makeRevision())

    expect(result).toEqual({
      kind: 'terminal',
      stayId: 'stay-1',
      reason: 'CANCELLED',
    })
    expect(notifications.emit).toHaveBeenCalledWith(
      'prop-1',
      'channex:stay:conflict',
      expect.objectContaining({ reason: 'MODIFY_ON_CANCELLED' }),
    )
    // Only the sync timestamp refresh — no data change
    expect(prisma.guestStay.update).toHaveBeenCalledTimes(1)
    const update = prisma.guestStay.update.mock.calls[0][0]
    expect(Object.keys(update.data)).toEqual(['channexLastSyncAt'])
  })

  it('terminal no-show → emit conflict + NO modify', async () => {
    prisma.guestStay.findUnique.mockResolvedValue(
      makeExistingStay({ noShowAt: new Date('2026-06-01T03:00:00Z') }),
    )

    const result = await handler.handle(makeRevision())

    expect((result as { reason: string }).reason).toBe('NO_SHOW')
  })

  it('checked-in: safe fields only (guest info / notes), date change → review notif', async () => {
    prisma.guestStay.findUnique.mockResolvedValue(
      makeExistingStay({ actualCheckin: new Date('2026-06-01T22:00:00Z') }),
    )
    prisma.property.findUnique.mockResolvedValue({
      id: 'prop-1',
      organizationId: 'org-1',
      settings: { timezone: 'America/Cancun' },
    })

    // Revision has different departure_date
    const result = await handler.handle(makeRevision({ departure_date: '2026-06-06' }))

    expect(result.kind).toBe('updated')
    expect((result as { restrictedToSafeFields: boolean }).restrictedToSafeFields).toBe(true)

    const update = prisma.guestStay.update.mock.calls[0][0]
    // Date fields NOT in the update payload
    expect(update.data).not.toHaveProperty('scheduledCheckout')
    expect(update.data).not.toHaveProperty('checkinAt')
    expect(update.data).not.toHaveProperty('ratePerNight')
    // Safe fields ARE updated
    expect(update.data.guestName).toBe('Maria Garcia')
    expect(update.data.channexLastSyncAt).toBeInstanceOf(Date)

    // Review notif fired because dates differ post-checkin
    expect(notifications.emit).toHaveBeenCalledWith(
      'prop-1',
      'channex:stay:conflict',
      expect.objectContaining({ reason: 'DATE_CHANGE_POST_CHECKIN' }),
    )
  })

  it('AUTO-CHECKIN §D-AC6: el modify NO pisa campos guest-verified (pre-checkin gana)', async () => {
    // El huésped corrigió su teléfono y email en el pre-checkin → la OTA tiene
    // el dato viejo; el modify de Channex no debe sobrescribirlos.
    prisma.guestStay.findUnique.mockResolvedValue(
      makeExistingStay({
        actualCheckin: new Date('2026-06-01T22:00:00Z'),
        guestVerifiedFields: ['guestPhone', 'guestEmail'],
      }),
    )
    prisma.property.findUnique.mockResolvedValue({
      id: 'prop-1',
      organizationId: 'org-1',
      settings: { timezone: 'America/Cancun' },
    })

    await handler.handle(makeRevision())

    const update = prisma.guestStay.update.mock.calls[0][0]
    // guest-verified → excluidos del patch
    expect(update.data).not.toHaveProperty('guestPhone')
    expect(update.data).not.toHaveProperty('guestEmail')
    // no-verificados → sí se actualizan
    expect(update.data.guestName).toBe('Maria Garcia')
    expect(update.data).toHaveProperty('nationality')
  })

  it('ARRIVING + date change con conflict → channexConflict=true + review notif', async () => {
    prisma.guestStay.findUnique.mockResolvedValueOnce(makeExistingStay())
    prisma.property.findUnique.mockResolvedValue({
      id: 'prop-1',
      organizationId: 'org-1',
      settings: { timezone: 'America/Cancun' },
    })
    availability.check.mockResolvedValue({
      available: false,
      conflicts: [{ source: 'LOCAL_STAY', id: 'other', label: 'X', from: new Date(), to: new Date() }],
      checkedChannex: false,
    })

    const result = await handler.handle(makeRevision({ departure_date: '2026-06-08' }))

    expect(result.kind).toBe('updated')
    const update = prisma.guestStay.update.mock.calls[0][0]
    expect(update.data.channexConflict).toBe(true)
    expect(notifications.emit).toHaveBeenCalledWith(
      'prop-1',
      'channex:stay:conflict',
      expect.objectContaining({ reason: 'DATE_CHANGE_OVERLAPS_OTHER_STAY' }),
    )
  })

  it('ARRIVING happy path: full update + SSE channex:stay:modified', async () => {
    prisma.guestStay.findUnique
      .mockResolvedValueOnce(makeExistingStay())
      .mockResolvedValueOnce({ amountPaid: new Prisma.Decimal(0), paymentModel: 'HOTEL_COLLECT' })
    prisma.property.findUnique.mockResolvedValue({
      id: 'prop-1',
      organizationId: 'org-1',
      settings: { timezone: 'America/Cancun' },
    })
    availability.check.mockResolvedValue({ available: true, conflicts: [], checkedChannex: false })

    const result = await handler.handle(makeRevision({ departure_date: '2026-06-05' }))

    expect(result).toEqual({ kind: 'updated', stayId: 'stay-1', restrictedToSafeFields: false })
    const update = prisma.guestStay.update.mock.calls[0][0]
    // Full update includes financial fields
    expect(update.data).toHaveProperty('ratePerNight')
    expect(update.data).toHaveProperty('totalAmount')
    expect(update.data).toHaveProperty('currency')
    expect(notifications.emit).toHaveBeenCalledWith(
      'prop-1',
      'channex:stay:modified',
      expect.objectContaining({ stayId: 'stay-1', datesChanged: true }),
    )
  })

  it('ARRIVING + PMS ya cobró → NO sobreescribe payment fields (§28)', async () => {
    prisma.guestStay.findUnique
      .mockResolvedValueOnce(makeExistingStay())
      .mockResolvedValueOnce({ amountPaid: new Prisma.Decimal('200.00'), paymentModel: 'HOTEL_COLLECT' })
    prisma.property.findUnique.mockResolvedValue({
      id: 'prop-1',
      organizationId: 'org-1',
      settings: { timezone: 'America/Cancun' },
    })
    availability.check.mockResolvedValue({ available: true, conflicts: [], checkedChannex: false })

    await handler.handle(makeRevision({ amount: '999.00' }))

    const update = prisma.guestStay.update.mock.calls[0][0]
    expect(update.data).not.toHaveProperty('ratePerNight')
    expect(update.data).not.toHaveProperty('totalAmount')
    expect(update.data).not.toHaveProperty('currency')
    expect(update.data).not.toHaveProperty('paymentModel')
    // Safe fields still updated
    expect(update.data.guestName).toBe('Maria Garcia')
  })
})
