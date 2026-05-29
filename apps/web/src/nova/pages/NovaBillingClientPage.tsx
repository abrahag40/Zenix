/**
 * NovaBillingClientPage — gestión de la subscription del current acting org.
 *
 * Sprint CLIENT-RETENTION-DISCOUNTS (2026-05-29). Owner use case 2026-05-29:
 *   "cliente mes 4 con descuento puntual (duration='once') o 3 meses
 *    (duration='repeating' durationInMonths=3) y vuelve a normal mes 7
 *    automático. Stripe nativo respeta el duration — sin scheduler propio."
 *
 * Ruta: /nova/billing/cliente. Requiere actingOrg seteado.
 *
 * Backend ya 100% listo: DiscountCodeService.generate acepta subs activas
 * con status `active|trialing|past_due` y llama stripe.subscriptions.update
 * con discounts real (líneas 522-535 discount-code.service.ts). Solo falta UI.
 *
 * Layout:
 *   · Header con nombre del cliente
 *   · Card subscription state (plan + monto + status + next renewal)
 *   · Discount activo (si hay) con preview ahorro
 *   · CTA "Aplicar descuento de retención" → ApplyRetentionDiscountDialog
 *   · History de todos los discounts (collapsibles)
 *
 * Pattern Salesforce CPQ Customer Detail + Stripe Dashboard subscription detail.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CreditCard,
  Calendar,
  TrendingDown,
  Percent,
  Sparkles,
  ChevronRight,
  History,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { NovaShell } from '../NovaShell'
import {
  Surface,
  Headline,
  Title,
  Body,
  Caption,
  Eyebrow,
  Chip,
  Button,
} from '../design-system'
import {
  billingClient,
  type NovaSubscription,
  type NovaSubscriptionDiscount,
} from '../api/billing-client'
import { useNovaStore } from '../../store/nova'
import { ApplyRetentionDiscountDialog } from '../components/ApplyRetentionDiscountDialog'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────

export function NovaBillingClientPage() {
  const actingOrgId = useNovaStore((s) => s.actingOrgId)
  const actingOrgName = useNovaStore((s) => s.actingOrgName)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [applyOpen, setApplyOpen] = useState(false)

  // Guard: sin cliente seleccionado → redirect a /nova/clientes
  if (!actingOrgId) {
    return (
      <NovaShell title="Sin cliente seleccionado">
        <Surface variant="raised" radius="lg" padding="lg" className="text-center py-10">
          <Title>Selecciona un cliente primero</Title>
          <Body className="mt-2 max-w-md mx-auto">
            Ve a "Clientes" en el menú lateral, elige el cliente al que quieres aplicar el descuento
            de retención, y vuelve a esta página.
          </Body>
          <div className="mt-4">
            <Button variant="primary" size="md" onClick={() => navigate('/nova/clientes')}>
              Ir a clientes
            </Button>
          </div>
        </Surface>
      </NovaShell>
    )
  }

  const { data: sub, isLoading, isError } = useQuery<NovaSubscription>({
    queryKey: ['nova', 'billing', 'subscription', actingOrgId],
    queryFn: billingClient.getSubscriptionForActingOrg,
  })

  const applyMutation = useMutation({
    mutationFn: billingClient.generateRetentionDiscount,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['nova', 'billing', 'subscription', actingOrgId] })
      qc.invalidateQueries({ queryKey: ['billing', 'approvals'] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
      setApplyOpen(false)
      if (result.kind === 'applied') {
        toast.success('Descuento aplicado — efectivo desde el próximo cobro')
      } else {
        toast.success(
          'Descuento enviado para aprobación — un PARTNER_ADMIN lo revisará',
          { duration: 5000 },
        )
      }
    },
    onError: (err: Error) => toast.error(err.message || 'No se pudo aplicar el descuento'),
  })

  return (
    <NovaShell title={`Billing — ${actingOrgName ?? actingOrgId}`}>
      <div className="space-y-5">
        <Link
          to="/nova/billing"
          className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a Billing
        </Link>

        {/* Header */}
        <div>
          <Eyebrow>Cliente · suscripción</Eyebrow>
          <Headline className="mt-1">{actingOrgName ?? 'Cliente'}</Headline>
          <Body className="mt-1.5 max-w-2xl">
            Gestión de la subscription Stripe del cliente. Aplica descuentos de retención
            (Netflix-style win-back: % off durante N meses, vuelve al precio acordado automático).
          </Body>
        </div>

        {/* Content */}
        {isLoading && (
          <Surface variant="raised" radius="lg" padding="lg">
            <Body>Cargando subscription…</Body>
          </Surface>
        )}

        {isError && (
          <Surface variant="raised" radius="lg" padding="lg" tone="warning">
            <Title>No se pudo cargar la subscription</Title>
            <Body className="mt-1">
              Posible: el wizard no completó la creación de Stripe sub, o el cliente nunca pagó.
              Revisa el estado del cliente desde el wizard.
            </Body>
          </Surface>
        )}

        {!isLoading && !isError && sub && (
          <>
            <SubscriptionCard sub={sub} />
            <ActiveDiscountCard sub={sub} onApplyNew={() => setApplyOpen(true)} />
            <DiscountHistorySection discounts={sub.discounts} />
          </>
        )}
      </div>

      {sub && (
        <ApplyRetentionDiscountDialog
          open={applyOpen}
          onClose={() => setApplyOpen(false)}
          onSubmit={(input) =>
            applyMutation.mutate({
              subscriptionId: sub.id,
              autoRequestApprovalIfExceedsCap: true,
              ...input,
            })
          }
          isPending={applyMutation.isPending}
          subscription={sub}
        />
      )}
    </NovaShell>
  )
}

// ─────────────────────────────────────────────────────────────────────
// SubscriptionCard — estado actual de la sub
// ─────────────────────────────────────────────────────────────────────

function SubscriptionCard({ sub }: { sub: NovaSubscription }) {
  const monthly = Number(sub.baseMonthlyAmount) * sub.propertyCount
  const monthlyLabel = formatCurrency(monthly, sub.currency)
  const cycleLabel = sub.billingCycle === 'annual' ? 'Anual (-20%)' : 'Mensual'
  const status = sub.status
  const statusVariant = STATUS_VARIANT[status] ?? 'neutral'

  return (
    <Surface variant="raised" radius="lg" padding="lg">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <Eyebrow>Suscripción activa</Eyebrow>
          <Title className="mt-1">Plan {sub.planTier} · {cycleLabel}</Title>
          <Caption className="mt-1 font-mono text-slate-400">{sub.stripeSubscriptionId}</Caption>
        </div>
        <Chip variant={statusVariant} className="shrink-0">
          {STATUS_LABEL[status] ?? status}
        </Chip>
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field
          label="Tarifa mensual"
          value={monthlyLabel}
          subtitle={`${sub.propertyCount} propiedad${sub.propertyCount === 1 ? '' : 'es'}`}
        />
        <Field
          label="Próximo cobro"
          value={
            sub.nextRenewalDate
              ? new Date(sub.nextRenewalDate).toLocaleDateString('es-MX', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : '—'
          }
          subtitle={sub.autoRenew ? 'Auto-renovación activa' : 'Renovación manual'}
        />
        <Field
          label="Currency"
          value={sub.currency}
          subtitle={cycleLabel}
        />
        <Field
          label="Card capturada"
          value={sub.cardCapturedAt ? '✓' : '✗'}
          subtitle={sub.cardCapturedAt ? new Date(sub.cardCapturedAt).toLocaleDateString('es-MX') : 'Sin tarjeta'}
          tone={sub.cardCapturedAt ? 'emerald' : 'amber'}
        />
      </div>
    </Surface>
  )
}

// ─────────────────────────────────────────────────────────────────────
// ActiveDiscountCard — descuento activo + CTA aplicar nuevo
// ─────────────────────────────────────────────────────────────────────

function ActiveDiscountCard({
  sub,
  onApplyNew,
}: {
  sub: NovaSubscription
  onApplyNew: () => void
}) {
  // Discount activo = el más reciente sin voidedAt
  const activeDiscount = sub.discounts.find((d) => !d.voidedAt)
  const monthly = Number(sub.baseMonthlyAmount) * sub.propertyCount

  return (
    <Surface variant="raised" radius="lg" padding="lg">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <Eyebrow>Descuento de retención</Eyebrow>
          {activeDiscount ? (
            <>
              <div className="mt-1 flex items-center gap-2">
                <Title>{activeDiscount.percentOff}% off</Title>
                <Chip variant="success" className="shrink-0">
                  Activo
                </Chip>
              </div>
              <Caption className="mt-1">{durationLabel(activeDiscount)}</Caption>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field
                  label="Tarifa con desc."
                  value={formatCurrency(monthly * (1 - activeDiscount.percentOff / 100), sub.currency)}
                  tone="emerald"
                />
                <Field
                  label="Ahorro mensual"
                  value={formatCurrency(monthly * (activeDiscount.percentOff / 100), sub.currency)}
                  tone="amber"
                />
              </div>
              {activeDiscount.reason && (
                <div className="mt-3 text-xs text-slate-600 italic border-l-2 border-slate-300 pl-2.5 py-1">
                  "{activeDiscount.reason}"
                </div>
              )}
            </>
          ) : (
            <>
              <Title className="mt-1">Sin descuento activo</Title>
              <Body className="mt-1">
                El cliente paga la tarifa estándar de {formatCurrency(monthly, sub.currency)}/mes.
              </Body>
            </>
          )}
        </div>

        <div className="shrink-0">
          <Button variant="primary" size="md" onClick={onApplyNew}>
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            Aplicar descuento de retención
          </Button>
        </div>
      </div>

      {/* Explainer del comportamiento Stripe */}
      <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500 flex items-start gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
        <div>
          El descuento se aplica desde el <strong>próximo cobro</strong> (Stripe lo respeta automático).
          Cuando termina la duración, Stripe vuelve al precio acordado <strong>sin acción adicional</strong>.
          Si tu tier no alcanza el % solicitado, queda pendiente de aprobación PARTNER_ADMIN.
        </div>
      </div>
    </Surface>
  )
}

// ─────────────────────────────────────────────────────────────────────
// DiscountHistorySection — todos los discounts pasados + actuales
// ─────────────────────────────────────────────────────────────────────

function DiscountHistorySection({ discounts }: { discounts: NovaSubscriptionDiscount[] }) {
  const [expanded, setExpanded] = useState(false)

  if (discounts.length === 0) {
    return (
      <Surface variant="raised" radius="lg" padding="lg">
        <div className="flex items-center gap-2 text-slate-500">
          <History className="h-4 w-4" />
          <Body>Sin discounts históricos para este cliente.</Body>
        </div>
      </Surface>
    )
  }

  return (
    <Surface variant="raised" radius="lg" padding="lg">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-500" />
          <Title>Historial de descuentos ({discounts.length})</Title>
        </div>
        <ChevronRight
          className={cn(
            'h-4 w-4 text-slate-400 transition-transform',
            expanded ? 'rotate-90' : '',
          )}
        />
      </button>

      {expanded && (
        <div className="mt-4 space-y-2">
          {discounts.map((d) => (
            <DiscountRow key={d.id} discount={d} />
          ))}
        </div>
      )}
    </Surface>
  )
}

function DiscountRow({ discount }: { discount: NovaSubscriptionDiscount }) {
  const isVoided = !!discount.voidedAt
  const isActive = !isVoided
  const appliedAt = new Date(discount.appliedAt)

  return (
    <div
      className={cn(
        'rounded-md border p-3 text-sm flex items-start justify-between gap-3 flex-wrap',
        isVoided ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-emerald-200 bg-emerald-50/40',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-900">
            {discount.percentOff}% off
          </span>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-slate-600">{durationLabel(discount)}</span>
          {isActive && <Chip variant="success" size="sm">Activo</Chip>}
          {isVoided && <Chip variant="neutral" size="sm">Anulado</Chip>}
        </div>
        {discount.reason && (
          <p className="mt-1 text-xs text-slate-600 italic">"{discount.reason}"</p>
        )}
        <p className="mt-1 text-[11px] text-slate-500 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Aplicado {appliedAt.toLocaleString('es-MX')}
          {discount.expiresAt && (
            <> · expira {new Date(discount.expiresAt).toLocaleDateString('es-MX')}</>
          )}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[10px] font-mono text-slate-400">{discount.promotionCode}</div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  active: 'Activa',
  trialing: 'En prueba',
  past_due: 'Pago vencido',
  paused: 'Pausada',
  canceled: 'Cancelada',
  incomplete: 'Incompleta',
  pending_payment_method: 'Esperando tarjeta',
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  active: 'success',
  trialing: 'info',
  past_due: 'warning',
  paused: 'warning',
  canceled: 'neutral',
  incomplete: 'danger',
  pending_payment_method: 'warning',
}

function durationLabel(d: { duration: string; durationInMonths: number | null }): string {
  if (d.duration === 'once') return 'Solo primer cobro'
  if (d.duration === 'forever') return 'Permanente'
  if (d.duration === 'repeating') {
    return d.durationInMonths != null
      ? `${d.durationInMonths} mes${d.durationInMonths === 1 ? '' : 'es'}`
      : 'Repetitivo'
  }
  return d.duration
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(0)}`
  }
}

interface FieldProps {
  label: string
  value: string
  subtitle?: string
  tone?: 'emerald' | 'amber'
}

function Field({ label, value, subtitle, tone }: FieldProps) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div
        className={cn(
          'mt-0.5 text-sm font-semibold tabular-nums',
          tone === 'emerald' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-900',
        )}
      >
        {value}
      </div>
      {subtitle && <div className="text-[11px] text-slate-500 mt-0.5">{subtitle}</div>}
    </div>
  )
}
