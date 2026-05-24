import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { Request } from 'express'
import { Public } from '../../../common/decorators/public.decorator'
import { ChannexAuthGuard, ChannexAuthContext } from './channex-auth.guard'
import { ChannexInboundService } from './channex-inbound.service'
import { ChannexRevisionPullerService } from './channex-revision-puller.service'

/**
 * POST /api/webhooks/channex
 *
 * Diseño certification-ready (Channex Stage 1-4):
 *   1. `@Public()` salta JwtAuthGuard — Channex no envía nuestro JWT.
 *   2. `ChannexAuthGuard` valida bearer token custom (header configurado
 *      al registrar el webhook en Channex). Sin HMAC del lado de Channex.
 *   3. Respondemos 200 SIEMPRE que la auth pase. El procesamiento es
 *      async (transactional outbox D-CHX10) — un workload async garantiza
 *      P95 < 100ms de respuesta y permite a Channex liberar su queue.
 *   4. Idempotencia (D-CHX2) la garantiza `channexBookingId` UNIQUE en
 *      GuestStay + dedup en outbox.
 *   5. Append-only audit (D-CHX4): ChannexWebhookLog + ChannexOutbox se
 *      escriben en MISMA transacción → no se pierde un webhook ni se
 *      duplica trabajo.
 */
@Controller('webhooks')
export class ChannexWebhookController {
  private readonly logger = new Logger(ChannexWebhookController.name)

  constructor(
    private readonly inbound: ChannexInboundService,
    private readonly puller: ChannexRevisionPullerService,
  ) {}

  @Public()
  @UseGuards(ChannexAuthGuard)
  @Post('channex')
  @HttpCode(200)
  async handle(
    @Req() req: Request & { channexAuth?: ChannexAuthContext },
    @Headers() _headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ): Promise<ChannexWebhookAck> {
    const auth = req.channexAuth
    if (!auth) {
      // Should never happen — guard always sets this on success.
      throw new BadRequestException('Auth context missing post-guard')
    }

    const envelope = parseEnvelope(body)
    const { logId, outboxId } = await this.inbound.acceptDelivery({
      propertyId: auth.propertyId,
      eventType: envelope.event,
      channexBookingId: envelope.bookingId,
      channexRevisionId: envelope.revisionId,
      payload: body,
      signatureValid: auth.valid && auth.secretConfigured,
    })

    this.logger.log(
      `[Channex webhook] accepted log=${logId} outbox=${outboxId} ` +
        `property=${auth.propertyId} event=${envelope.event} ` +
        `revisionId=${envelope.revisionId ?? '∅'}`,
    )

    // ── Direct trigger (latency optimization) ────────────────────────────
    // Fire-and-forget kick of the puller on the just-enqueued outbox row.
    // Brings end-to-end latency from ~30s (cron tick) down to ~2-3s while
    // preserving the safety nets:
    //   · The outbox row exists → if this kick fails/crashes, the 30s
    //     ChannexOutboxScheduler picks it up next tick (idempotent).
    //   · processOutboxRow has its own FOR UPDATE SKIP LOCKED pattern via
    //     the row state machine → no double-processing risk.
    //   · setImmediate yields back to the event loop so the HTTP response
    //     ships first; Channex sees its 200 ack in <100ms.
    if (outboxId) {
      setImmediate(() => {
        void this.puller.processOutboxRow(outboxId).catch((err) => {
          // Best-effort: the cron is the safety net.
          this.logger.warn(
            `[Channex webhook] direct trigger failed outbox=${outboxId}: ` +
              `${err instanceof Error ? err.message : String(err)}`,
          )
        })
      })
    }

    // Cert audit D4 — explicar el 200 always-on-auth-pass:
    // Channex documenta que webhook receivers DEBEN responder rápido. Si
    // respondemos 5xx, Channex acumula el webhook en su queue interna
    // y reintenta automáticamente — eventualmente notifica al partner
    // como "non_acked_booking". Lo correcto es:
    //   1. Auth fail → 401 (Channex pause + alert al partner)
    //   2. Auth pass → 200 inmediato + outbox enqueue
    //   3. Processing failure async → DEAD_LETTER + nuestra propia alert
    // El handler async NUNCA debería bloquear esta response — si falla,
    // el outbox retry + AppNotification al SUPERVISOR cubre la recovery.
    return { received: true, logId, outboxId, message: 'Queued for processing' }
  }
}

export interface ChannexWebhookAck {
  received: true
  logId: string
  outboxId: string | null
  message: string
}

interface ParsedEnvelope {
  event: string
  bookingId: string | null
  revisionId: string | null
}

/**
 * Channex webhook envelope per docs:
 *   { event, property_id, user_id, timestamp, payload?: { booking_id, revision_id } }
 *
 * `payload` se omite cuando el webhook fue creado con `send_data:false`.
 * En ese caso, Channex emite solo el evento ligero y esperamos que el PMS
 * llame al feed (`/booking_revisions/feed`) para descubrir qué revisar.
 * Lo encolamos igual con bookingId/revisionId null — el worker hace
 * fallback al feed query.
 */
function parseEnvelope(body: unknown): ParsedEnvelope {
  const e = (body ?? {}) as {
    event?: string
    payload?: { booking_id?: string; revision_id?: string }
  }
  return {
    event: typeof e.event === 'string' && e.event.length > 0 ? e.event : 'unknown',
    bookingId: e.payload?.booking_id ?? null,
    revisionId: e.payload?.revision_id ?? null,
  }
}
