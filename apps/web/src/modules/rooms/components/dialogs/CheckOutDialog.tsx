/**
 * CheckOutDialog — Sprint EDIT-RESERVATION pixel-perfect refactor (2026-05-17)
 *
 * Refactor estructural para alinear con design system Zenix:
 *   §116  Radix Dialog primitives (consistente con todos los modales)
 *   §117  ConfirmDialog tones reusados (no inventar paletas)
 *   §122  HTTP timeout garantiza terminal state — no band-aids
 *   §123  DialogActions canónico + colores quirúrgicos del PaymentHeroCard
 *
 * Visual language alineado al BookingDetailSheet (panel lateral de detalle):
 *   - Stripe acentuado top (3px) por estado del saldo
 *   - Header blanco con icono chip + title + subtitle
 *   - Body con hero card de balance siguiendo F-pattern (label small +
 *     amount big tabular-nums + color psicológico §123)
 *   - Form de cobro (si aplica) en card slate sutil
 *   - Helper text de housekeeping
 *   - Footer DialogActions canónico
 *
 * Decisión "el banner amber redundante removido": el hero card ya comunica
 * el saldo pendiente en grande con color crimson — agregar "Hay un saldo
 * pendiente de USD 720" abajo es decir lo mismo dos veces (NN/g H8 minimalist
 * design + Baymard 2022 form usability: redundant info aumenta tiempo de scan).
 *
 * Decisión "remover delay 800ms + 'Checkout completado!'": era anti-pattern.
 * Apple HIG: confirmation feedback es instantáneo, el toast del mutation
 * hook (§useCheckout) ya da el success "Checkout registrado — habitación
 * liberada" + el dialog se cierra desde el parent al confirmar. El delay
 * artificial sugiere lentitud falsa al usuario y bloquea recovery si la
 * mutation falla (la cierre llega antes del onError).
 */
import { useState, useEffect } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem,
         SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { LogOut, Moon, X } from 'lucide-react'
import { DialogActions } from '../shared/DialogActions'
import type { GuestStayBlock } from '../../types/timeline.types'

interface CheckOutDialogProps {
  stay: GuestStayBlock | null
  open: boolean
  onClose: () => void
  onConfirm: (stayId: string, paymentData: CheckoutPayment) => void
}

export interface CheckoutPayment {
  amount: number
  method: string
  notes: string
}

// ── Decimals por ISO 4217 (mismo helper que PaymentHeroCard §110c) ────────
function decimalsFor(c: string): number {
  if (['JPY', 'KRW', 'CLP', 'COP', 'PYG', 'VND', 'IDR'].includes(c)) return 0
  if (['KWD', 'BHD', 'OMR', 'JOD'].includes(c)) return 3
  return 2
}
function formatMoney(amount: number, currency: string) {
  const dec = decimalsFor(currency)
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(dec)}`
  }
}

export function CheckOutDialog({
  stay, open, onClose, onConfirm,
}: CheckOutDialogProps) {
  const [payment, setPayment] = useState({
    amount: 0,
    method: 'cash',
    notes: '',
  })

  // Pre-flight: si hay saldo pendiente, auto-prefill el monto con el balance
  // para que el botón no quede silenciosamente disabled. El recepcionista
  // puede ajustar si cobra parcial; sin esto, click → nada → "no funciona"
  // (CLAUDE.md §39 feedback informativo).
  const balance = stay ? stay.totalAmount - stay.amountPaid : 0
  const isFullyPaid = balance <= 0.01

  useEffect(() => {
    if (!open || !stay) return
    setPayment({
      amount: isFullyPaid ? 0 : balance,
      method: 'cash',
      notes: '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stay?.id])

  if (!stay) return null

  const handleConfirm = () => {
    if (!isFullyPaid && payment.amount < balance) return
    onConfirm(stay.id, payment)
    onClose()
  }

  const canConfirm = isFullyPaid || payment.amount >= balance
  const ratePerNight = stay.totalAmount / Math.max(1, stay.nights)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-labelledby="checkout-dialog-title"
          className="fixed left-1/2 top-1/2 z-[80] -translate-x-1/2 -translate-y-1/2
                     w-[calc(100%-2rem)] max-w-md bg-white rounded-2xl shadow-2xl
                     overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* ── Stripe top por estado ───────────────────────────────────── */}
          <div
            className={cn(
              'h-1 shrink-0',
              isFullyPaid ? 'bg-emerald-500/80' : 'bg-amber-500/80',
            )}
          />

          {/* ── Header ──────────────────────────────────────────────────── */}
          <header className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 shrink-0 border-b border-slate-100">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                <LogOut className="h-4 w-4 text-slate-700" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title
                  id="checkout-dialog-title"
                  className="text-sm font-semibold text-slate-900 leading-tight truncate"
                >
                  Checkout — {stay.guestName}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                  Hab. {stay.roomNumber ?? stay.roomId.replace('r-', '')}
                  <span className="text-slate-300 mx-1.5">·</span>
                  <Moon className="inline h-3 w-3 opacity-60 -mt-0.5" /> {stay.nights} noches
                  <span className="text-slate-300 mx-1.5">·</span>
                  Salida {format(new Date(stay.checkOut), "d MMM yyyy", { locale: es })}
                </DialogPrimitive.Description>
              </div>
            </div>
            <DialogPrimitive.Close
              className="text-slate-400 hover:text-slate-700 -mr-1 -mt-1 p-1.5 rounded-md hover:bg-slate-100 transition-colors shrink-0"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </header>

          {/* ── Body ────────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

            {/* Hero card — F-pattern, mismo léxico visual que PaymentHeroCard */}
            <div
              className={cn(
                'rounded-xl border p-4 space-y-2',
                isFullyPaid
                  ? 'border-emerald-200 bg-emerald-50/40'
                  : 'border-amber-200 bg-amber-50/40',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={cn(
                    'text-[10px] font-bold uppercase tracking-wider',
                    isFullyPaid ? 'text-emerald-700' : 'text-amber-700',
                  )}>
                    {isFullyPaid ? 'Liquidado · Listo para checkout' : 'Saldo pendiente al checkout'}
                  </p>
                  <p
                    className="text-2xl font-bold tabular-nums leading-tight mt-0.5 font-mono"
                    style={{
                      // §123 — psicología del color quirúrgica
                      color: isFullyPaid ? '#065F46' : '#B91C1C',
                    }}
                  >
                    {formatMoney(isFullyPaid ? 0 : balance, stay.currency)}
                  </p>
                </div>
              </div>

              {/* Mini-breakdown del folio — Pagado / Total */}
              <div className="flex justify-between items-baseline text-[11px] text-slate-600 pt-1 border-t border-slate-200/60">
                <span>
                  Pagado <span className="font-mono tabular-nums">{formatMoney(stay.amountPaid, stay.currency)}</span>
                </span>
                <span>
                  Total <span className="font-mono tabular-nums">{formatMoney(stay.totalAmount, stay.currency)}</span>
                </span>
              </div>
              <div className="text-[10px] text-slate-400 leading-tight">
                {stay.nights}n × <span className="font-mono tabular-nums">{formatMoney(ratePerNight, stay.currency)}</span>/noche
              </div>
            </div>

            {/* Form de cobro — solo si hay saldo pendiente.
                NO repetimos "Hay un saldo pendiente de X" como banner — el
                hero card ya lo comunica con color crimson + label explícito
                (NN/g H8: no decir lo mismo dos veces). */}
            {!isFullyPaid && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Monto a cobrar
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono pointer-events-none">
                        {stay.currency}
                      </span>
                      <Input
                        type="number"
                        min={0}
                        max={balance}
                        value={payment.amount || ''}
                        onChange={(e) =>
                          setPayment((p) => ({ ...p, amount: parseFloat(e.target.value) || 0 }))
                        }
                        className="h-9 text-sm pl-12 font-mono tabular-nums bg-white
                                   [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Método de pago
                    </Label>
                    <Select
                      value={payment.method}
                      onValueChange={(v) => setPayment((p) => ({ ...p, method: v }))}
                    >
                      <SelectTrigger className="h-9 text-sm bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Efectivo</SelectItem>
                        <SelectItem value="card">Tarjeta</SelectItem>
                        <SelectItem value="transfer">Transferencia</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {payment.amount < balance && payment.amount > 0 && (
                  <p className="text-[10px] text-amber-700 leading-snug">
                    Falta cobrar {formatMoney(balance - payment.amount, stay.currency)} para liberar el checkout.
                  </p>
                )}
              </div>
            )}

            {/* Helper text — housekeeping automation notice */}
            <p className="text-[11px] text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 leading-snug">
              Al confirmar el checkout se generará automáticamente una tarea de limpieza para esta habitación.
            </p>
          </div>

          {/* ── Footer ──────────────────────────────────────────────────── */}
          <DialogActions
            onCancel={onClose}
            onConfirm={handleConfirm}
            confirmLabel="Confirmar checkout"
            confirmIcon={LogOut}
            tone="primary"
            confirmDisabled={!canConfirm}
            className="px-5 pb-4 pt-2 shrink-0 border-t border-slate-100"
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
