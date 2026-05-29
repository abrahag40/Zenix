/**
 * Billing API client — Sprint BILLING-DISCOUNT-CODES.
 *
 * Surface: /v1/nova/billing/*
 *
 * Mantiene contracts alineados con
 * apps/api/src/billing/nova-billing.controller.ts.
 */
import { api } from '../../api/client'
import { useNovaStore } from '../../store/nova'

/** Helper para inyectar X-Acting-Organization-Id en endpoints scope-org. */
function actingOrgHeaders(): Record<string, string> {
  const state = useNovaStore.getState()
  if (!state.actingOrgId) {
    throw new Error('Nova: no acting organization seleccionada')
  }
  return { 'X-Acting-Organization-Id': state.actingOrgId }
}

// ─────────────────────────────────────────────────────────────────────
// Types — espejo de DiscountCodeService + DTOs
// ─────────────────────────────────────────────────────────────────────

export type DiscountDuration = 'once' | 'repeating' | 'forever'

export interface DiscountCodeTemplate {
  id: string
  consultorId: string
  name: string
  percentOff: number
  duration: DiscountDuration
  durationInMonths: number | null
  isFavorite: boolean
  createdAt: string
}

export interface CreateDiscountCodeTemplateInput {
  name: string
  percentOff: number
  duration: DiscountDuration
  durationInMonths?: number
  isFavorite?: boolean
}

export interface ApplyTemplateInput {
  subscriptionId: string
}

export interface ApplyTemplateResult {
  kind: 'applied' | 'pending_approval'
  discount?: any
  request?: any
  templateName: string
}

// ─────────────────────────────────────────────────────────────────────
// DISCOUNT-APPROVAL-UI (Sprint 2026-05-29) — Pending approvals queue
// ─────────────────────────────────────────────────────────────────────

/** Subscription context (opcional cuando subscriptionId set en el request). */
export interface DiscountApprovalSubscriptionContext {
  id: string
  planTier: string
  currency: string
  baseMonthlyAmount: number
  propertyCount: number
  billingCycle: 'monthly' | 'annual'
}

/** Pending approval enriquecido — espejo de listPendingApprovals. */
export interface DiscountApprovalRequest {
  id: string
  requestedById: string
  requestedByRole: string
  organizationId: string
  subscriptionId: string | null
  percentOff: number
  duration: DiscountDuration
  durationInMonths: number | null
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'
  createdAt: string
  expiresAt: string
  reviewedById?: string | null
  reviewedAt?: string | null
  // Enriched fields (DISCOUNT-APPROVAL-UI)
  organizationName: string | null
  organizationSlug: string | null
  requestedByName: string | null
  requestedByEmail: string | null
  subscription: DiscountApprovalSubscriptionContext | null
}

export interface RejectApprovalInput {
  /** Razón del rechazo — obligatoria ≥10 chars (audit trail). */
  rejectionReason: string
}

// ─────────────────────────────────────────────────────────────────────
// CLIENT-RETENTION-DISCOUNTS (Sprint 2026-05-29)
// ─────────────────────────────────────────────────────────────────────

/** Subscription completa con history de discounts + events (audit trail). */
export interface NovaSubscription {
  id: string
  organizationId: string
  stripeSubscriptionId: string
  stripeCustomerId: string
  status: string
  planTier: string
  billingCycle: 'monthly' | 'annual'
  currency: 'MXN' | 'USD'
  baseMonthlyAmount: number | string
  propertyCount: number
  currentPeriodStart: string
  currentPeriodEnd: string
  nextRenewalDate: string | null
  autoRenew: boolean
  pendingTrialDays?: number | null
  pendingCouponId?: string | null
  trialNegotiatedBy?: string | null
  cardCapturedAt?: string | null
  discounts: NovaSubscriptionDiscount[]
  events: NovaSubscriptionEvent[]
  createdAt: string
  updatedAt: string
}

export interface NovaSubscriptionDiscount {
  id: string
  subscriptionId: string
  stripeCouponId: string
  stripePromotionCodeId: string | null
  promotionCode: string
  percentOff: number
  duration: DiscountDuration
  durationInMonths: number | null
  reason: string
  generatedById: string
  generatedByRole: string
  approvedById: string | null
  approvedAt: string | null
  appliedAt: string
  expiresAt: string | null
  voidedAt?: string | null
  voidReason?: string | null
}

export interface NovaSubscriptionEvent {
  id: string
  subscriptionId: string
  type: string
  description: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

/** Input para aplicar un discount de retención a una sub activa. */
export interface GenerateDiscountInput {
  /** Sub ID local de la sub activa. */
  subscriptionId: string
  /** % off (5-50 enforced backend). */
  percentOff: number
  /** Duración del coupon Stripe. */
  duration: DiscountDuration
  /** Required cuando duration='repeating' (1-24 meses). */
  durationInMonths?: number
  /** Razón comercial (10-500 chars, audit trail). */
  reason: string
  /**
   * Si percentOff > tier cap del consultor, auto-marca pending_approval
   * en vez de fallar con 403. Default false (= require approval upfront).
   */
  autoRequestApprovalIfExceedsCap?: boolean
}

export interface GenerateDiscountResult {
  kind: 'applied' | 'pending_approval'
  discount?: NovaSubscriptionDiscount
  request?: { id: string; status: string }
}

// ─────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────

export const billingClient = {
  // Discount code templates
  listTemplates: () => api.get<DiscountCodeTemplate[]>('/v1/nova/billing/discount-templates'),

  createTemplate: (input: CreateDiscountCodeTemplateInput) =>
    api.post<DiscountCodeTemplate>('/v1/nova/billing/discount-templates', input),

  deleteTemplate: (id: string) =>
    api.delete<{ ok: true }>(`/v1/nova/billing/discount-templates/${id}`),

  applyTemplate: (id: string, input: ApplyTemplateInput) =>
    api.post<ApplyTemplateResult>(
      `/v1/nova/billing/discount-templates/${id}/apply`,
      input,
    ),

  // Discount approval queue (PARTNER_ADMIN + PLATFORM only)
  listPendingApprovals: () =>
    api.get<DiscountApprovalRequest[]>('/v1/nova/billing/discount-approvals/pending'),

  approveDiscount: (id: string) =>
    api.post<{ ok: true; discountId?: string }>(
      `/v1/nova/billing/discount-approvals/${id}/approve`,
      {},
    ),

  rejectDiscount: (id: string, input: RejectApprovalInput) =>
    api.post<{ ok: true }>(
      `/v1/nova/billing/discount-approvals/${id}/reject`,
      input,
    ),

  // ── CLIENT-RETENTION-DISCOUNTS (Sprint 2026-05-29) ──────────────────

  /**
   * GET subscription completa del current acting org. Incluye history
   * de discounts y events (audit trail). Usado por la página
   * /nova/clientes/:id/billing.
   */
  getSubscriptionForActingOrg: () =>
    api.get<NovaSubscription>('/v1/nova/billing/subscription', {
      headers: actingOrgHeaders(),
    }),

  /**
   * POST aplica un discount a una subscription activa. Backend valida
   * que la sub esté en status `active|trialing|past_due` y llama
   * `stripe.subscriptions.update({ discounts: [{ coupon }] })` real.
   * Stripe aplica el discount desde el SIGUIENTE invoice y respeta
   * `duration` para auto-revertir al precio del plan después de N meses.
   */
  generateRetentionDiscount: (input: GenerateDiscountInput) =>
    api.post<GenerateDiscountResult>('/v1/nova/billing/discount-codes', input, {
      headers: actingOrgHeaders(),
    }),
}
