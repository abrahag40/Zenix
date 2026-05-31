/**
 * PaymentMethodGrid — Selector de método de pago con grid de iconos (tile).
 *
 * Sprint PAYMENT-MODAL-UNIFY (Fase D, 2026-05-30). Single source del selector
 * de método de pago en Zenix. Renderiza SIEMPRE igual (tile: icono sobre label,
 * centrado) en todos los modales de pago — check-in, creación de reserva y
 * registrar pago desde el detalle. Un solo diseño, sin variantes.
 *
 * OTA prepagado NO es un método seleccionable manualmente: el cobro OTA se
 * detecta automáticamente vía Channex (`paymentModel = OTA_COLLECT`) al ingresar
 * la reserva. Exponerlo como botón manual era ruido (Hick 1952) y fuente de
 * error de captura. La enum `PaymentMethod.OTA_PREPAID` se conserva para
 * mostrar movimientos OTA históricos (PaymentMovementsList), no para captura.
 *
 * Justificación UX (estudio CHECK-IN C1.13):
 *  · Hick 1952 — icons -40% selection time vs dropdown texto.
 *  · Treisman 1980 — color por método pre-attentive <200ms.
 *  · Mehrabian-Russell 1974 — verde efectivo / azul tarjeta / púrpura
 *    transferencia / ámbar cortesía. Coherente con familia cromática (§31).
 *  · NN/g Touch Targets — botones ≥44pt para tablet POS.
 */
import { Banknote, CreditCard, Landmark, Gift, type LucideIcon } from 'lucide-react'
import { PaymentMethod } from '@zenix/shared'
import { cn } from '@/lib/utils'

export type PaymentMethodMeta = {
  value: PaymentMethod
  icon: LucideIcon
  label: string
  /** clases del estado activo — borde + bg + texto del color semántico */
  activeClass: string
}

/** Catálogo canónico de métodos de pago seleccionables. Single source. */
export const PAYMENT_METHOD_META: readonly PaymentMethodMeta[] = [
  { value: PaymentMethod.CASH,          icon: Banknote,   label: 'Efectivo',      activeClass: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  { value: PaymentMethod.CARD_TERMINAL, icon: CreditCard, label: 'Tarjeta',       activeClass: 'border-sky-300 bg-sky-50 text-sky-700' },
  { value: PaymentMethod.BANK_TRANSFER, icon: Landmark,   label: 'Transferencia', activeClass: 'border-violet-300 bg-violet-50 text-violet-700' },
  { value: PaymentMethod.COMP,          icon: Gift,       label: 'Cortesía',      activeClass: 'border-amber-300 bg-amber-50 text-amber-700' },
] as const

interface PaymentMethodGridProps {
  value: PaymentMethod
  onChange: (method: PaymentMethod) => void
  /** Subset de métodos a mostrar. Default: los 4 canónicos. La creación de
   *  reserva pasa 3 (sin Cortesía, que no aplica a un anticipo). */
  methods?: readonly PaymentMethod[]
}

export function PaymentMethodGrid({ value, onChange, methods }: PaymentMethodGridProps) {
  const items = methods
    ? PAYMENT_METHOD_META.filter((m) => methods.includes(m.value))
    : PAYMENT_METHOD_META
  // 1 fila horizontal, una columna por método (check-in canónico).
  const cols = items.length

  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {items.map((m) => {
        const isActive = value === m.value
        const Icon = m.icon
        return (
          <button
            key={m.value}
            type="button"
            onClick={() => onChange(m.value)}
            className={cn(
              'flex flex-col items-center justify-center gap-1 p-2 rounded-lg border transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300',
              isActive
                ? m.activeClass + ' shadow-sm'
                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50',
            )}
            aria-pressed={isActive}
            aria-label={m.label}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="text-[10px] font-semibold leading-none whitespace-nowrap">
              {m.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
