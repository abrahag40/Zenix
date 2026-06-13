import { Injectable, Logger } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { ChannexBookingRevision, ChannexBookingRevisionRoom } from '../../channex.gateway'
import { AvailabilityService } from '../../../../pms/availability/availability.service'
import { NotificationsService } from '../../../../notifications/notifications.service'
import { PrismaService } from '../../../../prisma/prisma.service'
import { ChannexBookingMapper } from '../channex-booking.mapper'
import { ChannexNotifService } from '../channex-notif.service'
import { ChannexSystemStaffService } from '../channex-system-staff.service'
import { titleCase } from '../../../../common/utils/title-case.util'

export type BookingNewResult =
  | { kind: 'created'; stayId: string; roomId: string }
  | { kind: 'conflict'; stayId: string | null; reason: ConflictReason }
  | { kind: 'already_exists'; stayId: string }
  | { kind: 'stale'; stayId: string }
  // CHECK-IN C2.2 — multi-room creates a ReservationGroup with N child stays.
  // `hasConflicts` true cuando al menos una de las stays quedó channexConflict=true.
  | { kind: 'group_created'; groupId: string; stayIds: string[]; hasConflicts: boolean }
  | { kind: 'group_exists'; groupId: string; stayIds: string[] }

export type ConflictReason =
  | 'NO_ROOM_TYPE_MATCH' // Channex room_type_id not mapped to any Zenix Room
  | 'AVAILABILITY_OVERLAP' // overlaps with existing GuestStay/Segment/Block
  | 'PROPERTY_NOT_FOUND' // Channex sent property_id we don't know
  | 'UNMAPPED_RATE_PLAN' // rate_plan_id null → cannot price, queue for human
  | 'MULTI_ROOM_BOOKING' // deprecated — kept for backward-compat audits

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
    private readonly events: EventEmitter2,
  ) {}

  async handle(revision: ChannexBookingRevision): Promise<BookingNewResult> {
    // 1a. Idempotency — ReservationGroup (CHECK-IN C2.2 multi-room).
    // El channexBookingId del grupo es UNIQUE; webhook replay de un grupo ya
    // ingestado retorna el conjunto de stays existente sin re-crear.
    const existingGroup = await this.prisma.reservationGroup.findUnique({
      where: { channexBookingId: revision.booking_id },
      select: { id: true, stays: { select: { id: true } } },
    })
    if (existingGroup) {
      this.logger.debug(
        `[Channex bookingNew] group already_exists booking=${revision.booking_id} ` +
          `group=${existingGroup.id} stays=${existingGroup.stays.length}`,
      )
      return {
        kind: 'group_exists',
        groupId: existingGroup.id,
        stayIds: existingGroup.stays.map((s) => s.id),
      }
    }

    // 1b. Idempotency — single-room GuestStay (legacy path).
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

    // Sprint CHECK-IN C2.2 (2026-05-29) — auto-detección OTA multi-room §153-§158.
    // Cuando rooms.length > 1 creamos UN ReservationGroup que agrega N stays
    // hijas (cada una con groupRoomIndex 1-based + reservationGroupId). Auto-
    // detección sin wizard — cero acción del recepcionista (Cloudbeds pattern,
    // diferencial vs Opera Block setup manual 15min).
    if ((revision.rooms?.length ?? 0) > 1) {
      return this.handleMultiRoom(revision, { id: property.id, organizationId }, timezone)
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

    // 8. Etapa A §A1 — emit event para escalación HK si el check-in es HOY
    // en la timezone de la property. BookingSameDayListener escucha y
    // upgradea CleaningTask PENDING/READY → URGENT + notif recamarista.
    // Resuelve el caso owner 2026-06-08: "son las 10am, llega una reserva
    // para hoy desde channex... debería ser prioritaria".
    this.events.emit('channex.booking.same-day-arrival', {
      stayId: stay.id,
      roomId: stay.roomId,
      propertyId: property.id,
      checkInIso: stay.checkinAt.toISOString(),
      otaName: revision.ota_name ?? null,
    })

    this.logger.log(
      `[Channex bookingNew] created stay=${stay.id} room=${stay.roomId} ` +
        `booking=${revision.booking_id} ota=${revision.ota_name ?? '∅'}`,
    )
    return { kind: 'created', stayId: stay.id, roomId: stay.roomId }
  }

  /**
   * Sprint CHECK-IN C2.2 (2026-05-29) — auto-detección multi-room §153-§158.
   *
   * Flujo:
   *  1. Para cada room del array Channex, resolver Zenix Room + conflict tag
   *     (NO_ROOM_TYPE_MATCH / UNMAPPED_RATE_PLAN / AVAILABILITY_OVERLAP / null).
   *  2. Si TODAS las rooms fallan resolver (no hay rooms en la property),
   *     fallback al persistConflict legacy NO_ROOM_TYPE_MATCH.
   *  3. Crear ReservationGroup + N GuestStays + N StayJourneys + N StaySegments
   *     en MISMO $transaction. UNIQUE(channexBookingId) en group da idempotency
   *     natural. Stays quedan con channexBookingId=null (omitChannexBookingId).
   *  4. Notif SUPERVISOR GROUP_BOOKING_RECEIVED + SSE channex:group:created.
   */
  private async handleMultiRoom(
    revision: ChannexBookingRevision,
    property: { id: string; organizationId: string },
    timezone: string,
  ): Promise<BookingNewResult> {
    const rooms = revision.rooms ?? []
    this.logger.log(
      `[Channex bookingNew] multi-room detected booking=${revision.booking_id} ` +
        `rooms=${rooms.length} — creating ReservationGroup`,
    )

    // Sanity: ¿la property tiene AL MENOS un Room? Sin rooms no hay placeholder.
    const propertyHasAnyRoom = await this.prisma.room.findFirst({
      where: { propertyId: property.id, deletedAt: null },
      select: { id: true },
    })
    if (!propertyHasAnyRoom) {
      this.logger.error(
        `[Channex bookingNew] property=${property.id} has no rooms — cannot persist multi-room group`,
      )
      return this.persistConflict(revision, property, timezone, 'NO_ROOM_TYPE_MATCH')
    }

    // 1. Resolver cada room → { zenixRoomId, conflict }
    type RoomResolution = {
      revisionRoom: ChannexBookingRevisionRoom
      roomId: string
      conflict: ConflictReason | null
    }

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

    const resolutions: RoomResolution[] = []
    for (const revisionRoom of rooms) {
      const roomTypeId = revisionRoom.room_type_id ?? null
      const ratePlanId = revisionRoom.rate_plan_id ?? null

      if (!roomTypeId) {
        resolutions.push({
          revisionRoom,
          roomId: propertyHasAnyRoom.id,
          conflict: 'NO_ROOM_TYPE_MATCH',
        })
        continue
      }
      if (!ratePlanId) {
        resolutions.push({
          revisionRoom,
          roomId: propertyHasAnyRoom.id,
          conflict: 'UNMAPPED_RATE_PLAN',
        })
        continue
      }

      const candidates = await this.prisma.room.findMany({
        where: { propertyId: property.id, channexRoomTypeId: roomTypeId, deletedAt: null },
        select: { id: true, number: true },
      })

      if (candidates.length === 0) {
        resolutions.push({
          revisionRoom,
          roomId: propertyHasAnyRoom.id,
          conflict: 'NO_ROOM_TYPE_MATCH',
        })
        continue
      }

      // Excluir rooms ya elegidas en este mismo grupo (evita asignar la misma
      // habitación a 2 stays del mismo booking).
      const alreadyChosen = new Set(
        resolutions.filter((r) => r.conflict === null).map((r) => r.roomId),
      )
      let chosen: string | null = null
      for (const candidate of candidates) {
        if (alreadyChosen.has(candidate.id)) continue
        const avail = await this.availability.check({
          roomId: candidate.id,
          from: checkIn,
          to: checkOut,
        })
        if (avail.available) {
          chosen = candidate.id
          break
        }
      }

      if (!chosen) {
        resolutions.push({
          revisionRoom,
          roomId: candidates[0].id,
          conflict: 'AVAILABILITY_OVERLAP',
        })
      } else {
        resolutions.push({ revisionRoom, roomId: chosen, conflict: null })
      }
    }

    // 2. Datos del titular (común al grupo)
    const primaryFirst = titleCase(revision.customer?.name ?? '')
    const primaryLast = titleCase(revision.customer?.surname ?? '')
    const primaryGuestName =
      `${primaryFirst} ${primaryLast}`.trim() ||
      (revision.ota_reservation_code ? `Huésped ${revision.ota_reservation_code}` : 'Huésped sin nombre')

    // groupSize = sumamos adults+children de cada room.occupancy. Fallback:
    // si los rooms no traen occupancy individual, usar revision.occupancy o
    // sumar guests.length por room.
    let groupSize = 0
    for (const r of rooms) {
      if (r.occupancy) {
        groupSize += Math.max(0, r.occupancy.adults) + Math.max(0, r.occupancy.children)
      } else if (r.guests && r.guests.length > 0) {
        groupSize += r.guests.length
      }
    }
    if (groupSize === 0) {
      // fallback a global occupancy o N rooms (1 persona min por hab)
      groupSize =
        (revision.occupancy?.adults ?? 0) + (revision.occupancy?.children ?? 0) || rooms.length
    }

    const checkedInById = await this.systemStaff.getOrCreate(property.id, property.organizationId)

    // 3. Crear group + N stays/journeys/segments en MISMA tx
    let groupId: string
    let stayIds: string[] = []
    // BUG-11 fix (2026-06-08) — capturar metadata per child para emitir
    // `channex.booking.same-day-arrival` por cada uno (en lugar de solo
    // single-stay path). Sin esto, una reserva multi-room que cae HOY
    // no escala las CleaningTasks de las rooms hijas.
    let createdChildren: Array<{ id: string; roomId: string; checkinAt: Date; isConflict: boolean }> = []
    let hasConflicts = false
    try {
      const txResult = await this.prisma.$transaction(async (tx) => {
        const group = await tx.reservationGroup.create({
          data: {
            organizationId: property.organizationId,
            propertyId: property.id,
            channexBookingId: revision.booking_id,
            channexOtaName: revision.ota_name ?? null,
            otaReservationCode: revision.ota_reservation_code ?? null,
            primaryGuestName,
            primaryGuestEmail: revision.customer?.mail ?? null,
            primaryGuestPhone: revision.customer?.phone ?? null,
            groupSize,
            roomCount: rooms.length,
            groupCheckIn: checkIn,
            groupCheckOut: checkOut,
          },
          select: { id: true },
        })

        const createdStayIds: string[] = []
        const childrenMeta: Array<{ id: string; roomId: string; checkinAt: Date; isConflict: boolean }> = []
        for (let i = 0; i < resolutions.length; i++) {
          const res = resolutions[i]
          const isConflict = res.conflict !== null
          if (isConflict) hasConflicts = true

          const data = ChannexBookingMapper.toGuestStayCreate({
            revision,
            propertyId: property.id,
            organizationId: property.organizationId,
            propertyTimezone: timezone,
            roomId: res.roomId,
            channexConflict: isConflict,
            roomIndex: i,
            omitChannexBookingId: true, // group carga el booking_id
          })

          const created = await tx.guestStay.create({
            data: {
              ...data,
              checkedInById,
              reservationGroupId: group.id,
              groupRoomIndex: i + 1, // 1-based
              notes: isConflict
                ? [data.notes, `[Channex group conflict] ${res.conflict}`]
                    .filter(Boolean)
                    .join('\n')
                : data.notes,
            },
            select: { id: true, checkinAt: true, scheduledCheckout: true, roomId: true },
          })

          const journey = await tx.stayJourney.create({
            data: {
              organizationId: property.organizationId,
              propertyId: property.id,
              guestName: data.guestName,
              guestEmail: data.guestEmail,
              guestStayId: created.id,
              journeyCheckIn: created.checkinAt,
              journeyCheckOut: created.scheduledCheckout,
            },
          })

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

          createdStayIds.push(created.id)
          childrenMeta.push({
            id: created.id,
            roomId: created.roomId,
            checkinAt: created.checkinAt,
            isConflict,
          })
        }

        return { groupId: group.id, stayIds: createdStayIds, childrenMeta }
      })
      groupId = txResult.groupId
      stayIds = txResult.stayIds
      createdChildren = txResult.childrenMeta
    } catch (err) {
      // Race: webhook duplicado entre 1a (findUnique) y create.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.prisma.reservationGroup.findUnique({
          where: { channexBookingId: revision.booking_id },
          select: { id: true, stays: { select: { id: true } } },
        })
        if (existing) {
          return {
            kind: 'group_exists',
            groupId: existing.id,
            stayIds: existing.stays.map((s) => s.id),
          }
        }
      }
      throw err
    }

    // 4. SSE para que el calendar refresque la bracket visual del grupo
    this.notifications.emit(property.id, 'channex:group:created', {
      groupId,
      stayIds,
      bookingId: revision.booking_id,
      otaName: revision.ota_name ?? null,
      roomCount: rooms.length,
      hasConflicts,
    })

    // 5. Notif SUPERVISOR (§158 — priority adaptativa)
    try {
      await this.notif.raiseGroupBookingReceived({
        organizationId: property.organizationId,
        propertyId: property.id,
        groupId,
        bookingId: revision.booking_id,
        otaName: revision.ota_name ?? null,
        primaryGuestName,
        groupSize,
        roomCount: rooms.length,
        groupCheckIn: checkIn,
        hasConflicts,
      })
    } catch (err) {
      this.logger.warn(
        `[Channex bookingNew] group notif failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    // BUG-11 fix (2026-06-08) — same-day-arrival emit per child stay del
    // group. Solo emitimos por non-conflict children (los conflict van a
    // placeholder room sin task real). Idempotente — el listener detecta
    // task ya URGENT y no doble-escala. Mismo pipeline que single-stay
    // path (line ~307).
    for (const child of createdChildren) {
      if (child.isConflict) continue
      this.events.emit('channex.booking.same-day-arrival', {
        stayId: child.id,
        roomId: child.roomId,
        propertyId: property.id,
        checkInIso: child.checkinAt.toISOString(),
        otaName: revision.ota_name ?? null,
      })
    }

    this.logger.log(
      `[Channex bookingNew] group=${groupId} created with ${stayIds.length} stays ` +
        `booking=${revision.booking_id} conflicts=${hasConflicts}`,
    )
    return { kind: 'group_created', groupId, stayIds, hasConflicts }
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
