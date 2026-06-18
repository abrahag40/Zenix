/**
 * BookingNewHandler — Day 3 happy path + 5 conflict scenarios.
 *
 * Tests cover the Channex Stage 4 cert checklist:
 *   - happy path: room mapped + available → created
 *   - room not mapped (no Zenix Room with channexRoomTypeId) → UNASSIGNED conflict
 *   - rate plan not mapped (rate_plan_id null) → conflict
 *   - all rooms of type unavailable for dates → AVAILABILITY_OVERLAP conflict
 *   - property unknown → PROPERTY_NOT_FOUND conflict
 *   - idempotency: existing channexBookingId → already_exists
 *   - out-of-order: incoming insertedAt older than stored channexLastSyncAt → stale
 */

import { Test } from '@nestjs/testing'
import { ChannexBookingRevision } from '../../channex.gateway'
import { AvailabilityService } from '../../../../pms/availability/availability.service'
import { NotificationsService } from '../../../../notifications/notifications.service'
import { PrismaService } from '../../../../prisma/prisma.service'
import { ChannexNotifService } from '../channex-notif.service'
import { ChannexSystemStaffService } from '../channex-system-staff.service'
import { BookingNewHandler } from './booking-new.handler'

function makeRevision(overrides: Partial<ChannexBookingRevision> = {}): ChannexBookingRevision {
  return {
    id: 'rev-1',
    property_id: 'prop-1',
    booking_id: 'book-1',
    ota_name: 'Booking.com',
    status: 'new',
    arrival_date: '2026-06-01',
    departure_date: '2026-06-04',
    arrival_hour: '16:30',
    amount: '450.00',
    currency: 'USD',
    occupancy: { adults: 2, children: 0, infants: 0 },
    rooms: [
      {
        amount: '450.00',
        checkin_date: '2026-06-01',
        checkout_date: '2026-06-04',
        rate_plan_id: 'rate-bar',
        room_type_id: 'rt-standard',
        occupancy: { adults: 2, children: 0, infants: 0 },
      },
    ],
    customer: { name: 'Maria', surname: 'Garcia' },
    inserted_at: '2026-05-22T18:00:00.000Z',
    payment_collect: 'property',
    ...overrides,
  }
}

function makePrismaMock() {
  // Sprint CHANNEX-INBOUND fix 2026-05-22 — BookingNewHandler ahora crea
  // GuestStay + StayJourney + StaySegment en MISMA tx (mirror manual flow).
  // El mock simula la tx ejecutando el callback con los mocks tx-scoped.
  const txGuestStayCreate = jest.fn()
  const txStayJourneyCreate = jest.fn().mockResolvedValue({ id: 'journey-1' })
  const txStaySegmentCreate = jest.fn().mockResolvedValue({ id: 'segment-1' })

  return {
    // CHECK-IN C2.2 — multi-room idempotency lookup. Single-room tests
    // simulan "no group" con findUnique → null por default.
    reservationGroup: { findUnique: jest.fn().mockResolvedValue(null) },
    guestStay: {
      findUnique: jest.fn(),
      // Para los conflict paths que NO usan $transaction (persistConflict),
      // se mantiene como mock directo.
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    property: { findUnique: jest.fn() },
    room: { findMany: jest.fn(), findFirst: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        guestStay: { create: txGuestStayCreate },
        stayJourney: { create: txStayJourneyCreate },
        staySegment: { create: txStaySegmentCreate },
      }),
    ),
    _tx: { txGuestStayCreate, txStayJourneyCreate, txStaySegmentCreate },
  }
}

describe('BookingNewHandler', () => {
  let handler: BookingNewHandler
  let prisma: ReturnType<typeof makePrismaMock>
  let availability: { check: jest.Mock }
  let notifications: { emit: jest.Mock }
  let systemStaff: { getOrCreate: jest.Mock }
  let channexNotif: { raiseConflict: jest.Mock }
  let events: { emit: jest.Mock }

  beforeEach(async () => {
    prisma = makePrismaMock()
    availability = { check: jest.fn().mockResolvedValue({ available: true, conflicts: [], checkedChannex: false }) }
    notifications = { emit: jest.fn() }
    systemStaff = { getOrCreate: jest.fn().mockResolvedValue('staff-system-1') }
    channexNotif = { raiseConflict: jest.fn().mockResolvedValue({ notificationId: 'notif-1' }) }
    events = { emit: jest.fn() }

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

  it('happy path: room mapped + available → kind=created + SSE emit + Journey+Segment creados', async () => {
    prisma.guestStay.findUnique.mockResolvedValue(null)
    prisma.property.findUnique.mockResolvedValue({
      id: 'prop-1',
      organizationId: 'org-1',
      settings: { timezone: 'America/Cancun' },
    })
    prisma.room.findMany.mockResolvedValue([{ id: 'room-a1', number: 'A1' }])
    availability.check.mockResolvedValue({ available: true, conflicts: [], checkedChannex: false })
    // tx.guestStay.create returns the new stay
    prisma._tx.txGuestStayCreate.mockResolvedValue({
      id: 'stay-1',
      roomId: 'room-a1',
      checkinAt: new Date('2026-06-01T21:30:00Z'),
      scheduledCheckout: new Date('2026-06-04T16:00:00Z'),
    })

    const result = await handler.handle(makeRevision())

    expect(result).toEqual({ kind: 'created', stayId: 'stay-1', roomId: 'room-a1' })
    // Verifica que la TX corrió + creó las 3 entidades (mirror manual flow)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma._tx.txGuestStayCreate).toHaveBeenCalled()
    expect(prisma._tx.txStayJourneyCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        propertyId: 'prop-1',
        guestStayId: 'stay-1',
        journeyCheckIn: expect.any(Date),
        journeyCheckOut: expect.any(Date),
      }),
    })
    expect(prisma._tx.txStaySegmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        journeyId: 'journey-1',
        roomId: 'room-a1',
        guestStayId: 'stay-1',
        status: 'ACTIVE',
        reason: 'ORIGINAL',
      }),
    })
    // SSE refresca calendar (useRoomSSE listener wired Day post-audit)
    expect(notifications.emit).toHaveBeenCalledWith(
      'prop-1',
      'channex:stay:created',
      expect.objectContaining({ stayId: 'stay-1', bookingId: 'book-1' }),
    )
  })

  it('idempotency: stay existente con timestamp más reciente → already_exists (refresh sync)', async () => {
    prisma.guestStay.findUnique.mockResolvedValue({
      id: 'stay-1',
      roomId: 'room-a1',
      channexLastSyncAt: new Date('2026-05-20T00:00:00Z'), // older
      cancelledAt: null,
    })

    const result = await handler.handle(makeRevision())

    expect(result.kind).toBe('already_exists')
    expect((result as { stayId: string }).stayId).toBe('stay-1')
    expect(prisma.guestStay.update).toHaveBeenCalled() // refresh sync timestamp
    expect(prisma.guestStay.create).not.toHaveBeenCalled()
  })

  it('out-of-order: revision con inserted_at anterior al stored → stale', async () => {
    prisma.guestStay.findUnique.mockResolvedValue({
      id: 'stay-1',
      roomId: 'room-a1',
      channexLastSyncAt: new Date('2026-05-25T00:00:00Z'), // newer than incoming
      cancelledAt: null,
    })

    const result = await handler.handle(makeRevision({ inserted_at: '2026-05-22T18:00:00.000Z' }))

    expect(result.kind).toBe('stale')
    expect(prisma.guestStay.create).not.toHaveBeenCalled()
    expect(prisma.guestStay.update).not.toHaveBeenCalled()
  })

  it('property desconocida → conflict PROPERTY_NOT_FOUND (no persiste stay)', async () => {
    prisma.guestStay.findUnique.mockResolvedValue(null)
    prisma.property.findUnique.mockResolvedValue(null)

    const result = await handler.handle(makeRevision())

    expect(result).toEqual({ kind: 'conflict', stayId: null, reason: 'PROPERTY_NOT_FOUND' })
    expect(prisma.guestStay.create).not.toHaveBeenCalled()
  })

  it('room_type no mapeado en Zenix → conflict NO_ROOM_TYPE_MATCH con placeholder room', async () => {
    prisma.guestStay.findUnique.mockResolvedValue(null)
    prisma.property.findUnique.mockResolvedValue({
      id: 'prop-1',
      organizationId: 'org-1',
      settings: { timezone: 'America/Cancun' },
    })
    prisma.room.findMany.mockResolvedValue([]) // no rooms with channexRoomTypeId match
    prisma.room.findFirst.mockResolvedValue({ id: 'room-placeholder-1' }) // any room as placeholder
    prisma.guestStay.create.mockResolvedValue({ id: 'stay-conflict-1' })

    const result = await handler.handle(makeRevision())

    expect(result.kind).toBe('conflict')
    expect((result as { reason: string }).reason).toBe('NO_ROOM_TYPE_MATCH')
    expect((result as { stayId: string }).stayId).toBe('stay-conflict-1')
    // persisted with channexConflict=true
    const createCall = prisma.guestStay.create.mock.calls[0][0]
    expect(createCall.data.channexConflict).toBe(true)
    expect(createCall.data.notes).toContain('NO_ROOM_TYPE_MATCH')
    expect(notifications.emit).toHaveBeenCalledWith(
      'prop-1',
      'channex:stay:conflict',
      expect.objectContaining({ reason: 'NO_ROOM_TYPE_MATCH' }),
    )
    // Day 7: AppNotification persistence verified for bell/page counters
    expect(channexNotif.raiseConflict).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        propertyId: 'prop-1',
        reason: 'NO_ROOM_TYPE_MATCH',
        otaName: 'Booking.com',
      }),
    )
  })

  it('rate_plan_id null → conflict UNMAPPED_RATE_PLAN', async () => {
    prisma.guestStay.findUnique.mockResolvedValue(null)
    prisma.property.findUnique.mockResolvedValue({
      id: 'prop-1',
      organizationId: 'org-1',
      settings: { timezone: 'America/Cancun' },
    })
    prisma.room.findFirst.mockResolvedValue({ id: 'room-placeholder' })
    prisma.guestStay.create.mockResolvedValue({ id: 'stay-conflict-2' })

    const revision = makeRevision({
      rooms: [
        {
          amount: '450.00',
          checkin_date: '2026-06-01',
          checkout_date: '2026-06-04',
          rate_plan_id: null as unknown as string,
          room_type_id: 'rt-standard',
          occupancy: { adults: 2, children: 0, infants: 0 },
        },
      ],
    })

    const result = await handler.handle(revision)
    expect(result.kind).toBe('conflict')
    expect((result as { reason: string }).reason).toBe('UNMAPPED_RATE_PLAN')
  })

  it('todos los rooms ocupados para fechas → conflict AVAILABILITY_OVERLAP', async () => {
    prisma.guestStay.findUnique.mockResolvedValue(null)
    prisma.property.findUnique.mockResolvedValue({
      id: 'prop-1',
      organizationId: 'org-1',
      settings: { timezone: 'America/Cancun' },
    })
    prisma.room.findMany.mockResolvedValue([
      { id: 'room-a1', number: 'A1' },
      { id: 'room-a2', number: 'A2' },
    ])
    availability.check.mockResolvedValue({
      available: false,
      conflicts: [{ source: 'LOCAL_STAY', id: 's1', label: 'Other guest', from: new Date(), to: new Date() }],
      checkedChannex: false,
    })
    prisma.guestStay.create.mockResolvedValue({ id: 'stay-conflict-3' })

    const result = await handler.handle(makeRevision())

    expect(result.kind).toBe('conflict')
    expect((result as { reason: string }).reason).toBe('AVAILABILITY_OVERLAP')
    // Called check for both rooms before giving up
    expect(availability.check).toHaveBeenCalledTimes(2)
  })

  // CHECK-IN C2.2 (2026-05-29) — multi-room ahora crea ReservationGroup.
  // El path MULTI_ROOM_BOOKING conflict del audit C1 fue reemplazado por
  // auto-detección §153-§158. Tests dedicados en
  // `booking-new.handler.multi-room.spec.ts`.

  it('audit C3: property con organizationId null → throw (no silent empty-string)', async () => {
    prisma.guestStay.findUnique.mockResolvedValue(null)
    prisma.property.findUnique.mockResolvedValue({
      id: 'prop-1',
      organizationId: null, // schema violation simulation
      settings: { timezone: 'America/Cancun' },
    })

    await expect(handler.handle(makeRevision())).rejects.toThrow(
      /NULL organizationId/,
    )
  })

  it('multi-room: skipea el primer room ocupado y usa el segundo disponible', async () => {
    prisma.guestStay.findUnique.mockResolvedValue(null)
    prisma.property.findUnique.mockResolvedValue({
      id: 'prop-1',
      organizationId: 'org-1',
      settings: { timezone: 'America/Cancun' },
    })
    prisma.room.findMany.mockResolvedValue([
      { id: 'room-a1', number: 'A1' },
      { id: 'room-a2', number: 'A2' },
    ])
    availability.check
      .mockResolvedValueOnce({ available: false, conflicts: [], checkedChannex: false }) // loop: room-a1 ocupada
      .mockResolvedValueOnce({ available: true, conflicts: [], checkedChannex: false }) // loop: room-a2 libre
      .mockResolvedValueOnce({ available: true, conflicts: [], checkedChannex: false }) // re-check bajo lock
    prisma._tx.txGuestStayCreate.mockResolvedValue({
      id: 'stay-2',
      roomId: 'room-a2',
      checkinAt: new Date('2026-06-01T21:30:00Z'),
      scheduledCheckout: new Date('2026-06-04T16:00:00Z'),
    })

    const result = await handler.handle(makeRevision())

    expect(result).toEqual({ kind: 'created', stayId: 'stay-2', roomId: 'room-a2' })
    // OVERBOOKING-HARDENING — loop (2) + re-check bajo lock dentro de la tx (1).
    expect(availability.check).toHaveBeenCalledTimes(3)
  })
})
