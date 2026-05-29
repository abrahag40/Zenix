/**
 * ApplyRetentionDiscountDialog — modal para aplicar discount de retención.
 *
 * Sprint CLIENT-RETENTION-DISCOUNTS (2026-05-29). Use case owner:
 *   "darle 3 meses de descuento, al finalizar se renueva el pago normal"
 *
 * Form ad-hoc (NO templates — los templates existen para wizard, ver
 * NovaBillingCodesPage). Aquí el consultor configura puntualmente:
 *   - % off (5-50, slider)
 *   - duration: 'once' / 'repeating' (N meses) / 'forever'
 *   - durationInMonths (solo si duration='repeating')
 *   - reason (10-500 chars, audit trail)
 *
 * Preview en vivo del impacto: monto antes/después + duración + cuándo vuelve
 * al precio acordado. Comunica claramente que Stripe respeta el revert
 * automático.
 */
import { useState, useMemo } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '../design-system'
import type { NovaSubscription } from '../api/billing-client'
import { cn } from '@/lib/utils'

type Duration = 'once' | 'repeating' | 'forever'

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (input: {
    percentOff: number
    duration: Duration
    durationInMonths?: number
    reason: string
  }) => void
  isPending: boolean
  subscription: NovaSubscription
}

export function ApplyRetentionDiscountDialog({
  open,
  onClose,
  onSubmit,
  isPending,
  subscription,
}: Props) {
  const [percentOff, setPercentOff] = useState(15)
  const [duration, setDuration] = useState<Duration>('repeating')
  const [durationInMonths, setDurationInMonths] = useState(3)
  const [reason, setReason] = useState('')

  const monthly = Number(subscription.baseMonthlyAmount) * subscription.propertyCount

  const reasonValid = reason.trim().length >= 10
  const percentValid = percentOff >= 5 && percentOff <= 50
  const monthsValid = duration !== 'repeating' || (durationInMonths >= 1 && durationInMonths <= 24)
  const canSubmit = percentValid && monthsValid && reasonValid && !isPending

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit({
      percentOff,
      duration,
      ...(duration === 'repeating' ? { durationInMonths } : {}),
      reason: reason.trim(),
    })
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && !isPending) {
      // Reset al cerrar (sin dirty-check porque no es destructive)
      setPercentOff(15)
      setDuration('repeating')
      setDurationInMonths(3)
      setReason('')
      onClose()
    }
  }

  // Preview cálculos
  const preview = useMemo(() => {
    const newMonthly = monthly * (1 - percentOff / 100)
    const monthlySavings = monthly - newMonthly
    const totalSavings =
      duration === 'once'
        ? monthlySavings
        : duration === 'repeating'
          ? monthlySavings * durationInMonths
          : Infinity
    return { newMonthly, monthlySavings, totalSavings }
  }, [monthly, percentOff, duration, durationInMonths])

  // Próxima fecha de cobro + cuándo vuelve a tarifa normal
  const nextChargeDate = subscription.nextRenewalDate
    ? new Date(subscription.nextRenewalDate)
    : new Date()
  const revertDate = useMemo(() => {
    if (duration === 'once' || duration === 'forever') return null
    const d = new Date(nextChargeDate)
    d.setMonth(d.getMonth() + durationInMonths)
    return d
  }, [duration, durationInMonths, nextChargeDate])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-2rem))]',
            '-translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-2xl ring-1 ring-slate-200/60',
            'max-h-[90vh] overflow-y-auto',
          )}
        >
          {/* Header */}
          <div className="px-5 pt-5 pb-3 border-b border-slate-100">
            <DialogPrimitive.Title className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              Aplicar descuento de retención
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1 text-xs text-slate-500">
              Pattern Netflix/Spotify win-back — el descuento aplica desde el próximo cobro y vuelve
              automático al precio acordado cuando termina.
            </DialogPrimitive.Description>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-5">
            {/* Percent off */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                Porcentaje de descuento <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={5}
                  value={percentOff}
                  onChange={(e) => setPercentOff(Number(e.target.value))}
                  disabled={isPending}
                  className="flex-1 accent-emerald-600"
                />
                <div className="w-16 text-right">
                  <span className="text-xl font-bold text-emerald-700 tabular-nums">{percentOff}%</span>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                5% mínimo, 50% máximo. Si tu tier no alcanza, queda pendiente de aprobación.
              </p>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                Duración <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['once', 'repeating', 'forever'] as Duration[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    disabled={isPending}
                    className={cn(
                      'rounded-md border px-3 py-2 text-xs font-medium transition-colors text-left',
                      duration === d
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                    )}
                  >
                    <div className="font-semibold">
                      {d === 'once' && 'Solo próximo cobro'}
                      {d === 'repeating' && 'N meses'}
                      {d === 'forever' && 'Permanente'}
                    </div>
                    <div className="mt-0.5 text-[10px] opacity-75">
                      {d === 'once' && 'Mes siguiente vuelve a normal'}
                      {d === 'repeating' && 'Define cuántos meses'}
                      {d === 'forever' && 'Hasta que lo anules'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Months (si repeating) */}
            {duration === 'repeating' && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                  Cantidad de meses <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={durationInMonths}
                    onChange={(e) => setDurationInMonths(Math.max(1, Math.min(24, Number(e.target.value))))}
                    disabled={isPending}
                    className="w-20 px-2.5 py-1.5 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                  />
                  <span className="text-xs text-slate-500">meses (1-24)</span>
                </div>
                {revertDate && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Vuelve a tarifa normal el{' '}
                    <strong>{revertDate.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
                  </p>
                )}
              </div>
            )}

            {/* Preview */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3.5 py-3 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                Preview impacto
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-[11px] text-slate-500">Tarifa actual</div>
                  <div className="font-semibold text-slate-700 tabular-nums">
                    {formatCurrency(monthly, subscription.currency)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Con descuento</div>
                  <div className="font-semibold text-emerald-700 tabular-nums">
                    {formatCurrency(preview.newMonthly, subscription.currency)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">
                    {duration === 'once' ? 'Ahorro total' : 'Ahorro mensual'}
                  </div>
                  <div className="font-semibold text-amber-700 tabular-nums">
                    {formatCurrency(preview.monthlySavings, subscription.currency)}
                  </div>
                </div>
              </div>
              {duration === 'repeating' && (
                <div className="pt-2 border-t border-emerald-200 text-[11px] text-slate-600">
                  Ahorro total {durationInMonths} meses:{' '}
                  <strong className="text-amber-700">
                    {formatCurrency(Number(preview.totalSavings), subscription.currency)}
                  </strong>
                </div>
              )}
            </div>

            {/* Reason */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                Razón comercial <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 500))}
                rows={2}
                placeholder="Ej: cliente reportó churn risk en QBR; aplicamos 15% × 3 meses como retención preventiva."
                disabled={isPending}
                className={cn(
                  'w-full px-2.5 py-1.5 rounded-md border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 resize-none',
                  reason.length > 0 && !reasonValid ? 'border-red-300' : 'border-slate-200',
                )}
              />
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className={cn(reason.length > 0 && !reasonValid ? 'text-red-600' : 'text-slate-500')}>
                  {reasonValid ? 'OK' : 'Mínimo 10 caracteres (audit trail)'}
                </span>
                <span className="text-slate-400 tabular-nums">{500 - reason.length} restantes</span>
              </div>
            </div>

            {/* Behavior explainer */}
            <div className="flex items-start gap-2 text-[11px] text-slate-600 bg-slate-50 rounded-md px-3 py-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                Aplica al próximo invoice (no al actual). Stripe respeta el <code>duration</code> y
                vuelve al precio acordado automático cuando termina — sin necesidad de revertir manual.
              </div>
            </div>

            {percentOff > 25 && (
              <div className="flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 rounded-md px-3 py-2 border border-amber-200">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <div>
                  Descuentos &gt;25% suelen exceder el cap de tier AUTHORIZED/SILVER. Si tu tier no
                  alcanza, este descuento quedará pendiente de aprobación PARTNER_ADMIN.
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 pb-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {isPending ? 'Aplicando…' : 'Aplicar descuento'}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
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
