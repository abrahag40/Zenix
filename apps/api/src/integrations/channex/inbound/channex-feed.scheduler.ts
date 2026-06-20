import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../prisma/prisma.service'
import { ChannexGateway, ChannexHttpError } from '../channex.gateway'
import { ChannexInboundService } from './channex-inbound.service'

/**
 * ChannexFeedScheduler — D-CHX6 reconciliation via /booking_revisions/feed.
 *
 * Per Channex official guidance (PMS Integration Guide, 2024-12 update):
 *   "For the pull method, Channex recommends polling the Booking Revisions
 *    Feed API for all properties in ONE call every 15–20 minutes."
 *
 * Why this exists alongside webhooks:
 *   1. Webhook delivery failures (network blip, restart, deploy) leave
 *      revisions unacked. The feed returns ALL unacked revisions until we
 *      ack them — pulling guarantees we catch up.
 *   2. Channex emits `non_acked_booking` if a revision is not acked within
 *      30 min. That event triggers the same recovery, but the cron is a
 *      defense-in-depth safety net (Cert Stage 4 cita: "we ack within ~3min
 *      and have a periodic feed sweep").
 *   3. Stage 4 cert specifically asks: "Show your recovery mechanism if a
 *      webhook is lost." Answer: this scheduler.
 *
 * Design:
 *   - Cron every 15 min UTC (single call serves all properties accessible
 *     by the api-key — no per-property fan-out).
 *   - Paginated iteration with `order[inserted_at]=asc` so we process oldest
 *     first (matches Channex recommendation for ordering).
 *   - Each revision is enqueued via ChannexInboundService.acceptDelivery,
 *     which has dedup against the outbox — same row twice is harmless.
 *   - Updates PropertySettings.channexPullLastRunAt per affected property
 *     (operational metric + dashboard visibility).
 *   - Safe limit: 100 pages × 50 per page = 5000 revisions max per tick.
 *     If more, we stop and the next tick continues (no risk of looping
 *     forever on a corrupt feed).
 *
 * Idempotency / cost:
 *   - The feed only returns UNACKED revisions. Once the puller acks, they
 *     disappear from subsequent pulls. So normal-state cost is ~1 HTTP call
 *     returning {data: []} every 15 min — negligible.
 *
 * Rate limits:
 *   - `booking_revisions/feed` isn't subject to the 20 ARI/min limit (that's
 *     for ARI endpoints). Documented as safe to poll every 15-20 min.
 */
@Injectable()
export class ChannexFeedScheduler {
  private readonly logger = new Logger(ChannexFeedScheduler.name)
  private static readonly PAGE_SIZE = 50
  private static readonly MAX_PAGES_PER_TICK = 100
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ChannexGateway,
    private readonly inbound: ChannexInboundService,
  ) {}

  // Cert audit A6 fix (2026-05-22): docs oficiales Channex 2024-12 recomiendan
  // 15-20 min polling. Estábamos en 30 min — fuera del rango. Bajamos a 15
  // para cumplir literal. Costo extra: ~1 HTTP call extra cada hora en
  // estado normal (feed empty), negligible.
  // NestJS schedule no expone EVERY_15_MINUTES — usamos cron string raw.
  @Cron('*/15 * * * *', { name: 'channex-feed-reconciliation' })
  async runScheduled(): Promise<void> {
    await this.run({ source: 'cron' })
  }

  /**
   * Public entry point — also callable from admin actions / specs.
   * Returns counts so callers (and tests) can verify behavior.
   */
  async run(opts: { source: 'cron' | 'manual' }): Promise<FeedReconciliationResult> {
    if (!this.gateway.enabled) {
      this.logger.debug('[Channex feed] gateway disabled — skip')
      return makeEmptyResult()
    }
    if (this.running) {
      this.logger.warn('[Channex feed] previous tick still running — skip')
      return makeEmptyResult()
    }
    this.running = true

    const startedAt = Date.now()
    const result: FeedReconciliationResult = makeEmptyResult()
    const propertiesTouched = new Set<string>()

    try {
      let totalSeenInThisTick = 0
      for (let page = 1; page <= ChannexFeedScheduler.MAX_PAGES_PER_TICK; page++) {
        const { revisions, meta } = await this.gateway.listBookingRevisionsFeed({
          page,
          limit: ChannexFeedScheduler.PAGE_SIZE,
        })

        if (revisions.length === 0) break

        for (const revision of revisions) {
          const outcome = await this.processOne(revision)
          result.revisionsSeen += 1
          if (outcome === 'enqueued') result.revisionsEnqueued += 1
          else if (outcome === 'deduped') result.revisionsDeduped += 1
          else if (outcome === 'orphan_property') result.orphanProperties += 1
          else if (outcome === 'error') result.errors += 1
          if (revision.property_id) propertiesTouched.add(revision.property_id)
        }

        totalSeenInThisTick += revisions.length

        // Stop when EITHER:
        //   (a) we received a short page (revisions.length < PAGE_SIZE) — by
        //       Channex API shape, only the last page can be short. OR
        //   (b) running tally matches meta.total — we've consumed the feed
        //       snapshot reported by the server.
        // Both signals are needed: short-page is fast (saves an HTTP call),
        // meta.total catches the edge where the last page happens to be full.
        if (
          revisions.length < ChannexFeedScheduler.PAGE_SIZE ||
          totalSeenInThisTick >= meta.total
        ) {
          break
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const status = err instanceof ChannexHttpError ? err.status : null
      this.logger.error(
        `[Channex feed] tick failed source=${opts.source} status=${status ?? 'N/A'}: ${msg}`,
      )
      result.errors += 1
      // Continue to mark pull timestamps for whatever we processed before the throw.
    } finally {
      this.running = false
    }

    // Update PropertySettings.channexPullLastRunAt for properties we saw.
    if (propertiesTouched.size > 0) {
      const now = new Date()
      await this.prisma.propertySettings.updateMany({
        where: { propertyId: { in: Array.from(propertiesTouched) } },
        data: { channexPullLastRunAt: now },
      })
    }

    const durationMs = Date.now() - startedAt
    this.logger.log(
      `[Channex feed] tick source=${opts.source} ` +
        `seen=${result.revisionsSeen} enqueued=${result.revisionsEnqueued} ` +
        `deduped=${result.revisionsDeduped} orphans=${result.orphanProperties} ` +
        `errors=${result.errors} properties=${propertiesTouched.size} ` +
        `durationMs=${durationMs}`,
    )

    result.durationMs = durationMs
    result.propertiesTouched = propertiesTouched.size
    return result
  }

  /**
   * Process a single revision: enqueue into outbox via ChannexInboundService
   * (which handles dedup). Returns the outcome for metrics.
   *
   * Critical: we DO NOT ack here. The outbox scheduler picks up the row and
   * runs the puller, which does pull-then-handler-then-ack (the same path
   * webhooks use). Single canonical processing flow → simpler to certify.
   */
  private async processOne(
    revision: ChannexBookingRevisionSummary,
  ): Promise<'enqueued' | 'deduped' | 'orphan_property' | 'error'> {
    try {
      // Verify the property is known to Zenix. If not, orphan — the api-key
      // sees a property we don't have a mapping for. Log + skip (manual op).
      // CHANNEX-CERT-FIX (2026-06-20): `revision.property_id` es el UUID de
      // Channex, NO el id local. Hay que resolver por `channexPropertyId`
      // (mismo mapeo que §190/D-CHX-FIX-1). Antes usaba `propertyId:` →
      // orphaneaba TODA reserva OTA real de una propiedad mapeada vía Channex.
      // El downstream (puller) traduce channex→local, por eso acceptDelivery
      // sigue recibiendo `revision.property_id` crudo.
      const settings = await this.prisma.propertySettings.findFirst({
        where: { channexPropertyId: revision.property_id },
        select: { propertyId: true },
      })
      if (!settings) {
        this.logger.warn(
          `[Channex feed] orphan property=${revision.property_id} ` +
            `revision=${revision.id} — skipping (no PropertySettings row in Zenix)`,
        )
        return 'orphan_property'
      }

      // Synthesize a webhook-equivalent envelope and call acceptDelivery.
      // The signatureValid flag is false (we have no bearer — this came from
      // our own pull, not a Channex POST), and result='pending' as usual.
      // Dedup inside acceptDelivery skips if outbox already has the revision.
      const envelope: Prisma.JsonObject = {
        event: 'feed_recovery',
        property_id: revision.property_id,
        payload: {
          booking_id: revision.booking_id,
          revision_id: revision.id,
        },
        source: 'channex_feed_scheduler',
      }

      const { outboxId } = await this.inbound.acceptDelivery({
        propertyId: revision.property_id,
        eventType: 'feed_recovery',
        channexBookingId: revision.booking_id,
        channexRevisionId: revision.id,
        payload: envelope,
        signatureValid: false,
      })

      return outboxId ? 'enqueued' : 'deduped'
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(
        `[Channex feed] processOne failed revision=${revision.id}: ${msg}`,
      )
      return 'error'
    }
  }
}

interface ChannexBookingRevisionSummary {
  id: string
  property_id: string
  booking_id: string
  status: string
}

export interface FeedReconciliationResult {
  revisionsSeen: number
  revisionsEnqueued: number
  revisionsDeduped: number
  orphanProperties: number
  errors: number
  propertiesTouched: number
  durationMs: number
}

function makeEmptyResult(): FeedReconciliationResult {
  return {
    revisionsSeen: 0,
    revisionsEnqueued: 0,
    revisionsDeduped: 0,
    orphanProperties: 0,
    errors: 0,
    propertiesTouched: 0,
    durationMs: 0,
  }
}
