/**
 * DiscountCodeService — Stripe Coupons + PromotionCodes + cap validation.
 *
 * Sprint BILLING-CORE Day 4.
 *
 * REGLAS aplicadas (ver docs/engineering/stripe-best-practices.md):
 *   §2.1 Idempotency key estable: create_coupon_{requestId}, create_promo_{...}
 *   §2.8 Metadata zenix_consultor_id + zenix_organization_id en cada Stripe obj
 *   §2.9 Error categorization unificada (reutilizado de SubscriptionService)
 *   Issue C — Discount SIEMPRE a nivel Subscription, NUNCA Customer
 *
 * Decisión owner aprobada §D-BILL-3 (cap matrix 2026-05-26):
 *   AUTHORIZED 15% / 3 meses max
 *   SILVER     25% / 6 meses max
 *   GOLD       35% / 12 meses max
 *   PLATINUM   50% / forever permitido
 *   PLATFORM_ADMIN ∞
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import type { JwtPayload } from '@zenix/shared'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from '../nova/audit/audit-log.service'
import { BillingService } from './billing.service'
import type {
  DiscountDuration,
  GenerateDiscountCodeDto,
  RejectApprovalDto,
  SaveConsultorTemplateDto,
} from './dto/discount-code.dto'

const APPROVAL_TTL_DAYS = 7
const BACKOFF_MS = [500, 1000, 2000, 4000]

interface StripeCoupon {
  id: string
  percent_off: number | null
  duration: string
  duration_in_months: number | null
  metadata: Record<string, string>
}
interface StripePromotionCode {
  id: string
  code: string
  coupon: { id: string }
  customer: string | null
  active: boolean
  metadata: Record<string, string>
}

@Injectable()
export class DiscountCodeService {
  private readonly logger = new Logger(DiscountCodeService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════
  // generate — flujo principal del consultor
  // ═══════════════════════════════════════════════════════════════════
  /**
   * Genera un descuento para una subscription. Si excede el cap del
   * partner tier del consultor, crea ApprovalRequest pending en lugar
   * de aplicar el descuento.
   *
   * @returns
   *   { kind: 'applied', discount: SubscriptionDiscount } cuando dentro de cap
   *   { kind: 'pending_approval', request: DiscountApprovalRequest } cuando excede
   */
  async generate(
    dto: GenerateDiscountCodeDto,
    actor: JwtPayload,
  ): Promise<
    | { kind: 'applied'; discount: any }
    | { kind: 'pending_approval'; request: any }
  > {
    if (!this.billing.isStripeConfigured()) {
      throw new InternalServerErrorException('Stripe no configurado')
    }
    this.validateDurationConsistency(dto)

    // ── Validar subscription existe + activa ──
    const sub = await this.prisma.subscription.findUnique({
      where: { id: dto.subscriptionId },
    })
    if (!sub) throw new NotFoundException(`Subscription ${dto.subscriptionId} no encontrada`)
    if (!['active', 'trialing', 'past_due'].includes(sub.status)) {
      throw new ConflictException(
        `No se puede aplicar descuento a subscription en status '${sub.status}'`,
      )
    }

    // ── Validar cap del partner tier ──
    const partnerTier = await this.resolveActorPartnerTier(actor)
    const capCheck = await this.checkAgainstCap(partnerTier, dto)

    if (!capCheck.withinCap) {
      const auto = dto.autoRequestApprovalIfExceedsCap !== false
      if (!auto) {
        throw new ForbiddenException(
          `Tu tier ${partnerTier} permite max ${capCheck.maxPct}% off / ${
            capCheck.maxDurationMonths ?? 'forever'
          } meses. ` +
            `Pediste ${dto.percentOff}% / ${dto.duration}${
              dto.durationInMonths ? ` (${dto.durationInMonths}m)` : ''
            }.`,
        )
      }
      // Crear approval request
      return {
        kind: 'pending_approval',
        request: await this.createApprovalRequest(dto, sub, actor, partnerTier, capCheck),
      }
    }

    // ── Dentro de cap → crear Stripe Coupon + PromotionCode + aplicar ──
    const discount = await this.createAndApplyDiscount(dto, sub, actor, /* approvedById */ actor.sub)
    return { kind: 'applied', discount }
  }

  // ═══════════════════════════════════════════════════════════════════
  // approveRequest — PARTNER_ADMIN+ aprueba un pending
  // ═══════════════════════════════════════════════════════════════════
  async approveRequest(approvalId: string, actor: JwtPayload) {
    if (!this.isApproverTier(actor)) {
      throw new ForbiddenException(
        'Solo PARTNER_ADMIN o PLATFORM_ADMIN pueden aprobar discount requests',
      )
    }

    const request = await this.prisma.discountApprovalRequest.findUnique({
      where: { id: approvalId },
    })
    if (!request) throw new NotFoundException(`Approval request ${approvalId} no encontrada`)
    if (request.status !== 'PENDING') {
      throw new ConflictException(`Request ya está ${request.status}, no se puede aprobar`)
    }
    if (request.expiresAt < new Date()) {
      // Marcar como EXPIRED + throw
      await this.prisma.discountApprovalRequest.update({
        where: { id: approvalId },
        data: { status: 'EXPIRED' },
      })
      throw new ConflictException('Request expiró antes de ser aprobada')
    }
    if (!request.subscriptionId) {
      throw new ConflictException('Request sin subscription asociada — no se puede aplicar')
    }

    const sub = await this.prisma.subscription.findUnique({
      where: { id: request.subscriptionId },
    })
    if (!sub) throw new NotFoundException(`Subscription asociada no encontrada`)
    if (!['active', 'trialing', 'past_due'].includes(sub.status)) {
      throw new ConflictException(
        `Subscription en status '${sub.status}' — no se puede aplicar discount`,
      )
    }

    // Reconstruir el DTO desde el request + aplicar
    const dto: GenerateDiscountCodeDto = {
      subscriptionId: request.subscriptionId,
      percentOff: request.percentOff,
      duration: request.duration as DiscountDuration,
      durationInMonths: request.durationInMonths ?? undefined,
      reason: `[APROBADO por ${actor.sub}] ${request.reason}`,
    }

    const discount = await this.createAndApplyDiscount(dto, sub, actor, actor.sub)

    // Update request
    const updated = await this.prisma.discountApprovalRequest.update({
      where: { id: approvalId },
      data: {
        status: 'APPROVED',
        reviewedById: actor.sub,
        reviewedAt: new Date(),
        resultingDiscountId: discount.id,
      },
    })

    await this.safeAuditLog({
      organizationId: request.organizationId,
      actor,
      action: 'DISCOUNT_APPROVAL_GRANTED',
      target: updated.id,
      payload: {
        approvalRequestId: updated.id,
        originallyRequestedById: request.requestedById,
        discountId: discount.id,
        percentOff: request.percentOff,
        duration: request.duration,
        durationInMonths: request.durationInMonths,
      },
    })

    return { request: updated, discount }
  }

  // ═══════════════════════════════════════════════════════════════════
  // rejectRequest
  // ═══════════════════════════════════════════════════════════════════
  async rejectRequest(approvalId: string, dto: RejectApprovalDto, actor: JwtPayload) {
    if (!this.isApproverTier(actor)) {
      throw new ForbiddenException(
        'Solo PARTNER_ADMIN o PLATFORM_ADMIN pueden rechazar discount requests',
      )
    }

    const request = await this.prisma.discountApprovalRequest.findUnique({
      where: { id: approvalId },
    })
    if (!request) throw new NotFoundException(`Approval request ${approvalId} no encontrada`)
    if (request.status !== 'PENDING') {
      throw new ConflictException(`Request ya está ${request.status}, no se puede rechazar`)
    }

    const updated = await this.prisma.discountApprovalRequest.update({
      where: { id: approvalId },
      data: {
        status: 'REJECTED',
        reviewedById: actor.sub,
        reviewedAt: new Date(),
        rejectionReason: dto.rejectionReason,
      },
    })

    await this.safeAuditLog({
      organizationId: request.organizationId,
      actor,
      action: 'DISCOUNT_APPROVAL_REJECTED',
      target: updated.id,
      payload: {
        originallyRequestedById: request.requestedById,
        percentOff: request.percentOff,
        rejectionReason: dto.rejectionReason,
      },
    })

    return updated
  }

  // ═══════════════════════════════════════════════════════════════════
  // listApprovalsForReviewer — PARTNER_ADMIN+ ve pending requests
  // ═══════════════════════════════════════════════════════════════════
  async listPendingApprovals(actor: JwtPayload) {
    if (!this.isApproverTier(actor)) {
      throw new ForbiddenException()
    }
    // PARTNER_ADMIN ve solo sus orgs asignadas; PLATFORM_ADMIN ve todo.
    if ((actor as any).actorTier === 'PLATFORM') {
      return this.prisma.discountApprovalRequest.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      })
    }
    // PARTNER_ADMIN — filtrar por assignedOrgIds
    const assignedOrgIds = (actor as any).assignedOrgIds ?? []
    if (assignedOrgIds.length === 0) return []
    return this.prisma.discountApprovalRequest.findMany({
      where: {
        status: 'PENDING',
        organizationId: { in: assignedOrgIds },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  // ═══════════════════════════════════════════════════════════════════
  // Consultor templates ("mis códigos favoritos")
  // ═══════════════════════════════════════════════════════════════════
  async saveTemplate(dto: SaveConsultorTemplateDto, actor: JwtPayload) {
    this.validateDurationConsistency(dto)
    return this.prisma.consultorDiscountTemplate.create({
      data: {
        consultorId: actor.sub,
        name: dto.name,
        percentOff: dto.percentOff,
        duration: dto.duration,
        durationInMonths: dto.durationInMonths ?? null,
        isFavorite: dto.isFavorite ?? false,
      },
    })
  }

  async listTemplates(actor: JwtPayload) {
    return this.prisma.consultorDiscountTemplate.findMany({
      where: { consultorId: actor.sub },
      orderBy: [{ isFavorite: 'desc' }, { createdAt: 'desc' }],
    })
  }

  async deleteTemplate(templateId: string, actor: JwtPayload) {
    const tpl = await this.prisma.consultorDiscountTemplate.findUnique({
      where: { id: templateId },
    })
    if (!tpl) throw new NotFoundException()
    if (tpl.consultorId !== actor.sub && (actor as any).actorTier !== 'PLATFORM') {
      throw new ForbiddenException('Solo puedes borrar tus propios templates')
    }
    await this.prisma.consultorDiscountTemplate.delete({ where: { id: templateId } })
    return { ok: true }
  }

  // ═══════════════════════════════════════════════════════════════════
  // applyTemplate — Sprint BILLING-DISCOUNT-CODES Day 1
  // Aplica un template pre-configurado a una subscription. Wrapper sobre
  // generate() que extrae percentOff/duration/durationInMonths/reason del
  // template en vez de leerlos del DTO inline.
  //
  // El cap se valida al APPLY time (D-DC-3): el consultor puede tener
  // templates que excedan su cap actual (ej anticipando promoción) — al
  // aplicar, genera approval request automáticamente.
  // ═══════════════════════════════════════════════════════════════════
  async applyTemplate(
    templateId: string,
    subscriptionId: string,
    actor: JwtPayload,
  ): Promise<
    | { kind: 'applied'; discount: any; templateName: string }
    | { kind: 'pending_approval'; request: any; templateName: string }
  > {
    const tpl = await this.prisma.consultorDiscountTemplate.findUnique({
      where: { id: templateId },
    })
    if (!tpl) throw new NotFoundException(`Template ${templateId} no encontrado`)

    // Ownership: solo el creador del template puede aplicarlo (D-DC-1).
    // PLATFORM puede bypass.
    if (tpl.consultorId !== actor.sub && (actor as any).actorTier !== 'PLATFORM') {
      throw new ForbiddenException(
        'Solo puedes aplicar tus propios templates de descuento',
      )
    }

    const result = await this.generate(
      {
        subscriptionId,
        percentOff: tpl.percentOff,
        duration: tpl.duration as 'once' | 'repeating' | 'forever',
        durationInMonths: tpl.durationInMonths ?? undefined,
        reason: `[Template: ${tpl.name}] Aplicado desde código pre-configurado del consultor`,
        autoRequestApprovalIfExceedsCap: true,
      },
      actor,
    )

    if (result.kind === 'applied') {
      return { kind: 'applied', discount: result.discount, templateName: tpl.name }
    }
    return { kind: 'pending_approval', request: result.request, templateName: tpl.name }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Helpers privados — core logic
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Crea Stripe Coupon + PromotionCode + aplica a Subscription
   * + persiste SubscriptionDiscount + AuditLog. Idempotency key estable
   * per generated discount.
   */
  private async createAndApplyDiscount(
    dto: GenerateDiscountCodeDto,
    sub: any,
    actor: JwtPayload,
    approvedById: string,
  ) {
    const stripe = this.billing.getStripeClient() as any
    const generatedId = this.generateLocalId()

    // ── Crear Stripe Coupon ──
    let coupon: StripeCoupon
    try {
      coupon = await this.withRetry(
        async () =>
          (await stripe.coupons.create(
            {
              percent_off: dto.percentOff,
              duration: dto.duration,
              ...(dto.duration === 'repeating' && dto.durationInMonths
                ? { duration_in_months: dto.durationInMonths }
                : {}),
              max_redemptions: 1,
              metadata: this.zenixMetadata({
                zenix_subscription_id: sub.id,
                zenix_organization_id: sub.organizationId,
                zenix_generated_by: actor.sub,
                zenix_approved_by: approvedById,
                zenix_reason_truncated: dto.reason.slice(0, 90),
                zenix_local_id: generatedId,
              }),
            },
            { idempotencyKey: `create_coupon_${generatedId}` },
          )) as StripeCoupon,
      )
    } catch (err) {
      throw this.translateStripeError(err)
    }

    // ── Crear PromotionCode (código legible) ──
    const codeText = dto.promotionCode?.toUpperCase() ?? this.buildDefaultPromotionCode(sub)
    let promo: StripePromotionCode | null = null
    try {
      promo = await this.withRetry(
        async () =>
          (await stripe.promotionCodes.create(
            {
              coupon: coupon.id,
              code: codeText,
              customer: sub.stripeCustomerId,
              max_redemptions: 1,
              metadata: this.zenixMetadata({
                zenix_subscription_id: sub.id,
                zenix_organization_id: sub.organizationId,
                zenix_local_id: generatedId,
              }),
            },
            { idempotencyKey: `create_promo_${generatedId}` },
          )) as StripePromotionCode,
      )
    } catch (err) {
      // Si falla la creación del PromotionCode, el Coupon ya existe en
      // Stripe (válido, pero sin código legible). Log + continúa — el
      // descuento sigue aplicable via coupon.id directo.
      this.logger.warn(
        `[DiscountCodeService] PromotionCode no se creó (${(err as Error).message?.slice(0, 100)}). Coupon ${coupon.id} sigue válido.`,
      )
    }

    // ── Aplicar Coupon a la Subscription (Issue C — subscription-level) ──
    // Netflix-style trial: si la Sub está en pending_payment_method
    // (stripeSubscriptionId='pending_<uuid>'), aún no existe en Stripe.
    // Persistimos el couponId en Subscription.pendingCouponId — el webhook
    // setup_intent.succeeded lo attachará al crear la Sub real.
    const isPendingPaymentMethod =
      sub.status === 'pending_payment_method' ||
      String(sub.stripeSubscriptionId).startsWith('pending_')
    if (isPendingPaymentMethod) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { pendingCouponId: coupon.id },
      })
    } else {
      try {
        await this.withRetry(
          async () =>
            await stripe.subscriptions.update(
              sub.stripeSubscriptionId,
              { discounts: [{ coupon: coupon.id }] },
              { idempotencyKey: `apply_discount_${generatedId}` },
            ),
        )
      } catch (err) {
        throw this.translateStripeError(err)
      }
    }

    // ── Persistir SubscriptionDiscount local ──
    const discount = await this.prisma.subscriptionDiscount.create({
      data: {
        subscriptionId: sub.id,
        stripeCouponId: coupon.id,
        stripePromotionCodeId: promo?.id ?? null,
        promotionCode: codeText,
        percentOff: dto.percentOff,
        duration: dto.duration,
        durationInMonths: dto.durationInMonths ?? null,
        generatedById: actor.sub,
        generatedByRole: (actor as any).role ?? 'UNKNOWN',
        reason: dto.reason,
        approvedById,
        approvedAt: new Date(),
        appliedAt: new Date(),
        expiresAt: dto.duration === 'once'
          ? new Date(Date.now() + 365 * 86400 * 1000) // 1 año max
          : dto.duration === 'repeating' && dto.durationInMonths
            ? new Date(Date.now() + dto.durationInMonths * 30 * 86400 * 1000)
            : null,
      },
    })

    await this.safeAuditLog({
      organizationId: sub.organizationId,
      actor,
      action: 'DISCOUNT_APPLIED',
      target: discount.id,
      payload: {
        subscriptionId: sub.id,
        promotionCode: codeText,
        percentOff: dto.percentOff,
        duration: dto.duration,
        durationInMonths: dto.durationInMonths,
        approvedById,
        selfApproved: approvedById === actor.sub,
        reason: dto.reason,
      },
    })

    return discount
  }

  private async createApprovalRequest(
    dto: GenerateDiscountCodeDto,
    sub: any,
    actor: JwtPayload,
    partnerTier: string,
    capCheck: { maxPct: number; maxDurationMonths: number | null; reason: string },
  ) {
    const request = await this.prisma.discountApprovalRequest.create({
      data: {
        requestedById: actor.sub,
        requestedByRole: (actor as any).role ?? 'UNKNOWN',
        organizationId: sub.organizationId,
        subscriptionId: sub.id,
        percentOff: dto.percentOff,
        duration: dto.duration,
        durationInMonths: dto.durationInMonths ?? null,
        reason: dto.reason,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + APPROVAL_TTL_DAYS * 86400 * 1000),
      },
    })

    await this.safeAuditLog({
      organizationId: sub.organizationId,
      actor,
      action: 'DISCOUNT_APPROVAL_REQUESTED',
      target: request.id,
      payload: {
        partnerTier,
        requestedPct: dto.percentOff,
        requestedDuration: dto.duration,
        requestedDurationInMonths: dto.durationInMonths,
        capPct: capCheck.maxPct,
        capDurationMonths: capCheck.maxDurationMonths,
        capReason: capCheck.reason,
        ttlDays: APPROVAL_TTL_DAYS,
      },
    })

    // Day 5+ disparar AppNotification + email a PARTNER_ADMIN+
    this.logger.log(
      `[DiscountCodeService] Approval request ${request.id} creada (partner_tier=${partnerTier} pidió ${dto.percentOff}%/${dto.duration}).`,
    )

    return request
  }

  /**
   * Resuelve el partner tier del actor para validación de cap.
   * - PLATFORM_ADMIN → 'PLATFORM' (sin cap)
   * - PARTNER_MEMBER → tier del Partner asociado (vía PartnerMember.partnerId → Partner.tier)
   * - PARTNER_ADMIN → tier del Partner (puede self-approve hasta su tier)
   * - ORG_OWNER / ORG_STAFF → no aplica (no pueden generar discounts)
   */
  private async resolveActorPartnerTier(actor: JwtPayload): Promise<string> {
    const tier = (actor as any).actorTier
    if (tier === 'PLATFORM') return 'PLATFORM'
    if (!['PARTNER_ADMIN', 'PARTNER_MEMBER'].includes(tier)) {
      throw new ForbiddenException(
        'Solo PLATFORM_ADMIN, PARTNER_ADMIN o PARTNER_MEMBER pueden generar discount codes',
      )
    }
    // Resolver PartnerMember → Partner.tier
    const pm = await this.prisma.partnerMember.findUnique({
      where: { userId: actor.sub },
      include: { partner: { select: { tier: true } } },
    })
    if (!pm) {
      throw new ForbiddenException('Tu usuario no está vinculado a un Partner')
    }
    return pm.partner.tier
  }

  /**
   * Verifica si el discount solicitado cabe dentro del cap del partner tier.
   * Si tier='PLATFORM' siempre devuelve withinCap=true.
   */
  private async checkAgainstCap(
    partnerTier: string,
    dto: GenerateDiscountCodeDto,
  ): Promise<{ withinCap: boolean; maxPct: number; maxDurationMonths: number | null; reason: string }> {
    if (partnerTier === 'PLATFORM') {
      return { withinCap: true, maxPct: 100, maxDurationMonths: null, reason: 'PLATFORM sin cap' }
    }
    const cap = await this.prisma.billingPartnerTierCap.findUnique({
      where: { tier: partnerTier },
    })
    if (!cap) {
      // Tier sin cap configurado → conservador: reject hasta config
      return {
        withinCap: false,
        maxPct: 0,
        maxDurationMonths: 0,
        reason: `Cap para tier '${partnerTier}' no configurado en billing_partner_tier_caps`,
      }
    }

    // Pct check
    if (dto.percentOff > cap.maxDiscountPct) {
      return {
        withinCap: false,
        maxPct: cap.maxDiscountPct,
        maxDurationMonths: cap.maxDurationMonths,
        reason: `Pct ${dto.percentOff}% excede cap ${cap.maxDiscountPct}% del tier ${partnerTier}`,
      }
    }

    // Duration check
    if (dto.duration === 'forever') {
      // Solo permitido si cap.maxDurationMonths es null (sin límite)
      if (cap.maxDurationMonths !== null) {
        return {
          withinCap: false,
          maxPct: cap.maxDiscountPct,
          maxDurationMonths: cap.maxDurationMonths,
          reason: `Tier ${partnerTier} no permite 'forever' (max ${cap.maxDurationMonths}m)`,
        }
      }
    } else if (dto.duration === 'repeating' && dto.durationInMonths && cap.maxDurationMonths !== null) {
      if (dto.durationInMonths > cap.maxDurationMonths) {
        return {
          withinCap: false,
          maxPct: cap.maxDiscountPct,
          maxDurationMonths: cap.maxDurationMonths,
          reason: `Duration ${dto.durationInMonths}m excede cap ${cap.maxDurationMonths}m del tier ${partnerTier}`,
        }
      }
    }

    return {
      withinCap: true,
      maxPct: cap.maxDiscountPct,
      maxDurationMonths: cap.maxDurationMonths,
      reason: 'OK',
    }
  }

  private isApproverTier(actor: JwtPayload): boolean {
    const tier = (actor as any).actorTier
    return tier === 'PLATFORM' || tier === 'PARTNER_ADMIN'
  }

  private validateDurationConsistency(dto: {
    duration: DiscountDuration
    durationInMonths?: number
  }) {
    if (dto.duration === 'repeating' && !dto.durationInMonths) {
      throw new BadRequestException("duration='repeating' requiere durationInMonths")
    }
    if (dto.duration !== 'repeating' && dto.durationInMonths) {
      throw new BadRequestException(
        "durationInMonths solo aplica para duration='repeating'",
      )
    }
  }

  private buildDefaultPromotionCode(sub: any): string {
    // Format: ZAHAR-{orgSlug?-fallback}-{YYMM}-{random4}
    const yyMm = new Date().toISOString().slice(2, 7).replace('-', '')
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
    return `ZAHAR-${sub.id.slice(0, 6).toUpperCase()}-${yyMm}-${rand}`
  }

  private generateLocalId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  private zenixMetadata(extra: Record<string, string | undefined>): Record<string, string> {
    const base: Record<string, string> = {
      zenix_environment: process.env.NODE_ENV ?? 'development',
      created_at: new Date().toISOString(),
    }
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined && v !== null) base[k] = String(v)
    }
    return base
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
      try {
        return await fn()
      } catch (err) {
        const e = err as { type?: string; statusCode?: number }
        const isRetryable =
          e.type === 'StripeRateLimitError' ||
          e.type === 'StripeAPIError' ||
          e.type === 'StripeConnectionError' ||
          e.statusCode === 429
        if (!isRetryable || attempt === BACKOFF_MS.length) throw err
        await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]))
      }
    }
    throw new Error('withRetry exhausted')
  }

  private translateStripeError(err: unknown): Error {
    const e = err as { type?: string; message?: string }
    switch (e.type) {
      case 'StripeCardError':
        return new BadRequestException(`Tarjeta rechazada: ${e.message}`)
      case 'StripeInvalidRequestError':
        this.logger.error('[DiscountCode] InvalidRequest:', err)
        return new InternalServerErrorException('Configuración inválida del request')
      case 'StripeAuthenticationError':
        this.logger.error('[DiscountCode] CRITICAL: Auth failed')
        return new InternalServerErrorException('Credenciales Stripe inválidas')
      case 'StripePermissionError':
        return new InternalServerErrorException('API key sin permisos suficientes')
      case 'StripeAPIError':
      case 'StripeConnectionError':
        return new InternalServerErrorException('Stripe API temporalmente no disponible')
      case 'StripeRateLimitError':
        return new InternalServerErrorException('Rate limit alcanzado')
      default:
        this.logger.error('[DiscountCode] Unhandled error type:', err)
        return new InternalServerErrorException('Error inesperado generando descuento')
    }
  }

  private async safeAuditLog(input: {
    organizationId: string
    actor: JwtPayload
    action: string
    target: string
    payload: Record<string, unknown>
  }) {
    try {
      await this.auditLog.write({
        organizationId: input.organizationId,
        actorRealId: input.actor.sub,
        actorRealRole: ((input.actor as any).role ?? 'UNKNOWN') as never,
        action: input.action,
        target: input.target,
        payload: input.payload,
        status: 'SUCCESS',
        retentionPolicy: 'PERMANENT',
      })
    } catch (err) {
      this.logger.error(`[safeAuditLog] write falló: ${String(err).slice(0, 200)}`)
    }
  }
}
