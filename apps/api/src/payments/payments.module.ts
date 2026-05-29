import { Module } from '@nestjs/common'
import { PaymentsService } from './payments.service'
import { PaymentsController } from './payments.controller'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  // StripeWebhookController eliminado 2026-05-29 — webhook ahora consolidado
  // en BillingModule (src/billing/stripe-webhook.controller.ts) que rutea via
  // WebhookHandlerService dispatcher. Ver comentario en payments.controller.ts.
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
