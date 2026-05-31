/**
 * PaymentFields — Bloque canónico de campos de pago de Zenix.
 *
 * Sprint PAYMENT-MODAL-UNIFY (Fase D, 2026-05-30). **Single source** del bloque
 * de captura de pago en TODO el sistema. Antes cada modal (check-in, creación
 * de reserva, registrar pago desde detalle) reimplementaba su propio layout
 * de método + monto + referencia → tres diseños distintos. Esto violaba
 * CLAUDE.md §3 "Coherencia sistémica" (primitivos canónicos) y la regla
 * NN/g H4 (Consistency & Standards).
 *
 * El diseño canónico es el del check-in (aprobado por el owner):
 *   1. PaymentMethodGrid — iconos en grid horizontal (tile), color semántico.
 *   2. Grid [140px | 1fr] — Monto ($ prefix) | (Referencia adaptive ó Quick-fill).
 *   3. ConversionLine — equivalencia en divisas secundarias.
 *
 * `PaymentEntryFields` se usa idéntico en:
 *   · ConfirmCheckinDialog  (check-in — 4 métodos)
 *   · RegisterPaymentDialog (registrar pago — 4 métodos)
 *   · CheckInDialog         (crear reserva / anticipo — 3 métodos, sin Cortesía)
 *
 * Justificación UX (estudio CHECK-IN C1.13/C1.14):
 *  · Hick 1952 — icons -40% selection time vs dropdown texto.
 *  · Treisman 1980 — color por método pre-attentive <200ms.
 *  · Mehrabian-Russell 1974 — verde efectivo / azul tarjeta / púrpura
 *    transferencia / ámbar cortesía. Coherente con familia cromática (§31).
 *  · Stripe Quick Pay / Apple Pay — quick-fill 1-click del monto completo.
 */
import { memo } from 'react'
import { Info, Gift } from 'lucide-react'
import { PaymentMethod } from '@zenix/shared'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { PaymentMethodGrid } from './PaymentMethodGrid'
import { StyledInput } from './StyledInput'

// ── Money formatting (canónico) ─────────────────────────────────────────────
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'CLP', 'COP', 'PYG', 'VND', 'IDR'])
const THREE_DECIMAL_CURRENCIES = new Set(['KWD', 'BHD', 'OMR', 'JOD'])

function decimalsFor(currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency)) return 0
  if (THREE_DECIMAL_CURRENCIES.has(currency)) return 3
  return 2
}

export function formatPaymentMoney(amount: number, currency: string): string {
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

// ── ConversionLine ───────────────────────────────────────────────────────────
export const ConversionLine = memo(function ConversionLine({
  amount, rates, align = 'start',
}: {
  amount: number
  /** Map currency-code → rate ("1 propertyCurrency = rate target"). Null/undefined → omit. */
  rates?: Record<string, number | null> | null
  align?: 'start' | 'end'
}) {
  if (!rates) return null
  const parts = Object.entries(rates)
    .filter(([, rate]) => typeof rate === 'number' && rate > 0)
    .map(([currency, rate]) => `≈ ${formatPaymentMoney(amount * (rate as number), currency)}`)
  if (parts.length === 0) return null
  return (
    <p className={cn(
      'text-[10px] text-slate-400 tabular-nums mt-0.5',
      align === 'end' && 'text-right',
    )}>
      {parts.join(' · ')}
    </p>
  )
})

// ── QuickFillChip ──────────────────────────────────────────────────────────
/**
 * Atajo "Cobrar saldo completo" para métodos sin campo Referencia (Efectivo /
 * Cortesía). Llena la columna derecha del row de pago con un chip 1-click que
 * setea `amount = balance`. Cuando ya coincide con el saldo, muestra el estado
 * "✓ {doneLabel}" como confirmación informativa.
 */
function QuickFillChip({
  currentAmount, balance, currency, onFill, fillLabel, doneLabel,
}: {
  currentAmount: number
  balance:       number
  currency:      string
  onFill:        (amt: number) => void
  fillLabel:     string
  doneLabel:     string
}) {
  const matchesBalance = Math.abs(currentAmount - balance) < 0.01 && balance > 0
  if (balance <= 0) return null

  if (matchesBalance) {
    return (
      <div className="h-9 inline-flex items-center gap-1.5 px-3 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium w-full">
        <span aria-hidden className="shrink-0">✓</span>
        <span className="truncate">{doneLabel}</span>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onFill(balance)}
      className="h-9 inline-flex items-center justify-between gap-1.5 px-3 rounded-md border border-dashed border-slate-300 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 text-slate-600 text-xs font-medium transition-colors w-full"
    >
      <span className="truncate">{fillLabel}</span>
      <span className="tabular-nums font-semibold shrink-0">
        {formatPaymentMoney(balance, currency)}
      </span>
    </button>
  )
}

// ── PaymentEntryFields ───────────────────────────────────────────────────────
export interface PaymentDraft {
  method:     PaymentMethod
  amount:     number
  reference?: string
}

interface PaymentEntryFieldsProps {
  value:    PaymentDraft
  onChange: (patch: Partial<PaymentDraft>) => void
  /** Monto total adeudado — alimenta el quick-fill "Cobrar saldo $X". */
  balance:  number
  currency: string
  secondaryRates?: Record<string, number | null> | null
  /** Subset de métodos. Default: 4 canónicos (Efectivo/Tarjeta/Transferencia/Cortesía). */
  methods?: readonly PaymentMethod[]
  /** true tras el primer intento de submit → borders rojos en campos faltantes. */
  attempted?:  boolean
  /** counter para re-disparar shake en cada intento. */
  shakeNonce?: number
  /** Texto del quick-fill. Default check-in: "Cobrar saldo" / "Saldo completo". */
  quickFillLabel?: { fill: string; done: string }
}

/** Default canónico (check-in / register): 4 métodos sin OTA prepagado. */
const DEFAULT_METHODS = [
  PaymentMethod.CASH,
  PaymentMethod.CARD_TERMINAL,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.COMP,
] as const

export const PaymentEntryFields = memo(function PaymentEntryFields({
  value, onChange, balance, currency, secondaryRates, methods = DEFAULT_METHODS,
  attempted = false, shakeNonce = 0,
  quickFillLabel = { fill: 'Cobrar saldo', done: 'Saldo completo' },
}: PaymentEntryFieldsProps) {
  const isTerminal = value.method === PaymentMethod.CARD_TERMINAL
  const isTransfer = value.method === PaymentMethod.BANK_TRANSFER
  const isComp     = value.method === PaymentMethod.COMP
  const showRef    = isTerminal || isTransfer

  // Cortesía (COMP) — habitación sin costo: el saldo queda cubierto (0) y el
  // monto se bloquea. Se registra como comp por el valor adeudado (revenue
  // allowance USALI), por eso amount = balance — así el saldo proyectado da 0
  // end-to-end (check-in, registrar pago) sin lógica de waive aparte.
  const displayAmount = isComp ? balance : (value.amount || '')

  return (
    <div className="space-y-3">
      {/* 1 — Método de pago (grid de iconos, tile horizontal) */}
      <PaymentMethodGrid
        value={value.method}
        methods={methods}
        onChange={(method) => onChange(
          method === PaymentMethod.COMP
            ? { method, reference: '', amount: balance }  // cortesía cubre el saldo
            : { method, reference: '' },
        )}
      />

      {/* 2 — Grid [Monto | (Referencia adaptive ó Quick-fill)] */}
      <div className="grid grid-cols-[140px_1fr] gap-2 items-end">
        {/* COL IZQ — Monto (siempre presente) */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Monto ({currency})
          </label>
          <div className="relative">
            <span className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none',
              isComp ? 'text-slate-400' : 'text-slate-500',
            )}>$</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={displayAmount}
              onChange={(e) => onChange({ amount: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
              disabled={isComp}
              aria-disabled={isComp}
              className={cn(
                'w-full h-9 rounded-md border pl-7 pr-3 text-sm tabular-nums transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300',
                isComp
                  ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                  : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 hover:border-slate-300',
              )}
            />
          </div>
        </div>

        {/* COL DER — adaptive (Cortesía | Referencia | Quick-fill) */}
        {isComp ? (
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider opacity-0 select-none" aria-hidden>
              .
            </label>
            <div className="h-9 inline-flex items-center gap-1.5 px-3 rounded-md border border-amber-200 bg-amber-50 text-amber-700 text-xs font-medium w-full">
              <Gift className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Sin cobro · saldo cubierto</span>
            </div>
          </div>
        ) : showRef ? (
          <div className="space-y-1 min-w-0">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              {isTerminal ? 'Aprobación POS' : 'Referencia'}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label="Más info"
                      className="inline-flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-[11px]">
                    {isTerminal
                      ? 'Número impreso en el ticket de la terminal POS.'
                      : 'Folio SPEI o número de operación bancaria.'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </label>
            <StyledInput
              type="text"
              value={value.reference ?? ''}
              onChange={(e) => onChange({ reference: e.target.value })}
              placeholder={isTerminal ? 'Ej. 123456' : 'SPEI 000123…'}
              hasError={attempted && !value.reference?.trim()}
              shakeNonce={shakeNonce}
              aria-invalid={attempted && !value.reference?.trim()}
            />
          </div>
        ) : (
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider opacity-0 select-none" aria-hidden>
              .
            </label>
            <QuickFillChip
              currentAmount={value.amount}
              balance={balance}
              currency={currency}
              onFill={(amt) => onChange({ amount: amt })}
              fillLabel={quickFillLabel.fill}
              doneLabel={quickFillLabel.done}
            />
          </div>
        )}
      </div>

      {/* 3 — Conversión a divisas secundarias */}
      {value.amount > 0 && (
        <ConversionLine amount={value.amount} rates={secondaryRates} />
      )}
    </div>
  )
})
