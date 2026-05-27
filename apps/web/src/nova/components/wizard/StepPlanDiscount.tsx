/**
 * Step 7.5 — Plan + descuento negociado (v2 rediseñada).
 *
 * Sprint BILLING-CORE Day 6 + iteración UX 2026-05-26.
 *
 * Mejoras sobre v1:
 *   · Plan cards con tagline + descripción de posicionamiento + features
 *     agrupados por categoría (operación / canales / módulos avanzados)
 *   · Discount section tier-aware: el cap viene del actor.partnerTier
 *     (AUTHORIZED 15% / SILVER 25% / GOLD 35% / PLATINUM 50% / PLATFORM ∞)
 *   · Slider del descuento con zonas color-coded (verde dentro de cap,
 *     amber requiere approval, rojo bloqueado)
 *   · Duración con copy claro y "Permanente" deshabilitado si actor no es
 *     PLATINUM (con tooltip explicativo)
 *   · Preview del cobro tipo timeline visual: 3 fases (Trial → Descuento →
 *     Precio regular) con total destacado en grande
 */
import { useWizardStore } from '../../../store/wizard'
import { useAuthStore } from '../../../store/auth'
import { WizardLayout } from './WizardLayout'
import { Surface, Body, Subhead, Caption, Chip, Title, Eyebrow } from '../../design-system'
import {
  CreditCard,
  Percent,
  Tag,
  AlertTriangle,
  Calendar,
  Sparkles,
  Crown,
  Lock,
  Info,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Plan previews — display-only, backend usa BillingPricingConfig real al
// crear la Stripe Subscription via /v1/nova/admin/pricing (Day 5).
const PLAN_PREVIEW = {
  STARTER: {
    label: 'Starter',
    tagline: 'Para empezar a operar profesionalmente',
    description:
      'Hostal boutique o casa de huéspedes que recién deja Excel + WhatsApp. Todo lo esencial sin pagar por funciones que no usarás.',
    mxn: 1200,
    usd: 70,
    accent: 'sky',
    features: [
      { group: 'Operación', items: ['PMS calendario + reservas', 'Housekeeping con app móvil', 'Check-in/out + folio'] },
      { group: 'Canales', items: ['Channex (Booking, Airbnb, Expedia)', 'Hasta 2 canales activos'] },
      { group: 'Límites', items: ['Hasta 30 cuartos', '3 usuarios staff'] },
    ],
    badge: null,
  },
  PRO: {
    label: 'Pro',
    tagline: 'Para hoteles que crecen',
    description:
      'Hotel boutique de 30-100 cuartos con recepción 24h, reportes contables completos y operación multi-canal madura.',
    mxn: 1800,
    usd: 100,
    accent: 'violet',
    features: [
      { group: 'Todo Starter, además', items: ['Reportes USALI 12ª ed', 'Métricas ADR/RevPAR/Pickup'] },
      { group: 'Canales', items: ['Canales OTA ilimitados', 'Rate parity matrix con alertas'] },
      { group: 'Límites', items: ['Hasta 100 cuartos', 'Staff ilimitado'] },
    ],
    badge: 'Más popular',
  },
  ENTERPRISE: {
    label: 'Enterprise',
    tagline: 'Para cadenas y grupos',
    description:
      'Cadenas multi-property, hoteles con dueños múltiples, o casos white-label. Soporte dedicado + onboarding personalizado.',
    mxn: 2400,
    usd: 140,
    accent: 'emerald',
    features: [
      { group: 'Todo Pro, además', items: ['Multi-property nativo', 'White-label / brand propio'] },
      { group: 'Soporte', items: ['Onboarding dedicado', 'SLA respuesta <2h hábil'] },
      { group: 'Límites', items: ['Sin límite de cuartos', 'Multi-LegalEntity'] },
    ],
    badge: null,
  },
} as const

const ANNUAL_DISCOUNT = 0.2 // -20% anual (decisión owner 2026-05-26)

// Cap matrix per tier — server-side la fuente de verdad es
// BillingPartnerTierCap, esto es display-only para UX inmediato.
const TIER_CAP: Record<string, { maxPct: number; allowForever: boolean; label: string }> = {
  AUTHORIZED: { maxPct: 15, allowForever: false, label: 'Authorized' },
  SILVER: { maxPct: 25, allowForever: false, label: 'Silver' },
  GOLD: { maxPct: 35, allowForever: false, label: 'Gold' },
  PLATINUM: { maxPct: 50, allowForever: true, label: 'Platinum' },
  PLATFORM: { maxPct: 100, allowForever: true, label: 'Platform Admin' },
}

const DURATION_COPY = {
  once: { label: 'Solo el primer mes', hint: 'El descuento aplica únicamente al primer cobro mensual.' },
  repeating: { label: 'Por varios meses', hint: 'Define cuántos meses recibe el descuento, luego vuelve al precio regular.' },
  forever: { label: 'Permanente', hint: 'El descuento se mantiene mientras la cuenta esté activa.' },
} as const

export function StepPlanDiscount() {
  const state = useWizardStore()
  const actor = useAuthStore((s) => s.user)
  // PARTNER_MEMBER / PARTNER_ADMIN / PLATFORM tienen partnerTier set;
  // ORG_OWNER no debería estar acá pero defensive default PLATINUM.
  const tierKey = actor?.partnerTier ?? 'PLATFORM'
  const cap = TIER_CAP[tierKey] ?? TIER_CAP.PLATFORM
  const canForever = cap.allowForever

  const planPreview = PLAN_PREVIEW[state.planTier]
  const currency = state.legalEntityBaseCurrency || 'MXN'
  const baseMonthly = currency === 'USD' ? planPreview.usd : planPreview.mxn

  // Cap checks for visual feedback
  const exceedsPercentCap = state.discountEnabled && state.discountPercentOff > cap.maxPct
  const exceedsDurationCap = state.discountEnabled && state.discountDuration === 'forever' && !canForever
  const requiresApproval = exceedsPercentCap || exceedsDurationCap

  // Preview math
  const annualBeforeDiscount = baseMonthly * 12 * (1 - ANNUAL_DISCOUNT)
  const monthlyDiscounted = baseMonthly * (state.discountEnabled ? (100 - state.discountPercentOff) / 100 : 1)
  const monthlyRegular = baseMonthly
  const discountMonths = state.discountEnabled
    ? state.discountDuration === 'once'
      ? 1
      : state.discountDuration === 'repeating'
        ? state.discountDurationInMonths
        : Infinity
    : 0

  // Year-1 total (informational)
  const year1Total =
    state.billingCycle === 'annual'
      ? annualBeforeDiscount * (state.discountEnabled ? (100 - state.discountPercentOff) / 100 : 1)
      : (() => {
          if (!state.discountEnabled) return baseMonthly * 12
          if (state.discountDuration === 'forever') return monthlyDiscounted * 12
          const m = Math.min(discountMonths, 12)
          return monthlyDiscounted * m + monthlyRegular * (12 - m)
        })()

  return (
    <WizardLayout
      title="Plan y cobro"
      description="Eliges el plan, el ciclo de cobro y opcionalmente aplicas un descuento negociado. Al activar el wizard se crea automáticamente la suscripción Stripe del cliente."
    >
      <div className="space-y-4">
        {/* ══════════════ Plan selector ══════════════════════════════ */}
        <Surface variant="raised" radius="lg" padding="lg" className="space-y-4">
          <div>
            <Title>Plan contratado</Title>
            <Caption tone="tertiary" className="block mt-0.5">
              El cliente puede cambiarlo después desde su Customer Portal o vía Nova.
            </Caption>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(['STARTER', 'PRO', 'ENTERPRISE'] as const).map((tier) => {
              const p = PLAN_PREVIEW[tier]
              const isSelected = state.planTier === tier
              const accentRing =
                p.accent === 'sky'
                  ? 'border-sky-500 bg-gradient-to-br from-sky-50 via-white to-white shadow-[0_4px_16px_-6px_rgba(56,189,248,0.35)]'
                  : p.accent === 'violet'
                    ? 'border-violet-500 bg-gradient-to-br from-violet-50 via-white to-white shadow-[0_4px_16px_-6px_rgba(139,92,246,0.35)]'
                    : 'border-emerald-500 bg-gradient-to-br from-emerald-50 via-white to-white shadow-[0_4px_16px_-6px_rgba(16,185,129,0.35)]'
              const accentText =
                p.accent === 'sky' ? 'text-sky-700' : p.accent === 'violet' ? 'text-violet-700' : 'text-emerald-700'

              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => state.setField('planTier', tier)}
                  className={cn(
                    'group relative text-left p-4 rounded-xl border-2 transition-all duration-150 flex flex-col',
                    isSelected ? accentRing : 'border-slate-200 hover:border-slate-300 bg-white',
                  )}
                >
                  {/* Badge popular */}
                  {p.badge && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                      <Chip variant="accent" intent="solid" size="sm">
                        {p.badge}
                      </Chip>
                    </div>
                  )}

                  {/* Header */}
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles
                      className={cn('h-4 w-4', isSelected ? accentText : 'text-slate-400')}
                    />
                    <Subhead className={cn('font-semibold', isSelected && accentText)}>
                      {p.label}
                    </Subhead>
                  </div>

                  {/* Tagline */}
                  <Body
                    className={cn(
                      'text-[12px] font-medium mb-2 leading-tight',
                      isSelected ? accentText : 'text-slate-600',
                    )}
                  >
                    {p.tagline}
                  </Body>

                  {/* Price */}
                  <div className="text-[24px] font-bold text-slate-900 tracking-tight leading-none mb-1">
                    {currency} ${(currency === 'USD' ? p.usd : p.mxn).toLocaleString('es-MX')}
                    <span className="text-[12px] font-normal text-slate-500">/mes</span>
                  </div>

                  {/* Description */}
                  <Caption tone="secondary" className="block leading-snug mb-3">
                    {p.description}
                  </Caption>

                  {/* Features grouped */}
                  <div className="space-y-2 mt-auto pt-3 border-t border-slate-100">
                    {p.features.map((g) => (
                      <div key={g.group}>
                        <Eyebrow tone="tertiary" className="block text-[10px] mb-0.5">
                          {g.group}
                        </Eyebrow>
                        <ul className="space-y-0.5">
                          {g.items.map((f) => (
                            <li key={f} className="flex items-start gap-1.5 text-[12px] text-slate-700">
                              <span className={cn('mt-0.5 flex-shrink-0', isSelected ? accentText : 'text-emerald-500')}>
                                ✓
                              </span>
                              <span className="leading-tight">{f}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </Surface>

        {/* ══════════════ Ciclo + trial ════════════════════════════════ */}
        <Surface variant="raised" radius="lg" padding="lg" className="space-y-4">
          <div className="flex items-start gap-2">
            <Calendar className="h-4 w-4 text-slate-500 mt-0.5" />
            <div className="flex-1">
              <Subhead className="font-semibold">Ciclo de cobro</Subhead>
              <Caption tone="tertiary" className="block mt-0.5">
                Mensual da flexibilidad. Anual compromete 12 meses con -20% del total.
              </Caption>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => state.setField('billingCycle', 'monthly')}
              className={cn(
                'p-3 rounded-lg border-2 text-left transition-colors',
                state.billingCycle === 'monthly'
                  ? 'border-violet-500 bg-violet-50'
                  : 'border-slate-200 hover:border-slate-300',
              )}
            >
              <div className="font-semibold text-slate-900">Mensual</div>
              <Caption tone="tertiary" className="block">
                Cobro cada 30 días. Cancela cuando quiera.
              </Caption>
            </button>
            <button
              type="button"
              onClick={() => state.setField('billingCycle', 'annual')}
              className={cn(
                'p-3 rounded-lg border-2 text-left transition-colors relative',
                state.billingCycle === 'annual'
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-slate-200 hover:border-slate-300',
              )}
            >
              <div className="absolute top-2 right-2">
                <Chip variant="success" intent="subtle" size="sm">
                  -20%
                </Chip>
              </div>
              <div className="font-semibold text-slate-900">Anual</div>
              <Caption tone="tertiary" className="block">
                Prepago 12 meses, ahorra ~2 meses.
              </Caption>
            </button>
          </div>

          {/* Trial */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
            <div className="flex-1">
              <Subhead className="font-semibold">Período de prueba</Subhead>
              <Caption tone="tertiary" className="block mt-0.5">
                Días gratis antes del primer cobro. Recomendado 14d para piloto.
              </Caption>
            </div>
            <select
              value={state.trialDays}
              onChange={(e) => state.setField('trialDays', Number(e.target.value))}
              className="h-10 px-3 rounded-lg border border-slate-300 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-500/30 bg-white"
            >
              <option value={0}>Sin trial</option>
              <option value={7}>7 días</option>
              <option value={14}>14 días</option>
              <option value={30}>30 días</option>
            </select>
          </div>
        </Surface>

        {/* ══════════════ Descuento negociado ═════════════════════════ */}
        <Surface variant="raised" radius="lg" padding="lg" className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-amber-100 text-amber-700 flex-shrink-0">
              <Percent className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Subhead className="font-semibold">Descuento negociado</Subhead>
                <Chip variant="neutral" intent="subtle" size="sm">
                  <Crown className="h-3 w-3 inline mr-0.5" />
                  Tier {cap.label}: hasta {cap.maxPct}%{cap.allowForever ? ' · permanente OK' : ''}
                </Chip>
              </div>
              <Caption tone="tertiary" className="block mt-0.5">
                Si negociaste un descuento, captúralo aquí. Si excedes tu cap se crea una
                solicitud de aprobación automática.
              </Caption>
            </div>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={state.discountEnabled}
                onChange={(e) => state.setField('discountEnabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="relative w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-violet-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
            </label>
          </div>

          {state.discountEnabled && (
            <div className="space-y-4 pt-3 border-t border-slate-100">
              {/* Porcentaje con visual cap zones */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Subhead tone="secondary" className="flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-slate-500" />
                    Porcentaje de descuento
                  </Subhead>
                  <div
                    className={cn(
                      'text-[22px] font-bold tabular-nums tracking-tight',
                      exceedsPercentCap ? 'text-amber-700' : 'text-violet-700',
                    )}
                  >
                    {state.discountPercentOff}%
                  </div>
                </div>

                <div className="relative">
                  {/* Track con zonas color-coded */}
                  <div className="absolute inset-y-0 left-0 right-0 h-2 top-1/2 -translate-y-1/2 rounded-full overflow-hidden flex">
                    {/* Verde (dentro de cap) */}
                    <div
                      className="bg-emerald-200"
                      style={{ width: `${((cap.maxPct - 5) / 45) * 100}%` }}
                      aria-hidden
                    />
                    {/* Amber (requiere approval) — solo si cap < 50 */}
                    {cap.maxPct < 50 && (
                      <div
                        className="bg-amber-200"
                        style={{ width: `${((50 - cap.maxPct) / 45) * 100}%` }}
                        aria-hidden
                      />
                    )}
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={50}
                    step={5}
                    value={state.discountPercentOff}
                    onChange={(e) => state.setField('discountPercentOff', Number(e.target.value))}
                    className="relative w-full accent-violet-600 z-10"
                  />
                </div>

                <div className="flex justify-between mt-1 text-[10px] text-slate-500 tabular-nums">
                  <span>5%</span>
                  <span className="font-semibold text-emerald-700">Tu cap: {cap.maxPct}%</span>
                  <span>50%</span>
                </div>

                {exceedsPercentCap && (
                  <div className="mt-2 flex items-start gap-2 p-2 rounded-md bg-amber-50 border border-amber-200">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-700 flex-shrink-0 mt-0.5" />
                    <Caption className="text-amber-900 text-[12px] leading-tight">
                      Excede tu cap ({cap.maxPct}%). Al activar se creará una solicitud de
                      aprobación al PARTNER_ADMIN. El descuento queda pendiente hasta que apruebe.
                    </Caption>
                  </div>
                )}
              </div>

              {/* Duración con tier-awareness */}
              <div>
                <Subhead tone="secondary" className="mb-1.5">
                  Duración del descuento
                </Subhead>
                <div className="grid grid-cols-3 gap-2">
                  {(['once', 'repeating', 'forever'] as const).map((d) => {
                    const isSelected = state.discountDuration === d
                    const disabled = d === 'forever' && !canForever
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => !disabled && state.setField('discountDuration', d)}
                        disabled={disabled}
                        title={
                          disabled
                            ? `Descuentos permanentes solo disponibles para tier PLATINUM. Tu tier (${cap.label}) puede pedirlo como excepción con aprobación del PARTNER_ADMIN.`
                            : undefined
                        }
                        className={cn(
                          'px-3 py-2.5 rounded-lg border text-[12px] font-medium transition-colors text-left relative',
                          disabled
                            ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed opacity-60'
                            : isSelected
                              ? 'border-violet-500 bg-violet-50 text-violet-900'
                              : 'border-slate-200 hover:border-slate-300 text-slate-700',
                        )}
                      >
                        {disabled && (
                          <Lock className="h-3 w-3 absolute top-1.5 right-1.5 text-slate-400" />
                        )}
                        <div className="font-semibold">{DURATION_COPY[d].label}</div>
                        <Caption tone="tertiary" className="block leading-tight mt-0.5 text-[10.5px]">
                          {DURATION_COPY[d].hint}
                        </Caption>
                      </button>
                    )
                  })}
                </div>

                {state.discountDuration === 'repeating' && (
                  <div className="mt-3 flex items-center gap-3 p-2.5 rounded-md bg-slate-50">
                    <Caption tone="secondary">El descuento dura</Caption>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={state.discountDurationInMonths}
                      onChange={(e) =>
                        state.setField('discountDurationInMonths', Number(e.target.value))
                      }
                      className="w-16 h-8 px-2 rounded-md border border-slate-300 text-[13px] text-center focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                    />
                    <Caption tone="secondary">meses, luego vuelve al precio regular.</Caption>
                  </div>
                )}
              </div>

              {/* Razón */}
              <div>
                <Subhead tone="secondary" className="mb-1.5">
                  Razón del descuento
                  <span className="text-slate-400 font-normal ml-1">(visible en audit log)</span>
                </Subhead>
                <textarea
                  value={state.discountReason}
                  onChange={(e) => state.setField('discountReason', e.target.value)}
                  placeholder="Ej: Cliente piloto referido por consultor — descuento promocional de bienvenida 3 meses."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
                  maxLength={500}
                />
                <div className="mt-1 flex items-center justify-between">
                  <Caption tone="tertiary">Mínimo 20 caracteres</Caption>
                  <Caption
                    className={cn(
                      'tabular-nums font-medium',
                      state.discountReason.trim().length < 20 ? 'text-amber-700' : 'text-emerald-700',
                    )}
                  >
                    {state.discountReason.trim().length}/20
                  </Caption>
                </div>
              </div>

              {requiresApproval && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200">
                  <Info className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />
                  <div>
                    <Body className="text-[12.5px] font-semibold text-amber-900">
                      Este descuento requiere aprobación
                    </Body>
                    <Caption className="text-amber-800 text-[12px] mt-0.5 block leading-tight">
                      Al activar el wizard, la suscripción se crea SIN el descuento y se envía
                      una solicitud al PARTNER_ADMIN. Una vez aprobada, se aplica automáticamente.
                    </Caption>
                  </div>
                </div>
              )}
            </div>
          )}
        </Surface>

        {/* ══════════════ Preview del cobro (timeline) ════════════════ */}
        <BillingTimeline
          baseMonthly={baseMonthly}
          monthlyDiscounted={monthlyDiscounted}
          monthlyRegular={monthlyRegular}
          currency={currency}
          trialDays={state.trialDays}
          discountEnabled={state.discountEnabled}
          discountPercent={state.discountPercentOff}
          discountDuration={state.discountDuration}
          discountMonths={discountMonths}
          billingCycle={state.billingCycle}
          year1Total={year1Total}
          requiresApproval={requiresApproval}
        />
      </div>
    </WizardLayout>
  )
}

// ─────────────────────────────────────────────────────────────────────
// BillingTimeline — preview visual con 3 fases (Trial → Descuento → Regular)
// ─────────────────────────────────────────────────────────────────────

function BillingTimeline({
  baseMonthly,
  monthlyDiscounted,
  monthlyRegular,
  currency,
  trialDays,
  discountEnabled,
  discountPercent,
  discountDuration,
  discountMonths,
  billingCycle,
  year1Total,
  requiresApproval,
}: {
  baseMonthly: number
  monthlyDiscounted: number
  monthlyRegular: number
  currency: string
  trialDays: number
  discountEnabled: boolean
  discountPercent: number
  discountDuration: 'once' | 'repeating' | 'forever'
  discountMonths: number
  billingCycle: 'monthly' | 'annual'
  year1Total: number
  requiresApproval: boolean
}) {
  const fmt = (n: number) =>
    `${currency} $${Math.round(n).toLocaleString('es-MX')}`

  // Build phases
  const phases: Array<{
    key: string
    label: string
    sub: string
    amount: string
    accent: 'emerald' | 'violet' | 'slate'
    icon: typeof Sparkles
  }> = []

  if (trialDays > 0) {
    phases.push({
      key: 'trial',
      label: `Trial: ${trialDays} días`,
      sub: 'Sin cobro',
      amount: 'GRATIS',
      accent: 'emerald',
      icon: Sparkles,
    })
  }

  if (discountEnabled && !requiresApproval) {
    const subLabel =
      discountDuration === 'once'
        ? `Solo el primer mes (-${discountPercent}%)`
        : discountDuration === 'repeating'
          ? `Meses 1-${discountMonths} (-${discountPercent}%)`
          : `Permanente (-${discountPercent}%)`
    phases.push({
      key: 'discount',
      label: subLabel,
      sub: `Descuento aplicado`,
      amount: `${fmt(monthlyDiscounted)}/mes`,
      accent: 'violet',
      icon: Percent,
    })
  }

  // Regular pricing phase — solo si el descuento no es 'forever'
  if (!discountEnabled || discountDuration !== 'forever' || requiresApproval) {
    const label =
      billingCycle === 'annual'
        ? 'Cobro anual recurrente'
        : discountEnabled && !requiresApproval && discountDuration !== 'forever'
          ? `A partir del mes ${discountMonths + 1}`
          : 'Cobro mensual recurrente'
    phases.push({
      key: 'regular',
      label,
      sub: 'Precio regular',
      amount: billingCycle === 'annual' ? `${fmt(monthlyRegular * 12 * 0.8)}/año` : `${fmt(monthlyRegular)}/mes`,
      accent: 'slate',
      icon: Calendar,
    })
  }

  return (
    <Surface
      variant="raised"
      radius="lg"
      padding="lg"
      className="bg-gradient-to-br from-violet-50 via-white to-sky-50 border-violet-200/60 ring-1 ring-violet-100/40"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-[0_4px_12px_-4px_rgba(139,92,246,0.5)]">
            <CreditCard className="h-4 w-4" />
          </div>
          <div>
            <Title as="h3" className="text-[15px] tracking-tight">
              Preview del cobro
            </Title>
            <Caption tone="tertiary" className="block leading-tight">
              Lo que verá el cliente en su factura
            </Caption>
          </div>
        </div>

        {/* Year-1 hero amount */}
        <div className="text-right">
          <Caption tone="tertiary" className="block uppercase text-[10px] tracking-wider">
            Total año 1
          </Caption>
          <div className="text-[24px] font-bold text-violet-900 tracking-tight leading-none tabular-nums">
            {fmt(year1Total)}
          </div>
          {discountEnabled && !requiresApproval && (
            <Caption className="block text-emerald-700 text-[11px] font-medium mt-0.5 leading-tight">
              <TrendingUp className="h-3 w-3 inline mr-0.5" />
              Ahorras {fmt(baseMonthly * 12 - year1Total)}
            </Caption>
          )}
        </div>
      </div>

      {/* Timeline phases */}
      <div className="space-y-2">
        {phases.map((p, idx) => {
          const accentColors = {
            emerald: {
              bg: 'bg-emerald-100',
              text: 'text-emerald-700',
              ring: 'ring-emerald-200',
              amount: 'text-emerald-700',
            },
            violet: {
              bg: 'bg-violet-100',
              text: 'text-violet-700',
              ring: 'ring-violet-200',
              amount: 'text-violet-700',
            },
            slate: {
              bg: 'bg-slate-100',
              text: 'text-slate-600',
              ring: 'ring-slate-200',
              amount: 'text-slate-900',
            },
          }[p.accent]
          const Icon = p.icon

          return (
            <div
              key={p.key}
              className="flex items-center gap-3 p-3 rounded-lg bg-white/70 backdrop-blur-sm ring-1 ring-inset ring-white"
            >
              {/* Connector dot + line */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex items-center justify-center w-9 h-9 rounded-full ring-2',
                    accentColors.bg,
                    accentColors.text,
                    accentColors.ring,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <Body className="text-[13px] font-semibold text-slate-900 leading-tight">
                  {p.label}
                </Body>
                <Caption tone="tertiary" className="block leading-tight mt-0.5">
                  {p.sub}
                </Caption>
              </div>

              <div className={cn('text-[15px] font-bold tabular-nums', accentColors.amount)}>
                {p.amount}
              </div>
            </div>
          )
        })}
      </div>

      {requiresApproval && (
        <Caption className="block mt-3 pt-3 border-t border-violet-200/60 text-amber-800 text-[12px]">
          <Info className="h-3 w-3 inline mr-1" />
          El descuento solicitado aparecerá una vez que el PARTNER_ADMIN lo apruebe. Mientras tanto,
          el cobro sigue el precio regular.
        </Caption>
      )}

      <Caption tone="tertiary" className="block mt-3 pt-3 border-t border-violet-200/60 text-[11px]">
        El cliente puede ver el detalle completo + actualizar método de pago + descargar invoices
        desde su Customer Portal de Stripe.
      </Caption>
    </Surface>
  )
}

export const __EXPORT__ = StepPlanDiscount
