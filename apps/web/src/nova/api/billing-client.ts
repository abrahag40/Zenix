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
}
