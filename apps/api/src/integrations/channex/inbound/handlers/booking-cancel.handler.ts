import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { ChannexBookingRevision } from '../../channex.gateway'
import { NotificationsService } from '../../../../notifications/notifications.service'
import { PrismaService } from '../../../../prisma/prisma.service'
import { ChannexSystemStaffService } from '../channex-system-staff.service'

export type BookingCancelResult =
  | { kind: 'cancelled'; stayId: string }
  | { kind: 'already_cancelled'; stayId: string } // idempotent
  | { kind: 'not_found'; bookingId: string } // already absent — Channex retry after our purge
  | { kind: 'manual_review'; stayId: string; reason: ManualReviewReason }

export type ManualReviewReason =
  | 'GUEST_ALREADY_CHECKED_IN'
  | 'STAY_ALREADY_CHECKED_OUT'
  | 'STAY_MARKED_NO_SHOW'

/**
 * BookingCancelHandler — D-CHX7 implementation.
 *
 * Channex emits `booking_cancellation` when the OTA (or the guest via OTA)
 * cancels the booking. We mirror the cancel-archive flow (§95-§98) using the
 * SOFT-DELETE policy:
 *   - cancelledAt / cancelledById / cancelInitiator='OTA' / cancelMetadata
 *   - cancelledFromChannel='CHANNEX_WEBHOOK'
 *   - cascade to StaySegment + StayJourney
 *   - audit row in GuestStayLog (event=CANCELLED)
 *   - free Room.status if applicable
 *   - requiresFiscalReview seeded for v1.0.2 CFDI E emission
 *
 * Decision matrix:
 *   ┌──────────────────────────┬─────────────────────────────────────────┐
 *   │ Stay state               │ Action                                   │
 *   ├──────────────────────────┼─────────────────────────────────────────┤
 *   │ not found                │ Idempotent: log + return success         │
 *   │ already cancelled        │ Idempotent: refresh syncAt + log         │
 *   │ checked in (in-house)    │ AppNotif SUPERVISOR — manual decision    │
 *   │ checked out (post-stay)  │ AppNotif — terminal, no rewind           │
 *   │ marked no-show           │ AppNotif — terminal, OTA chargeback win  │
 *   │ ARRIVING (default)       │ Soft cancel + cascade + SSE + AppNotif   │
 *   └──────────────────────────┴─────────────────────────────────────────┘
 *
 * Why NOT call GuestStaysService.cancelStay():
 *   That method reads orgId from JWT scope (TenantContextService) — we have
 *   no JWT in a webhook. To preserve single-responsibility we replicate the
 *   write path here using `existing.organizationId` directly. Same writes,
 *   same audit shape, no risk of regressing the manual path.
 */
@Injectable()
export class BookingCancelHandler {
  private readonly logger = new Logger(BookingCancelHandler.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly systemStaff: ChannexSystemStaffService,
  ) {}

  async handle(revision: ChannexBookingRevision): Promise<BookingCancelResult> {
    const existing = await this.prisma.guestStay.findUnique({
      where: { channexBookingId: revision.booking_id },
      include: {
        stayJourney: { select: { id: true } },
        room: { select: { id: true, status: true } },
      },
    })

    if (!existing) {
      // Channex retried for a booking we never created, or we already purged it.
      // Idempotent success — ack the revision to drain the queue.
      this.logger.warn(
        `[Channex cancel] booking=${revision.booking_id} not in Zenix DB — idempotent ack`,
      )
      return { kind: 'not_found', bookingId: revision.booking_id }
    }

    // Idempotent: already cancelled
    if (existing.cancelledAt) {
      await this.prisma.guestStay.update({
        where: { id: existing.id },
        data: {
          channexLastSyncAt: revision.inserted_at ? new Date(revision.inserted_at) : new Date(),
        },
      })
      this.logger.debug(`[Channex cancel] stay=${existing.id} already cancelled — refresh syncAt`)
      return { kind: 'already_cancelled', stayId: existing.id }
    }

    // Terminal states that require manual review
    if (existing.noShowAt) {
      await this.emitReview(existing.propertyId, existing.id, revision, 'STAY_MARKED_NO_SHOW')
      return { kind: 'manual_review', stayId: existing.id, reason: 'STAY_MARKED_NO_SHOW' }
    }
    if (existing.actualCheckout) {
      await this.emitReview(existing.propertyId, existing.id, revision, 'STAY_ALREADY_CHECKED_OUT')
      return { kind: 'manual_review', stayId: existing.id, reason: 'STAY_ALREADY_CHECKED_OUT' }
    }
    if (existing.actualCheckin) {
      // Guest in-house — OTA cancellation cannot retroactively dismiss the stay.
      // Supervisor decides: comp the stay, early-checkout, or dispute with OTA.
      await this.emitReview(existing.propertyId, existing.id, revision, 'GUEST_ALREADY_CHECKED_IN')
      return { kind: 'manual_review', stayId: existing.id, reason: 'GUEST_ALREADY_CHECKED_IN' }
    }

    // ARRIVING — perform soft cancel
    const systemActorId = await this.systemStaff.getOrCreate(
      existing.propertyId,
      existing.organizationId,
    )
    const now = new Date()
    const pmsCollectedAmount = new Prisma.Decimal(existing.amountPaid)
    const requiresFiscalReview = pmsCollectedAmount.greaterThan(0)

    const metadata: Prisma.InputJsonValue = {
      channexRevisionId: revision.id,
      channexBookingId: revision.booking_id,
      otaName: revision.ota_name ?? null,
      otaReservationCode: revision.ota_reservation_code ?? null,
      cancelledByOTA: true,
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.guestStay.update({
        where: { id: existing.id },
        data: {
          cancelledAt: now,
          cancelledById: systemActorId,
          cancelInitiator: 'OTA',
          cancelReason: `OTA-initiated cancellation${revision.ota_name ? ` via ${revision.ota_name}` : ''}`,
          cancelMetadata: metadata,
          cancelledFromChannel: 'CHANNEX_WEBHOOK',
          requiresFiscalReview,
          channexLastSyncAt: revision.inserted_at ? new Date(revision.inserted_at) : now,
        },
      })

      // Cascade to journey + segments
      if (existing.stayJourney?.id) {
        await tx.staySegment.updateMany({
          where: {
            journeyId: existing.stayJourney.id,
            status: { in: ['ACTIVE', 'PENDING'] },
          },
          data: { status: 'CANCELLED' },
        })
        await tx.stayJourney.update({
          where: { id: existing.stayJourney.id },
          data: { status: 'CANCELLED' },
        })
        await tx.stayJourneyEvent.create({
          data: {
            journeyId: existing.stayJourney.id,
            eventType: 'CANCELLED',
            actorId: systemActorId,
            payload: {
              cancelInitiator: 'OTA',
              channexRevisionId: revision.id,
            },
          },
        })
      }

      // Free room if it was held for this stay and no other actives remain
      if (existing.room.status === 'OCCUPIED') {
        const othersActive = await tx.guestStay.count({
          where: {
            roomId: existing.roomId,
            organizationId: existing.organizationId,
            deletedAt: null,
            actualCheckout: null,
            noShowAt: null,
            cancelledAt: null,
            id: { not: existing.id },
          },
        })
        if (othersActive === 0) {
          await tx.room.update({ where: { id: existing.roomId }, data: { status: 'AVAILABLE' } })
        }
      }

      // Audit append-only — §28 PaymentLog pattern, §95 GuestStayLog
      await tx.guestStayLog.create({
        data: {
          stayId: existing.id,
          event: 'CANCELLED',
          actorId: systemActorId,
          actorType: 'SYSTEM',
          metadata: {
            initiator: 'OTA',
            cancelledFromChannel: 'CHANNEX_WEBHOOK',
            requiresFiscalReview,
            channexRevisionId: revision.id,
            otaName: revision.ota_name ?? null,
            otaReservationCode: revision.ota_reservation_code ?? null,
          },
        },
      })
    })

    this.notifications.emit(existing.propertyId, 'channex:stay:cancelled', {
      stayId: existing.id,
      bookingId: revision.booking_id,
      otaName: revision.ota_name ?? null,
      requiresFiscalReview,
    })

    this.logger.log(
      `[Channex cancel] cancelled stay=${existing.id} booking=${revision.booking_id} ` +
        `ota=${revision.ota_name ?? '∅'} fiscalReview=${requiresFiscalReview}`,
    )
    return { kind: 'cancelled', stayId: existing.id }
  }

  private async emitReview(
    propertyId: string,
    stayId: string,
    revision: ChannexBookingRevision,
    reason: ManualReviewReason,
  ): Promise<void> {
    this.notifications.emit(propertyId, 'channex:stay:conflict', {
      stayId,
      bookingId: revision.booking_id,
      reason: `CANCEL_${reason}`,
      otaName: revision.ota_name ?? null,
    })
    // Refresh sync timestamp so the same revision isn't re-processed.
    await this.prisma.guestStay.update({
      where: { id: stayId },
      data: {
        channexLastSyncAt: revision.inserted_at ? new Date(revision.inserted_at) : new Date(),
      },
    })
    this.logger.warn(
      `[Channex cancel] MANUAL_REVIEW stay=${stayId} reason=${reason} ota=${revision.ota_name ?? '∅'}`,
    )
  }
}
