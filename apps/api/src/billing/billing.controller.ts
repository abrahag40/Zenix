/**
 * BillingController — endpoints del cliente (ORG_OWNER scope).
 *
 * Sprint BILLING-CORE Day 5. Vive bajo `/v1/billing/*` y NO requiere
 * X-Acting-Organization-Id (el ORG_OWNER opera su propia org via
 * `actor.organizationId` del JWT).
 *
 * Endpoints:
 *   GET  /v1/billing/subscription            — mi subscription actual
 *   POST /v1/billing/portal-session          — generar Stripe Customer Portal URL
 *   POST /v1/billing/cancel                  — iniciar cancellation (graceful default)
 *
 * Cancel-immediate NO se expone aquí — solo PLATFORM_ADMIN via NovaBillingController.
 * El cliente ORG_OWNER tiene cancel_at_period_end forzado.
 */
import { Body, Controller, ForbiddenException, Get, Post, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import type { JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { NovaTiers, NovaTiersGuard } from '../nova/guards/nova-tiers.guard'
import { SubscriptionService } from './subscription.service'
import { CancelSubscriptionDto, CreateCustomerPortalSessionDto } from './dto/subscription.dto'

@Controller('v1/billing')
@UseGuards(AuthGuard('jwt'), NovaTiersGuard)
@NovaTiers('ORG_OWNER')
export class BillingController {
  constructor(private readonly subscription: SubscriptionService) {}

  @Get('subscription')
  async getMine(@CurrentUser() actor: JwtPayload) {
    if (!actor.organizationId) {
      throw new ForbiddenException('Tu sesión no tiene organizationId — contacta soporte')
    }
    return this.subscription.getSubscriptionForOrganization(actor.organizationId)
  }

  @Post('portal-session')
  async createPortal(
    @CurrentUser() actor: JwtPayload,
    @Body() dto: CreateCustomerPortalSessionDto,
  ) {
    if (!actor.organizationId) {
      throw new ForbiddenException('Tu sesión no tiene organizationId — contacta soporte')
    }
    return this.subscription.createCustomerPortalSession(actor.organizationId, dto.returnUrl)
  }

  @Post('cancel')
  async cancel(
    @CurrentUser() actor: JwtPayload,
    @Body() dto: CancelSubscriptionDto,
  ) {
    if (!actor.organizationId) {
      throw new ForbiddenException('Tu sesión no tiene organizationId — contacta soporte')
    }

    // ORG_OWNER NUNCA puede pedir immediate cancel — sólo graceful at_period_end.
    if (dto.immediate) {
      throw new ForbiddenException(
        'Cancel inmediato no disponible para ORG_OWNER. La cancelación es efectiva al final del período actual.',
      )
    }

    const sub = await this.subscription.getSubscriptionForOrganization(actor.organizationId)
    if (!sub) {
      throw new ForbiddenException('Tu organización no tiene subscription activa')
    }
    return this.subscription.cancelSubscription(sub.id, { ...dto, immediate: false }, actor)
  }
}
