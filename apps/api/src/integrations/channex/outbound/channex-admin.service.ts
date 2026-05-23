import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { ChannexTokenBucketService } from './channex-token-bucket.service'

/**
 * ChannexAdminService — observability snapshot del estado outbound + inbound.
 *
 * Usado por `/settings/channex` admin UI (SUPERVISOR-only) y por el cert
 * Stage 4 reviewer durante el live screenshare. Provee evidencia visual de:
 *
 *   1. Queue funciona (counts por status)
 *   2. Retry logic activo (FAILED rows con backoff)
 *   3. DEAD_LETTER visible (no silent drop — AP-2.3 mitigation)
 *   4. Rate limiter tracking (token bucket snapshot)
 *   5. Last successful sync timestamps (delta verification)
 *
 * **Why a separate service**: el controller queda thin (just routing).
 * Service hace los queries Prisma + token bucket inspect.
 */
@Injectable()
export class ChannexAdminService {
  private readonly logger = new Logger(ChannexAdminService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly bucket: ChannexTokenBucketService,
  ) {}

  /**
   * GET status snapshot per property. Cubre:
   *   · outbound queue counts (channex_outbound_queue)
   *   · inbound queue counts (channex_outbox)
   *   · webhook log counts last 24h
   *   · feed pull last run
   *   · full-sync last run
   *   · token bucket capacity remaining per kind
   *   · recent DEAD_LETTER rows con error msg
   *   · channex_conflict stays count
   */
  async getStatus(propertyId: string): Promise<ChannexAdminStatus> {
    const now = new Date()
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // Run all queries in parallel for speed (admin endpoint hit on UI load)
    const [
      outboundByStatus,
      inboundByStatus,
      webhookLogsCount,
      webhookLogsLast,
      conflictStays,
      deadLettersOutbound,
      deadLettersInbound,
      settings,
    ] = await Promise.all([
      this.prisma.channexOutboundQueue.groupBy({
        by: ['status'],
        where: { propertyId, updatedAt: { gte: since24h } },
        _count: { _all: true },
      }),
      this.prisma.channexOutbox.groupBy({
        by: ['status'],
        where: { propertyId, updatedAt: { gte: since24h } },
        _count: { _all: true },
      }),
      this.prisma.channexWebhookLog.count({
        where: { propertyId, receivedAt: { gte: since24h } },
      }),
      this.prisma.channexWebhookLog.findFirst({
        where: { propertyId },
        orderBy: { receivedAt: 'desc' },
        select: { receivedAt: true, eventType: true },
      }),
      this.prisma.guestStay.count({
        where: { propertyId, channexConflict: true, cancelledAt: null },
      }),
      this.prisma.channexOutboundQueue.findMany({
        where: { propertyId, status: 'DEAD_LETTER' },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          kind: true,
          attempts: true,
          lastError: true,
          processedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.channexOutbox.findMany({
        where: { propertyId, status: 'DEAD_LETTER' },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          eventType: true,
          channexBookingId: true,
          attempts: true,
          lastError: true,
          processedAt: true,
        },
      }),
      this.prisma.propertySettings.findUnique({
        where: { propertyId },
        select: {
          channexPropertyId: true,
          channexPullLastRunAt: true,
          channexLastFullSyncAt: true,
          channexFullSyncWindowStart: true,
          channexFullSyncWindowEnd: true,
          timezone: true,
        },
      }),
    ])

    return {
      propertyId,
      channexPropertyId: settings?.channexPropertyId ?? null,
      timezone: settings?.timezone ?? null,
      generatedAt: now,
      windowSince: since24h,

      outbound: {
        byStatus: countsToMap(outboundByStatus),
        deadLetters: deadLettersOutbound.map((d) => ({
          id: d.id,
          kind: d.kind,
          attempts: d.attempts,
          lastError: d.lastError,
          processedAt: d.processedAt,
          createdAt: d.createdAt,
        })),
        tokenBucket: {
          availability: this.bucket.inspect(propertyId, 'AVAILABILITY'),
          ratesRestrictions: this.bucket.inspect(propertyId, 'RATES_RESTRICTIONS'),
        },
      },

      inbound: {
        byStatus: countsToMap(inboundByStatus),
        webhookCount24h: webhookLogsCount,
        lastWebhookAt: webhookLogsLast?.receivedAt ?? null,
        lastWebhookEvent: webhookLogsLast?.eventType ?? null,
        deadLetters: deadLettersInbound.map((d) => ({
          id: d.id,
          eventType: d.eventType,
          channexBookingId: d.channexBookingId,
          attempts: d.attempts,
          lastError: d.lastError,
          processedAt: d.processedAt,
        })),
        feedLastRunAt: settings?.channexPullLastRunAt ?? null,
      },

      fullSync: {
        lastRunAt: settings?.channexLastFullSyncAt ?? null,
        windowStart: settings?.channexFullSyncWindowStart ?? 3,
        windowEnd: settings?.channexFullSyncWindowEnd ?? 5,
        nextEligibleAt: settings?.channexLastFullSyncAt
          ? new Date(settings.channexLastFullSyncAt.getTime() + 23 * 60 * 60 * 1000)
          : null,
      },

      conflicts: {
        openCount: conflictStays,
      },
    }
  }
}

// ── Types ───────────────────────────────────────────────────────────────────

function countsToMap(
  groups: Array<{ status: string; _count: { _all: number } }>,
): Record<string, number> {
  const out: Record<string, number> = {
    PENDING: 0,
    IN_PROGRESS: 0,
    SUCCEEDED: 0,
    FAILED: 0,
    DEAD_LETTER: 0,
  }
  for (const g of groups) {
    out[g.status] = g._count._all
  }
  return out
}

export interface ChannexAdminStatus {
  propertyId: string
  channexPropertyId: string | null
  timezone: string | null
  generatedAt: Date
  windowSince: Date
  outbound: {
    byStatus: Record<string, number>
    deadLetters: OutboundDeadLetter[]
    tokenBucket: {
      availability: { tokensRemaining: number; windowConsumed: number; capacity: number }
      ratesRestrictions: { tokensRemaining: number; windowConsumed: number; capacity: number }
    }
  }
  inbound: {
    byStatus: Record<string, number>
    webhookCount24h: number
    lastWebhookAt: Date | null
    lastWebhookEvent: string | null
    deadLetters: InboundDeadLetter[]
    feedLastRunAt: Date | null
  }
  fullSync: {
    lastRunAt: Date | null
    windowStart: number
    windowEnd: number
    nextEligibleAt: Date | null
  }
  conflicts: {
    openCount: number
  }
}

interface OutboundDeadLetter {
  id: string
  kind: string
  attempts: number
  lastError: string | null
  processedAt: Date | null
  createdAt: Date
}

interface InboundDeadLetter {
  id: string
  eventType: string
  channexBookingId: string | null
  attempts: number
  lastError: string | null
  processedAt: Date | null
}
