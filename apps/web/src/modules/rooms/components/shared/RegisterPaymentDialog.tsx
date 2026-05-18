/**
 * RegisterPaymentDialog — Sprint EDIT-RESERVATION iter 4
 *
 * Dialog para registrar un pago adicional sobre la reserva. Voz #3 del
 * research (Mews community top request): "no debería tener que ir a otro
 * menú para cobrar". CTA va dentro del hero card del tab Pago.
 *
 * Layout: estructura clónica del PaymentEntryRow del ConfirmCheckinDialog
 * (consistencia visual cross-flow).
 *
 * Validaciones:
 *   - CARD_TERMINAL / BANK_TRANSFER → reference obligatoria
 *   - COMP / amount=0 → approvedById + approvalReason obligatorios
 *   - amount > balance → warning amber (no bloquea; usuario puede registrar
 *     pago > balance si conscientemente está cobrando depósito incidentales).
 *   - amount <= 0 → bloquea
 *
 * Apple HIG: confirmation dialog con preview del nuevo saldo proyectado.
 */
import { useEffect, useState } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { AlertTriangle, Banknote, Check, CreditCard, Gift, Globe, Loader2, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PaymentMethod } from '@zenix/shared'
import { useDiscardConfirm } from './ConfirmDialog'
import { DialogActions } from './DialogActions'

interface Props {
  open: boolean
  isPending: boolean
  /** Saldo actual de la stay en propertyCurrency. */
  balance: number
  /** Moneda primaria (display). */
  currency: string
  /** Conversiones secundarias opcional (USD/EUR/MXN). */
  secondaryRates?: Record<string, number | null> | null
  onClose: () => void
  onConfirm: (payload: {
    method: PaymentMethod
    amount: number
    reference?: string
    approvedById?: string
    approvalReason?: string
  }) => void
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]:          'Efectivo',
  [PaymentMethod.CARD_TERMINAL]: 'Terminal (tarjeta)',
  [PaymentMethod.BANK_TRANSFER]: 'Transferencia bancaria',
  [PaymentMethod.OTA_PREPAID]:   'OTA prepagado',
  [PaymentMethod.COMP]:          'Cortesía (COMP)',
}

const METHOD_ICONS: Record<PaymentMethod, typeof Banknote> = {
  [PaymentMethod.CASH]:          Banknote,
  [PaymentMethod.CARD_TERMINAL]: CreditCard,
  [PaymentMethod.BANK_TRANSFER]: RefreshCw,
  [PaymentMethod.OTA_PREPAID]:   Globe,
  [PaymentMethod.COMP]:          Gift,
}

function decimalsFor(currency: string): number {
  if (['JPY','KRW','CLP','COP','PYG','VND','IDR'].includes(currency)) return 0
  if (['KWD','BHD','OMR','JOD'].includes(currency)) return 3
  return 2
}
function formatMoney(amount: number, currency: string) {
  const dec = decimalsFor(currency)
  try {
    return new Intl.NumberFormat('es-MX', { style:'currency', currency, minimumFractionDigits:dec, maximumFractionDigits:dec }).format(amount)
  } catch { return `${currency} ${amount.toFixed(dec)}` }
}

export function RegisterPaymentDialog({
  open, isPending, balance, currency, secondaryRates,
  onClose, onConfirm,
}: Props) {
  const [method,        setMethod]        = useState<PaymentMethod>(PaymentMethod.CASH)
  // String buffer para el monto — permite estados intermedios "1.", "1.5",
  // "" mientras el usuario tipea. value={amount || ''} con parseFloat
  // directo perdía el punto decimal (parseFloat("1.")=1 → re-render value="1"
  // → usuario no podía agregar decimales).
  const [amountStr,     setAmountStr]     = useState('')
  const [reference,     setReference]     = useState('')
  const [approvedById,  setApprovedById]  = useState('')
  const [approvalReason, setApprovalReason] = useState('')
  // Snapshot del state inicial al abrir — necesario para que `isDirty`
  // compare contra los valores con los que se montó el modal (no contra
  // "empty"). El amountStr arranca pre-fileado con el balance, sin esto
  // el dialog se considera dirty desde el primer render → prompt de
  // descartar aparecía aunque el usuario no tocara nada.
  const [initial, setInitial] = useState({ method: PaymentMethod.CASH, amountStr: '', reference: '', approvedById: '', approvalReason: '' })

  const amount = parseFloat(amountStr) || 0

  useEffect(() => {
    if (open) {
      const initialAmount = balance > 0 ? balance.toFixed(2) : ''
      setMethod(PaymentMethod.CASH)
      setAmountStr(initialAmount)
      setReference('')
      setApprovedById('')
      setApprovalReason('')
      setInitial({ method: PaymentMethod.CASH, amountStr: initialAmount, reference: '', approvedById: '', approvalReason: '' })
    }
  }, [open, balance])

  // Dirty = el state actual difiere del snapshot al abrir. Esto evita
  // false-positive cuando el monto se pre-fillea con el saldo y el usuario
  // cierra sin editar nada. Apple HIG: confirm dirty solo si HAY pérdida real.
  const isDirty =
    method !== initial.method ||
    amountStr !== initial.amountStr ||
    reference !== initial.reference ||
    approvedById !== initial.approvedById ||
    approvalReason !== initial.approvalReason
  // Apple HIG: confirm dirty antes de cerrar — modal del sistema Zenix.
  // Cierre bloqueado durante isPending para garantizar consistencia: la
  // mutation o resuelve OK (toast success + cierre auto) o falla con timeout
  // (api/client.ts §iter6 — TIMEOUT_DEFAULTS POST=20s) que dispara onError +
  // toast + isPending=false → permite cerrar. Nunca queda atrapado.
  const { requestClose, dialogElement: discardPrompt } = useDiscardConfirm({
    isDirty,
    onConfirmDiscard: onClose,
    disabled: isPending,
    title: 'Descartar pago',
    message: 'El pago no se registrará. ¿Continuar?',
    confirmLabel: 'Descartar',
  })

  // Validaciones.
  // Approval del manager SOLO aplica para COMP (cortesía = manager autoriza
  // regalar habitación). Cash/card/transfer entrante = registrar sin fricción
  // — pattern Cloudbeds/Mews/Opera/RoomRaccoon/Little Hotelier. El control
  // anti-fraude vive en el arqueo del turno (CashierShift §85 PAY-CORE), no
  // en cada registro de pago.
  const needsReference = method === PaymentMethod.CARD_TERMINAL || method === PaymentMethod.BANK_TRANSFER
  const needsApproval  = method === PaymentMethod.COMP
  const referenceError = needsReference && !reference.trim()
    ? (method === PaymentMethod.CARD_TERMINAL
        ? 'Número de aprobación requerido'
        : 'Folio o referencia requerida')
    : null
  const approvalError = needsApproval && (!approvedById.trim() || !approvalReason.trim())
    ? 'Código y razón del manager requeridos'
    : null
  // Amount > 0 requerido salvo COMP (que sí puede ser 0 — es habitación regalada).
  const amountError = amount < 0
    ? 'Monto inválido'
    : amount === 0 && method !== PaymentMethod.COMP
      ? 'Monto requerido'
      : null
  const newBalance = balance - amount
  const isOverpayment = newBalance < -0.01

  const canConfirm = !isPending && !referenceError && !approvalError && !amountError

  function handleSubmit() {
    if (!canConfirm) return
    onConfirm({
      method,
      amount,
      reference: reference.trim() || undefined,
      approvedById: approvedById.trim() || undefined,
      approvalReason: approvalReason.trim() || undefined,
    })
  }

  const MethodIcon = METHOD_ICONS[method]

  // Radix Dialog: nesting nativo soluciona FocusScope + portal + dismiss +
  // pointer-events sin hacks manuales. El Sheet padre cede el focus trap al
  // Dialog hijo automáticamente (Radix tracks la pila de dialogs abiertos).
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) requestClose() }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-zenix-modal="true"
          className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px]"
        />
        <DialogPrimitive.Content
          data-zenix-modal="true"
          aria-labelledby="register-payment-title"
          onOpenAutoFocus={(e) => {
            // Auto-focus al primer input (Monto) — el método ya tiene default Efectivo.
            e.preventDefault()
            const input = (e.currentTarget as HTMLElement | null)?.querySelector?.('input[type="number"]') as HTMLInputElement | null
            input?.focus()
          }}
          className="fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        >
        <div className="h-1 bg-emerald-500/80 shrink-0" />

        <header className="px-5 pt-4 pb-3 flex items-start justify-between shrink-0">
          <div>
            <h2 id="register-payment-title" className="text-base font-semibold text-slate-900 leading-tight">
              Registrar pago
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Saldo actual: <span className="font-mono">{formatMoney(balance, currency)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={isPending}
            aria-label="Cerrar"
            className="text-slate-400 hover:text-slate-700 -mr-1 -mt-1 p-1 rounded hover:bg-slate-100 disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-5 pb-4 space-y-3 overflow-y-auto">
          {/* Método — grid 2 cols compacto */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Método</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][]).map(([key, label]) => {
                const Icon = METHOD_ICONS[key]
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setMethod(key); setReference(''); setApprovedById(''); setApprovalReason('')
                    }}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-left transition-colors',
                      method === key
                        ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-300'
                        : 'border-slate-200 hover:border-slate-300 bg-white',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    <span className="text-xs font-medium text-slate-800 truncate">{label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Monto */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Monto ({currency})
            </label>
            <div className="flex gap-1.5">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0.00"
                autoFocus
                className={cn(
                  'flex-1 rounded-lg border bg-white px-3 py-2 text-base font-mono tabular-nums',
                  'focus:outline-none focus:ring-2',
                  // Apple HIG: no native spinner arrows — text-style numeric input.
                  // Tailwind arbitrary selectors quitan los controles WebKit/Firefox.
                  '[-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0',
                  amountError
                    ? 'border-rose-400 ring-1 ring-rose-200'
                    : 'border-slate-200 focus:border-emerald-400 focus:ring-emerald-200',
                )}
              />
              {balance > 0 && amount !== balance && (
                <button
                  type="button"
                  onClick={() => setAmountStr(balance.toFixed(2))}
                  className="px-2.5 rounded-lg border border-slate-200 text-[11px] font-medium text-slate-600 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50"
                  title="Auto-completar el saldo exacto"
                >
                  = saldo
                </button>
              )}
            </div>
            {/* Conversion preview */}
            {amount > 0 && secondaryRates && (
              <p className="text-[10px] text-slate-400 tabular-nums">
                {Object.entries(secondaryRates)
                  .filter(([, r]) => typeof r === 'number' && r > 0)
                  .map(([curr, r]) => `≈ ${formatMoney(amount * (r as number), curr)}`)
                  .join(' · ')}
              </p>
            )}
          </div>

          {/* Reference (CARD/BANK) */}
          {needsReference && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                {method === PaymentMethod.CARD_TERMINAL
                  ? 'Número de aprobación de la terminal *'
                  : 'Referencia de la transferencia *'}
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={
                  method === PaymentMethod.CARD_TERMINAL
                    ? 'Lo imprime el ticket (ej. 123456)'
                    : 'Folio o número de operación'
                }
                className={cn(
                  'w-full rounded-lg border bg-white px-3 py-2 text-sm',
                  'focus:outline-none focus:ring-2',
                  referenceError
                    ? 'border-rose-400 ring-1 ring-rose-200'
                    : 'border-slate-200 focus:border-emerald-400 focus:ring-emerald-200',
                )}
              />
              {referenceError && (
                <p className="text-[11px] text-rose-600">{referenceError}</p>
              )}
            </div>
          )}

          {/* Approval (COMP / amount=0) */}
          {needsApproval && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5">
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
                <MethodIcon className="h-3 w-3" />
                Aprobación del manager
              </p>
              <input
                type="text"
                value={approvedById}
                onChange={(e) => setApprovedById(e.target.value)}
                placeholder="Código del manager *"
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <input
                type="text"
                value={approvalReason}
                onChange={(e) => setApprovalReason(e.target.value.slice(0, 200))}
                placeholder="Motivo (cortesía VIP, compensación…)"
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              {approvalError && (
                <p className="text-[11px] text-rose-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {approvalError}
                </p>
              )}
            </div>
          )}

          {/* Preview saldo proyectado */}
          {amount > 0 && (
            <div className={cn(
              'rounded-lg border px-3.5 py-2.5 flex items-center justify-between text-xs',
              isOverpayment
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : newBalance <= 0.01
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-slate-50 text-slate-700',
            )}>
              <span>
                {isOverpayment ? 'Excede el saldo por' : 'Saldo tras este pago'}
              </span>
              <span className="font-bold tabular-nums">
                {formatMoney(Math.abs(newBalance), currency)}
              </span>
            </div>
          )}
          {isOverpayment && (
            <p className="text-[11px] text-amber-700 italic leading-snug">
              Se registrará crédito a favor del huésped — se devuelve al checkout.
            </p>
          )}
        </div>

        <DialogActions
          onCancel={requestClose}
          onConfirm={handleSubmit}
          confirmLabel="Registrar pago"
          confirmIcon={Check}
          isPending={isPending}
          confirmDisabled={!canConfirm || isPending}
          className="px-5 pb-4 pt-2 shrink-0 border-t border-slate-100"
        />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
      {discardPrompt}
    </DialogPrimitive.Root>
  )
}
