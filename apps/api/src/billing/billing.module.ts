/**
 * BillingModule — Sprint BILLING-CORE (v1.1.0).
 *
 * Day 1 — skeleton. Services adicionales se registran progresivamente:
 *   Day 2  — StripeWebhookController + WebhookHandlerService
 *   Day 3  — SubscriptionService
 *   Day 4  — DiscountCodeService + cap validation
 *   Day 5  — BillingController + NovaBillingController + PricingAdminController
 *   Day 6  — wire al wizard activate (Step 7.5)
 *   Day 16 — RetentionSaveOfferService + CancellationFlowController
 *   Day 18 — BillingReminderScheduler
 *   Day 20 — DunningEscalationScheduler + WhatsApp via Twilio
 *
 * Plan completo en docs/sprints/BILLING-CORE-plan.md.
 */
import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { AuditLogService } from '../nova/audit/audit-log.service'
import { BillingService } from './billing.service'
import { WebhookHandlerService } from './webhook-handler.service'
import { SubscriptionService } from './subscription.service'
import { StripeWebhookController } from './stripe-webhook.controller'

@Module({
  imports: [PrismaModule],
  controllers: [StripeWebhookController],
  providers: [BillingService, WebhookHandlerService, SubscriptionService, AuditLogService],
  exports: [BillingService, SubscriptionService],
})
export class BillingModule {}
