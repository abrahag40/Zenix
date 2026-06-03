import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../../../prisma/prisma.service'
import { ChannexRevisionPullerService } from './channex-revision-puller.service'

/**
 * ChannexOutboxScheduler — drains the channex_outbox queue.
 *
 * Polls every 30s for rows in (PENDING, FAILED) with next_attempt_at <= now()
 * and dispatches them to the puller. Uses Postgres FOR UPDATE SKIP LOCKED
 * so multiple worker replicas can run in parallel without picking the same
 * row twice.
 *
 * Cron: every 30s. Cheap query (indexed on [status, next_attempt_at]).
 * Concurrency = 4 per tick (D-CHX10 prevents flooding Postgres or Channex).
 */
@Injectable()
export class ChannexOutboxScheduler {
  private readonly logger = new Logger(ChannexOutboxScheduler.name)
  private static readonly BATCH_SIZE = 4
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly puller: ChannexRevisionPullerService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS, { name: 'channex-outbox-drain' })
  async drain(): Promise<void> {
    if (this.running) {
      this.logger.debug('[Channex outbox] previous tick still running — skip')
      return
    }
    this.running = true
    try {
      const picked = await this.pickReadyRows(ChannexOutboxScheduler.BATCH_SIZE)
      if (picked.length === 0) return

      this.logger.debug(`[Channex outbox] dispatching ${picked.length} rows`)
      // Process sequentially to avoid hammering Channex (20 ARI/min limit,
      // and per-property serialization keeps booking_id ordering sane).
      for (const id of picked) {
        try {
          await this.puller.processOutboxRow(id)
        } catch (err) {
          // Defensive — puller already handles its own errors. This catch
          // covers truly unexpected throws (shouldn't happen).
          const msg = err instanceof Error ? err.message : String(err)
          this.logger.error(`[Channex outbox] unexpected error on outbox=${id}: ${msg}`)
        }
      }
    } finally {
      this.running = false
    }
  }

  /**
   * Atomically pick up to N rows that are ready to process. Uses
   * FOR UPDATE SKIP LOCKED so concurrent workers don't double-pick.
   * Returns just the IDs — the puller re-reads with full state.
   *
   * SQL choice: we do not use Prisma's findMany here because Prisma
   * does not support row-level locks. Raw query gives us the locking
   * primitives we need.
   */
  private async pickReadyRows(limit: number): Promise<string[]> {
    type Row = { id: string }
    // timezone-safe: `next_attempt_at` (Prisma DateTime, timestamp sin tz) guarda
    // wall-clock UTC → comparar contra `NOW() AT TIME ZONE 'UTC'`, no `NOW()`
    // (timestamptz casteado a la sesión). Ver nota en channex-outbound-worker.
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT id FROM channex_outbox
      WHERE status IN ('PENDING', 'FAILED')
        AND next_attempt_at <= (NOW() AT TIME ZONE 'UTC')
      ORDER BY next_attempt_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `
    return rows.map((r) => r.id)
  }
}
