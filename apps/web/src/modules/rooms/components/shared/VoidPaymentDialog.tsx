/**
 * VoidPaymentDialog — Sprint EDIT-RESERVATION
 *
 * Confirma anulación de un PaymentLog. Reason obligatoria (Visa CRR §5.9
 * chargeback evidence + USALI audit). Backend crea entrada negativa, NO
 * borra el original (§28).
 *
 * Apple HIG destructive confirmation pattern — Cancel a la izquierda
 * (default), Anular en rojo a la derecha. Esc + backdrop cierran con
 * dirty-state confirm.
 */
import { useEffect, useState } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { AlertTriangle, Ban, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PaymentLogDto } from '../../api/guest-stays.api'
import { useDiscardConfirm } from './ConfirmDialog'
import { DialogActions } from './DialogActions'

interface Props {
  open: boolean
  payment: PaymentLogDto | null
  isPending: boolean
  onClose: () => void
  onConfirm: (voidReason: string) => void
}

const REASON_SUGGESTIONS = [
  'Monto incorrecto',
  'Método cobrado por error',
  'Reembolso al huésped',
  'Duplicado del POS',
  'Otra (especificar)',
]

export function VoidPaymentDialog({ open, payment, isPending, onClose, onConfirm }: Props) {
  const [reasonCode, setReasonCode] = useState('')
  const [reasonNotes, setReasonNotes] = useState('')

  useEffect(() => {
    if (open) { setReasonCode(''); setReasonNotes('') }
  }, [open])

  const isDirty = reasonCode !== '' || reasonNotes.trim() !== ''
  const { requestClose, dialogElement: discardPrompt } = useDiscardConfirm({
    isDirty,
    onConfirmDiscard: onClose,
    disabled: isPending,
    title: 'Descartar anulación',
    message: 'El pago NO se anulará. ¿Continuar?',
    confirmLabel: 'Descartar',
  })

  // La razón final concatena code + notes (USALI: razón legible humana).
  const finalReason = reasonCode === 'Otra (especificar)'
    ? reasonNotes.trim()
    : reasonNotes.trim()
      ? `${reasonCode} — ${reasonNotes.trim()}`
      : reasonCode

  const valid = reasonCode !== '' && (reasonCode !== 'Otra (especificar)' || reasonNotes.trim().length > 0)

  // Radix Dialog nesting nativo — focus scope + portal + dismiss + a11y
  // sin hacks manuales (ver fix iter 4 RegisterPaymentDialog).
  return (
    <DialogPrimitive.Root
      open={open && !!payment}
      onOpenChange={(isOpen) => { if (!isOpen) requestClose() }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-zenix-modal="true"
          className="fixed inset-0 z-[70] bg-black/30 backdrop-blur-[2px]"
        />
        <DialogPrimitive.Content
          data-zenix-modal="true"
          aria-labelledby="void-payment-title"
          className="fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        >
        <div className="h-1 bg-rose-500/70 shrink-0" />

        <header className="px-5 pt-4 pb-3 flex items-start justify-between shrink-0">
          <div>
            <h2 id="void-payment-title" className="text-base font-semibold text-slate-900 leading-tight">
              Anular pago
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Se registra entrada negativa — el original queda intacto (audit)
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={isPending}
            aria-label="Cerrar"
            className="text-slate-400 hover:text-slate-700 -mr-1 -mt-1 p-1 rounded hover:bg-slate-100"
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-5 pb-4 space-y-3.5">
          {payment && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Método</span>
              <span className="font-medium text-slate-800">{payment.method}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Monto</span>
              <span className="font-mono font-bold text-slate-800">
                {payment.currency} {Number(payment.amount).toLocaleString()}
              </span>
            </div>
            {payment.reference && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Referencia</span>
                <span className="font-mono text-slate-700">{payment.reference}</span>
              </div>
            )}
          </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Razón <span className="text-rose-500">*</span>
            </label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
            >
              <option value="">Selecciona una razón…</option>
              {REASON_SUGGESTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {reasonCode !== '' && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Notas {reasonCode === 'Otra (especificar)' && <span className="text-rose-500">*</span>}
                <span className="font-normal normal-case text-slate-400 ml-1">(audit log)</span>
              </label>
              <textarea
                value={reasonNotes}
                onChange={(e) => setReasonNotes(e.target.value.slice(0, 240))}
                rows={2}
                maxLength={240}
                placeholder="Detalle adicional…"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 resize-none"
              />
            </div>
          )}

          <div className="flex items-start gap-2 text-[11px] text-slate-500 leading-snug">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            La anulación queda registrada permanentemente (append-only USALI 12 ed).
            No se puede deshacer.
          </div>
        </div>

        <DialogActions
          onCancel={requestClose}
          onConfirm={() => onConfirm(finalReason)}
          confirmLabel="Anular pago"
          confirmIcon={Ban}
          tone="destructive"
          isPending={isPending}
          confirmDisabled={!valid}
          className="px-5 pb-4 pt-2 shrink-0 border-t border-slate-100"
        />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
      {discardPrompt}
    </DialogPrimitive.Root>
  )
}
