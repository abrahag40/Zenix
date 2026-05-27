/**
 * Step 7.5 — Plan + descuento negociado (v3 alineado a design-system Nova).
 *
 * Sprint BILLING-CORE Day 6 — iteración 3 tras feedback owner 2026-05-26:
 *   · Pixel-perfect alignment con grid-rows fijo per row de cada card
 *   · Typography 100% design-system: Title / BodyMedium / Body / Callout /
 *     Subhead / Caption / Eyebrow / MetricLarge — NO inline text-[Xpx]
 *   · Preview del cobro unificado con el resto (sin gradient frankenstein)
 *   · Spacing consistente: gap-4/5 entre cards, gap-2 dentro
 *   · Tier-aware descuento + cap visual + "Permanente" lock per tier
 */
import { useWizardStore } from '../../../store/wizard'
import { useAuthStore } from '../../../store/auth'
import { WizardLayout } from './WizardLayout'
import {
  Surface,
  Body,
  BodyMedium,
  Callout,
  Subhead,
  Caption,
  Title,
  Eyebrow,
  Headline,
  Chip,
  MetricLarge,
} from '../../design-system'
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
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ──────────────────────────────────────────────────────────────────────
// Data
// ──────────────────────────────────────────────────────────────────────

// Plans — referencia operacional al consultor (no pitch). Cards compactas:
// fit + range + 3 features key + price. Detalle full vive en docs/pricing.
const PLAN_PREVIEW = {
  STARTER: {
    label: 'Starter',
    fit: 'Hostal o casa huéspedes',
    rangeHint: '< 30 cuartos',
    mxn: 1200,
    usd: 70,
    accent: 'sky',
    features: [
      'PMS + housekeeping',
      'Channex 2 canales',
      'Sin USALI / ADR',
    ],
    badge: null,
  },
  PRO: {
    label: 'Pro',
    fit: 'Hotel boutique',
    rangeHint: '30 – 100 cuartos',
    mxn: 1800,
    usd: 100,
    accent: 'violet',
    features: [
      'Todo Starter +',
      'USALI + ADR/RevPAR',
      'OTA ilimitadas',
    ],
    badge: 'Default',
  },
  ENTERPRISE: {
    label: 'Enterprise',
    fit: 'Cadena o white-label',
    rangeHint: 'Sin límite',
    mxn: 2400,
    usd: 140,
    accent: 'emerald',
    features: [
      'Todo Pro +',
      'Multi-property',
      'SLA + onboarding',
    ],
    badge: null,
  },
} as const

const ANNUAL_DISCOUNT = 0.2

const TIER_CAP: Record<
  string,
  { maxPct: number; allowForever: boolean; label: string; chipText: string }
> = {
  AUTHORIZED: {
    maxPct: 15,
    allowForever: false,
    label: 'Authorized',
    chipText: 'Hasta 15% · solo temporales',
  },
  SILVER: {
    maxPct: 25,
    allowForever: false,
    label: 'Silver',
    chipText: 'Hasta 25% · solo temporales',
  },
  GOLD: {
    maxPct: 35,
    allowForever: false,
    label: 'Gold',
    chipText: 'Hasta 35% · solo temporales',
  },
  PLATINUM: {
    maxPct: 50,
    allowForever: true,
    label: 'Platinum',
    chipText: 'Hasta 50% · permanente permitido',
  },
  PLATFORM: {
    maxPct: 100,
    allowForever: true,
    label: 'Platform Admin',
    chipText: 'Sin límite — eres admin',
  },
}

// ──────────────────────────────────────────────────────────────────────
// Date helpers
// ──────────────────────────────────────────────────────────────────────

const DATE_FMT = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function fmtDate(d: Date): string {
  return DATE_FMT.format(d).replace('.', '') // "27 may 2026"
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}

// Duration copy depende del cycle. Annual sólo tiene 1 cobro/año, por eso
// "repeating" (N meses) no aplica — Stripe descarta el coupon después del
// único invoice anual (ver docs/billing/subscriptions/coupons).
const DURATION_COPY_MONTHLY = {
  once: {
    label: 'Una vez',
    hint: 'Aplica solo al primer cobro mensual.',
  },
  repeating: {
    label: 'Varios meses',
    hint: 'Define cuántos meses, luego vuelve al precio regular.',
  },
  forever: {
    label: 'Permanente',
    hint: 'Aplica mientras el cliente siga suscrito.',
  },
} as const

const DURATION_COPY_ANNUAL = {
  once: {
    label: 'Solo este año',
    hint: 'Aplica solo al primer cobro anual. Renovaciones futuras al precio regular.',
  },
  forever: {
    label: 'Cada renovación',
    hint: 'Aplica a cada cobro anual mientras el cliente siga suscrito.',
  },
} as const

// Accent color tokens — usados consistentemente entre plan card + preview
const ACCENT = {
  sky: {
    border: 'border-sky-500',
    bg: 'bg-sky-50/50',
    text: 'text-sky-700',
    shadow: 'shadow-[0_4px_16px_-6px_rgba(56,189,248,0.30)]',
  },
  violet: {
    border: 'border-violet-500',
    bg: 'bg-violet-50/40',
    text: 'text-violet-700',
    shadow: 'shadow-[0_4px_16px_-6px_rgba(139,92,246,0.30)]',
  },
  emerald: {
    border: 'border-emerald-500',
    bg: 'bg-emerald-50/40',
    text: 'text-emerald-700',
    shadow: 'shadow-[0_4px_16px_-6px_rgba(16,185,129,0.30)]',
  },
} as const

// ──────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────

export function StepPlanDiscount() {
  const state = useWizardStore()
  const actor = useAuthStore((s) => s.user)
  const tierKey = actor?.partnerTier ?? 'PLATFORM'
  const cap = TIER_CAP[tierKey] ?? TIER_CAP.PLATFORM
  const canForever = cap.allowForever

  const planPreview = PLAN_PREVIEW[state.planTier]
  const currency = state.legalEntityBaseCurrency || 'MXN'
  const baseMonthly = currency === 'USD' ? planPreview.usd : planPreview.mxn

  const exceedsPercentCap = state.discountEnabled && state.discountPercentOff > cap.maxPct
  const exceedsDurationCap = state.discountEnabled && state.discountDuration === 'forever' && !canForever
  const requiresApproval = exceedsPercentCap || exceedsDurationCap

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
      description="Define el plan, ciclo de cobro y descuento de la suscripción del cliente. Al activar el wizard se crea automáticamente en Stripe. El cliente recibe el enlace para configurar su método de pago."
    >
      <div className="space-y-5">
        {/* ══════════════ Plan selector ══════════════════════════════ */}
        <Surface variant="raised" radius="lg" padding="lg">
          <div className="mb-5">
            <Title>Selecciona el plan</Title>
            <Callout tone="tertiary" className="mt-1">
              El cliente puede cambiar de plan luego desde su portal. Tú también lo modificas
              desde Nova → Billing.
            </Callout>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['STARTER', 'PRO', 'ENTERPRISE'] as const).map((tier) => {
              const p = PLAN_PREVIEW[tier]
              const isSelected = state.planTier === tier
              const a = ACCENT[p.accent]

              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => state.setField('planTier', tier)}
                  className={cn(
                    'group relative text-left rounded-xl border-2 transition-all duration-150',
                    // Grid con row-tracks explícitos en píxeles → alineación
                    // pixel-perfect entre las 3 cards independiente de wraps.
                    // [28px label] [56px fit+range] [28px price] [108px features]
                    'p-4 grid grid-rows-[28px_56px_28px_108px] gap-3',
                    isSelected
                      ? cn(a.border, a.bg, a.shadow)
                      : 'border-slate-200 hover:border-slate-300 bg-white',
                  )}
                >
                  {p.badge && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10">
                      <Chip variant="accent" intent="solid" size="sm">
                        {p.badge}
                      </Chip>
                    </div>
                  )}

                  {/* Row 1: icon + label — h:28px */}
                  <div className="flex items-center gap-2">
                    <Sparkles
                      className={cn(
                        'h-4 w-4',
                        isSelected ? a.text : 'text-slate-400',
                      )}
                      aria-hidden
                    />
                    <Headline
                      as="h4"
                      className={cn(isSelected && a.text, 'text-[17px]')}
                    >
                      {p.label}
                    </Headline>
                  </div>

                  {/* Row 2: fit + range — h:56px reserva 2-line wrap */}
                  <div className="flex flex-col justify-start">
                    <BodyMedium
                      className={cn(
                        'leading-[18px]',
                        isSelected ? a.text : 'text-slate-700',
                      )}
                    >
                      {p.fit}
                    </BodyMedium>
                    <Caption tone="tertiary" className="block tabular-nums mt-auto">
                      {p.rangeHint}
                    </Caption>
                  </div>

                  {/* Row 3: price — h:28px single line */}
                  <div className="flex items-baseline gap-1 whitespace-nowrap">
                    <span className="text-[22px] font-bold text-slate-900 tracking-[-0.025em] leading-none tabular-nums">
                      {currency} ${(currency === 'USD' ? p.usd : p.mxn).toLocaleString('es-MX')}
                    </span>
                    <Caption tone="tertiary">/mes</Caption>
                  </div>

                  {/* Row 4: features 3 items — h:108px reserva fija (3 × 24px row + 2 × gap-1.5 + padding) */}
                  <div className="pt-3 border-t border-slate-100/80 grid grid-rows-[24px_24px_24px] gap-1.5">
                    {p.features.map((f) => (
                      <div key={f} className="flex items-center gap-2">
                        <Check
                          className={cn(
                            'h-3.5 w-3.5 flex-shrink-0',
                            isSelected ? a.text : 'text-emerald-500',
                          )}
                          strokeWidth={2.5}
                          aria-hidden
                        />
                        <Callout tone="secondary" className="text-[12.5px] truncate">
                          {f}
                        </Callout>
                      </div>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </Surface>

        {/* ══════════════ Ciclo + trial ════════════════════════════════ */}
        <Surface variant="raised" radius="lg" padding="lg" className="space-y-5">
          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-slate-500 mt-0.5 flex-shrink-0" aria-hidden />
            <div className="flex-1">
              <Title>Ciclo de cobro</Title>
              <Callout tone="tertiary" className="mt-1">
                Anual lleva -20% pagando el año por adelantado. Tú puedes cambiar el ciclo
                después desde Nova → Billing.
              </Callout>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <CycleButton
              selected={state.billingCycle === 'monthly'}
              onClick={() => state.setField('billingCycle', 'monthly')}
              accent="violet"
              title="Mensual"
              description="Cobro cada 30 días. El cliente puede cancelar mes a mes."
            />
            <CycleButton
              selected={state.billingCycle === 'annual'}
              onClick={() => {
                state.setField('billingCycle', 'annual')
                // Auto-corregir: annual no soporta "repeating" (no hay meses
                // dentro de una suscripción anual). Cambiar a "once" automático.
                if (state.discountDuration === 'repeating') {
                  state.setField('discountDuration', 'once')
                }
              }}
              accent="emerald"
              title="Anual"
              description="Un solo cobro del año por adelantado, con -20% sobre el total."
              badge="-20%"
            />
          </div>

          {/* Trial */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
            <div className="flex-1">
              <Title>Período de prueba</Title>
              <Callout tone="tertiary" className="mt-1">
                Días gratis antes del primer cobro. 14 días es el default recomendado para
                pilotos. Hasta 30 sin necesitar aprobación.
              </Callout>
            </div>
            <select
              value={state.trialDays}
              onChange={(e) => state.setField('trialDays', Number(e.target.value))}
              className="h-10 px-3 rounded-lg border border-slate-300 text-[13px] font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500/30 bg-white"
            >
              <option value={0}>Sin trial</option>
              <option value={7}>7 días</option>
              <option value={14}>14 días</option>
              <option value={30}>30 días</option>
            </select>
          </div>
        </Surface>

        {/* ══════════════ Descuento negociado ═════════════════════════ */}
        <Surface variant="raised" radius="lg" padding="lg" className="space-y-5">
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-amber-50 text-amber-700 flex-shrink-0">
              <Percent className="h-4 w-4" aria-hidden />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Title>Descuento negociado</Title>
                <Chip variant="neutral" intent="subtle" size="sm">
                  <Crown className="h-3 w-3 inline mr-1" aria-hidden />
                  {cap.chipText}
                </Chip>
              </div>
              <Callout tone="tertiary" className="mt-1">
                Si negociaste un descuento con el cliente, captúralo aquí. Dentro de tu límite
                se aplica al momento; si lo excedes, queda pendiente de aprobación.
              </Callout>
            </div>

            <Toggle
              checked={state.discountEnabled}
              onChange={(v) => state.setField('discountEnabled', v)}
            />
          </div>

          {state.discountEnabled && (
            <div className="space-y-5 pt-4 border-t border-slate-100">
              {/* Porcentaje */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Subhead className="flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                    Porcentaje de descuento
                  </Subhead>
                  <Headline
                    as="div"
                    className={cn(
                      'text-[22px] tabular-nums tracking-tight leading-none',
                      exceedsPercentCap ? 'text-amber-700' : 'text-violet-700',
                    )}
                  >
                    {state.discountPercentOff}%
                  </Headline>
                </div>

                <div className="relative">
                  {/* Track con zonas color-coded */}
                  <div className="absolute inset-y-0 left-0 right-0 h-2 top-1/2 -translate-y-1/2 rounded-full overflow-hidden flex bg-slate-200">
                    <div
                      className="bg-emerald-200"
                      style={{ width: `${((cap.maxPct - 5) / 45) * 100}%` }}
                      aria-hidden
                    />
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

                <div className="flex justify-between mt-2">
                  <Caption tone="tertiary" className="tabular-nums">
                    5%
                  </Caption>
                  <Caption className="tabular-nums text-emerald-700 font-semibold">
                    Tu límite: {cap.maxPct}%
                  </Caption>
                  <Caption tone="tertiary" className="tabular-nums">
                    50%
                  </Caption>
                </div>

                {exceedsPercentCap && (
                  <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <AlertTriangle
                      className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5"
                      aria-hidden
                    />
                    <div>
                      <BodyMedium className="text-amber-900">
                        Excede tu límite ({cap.maxPct}%) — necesita aprobación
                      </BodyMedium>
                      <Callout tone="secondary" className="text-amber-800 mt-0.5">
                        Al activar el wizard, la suscripción se crea sin el descuento y queda
                        una solicitud pendiente para tu admin. Cuando apruebe, se aplica
                        automáticamente.
                      </Callout>
                    </div>
                  </div>
                )}
              </div>

              {/* Duración — opciones cambian según cycle.
                  Annual no soporta "repeating" (sólo 1 invoice/año) → solo
                  Once / Forever. Monthly tiene las 3. */}
              <div>
                <Subhead className="block mb-2">Duración del descuento</Subhead>
                {(() => {
                  const isAnnual = state.billingCycle === 'annual'
                  const COPY = isAnnual ? DURATION_COPY_ANNUAL : DURATION_COPY_MONTHLY
                  const durations = isAnnual
                    ? (['once', 'forever'] as const)
                    : (['once', 'repeating', 'forever'] as const)
                  const cols = isAnnual ? 'grid-cols-2' : 'grid-cols-3'
                  return (
                    <div className={cn('grid gap-3', cols)}>
                      {durations.map((d) => {
                        const isSelected = state.discountDuration === d
                        const disabled = d === 'forever' && !canForever
                        const copyEntry = COPY[d as keyof typeof COPY]
                        return (
                          <DurationCard
                            key={d}
                            title={copyEntry.label}
                            hint={copyEntry.hint}
                            selected={isSelected}
                            disabled={disabled}
                            onClick={() => !disabled && state.setField('discountDuration', d)}
                            disabledHint={
                              disabled
                                ? `Tu nivel (${cap.label}) no permite descuentos permanentes sin aprobación. Solo Platinum los aplica directo.`
                                : undefined
                            }
                          />
                        )
                      })}
                    </div>
                  )
                })()}

                {state.discountDuration === 'repeating' && state.billingCycle === 'monthly' && (
                  <div className="mt-3 flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-50 border border-slate-100">
                    <Body tone="secondary">Duración:</Body>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={state.discountDurationInMonths}
                      onChange={(e) =>
                        state.setField('discountDurationInMonths', Number(e.target.value))
                      }
                      className="w-16 h-9 px-2 rounded-md border border-slate-300 text-[14px] font-medium text-center text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500/30 bg-white"
                    />
                    <Body tone="secondary">meses (1 – 12).</Body>
                  </div>
                )}
              </div>

              {/* Razón */}
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <Subhead>
                    Justificación{' '}
                    <Caption tone="tertiary" className="font-normal">
                      (queda registrado para auditoría)
                    </Caption>
                  </Subhead>
                  <Caption
                    className={cn(
                      'tabular-nums font-medium',
                      state.discountReason.trim().length < 20
                        ? 'text-amber-700'
                        : 'text-emerald-700',
                    )}
                  >
                    {state.discountReason.trim().length}/20
                  </Caption>
                </div>
                <textarea
                  value={state.discountReason}
                  onChange={(e) => state.setField('discountReason', e.target.value)}
                  placeholder="Ej: piloto Q3 2026 — descuento de bienvenida 3 meses, aprobado en llamada comercial 2026-05-24."
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-[13px] leading-[18px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
                  maxLength={500}
                />
              </div>

              {requiresApproval && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <Info className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden />
                  <div>
                    <BodyMedium className="text-amber-900">
                      Necesita aprobación de tu admin
                    </BodyMedium>
                    <Callout tone="secondary" className="text-amber-800 mt-0.5">
                      Al activar, la suscripción se crea sin el descuento y la solicitud aparece
                      en Nova → Billing → Aprobaciones (vence en 7 días). Cuando tu admin
                      apruebe, se aplica automáticamente.
                    </Callout>
                  </div>
                </div>
              )}
            </div>
          )}
        </Surface>

        {/* ══════════════ Preview del cobro (timeline unificado) ═════ */}
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

// ──────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────

function CycleButton({
  selected,
  onClick,
  accent,
  title,
  description,
  badge,
}: {
  selected: boolean
  onClick: () => void
  accent: 'violet' | 'emerald'
  title: string
  description: string
  badge?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative text-left p-4 rounded-xl border-2 transition-colors',
        selected
          ? accent === 'violet'
            ? 'border-violet-500 bg-violet-50/50'
            : 'border-emerald-500 bg-emerald-50/40'
          : 'border-slate-200 hover:border-slate-300 bg-white',
      )}
    >
      {badge && (
        <div className="absolute top-3 right-3">
          <Chip variant="success" intent="subtle" size="sm">
            {badge}
          </Chip>
        </div>
      )}
      <Title>{title}</Title>
      <Callout tone="tertiary" className="mt-1">
        {description}
      </Callout>
    </button>
  )
}

function DurationCard({
  title,
  hint,
  selected,
  disabled,
  onClick,
  disabledHint,
}: {
  title: string
  hint: string
  selected: boolean
  disabled?: boolean
  onClick: () => void
  disabledHint?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabledHint}
      className={cn(
        'relative text-left p-4 rounded-xl border-2 transition-colors',
        'grid grid-rows-[auto_1fr] gap-1.5 min-h-[88px]',
        disabled
          ? 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-60'
          : selected
            ? 'border-violet-500 bg-violet-50/50'
            : 'border-slate-200 hover:border-slate-300 bg-white',
      )}
    >
      {disabled && (
        <Lock className="absolute top-3 right-3 h-3.5 w-3.5 text-slate-400" aria-hidden />
      )}
      <Title className={cn(disabled && 'text-slate-500')}>{title}</Title>
      <Callout tone="tertiary" className="leading-snug">
        {hint}
      </Callout>
    </button>
  )
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center cursor-pointer flex-shrink-0 mt-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <div className="relative w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-violet-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-slate-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600 peer-checked:after:border-violet-600" />
    </label>
  )
}

// ──────────────────────────────────────────────────────────────────────
// BillingTimeline — preview unificado con resto del step
// ──────────────────────────────────────────────────────────────────────

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
  const fmt = (n: number) => `${currency} $${Math.round(n).toLocaleString('es-MX')}`

  // ── Compute dates (assumes wizard activates today) ──
  const today = new Date()
  const trialEnd = trialDays > 0 ? addDays(today, trialDays) : today
  const firstChargeDate = trialEnd
  const discountEndDate =
    discountEnabled && discountDuration !== 'forever' && !requiresApproval
      ? addMonths(firstChargeDate, discountMonths)
      : null
  const annualRenewDate = addMonths(firstChargeDate, 12)

  // ── First charge amount + label ──
  const annualBeforeDiscount = baseMonthly * 12 * 0.8
  const firstChargeAmount =
    billingCycle === 'annual'
      ? annualBeforeDiscount * (discountEnabled && !requiresApproval ? (100 - discountPercent) / 100 : 1)
      : monthlyDiscounted
  const firstChargeLabel =
    billingCycle === 'annual'
      ? 'Pago anual por adelantado'
      : discountEnabled && !requiresApproval
        ? `Cobro mensual con -${discountPercent}%`
        : 'Cobro mensual'

  // ── Regular reference price (para strikethrough) ──
  // Booking/Notion/Vercel pattern: precio sin NINGÚN descuento (ni anual -20%
  // ni negociado), permite que el consultor vea cuánto se ahorra el cliente
  // contra lista completa.
  const regularReference =
    billingCycle === 'annual' ? baseMonthly * 12 : baseMonthly
  const regularReferenceLabel =
    billingCycle === 'annual' ? 'Precio anual sin descuento' : 'Precio regular mensual'

  // ── Descuento negociado en monto (separado del descuento anual auto) ──
  // Stripe Checkout pattern: cada coupon/discount aparece en su propia línea.
  // Aquí desglosamos para que el consultor distinga lo automático (anual -20%)
  // del que metió personalmente (% negociado).
  const negotiatedDiscountAmount =
    discountEnabled && !requiresApproval
      ? (billingCycle === 'annual' ? regularReference * 0.8 : regularReference) *
        (discountPercent / 100)
      : 0

  // ── Build phases con fechas anclas ──
  type Phase = {
    key: string
    dateLabel: string
    title: string
    sub: string
    amount: string
    accent: 'emerald' | 'violet' | 'slate'
    icon: typeof Sparkles
  }
  const phases: Phase[] = []

  if (trialDays > 0) {
    phases.push({
      key: 'trial',
      dateLabel: `Hoy · ${fmtDate(today)}`,
      title: `Período de prueba · ${trialDays} días`,
      sub: `Termina el ${fmtDate(trialEnd)}`,
      amount: 'Sin cobro',
      accent: 'emerald',
      icon: Sparkles,
    })
  }

  if (billingCycle === 'annual') {
    phases.push({
      key: 'annual',
      dateLabel: fmtDate(firstChargeDate),
      title: 'Cobro anual por adelantado',
      sub: discountEnabled && !requiresApproval
        ? `12 meses con -20% anual + -${discountPercent}% adicional`
        : '12 meses con -20% sobre el total',
      amount: fmt(firstChargeAmount),
      accent: 'violet',
      icon: CreditCard,
    })
    phases.push({
      key: 'renew',
      dateLabel: fmtDate(annualRenewDate),
      title: 'Renovación anual',
      sub: 'Se cobra el siguiente año automáticamente',
      amount: `${fmt(annualBeforeDiscount)} / año`,
      accent: 'slate',
      icon: Calendar,
    })
  } else {
    // Monthly billing
    if (discountEnabled && !requiresApproval) {
      const months =
        discountDuration === 'once' ? 1 : discountDuration === 'repeating' ? discountMonths : 12
      const phaseEnd = addMonths(firstChargeDate, months)
      phases.push({
        key: 'discount',
        dateLabel: fmtDate(firstChargeDate),
        title:
          discountDuration === 'once'
            ? `Mes 1 con -${discountPercent}% de descuento`
            : discountDuration === 'repeating'
              ? `Meses 1 – ${months} con -${discountPercent}% de descuento`
              : `Cobro mensual con -${discountPercent}% permanente`,
        sub:
          discountDuration === 'forever'
            ? 'Descuento permanente · sin fecha de fin'
            : `Hasta el ${fmtDate(phaseEnd)} · ${months} ${months === 1 ? 'cobro' : 'cobros'}`,
        amount: `${fmt(monthlyDiscounted)} / mes`,
        accent: 'violet',
        icon: Percent,
      })
    }

    // Regular phase — sólo si no hay descuento forever
    if (!discountEnabled || discountDuration !== 'forever' || requiresApproval) {
      const startDate = discountEndDate ?? firstChargeDate
      const startLabel =
        discountEnabled && !requiresApproval && discountDuration !== 'forever'
          ? `Desde ${fmtDate(startDate)}`
          : fmtDate(startDate)
      phases.push({
        key: 'regular',
        dateLabel: startLabel,
        title: 'Cobro mensual recurrente',
        sub: 'Sin fecha de fin · el cliente puede cancelar cuando quiera',
        amount: `${fmt(monthlyRegular)} / mes`,
        accent: 'slate',
        icon: Calendar,
      })
    }
  }

  // Savings calc — solo si hay descuento aplicado y no requires approval
  const savings = discountEnabled && !requiresApproval ? baseMonthly * 12 - year1Total : 0

  return (
    <Surface variant="raised" radius="lg" padding="lg" className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-50 text-violet-700 flex-shrink-0">
          <CreditCard className="h-4 w-4" aria-hidden />
        </div>
        <div className="flex-1">
          <Title>Preview de cobros</Title>
          <Callout tone="tertiary" className="mt-1">
            Simulación con fechas reales si activas hoy. Verifica con el cliente antes de
            continuar al paso 9.
          </Callout>
        </div>
      </div>

      {/* Timeline phases — date-anchored (line items / operaciones) */}
      <div className="space-y-2">
        {phases.map((p) => {
          const colors = {
            emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', amount: 'text-emerald-700' },
            violet: { bg: 'bg-violet-50', text: 'text-violet-700', amount: 'text-violet-700' },
            slate: { bg: 'bg-slate-100', text: 'text-slate-600', amount: 'text-slate-900' },
          }[p.accent]
          const Icon = p.icon

          return (
            <div
              key={p.key}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-100 bg-white"
            >
              <div
                className={cn(
                  'flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0',
                  colors.bg,
                  colors.text,
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <BodyMedium>{p.title}</BodyMedium>
                  <Caption tone="tertiary" className="tabular-nums">
                    {p.dateLabel}
                  </Caption>
                </div>
                <Callout tone="tertiary" className="leading-tight mt-0.5">
                  {p.sub}
                </Callout>
              </div>

              <Headline as="div" className={cn('text-[15px] tabular-nums', colors.amount)}>
                {p.amount}
              </Headline>
            </div>
          )
        })}
      </div>

      {/* Total al final — invoice/receipt convention: amounts right-aligned,
       *  strikethrough del precio sin descuento, descuentos SEPARADOS
       *  (anual auto + negociado), total bold con separator.
       *  Fuentes: Stripe Checkout, Salesforce CPQ, AHLEI receipt standards,
       *  Booking.com confirmation page (strikethrough pattern). */}
      <div className="pt-4 mt-1 border-t-2 border-slate-200 space-y-3">
        {/* Bloque primer cobro — receipt style, amounts right-aligned */}
        <div className="p-4 rounded-xl bg-violet-50/60 border border-violet-200/60">
          {/* Línea precio regular tachado — solo visible si hay descuento real */}
          {regularReference > firstChargeAmount && (
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <Caption tone="tertiary">{regularReferenceLabel}</Caption>
              <Caption
                tone="tertiary"
                className="line-through tabular-nums text-slate-500"
              >
                {fmt(regularReference)}
              </Caption>
            </div>
          )}

          {/* Descuento anual automático (-20%) — solo si cycle=annual.
              Separado del descuento negociado para que el consultor vea
              exactamente qué % metió vs qué % es automático. */}
          {billingCycle === 'annual' && (
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <Callout className="text-emerald-700">
                Descuento por pago anual
                <span className="ml-1 text-emerald-600/80">(−20%)</span>
              </Callout>
              <Callout className="text-emerald-700 tabular-nums font-semibold">
                −{fmt(regularReference - regularReference * 0.8)}
              </Callout>
            </div>
          )}

          {/* Descuento negociado (lo que metió el consultor) — separado */}
          {discountEnabled && !requiresApproval && (
            <div className="flex items-baseline justify-between gap-3 mb-2 pb-2 border-b border-violet-200/40">
              <Callout className="text-emerald-700">
                Descuento negociado
                <span className="ml-1 text-emerald-600/80">(−{discountPercent}%)</span>
              </Callout>
              <Callout className="text-emerald-700 tabular-nums font-semibold">
                −{fmt(negotiatedDiscountAmount)}
              </Callout>
            </div>
          )}

          {/* Border-bottom cuando hay descuento anual pero no negociado */}
          {billingCycle === 'annual' && !(discountEnabled && !requiresApproval) && (
            <div className="border-b border-violet-200/40 mb-2 pb-1" aria-hidden />
          )}

          {/* Total row — primer cobro como TOTAL line invoice-style */}
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Eyebrow tone="tertiary" className="block text-violet-700">
                Primer cobro
              </Eyebrow>
              <Callout tone="secondary" className="text-violet-800 mt-0.5">
                {fmtDate(firstChargeDate)}
                {trialDays > 0 && ` · después de ${trialDays} días de prueba`}
              </Callout>
            </div>
            <div className="text-right">
              <div className="text-[24px] font-bold text-violet-900 tabular-nums tracking-tight leading-none whitespace-nowrap">
                {fmt(firstChargeAmount)}
              </div>
              <Caption tone="tertiary" className="block mt-1 text-violet-700/80">
                {firstChargeLabel}
              </Caption>
            </div>
          </div>
        </div>

        {/* Estimación 12 meses — sólo en mensual (en anual sería redundante
         *  con el primer cobro, que ya es el pago completo del año). */}
        {billingCycle === 'monthly' && (
          <div className="px-1 flex items-baseline justify-between gap-2">
            <Caption tone="tertiary">Estimación primeros 12 meses</Caption>
            <Subhead className="text-slate-900 tabular-nums">{fmt(year1Total)}</Subhead>
          </div>
        )}
      </div>

      {requiresApproval && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200">
          <Info className="h-3.5 w-3.5 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden />
          <Callout tone="secondary" className="text-amber-800">
            Esta simulación asume precio regular. Mientras tu admin no apruebe el descuento, el
            cliente paga el precio sin descuento.
          </Callout>
        </div>
      )}

      <Caption tone="tertiary" className="block pt-3 border-t border-slate-100">
        El cliente gestiona método de pago + descarga facturas desde Stripe. Tú modificas plan
        o descuentos desde Nova → Billing.
      </Caption>
    </Surface>
  )
}

export const __EXPORT__ = StepPlanDiscount
