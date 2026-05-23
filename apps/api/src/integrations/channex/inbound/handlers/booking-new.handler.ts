import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { ChannexBookingRevision } from '../../channex.gateway'
import { AvailabilityService } from '../../../../pms/availability/availability.service'
import { NotificationsService } from '../../../../notifications/notifications.service'
import { PrismaService } from '../../../../prisma/prisma.service'
import { ChannexBookingMapper } from '../channex-booking.mapper'
import { ChannexNotifService } from '../channex-notif.service'
import { ChannexSystemStaffService } from '../channex-system-staff.service'

export type BookingNewResult =
  | { kind: 'created'; stayId: string; roomId: string }
  | { kind: 'conflict'; stayId: string | null; reason: ConflictReason }
  | { kind: 'already_exists'; stayId: string }
  | { kind: 'stale'; stayId: string }

export type ConflictReason =
  | 'NO_ROOM_TYPE_MATCH' // Channex room_type_id not mapped to any Zenix Room
  | 'AVAILABILITY_OVERLAP' // overlaps with existing GuestStay/Segment/Block
  | 'PROPERTY_NOT_FOUND' // Channex sent property_id we don't know
  | 'UNMAPPED_RATE_PLAN' // rate_plan_id null → cannot price, queue for human
  | 'MULTI_ROOM_BOOKING' // booking has 2+ rooms — needs journey-linked stays (v1.0.1)

/**
 * BookingNewHandler — invoked by ChannexRevisionPullerService when the
 * outbox event is `booking_new` or any first-time revision for a booking_id
 * not yet present in GuestStay.
 *
 * Order of operations (Channex official + Stage 4 cert review notes):
 *   1. Idempotency: if `channexBookingId` already exists → return existing
 *      (the modify handler is responsible for newer revisions, Day 4).
 *   2. Out-of-order guard: compare incoming `inserted_at` vs stored
 *      `channexLastSyncAt`. If stored is newer, skip with `stale` (older
 *      revision arrived after newer one — dev gotcha documented in
 *      Channex's "webhook ordering" warning).
 *   3. Property resolution. Unknown property_id → conflict + AppNotif.
 *   4. Room resolution by `Room.channexRoomTypeId`. Multiple match → pick
 *      first available for the date range. None match → UNASSIGNED conflict
 *      (D-CHX9).
 *   5. AvailabilityService.check() on the chosen room. Conflict path persists
 *      the stay with `channexConflict=true` and emits SSE + notif (D-CHX5).
 *   6. Mapper → GuestStay create. checkedInById from ChannexSystemStaffService.
 *   7. SSE emit `channex:stay:created` or `channex:stay:conflict`.
 *
 * NOTE Stage 4 review: every step is in the production codepath — there is
 * NO certification UI or standalone script. The whole flow runs from the
 * outbox scheduler in normal operation.
 */
@Injectable()
export class BookingNewHandler {
  private readonly logger = new Logger(BookingNewHandler.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly notifications: NotificationsService,
    private readonly systemStaff: ChannexSystemStaffService,
    private readonly notif: ChannexNotifService,
  ) {}

  async handle(revision: ChannexBookingRevision): Promise<BookingNewResult> {
    // 1. Idempotency
    const existing = await this.prisma.guestStay.findUnique({
      where: { channexBookingId: revision.booking_id },
      select: {
        id: true,
        roomId: true,
        channexLastSyncAt: true,
        cancelledAt: true,
      },
    })

    if (existing) {
      // 2. Out-of-order guard
      const incomingTs = revision.inserted_at ? new Date(revision.inserted_at) : null
      if (
        incomingTs &&
        existing.channexLastSyncAt &&
        incomingTs.getTime() <= existing.channexLastSyncAt.getTime()
      ) {
        this.logger.debug(
          `[Channex bookingNew] stale revision for booking=${revision.booking_id} ` +
            `incoming=${incomingTs.toISOString()} stored=${existing.channexLastSyncAt.toISOString()}`,
        )
        return { kind: 'stale', stayId: existing.id }
      }
      // First-time revision but stay already exists → defer to modify handler in Day 4.
      // For Day 3 we just refresh the sync timestamp and return.
      await this.prisma.guestStay.update({
        where: { id: existing.id },
        data: { channexLastSyncAt: incomingTs ?? new Date() },
      })
      this.logger.debug(`[Channex bookingNew] already_exists booking=${revision.booking_id}`)
      return { kind: 'already_exists', stayId: existing.id }
    }

    // 3. Property resolution
    const property = await this.prisma.property.findUnique({
      where: { id: revision.property_id },
      select: {
        id: true,
        organizationId: true,
        settings: { select: { timezone: true } },
      },
    })
    if (!property) {
      this.logger.error(
        `[Channex bookingNew] property=${revision.property_id} not found in Zenix DB`,
      )
      return { kind: 'conflict', stayId: null, reason: 'PROPERTY_NOT_FOUND' }
    }

    // Audit C3 fail-fast: organizationId NOT NULL per schema (v1.0.5).
    // The previous `?? ''` fallback persisted GuestStays with empty org —
    // silent multi-tenancy break. Throw so the outbox retries and the
    // problem surfaces in logs instead of producing orphan rows.
    if (!property.organizationId) {
      throw new Error(
        `[Channex bookingNew] property=${property.id} has NULL organizationId — ` +
          `data integrity violation (Property.organizationId is required since v1.0.5)`,
      )
    }

    const organizationId = property.organizationId
    const timezone = property.settings?.timezone ?? 'America/Cancun'

    // Audit C1 — Multi-room bookings (Booking.com family/group reservations
    // bring 2+ rooms in the same revision). v1.0.0 doesn't yet model
    // journey-linked OTA stays — the previous code silently took only
    // rooms[0] and dropped the rest. We now route these to the conflict
    // queue with reason MULTI_ROOM_BOOKING so the SUPERVISOR creates the
    // additional stays manually. Real fix lands in v1.0.1 PAY-CORE which
    // implements multi-room → multi-stay-linked-via-StayJourney path.
    if ((revision.rooms?.length ?? 0) > 1) {
      this.logger.warn(
        `[Channex bookingNew] multi-room booking=${revision.booking_id} ` +
          `rooms=${revision.rooms.length} — routing to MULTI_ROOM_BOOKING conflict ` +
          `(v1.0.0 limitation, real fix in v1.0.1 PAY-CORE)`,
      )
      return this.persistConflict(
        revision,
        { id: property.id, organizationId },
        timezone,
        'MULTI_ROOM_BOOKING',
      )
    }

    // 4. Room resolution (single-room booking path)
    const roomTypeId = revision.rooms?.[0]?.room_type_id ?? null
    const ratePlanId = revision.rooms?.[0]?.rate_plan_id ?? null

    if (!roomTypeId) {
      this.logger.warn(
        `[Channex bookingNew] booking=${revision.booking_id} has no room_type_id (unmapped)`,
      )
      return this.persistConflict(revision, property, timezone, 'NO_ROOM_TYPE_MATCH')
    }

    if (!ratePlanId) {
      this.logger.warn(
        `[Channex bookingNew] booking=${revision.booking_id} has no rate_plan_id (unmapped)`,
      )
      return this.persistConflict(revision, property, timezone, 'UNMAPPED_RATE_PLAN')
    }

    const rooms = await this.prisma.room.findMany({
      where: { propertyId: property.id, channexRoomTypeId: roomTypeId, deletedAt: null },
      select: { id: true, number: true },
    })

    if (rooms.length === 0) {
      this.logger.warn(
        `[Channex bookingNew] no Zenix Room with channexRoomTypeId=${roomTypeId} ` +
          `for property=${property.id}`,
      )
      return this.persistConflict(revision, property, timezone, 'NO_ROOM_TYPE_MATCH')
    }

    // 5. Availability check — pick the first room that's free for the range.
    const checkIn = ChannexBookingMapper.combineDateAndHour(
      revision.arrival_date,
      revision.arrival_hour,
      timezone,
      'checkin',
    )
    const checkOut = ChannexBookingMapper.combineDateAndHour(
      revision.departure_date,
      '11:00',
      timezone,
      'checkout',
    )

    let chosenRoomId: string | null = null
    for (const room of rooms) {
      const result = await this.availability.check({
        roomId: room.id,
        from: checkIn,
        to: checkOut,
      })
      if (result.available) {
        chosenRoomId = room.id
        break
      }
    }

    if (!chosenRoomId) {
      this.logger.warn(
        `[Channex bookingNew] all ${rooms.length} rooms with type=${roomTypeId} ` +
          `unavailable for ${revision.arrival_date}..${revision.departure_date}`,
      )
      // Use the first room as a placeholder so we can persist the stay for
      // conflict review (D-CHX5). The roomId is fictional from an inventory
      // standpoint — flagged by channexConflict=true.
      return this.persistConflict(
        revision,
        property,
        timezone,
        'AVAILABILITY_OVERLAP',
        rooms[0].id,
      )
    }

    // 6. Map + create
    const checkedInById = await this.systemStaff.getOrCreate(property.id, organizationId)
    const data = ChannexBookingMapper.toGuestStayCreate({
      revision,
      propertyId: property.id,
      organizationId, // audit C3: validated non-null above
      propertyTimezone: timezone,
      roomId: chosenRoomId,
      channexConflict: false,
    })

    // Crear GuestStay + StayJourney + ORIGINAL StaySegment en MISMA tx.
    // Mirror del manual createStay (guest-stays.service.ts:282-309) —
    // sin esto la reserva OTA queda como "legacy stay sin journey":
    //   · Calendar SÍ la muestra (via staysWithoutJourneys filter)
    //   · Pero NO se puede mover via MoveRoomDialog journey path
    //   · NO se puede extender via extendNewRoom (necesita journey)
    //   · BookingCancelHandler journey cascade no se ejecuta
    // Day 3 audit gap detectado por la pregunta del owner 2026-05-22.
    const stay = await this.prisma.$transaction(async (tx) => {
      const created = await tx.guestStay.create({
        data: { ...data, checkedInById },
        select: { id: true, roomId: true, checkinAt: true, scheduledCheckout: true },
      })

      // StayJourney (1:1 con GuestStay para flujos uniformes)
      const journey = await tx.stayJourney.create({
        data: {
          organizationId,
          propertyId: property.id,
          guestName: data.guestName,
          guestEmail: data.guestEmail,
          guestStayId: created.id,
          journeyCheckIn: created.checkinAt,
          journeyCheckOut: created.scheduledCheckout,
        },
      })

      // ORIGINAL segment (status ACTIVE, reason ORIGINAL — mismo enum del flow manual)
      await tx.staySegment.create({
        data: {
          journeyId: journey.id,
          roomId: created.roomId,
          guestStayId: created.id,
          checkIn: created.checkinAt,
          checkOut: created.scheduledCheckout,
          status: 'ACTIVE',
          reason: 'ORIGINAL',
          rateSnapshot: new Prisma.Decimal(data.ratePerNight as Prisma.Decimal),
        },
      })

      return created
    })

    // 7. SSE — calendar listener (useRoomSSE) refresca al recibir esto
    this.notifications.emit(property.id, 'channex:stay:created', {
      stayId: stay.id,
      roomId: stay.roomId,
      bookingId: revision.booking_id,
      otaName: revision.ota_name ?? null,
      arrival: revision.arrival_date,
      departure: revision.departure_date,
    })

    this.logger.log(
      `[Channex bookingNew] created stay=${stay.id} room=${stay.roomId} ` +
        `booking=${revision.booking_id} ota=${revision.ota_name ?? '∅'}`,
    )
    return { kind: 'created', stayId: stay.id, roomId: stay.roomId }
  }

  /**
   * Persist a conflict stay (D-CHX5). channexConflict=true means the stay
   * shows up in the conflict review queue and the SUPERVISOR must resolve
   * manually (move room, cancel, or override). roomId is required by schema —
   * we use the first room of the matching type, or a placeholder when none
   * match (caller responsibility).
   */
  private async persistConflict(
    revision: ChannexBookingRevision,
    property: { id: string; organizationId: string },
    timezone: string,
    reason: ConflictReason,
    fallbackRoomId?: string,
  ): Promise<BookingNewResult> {
    // For NO_ROOM_TYPE_MATCH / UNMAPPED_RATE_PLAN we still need a roomId to
    // satisfy NOT NULL. Use the property's first non-deleted Room as a
    // placeholder. The conflict flag ensures inventory views don't treat it
    // as a real allocation.
    let roomId = fallbackRoomId
    if (!roomId) {
      const fallback = await this.prisma.room.findFirst({
        where: { propertyId: property.id, deletedAt: null },
        orderBy: { number: 'asc' },
        select: { id: true },
      })
      if (!fallback) {
        this.logger.error(
          `[Channex bookingNew] property=${property.id} has no rooms at all — cannot persist conflict`,
        )
        return { kind: 'conflict', stayId: null, reason }
      }
      roomId = fallback.id
    }

    const checkedInById = await this.systemStaff.getOrCreate(property.id, property.organizationId)
    const data = ChannexBookingMapper.toGuestStayCreate({
      revision,
      propertyId: property.id,
      organizationId: property.organizationId, // audit C3: caller (handle) validates non-null
      propertyTimezone: timezone,
      roomId,
      channexConflict: true,
    })

    let stayId: string | null = null
    try {
      const stay = await this.prisma.guestStay.create({
        data: {
          ...data,
          checkedInById,
          notes: [data.notes, `[Channex conflict] ${reason}`].filter(Boolean).join('\n'),
        },
        select: { id: true },
      })
      stayId = stay.id
    } catch (err) {
      // Unique constraint on channexBookingId might race — treat as already_exists.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const exists = await this.prisma.guestStay.findUnique({
          where: { channexBookingId: revision.booking_id },
          select: { id: true },
        })
        if (exists) stayId = exists.id
      } else {
        throw err
      }
    }

    this.notifications.emit(property.id, 'channex:stay:conflict', {
      stayId,
      bookingId: revision.booking_id,
      reason,
      otaName: revision.ota_name ?? null,
    })

    // Persist AppNotification so the SUPERVISOR bell/badge picks it up even
    // if SSE is offline (background tab, deploy in progress, etc.).
    if (property.organizationId) {
      await this.notif.raiseConflict({
        organizationId: property.organizationId,
        propertyId: property.id,
        stayId,
        bookingId: revision.booking_id,
        reason,
        otaName: revision.ota_name ?? null,
      })
    }

    this.logger.warn(
      `[Channex bookingNew] CONFLICT stay=${stayId} booking=${revision.booking_id} reason=${reason}`,
    )
    return { kind: 'conflict', stayId, reason }
  }
}
