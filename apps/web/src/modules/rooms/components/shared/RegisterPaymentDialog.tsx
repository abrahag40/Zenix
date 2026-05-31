/**
 * RegisterPaymentDialog — Sprint EDIT-RESERVATION iter 4
 *
 * Dialog para registrar un pago adicional sobre la reserva. Voz #3 del
 * research (Mews community top request): "no debería tener que ir a otro
 * menú para cobrar". CTA va dentro del hero card del tab Pago.
 *
 * Sprint PAYMENT-MODAL-UNIFY (Fase D, 2026-05-30): el bloque de captura de
 * pago es ahora EXACTAMENTE el mismo que el del check-in — `PaymentEntryFields`
 * compartido (método en grid de iconos + monto con $ prefix + referencia
 * adaptive ó quick-fill "Cobrar saldo"). Single source, cero divergencia
 * visual entre modales (CLAUDE.md §3 Coherencia sistémica + NN/g H4).
 *
 * Validaciones (deferred validation, patrón Stripe Elements — igual al
 * check-in): el botón Confirmar dispara la validación; campos faltantes se
 * marcan con border rojo + shake. CARD/BANK → referencia obligatoria;
 * COMP puede ser monto 0 (habitación regalada). La aprobación del manager
 * fue removida (§C1.13): recepción conoce los códigos, el motivo va en notas,
 * el control anti-fraude vive en el arqueo del turno (CashierShift §85).
 *
 * Apple HIG: confirmation dialog con preview del nuevo saldo proyectado.
 */
import { useEffect, useState } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PaymentMethod } from '@zenix/shared'
import { useDiscardConfirm } from './ConfirmDialog'
import { DialogActions } from './DialogActions'
import { PaymentEntryFields, formatPaymentMoney } from './PaymentFields'

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
  }) => void
}

export function RegisterPaymentDialog({
  open, isPending, balance, currency, secondaryRates,
  onClose, onConfirm,
}: Props) {
  const [method,    setMethod]    = useState<PaymentMethod>(PaymentMethod.CASH)
  const [amount,    setAmount]    = useState(0)
  const [reference, setReference] = useState('')
  // Deferred validation (patrón Stripe Elements, idéntico al check-in):
  // attempted=true tras el primer click en Confirmar → borders rojos;
  // attemptNonce re-dispara el shake en cada intento inválido.
  const [attempted,    setAttempted]    = useState(false)
  const [attemptNonce, setAttemptNonce] = useState(0)
  // Snapshot del state inicial al abrir — `isDirty` compara contra los valores
  // con los que se montó (no contra "empty"). El monto arranca pre-fileado con
  // el saldo (Pareto: ~80% de cobros liquidan el saldo completo).
  const [initial, setInitial] = useState({ method: PaymentMethod.CASH, amount: 0, reference: '' })

  useEffect(() => {
    if (open) {
      const initialAmount = balance > 0 ? balance : 0
      setMethod(PaymentMethod.CASH)
      setAmount(initialAmount)
      setReference('')
      setAttempted(false)
      setInitial({ method: PaymentMethod.CASH, amount: initialAmount, reference: '' })
    }
  }, [open, balance])

  // Dirty = el state actual difiere del snapshot al abrir. Apple HIG:
  // confirm dirty solo si HAY pérdida real.
  const isDirty =
    method !== initial.method ||
    amount !== initial.amount ||
    reference !== initial.reference
  const { requestClose, dialogElement: discardPrompt } = useDiscardConfirm({
    isDirty,
    onConfirmDiscard: onClose,
    disabled: isPending,
    title: 'Descartar pago',
    message: 'El pago no se registrará. ¿Continuar?',
    confirmLabel: 'Descartar',
  })

  const needsReference = method === PaymentMethod.CARD_TERMINAL || method === PaymentMethod.BANK_TRANSFER
  const referenceError = needsReference && !reference.trim()
  // Monto > 0 requerido salvo COMP (que sí puede ser 0 — habitación regalada).
  const amountError = amount < 0 || (amount === 0 && method !== PaymentMethod.COMP)

  const newBalance = balance - amount
  const isOverpayment = newBalance < -0.01
  const canConfirm = !isPending && !referenceError && !amountError

  function handleSubmit() {
    // Deferred validation idéntica al check-in: si inválido → marca attempted +
    // shake, no submitea. El border rojo comunica el campo faltante.
    if (referenceError || amountError) {
      setAttempted(true)
      setAttemptNonce((n) => n + 1)
      return
    }
    if (isPending) return
    onConfirm({
      method,
      amount,
      reference: reference.trim() || undefined,
    })
  }

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
            // Auto-focus al input de Monto — el método ya tiene default Efectivo.
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
              Saldo actual: <span className="font-mono">{formatPaymentMoney(balance, currency)}</span>
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
          {/* Campos de pago canónicos — EXACTAMENTE el mismo bloque del check-in
              (PAYMENT-MODAL-UNIFY). */}
          <PaymentEntryFields
            value={{ method, amount, reference }}
            onChange={(patch) => {
              if (patch.method !== undefined) { setMethod(patch.method); setReference('') }
              if (patch.amount !== undefined) setAmount(patch.amount)
              if (patch.reference !== undefined) setReference(patch.reference)
            }}
            balance={balance}
            currency={currency}
            secondaryRates={secondaryRates}
            attempted={attempted}
            shakeNonce={attemptNonce}
          />

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
                {formatPaymentMoney(Math.abs(newBalance), currency)}
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
          confirmDisabled={!canConfirm}
          className="px-5 pb-4 pt-2 shrink-0 border-t border-slate-100"
        />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
      {discardPrompt}
    </DialogPrimitive.Root>
  )
}
