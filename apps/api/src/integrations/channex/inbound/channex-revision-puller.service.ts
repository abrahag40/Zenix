import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import {
  ChannexBookingRevision,
  ChannexGateway,
  ChannexHttpError,
} from '../channex.gateway'
import { BookingCancelHandler } from './handlers/booking-cancel.handler'
import { BookingModifyHandler } from './handlers/booking-modify.handler'
import { BookingNewHandler } from './handlers/booking-new.handler'
import { ChannexNotifService } from './channex-notif.service'

/**
 * Pull → save → ack orchestration for a single Channex outbox row.
 *
 * Flow (Day 2 scope — booking_new/modify/cancel handlers land Day 3):
 *   1. Mark outbox row IN_PROGRESS (lock).
 *   2. GET /booking_revisions/:id with user-api-key.
 *   3. Persist into Zenix domain (Day 3 — for now we log + store
 *      a denormalized snapshot on the audit log).
 *   4. POST /booking_revisions/:id/ack to Channex.
 *   5. Mark outbox SUCCEEDED.
 *
 * Failure handling:
 *   - 401/403 from Channex → DEAD_LETTER (api-key issue, requires human).
 *   - 404 from Channex → DEAD_LETTER (revision purged, won't reappear).
 *   - 429 → FAILED with backoff respecting Retry-After (D-CHX10 rate limit).
 *   - 5xx / network → FAILED, exp backoff 2^attempts seconds, max 5 attempts.
 *
 * Stage 4 cert mandates: NO retry storms, NO timer-based polling for the
 * same booking — the outbox row guarantees a single in-flight processor
 * (FOR UPDATE SKIP LOCKED in the scheduler).
 */
@Injectable()
export class ChannexRevisionPullerService {
  private readonly logger = new Logger(ChannexRevisionPullerService.name)
  private static readonly MAX_ATTEMPTS = 5

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ChannexGateway,
    private readonly bookingNew: BookingNewHandler,
    private readonly bookingModify: BookingModifyHandler,
    private readonly bookingCancel: BookingCancelHandler,
    private readonly notif: ChannexNotifService,
  ) {}

  /**
   * Process a single outbox row by id. Caller is responsible for locking
   * (the scheduler picks rows via FOR UPDATE SKIP LOCKED). Returns the
   * resulting status for logging.
   */
  async processOutboxRow(outboxId: string): Promise<{
    status: 'SUCCEEDED' | 'FAILED' | 'DEAD_LETTER' | 'SKIPPED'
    revision?: ChannexBookingRevision
    error?: string
  }> {
    const row = await this.prisma.channexOutbox.findUnique({
      where: { id: outboxId },
      select: {
        id: true,
        propertyId: true,
        eventType: true,
        channexRevisionId: true,
        attempts: true,
        status: true,
      },
    })
    if (!row) {
      this.logger.warn(`[Channex puller] outbox row ${outboxId} not found`)
      return { status: 'SKIPPED', error: 'not_found' }
    }
    if (row.status !== 'PENDING' && row.status !== 'FAILED') {
      this.logger.debug(`[Channex puller] outbox row ${outboxId} status=${row.status} — skip`)
      return { status: 'SKIPPED', error: `unexpected_status:${row.status}` }
    }

    if (!row.channexRevisionId) {
      // Bare event — sin revision_id. Tipos posibles:
      //   · availability_modify — confirmation de nuestro push (C2 fix audit)
      //   · channel_activate / channel_deactivate — OTA conectada/desconectada (C10)
      //   · non_acked_booking sin payload — feed scheduler lo recoge
      //
      // Cert audit C2 + C10: dispatch específico por eventType en vez de
      // marcar SUCCEEDED silente para todos.
      const eventType = row.eventType
      if (eventType === 'channel_deactivate') {
        // OTA desconectada = revenue impact crítico
        this.logger.warn(
          `[Channex puller] channel_deactivate property=${row.propertyId} — ` +
            `notifying SUPERVISOR for revenue investigation`,
        )
        // AppNotif fire-and-forget (no bloquea SUCCEEDED mark)
        await this.notifyChannelEvent(row.propertyId, eventType, 'high')
      } else if (eventType === 'channel_activate') {
        this.logger.log(
          `[Channex puller] channel_activate property=${row.propertyId} — ` +
            `OTA connected, will start receiving bookings`,
        )
        await this.notifyChannelEvent(row.propertyId, eventType, 'low')
      } else if (eventType === 'availability_modify') {
        // Confirmation de nuestro propio push — solo log
        this.logger.debug(
          `[Channex puller] availability_modify ack property=${row.propertyId} — ` +
            `our push was received successfully`,
        )
      }
      await this.markSucceeded(row.id, { revisionFetched: false, eventType })
      return { status: 'SUCCEEDED' }
    }

    // 1. mark IN_PROGRESS
    await this.markInProgress(row.id, row.attempts + 1)

    try {
      // 2. pull revision from Channex
      const revision = await this.gateway.getBookingRevision(row.channexRevisionId)
      this.logger.log(
        `[Channex puller] fetched revision=${revision.id} booking=${revision.booking_id} ` +
          `status=${revision.status} ota=${revision.ota_name ?? '∅'}`,
      )

      // 3. Dispatch to status-specific handler.
      //    Per Channex official: ack ONLY after we successfully saved the
      //    booking. If the handler throws, do NOT ack — the retry comes in
      //    via outbox backoff. This is the "ack on save" criterion in cert
      //    Stage 4.
      let handlerResultKind: string | undefined
      switch (revision.status) {
        case 'new': {
          const result = await this.bookingNew.handle(revision)
          handlerResultKind = result.kind
          break
        }
        case 'modified': {
          const result = await this.bookingModify.handle(revision)
          handlerResultKind = result.kind
          break
        }
        case 'cancelled': {
          const result = await this.bookingCancel.handle(revision)
          handlerResultKind = result.kind
          break
        }
        default: {
          this.logger.warn(
            `[Channex puller] revision=${revision.id} unknown status=${revision.status} — acking to drain`,
          )
          handlerResultKind = 'unknown_status'
        }
      }

      // 4. ack revision (idempotent — 422 means already acked)
      const ack = await this.gateway.ackBookingRevision(revision.id)
      this.logger.log(
        `[Channex puller] acked revision=${revision.id} alreadyAcked=${ack.alreadyAcked}`,
      )

      // 5. mark SUCCEEDED
      await this.markSucceeded(row.id, {
        revisionFetched: true,
        bookingStatus: revision.status,
        handlerResult: handlerResultKind,
      })
      return { status: 'SUCCEEDED', revision }
    } catch (err) {
      return this.handleError(row.id, row.attempts + 1, err)
    }
  }

  private async markInProgress(id: string, attempts: number): Promise<void> {
    await this.prisma.channexOutbox.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        attempts,
        lockedAt: new Date(),
        lockedBy: `${process.env.HOSTNAME ?? 'local'}:${process.pid}`,
      },
    })
  }

  /**
   * Cert audit C10 — notif al SUPERVISOR cuando Channex emite eventos de
   * channel lifecycle. `channel_deactivate` es revenue-critical (OTA
   * desconectada = no bookings) — priority high.
   */
  private async notifyChannelEvent(
    propertyId: string,
    eventType: string,
    severity: 'low' | 'high',
  ): Promise<void> {
    try {
      const property = await this.prisma.property.findUnique({
        where: { id: propertyId },
        select: { organizationId: true },
      })
      if (!property?.organizationId) return
      await this.notif.raiseConflict({
        organizationId: property.organizationId,
        propertyId,
        stayId: null,
        bookingId: null,
        reason: eventType === 'channel_deactivate' ? 'CHANNEL_DEACTIVATED' : 'CHANNEL_ACTIVATED',
        otaName: null,
        actionUrl: '/settings/channex',
      })
    } catch (err) {
      this.logger.warn(
        `[Channex puller] notifyChannelEvent failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }

  private async markSucceeded(id: string, meta: Record<string, unknown>): Promise<void> {
    await this.prisma.channexOutbox.update({
      where: { id },
      data: {
        status: 'SUCCEEDED',
        processedAt: new Date(),
        lastError: null,
        lockedAt: null,
        lockedBy: null,
      },
    })
    this.logger.debug(`[Channex puller] succeeded outbox=${id} meta=${JSON.stringify(meta)}`)
  }

  private async handleError(
    outboxId: string,
    attempts: number,
    err: unknown,
  ): Promise<{ status: 'FAILED' | 'DEAD_LETTER'; error: string }> {
    const msg = err instanceof Error ? err.message : String(err)
    const httpStatus = err instanceof ChannexHttpError ? err.status : null

    // Terminal errors → dead letter
    const terminal = httpStatus === 401 || httpStatus === 403 || httpStatus === 404
    const exhausted = attempts >= ChannexRevisionPullerService.MAX_ATTEMPTS

    if (terminal || exhausted) {
      await this.prisma.channexOutbox.update({
        where: { id: outboxId },
        data: {
          status: 'DEAD_LETTER',
          lastError: msg,
          processedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      })
      this.logger.error(
        `[Channex puller] DEAD_LETTER outbox=${outboxId} attempts=${attempts} ${terminal ? 'terminal' : 'exhausted'}: ${msg}`,
      )
      return { status: 'DEAD_LETTER', error: msg }
    }

    // Transient → backoff
    const backoffSeconds = Math.pow(2, attempts) // 2,4,8,16,32 — caps at attempt 5
    const nextAttemptAt = new Date(Date.now() + backoffSeconds * 1000)
    await this.prisma.channexOutbox.update({
      where: { id: outboxId },
      data: {
        status: 'FAILED',
        lastError: msg,
        nextAttemptAt,
        lockedAt: null,
        lockedBy: null,
      },
    })
    this.logger.warn(
      `[Channex puller] FAILED outbox=${outboxId} attempts=${attempts} retryIn=${backoffSeconds}s: ${msg}`,
    )
    return { status: 'FAILED', error: msg }
  }
}
