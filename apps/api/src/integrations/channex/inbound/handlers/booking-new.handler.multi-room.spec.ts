/**
 * BookingNewHandler — Sprint CHECK-IN C2.2 (2026-05-29) multi-room §153-§158.
 *
 * Cubre auto-detección OTA multi-room:
 *  - revision.rooms.length === 2 → 1 ReservationGroup + 2 GuestStays
 *  - groupRoomIndex 1-based correcto
 *  - primaryGuestName title-cased
 *  - channexBookingId solo en group (stays con null)
 *  - room 2 no mapea → group creado, stay 2 con channexConflict=true
 *  - idempotency: webhook duplicado → group_exists
 */

import { Test } from '@nestjs/testing'
import { ChannexBookingRevision } from '../../channex.gateway'
import { AvailabilityService } from '../../../../pms/availability/availability.service'
import { NotificationsService } from '../../../../notifications/notifications.service'
import { PrismaService } from '../../../../prisma/prisma.service'
import { ChannexNotifService } from '../channex-notif.service'
import { ChannexSystemStaffService } from '../channex-system-staff.service'
import { BookingNewHandler } from './booking-new.handler'

function makeMultiRoomRevision(
  overrides: Partial<ChannexBookingRevision> = {},
): ChannexBookingRevision {
  return {
    id: 'rev-multi-1',
    property_id: 'prop-1',
    booking_id: 'book-multi-1',
    ota_name: 'Booking.com',
    ota_reservation_code: 'BK-987',
    status: 'new',
    arrival_date: '2026-06-01',
    departure_date: '2026-06-04',
    arrival_hour: '15:00',
    amount: '900.00',
    currency: 'USD',
    occupancy: { adults: 4, children: 0, infants: 0 },
    rooms: [
      {
        amount: '450.00',
        checkin_date: '2026-06-01',
        checkout_date: '2026-06-04',
        rate_plan_id: 'rate-bar',
        room_type_id: 'rt-standard',
        occupancy: { adults: 2, children: 0, infants: 0 },
        guests: [{ name: 'maria', surname: 'GARCIA' }],
      },
      {
        amount: '450.00',
        checkin_date: '2026-06-01',
        checkout_date: '2026-06-04',
        rate_plan_id: 'rate-bar',
        room_type_id: 'rt-standard',
        occupancy: { adults: 2, children: 0, infants: 0 },
        guests: [{ name: 'carlos', surname: 'lópez' }],
      },
    ],
    customer: { name: 'maria', surname: 'garcia', mail: 'maria@example.com', phone: '+52555' },
    inserted_at: '2026-05-22T18:00:00.000Z',
    payment_collect: 'property',
    ...overrides,
  }
}

function makePrismaMock() {
  const txReservationGroupCreate = jest.fn()
  const txGuestStayCreate = jest.fn()
  const txStayJourneyCreate = jest.fn().mockResolvedValue({ id: 'journey-x' })
  const txStaySegmentCreate = jest.fn().mockResolvedValue({ id: 'segment-x' })

  return {
    reservationGroup: { findUnique: jest.fn() },
    guestStay: { findUnique: jest.fn() },
    property: { findUnique: jest.fn() },
    room: { findFirst: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        reservationGroup: { create: txReservationGroupCreate },
        guestStay: { create: txGuestStayCreate },
        stayJourney: { create: txStayJourneyCreate },
        staySegment: { create: txStaySegmentCreate },
      }),
    ),
    _tx: { txReservationGroupCreate, txGuestStayCreate, txStayJourneyCreate, txStaySegmentCreate },
  }
}

describe('BookingNewHandler — multi-room (CHECK-IN C2.2)', () => {
  let handler: BookingNewHandler
  let prisma: ReturnType<typeof makePrismaMock>
  let availability: { check: jest.Mock }
  let notifications: { emit: jest.Mock }
  let systemStaff: { getOrCreate: jest.Mock }
  let channexNotif: { raiseConflict: jest.Mock; raiseGroupBookingReceived: jest.Mock }

  beforeEach(async () => {
    prisma = makePrismaMock()
    availability = { check: jest.fn() }
    notifications = { emit: jest.fn() }
    systemStaff = { getOrCreate: jest.fn().mockResolvedValue('staff-system-1') }
    channexNotif = {
      raiseConflict: jest.fn().mockResolvedValue({ notificationId: 'n-1' }),
      raiseGroupBookingReceived: jest.fn().mockResolvedValue({ notificationId: 'n-2' }),
    }

    const events = { emit: jest.fn() }
    const mod = await Test.createTestingModule({
      providers: [
        BookingNewHandler,
        { provide: PrismaService, useValue: prisma },
        { provide: AvailabilityService, useValue: availability },
        { provide: NotificationsService, useValue: notifications },
        { provide: ChannexSystemStaffService, useValue: systemStaff },
        { provide: ChannexNotifService, useValue: channexNotif },
        { provide: require('@nestjs/event-emitter').EventEmitter2, useValue: events },
      ],
    }).compile()
    handler = mod.get(BookingNewHandler)
  })

  it('happy path: 2 rooms mapped + available → 1 group + 2 stays', async () => {
    prisma.reservationGroup.findUnique.mockResolvedValue(null)
    prisma.guestStay.findUnique.mockResolvedValue(null)
    prisma.property.findUnique.mockResolvedValue({
      id: 'prop-1',
      organizationId: 'org-1',
      settings: { timezone: 'America/Cancun' },
    })
    prisma.room.findFirst.mockResolvedValue({ id: 'room-fallback' })
    prisma.room.findMany.mockResolvedValue([
      { id: 'room-a', number: '101' },
      { id: 'room-b', number: '102' },
    ])
    availability.check.mockResolvedValue({ available: true })

    prisma._tx.txReservationGroupCreate.mockResolvedValue({ id: 'group-1' })
    prisma._tx.txGuestStayCreate
      .mockResolvedValueOnce({
        id: 'stay-1',
        checkinAt: new Date('2026-06-01T20:00:00Z'),
        scheduledCheckout: new Date('2026-06-04T16:00:00Z'),
        roomId: 'room-a',
      })
      .mockResolvedValueOnce({
        id: 'stay-2',
        checkinAt: new Date('2026-06-01T20:00:00Z'),
        scheduledCheckout: new Date('2026-06-04T16:00:00Z'),
        roomId: 'room-b',
      })

    const result = await handler.handle(makeMultiRoomRevision())

    expect(result.kind).toBe('group_created')
    if (result.kind !== 'group_created') return
    expect(result.groupId).toBe('group-1')
    expect(result.stayIds).toEqual(['stay-1', 'stay-2'])
    expect(result.hasConflicts).toBe(false)

    // ReservationGroup payload — channexBookingId en group, title-cased name
    expect(prisma._tx.txReservationGroupCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channexBookingId: 'book-multi-1',
          channexOtaName: 'Booking.com',
          primaryGuestName: 'Maria Garcia',
          primaryGuestEmail: 'maria@example.com',
          primaryGuestPhone: '+52555',
          groupSize: 4,
          roomCount: 2,
        }),
      }),
    )

    // GuestStay creates — channexBookingId NULL, groupRoomIndex 1 y 2
    expect(prisma._tx.txGuestStayCreate).toHaveBeenCalledTimes(2)
    expect(prisma._tx.txGuestStayCreate.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          channexBookingId: null,
          reservationGroupId: 'group-1',
          groupRoomIndex: 1,
        }),
      }),
    )
    expect(prisma._tx.txGuestStayCreate.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          channexBookingId: null,
          reservationGroupId: 'group-1',
          groupRoomIndex: 2,
        }),
      }),
    )

    // SSE + group notif
    expect(notifications.emit).toHaveBeenCalledWith(
      'prop-1',
      'channex:group:created',
      expect.objectContaining({ groupId: 'group-1', hasConflicts: false }),
    )
    expect(channexNotif.raiseGroupBookingReceived).toHaveBeenCalledWith(
      expect.objectContaining({ hasConflicts: false, roomCount: 2 }),
    )
  })

  it('edge: room 2 no mapea (sin channexRoomTypeId match) → group creado, stay 2 con channexConflict', async () => {
    prisma.reservationGroup.findUnique.mockResolvedValue(null)
    prisma.guestStay.findUnique.mockResolvedValue(null)
    prisma.property.findUnique.mockResolvedValue({
      id: 'prop-1',
      organizationId: 'org-1',
      settings: { timezone: 'America/Cancun' },
    })
    prisma.room.findFirst.mockResolvedValue({ id: 'room-fallback' })
    // room 1 maps, room 2 doesn't (different room_type_id)
    prisma.room.findMany.mockImplementation(({ where }: { where: { channexRoomTypeId?: string } }) => {
      if (where.channexRoomTypeId === 'rt-standard') {
        return Promise.resolve([{ id: 'room-a', number: '101' }])
      }
      return Promise.resolve([]) // rt-suite unmapped
    })
    availability.check.mockResolvedValue({ available: true })

    prisma._tx.txReservationGroupCreate.mockResolvedValue({ id: 'group-2' })
    prisma._tx.txGuestStayCreate
      .mockResolvedValueOnce({
        id: 'stay-a',
        checkinAt: new Date(),
        scheduledCheckout: new Date(),
        roomId: 'room-a',
      })
      .mockResolvedValueOnce({
        id: 'stay-b',
        checkinAt: new Date(),
        scheduledCheckout: new Date(),
        roomId: 'room-fallback',
      })

    const revision = makeMultiRoomRevision()
    revision.rooms[1].room_type_id = 'rt-suite' // unmapped

    const result = await handler.handle(revision)

    expect(result.kind).toBe('group_created')
    if (result.kind !== 'group_created') return
    expect(result.hasConflicts).toBe(true)

    // Stay 2 marked channexConflict=true with NO_ROOM_TYPE_MATCH note
    expect(prisma._tx.txGuestStayCreate.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          channexConflict: true,
          groupRoomIndex: 2,
        }),
      }),
    )

    // Group notif HIGH priority
    expect(channexNotif.raiseGroupBookingReceived).toHaveBeenCalledWith(
      expect.objectContaining({ hasConflicts: true }),
    )
  })

  it('idempotency: webhook replay del mismo booking_id → group_exists, NO crea segundo group', async () => {
    prisma.reservationGroup.findUnique.mockResolvedValue({
      id: 'group-already',
      stays: [{ id: 'stay-existing-1' }, { id: 'stay-existing-2' }],
    })

    const result = await handler.handle(makeMultiRoomRevision())

    expect(result.kind).toBe('group_exists')
    if (result.kind !== 'group_exists') return
    expect(result.groupId).toBe('group-already')
    expect(result.stayIds).toEqual(['stay-existing-1', 'stay-existing-2'])

    // No transaction, no notifs
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(channexNotif.raiseGroupBookingReceived).not.toHaveBeenCalled()
  })
})
