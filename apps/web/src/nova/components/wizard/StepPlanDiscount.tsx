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

// Plans — copy operacional para guía rápida del consultor, NO venta al cliente.
// "fit" = perfil objetivo del cliente para decisión rápida del consultor.
const PLAN_PREVIEW = {
  STARTER: {
    label: 'Starter',
    fit: 'Hostal / casa de huéspedes',
    rangeHint: '< 30 cuartos',
    description:
      'PMS core + housekeeping + folio. Channex con hasta 2 canales OTA. Sin reportes USALI ni métricas ADR/RevPAR.',
    mxn: 1200,
    usd: 70,
    accent: 'sky',
    features: [
      { group: 'Operación', items: ['PMS calendario + reservas', 'Housekeeping con app móvil', 'Check-in/out + folio'] },
      { group: 'Canales', items: ['Channex (Booking / Airbnb / Expedia)', 'Hasta 2 canales activos'] },
      { group: 'Límites', items: ['Hasta 30 cuartos', '3 usuarios staff'] },
    ],
    badge: null,
  },
  PRO: {
    label: 'Pro',
    fit: 'Hotel boutique',
    rangeHint: '30 – 100 cuartos',
    description:
      'Todo Starter + reportes USALI 12ª ed + métricas ADR/RevPAR/Pickup + canales OTA ilimitados con rate parity.',
    mxn: 1800,
    usd: 100,
    accent: 'violet',
    features: [
      { group: 'Todo Starter, además', items: ['Reportes USALI 12ª ed', 'Métricas ADR / RevPAR / Pickup'] },
      { group: 'Canales', items: ['Canales OTA ilimitados', 'Rate parity matrix con alertas'] },
      { group: 'Límites', items: ['Hasta 100 cuartos', 'Staff ilimitado'] },
    ],
    badge: 'Default',
  },
  ENTERPRISE: {
    label: 'Enterprise',
    fit: 'Cadena / grupo / white-label',
    rangeHint: 'Sin límite de cuartos',
    description:
      'Todo Pro + multi-property nativo + white-label / brand propio + Multi-LegalEntity + SLA < 2h hábil con onboarding dedicado.',
    mxn: 2400,
    usd: 140,
    accent: 'emerald',
    features: [
      { group: 'Todo Pro, además', items: ['Multi-property nativo', 'White-label / brand propio'] },
      { group: 'Soporte', items: ['Onboarding dedicado', 'SLA respuesta < 2h hábil'] },
      { group: 'Límites', items: ['Sin límite de cuartos', 'Multi-LegalEntity'] },
    ],
    badge: null,
  },
} as const

const ANNUAL_DISCOUNT = 0.2

const TIER_CAP: Record<string, { maxPct: number; allowForever: boolean; label: string }> = {
  AUTHORIZED: { maxPct: 15, allowForever: false, label: 'Authorized' },
  SILVER: { maxPct: 25, allowForever: false, label: 'Silver' },
  GOLD: { maxPct: 35, allowForever: false, label: 'Gold' },
  PLATINUM: { maxPct: 50, allowForever: true, label: 'Platinum' },
  PLATFORM: { maxPct: 100, allowForever: true, label: 'Platform Admin' },
}

const DURATION_COPY = {
  once: {
    label: 'Una vez',
    hint: 'Stripe Coupon duration=once. Aplica solo al primer cobro.',
  },
  repeating: {
    label: 'N meses',
    hint: 'Stripe Coupon duration=repeating. Define cuántos meses.',
  },
  forever: {
    label: 'Permanente',
    hint: 'Stripe Coupon duration=forever. Aplica mientras la suscripción esté activa.',
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
      description="Define el plan, ciclo de cobro y descuento de la suscripción Zenix del cliente. Al activar el wizard se crea la Stripe Subscription real. El cliente recibe el setup link + acceso a su Customer Portal para administrar pago."
    >
      <div className="space-y-5">
        {/* ══════════════ Plan selector ══════════════════════════════ */}
        <Surface variant="raised" radius="lg" padding="lg">
          <div className="mb-5">
            <Title>Selecciona el plan</Title>
            <Callout tone="tertiary" className="mt-1">
              El cliente puede cambiarlo después desde Customer Portal o tú lo modificas vía
              Nova → Billing.
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
                    'grid grid-rows-[auto_auto_1fr] overflow-hidden',
                    isSelected
                      ? cn(a.border, a.bg, a.shadow)
                      : 'border-slate-200 hover:border-slate-300 bg-white',
                  )}
                >
                  {/* Badge popular — absolute centrado top */}
                  {p.badge && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10">
                      <Chip variant="accent" intent="solid" size="sm">
                        {p.badge}
                      </Chip>
                    </div>
                  )}

                  {/* ── Row 1: header (icon + label + fit + price + scope) ── */}
                  <div className="p-5 pb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles
                        className={cn(
                          'h-4 w-4',
                          isSelected ? a.text : 'text-slate-400',
                        )}
                        aria-hidden
                      />
                      <Headline
                        as="h4"
                        className={cn(isSelected && a.text, 'text-[18px]')}
                      >
                        {p.label}
                      </Headline>
                    </div>

                    {/* Fit — perfil del cliente target. Min-h para alinear. */}
                    <div className="min-h-[40px] mb-3">
                      <BodyMedium className={isSelected ? a.text : 'text-slate-700'}>
                        {p.fit}
                      </BodyMedium>
                      <Caption tone="tertiary" className="block tabular-nums">
                        {p.rangeHint}
                      </Caption>
                    </div>

                    {/* Price — single line */}
                    <div className="flex items-baseline gap-1 mb-3 whitespace-nowrap">
                      <span className="text-[22px] font-bold text-slate-900 tracking-[-0.025em] leading-none tabular-nums">
                        {currency} ${(currency === 'USD' ? p.usd : p.mxn).toLocaleString('es-MX')}
                      </span>
                      <Caption tone="tertiary">/mes</Caption>
                    </div>

                    {/* Description — scope operacional, no copy promocional */}
                    <Callout tone="secondary" className="min-h-[90px] leading-[18px]">
                      {p.description}
                    </Callout>
                  </div>

                  {/* ── Row 2: divider ── */}
                  <div className="h-px bg-slate-100 mx-5" aria-hidden />

                  {/* ── Row 3: features (flex-grow para llenar) ── */}
                  <div className="p-5 pt-4 space-y-4">
                    {p.features.map((g) => (
                      <div key={g.group}>
                        <Eyebrow tone="tertiary" className="block mb-1.5">
                          {g.group}
                        </Eyebrow>
                        <ul className="space-y-1.5">
                          {g.items.map((f) => (
                            <li key={f} className="flex items-start gap-2">
                              <Check
                                className={cn(
                                  'h-3.5 w-3.5 flex-shrink-0 mt-0.5',
                                  isSelected ? a.text : 'text-emerald-500',
                                )}
                                strokeWidth={2.5}
                                aria-hidden
                              />
                              <Callout tone="secondary" className="leading-[18px]">
                                {f}
                              </Callout>
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
        <Surface variant="raised" radius="lg" padding="lg" className="space-y-5">
          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-slate-500 mt-0.5 flex-shrink-0" aria-hidden />
            <div className="flex-1">
              <Title>Ciclo de cobro</Title>
              <Callout tone="tertiary" className="mt-1">
                Anual aplica -20% al total y se prepaga upfront. El consultor puede cambiar el
                ciclo después vía Nova → Billing.
              </Callout>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <CycleButton
              selected={state.billingCycle === 'monthly'}
              onClick={() => state.setField('billingCycle', 'monthly')}
              accent="violet"
              title="Mensual"
              description="Stripe cobra cada 30 días. Cliente puede cancelar mes a mes."
            />
            <CycleButton
              selected={state.billingCycle === 'annual'}
              onClick={() => state.setField('billingCycle', 'annual')}
              accent="emerald"
              title="Anual"
              description="Stripe cobra 12 meses upfront con descuento aplicado al total."
              badge="-20%"
            />
          </div>

          {/* Trial */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
            <div className="flex-1">
              <Title>Período de prueba</Title>
              <Callout tone="tertiary" className="mt-1">
                Stripe no cobra hasta que termine el trial. Default 14d (piloto). Configurable
                hasta 30d sin aprobación.
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
                  Cap tier {cap.label}: {cap.maxPct}%
                  {cap.allowForever ? ' · permanente OK' : ''}
                </Chip>
              </div>
              <Callout tone="tertiary" className="mt-1">
                Captura el descuento que negociaste con el cliente. Dentro de tu cap se aplica
                directo; fuera del cap genera approval request al PARTNER_ADMIN.
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
                    Tu cap: {cap.maxPct}%
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
                        Excede tu cap ({cap.maxPct}%) — requiere approval
                      </BodyMedium>
                      <Callout tone="secondary" className="text-amber-800 mt-0.5">
                        Se creará un DiscountApprovalRequest al activar. La suscripción arranca
                        sin descuento; al aprobar el PARTNER_ADMIN, Stripe lo aplica
                        automáticamente.
                      </Callout>
                    </div>
                  </div>
                )}
              </div>

              {/* Duración */}
              <div>
                <Subhead className="block mb-2">Duración del descuento</Subhead>
                <div className="grid grid-cols-3 gap-3">
                  {(['once', 'repeating', 'forever'] as const).map((d) => {
                    const isSelected = state.discountDuration === d
                    const disabled = d === 'forever' && !canForever
                    return (
                      <DurationCard
                        key={d}
                        title={DURATION_COPY[d].label}
                        hint={DURATION_COPY[d].hint}
                        selected={isSelected}
                        disabled={disabled}
                        onClick={() => !disabled && state.setField('discountDuration', d)}
                        disabledHint={
                          disabled
                            ? `Solo tier PLATINUM puede emitir descuentos permanentes directo. Tu tier (${cap.label}) requiere approval del PARTNER_ADMIN.`
                            : undefined
                        }
                      />
                    )
                  })}
                </div>

                {state.discountDuration === 'repeating' && (
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
                      (queda en AuditLog permanente)
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
                      Requiere approval del PARTNER_ADMIN
                    </BodyMedium>
                    <Callout tone="secondary" className="text-amber-800 mt-0.5">
                      Al activar, la Stripe Subscription se crea SIN el descuento y aparece un
                      DiscountApprovalRequest pending en Nova → Billing → Aprobaciones (TTL 7d).
                      Al aprobar se aplica automáticamente.
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

  const phases: Array<{
    key: string
    title: string
    sub: string
    amount: string
    accent: 'emerald' | 'violet' | 'slate'
    icon: typeof Sparkles
  }> = []

  if (trialDays > 0) {
    phases.push({
      key: 'trial',
      title: `Trial · ${trialDays} días`,
      sub: 'Stripe no cobra hasta vencer el trial',
      amount: 'Sin cobro',
      accent: 'emerald',
      icon: Sparkles,
    })
  }

  if (discountEnabled && !requiresApproval) {
    const title =
      discountDuration === 'once'
        ? 'Mes 1 · descuento aplicado'
        : discountDuration === 'repeating'
          ? `Meses 1 – ${discountMonths} · descuento aplicado`
          : 'Recurrente · descuento aplicado'
    phases.push({
      key: 'discount',
      title,
      sub: `Coupon Stripe -${discountPercent}%`,
      amount: `${fmt(monthlyDiscounted)} / mes`,
      accent: 'violet',
      icon: Percent,
    })
  }

  if (!discountEnabled || discountDuration !== 'forever' || requiresApproval) {
    const title =
      discountEnabled && !requiresApproval && discountDuration !== 'forever'
        ? `Mes ${discountMonths + 1}+ · precio regular`
        : billingCycle === 'annual'
          ? 'Renovación anual · precio regular'
          : 'Cobro recurrente · precio regular'
    phases.push({
      key: 'regular',
      title,
      sub: billingCycle === 'annual' ? 'Stripe Subscription billed annually' : 'Stripe Subscription billed monthly',
      amount:
        billingCycle === 'annual'
          ? `${fmt(monthlyRegular * 12 * 0.8)} / año`
          : `${fmt(monthlyRegular)} / mes`,
      accent: 'slate',
      icon: Calendar,
    })
  }

  return (
    <Surface variant="raised" radius="lg" padding="lg" className="space-y-4">
      {/* Header — mismo lenguaje que las otras secciones */}
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-50 text-violet-700 flex-shrink-0">
          <CreditCard className="h-4 w-4" aria-hidden />
        </div>
        <div className="flex-1">
          <Title>Preview de cobros — primer año</Title>
          <Callout tone="tertiary" className="mt-1">
            Simulación que se reflejará en Stripe. Verifica con el cliente antes de avanzar al
            paso 9 (activación).
          </Callout>
        </div>
      </div>

      {/* Total año 1 hero — tablerow style */}
      <div className="flex items-end justify-between p-4 rounded-xl bg-slate-50 border border-slate-100">
        <div>
          <Eyebrow tone="tertiary" className="block mb-1">
            Total año 1
          </Eyebrow>
          <MetricLarge className="text-violet-900">{fmt(year1Total)}</MetricLarge>
        </div>
        {discountEnabled && !requiresApproval && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-700" aria-hidden />
            <Subhead className="text-emerald-800">
              Ahorras {fmt(baseMonthly * 12 - year1Total)}
            </Subhead>
          </div>
        )}
      </div>

      {/* Timeline phases */}
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
                <BodyMedium>{p.title}</BodyMedium>
                <Callout tone="tertiary" className="leading-tight mt-0.5">
                  {p.sub}
                </Callout>
              </div>

              <Headline as="div" className={cn('text-[16px] tabular-nums', colors.amount)}>
                {p.amount}
              </Headline>
            </div>
          )
        })}
      </div>

      {requiresApproval && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200">
          <Info className="h-3.5 w-3.5 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden />
          <Callout tone="secondary" className="text-amber-800">
            Este preview ignora el descuento pendiente. Hasta que el PARTNER_ADMIN apruebe,
            Stripe cobra el precio regular.
          </Callout>
        </div>
      )}

      <Caption tone="tertiary" className="block pt-3 border-t border-slate-100">
        El cliente accede a Customer Portal (Stripe) para método de pago + invoices. Tú
        gestionas plan/descuentos vía Nova → Billing.
      </Caption>
    </Surface>
  )
}

export const __EXPORT__ = StepPlanDiscount
