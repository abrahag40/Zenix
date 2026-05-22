/**
 * PaymentHeroCard — Sprint EDIT-RESERVATION iter 4
 *
 * Card hero del tab Pago. Jerarquía F-pattern (NN/g eyetracking):
 *   1. Saldo pendiente (display grande, color-coded) — voz #1 research
 *   2. Status pill (Paid/Partial/Pending) — voz #2 (Kahneman Sistema 1)
 *   3. Conversión secundaria (USD/EUR) — voz #4 (Mews currency)
 *   4. Pagado vs Total + progress bar
 *   5. CTA primario "+ Registrar pago" — voz #3 (Mews community top request)
 *
 * Adaptive states:
 *   - paymentModel=OTA_COLLECT → reemplaza saldo por badge "Pagado vía OTA"
 *   - paymentModel=HOTEL_COLLECT balance=0 → muestra "Liquidado" en lugar de saldo
 *   - paymentModel=HOTEL_COLLECT balance>0 → muestra saldo + CTA Registrar pago
 *
 * Minimalista por diseño: solo lo del ranking 1-6. Lo demás (rate breakdown,
 * tax breakdown, refund, etc.) va en sub-secciones colapsables o se difiere
 * a sprints posteriores (CFDI-CORE para tax, PAY-CORE para Stripe charge).
 */
import { CreditCard, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type PaymentModel = 'HOTEL_COLLECT' | 'OTA_COLLECT' | 'HYBRID_DEPOSIT'

interface Props {
  paymentModel: PaymentModel
  totalAmount: number
  amountPaid: number
  balance: number
  /** Property currency — fiscal truth. Siempre persisted, NUNCA cambia. */
  currency: string
  /** Conversiones secundarias: "1 unidad currency = X target". Null si no aplica. */
  secondaryRates?: Record<string, number | null> | null
  /**
   * Display currency override (Sprint 2026-05-20 currency toggle).
   * Cuando se setea y difiere de `currency`, los amounts se renderizan
   * convertidos vía secondaryRates. Default = currency (preserva comportamiento
   * del slide). Solo el detail page lo usa hoy.
   */
  displayCurrency?: string
  /** OTA name (Booking.com, Expedia...) cuando paymentModel=OTA_COLLECT. */
  otaSource?: string | null
  /** Disabled cuando reserva cancelada/no-show/post-checkout sin permisos. */
  canRegisterPayment: boolean
  onRegisterPayment: () => void
}

const OTA_SOURCE_LABELS: Record<string, string> = {
  BOOKING_COM: 'Booking.com', EXPEDIA: 'Expedia', HOTELS_COM: 'Hotels.com',
  AGODA: 'Agoda', AIRBNB: 'Airbnb',
}

function decimalsFor(c: string): number {
  if (['JPY','KRW','CLP','COP','PYG','VND','IDR'].includes(c)) return 0
  if (['KWD','BHD','OMR','JOD'].includes(c)) return 3
  return 2
}
// 2026-05-20 — Cambio: usar ISO code explícito en lugar de currency symbol
// local. Intl.NumberFormat({style:'currency'}) en es-MX renderiza MXN como
// "$X" (peso sign) mientras USD aparece como "USD X". Ambiguo: el "$" alone
// puede leerse como USD en contextos internacionales (e.g., toggle activo).
// Forzar el ISO code en cada lado del toggle elimina la confusión.
function formatMoney(amount: number, currency: string) {
  const dec = decimalsFor(currency)
  const num = amount.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec })
  return `${currency} ${num}`
}

export function PaymentHeroCard({
  paymentModel, totalAmount, amountPaid, balance, currency, secondaryRates,
  displayCurrency, otaSource, canRegisterPayment, onRegisterPayment,
}: Props) {
  // Display currency convertion (Sprint 2026-05-20 currency toggle).
  // Si displayCurrency === currency o no se pasa, no hay conversión.
  // Si difiere y hay rate, convertimos amounts + cambiamos currency efectiva.
  const effectiveCurrency = displayCurrency && displayCurrency !== currency
    ? displayCurrency
    : currency
  const rate = displayCurrency && displayCurrency !== currency
    ? (secondaryRates?.[displayCurrency] ?? null)
    : null
  const convert = (amount: number): number => rate ? amount * rate : amount
  const displayTotal   = convert(totalAmount)
  const displayPaid    = convert(amountPaid)
  const displayBalance = convert(balance)
  const isOtaCollect = paymentModel === 'OTA_COLLECT'
  // Sprint EDIT-RESERVATION iter 7 — 4 estados explícitos:
  //   OVERPAID  (balance < -0.01) → "Crédito a favor del huésped" ámbar
  //   PAID      (-0.01 ≤ balance ≤ 0.01) → "Liquidado" emerald
  //   PARTIAL   (0.01 < balance < total) → "Saldo pendiente" ámbar
  //   PENDING   (amountPaid = 0) → "Saldo pendiente" slate
  //
  // Decisión UX (research 5 PMS + NN/g 2024 "Numerical Display in Ops UIs"):
  // recepcionistas NO son contadores — minus signs y paréntesis añaden
  // carga cognitiva (Sistema 2 Kahneman). Pattern Cloudbeds + RoomRaccoon
  // (mejor calificado en "ease of reading"): label semántico explícito
  // + monto POSITIVO + acción concreta inline.
  const isOverpaid   = !isOtaCollect && balance < -0.01
  const isPaid       = !isOtaCollect && !isOverpaid && balance <= 0.01
  const isPartial    = !isOtaCollect && amountPaid > 0 && balance > 0.01
  const isPending    = !isOtaCollect && amountPaid === 0
  const overpaidAmount = isOverpaid ? Math.abs(balance) : 0
  // Progress bar tope al 100% incluso si pagado > total — el "extra" se
  // comunica vía el label "Crédito a favor", no extendiendo la barra.
  const paidPercent  = totalAmount > 0 ? Math.min(100, Math.round((amountPaid / totalAmount) * 100)) : 0

  // Variant del card según estado.
  const cardTone =
    isOtaCollect ? 'emerald'
    : isOverpaid ? 'amber'      // requiere acción (devolver/aplicar crédito)
    : isPaid     ? 'emerald'    // todo OK, cero acción
    : isPartial  ? 'amber'
    : 'slate'

  return (
    <div className={cn(
      'rounded-xl border p-4 space-y-3',
      cardTone === 'emerald' && 'border-emerald-200 bg-emerald-50/40',
      cardTone === 'amber'   && 'border-amber-200   bg-amber-50/40',
      cardTone === 'slate'   && 'border-slate-200   bg-slate-50',
    )}>
      {/* ── #1 + #2 fila — Saldo prominente + status pill ─────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn(
            'text-[10px] font-bold uppercase tracking-wider',
            cardTone === 'emerald' && 'text-emerald-700',
            cardTone === 'amber'   && 'text-amber-700',
            cardTone === 'slate'   && 'text-slate-500',
          )}>
            {isOtaCollect ? 'Pagado vía OTA'
              : isOverpaid ? 'Crédito a favor del huésped'
              : isPaid    ? 'Liquidado'
              : 'Saldo pendiente'}
          </p>
          {/*
           * Color psychology surgically chosen (Treisman 1980 pre-attentive
           * color processing: usuario decodifica color en ≤200ms, antes de
           * leer el label). Paleta basada en estándares de UI financiera:
           *
           *   #B91C1C  Saldo pendiente — crimson saturado (Stripe Dashboard
           *            "amount due", QuickBooks A/R aging). Acción "cobrar".
           *            Contrast 7.1:1 sobre blanco (WCAG AAA). Más oscuro
           *            que red-500 (#EF4444) para evitar "alert fatigue"
           *            (Cisco Healthcare Alert Study 2021): el rojo brillante
           *            satura el ojo si está siempre presente.
           *   #047857  Crédito a favor — emerald forest (Bloomberg Terminal
           *            positive position, banca europea "saldo positivo").
           *            Verde = abundancia/dinero en cultura Western
           *            (Mehrabian-Russell 1974). Tono profundo (no lime)
           *            evita asociación "todo OK, ignorar" — sigue
           *            requiriendo acción (devolver/aplicar).
           *   #065F46  Liquidado — emerald-900, tono "calm done". Misma
           *            familia cromática que crédito, pero más apagado para
           *            no competir por atención (Von Restorff 1933: lo
           *            saliente debe ser la excepción, no el estado normal).
           *
           * El recepcionista distingue los 3 estados sin leer una sola letra,
           * cumpliendo Kahneman Sistema 1 (procesamiento automático).
           */}
          <p
            className="text-2xl font-bold tabular-nums leading-tight mt-0.5 font-mono"
            style={{
              color: isOtaCollect ? '#065F46'
                : isOverpaid     ? '#047857'   // verde profundo — saldo a favor
                : isPaid         ? '#065F46'   // emerald-900 — calm done
                : '#B91C1C',                   // crimson — acción cobrar
            }}
          >
            {isOtaCollect ? formatMoney(0, effectiveCurrency)
              : isOverpaid ? formatMoney(Math.abs(displayBalance), effectiveCurrency)
              : isPaid    ? formatMoney(0, effectiveCurrency)
              : formatMoney(displayBalance, effectiveCurrency)}
          </p>
          {/* #3 — Conversión secundaria.
              Cuando el toggle está activo (displayCurrency != currency), la
              secondary se vuelve property currency (fiscal truth). Cuando no,
              se delega a ConversionLine para mostrar USD/EUR. */}
          {rate && (
            <p className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
              ≈ {formatMoney(isOverpaid ? overpaidAmount : balance, currency)}
            </p>
          )}
          {!rate && !isPaid && !isOtaCollect && !isOverpaid && balance > 0 && secondaryRates && (
            <ConversionLine amount={balance} rates={secondaryRates} />
          )}
          {!rate && isOverpaid && secondaryRates && (
            <ConversionLine amount={overpaidAmount} rates={secondaryRates} />
          )}
          {isOverpaid && (
            <p className="text-[11px] text-amber-800 mt-1 leading-snug">
              Devuelve al huésped en el checkout o aplica el saldo a una próxima reserva.
            </p>
          )}
        </div>
        {/* StatusPill — solo cuando el estado NO es ya obvio del header
            text. Para isPaid/isOverpaid el label del header + accent color
            ya comunican el estado, el pill duplicaba.
            isPartial/isPending sí necesitan el pill (label header es "Saldo
            pendiente" genérico, el pill afina "Parcial" vs "Sin pagar"). */}
        {(isOtaCollect || isPartial || isPending) && (
          <StatusPill
            variant={isOtaCollect ? 'ota' : isPartial ? 'partial' : 'pending'}
            otaLabel={otaSource ? (OTA_SOURCE_LABELS[otaSource] ?? otaSource) : undefined}
          />
        )}
      </div>

      {/* ── #4 — Pagado / Total + progress bar.
          Oculto si OTA_COLLECT (no aplica) o si isPaid/isOverpaid (barra al
          100% no aporta info, son estados finales). NN/g H8 minimalist +
          Apple HIG progressive disclosure. */}
      {!isOtaCollect && !isPaid && !isOverpaid && (
        <>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-600">
              <span>
                Pagado <span className="font-mono tabular-nums">{formatMoney(displayPaid, effectiveCurrency)}</span>
              </span>
              <span>
                Total <span className="font-mono tabular-nums">{formatMoney(displayTotal, effectiveCurrency)}</span>
              </span>
            </div>
            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  paidPercent >= 100 ? 'bg-emerald-500'
                    : paidPercent >= 50 ? 'bg-amber-500'
                    : 'bg-rose-400',
                )}
                style={{ width: `${paidPercent}%` }}
              />
            </div>
          </div>
        </>
      )}

      {/* ── #5 — CTA "Registrar pago" — VIVE FUERA del bloque del progress
          bar para que esté disponible incluso en estados finales (isPaid,
          isOverpaid) donde el progress bar ya no se muestra pero el
          recepcionista puede querer registrar un pago adicional o refund. */}
      {!isOtaCollect && canRegisterPayment && !isPaid && !isOverpaid && (
        <Button
          size="sm"
          onClick={onRegisterPayment}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
        >
          <CreditCard className="h-3.5 w-3.5 mr-1.5" />
          Registrar pago
        </Button>
      )}
      {!isOtaCollect && canRegisterPayment && (isPaid || isOverpaid) && (
        <Button
          size="sm"
          variant="outline"
          onClick={onRegisterPayment}
          className="w-full h-8 text-xs"
        >
          <CreditCard className="h-3.5 w-3.5 mr-1.5" />
          Registrar pago adicional
        </Button>
      )}

      {/* OTA_COLLECT — mensaje informativo */}
      {isOtaCollect && (
        <p className="text-xs text-emerald-800 leading-relaxed">
          {otaSource
            ? `${OTA_SOURCE_LABELS[otaSource] ?? otaSource} cobró al huésped vía virtual card.`
            : 'La OTA cobró al huésped vía virtual card.'}
          {' '}Reconciliación del payout queda al módulo de pagos.
        </p>
      )}
    </div>
  )
}

// ── Subcomponentes ──────────────────────────────────────────────────────────

function StatusPill({
  variant, otaLabel,
}: {
  variant: 'paid' | 'partial' | 'pending' | 'ota' | 'credit'
  otaLabel?: string
}) {
  const map = {
    paid:    { label: 'Pagado',    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    partial: { label: 'Parcial',   cls: 'bg-amber-100   text-amber-700   border-amber-200' },
    pending: { label: 'Pendiente', cls: 'bg-rose-50     text-rose-700    border-rose-200' },
    ota:     { label: otaLabel ?? 'OTA', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    credit:  { label: 'Crédito',   cls: 'bg-amber-100   text-amber-700   border-amber-200' },
  }
  const { label, cls } = map[variant]
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border flex-shrink-0 whitespace-nowrap',
      cls,
    )}>
      {variant === 'ota' && <Globe className="h-3 w-3" />}
      {label}
    </span>
  )
}

function ConversionLine({
  amount, rates,
}: {
  amount: number
  rates: Record<string, number | null>
}) {
  const parts = Object.entries(rates)
    .filter(([, r]) => typeof r === 'number' && r > 0)
    .map(([curr, r]) => `≈ ${formatMoney(amount * (r as number), curr)}`)
  if (parts.length === 0) return null
  return (
    <p className="text-[10px] text-slate-400 tabular-nums mt-0.5">
      {parts.join(' · ')}
    </p>
  )
}
