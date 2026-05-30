import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { ChannexBookingRevision } from '../../channex.gateway'
import { AvailabilityService } from '../../../../pms/availability/availability.service'
import { NotificationsService } from '../../../../notifications/notifications.service'
import { PrismaService } from '../../../../prisma/prisma.service'
import { ChannexBookingMapper } from '../channex-booking.mapper'
import { ChannexSystemStaffService } from '../channex-system-staff.service'
import { BookingNewHandler } from './booking-new.handler'

export type BookingModifyResult =
  | { kind: 'updated'; stayId: string; restrictedToSafeFields: boolean }
  | { kind: 'created_as_new'; stayId: string } // out-of-order: modify arrived before new
  | { kind: 'stale'; stayId: string }
  | { kind: 'terminal'; stayId: string; reason: TerminalReason }
  | { kind: 'checked_in_review'; stayId: string } // requires human review
  | { kind: 'not_found'; bookingId: string }

export type TerminalReason = 'CANCELLED' | 'NO_SHOW' | 'CHECKED_OUT'

/**
 * BookingModifyHandler — D-CHX8 implementation.
 *
 * Channex emits `booking_modification` when the OTA reissues the booking
 * (date change, pax change, customer info update). Per Channex CRS docs:
 *   "Only changes are saved without reverting modifications made on the PMS side."
 * → Our policy mirrors that: we never overwrite hotel-side actions.
 *
 * Decision matrix:
 *   ┌─────────────────────────┬────────────────────────────────────────┐
 *   │ Stay state              │ Action                                  │
 *   ├─────────────────────────┼────────────────────────────────────────┤
 *   │ not found               │ Treat as new → BookingNewHandler        │
 *   │ stale (newer stored)    │ Skip                                    │
 *   │ cancelled               │ terminal — log + AppNotif               │
 *   │ no-show                 │ terminal — log + AppNotif               │
 *   │ checked-out             │ terminal — log + AppNotif               │
 *   │ checked-in (in-house)   │ Safe-fields only (notes, guest info).   │
 *   │                         │ Date/room change → AppNotif review.     │
 *   │ ARRIVING                │ Full update. Date change re-checks      │
 *   │                         │ availability excluding self.            │
 *   └─────────────────────────┴────────────────────────────────────────┘
 *
 * Cert Stage 4 alignment:
 *   - Production codepath (outbox → puller → handler), no test-only paths.
 *   - Ack ONLY after successful save (puller orders pull → save → ack).
 *   - Out-of-order safe via `inserted_at` comparison.
 */
@Injectable()
export class BookingModifyHandler {
  private readonly logger = new Logger(BookingModifyHandler.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly notifications: NotificationsService,
    private readonly systemStaff: ChannexSystemStaffService,
    private readonly bookingNew: BookingNewHandler,
  ) {}

  async handle(revision: ChannexBookingRevision): Promise<BookingModifyResult> {
    // Sprint CHECK-IN C2.2 (2026-05-29) — multi-room lookup §153-§154.
    // En grupos, channexBookingId vive en ReservationGroup. Cuando OTA emite
    // un modify del booking_id, aplicamos los cambios safe-field a TODAS las
    // stays del grupo (notes/guest contact). Cambios de fecha/room/precio en
    // multi-room generan AppNotif manual review (mismo guard que single).
    const existingGroup = await this.prisma.reservationGroup.findUnique({
      where: { channexBookingId: revision.booking_id },
      select: { id: true, stays: { select: { id: true } } },
    })
    if (existingGroup) {
      return this.handleGroupModify(existingGroup, revision)
    }

    const existing = await this.prisma.guestStay.findUnique({
      where: { channexBookingId: revision.booking_id },
      select: {
        id: true,
        organizationId: true,
        propertyId: true,
        roomId: true,
        channexLastSyncAt: true,
        cancelledAt: true,
        noShowAt: true,
        actualCheckin: true,
        actualCheckout: true,
        checkinAt: true,
        scheduledCheckout: true,
      },
    })

    // 1. Not found — Channex modify before new (out-of-order)
    if (!existing) {
      this.logger.warn(
        `[Channex modify] booking=${revision.booking_id} not found — ` +
          `creating as new (out-of-order recovery)`,
      )
      const newResult = await this.bookingNew.handle(revision)
      if (newResult.kind === 'created' || newResult.kind === 'already_exists') {
        return { kind: 'created_as_new', stayId: newResult.stayId }
      }
      // conflict path during new-fallback — surface as not_found so the outbox
      // marks SUCCEEDED (the conflict notif already fired from BookingNewHandler).
      return { kind: 'not_found', bookingId: revision.booking_id }
    }

    // 2. Stale guard (out-of-order)
    const incomingTs = revision.inserted_at ? new Date(revision.inserted_at) : null
    if (
      incomingTs &&
      existing.channexLastSyncAt &&
      incomingTs.getTime() <= existing.channexLastSyncAt.getTime()
    ) {
      this.logger.debug(
        `[Channex modify] stale revision booking=${revision.booking_id} ` +
          `incoming=${incomingTs.toISOString()} stored=${existing.channexLastSyncAt.toISOString()}`,
      )
      return { kind: 'stale', stayId: existing.id }
    }

    // 3. Terminal state guards
    if (existing.cancelledAt) {
      await this.emitTerminal(existing.propertyId, existing.id, revision, 'CANCELLED')
      return { kind: 'terminal', stayId: existing.id, reason: 'CANCELLED' }
    }
    if (existing.noShowAt) {
      await this.emitTerminal(existing.propertyId, existing.id, revision, 'NO_SHOW')
      return { kind: 'terminal', stayId: existing.id, reason: 'NO_SHOW' }
    }
    if (existing.actualCheckout) {
      await this.emitTerminal(existing.propertyId, existing.id, revision, 'CHECKED_OUT')
      return { kind: 'terminal', stayId: existing.id, reason: 'CHECKED_OUT' }
    }

    // 4. Property + timezone
    const property = await this.prisma.property.findUnique({
      where: { id: existing.propertyId },
      select: { id: true, organizationId: true, settings: { select: { timezone: true } } },
    })
    if (!property) {
      this.logger.error(`[Channex modify] property=${existing.propertyId} not found`)
      return { kind: 'not_found', bookingId: revision.booking_id }
    }
    const timezone = property.settings?.timezone ?? 'America/Cancun'

    // 5. Compute the incoming desired state
    const desired = ChannexBookingMapper.toGuestStayCreate({
      revision,
      propertyId: existing.propertyId,
      organizationId: existing.organizationId,
      propertyTimezone: timezone,
      roomId: existing.roomId,
      channexConflict: false,
    })

    // 6. Checked-in path → SAFE FIELDS ONLY
    if (existing.actualCheckin) {
      const datesChanged =
        existing.scheduledCheckout.getTime() !== (desired.scheduledCheckout as Date).getTime() ||
        existing.checkinAt.getTime() !== (desired.checkinAt as Date).getTime()

      // Apply non-destructive updates (notes, guest contact, OTA metadata)
      await this.prisma.guestStay.update({
        where: { id: existing.id },
        data: {
          guestName: desired.guestName,
          guestEmail: desired.guestEmail,
          guestPhone: desired.guestPhone,
          nationality: desired.nationality,
          notes: desired.notes,
          channexLastSyncAt: incomingTs ?? new Date(),
          channexOtaName: desired.channexOtaName,
          // Date / room / pricing changes are NOT applied post-checkin (would
          // corrupt audit + payment trail). Surface for human review.
        },
      })

      if (datesChanged) {
        await this.emitReviewRequired(existing.propertyId, existing.id, revision, 'DATE_CHANGE_POST_CHECKIN')
      }

      this.logger.log(
        `[Channex modify] safe-fields-only update stay=${existing.id} datesChanged=${datesChanged}`,
      )
      return { kind: 'updated', stayId: existing.id, restrictedToSafeFields: true }
    }

    // 7. ARRIVING path → date change requires availability re-check (excluding self)
    const newCheckIn = desired.checkinAt as Date
    const newCheckOut = desired.scheduledCheckout as Date

    const dateChanged =
      existing.scheduledCheckout.getTime() !== newCheckOut.getTime() ||
      existing.checkinAt.getTime() !== newCheckIn.getTime()

    if (dateChanged && existing.roomId) {
      const result = await this.availability.check({
        roomId: existing.roomId,
        from: newCheckIn,
        to: newCheckOut,
        excludeStayIds: [existing.id],
      })
      if (!result.available) {
        // Date change conflicts with another stay in same room. Don't lose the
        // modify — flag for SUPERVISOR to relocate.
        await this.prisma.guestStay.update({
          where: { id: existing.id },
          data: {
            channexConflict: true,
            channexLastSyncAt: incomingTs ?? new Date(),
          },
        })
        await this.emitReviewRequired(
          existing.propertyId,
          existing.id,
          revision,
          'DATE_CHANGE_OVERLAPS_OTHER_STAY',
        )
        this.logger.warn(
          `[Channex modify] date change conflicts for stay=${existing.id} — marked channexConflict`,
        )
        return { kind: 'updated', stayId: existing.id, restrictedToSafeFields: false }
      }
    }

    // 8. Apply full update — but DO NOT reset payment fields if the hotel
    //    already collected money locally (USALI append-only spirit + §28).
    //    Safe fields rewritten from revision; financial fields only refreshed
    //    when there's a delta and PMS hasn't taken payment (amountPaid == 0).
    const stay = await this.prisma.guestStay.findUnique({
      where: { id: existing.id },
      select: { amountPaid: true, paymentModel: true },
    })
    const pmsHasCollected = stay ? new Prisma.Decimal(stay.amountPaid).greaterThan(0) : false

    await this.prisma.guestStay.update({
      where: { id: existing.id },
      data: {
        guestName: desired.guestName,
        guestEmail: desired.guestEmail,
        guestPhone: desired.guestPhone,
        nationality: desired.nationality,
        paxCount: desired.paxCount,
        checkinAt: desired.checkinAt,
        scheduledCheckout: desired.scheduledCheckout,
        notes: desired.notes,
        channexLastSyncAt: incomingTs ?? new Date(),
        channexOtaName: desired.channexOtaName,
        ...(pmsHasCollected
          ? {}
          : {
              ratePerNight: desired.ratePerNight,
              totalAmount: desired.totalAmount,
              currency: desired.currency,
              paymentModel: desired.paymentModel,
              ...(desired.paymentModel === 'OTA_COLLECT'
                ? { paymentStatus: 'PAID', amountPaid: desired.totalAmount }
                : {}),
            }),
        // Lead days re-computed by mapper, refresh
        bookingLeadDays: desired.bookingLeadDays,
      },
    })

    this.notifications.emit(existing.propertyId, 'channex:stay:modified', {
      stayId: existing.id,
      bookingId: revision.booking_id,
      datesChanged: dateChanged,
      otaName: revision.ota_name ?? null,
    })

    this.logger.log(
      `[Channex modify] updated stay=${existing.id} datesChanged=${dateChanged} pmsCollected=${pmsHasCollected}`,
    )
    return { kind: 'updated', stayId: existing.id, restrictedToSafeFields: false }
  }

  /**
   * Sprint CHECK-IN C2.2 (2026-05-29) — group modify §154.
   * Aplicamos safe-fields (notes, guest info, OTA metadata) a CADA stay del
   * grupo, usando el `roomIndex` correspondiente del array Channex. Cambios
   * de fecha/room/pricing en multi-room son non-trivial (cada room puede
   * cambiar independientemente) y se difieren a manual review para v1.0.0.
   */
  private async handleGroupModify(
    group: { id: string; stays: Array<{ id: string }> },
    revision: ChannexBookingRevision,
  ): Promise<BookingModifyResult> {
    const incomingTs = revision.inserted_at ? new Date(revision.inserted_at) : new Date()

    // Pull cada stay con su groupRoomIndex para reaplicar mapper roomIndex.
    const stays = await this.prisma.guestStay.findMany({
      where: { reservationGroupId: group.id },
      select: {
        id: true,
        organizationId: true,
        propertyId: true,
        roomId: true,
        groupRoomIndex: true,
        cancelledAt: true,
        noShowAt: true,
        actualCheckin: true,
        actualCheckout: true,
      },
      orderBy: { groupRoomIndex: 'asc' },
    })

    // Property timezone — usar la primera stay activa (todas son misma property).
    const firstStay = stays[0]
    if (!firstStay) {
      return { kind: 'not_found', bookingId: revision.booking_id }
    }
    const property = await this.prisma.property.findUnique({
      where: { id: firstStay.propertyId },
      select: { settings: { select: { timezone: true } } },
    })
    const timezone = property?.settings?.timezone ?? 'America/Cancun'

    let updatedCount = 0
    for (const stay of stays) {
      if (stay.cancelledAt || stay.noShowAt || stay.actualCheckout) continue
      // roomIndex = groupRoomIndex - 1 (groupRoomIndex es 1-based)
      const roomIndex = Math.max(0, (stay.groupRoomIndex ?? 1) - 1)
      const desired = ChannexBookingMapper.toGuestStayCreate({
        revision,
        propertyId: stay.propertyId,
        organizationId: stay.organizationId,
        propertyTimezone: timezone,
        roomId: stay.roomId,
        channexConflict: false,
        roomIndex,
        omitChannexBookingId: true, // mantener null en stays de grupo
      })

      await this.prisma.guestStay.update({
        where: { id: stay.id },
        data: {
          guestName: desired.guestName,
          guestEmail: desired.guestEmail,
          guestPhone: desired.guestPhone,
          nationality: desired.nationality,
          notes: desired.notes,
          channexLastSyncAt: incomingTs,
          channexOtaName: desired.channexOtaName,
        },
      })
      updatedCount++
    }

    this.notifications.emit(firstStay.propertyId, 'channex:group:modified', {
      groupId: group.id,
      bookingId: revision.booking_id,
      otaName: revision.ota_name ?? null,
      updatedCount,
    })

    this.logger.log(
      `[Channex modify] group=${group.id} safe-fields updated stays=${updatedCount} ` +
        `booking=${revision.booking_id}`,
    )
    return { kind: 'updated', stayId: firstStay.id, restrictedToSafeFields: true }
  }

  private async emitTerminal(
    propertyId: string,
    stayId: string,
    revision: ChannexBookingRevision,
    reason: TerminalReason,
  ): Promise<void> {
    this.notifications.emit(propertyId, 'channex:stay:conflict', {
      stayId,
      bookingId: revision.booking_id,
      reason: `MODIFY_ON_${reason}`,
      otaName: revision.ota_name ?? null,
    })
    // Still refresh sync timestamp so we don't process the same revision twice.
    await this.prisma.guestStay.update({
      where: { id: stayId },
      data: {
        channexLastSyncAt: revision.inserted_at ? new Date(revision.inserted_at) : new Date(),
      },
    })
  }

  private async emitReviewRequired(
    propertyId: string,
    stayId: string,
    revision: ChannexBookingRevision,
    reason: string,
  ): Promise<void> {
    this.notifications.emit(propertyId, 'channex:stay:conflict', {
      stayId,
      bookingId: revision.booking_id,
      reason,
      otaName: revision.ota_name ?? null,
    })
  }
}
