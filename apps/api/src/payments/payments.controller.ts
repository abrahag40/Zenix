import { Body, Controller, Param, Post } from '@nestjs/common'
import { JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { PaymentsService } from './payments.service'
import { WaiveNoShowDto } from './dto/waive-noshow.dto'

@Controller('v1/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // POST /v1/payments/guest-stays/:id/setup-intent
  // Crea un SetupIntent para guardar la tarjeta del huésped al check-in.
  // El clientSecret se envía al frontend (Stripe.js) para completar el flujo.
  @Post('guest-stays/:id/setup-intent')
  createSetupIntent(@Param('id') stayId: string) {
    return this.payments.createSetupIntent(stayId)
  }

  // POST /v1/payments/guest-stays/:id/charge-noshow
  // Dispara el cobro de no-show para una estadía marcada.
  // Requiere tarjeta guardada (stripePaymentMethodId en GuestStay).
  @Post('guest-stays/:id/charge-noshow')
  chargeNoShow(
    @Param('id') stayId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.payments.chargeNoShow(stayId, actor.sub)
  }

  // POST /v1/payments/guest-stays/:id/waive-noshow
  // Perdona el cargo de no-show. Razón obligatoria (auditabilidad).
  @Post('guest-stays/:id/waive-noshow')
  waiveNoShow(
    @Param('id') stayId: string,
    @Body() dto: WaiveNoShowDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.payments.waiveNoShowCharge(stayId, actor.sub, dto.reason)
  }
}

// ─── Stripe Webhook Controller (CONSOLIDATED 2026-05-29) ──────────────────
//
// HISTORIA: este archivo originalmente tenía un segundo @Controller que
// declaraba POST /v1/webhooks/stripe — el mismo path que
// src/billing/stripe-webhook.controller.ts (BILLING-CORE sprint).
//
// Bug detectado durante validation E2E del Sprint NETFLIX-TRIAL: 2 routes
// idénticos registrados → NestJS solo invoca uno (el último según module
// order). El otro controller queda muerto, dispatch silent fail si alguien
// reordena modules.
//
// FIX: eliminado el StripeWebhookController duplicado. La lógica del
// PaymentsService (setup_intent.succeeded con metadata.stayId,
// payment_intent.succeeded/failed con metadata.stayId) ahora vive en
// WebhookHandlerService.handle dispatch (src/billing/webhook-handler.service.ts)
// que llama a paymentsService.onSetupIntentSucceeded para casos PMS.
//
// Single source of truth: src/billing/stripe-webhook.controller.ts ← único
// endpoint POST /api/v1/webhooks/stripe. Dispatches por event type +
// metadata a SubscriptionService (billing/Netflix) o PaymentsService (PMS).
