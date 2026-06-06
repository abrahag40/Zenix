/**
 * SubscriptionService — CRUD de Subscriptions Zenix ↔ Stripe.
 *
 * Sprint BILLING-CORE Day 3.
 *
 * REGLAS OBLIGATORIAS aplicadas (ver docs/engineering/stripe-best-practices.md):
 *   §2.1 Idempotency key en TODA mutation
 *   §2.2 Webhook es source-of-truth (persistimos local con status tentativo)
 *   §2.3 Manejo de los 8 statuses Subscription
 *   §2.4 Currency inmutable per Subscription
 *   §2.5 Proration choice explícita per operación
 *   §2.6 Cancel graceful (cancel_at_period_end) default
 *   §2.7 Pause behavior 'void'
 *   §2.8 Metadata para traceabilidad
 *   §2.9 Error categorization de los 8 Stripe error types
 *   §2.10 Rate limit handling con exponential backoff
 *
 * Issues conocidos evitados (ver §3 del doc):
 *   A. Webhook race condition — UPSERT pattern + metadata.zenix_organization_id
 *   B. Subscription stuck en `incomplete` — forced trial 1d cuando no hay PM
 *   C. Discount stacking — descuentos a nivel Subscription, NO Customer
 *   D. Paused→cancel — resume primero si está paused
 *   F. Customer Portal URL caduca 5min — NUNCA persistir
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import type { JwtPayload } from '@zenix/shared'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from '../nova/audit/audit-log.service'
import { BillingService } from './billing.service'
import type {
  CancelSubscriptionDto,
  ChangePlanDto,
  CreatePendingSubscriptionDto,
  CreateSetupCheckoutSessionDto,
  CreateSubscriptionDto,
  PauseSubscriptionDto,
  PlanTier,
} from './dto/subscription.dto'

// Tipos Stripe locales (workaround SDK v22 namespace issues — ver
// stripe-best-practices.md §6 reference matrix)
interface StripeCustomer {
  id: string
  email: string | null
  metadata: Record<string, string>
}
interface StripeSubscription {
  id: string
  customer: string
  status: string
  current_period_start: number
  current_period_end: number
  cancel_at_period_end: boolean
  canceled_at: number | null
  trial_start: number | null
  trial_end: number | null
  pause_collection: { behavior: string; resumes_at: number | null } | null
  metadata: Record<string, string>
  items: { data: Array<{ id: string; price: { id: string; unit_amount: number; currency: string } }> }
}
interface StripeBillingPortalSession {
  id: string
  url: string
  return_url: string
  expires_at: number
}
interface StripeCheckoutSession {
  id: string
  url: string | null
  customer: string | null
  mode: string
  setup_intent: string | null
  status: string
  metadata: Record<string, string>
}
interface StripeSetupIntent {
  id: string
  customer: string | null
  payment_method: string | null
  status: string
  metadata: Record<string, string>
}

const BACKOFF_MS = [500, 1000, 2000, 4000] // 4 intentos exponential

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════
  // createSubscription
  // ═══════════════════════════════════════════════════════════════════
  /**
   * Crea o asegura una Subscription Zenix para una Organization.
   *
   * Flow (siguiendo best-practices §2.1 + §2.2 + Issue A):
   *  1. Verify Organization existe + no tiene subscription activa
   *  2. Lookup-or-create Stripe Customer (idempotent vía
   *     idempotencyKey=create_customer_{orgId})
   *  3. Resolver Stripe Price ID desde billing_pricing_config
   *  4. Pre-persistir local Subscription con stripeSubscriptionId='pending_<uuid>'
   *     (evita race condition con webhook)
   *  5. Crear Stripe Subscription con idempotencyKey + metadata + Customer
   *  6. UPDATE local Subscription con stripeSubscriptionId real + status del
   *     response (tentativo — webhook confirma)
   *  7. AuditLog SUBSCRIPTION_CREATED
   */
  async createSubscription(dto: CreateSubscriptionDto, actor: JwtPayload) {
    if (!this.billing.isStripeConfigured()) {
      throw new InternalServerErrorException(
        'Stripe no configurado en este server. Verifica STRIPE_SECRET_KEY.',
      )
    }

    // ── (1) Validate Organization + no duplicate subscription ──────
    const org = await this.prisma.organization.findUnique({
      where: { id: dto.organizationId },
    })
    if (!org) {
      throw new NotFoundException(`Organization ${dto.organizationId} no encontrada`)
    }
    const existing = await this.prisma.subscription.findUnique({
      where: { organizationId: dto.organizationId },
    })
    if (existing && !['canceled', 'incomplete_expired'].includes(existing.status)) {
      throw new ConflictException(
        `Organization ${dto.organizationId} ya tiene subscription ${existing.id} (status=${existing.status}). ` +
          'Si necesitas reemplazar, cancela primero.',
      )
    }

    // ── (2) Resolve Stripe Price desde pricing config ──────────────
    const pricingConfig = await this.billing.getPricingConfig(dto.planTier)
    if (!pricingConfig) {
      throw new NotFoundException(`Plan tier ${dto.planTier} no existe en billing_pricing_config`)
    }
    const stripePriceId =
      dto.currency === 'MXN' ? pricingConfig.stripePriceIdMxn : pricingConfig.stripePriceIdUsd
    if (!stripePriceId) {
      throw new InternalServerErrorException(
        `Stripe Price ID no configurado para ${dto.planTier} ${dto.currency}. ` +
          'Ejecuta seed-billing.ts primero.',
      )
    }

    const stripe = this.billing.getStripeClient() as any

    // ── (3) Lookup-or-create Stripe Customer ────────────────────────
    let customer: StripeCustomer
    try {
      customer = await this.withRetry(
        async () =>
          (await stripe.customers.create(
            {
              email: dto.ownerEmail.toLowerCase().trim(),
              name: `${dto.ownerName} — ${org.name}`,
              metadata: this.zenixMetadata({
                zenix_organization_id: dto.organizationId,
                zenix_organization_name: org.name,
                created_by: 'SubscriptionService.createSubscription',
                actor_id: actor.sub,
              }),
            },
            { idempotencyKey: `create_customer_${dto.organizationId}` },
          )) as StripeCustomer,
      )
    } catch (err) {
      throw this.translateStripeError(err)
    }

    // ── (4) Pre-persist local con stripeSubscriptionId pendiente ───
    const tentativeStripeSubId = `pending_${randomUUID()}`
    const tentativeRow = await this.prisma.subscription.upsert({
      where: { organizationId: dto.organizationId },
      create: {
        organizationId: dto.organizationId,
        stripeCustomerId: customer.id,
        stripeSubscriptionId: tentativeStripeSubId,
        planTier: dto.planTier,
        status: 'pending_create',
        billingCycle: dto.billingCycle,
        annualDiscountPct: dto.billingCycle === 'annual' ? 20 : null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400 * 1000), // placeholder
        baseMonthlyAmount: pricingConfig.monthlyAmountMxn,
        currency: dto.currency,
        propertyCount: dto.propertyCount,
        nextRenewalDate: new Date(Date.now() + 30 * 86400 * 1000), // placeholder
        autoRenew: true,
      },
      update: {
        // Si era cancelled y ahora reactivan, actualizamos
        stripeCustomerId: customer.id,
        stripeSubscriptionId: tentativeStripeSubId,
        planTier: dto.planTier,
        status: 'pending_create',
      },
    })

    // ── (5) Create Stripe Subscription ──────────────────────────────
    let stripeSub: StripeSubscription
    try {
      // Forced trial 1d si no se especifica — evita Issue B (subscription
      // stuck en incomplete sin payment method)
      const trialDays = dto.trialDays ?? (dto.allowIncompleteWithoutPaymentMethod ? 1 : 0)

      const createParams: any = {
        customer: customer.id,
        items: [{ price: stripePriceId, quantity: dto.propertyCount }],
        // Discount a nivel Subscription, NO Customer — evita Issue C
        ...(dto.stripeCouponId ? { discounts: [{ coupon: dto.stripeCouponId }] } : {}),
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
        // Si no hay payment method y queremos permitir incomplete, default behavior
        payment_behavior: dto.allowIncompleteWithoutPaymentMethod
          ? 'default_incomplete'
          : 'allow_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription',
        },
        expand: ['latest_invoice', 'latest_invoice.payment_intent'],
        metadata: this.zenixMetadata({
          zenix_organization_id: dto.organizationId,
          zenix_organization_name: org.name,
          zenix_plan_tier: dto.planTier,
          zenix_billing_cycle: dto.billingCycle,
          zenix_property_count: String(dto.propertyCount),
          created_by: 'SubscriptionService.createSubscription',
          actor_id: actor.sub,
        }),
      }

      stripeSub = await this.withRetry(
        async () =>
          (await stripe.subscriptions.create(createParams, {
            idempotencyKey: `create_sub_${dto.organizationId}`,
          })) as StripeSubscription,
      )
    } catch (err) {
      // Rollback local row si el create falló
      await this.prisma.subscription.update({
        where: { id: tentativeRow.id },
        data: { status: 'incomplete_expired' },
      })
      throw this.translateStripeError(err)
    }

    // ── (6) Update local con Stripe response ───────────────────────
    const updated = await this.prisma.subscription.update({
      where: { id: tentativeRow.id },
      data: {
        stripeSubscriptionId: stripeSub.id,
        status: stripeSub.status,
        currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
        trialStartedAt: stripeSub.trial_start ? new Date(stripeSub.trial_start * 1000) : null,
        trialEndsAt: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null,
        nextRenewalDate: new Date(stripeSub.current_period_end * 1000),
        trialNegotiatedBy: stripeSub.trial_end ? actor.sub : null,
      },
    })

    // ── (7) AuditLog ────────────────────────────────────────────────
    await this.safeAuditLog({
      organizationId: dto.organizationId,
      actor,
      action: 'SUBSCRIPTION_CREATED',
      target: updated.id,
      payload: {
        stripeSubscriptionId: stripeSub.id,
        stripeCustomerId: customer.id,
        planTier: dto.planTier,
        billingCycle: dto.billingCycle,
        currency: dto.currency,
        propertyCount: dto.propertyCount,
        status: stripeSub.status,
        trialDays: stripeSub.trial_end ? Math.ceil((stripeSub.trial_end - Date.now() / 1000) / 86400) : 0,
        hasCoupon: !!dto.stripeCouponId,
      },
    })

    return updated
  }

  // ═══════════════════════════════════════════════════════════════════
  // changePlan
  // ═══════════════════════════════════════════════════════════════════
  /**
   * Cambia plan/propertyCount de una Subscription existente.
   *
   * Proration_behavior elegido per kind (best-practices §2.5):
   *   upgrade   → 'create_prorations' (cliente paga diferencia ya)
   *   downgrade → 'none' (efectivo siguiente ciclo)
   *
   * Currency es inmutable (§2.4) — si el cliente necesita cambio, debe
   * cancelar + crear nueva.
   */
  async changePlan(subscriptionId: string, dto: ChangePlanDto, actor: JwtPayload) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    })
    if (!sub) throw new NotFoundException(`Subscription ${subscriptionId} no encontrada`)
    if (!['active', 'trialing', 'past_due'].includes(sub.status)) {
      throw new ConflictException(
        `No se puede cambiar plan de subscription en status '${sub.status}'. ` +
          'Solo active/trialing/past_due permitidos.',
      )
    }

    const newPricing = await this.billing.getPricingConfig(dto.newPlanTier)
    if (!newPricing) throw new NotFoundException(`Plan tier ${dto.newPlanTier} no existe`)

    const newStripePriceId =
      sub.currency === 'MXN' ? newPricing.stripePriceIdMxn : newPricing.stripePriceIdUsd
    if (!newStripePriceId) {
      throw new InternalServerErrorException(
        `Stripe Price ID no configurado para ${dto.newPlanTier} ${sub.currency}`,
      )
    }

    // Determinar kind del cambio (upgrade / downgrade / lateral)
    const tierRank = { STARTER: 1, PRO: 2, ENTERPRISE: 3 }
    const fromRank = tierRank[sub.planTier as PlanTier] ?? 0
    const toRank = tierRank[dto.newPlanTier] ?? 0
    let kind: 'upgrade' | 'downgrade' = fromRank < toRank ? 'upgrade' : 'downgrade'
    // Mismo tier pero más properties = upgrade
    if (fromRank === toRank && dto.newPropertyCount > sub.propertyCount) kind = 'upgrade'
    if (fromRank === toRank && dto.newPropertyCount < sub.propertyCount) kind = 'downgrade'

    if (dto.changeKind && dto.changeKind !== 'auto') kind = dto.changeKind

    const prorationBehavior = kind === 'upgrade' ? 'create_prorations' : 'none'

    const stripe = this.billing.getStripeClient() as any

    // Get current item id (Stripe requiere item.id para hacer el update)
    const currentSubFromStripe = (await stripe.subscriptions.retrieve(
      sub.stripeSubscriptionId,
    )) as StripeSubscription
    const currentItemId = currentSubFromStripe.items.data[0]?.id
    if (!currentItemId) {
      throw new InternalServerErrorException(
        'Subscription Stripe sin items — estado inconsistente',
      )
    }

    let stripeSub: StripeSubscription
    try {
      stripeSub = await this.withRetry(
        async () =>
          (await stripe.subscriptions.update(
            sub.stripeSubscriptionId,
            {
              items: [
                {
                  id: currentItemId,
                  price: newStripePriceId,
                  quantity: dto.newPropertyCount,
                },
              ],
              proration_behavior: prorationBehavior,
              metadata: this.zenixMetadata({
                zenix_organization_id: sub.organizationId,
                zenix_plan_tier: dto.newPlanTier,
                zenix_previous_plan_tier: sub.planTier,
                zenix_property_count: String(dto.newPropertyCount),
                changed_by: actor.sub,
                change_kind: kind,
              }),
            },
            { idempotencyKey: `update_sub_${subscriptionId}_${Date.now()}` },
          )) as StripeSubscription,
      )
    } catch (err) {
      throw this.translateStripeError(err)
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        planTier: dto.newPlanTier,
        propertyCount: dto.newPropertyCount,
        baseMonthlyAmount: newPricing.monthlyAmountMxn,
        currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
        nextRenewalDate: new Date(stripeSub.current_period_end * 1000),
      },
    })

    await this.safeAuditLog({
      organizationId: sub.organizationId,
      actor,
      action: 'SUBSCRIPTION_PLAN_CHANGED',
      target: updated.id,
      payload: {
        from: { planTier: sub.planTier, propertyCount: sub.propertyCount },
        to: { planTier: dto.newPlanTier, propertyCount: dto.newPropertyCount },
        kind,
        prorationBehavior,
      },
    })

    return updated
  }

  // ═══════════════════════════════════════════════════════════════════
  // pauseSubscription
  // ═══════════════════════════════════════════════════════════════════
  /**
   * Pausa una Subscription via pause_collection.behavior='void'
   * (best-practices §2.7). Durante pause:
   *   - NO se generan invoices
   *   - billingStatus local se marca PAUSED
   *   - resumes_at se setea para auto-resume
   */
  async pauseSubscription(subscriptionId: string, dto: PauseSubscriptionDto, actor: JwtPayload) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    })
    if (!sub) throw new NotFoundException(`Subscription ${subscriptionId} no encontrada`)
    if (!['active', 'trialing'].includes(sub.status)) {
      throw new ConflictException(
        `No se puede pausar subscription en status '${sub.status}'. Solo active/trialing.`,
      )
    }

    const resumesAt = new Date(Date.now() + dto.pauseMonths * 30 * 86400 * 1000)
    const resumesAtUnix = Math.floor(resumesAt.getTime() / 1000)

    const stripe = this.billing.getStripeClient() as any
    let stripeSub: StripeSubscription
    try {
      stripeSub = await this.withRetry(
        async () =>
          (await stripe.subscriptions.update(
            sub.stripeSubscriptionId,
            {
              pause_collection: {
                behavior: 'void',
                resumes_at: resumesAtUnix,
              },
              metadata: this.zenixMetadata({
                zenix_organization_id: sub.organizationId,
                paused_by: actor.sub,
                pause_reason: dto.pauseReason ?? '',
                pause_months: String(dto.pauseMonths),
              }),
            },
            { idempotencyKey: `pause_sub_${subscriptionId}_${dto.pauseMonths}m` },
          )) as StripeSubscription,
      )
    } catch (err) {
      throw this.translateStripeError(err)
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'paused',
        pausedAt: new Date(),
        pausedUntil: resumesAt,
      },
    })

    await this.safeAuditLog({
      organizationId: sub.organizationId,
      actor,
      action: 'SUBSCRIPTION_PAUSED',
      target: updated.id,
      payload: {
        pauseMonths: dto.pauseMonths,
        resumesAt: resumesAt.toISOString(),
        reason: dto.pauseReason,
      },
    })

    return updated
  }

  // ═══════════════════════════════════════════════════════════════════
  // resumeSubscription
  // ═══════════════════════════════════════════════════════════════════
  /**
   * Reanuda Subscription pausada (limpia pause_collection).
   */
  async resumeSubscription(subscriptionId: string, actor: JwtPayload) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    })
    if (!sub) throw new NotFoundException(`Subscription ${subscriptionId} no encontrada`)
    if (sub.status !== 'paused') {
      throw new ConflictException(
        `Subscription no está paused (status=${sub.status}). Nada que reanudar.`,
      )
    }

    const stripe = this.billing.getStripeClient() as any
    let stripeSub: StripeSubscription
    try {
      stripeSub = await this.withRetry(
        async () =>
          (await stripe.subscriptions.update(
            sub.stripeSubscriptionId,
            {
              pause_collection: '' as any, // Stripe API quirk: enviar string vacío limpia el field
              metadata: this.zenixMetadata({
                zenix_organization_id: sub.organizationId,
                resumed_by: actor.sub,
              }),
            },
            { idempotencyKey: `resume_sub_${subscriptionId}_${Date.now()}` },
          )) as StripeSubscription,
      )
    } catch (err) {
      throw this.translateStripeError(err)
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: stripeSub.status, // típicamente 'active' o 'trialing'
        pausedUntil: null,
      },
    })

    await this.safeAuditLog({
      organizationId: sub.organizationId,
      actor,
      action: 'SUBSCRIPTION_RESUMED',
      target: updated.id,
      payload: { previousStatus: 'paused', currentStatus: updated.status },
    })

    return updated
  }

  // ═══════════════════════════════════════════════════════════════════
  // cancelSubscription
  // ═══════════════════════════════════════════════════════════════════
  /**
   * Cancela Subscription. Default: cancel_at_period_end (graceful) per §2.6.
   * Si dto.immediate=true (solo PLATFORM_ADMIN o casos extremos), cancel
   * inmediato sin refund (T&C v0.9 §8.1).
   *
   * Si subscription está paused, primero resume + después cancel (Issue D).
   */
  async cancelSubscription(
    subscriptionId: string,
    dto: CancelSubscriptionDto,
    actor: JwtPayload,
  ) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    })
    if (!sub) throw new NotFoundException(`Subscription ${subscriptionId} no encontrada`)
    if (['canceled', 'incomplete_expired'].includes(sub.status)) {
      throw new ConflictException(`Subscription ya está ${sub.status}`)
    }

    // Issue D: si paused → resume primero (Stripe limita updates en paused)
    if (sub.status === 'paused') {
      this.logger.log(`[cancelSubscription] Subscription ${subscriptionId} paused — resuming primero antes de cancel`)
      await this.resumeSubscription(subscriptionId, actor)
    }

    // Immediate cancel solo PLATFORM_ADMIN
    if (dto.immediate && actor.actorTier !== 'PLATFORM') {
      throw new BadRequestException(
        'Immediate cancellation requiere PLATFORM_ADMIN. Para clientes regulares usa cancel_at_period_end (default).',
      )
    }

    const stripe = this.billing.getStripeClient() as any
    let stripeSub: StripeSubscription
    try {
      if (dto.immediate) {
        // Cancel inmediato — sin refund (T&C §8.1)
        stripeSub = await this.withRetry(
          async () => (await stripe.subscriptions.cancel(sub.stripeSubscriptionId)) as StripeSubscription,
        )
      } else {
        // Graceful: cancel_at_period_end
        stripeSub = await this.withRetry(
          async () =>
            (await stripe.subscriptions.update(
              sub.stripeSubscriptionId,
              {
                cancel_at_period_end: true,
                cancellation_details: {
                  comment: dto.feedbackText?.slice(0, 500),
                  feedback: this.mapZenixReasonToStripeFeedback(dto.cancellationReason),
                },
                metadata: this.zenixMetadata({
                  zenix_organization_id: sub.organizationId,
                  canceled_by: actor.sub,
                  cancellation_reason: dto.cancellationReason,
                }),
              },
              {
                // Idempotency key permite cancel multiple veces dentro del mismo minuto
                idempotencyKey: `cancel_sub_${subscriptionId}_${Math.floor(Date.now() / 60000)}`,
              },
            )) as StripeSubscription,
        )
      }
    } catch (err) {
      throw this.translateStripeError(err)
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: dto.immediate ? 'canceled' : sub.status, // graceful conserva status hasta period_end
        cancelAtPeriodEnd: !dto.immediate,
        cancelledAt: dto.immediate ? new Date() : null,
        cancellationReason: dto.cancellationReason,
      },
    })

    await this.safeAuditLog({
      organizationId: sub.organizationId,
      actor,
      action: dto.immediate ? 'SUBSCRIPTION_CANCELLED_IMMEDIATE' : 'SUBSCRIPTION_CANCEL_SCHEDULED',
      target: updated.id,
      payload: {
        cancellationReason: dto.cancellationReason,
        feedbackText: dto.feedbackText,
        immediate: !!dto.immediate,
        accessUntil: updated.currentPeriodEnd.toISOString(),
      },
    })

    return updated
  }

  // ═══════════════════════════════════════════════════════════════════
  // createCustomerPortalSession
  // ═══════════════════════════════════════════════════════════════════
  /**
   * Genera URL temporal del Customer Portal Stripe.
   * URL caduca en 5 min (best-practices §3 Issue F) — NUNCA persistir.
   */
  async createCustomerPortalSession(organizationId: string, returnUrl?: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { organizationId },
    })
    if (!sub) {
      throw new NotFoundException(
        `Organization ${organizationId} no tiene subscription — no se puede generar Customer Portal`,
      )
    }

    const stripe = this.billing.getStripeClient() as any
    try {
      const session = (await stripe.billingPortal.sessions.create({
        customer: sub.stripeCustomerId,
        return_url: returnUrl ?? process.env.APP_BASE_URL ?? 'https://app.zenix.com/settings/billing',
      })) as StripeBillingPortalSession
      return {
        url: session.url,
        expiresAt: new Date(session.expires_at * 1000).toISOString(),
      }
    } catch (err) {
      throw this.translateStripeError(err)
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Netflix-style trial — createPendingSubscription
  // ═══════════════════════════════════════════════════════════════════
  /**
   * Creates Stripe Customer + persists local Subscription with
   * status='pending_payment_method'. NO Stripe Subscription is created yet —
   * that happens in activateAfterSetupIntent() once the customer adds a card
   * via Stripe Checkout (mode=setup).
   *
   * Rationale: Netflix/Spotify pattern. Capturing card UPFRONT before trial
   * starts reduces churn at trial end (customer can't "forget" to add card).
   * Stripe SetupIntent validates the card with $0 charge before the trial
   * begins — first real charge happens at trial_end.
   *
   * Flow:
   *   1. Validate Organization + no active subscription exists
   *   2. Lookup-or-create Stripe Customer (idempotent)
   *   3. Persist local Subscription row with status='pending_payment_method'
   *      + pendingCouponId / pendingTrialDays for future activation
   *   4. AuditLog SUBSCRIPTION_PENDING_PAYMENT
   *
   * Returns the local Subscription. Frontend then calls
   * `POST /v1/billing/setup-checkout` to get the Stripe Checkout URL.
   */
  async createPendingSubscription(dto: CreatePendingSubscriptionDto, actor: JwtPayload) {
    if (!this.billing.isStripeConfigured()) {
      throw new InternalServerErrorException(
        'Stripe no configurado en este server. Verifica STRIPE_SECRET_KEY.',
      )
    }

    // ── (1) Validate Organization ──────────────────────────────────
    const org = await this.prisma.organization.findUnique({
      where: { id: dto.organizationId },
    })
    if (!org) {
      throw new NotFoundException(`Organization ${dto.organizationId} no encontrada`)
    }
    const existing = await this.prisma.subscription.findUnique({
      where: { organizationId: dto.organizationId },
    })
    if (existing && !['canceled', 'incomplete_expired'].includes(existing.status)) {
      throw new ConflictException(
        `Organization ${dto.organizationId} ya tiene subscription ${existing.id} (status=${existing.status}).`,
      )
    }

    // ── (2) Resolve pricing config (validates plan tier exists) ────
    const pricingConfig = await this.billing.getPricingConfig(dto.planTier)
    if (!pricingConfig) {
      throw new NotFoundException(`Plan tier ${dto.planTier} no existe en billing_pricing_config`)
    }

    const stripe = this.billing.getStripeClient() as any

    // ── (3) Lookup-or-create Stripe Customer ───────────────────────
    let customer: StripeCustomer
    try {
      customer = await this.withRetry(
        async () =>
          (await stripe.customers.create(
            {
              email: dto.ownerEmail.toLowerCase().trim(),
              name: `${dto.ownerName} — ${org.name}`,
              metadata: this.zenixMetadata({
                zenix_organization_id: dto.organizationId,
                zenix_organization_name: org.name,
                created_by: 'SubscriptionService.createPendingSubscription',
                actor_id: actor.sub,
              }),
            },
            { idempotencyKey: `create_customer_${dto.organizationId}` },
          )) as StripeCustomer,
      )
    } catch (err) {
      throw this.translateStripeError(err)
    }

    // ── (4) Persist local Subscription as pending_payment_method ───
    const tentativeStripeSubId = `pending_${randomUUID()}`
    const trialDays = dto.trialDays ?? 14
    const created = await this.prisma.subscription.upsert({
      where: { organizationId: dto.organizationId },
      create: {
        organizationId: dto.organizationId,
        stripeCustomerId: customer.id,
        stripeSubscriptionId: tentativeStripeSubId,
        planTier: dto.planTier,
        status: 'pending_payment_method',
        billingCycle: dto.billingCycle,
        annualDiscountPct: dto.billingCycle === 'annual' ? 20 : null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + (trialDays + 30) * 86400 * 1000),
        baseMonthlyAmount: pricingConfig.monthlyAmountMxn,
        currency: dto.currency,
        propertyCount: dto.propertyCount,
        nextRenewalDate: new Date(Date.now() + (trialDays + 30) * 86400 * 1000),
        autoRenew: true,
        pendingCouponId: dto.stripeCouponId ?? null,
        pendingTrialDays: trialDays,
        trialNegotiatedBy: dto.trialDays ? actor.sub : null,
      },
      update: {
        stripeCustomerId: customer.id,
        stripeSubscriptionId: tentativeStripeSubId,
        planTier: dto.planTier,
        status: 'pending_payment_method',
        pendingCouponId: dto.stripeCouponId ?? null,
        pendingTrialDays: trialDays,
      },
    })

    await this.safeAuditLog({
      organizationId: dto.organizationId,
      actor,
      action: 'SUBSCRIPTION_PENDING_PAYMENT',
      target: created.id,
      payload: {
        stripeCustomerId: customer.id,
        planTier: dto.planTier,
        billingCycle: dto.billingCycle,
        currency: dto.currency,
        propertyCount: dto.propertyCount,
        trialDays,
        hasPendingCoupon: !!dto.stripeCouponId,
      },
    })

    return created
  }

  // ═══════════════════════════════════════════════════════════════════
  // Netflix-style trial — createSetupCheckoutSession
  // ═══════════════════════════════════════════════════════════════════
  /**
   * Generates a Stripe Checkout session in `mode=setup` that captures the
   * customer's payment method via $0 SetupIntent (Netflix/Spotify pattern).
   *
   * Stripe handles the hosted page UI (SCA/3DS, A11y, i18n included).
   * Customer adds card → Stripe Checkout success_url redirect → frontend
   * polls Subscription.status until 'trialing' (set by webhook handler).
   *
   * URL caducidad: Checkout sessions expire en 24h.
   *
   * Requires Subscription.status='pending_payment_method'. If status is
   * already 'trialing'/'active' → ConflictException (no double-capture).
   */
  async createSetupCheckoutSession(dto: CreateSetupCheckoutSessionDto, actor: JwtPayload) {
    if (!this.billing.isStripeConfigured()) {
      throw new InternalServerErrorException(
        'Stripe no configurado en este server. Verifica STRIPE_SECRET_KEY.',
      )
    }

    const sub = await this.prisma.subscription.findUnique({
      where: { organizationId: dto.organizationId },
    })
    if (!sub) {
      throw new NotFoundException(
        `Organization ${dto.organizationId} no tiene subscription pendiente. Pídele a tu consultor que vuelva a activar.`,
      )
    }
    if (sub.status !== 'pending_payment_method') {
      throw new ConflictException(
        `Subscription en status '${sub.status}' — no requiere captura de tarjeta.`,
      )
    }

    const stripe = this.billing.getStripeClient() as any

    // ── BILLING-DAY1 (Sprint 2026-05-29) ─────────────────────────────
    // Ramifica el modo del Stripe Checkout según la estrategia comercial
    // del consultor capturada en wizard (`pendingTrialDays`):
    //
    //   pendingTrialDays === 0  → mode='subscription' (Day-1 default)
    //     Cobra la primera mensualidad inmediato al activar. Stripe
    //     Checkout muestra el monto real; cliente confirma con tarjeta;
    //     Stripe crea Customer + Subscription + factura inmediata.
    //     Webhook `checkout.session.completed` con mode='subscription'
    //     transiciona la Sub local pending → active.
    //
    //   pendingTrialDays  >  0  → mode='setup' (Netflix flow)
    //     Captura tarjeta con $0 SetupIntent, agenda primer cobro al
    //     final del trial. Path original sin cambios.
    //
    // Decisión owner 2026-05-29: el default comercial es Day-1 charge.
    // El trial Netflix se activa cuando el consultor lo negocia
    // explícitamente con el cliente como objeción ("te lo dejo gratis
    // X días"). Garantía 30d es política comercial, no cambio técnico.
    const isImmediateCharge = (sub.pendingTrialDays ?? 0) === 0

    if (isImmediateCharge) {
      // Resolve pricing del plan + cantidad de properties para line_items.
      const pricingConfig = await this.billing.getPricingConfig(sub.planTier as PlanTier)
      if (!pricingConfig) {
        throw new InternalServerErrorException(
          `Plan tier ${sub.planTier} no existe en pricing config`,
        )
      }
      const stripePriceId =
        sub.currency === 'MXN' ? pricingConfig.stripePriceIdMxn : pricingConfig.stripePriceIdUsd
      if (!stripePriceId) {
        throw new InternalServerErrorException(
          `Stripe Price ID no configurado para ${sub.planTier} ${sub.currency}`,
        )
      }

      try {
        const session = await this.withRetry(
          async () =>
            (await stripe.checkout.sessions.create(
              {
                mode: 'subscription',
                customer: sub.stripeCustomerId,
                payment_method_types: ['card'],
                line_items: [
                  { price: stripePriceId, quantity: sub.propertyCount },
                ],
                ...(sub.pendingCouponId
                  ? { discounts: [{ coupon: sub.pendingCouponId }] }
                  : {}),
                subscription_data: {
                  // trial_period_days=0 = sin trial; cobro inmediato
                  metadata: this.zenixMetadata({
                    zenix_organization_id: dto.organizationId,
                    zenix_subscription_id: sub.id,
                    zenix_kind: 'DAY1_IMMEDIATE_CHARGE',
                  }),
                },
                success_url: dto.successUrl,
                cancel_url: dto.cancelUrl,
                // Idempotency en Checkout sigue las reglas: mismo key
                // dentro de 24h → retorna la misma session URL.
                metadata: this.zenixMetadata({
                  zenix_organization_id: dto.organizationId,
                  zenix_subscription_id: sub.id,
                  zenix_kind: 'DAY1_IMMEDIATE_CHARGE',
                  actor_id: actor.sub,
                }),
              },
              { idempotencyKey: `day1_checkout_${sub.id}` },
            )) as StripeCheckoutSession,
        )
        return {
          url: session.url,
          sessionId: session.id,
          customerId: sub.stripeCustomerId,
          mode: 'subscription' as const,
        }
      } catch (err) {
        throw this.translateStripeError(err)
      }
    }

    // ── Path original Netflix trial (pendingTrialDays > 0) ───────────
    try {
      const session = await this.withRetry(
        async () =>
          (await stripe.checkout.sessions.create(
            {
              mode: 'setup',
              customer: sub.stripeCustomerId,
              payment_method_types: ['card'],
              success_url: dto.successUrl,
              cancel_url: dto.cancelUrl,
              metadata: this.zenixMetadata({
                zenix_organization_id: dto.organizationId,
                zenix_subscription_id: sub.id,
                zenix_kind: 'NETFLIX_TRIAL_CARD_CAPTURE',
                actor_id: actor.sub,
              }),
            },
            { idempotencyKey: `setup_checkout_${sub.id}` },
          )) as StripeCheckoutSession,
      )
      return {
        url: session.url,
        sessionId: session.id,
        customerId: sub.stripeCustomerId,
        mode: 'setup' as const,
      }
    } catch (err) {
      throw this.translateStripeError(err)
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Netflix-style trial — activateAfterSetupIntent
  // ═══════════════════════════════════════════════════════════════════
  /**
   * Called by WebhookHandler on `setup_intent.succeeded` event.
   *
   * Reads the SetupIntent → gets payment_method ID → attaches as the
   * Customer's default → creates the REAL Stripe Subscription with
   * default_payment_method + trial_period_days (from pendingTrialDays
   * persisted at createPendingSubscription time).
   *
   * Idempotent: if Sub already has a real stripeSubscriptionId (not pending_*),
   * skip and return existing. Safe under webhook retry.
   *
   * Idempotency key for Stripe Sub creation:
   *   `create_sub_after_setup_${subscriptionId}` (NOT setupIntentId — same
   *   setup intent could be reused if customer added card twice, but the
   *   subscription is unique per organization).
   */
  async activateAfterSetupIntent(setupIntentId: string) {
    if (!this.billing.isStripeConfigured()) {
      throw new InternalServerErrorException('Stripe no configurado.')
    }

    const stripe = this.billing.getStripeClient() as any
    let intent: StripeSetupIntent
    try {
      intent = (await stripe.setupIntents.retrieve(setupIntentId)) as StripeSetupIntent
    } catch (err) {
      throw this.translateStripeError(err)
    }

    if (intent.status !== 'succeeded') {
      this.logger.warn(
        `[activateAfterSetupIntent] SetupIntent ${setupIntentId} status=${intent.status}, expected 'succeeded' — skip`,
      )
      return { activated: false, reason: 'setup_intent_not_succeeded' }
    }
    if (!intent.customer || !intent.payment_method) {
      this.logger.warn(
        `[activateAfterSetupIntent] SetupIntent ${setupIntentId} missing customer/payment_method — skip`,
      )
      return { activated: false, reason: 'missing_customer_or_pm' }
    }

    // Lookup local Subscription by stripeCustomerId + status
    const sub = await this.prisma.subscription.findFirst({
      where: {
        stripeCustomerId: intent.customer,
        status: 'pending_payment_method',
      },
    })
    if (!sub) {
      // Could be: (a) already activated by previous webhook retry,
      // (b) Customer Portal adding a card to existing Sub (not our flow).
      this.logger.log(
        `[activateAfterSetupIntent] No pending_payment_method sub for customer ${intent.customer} — skip (already activated or out-of-band)`,
      )
      return { activated: false, reason: 'no_pending_subscription' }
    }

    // Attach PM as default on Customer (so future invoices charge it)
    try {
      await this.withRetry(async () =>
        stripe.customers.update(intent.customer, {
          invoice_settings: { default_payment_method: intent.payment_method },
        }),
      )
    } catch (err) {
      this.logger.error(
        `[activateAfterSetupIntent] Failed to attach default PM for customer ${intent.customer}: ${String(err).slice(0, 200)}`,
      )
      throw this.translateStripeError(err)
    }

    // Resolve pricing config (same logic as createSubscription)
    const pricingConfig = await this.billing.getPricingConfig(sub.planTier as PlanTier)
    if (!pricingConfig) {
      throw new NotFoundException(`Plan tier ${sub.planTier} no existe en pricing config`)
    }
    const stripePriceId =
      sub.currency === 'MXN' ? pricingConfig.stripePriceIdMxn : pricingConfig.stripePriceIdUsd
    if (!stripePriceId) {
      throw new InternalServerErrorException(
        `Stripe Price ID no configurado para ${sub.planTier} ${sub.currency}`,
      )
    }

    // Create the REAL Stripe Subscription with default PM + trial
    let stripeSub: StripeSubscription
    try {
      const createParams: any = {
        customer: intent.customer,
        items: [{ price: stripePriceId, quantity: sub.propertyCount }],
        default_payment_method: intent.payment_method,
        ...(sub.pendingCouponId ? { discounts: [{ coupon: sub.pendingCouponId }] } : {}),
        ...(sub.pendingTrialDays && sub.pendingTrialDays > 0
          ? { trial_period_days: sub.pendingTrialDays }
          : {}),
        payment_behavior: 'allow_incomplete', // card already validated via SetupIntent
        payment_settings: {
          save_default_payment_method: 'on_subscription',
        },
        expand: ['latest_invoice', 'latest_invoice.payment_intent'],
        metadata: this.zenixMetadata({
          zenix_organization_id: sub.organizationId,
          zenix_subscription_id: sub.id,
          zenix_plan_tier: sub.planTier,
          zenix_billing_cycle: sub.billingCycle,
          zenix_setup_intent_id: setupIntentId,
          created_by: 'SubscriptionService.activateAfterSetupIntent',
        }),
      }

      stripeSub = await this.withRetry(
        async () =>
          (await stripe.subscriptions.create(createParams, {
            idempotencyKey: `create_sub_after_setup_${sub.id}`,
          })) as StripeSubscription,
      )
    } catch (err) {
      throw this.translateStripeError(err)
    }

    // Persist local with real Sub ID + clear pending fields
    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        stripeSubscriptionId: stripeSub.id,
        status: stripeSub.status,
        currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
        trialStartedAt: stripeSub.trial_start ? new Date(stripeSub.trial_start * 1000) : null,
        trialEndsAt: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null,
        nextRenewalDate: new Date(stripeSub.current_period_end * 1000),
        setupIntentId,
        cardCapturedAt: new Date(),
        // pendingCouponId/pendingTrialDays remain for audit trail; cleared by cron at 90d
      },
    })

    await this.safeAuditLog({
      organizationId: sub.organizationId,
      actor: { sub: 'system:webhook', role: 'SYSTEM' } as unknown as JwtPayload,
      action: 'SUBSCRIPTION_ACTIVATED_AFTER_SETUP',
      target: updated.id,
      payload: {
        stripeSubscriptionId: stripeSub.id,
        setupIntentId,
        status: stripeSub.status,
        trialEndsAt: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000).toISOString() : null,
        hadCoupon: !!sub.pendingCouponId,
      },
    })

    return { activated: true, subscription: updated }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Day-1 immediate charge — activateAfterSubscriptionCheckout
  // ═══════════════════════════════════════════════════════════════════
  /**
   * Called by WebhookHandler on `checkout.session.completed` event
   * cuando `session.mode === 'subscription'` y `metadata.zenix_kind ===
   * 'DAY1_IMMEDIATE_CHARGE'`.
   *
   * Stripe Checkout `mode='subscription'` ya hizo todo el trabajo pesado:
   *  - Customer ya existe (creado en createPendingSubscription)
   *  - Subscription real creada por Checkout con line_items
   *  - Primera factura emitida y cobrada inmediato
   *  - Discount aplicado si pendingCouponId set
   *
   * Lo único que falta es transicionar la Sub local de
   * `pending_payment_method` → `active` (o `incomplete` si el cobro
   * falló) y persistir el `stripeSubscriptionId` real.
   *
   * Idempotente: si la Sub local ya tiene un real stripeSubscriptionId
   * (no `pending_*`), skip retornando existing. Webhook retry-safe.
   *
   * @param sessionId  Stripe Checkout Session ID (cs_*)
   */
  async activateAfterSubscriptionCheckout(sessionId: string) {
    if (!this.billing.isStripeConfigured()) {
      throw new InternalServerErrorException('Stripe no configurado.')
    }

    const stripe = this.billing.getStripeClient() as any
    let session: any
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription', 'subscription.latest_invoice'],
      })
    } catch (err) {
      throw this.translateStripeError(err)
    }

    if (session.mode !== 'subscription') {
      this.logger.warn(
        `[activateAfterSubscriptionCheckout] session ${sessionId} mode=${session.mode}, expected 'subscription' — skip`,
      )
      return { activated: false, reason: 'wrong_mode' }
    }
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      this.logger.warn(
        `[activateAfterSubscriptionCheckout] session ${sessionId} payment_status=${session.payment_status} — skip; webhook retry on payment update`,
      )
      return { activated: false, reason: 'payment_pending' }
    }
    if (!session.subscription) {
      this.logger.warn(
        `[activateAfterSubscriptionCheckout] session ${sessionId} sin subscription — skip`,
      )
      return { activated: false, reason: 'no_subscription_on_session' }
    }

    const stripeSubFromSession =
      typeof session.subscription === 'string'
        ? null
        : (session.subscription as StripeSubscription)
    const stripeSubId =
      typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription as StripeSubscription).id

    // Lookup local Subscription. Preferimos lookup por metadata
    // zenix_subscription_id (siempre presente en session.metadata).
    const localSubId =
      session.metadata?.zenix_subscription_id ?? session.subscription_data?.metadata?.zenix_subscription_id
    let sub = localSubId
      ? await this.prisma.subscription.findUnique({ where: { id: localSubId } })
      : null

    // Fallback: lookup por stripeCustomerId + status pending_payment_method
    if (!sub && session.customer) {
      sub = await this.prisma.subscription.findFirst({
        where: {
          stripeCustomerId: session.customer as string,
          status: 'pending_payment_method',
        },
      })
    }

    if (!sub) {
      // Activación idempotente — el webhook ya procesó esta session.
      this.logger.log(
        `[activateAfterSubscriptionCheckout] No pending sub para session ${sessionId} customer=${session.customer} — skip (ya activada o out-of-band)`,
      )
      return { activated: false, reason: 'no_pending_subscription' }
    }

    // Idempotency guard: ya tenemos el real Sub ID persistido
    if (sub.stripeSubscriptionId && !sub.stripeSubscriptionId.startsWith('pending_')) {
      this.logger.log(
        `[activateAfterSubscriptionCheckout] sub ${sub.id} ya activada (stripeSubId=${sub.stripeSubscriptionId}) — skip idempotente`,
      )
      return { activated: false, reason: 'already_activated', subscription: sub }
    }

    // Si la subscription no vino expandida, retrieve manual
    const stripeSub: StripeSubscription =
      stripeSubFromSession ??
      ((await stripe.subscriptions.retrieve(stripeSubId)) as StripeSubscription)

    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        stripeSubscriptionId: stripeSub.id,
        status: stripeSub.status,
        currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
        nextRenewalDate: new Date(stripeSub.current_period_end * 1000),
        cardCapturedAt: new Date(),
        // pendingCouponId/pendingTrialDays remain for audit trail
      },
    })

    await this.safeAuditLog({
      organizationId: sub.organizationId,
      actor: { sub: 'system:webhook', role: 'SYSTEM' } as unknown as JwtPayload,
      action: 'SUBSCRIPTION_ACTIVATED_DAY1',
      target: updated.id,
      payload: {
        stripeSubscriptionId: stripeSub.id,
        checkoutSessionId: sessionId,
        status: stripeSub.status,
        firstInvoiceAmount: ((stripeSub as any).latest_invoice as any)?.amount_paid ?? null,
        hadCoupon: !!sub.pendingCouponId,
      },
    })

    return { activated: true, subscription: updated }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Get subscription para Org
  // ═══════════════════════════════════════════════════════════════════
  async getSubscriptionById(id: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        discounts: { orderBy: { appliedAt: 'desc' } },
        events: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    })
    if (!sub) throw new NotFoundException(`Subscription ${id} no encontrada`)
    return sub
  }

  async getSubscriptionForOrganization(organizationId: string) {
    return this.prisma.subscription.findUnique({
      where: { organizationId },
      include: {
        discounts: { orderBy: { appliedAt: 'desc' } },
        events: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    })
  }

  // ═══════════════════════════════════════════════════════════════════
  // Helpers privados
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Metadata estándar Zenix para TODA mutation Stripe (§2.8).
   */
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

  /**
   * Retry con exponential backoff para 429 + Stripe API/Connection errors (§2.10).
   * NO retry para CardError / InvalidRequestError / Authentication.
   */
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
        if (!isRetryable || attempt === BACKOFF_MS.length) {
          throw err
        }
        const delay = BACKOFF_MS[attempt]
        this.logger.warn(`[withRetry] Stripe ${e.type} attempt ${attempt + 1}, retrying in ${delay}ms`)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
    // Unreachable but TypeScript needs it
    throw new Error('withRetry exhausted')
  }

  /**
   * Mapea Stripe errors a NestJS HttpExceptions (§2.9).
   */
  private translateStripeError(err: unknown): Error {
    const e = err as { type?: string; code?: string; message?: string; statusCode?: number }
    switch (e.type) {
      case 'StripeCardError':
        return new BadRequestException(`Tarjeta rechazada: ${e.message ?? 'sin detalle'}`)
      case 'StripeInvalidRequestError':
        this.logger.error('[Stripe] InvalidRequest — bug en nuestro código:', err)
        return new InternalServerErrorException('Configuración inválida del request a Stripe')
      case 'StripeAuthenticationError':
        this.logger.error('[Stripe] CRITICAL: Auth failed — verificar STRIPE_SECRET_KEY')
        return new InternalServerErrorException('Credenciales Stripe inválidas — contacta soporte')
      case 'StripePermissionError':
        this.logger.error('[Stripe] Permission denied — restricted key sin scope:', err)
        return new InternalServerErrorException(
          'API key sin permisos suficientes — contacta soporte',
        )
      case 'StripeAPIError':
      case 'StripeConnectionError':
        return new InternalServerErrorException(
          'Stripe API temporalmente no disponible — reintenta en unos segundos',
        )
      case 'StripeRateLimitError':
        return new InternalServerErrorException(
          'Rate limit alcanzado — reintenta en 30 segundos',
        )
      default:
        this.logger.error('[Stripe] Unhandled error type:', err)
        return new InternalServerErrorException('Error inesperado procesando pago')
    }
  }

  /**
   * Mapea nuestra cancellation_reason enum al feedback enum de Stripe.
   * Stripe acepta: 'customer_service' | 'low_quality' | 'missing_features' |
   *   'other' | 'switched_service' | 'too_complex' | 'too_expensive' | 'unused'
   */
  private mapZenixReasonToStripeFeedback(reason: string): string {
    const map: Record<string, string> = {
      PRICE_TOO_HIGH: 'too_expensive',
      NOT_USING_FEATURES: 'unused',
      COMPETITOR: 'switched_service',
      TEMPORARY_CLOSURE: 'other',
      SUPPORT_ISSUES: 'customer_service',
      OTHER: 'other',
    }
    return map[reason] ?? 'other'
  }

  /**
   * AuditLog wrapper — never throws (fail-soft per §165 D-NOVA-7).
   */
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
        actorRealRole: (input.actor as any).role ?? 'UNKNOWN',
        action: input.action,
        target: input.target,
        payload: input.payload,
        status: 'SUCCESS',
        retentionPolicy: 'PERMANENT',
      })
    } catch (err) {
      this.logger.error(`[safeAuditLog] Audit write falló (no bloquea): ${String(err).slice(0, 200)}`)
    }
  }
}

// CI-RESCUE 2026-06-06: reemplazado el bare `crypto` global por import explícito
// de `node:crypto` (randomUUID). El bare global solo funciona en runtime Node 19+
// con flag --no-experimental-fetch desactivado; en jest test env (Node 20 jest-env)
// falla con ReferenceError. Import explícito es seguro y portable.
