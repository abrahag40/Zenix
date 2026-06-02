/**
 * Cancellation policies — API + tipos + presets + motor de preview client-side.
 * Sprint GROUP-BILLING Fase C C5 (D-GRP-C1, 2026-06-02).
 *
 * El preview client-side (`computeOutcomePreview`) es un ESPEJO EXACTO del motor
 * backend `computeCancellationOutcome` (cancellation-policy.service.ts) — permite
 * el simulador "si cancela hoy se le cobra $X" sin round-trip. Si el motor backend
 * cambia, actualizar ambos.
 */
import { api } from './client'

export type ChargeType = 'NIGHTS' | 'PERCENT' | 'FIXED'

export interface PolicyTier {
  fromHours: number
  toHours: number
  chargeType: ChargeType
  value: number
}

export interface CancellationPolicy {
  id: string
  propertyId: string
  name: string
  isDefault: boolean
  freeWindowHours: number
  tiers: PolicyTier[]
  refundMode: string
  createdAt: string
}

/** Horas "nunca gratis" para políticas no-reembolsables (mayor que cualquier antelación real). */
export const NON_REFUNDABLE_HOURS = 1_000_000

export interface PolicyPreset {
  key: string
  name: string
  description: string
  freeWindowHours: number
  tiers: PolicyTier[]
}

/**
 * Presets canónicos de la industria (Airbnb Flexible/Moderate/Firm + Booking.com
 * "free until N days"). El hotel parte de uno y lo personaliza.
 */
export const POLICY_PRESETS: PolicyPreset[] = [
  {
    key: 'flexible',
    name: 'Flexible',
    description: 'Cancelación gratis hasta 24 h antes. Después, 1 noche.',
    freeWindowHours: 24,
    tiers: [{ fromHours: 24, toHours: 0, chargeType: 'NIGHTS', value: 1 }],
  },
  {
    key: 'moderada',
    name: 'Moderada',
    description: 'Gratis hasta 3 días antes. 3 días–24 h: 1 noche. <24 h: 100%.',
    freeWindowHours: 72,
    tiers: [
      { fromHours: 72, toHours: 24, chargeType: 'NIGHTS', value: 1 },
      { fromHours: 24, toHours: 0, chargeType: 'PERCENT', value: 100 },
    ],
  },
  {
    key: 'estricta',
    name: 'Estricta',
    description: 'Gratis hasta 7 días antes. 7–3 días: 50%. <3 días: 100%.',
    freeWindowHours: 168,
    tiers: [
      { fromHours: 168, toHours: 72, chargeType: 'PERCENT', value: 50 },
      { fromHours: 72, toHours: 0, chargeType: 'PERCENT', value: 100 },
    ],
  },
  {
    key: 'no_reembolsable',
    name: 'No reembolsable',
    description: 'Sin reembolso en ningún momento (tarifa prepagada).',
    freeWindowHours: NON_REFUNDABLE_HOURS,
    tiers: [{ fromHours: NON_REFUNDABLE_HOURS, toHours: 0, chargeType: 'PERCENT', value: 100 }],
  },
]

export interface OutcomePreview {
  free: boolean
  appliedTier: PolicyTier | null
  retention: number
  refund: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Espejo client-side de computeCancellationOutcome (backend). Mantener sincronizado.
 */
export function computeOutcomePreview(
  policy: { freeWindowHours: number; tiers: PolicyTier[] },
  stay: { totalAmount: number; amountPaid: number; ratePerNight: number },
  hoursUntilCheckin: number,
): OutcomePreview {
  if (hoursUntilCheckin >= policy.freeWindowHours) {
    return { free: true, appliedTier: null, retention: 0, refund: round2(stay.amountPaid) }
  }
  const h = Math.max(0, hoursUntilCheckin)
  const tier = policy.tiers.find((t) => h < t.fromHours && h >= t.toHours) ?? null
  let charge = 0
  if (tier) {
    if (tier.chargeType === 'NIGHTS') charge = tier.value * stay.ratePerNight
    else if (tier.chargeType === 'PERCENT') charge = (tier.value / 100) * stay.totalAmount
    else charge = tier.value
  }
  const retention = round2(Math.min(Math.max(0, charge), stay.totalAmount))
  const refund = round2(Math.max(0, stay.amountPaid - retention))
  return { free: false, appliedTier: tier, retention, refund }
}

/** Etiqueta humana de un tramo: "1 noche", "50%", "$500". */
export function tierLabel(t: PolicyTier, currency = ''): string {
  if (t.chargeType === 'NIGHTS') return t.value === 1 ? '1 noche' : `${t.value} noches`
  if (t.chargeType === 'PERCENT') return `${t.value}%`
  return `${currency} ${t.value.toLocaleString()}`.trim()
}

export const cancellationPoliciesApi = {
  list: (propertyId: string) =>
    api.get<CancellationPolicy[]>(`/v1/cancellation-policies?propertyId=${encodeURIComponent(propertyId)}`),
  create: (dto: {
    propertyId: string
    name: string
    freeWindowHours: number
    tiers: PolicyTier[]
    refundMode?: string
    isDefault?: boolean
  }) => api.post<CancellationPolicy>('/v1/cancellation-policies', dto),
  update: (id: string, dto: Partial<{
    name: string
    freeWindowHours: number
    tiers: PolicyTier[]
    refundMode: string
    isDefault: boolean
  }>) => api.patch<CancellationPolicy>(`/v1/cancellation-policies/${id}`, dto),
}
