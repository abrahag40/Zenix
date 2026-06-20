import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../../../prisma/prisma.service'
import {
  ChannexAvailabilityEntry,
  ChannexGateway,
  ChannexHttpError,
  ChannexRateLimitError,
  ChannexRestrictionEntry,
} from '../channex.gateway'
import { ChannexOutboundNotifService } from './channex-outbound-notif.service'
import { ChannexTokenBucketService } from './channex-token-bucket.service'

/**
 * ChannexOutboundWorker — D-CHX-OUT-1 + D-CHX-OUT-5 + D-CHX-OUT-6.
 *
 * Drena `channex_outbound_queue` respetando rate limits Channex.
 *
 * Cert mitigations:
 *   · AP-2.2 (direct API call): este worker es el ÚNICO caller de
 *     pushAvailability/pushRestrictions en producción (excepto
 *     FullSyncOrchestrator Day 4 que respeta su propia idempotencia).
 *   · AP-2.3 (silent drop): retry 429 respeta Retry-After header;
 *     5xx exp backoff; max 5 attempts → DEAD_LETTER + AppNotif.
 *   · AP-3 (timer full-sync): este worker drena DELTAS, no genera payloads
 *     full-sync. Cualquier row del queue fue creado por OutboxBuilder
 *     (event-driven) o por FullSyncOrchestrator (1×/24h guard).
 *
 * Concurrencia multi-pod (v1.0.5+):
 *   · FOR UPDATE SKIP LOCKED garantiza que dos workers no pickeen el mismo
 *     row.
 *   · Token bucket es in-memory (v1.0.0) → migrar a Redis cuando escale.
 *
 * Pickup order: priority DESC, nextAttemptAt ASC. AVAILABILITY (100) gana
 * a RATES_RESTRICTIONS (50), per Channex doc "push avail updates to the
 * front of the queue".
 */
@Injectable()
export class ChannexOutboundWorker {
  private readonly logger = new Logger(ChannexOutboundWorker.name)
  private static readonly BATCH_SIZE = 4
  private static readonly MAX_ATTEMPTS = 5
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ChannexGateway,
    private readonly bucket: ChannexTokenBucketService,
    private readonly notif: ChannexOutboundNotifService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS, { name: 'channex-outbound-drain' })
  async drainScheduled(): Promise<void> {
    await this.drain()
  }

  async drain(): Promise<DrainResult> {
    if (this.running) {
      this.logger.debug('[Channex outbound worker] previous tick still running — skip')
      return { picked: 0, succeeded: 0, deferred: 0, failed: 0, deadLetter: 0 }
    }
    this.running = true
    const result: DrainResult = { picked: 0, succeeded: 0, deferred: 0, failed: 0, deadLetter: 0 }

    try {
      const ids = await this.pickReadyRows(ChannexOutboundWorker.BATCH_SIZE)
      result.picked = ids.length

      for (const id of ids) {
        const outcome = await this.processRow(id)
        if (outcome === 'SUCCEEDED') result.succeeded += 1
        else if (outcome === 'DEFERRED') result.deferred += 1
        else if (outcome === 'FAILED') result.failed += 1
        else if (outcome === 'DEAD_LETTER') result.deadLetter += 1
      }
    } finally {
      this.running = false
    }

    if (result.picked > 0) {
      this.logger.log(
        `[Channex outbound worker] tick picked=${result.picked} succ=${result.succeeded} ` +
          `deferred=${result.deferred} failed=${result.failed} deadLetter=${result.deadLetter}`,
      )
    }
    return result
  }

  /**
   * Pick rows ready to drain. Worker-safe via FOR UPDATE SKIP LOCKED.
   * priority DESC → AVAILABILITY (100) antes que RATES_RESTRICTIONS (50).
   */
  // ━━ CHANNEX-CERT ▸ Resiliencia ▸ FOR UPDATE SKIP LOCKED ━━━━━━━━━━━━━━━━━━━
  // QUÉ MOSTRAR: dos workers nunca toman la misma fila; el primero la bloquea,
  // el segundo la salta. Si el servidor cae a mitad, la fila queda en la cola y
  // el próximo tick la retoma (nada se pierde). Guía §7-Q12 y Q13.
  private async pickReadyRows(limit: number): Promise<string[]> {
    type Row = { id: string }
    // `next_attempt_at` es Prisma DateTime → columna `timestamp` SIN timezone que
    // guarda el wall-clock UTC. `NOW()` es `timestamptz`; compararlo directo castea
    // la columna a la timezone de la sesión → si la sesión NO es UTC (BD dev en
    // America/Mexico_City), el row espera ~6h. `NOW() AT TIME ZONE 'UTC'` da el
    // wall-clock UTC (mismo frame que la columna) → comparación correcta siempre.
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT id FROM channex_outbound_queue
      WHERE status IN ('PENDING', 'FAILED')
        AND next_attempt_at <= (NOW() AT TIME ZONE 'UTC')
      ORDER BY priority DESC, next_attempt_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `
    return rows.map((r) => r.id)
  }

  /**
   * Procesar un row: token check → push → mark status.
   *
   * - Bucket exhausted → DEFERRED (update nextAttemptAt = now + retryAfterMs,
   *   sin consumir attempt counter — esto NO es fallo de la integración).
   * - 401/403 → DEAD_LETTER inmediato (api-key broken, requiere humano).
   * - 4xx no-rate-limit → DEAD_LETTER inmediato (bad payload).
   * - 429 → FAILED con backoff = max(60s, Retry-After header).
   * - 5xx → FAILED con exp backoff 2^attempts s.
   * - Network error → mismo path que 5xx.
   * - SUCCEEDED → mark + processedAt timestamp.
   */
  private async processRow(id: string): Promise<ProcessOutcome> {
    const row = await this.prisma.channexOutboundQueue.findUnique({
      where: { id },
      select: {
        id: true,
        propertyId: true,
        kind: true,
        payload: true,
        attempts: true,
        status: true,
      },
    })
    if (!row) return 'SUCCEEDED' // dropped by concurrent worker; treat as no-op
    if (row.status !== 'PENDING' && row.status !== 'FAILED') return 'SUCCEEDED'

    // Resolve organizationId (needed for AppNotif on DEAD_LETTER)
    const property = await this.prisma.property.findUnique({
      where: { id: row.propertyId },
      select: { organizationId: true },
    })
    const organizationId = property?.organizationId ?? null

    // 1. Token bucket check
    const consume = this.bucket.consume(row.propertyId, row.kind)
    if (!consume.ok) {
      const nextAttemptAt = new Date(Date.now() + consume.retryAfterMs)
      await this.prisma.channexOutboundQueue.update({
        where: { id },
        data: {
          status: 'PENDING', // NO incrementar attempts — bucket throttle no es failure
          nextAttemptAt,
          lockedAt: null,
          lockedBy: null,
        },
      })
      this.logger.debug(
        `[Channex outbound worker] DEFERRED row=${id} kind=${row.kind} ` +
          `retryAfterMs=${consume.retryAfterMs}`,
      )
      return 'DEFERRED'
    }

    // 2. Mark IN_PROGRESS
    const attempts = row.attempts + 1
    await this.prisma.channexOutboundQueue.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        attempts,
        lockedAt: new Date(),
        lockedBy: `${process.env.HOSTNAME ?? 'local'}:${process.pid}`,
      },
    })

    // 3. Dispatch a Gateway según kind
    try {
      if (row.kind === 'AVAILABILITY') {
        const payload = row.payload as { entries: unknown[] }
        await this.gateway.pushAvailability(payload.entries as ChannexAvailabilityEntry[])
      } else if (row.kind === 'RATES_RESTRICTIONS') {
        const payload = row.payload as { entries: unknown[] }
        await this.gateway.pushRestrictions(payload.entries as ChannexRestrictionEntry[])
      } else if (row.kind === 'BOOKING_CANCEL') {
        // Sprint CHANNEX-UX-E2-E3 §150 — propaga manual cancel a OTA via CRS.
        const payload = row.payload as {
          channexBookingId: string
          stayId: string
          reason?: string | null
        }
        const cancelRes = await this.gateway.cancelBookingAtChannex(
          payload.channexBookingId,
          payload.reason ?? undefined,
        )
        if (cancelRes.skipped) {
          // Airbnb (regla §152) o booking OTA sin mapear (rooms sin room_type_id)
          // → Channex no puede cancelar programáticamente. Avisar al supervisor
          // para que cancele en el extranet. NO es un fallo → row queda SUCCEEDED.
          const stay = await this.prisma.guestStay.findUnique({
            where: { id: payload.stayId },
            select: { organizationId: true, propertyId: true, channexOtaName: true },
          })
          if (stay) {
            await this.notif.raiseManualOtaCancel({
              organizationId: stay.organizationId,
              propertyId: stay.propertyId,
              stayId: payload.stayId,
              otaName: stay.channexOtaName ?? 'Airbnb',
            }).catch(() => {})
          }
        } else {
          // Best-effort: marca el stay como sincronizado para que el chip
          // "✓ Cancelado en {ota} hace Xs" aparezca en BookingDetailSheet.
          // Si el stay fue purged entre encolar y procesar, el update es no-op.
          await this.prisma.guestStay.updateMany({
            where: { id: payload.stayId },
            data: { channexLastSyncAt: new Date() },
          })
        }
      }

      // 4. Success
      await this.prisma.channexOutboundQueue.update({
        where: { id },
        data: {
          status: 'SUCCEEDED',
          processedAt: new Date(),
          lastError: null,
          lockedAt: null,
          lockedBy: null,
        },
      })
      this.logger.log(
        `[Channex outbound worker] SUCCEEDED row=${id} kind=${row.kind} attempts=${attempts}`,
      )
      return 'SUCCEEDED'
    } catch (err) {
      return this.handleError(row.id, attempts, row.kind, row.propertyId, organizationId, err)
    }
  }

  private async handleError(
    id: string,
    attempts: number,
    kind: 'AVAILABILITY' | 'RATES_RESTRICTIONS' | 'BOOKING_CANCEL',
    propertyId: string,
    organizationId: string | null,
    err: unknown,
  ): Promise<ProcessOutcome> {
    const msg = err instanceof Error ? err.message : String(err)
    const status = err instanceof ChannexHttpError ? err.status : null

    // Terminal 4xx (except 429) → DEAD_LETTER inmediato (bad payload o auth)
    const terminal4xx = status !== null && status >= 400 && status < 500 && status !== 429

    // Exhausted attempts → DEAD_LETTER
    const exhausted = attempts >= ChannexOutboundWorker.MAX_ATTEMPTS

    if (terminal4xx || exhausted) {
      await this.prisma.channexOutboundQueue.update({
        where: { id },
        data: {
          status: 'DEAD_LETTER',
          lastError: msg.slice(0, 1000),
          processedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      })
      // Notif al SUPERVISOR (AP-2.3 mitigation)
      if (organizationId) {
        await this.notif.raiseDeadLetter({
          organizationId,
          propertyId,
          outboundQueueId: id,
          kind,
          attempts,
          lastError: msg,
          httpStatus: status,
        })
      }
      this.logger.error(
        `[Channex outbound worker] DEAD_LETTER row=${id} kind=${kind} attempts=${attempts} ` +
          `status=${status ?? 'NA'} reason=${terminal4xx ? 'terminal_4xx' : 'exhausted'}: ${msg}`,
      )
      return 'DEAD_LETTER'
    }

    // ━━ CHANNEX-CERT ▸ Test 12 + AP-2.3 ▸ 429 (NUNCA descarte silente) ━━━━━━━
    // QUÉ MOSTRAR: ante 429 respetamos el header Retry-After (piso 60s); 5xx →
    // backoff exponencial; tras 5 intentos → DEAD_LETTER + notif al supervisor.
    // Doc Channex: 429 = "minimum 1 minute pause". Guía §3 (AP-2.3) / §7-Q7 y Q11.
    // Sprint CHANNEX-CERT-B1 (2026-05-29) — backoff strategy:
    //
    // 429 RATE LIMIT — respetar `Retry-After` que Channex provee. El gateway
    //   parsea el header (RFC 7231 §7.1.3, formato delta-seconds o HTTP-date)
    //   y lo expone como `err.retryAfterSeconds`. Si no viene (header missing
    //   / malformed), usamos floor de 60s (recomendación oficial Channex).
    //   `max(60, retryAfterSeconds)` garantiza que NUNCA bajemos del minimum
    //   incluso si Channex pide 1 segundo (defensa contra bug del server).
    //
    // 5xx / network — exponential backoff 2^attempts seconds (1, 2, 4, 8, 16).
    //
    // CRÍTICO PARA CERT STAGE 4 (Anti-pattern AP-2.3): ignorar Retry-After
    // gatilla rechazo automático en walkthrough. El reviewer verifica
    // logs del worker durante el test de rate limit (Test 12 oficial).
    let backoffSeconds: number
    if (status === 429) {
      const rateLimitError = err instanceof ChannexRateLimitError ? err : null
      const channexProvided = rateLimitError?.retryAfterSeconds
      backoffSeconds = channexProvided !== null && channexProvided !== undefined
        ? Math.max(60, channexProvided)
        : 60
    } else {
      backoffSeconds = Math.pow(2, attempts)
    }
    const nextAttemptAt = new Date(Date.now() + backoffSeconds * 1000)

    await this.prisma.channexOutboundQueue.update({
      where: { id },
      data: {
        status: 'FAILED',
        attempts,
        lastError: msg.slice(0, 1000),
        nextAttemptAt,
        lockedAt: null,
        lockedBy: null,
      },
    })
    this.logger.warn(
      `[Channex outbound worker] FAILED row=${id} kind=${kind} attempts=${attempts} ` +
        `retryIn=${backoffSeconds}s status=${status ?? 'NA'}: ${msg}`,
    )
    return 'FAILED'
  }
}

export type ProcessOutcome = 'SUCCEEDED' | 'DEFERRED' | 'FAILED' | 'DEAD_LETTER'

export interface DrainResult {
  picked: number
  succeeded: number
  deferred: number
  failed: number
  deadLetter: number
}
