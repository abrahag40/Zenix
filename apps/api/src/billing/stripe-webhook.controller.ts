/**
 * StripeWebhookController — endpoint público para webhooks Stripe.
 *
 * Surface: POST /v1/webhooks/stripe (Public, sin JWT)
 *
 * Seguridad:
 *   - Verificación HMAC obligatoria del header `Stripe-Signature`
 *   - Sin signature válida → 400 Bad Request
 *   - Idempotencia delegada a WebhookHandlerService.handle()
 *
 * Importante: este endpoint DEBE responder dentro de los primeros 30
 * segundos con 2xx para que Stripe no reintente. Mantén el handler
 * rápido — operaciones largas en background (queue / scheduler).
 *
 * Stripe envía webhook a este endpoint cuando configures el endpoint
 * en Stripe Dashboard → Developers → Webhooks. Copia el "signing secret"
 * a la env var STRIPE_WEBHOOK_SECRET.
 */
import { Body, Controller, Headers, HttpCode, HttpException, HttpStatus, Logger, Post, Req } from '@nestjs/common'
import type { Request } from 'express'
import { Public } from '../common/decorators/public.decorator'
import { BillingService } from './billing.service'
import { WebhookHandlerService } from './webhook-handler.service'

// Stripe v22 SDK no exporta types nominales via require — mismo workaround
// que en webhook-handler.service.ts. constructEvent retorna shape compatible.
interface StripeEvent {
  id: string
  type: string
  data: { object: unknown }
}

@Controller('v1/webhooks/stripe')
@Public()
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name)

  constructor(
    private readonly billing: BillingService,
    private readonly handler: WebhookHandlerService,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string | undefined,
    @Body() _body: unknown,
  ): Promise<{ received: boolean; idempotent?: boolean; handled?: boolean }> {
    if (!this.billing.isStripeConfigured()) {
      this.logger.warn('[StripeWebhook] Webhook recibido pero Stripe no está configurado en este server. Skipping.')
      // Respondemos 200 igual para que Stripe no reintente — el server actual
      // simplemente no maneja webhooks (e.g. dev environment sin Stripe key).
      return { received: false }
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      this.logger.error(
        '[StripeWebhook] STRIPE_WEBHOOK_SECRET no configurado — REJECT webhook por seguridad.',
      )
      throw new HttpException(
        'Webhook signing secret no configurado en server',
        HttpStatus.SERVICE_UNAVAILABLE,
      )
    }

    if (!signature) {
      this.logger.warn('[StripeWebhook] Webhook sin Stripe-Signature header — REJECT.')
      throw new HttpException('Missing Stripe-Signature header', HttpStatus.BAD_REQUEST)
    }

    // El raw body es REQUIRED para verificar HMAC. NestJS por default
    // parsea body como JSON — necesitamos el raw buffer. Configurado via
    // bodyParser raw en main.ts (ver instrucciones de setup abajo).
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody
    if (!rawBody) {
      this.logger.error(
        '[StripeWebhook] req.rawBody no disponible. ¿Está configurado bodyParser raw para /v1/webhooks/stripe?',
      )
      throw new HttpException(
        'Webhook raw body parser no configurado en server',
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }

    let event: StripeEvent
    try {
      const stripe = this.billing.getStripeClient()
      // stripe.webhooks.constructEvent retorna Stripe.Event (shape compatible
      // con nuestra interface StripeEvent local).
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      ) as unknown as StripeEvent
    } catch (err) {
      this.logger.warn(`[StripeWebhook] Signature verification failed: ${String(err).slice(0, 200)}`)
      throw new HttpException('Invalid signature', HttpStatus.BAD_REQUEST)
    }

    this.logger.log(`[StripeWebhook] ✓ Event verified: ${event.type} ${event.id}`)

    // Dispatcher — devuelve idempotencia + flag de handled
    const result = await this.handler.handle(event)

    return {
      received: true,
      idempotent: result.idempotent,
      handled: result.handled,
    }
  }
}
