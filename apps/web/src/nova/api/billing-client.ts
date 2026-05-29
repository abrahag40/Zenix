/**
 * Billing API client — Sprint BILLING-DISCOUNT-CODES.
 *
 * Surface: /v1/nova/billing/*
 *
 * Mantiene contracts alineados con
 * apps/api/src/billing/nova-billing.controller.ts.
 */
import { api } from '../../api/client'

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
}
