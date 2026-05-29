/**
 * NovaBillingController — endpoints consultor/admin Nova.
 *
 * Sprint BILLING-CORE Day 5. Vive bajo `/v1/nova/billing/*`. RBAC:
 *
 *   Subscription CRUD (operan sobre la org declarada por X-Acting-Organization-Id):
 *     POST   /subscriptions                      — PLATFORM/PARTNER_*
 *     GET    /subscriptions/:id                  — PLATFORM/PARTNER_*
 *     PATCH  /subscriptions/:id/plan             — PLATFORM/PARTNER_*
 *     POST   /subscriptions/:id/pause            — PLATFORM/PARTNER_*
 *     POST   /subscriptions/:id/resume           — PLATFORM/PARTNER_*
 *     POST   /subscriptions/:id/cancel           — PLATFORM/PARTNER_*
 *
 *   Discount codes (consultor genera, PARTNER_ADMIN+ aprueba):
 *     POST   /discount-codes                     — PLATFORM/PARTNER_*
 *     POST   /discount-approvals/:id/approve     — PLATFORM/PARTNER_ADMIN (NovaTiers)
 *     POST   /discount-approvals/:id/reject      — PLATFORM/PARTNER_ADMIN
 *     GET    /discount-approvals/pending         — PLATFORM/PARTNER_ADMIN
 *
 *   Templates (consultor-scoped):
 *     GET    /discount-templates                 — PLATFORM/PARTNER_*
 *     POST   /discount-templates                 — PLATFORM/PARTNER_*
 *     DELETE /discount-templates/:id             — PLATFORM/PARTNER_*
 *
 * Notas:
 *   - Subscription endpoints requieren X-Acting-Organization-Id (consultor declara
 *     qué cliente está operando) — NovaActingOrgGuard valida assignedOrgIds.
 *   - Discount + Templates endpoints NO requieren acting-org porque pueden ser
 *     listados cross-org (PARTNER_ADMIN ve approvals de todos sus clientes).
 */
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import type { JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { NovaActingOrgGuard, RequireActingOrg } from '../nova/guards/nova-acting-org.guard'
import { NovaTiers, NovaTiersGuard } from '../nova/guards/nova-tiers.guard'
import { DiscountCodeService } from './discount-code.service'
import { SubscriptionService } from './subscription.service'
import { TenantContextService } from '../common/tenant-context.service'
import { NotFoundException } from '@nestjs/common'
import {
  CancelSubscriptionDto,
  ChangePlanDto,
  CreateSubscriptionDto,
  PauseSubscriptionDto,
} from './dto/subscription.dto'
import {
  GenerateDiscountCodeDto,
  RejectApprovalDto,
  SaveConsultorTemplateDto,
} from './dto/discount-code.dto'

@Controller('v1/nova/billing')
@UseGuards(AuthGuard('jwt'), NovaTiersGuard, NovaActingOrgGuard)
@NovaTiers('PLATFORM', 'PARTNER_ADMIN', 'PARTNER_MEMBER')
export class NovaBillingController {
  constructor(
    private readonly subscription: SubscriptionService,
    private readonly discountCode: DiscountCodeService,
    private readonly tenant: TenantContextService,
  ) {}

  // ── Subscriptions ─────────────────────────────────────────────────

  @Post('subscriptions')
  @RequireActingOrg()
  async create(@Body() dto: CreateSubscriptionDto, @CurrentUser() actor: JwtPayload) {
    return this.subscription.createSubscription(dto, actor)
  }

  @Get('subscriptions/:id')
  @RequireActingOrg()
  async getById(@Param('id') id: string) {
    // SubscriptionService no expone getById directo aún — usamos via organizationId
    // del JWT header X-Acting-Organization-Id.
    // El endpoint asume id es el ID interno (no Stripe).
    return this.subscription.getSubscriptionById(id)
  }

  /**
   * Sprint CLIENT-RETENTION-DISCOUNTS (2026-05-29).
   * GET /v1/nova/billing/subscription
   *
   * Retorna la subscription del current acting org (X-Acting-Organization-Id).
   * Incluye discounts + events (audit trail). Usado por la página
   * /nova/clientes/:id/billing para mostrar el estado de la sub +
   * history de discounts antes de aplicar uno de retención.
   *
   * Si la org no tiene subscription → 404 (caso edge: cliente cuyo
   * wizard activate falló en la creación de Stripe sub).
   */
  @Get('subscription')
  @RequireActingOrg()
  async getForActingOrg() {
    const orgId = this.tenant.getActingOrgIdOrThrow()
    const sub = await this.subscription.getSubscriptionForOrganization(orgId)
    if (!sub) {
      throw new NotFoundException(
        `Organization ${orgId} no tiene subscription Stripe — verifica que el wizard se completó correctamente.`,
      )
    }
    return sub
  }

  @Patch('subscriptions/:id/plan')
  @RequireActingOrg()
  async changePlan(
    @Param('id') id: string,
    @Body() dto: ChangePlanDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.subscription.changePlan(id, dto, actor)
  }

  @Post('subscriptions/:id/pause')
  @RequireActingOrg()
  async pause(
    @Param('id') id: string,
    @Body() dto: PauseSubscriptionDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.subscription.pauseSubscription(id, dto, actor)
  }

  @Post('subscriptions/:id/resume')
  @RequireActingOrg()
  async resume(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.subscription.resumeSubscription(id, actor)
  }

  @Post('subscriptions/:id/cancel')
  @RequireActingOrg()
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelSubscriptionDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.subscription.cancelSubscription(id, dto, actor)
  }

  // ── Discount codes ────────────────────────────────────────────────

  @Post('discount-codes')
  @RequireActingOrg()
  async generateDiscount(
    @Body() dto: GenerateDiscountCodeDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.discountCode.generate(dto, actor)
  }

  @Post('discount-approvals/:id/approve')
  async approveDiscount(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.discountCode.approveRequest(id, actor)
  }

  @Post('discount-approvals/:id/reject')
  async rejectDiscount(
    @Param('id') id: string,
    @Body() dto: RejectApprovalDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.discountCode.rejectRequest(id, dto, actor)
  }

  @Get('discount-approvals/pending')
  async listPendingApprovals(@CurrentUser() actor: JwtPayload) {
    return this.discountCode.listPendingApprovals(actor)
  }

  // ── Consultor templates ───────────────────────────────────────────

  @Get('discount-templates')
  async listTemplates(@CurrentUser() actor: JwtPayload) {
    return this.discountCode.listTemplates(actor)
  }

  @Post('discount-templates')
  async saveTemplate(
    @Body() dto: SaveConsultorTemplateDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.discountCode.saveTemplate(dto, actor)
  }

  @Delete('discount-templates/:id')
  async deleteTemplate(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.discountCode.deleteTemplate(id, actor)
  }

  /**
   * Aplica un template pre-configurado a una subscription target.
   * Sprint BILLING-DISCOUNT-CODES Day 1.
   *
   * Body: { subscriptionId: string }
   * Return: { kind: 'applied' | 'pending_approval', ... }
   */
  @Post('discount-templates/:id/apply')
  @RequireActingOrg()
  async applyTemplate(
    @Param('id') templateId: string,
    @Body() body: { subscriptionId: string },
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.discountCode.applyTemplate(templateId, body.subscriptionId, actor)
  }
}
