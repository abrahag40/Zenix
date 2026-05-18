/**
 * PaymentMovementsList — Sprint EDIT-RESERVATION iter 4
 *
 * Lista append-only de PaymentLogs con UX inspirada en Cloudbeds folio +
 * Mews bill timeline + USALI 12 ed Cashier's Shift Report.
 *
 * Cada row muestra (priority order del research):
 *   1. Icono de método (Cash/Card/Transfer/OTA/COMP) — pre-attentive (Treisman 1980)
 *   2. Método + referencia · timestamp + colector (USALI mandatory)
 *   3. Monto en propertyCurrency + conversion secundaria gris
 *   4. Running balance a la derecha (Cloudbeds-style)
 *   5. Botón Anular inline (solo en originales no-voided)
 *
 * Voids: aparecen tachados con la entrada negativa "ANULACIÓN" debajo
 * (append-only USALI 12 ed §28).
 *
 * Performance: running balance computado client-side (1 pass O(n) walk forward).
 */
import { Ban, Banknote, CreditCard, Gift, Globe, RefreshCw, User } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import type { PaymentLogDto } from '../../api/guest-stays.api'

interface Props {
  /** Array de logs ordenados DESC del backend (latest first). */
  payments: PaymentLogDto[]
  /** Moneda primaria para display. */
  currency: string
  /** Conversión opcional. */
  secondaryRates?: Record<string, number | null> | null
  /** Mostrar acción Anular (false en reservas cerradas/sin permiso). */
  canVoid: boolean
  isVoidPending: boolean
  onVoid: (payment: PaymentLogDto) => void
}

const METHOD_META: Record<string, { icon: typeof Banknote; label: string; color: string }> = {
  CASH:          { icon: Banknote,  label: 'Efectivo',     color: 'text-emerald-600' },
  CARD_TERMINAL: { icon: CreditCard, label: 'Tarjeta',      color: 'text-blue-600' },
  BANK_TRANSFER: { icon: RefreshCw, label: 'Transferencia', color: 'text-violet-600' },
  OTA_PREPAID:   { icon: Globe,     label: 'OTA prepago',   color: 'text-slate-600' },
  COMP:          { icon: Gift,      label: 'Cortesía',      color: 'text-amber-600' },
}

function decimalsFor(c: string): number {
  if (['JPY','KRW','CLP','COP','PYG','VND','IDR'].includes(c)) return 0
  if (['KWD','BHD','OMR','JOD'].includes(c)) return 3
  return 2
}
function formatMoney(amount: number, currency: string) {
  const dec = decimalsFor(currency)
  try {
    return new Intl.NumberFormat('es-MX', { style:'currency', currency, minimumFractionDigits:dec, maximumFractionDigits:dec }).format(amount)
  } catch { return `${currency} ${amount.toFixed(dec)}` }
}

/**
 * Computa running balance per-row walking forward desde el más viejo.
 * Resultado mapeado a IDs para lookup O(1) en el render.
 *
 * El backend ordena DESC (latest first) para el display chronological-reverse;
 * para el running balance necesitamos forward order (oldest → latest).
 */
function computeRunningBalances(payments: PaymentLogDto[]): Map<string, number> {
  const map = new Map<string, number>()
  // Reverse copia (oldest first) sin mutar prop.
  const ascending = [...payments].reverse()
  let running = 0
  for (const p of ascending) {
    running += Number(p.amount)
    map.set(p.id, running)
  }
  return map
}

export function PaymentMovementsList({
  payments, currency, secondaryRates, canVoid, isVoidPending, onVoid,
}: Props) {
  if (payments.length === 0) {
    return (
      <p className="text-xs text-slate-400 italic py-3 text-center bg-slate-50 rounded-lg">
        Sin movimientos registrados
      </p>
    )
  }

  const runningBalances = computeRunningBalances(payments)

  return (
    <div className="space-y-1.5">
      {payments.map((p) => {
        const amount = Number(p.amount)
        const isNegative = amount < 0   // entrada de anulación
        const isVoided   = p.isVoid && !isNegative // el original cuando fue anulado
        const isFwdVoidEntry = isNegative // la entrada de "ANULACIÓN"
        const meta = METHOD_META[p.method] ?? METHOD_META.CASH
        const Icon = meta.icon
        const collectorName = p.collector?.name || p.collector?.email || `Staff ${p.collectedById.slice(0, 4)}`
        const runningBalance = runningBalances.get(p.id) ?? 0

        return (
          <div
            key={p.id}
            className={cn(
              'rounded-lg border px-3 py-2.5 flex items-start gap-2.5',
              isVoided
                ? 'border-slate-200 bg-slate-50/60 opacity-60'
                : isFwdVoidEntry
                  ? 'border-rose-200 bg-rose-50/40'
                  : 'border-slate-200 bg-white',
            )}
          >
            {/* Icono del método — pre-attentive (Treisman 1980) */}
            <div className={cn(
              'w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5',
              isFwdVoidEntry ? 'bg-rose-100' : 'bg-slate-100',
            )}>
              <Icon className={cn('h-3.5 w-3.5', isFwdVoidEntry ? 'text-rose-600' : meta.color)} />
            </div>

            {/* Centro: método/referencia + timestamp/colector + void reason */}
            <div className="flex-1 min-w-0">
              <div className={cn(
                'text-xs font-medium flex items-center gap-1.5 flex-wrap',
                isVoided && 'line-through text-slate-500',
              )}>
                <span className="text-slate-800">{meta.label}</span>
                {p.reference && (
                  <span className="font-mono text-[10px] text-slate-400">
                    · {p.reference}
                  </span>
                )}
                {isFwdVoidEntry && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-rose-600 px-1 py-0.5 bg-rose-100 rounded">
                    Anulación
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                <span className="tabular-nums">
                  {format(new Date(p.createdAt), "d MMM HH:mm", { locale: es })}
                </span>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-0.5">
                  <User className="h-2.5 w-2.5" />
                  {collectorName}
                </span>
              </div>
              {p.voidReason && (
                <p className="text-[10px] italic text-slate-500 mt-0.5">
                  {p.voidReason}
                </p>
              )}
            </div>

            {/* Derecha: monto + running balance + acción */}
            <div className="flex flex-col items-end gap-0.5 shrink-0 min-w-[80px]">
              <span className={cn(
                'text-sm font-bold tabular-nums font-mono',
                isFwdVoidEntry ? 'text-rose-600'
                  : isVoided   ? 'text-slate-500'
                  : 'text-emerald-700',
              )}>
                {isFwdVoidEntry && '−'}{formatMoney(Math.abs(amount), p.currency)}
              </span>
              {/* Conversión secundaria — solo si moneda del pago = currency principal
                  Y hay rates. Si el pago fue en otra moneda mostramos solo nativo. */}
              {p.currency === currency && secondaryRates && (
                <ConversionMini amount={Math.abs(amount)} rates={secondaryRates} />
              )}
              {/* Running balance — Cloudbeds pattern */}
              <span className="text-[10px] text-slate-400 tabular-nums">
                bal {formatMoney(runningBalance, currency)}
              </span>
            </div>

            {/* Acción Anular — sólo originales no-voided + permiso */}
            {canVoid && !isVoided && !isFwdVoidEntry && (
              <button
                type="button"
                onClick={() => onVoid(p)}
                disabled={isVoidPending}
                title="Anular pago"
                aria-label="Anular pago"
                className="text-slate-300 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors shrink-0 self-start mt-0.5"
              >
                <Ban className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ConversionMini({
  amount, rates,
}: {
  amount: number
  rates: Record<string, number | null>
}) {
  const parts = Object.entries(rates)
    .filter(([, r]) => typeof r === 'number' && r > 0)
    .slice(0, 1) // solo el primero en lista compacta para evitar ruido
    .map(([curr, r]) => `≈ ${formatMoney(amount * (r as number), curr)}`)
  if (parts.length === 0) return null
  return (
    <span className="text-[10px] text-slate-400 tabular-nums">{parts[0]}</span>
  )
}
