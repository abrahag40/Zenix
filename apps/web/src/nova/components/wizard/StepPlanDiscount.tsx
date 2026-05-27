/**
 * Step 7.5 — Plan + descuento negociado.
 *
 * Sprint BILLING-CORE Day 6 (§176 D-NOVA-18 + plan §15 subscription billing).
 *
 * El consultor selecciona el plan (Starter / Pro / Enterprise) + ciclo
 * (mensual / anual con -20%) + trial opcional + descuento negociado.
 *
 * Cap validation client-side es heurística — el backend valida contra
 * BillingPartnerTierCap del consultor real al activar (§91-§93 / Day 4).
 * Aquí solo mostramos el cap teórico para feedback inmediato.
 */
import { useWizardStore } from '../../../store/wizard'
import { WizardLayout } from './WizardLayout'
import { Surface, Body, Subhead, Caption, Chip, Title, Eyebrow } from '../../design-system'
import { CreditCard, Percent, Tag, AlertTriangle, Calendar, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

// Pricing display (MXN base). Backend usa BillingPricingConfig real al
// crear la Stripe Subscription — esto es PREVIEW informativo solamente.
// Los montos se sincronizan via /v1/nova/admin/pricing (Day 5).
const PLAN_PREVIEW = {
  STARTER: { mxn: 1200, usd: 70, label: 'Starter', features: ['PMS core', 'Channel manager', 'Hasta 30 cuartos'] },
  PRO: { mxn: 1800, usd: 100, label: 'Pro', features: ['Todo Starter', 'Reportes USALI', 'Hasta 100 cuartos'] },
  ENTERPRISE: { mxn: 2400, usd: 140, label: 'Enterprise', features: ['Todo Pro', 'Multi-property', 'White-label', 'Sin límite'] },
} as const

const ANNUAL_DISCOUNT = 0.2 // -20% prepagando 12 meses (decisión owner 2026-05-26)

export function StepPlanDiscount() {
  const state = useWizardStore()
  const planPreview = PLAN_PREVIEW[state.planTier]
  const currency = state.legalEntityBaseCurrency || 'MXN'
  const baseAmount = currency === 'USD' ? planPreview.usd : planPreview.mxn

  // Cálculo del monto efectivo per período
  const cycleMultiplier = state.billingCycle === 'annual' ? 12 * (1 - ANNUAL_DISCOUNT) : 1
  const beforeDiscount = baseAmount * cycleMultiplier

  // Aplicar discount si activo
  const discountFactor = state.discountEnabled ? (100 - state.discountPercentOff) / 100 : 1
  const firstPeriod = beforeDiscount * discountFactor

  return (
    <WizardLayout
      title="Plan y cobro"
      description="Eliges el plan, el ciclo de cobro y opcionalmente aplicas un descuento negociado. Al activar el wizard se crea automáticamente la suscripción Stripe del cliente."
    >
      <div className="space-y-4">
        {/* ── Selector de plan ───────────────────────────────────── */}
        <Surface variant="raised" radius="lg" padding="lg" className="space-y-4">
          <div>
            <Title>Plan contratado</Title>
            <Caption tone="tertiary" className="block mt-0.5">
              El plan determina el precio base mensual. El cliente puede cambiarlo después
              desde su Customer Portal o vía Nova.
            </Caption>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(['STARTER', 'PRO', 'ENTERPRISE'] as const).map((tier) => {
              const p = PLAN_PREVIEW[tier]
              const isSelected = state.planTier === tier
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => state.setField('planTier', tier)}
                  className={cn(
                    'group relative text-left p-4 rounded-xl border-2 transition-all duration-150',
                    isSelected
                      ? 'border-violet-500 bg-gradient-to-br from-violet-50 via-white to-white shadow-[0_4px_16px_-6px_rgba(139,92,246,0.35)]'
                      : 'border-slate-200 hover:border-slate-300 bg-white',
                  )}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2">
                      <Chip variant="success" intent="solid" size="sm">
                        Seleccionado
                      </Chip>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles
                      className={cn(
                        'h-4 w-4',
                        isSelected ? 'text-violet-600' : 'text-slate-400',
                      )}
                    />
                    <Subhead className={cn('font-semibold', isSelected && 'text-violet-900')}>
                      {p.label}
                    </Subhead>
                  </div>
                  <div className="text-[20px] font-bold text-slate-900 tracking-tight">
                    {currency} ${(currency === 'USD' ? p.usd : p.mxn).toLocaleString('es-MX')}
                    <span className="text-[12px] font-normal text-slate-500">/mes</span>
                  </div>
                  <ul className="mt-3 space-y-1">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-[12px] text-slate-600">
                        <span className="text-emerald-500 mt-0.5">✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </button>
              )
            })}
          </div>
        </Surface>

        {/* ── Ciclo de cobro + trial ─────────────────────────────── */}
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
                Cobro cada 30 días. Cancela en cualquier momento.
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
                Prepago 12 meses con descuento.
              </Caption>
            </button>
          </div>

          {/* Trial */}
          <div className="pt-3 border-t border-slate-100">
            <label className="flex items-center justify-between gap-3">
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
            </label>
          </div>
        </Surface>

        {/* ── Descuento negociado ─────────────────────────────────── */}
        <Surface variant="raised" radius="lg" padding="lg" className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-amber-100 text-amber-700 flex-shrink-0">
              <Percent className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <Subhead className="font-semibold">Descuento negociado</Subhead>
              <Caption tone="tertiary" className="block mt-0.5">
                Si negociaste un descuento con el cliente, captúralo aquí. El cap se valida
                contra tu tier de partner al activar.
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
            <div className="space-y-4 pt-2 border-t border-slate-100">
              {/* Porcentaje */}
              <div>
                <Subhead tone="secondary" className="flex items-center gap-1.5 mb-1.5">
                  <Tag className="h-3.5 w-3.5 text-slate-500" />
                  Porcentaje de descuento
                </Subhead>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={5}
                    max={50}
                    step={5}
                    value={state.discountPercentOff}
                    onChange={(e) => state.setField('discountPercentOff', Number(e.target.value))}
                    className="flex-1 accent-violet-600"
                  />
                  <div className="w-20 text-right">
                    <span className="text-[20px] font-bold text-violet-700">
                      {state.discountPercentOff}%
                    </span>
                  </div>
                </div>
                <Caption tone="tertiary" className="block mt-1">
                  Cap por tier: AUTHORIZED 15% · SILVER 25% · GOLD 35% · PLATINUM 50%. Si excedes
                  tu cap, se crea una solicitud de aprobación automática.
                </Caption>
              </div>

              {/* Duración */}
              <div>
                <Subhead tone="secondary" className="mb-1.5">
                  Duración del descuento
                </Subhead>
                <div className="grid grid-cols-3 gap-2">
                  {(['once', 'repeating', 'forever'] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => state.setField('discountDuration', d)}
                      className={cn(
                        'px-3 py-2 rounded-lg border text-[13px] font-medium transition-colors',
                        state.discountDuration === d
                          ? 'border-violet-500 bg-violet-50 text-violet-900'
                          : 'border-slate-200 hover:border-slate-300 text-slate-700',
                      )}
                    >
                      {d === 'once'
                        ? 'Solo 1 cobro'
                        : d === 'repeating'
                          ? 'X meses'
                          : 'Permanente'}
                    </button>
                  ))}
                </div>
                {state.discountDuration === 'repeating' && (
                  <div className="mt-3 flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={state.discountDurationInMonths}
                      onChange={(e) =>
                        state.setField('discountDurationInMonths', Number(e.target.value))
                      }
                      className="w-20 h-9 px-3 rounded-lg border border-slate-300 text-[14px] focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                    />
                    <Caption tone="secondary">
                      meses con descuento, luego precio regular
                    </Caption>
                  </div>
                )}
                {state.discountDuration === 'forever' && (
                  <Caption tone="tertiary" className="block mt-2 text-amber-700">
                    <AlertTriangle className="h-3 w-3 inline mr-1" />
                    Solo PLATINUM puede emitir descuentos permanentes sin aprobación. Otros tiers
                    requieren approval del PARTNER_ADMIN.
                  </Caption>
                )}
              </div>

              {/* Razón */}
              <div>
                <Subhead tone="secondary" className="mb-1.5">
                  Razón del descuento
                </Subhead>
                <textarea
                  value={state.discountReason}
                  onChange={(e) => state.setField('discountReason', e.target.value)}
                  placeholder="Ej: Cliente piloto referido por consultor — descuento promocional de bienvenida 3 meses."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
                  maxLength={500}
                />
                <Caption tone="tertiary" className="block mt-1">
                  Visible en audit log permanente. Mínimo 20 caracteres.{' '}
                  <span
                    className={cn(
                      state.discountReason.trim().length < 20 ? 'text-amber-700' : 'text-emerald-700',
                    )}
                  >
                    {state.discountReason.trim().length}/20
                  </span>
                </Caption>
              </div>
            </div>
          )}
        </Surface>

        {/* ── Preview del cobro ─────────────────────────────────── */}
        <Surface variant="raised" radius="lg" padding="lg" tone="info">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-sky-100 text-sky-700 flex-shrink-0">
              <CreditCard className="h-4 w-4" />
            </div>
            <div>
              <Subhead className="font-semibold">Preview del cobro</Subhead>
              <Caption tone="tertiary" className="block mt-0.5">
                Simulación de lo que verá el cliente. El cobro real lo administra Stripe.
              </Caption>
            </div>
          </div>

          <div className="space-y-2">
            {state.trialDays > 0 && (
              <Row label={`Trial (primeros ${state.trialDays} días)`} value="GRATIS" emerald />
            )}
            {state.discountEnabled && (
              <Row
                label={
                  state.discountDuration === 'once'
                    ? `1er cobro (${state.discountPercentOff}% off)`
                    : state.discountDuration === 'repeating'
                      ? `Meses 1-${state.discountDurationInMonths} (${state.discountPercentOff}% off)`
                      : `Cobro recurrente (${state.discountPercentOff}% off permanente)`
                }
                value={`${currency} $${Math.round(firstPeriod).toLocaleString('es-MX')}`}
                emerald
              />
            )}
            <Row
              label={
                state.discountEnabled && state.discountDuration !== 'forever'
                  ? `${state.discountDuration === 'once' ? 'Resto del año' : 'Precio regular (post-descuento)'}`
                  : state.billingCycle === 'annual'
                    ? 'Cobro anual'
                    : 'Cobro mensual'
              }
              value={`${currency} $${Math.round(beforeDiscount).toLocaleString('es-MX')}${
                state.billingCycle === 'monthly' ? '/mes' : '/año'
              }`}
            />
          </div>

          <Caption tone="tertiary" className="block mt-3 pt-3 border-t border-sky-200/60">
            El cliente podrá ver el detalle completo en su Customer Portal — puede actualizar
            método de pago, descargar invoices, cancelar.
          </Caption>
        </Surface>
      </div>
    </WizardLayout>
  )
}

function Row({ label, value, emerald }: { label: string; value: string; emerald?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <Body tone="secondary" className="text-[13px]">
        {label}
      </Body>
      <Body
        className={cn(
          'text-[13px] font-semibold tabular-nums',
          emerald ? 'text-emerald-700' : 'text-slate-900',
        )}
      >
        {value}
      </Body>
    </div>
  )
}

export const __EXPORT__ = StepPlanDiscount
