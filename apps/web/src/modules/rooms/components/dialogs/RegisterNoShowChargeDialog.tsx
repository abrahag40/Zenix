/**
 * RegisterNoShowChargeDialog — registra el outcome del cobro manual del no-show.
 *
 * Sprint POST-NETFLIX-TRIAL (2026-05-29). Flujo 100% administrativo:
 * recepción cobra fuera de Zenix (efectivo en mostrador, OTA virtual card via
 * Booking Genius VCC / Expedia Collect, transferencia, terminal POS manual) y
 * registra aquí el resultado.
 *
 * NO usa Stripe — Stripe en Zenix solo se usa para:
 *   (1) subscription billing del hotel (mensualidad Zenix)
 *   (2) booking engine público (cobro de reserva direct)
 *
 * El dialog respeta CLAUDE.md §116 (Radix Dialog primitives), §117 (DialogActions),
 * §38 (forcing function destructive), §39 (feedback informativo qué/por qué/qué hacer).
 *
 * Fundamentos:
 *   - Visa CRR §5.9.2: el `reference` (POS auth code, transfer ID, OTA case ID) es
 *     evidencia primaria para defender chargebacks por non-arrival.
 *   - GDPR/LFPDPPP: el `reason` obligatorio en WAIVED queda en audit trail
 *     permanente (§11 inmutabilidad de no-show records).
 *   - HIG Apple 2024: confirmación destructiva con preview antes de mutar.
 */
import { useState } from 'react'
import { Banknote, CreditCard, ArrowRightLeft, XCircle, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DialogActions } from '../shared/DialogActions'
import { cn } from '@/lib/utils'

type ChargeStatus = 'CHARGED' | 'FAILED' | 'WAIVED'
type ChargeMethod = 'cash' | 'transfer' | 'ota_card' | 'manual_card' | 'ota_collect' | 'other'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: (dto: {
    status: ChargeStatus
    method: ChargeMethod
    reference?: string
    reason?: string
  }) => void
  isPending: boolean
  guestName: string
  feeAmount?: number
  feeCurrency?: string
  /** Si el OTA mandó datos de garantía (VCC), se muestra como hint para que recepción la use. */
  hasOtaGuarantee?: boolean
}

const STATUS_OPTIONS: { value: ChargeStatus; label: string; tone: string; helper: string }[] = [
  { value: 'CHARGED', label: 'Cobrado',  tone: 'emerald', helper: 'El cargo fue exitoso. Quedará marcado como cobrado.' },
  { value: 'FAILED',  label: 'Fallido',  tone: 'red',     helper: 'El cobro no pasó (tarjeta declinada, VCC sin fondos, etc.).' },
  { value: 'WAIVED',  label: 'Perdonado',tone: 'slate',   helper: 'Decisión administrativa: no se cobra al huésped. Requiere razón.' },
]

const METHOD_OPTIONS: { value: ChargeMethod; label: string; icon: typeof Banknote; helper: string }[] = [
  { value: 'cash',         label: 'Efectivo en mostrador',       icon: Banknote,       helper: 'Pago físico del huésped o representante.' },
  { value: 'transfer',     label: 'Transferencia bancaria',      icon: ArrowRightLeft, helper: 'SPEI / wire / depósito recibido.' },
  { value: 'ota_card',     label: 'OTA Virtual Card (Booking/Expedia)', icon: CreditCard,   helper: 'Cobrar a la VCC que mandó la OTA en booking_new.' },
  { value: 'manual_card',  label: 'Tarjeta en terminal POS',     icon: CreditCard,     helper: 'Recepción ingresó la tarjeta manualmente al POS.' },
  { value: 'ota_collect',  label: 'OTA collect (cargo en OTA)',  icon: CreditCard,     helper: 'El cobro se gestiona dentro del portal de la OTA.' },
  { value: 'other',        label: 'Otro',                         icon: AlertTriangle,  helper: 'Especifica la referencia para audit.' },
]

export function RegisterNoShowChargeDialog({
  open,
  onClose,
  onConfirm,
  isPending,
  guestName,
  feeAmount,
  feeCurrency,
  hasOtaGuarantee,
}: Props) {
  const [status, setStatus] = useState<ChargeStatus>('CHARGED')
  const [method, setMethod] = useState<ChargeMethod>(hasOtaGuarantee ? 'ota_card' : 'cash')
  const [reference, setReference] = useState('')
  const [reason, setReason] = useState('')

  const reasonMissing = status === 'WAIVED' && reason.trim().length < 5
  const referenceMissing =
    (status === 'CHARGED' && (method === 'ota_card' || method === 'manual_card' || method === 'transfer'))
      ? reference.trim().length === 0
      : false

  const canConfirm = !reasonMissing && !referenceMissing

  const handleConfirm = () => {
    if (!canConfirm) return
    onConfirm({
      status,
      method,
      reference: reference.trim() || undefined,
      reason: reason.trim() || undefined,
    })
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && !isPending) {
      setStatus('CHARGED')
      setMethod(hasOtaGuarantee ? 'ota_card' : 'cash')
      setReference('')
      setReason('')
      onClose()
    }
  }

  const selectedStatus = STATUS_OPTIONS.find((s) => s.value === status)!
  const selectedMethod = METHOD_OPTIONS.find((m) => m.value === method)!
  const MethodIcon = selectedMethod.icon

  const amountLabel =
    feeAmount != null && feeCurrency
      ? `${feeCurrency} ${feeAmount.toFixed(2)}`
      : 'Sin cargo configurado'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-slate-500" />
            Registrar cobro del no-show
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-1 pb-2">
          {/* Resumen */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700">
            <div className="flex items-baseline justify-between gap-3">
              <div className="truncate font-medium text-slate-800">{guestName}</div>
              <div className="shrink-0 font-mono text-[11px] text-slate-500">{amountLabel}</div>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Recepción cobra el no-show fuera de Zenix y aquí registra el outcome.
              Esta acción queda en audit permanente.
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Resultado del cobro
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatus(s.value)}
                  disabled={isPending}
                  className={cn(
                    'rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                    status === s.value
                      ? s.tone === 'emerald'
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                        : s.tone === 'red'
                          ? 'border-red-400 bg-red-50 text-red-800'
                          : 'border-slate-400 bg-slate-100 text-slate-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">{selectedStatus.helper}</p>
          </div>

          {/* Method */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Método de cobro
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as ChargeMethod)}
              disabled={isPending}
              className={cn(
                'w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800',
                'focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400',
              )}
            >
              {METHOD_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
              <MethodIcon className="h-3 w-3" />
              {selectedMethod.helper}
            </p>
            {hasOtaGuarantee && method !== 'ota_card' && status === 'CHARGED' && (
              <p className="mt-1 text-[11px] text-amber-600">
                Esta reserva trae datos de VCC del OTA — considera usar "OTA Virtual Card".
              </p>
            )}
          </div>

          {/* Reference */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Referencia {referenceMissing ? <span className="text-red-500">*</span> : '(opcional)'}
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="POS auth code, transfer ID, OTA case ID…"
              disabled={isPending}
              className={cn(
                'w-full rounded-md border bg-white px-2.5 py-1.5 text-sm text-slate-800',
                'focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400',
                referenceMissing ? 'border-red-300' : 'border-slate-200',
              )}
            />
            {referenceMissing && (
              <p className="mt-1 text-[11px] text-red-600">
                Visa CRR §5.9.2 — la referencia es evidencia primaria para defender chargebacks.
              </p>
            )}
          </div>

          {/* Reason (only for WAIVED) */}
          {status === 'WAIVED' && (
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Razón <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Ej: cliente recurrente, error en el cargo automático, ajuste comercial aprobado…"
                disabled={isPending}
                className={cn(
                  'w-full resize-none rounded-md border bg-white px-2.5 py-1.5 text-sm text-slate-800',
                  'focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400',
                  reasonMissing ? 'border-red-300' : 'border-slate-200',
                )}
              />
              {reasonMissing && (
                <p className="mt-1 text-[11px] text-red-600">
                  Razón requerida (mín 5 caracteres) para audit trail.
                </p>
              )}
            </div>
          )}

          {status === 'FAILED' && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                El cargo queda como <strong>FALLIDO</strong>. La estadía sigue marcada como no-show.
                Puedes reintentar cobro luego revirtiendo y re-aplicando el flujo.
              </div>
            </div>
          )}
        </div>

        <DialogActions
          onCancel={onClose}
          onConfirm={handleConfirm}
          confirmLabel="Registrar cobro"
          confirmPendingLabel="Registrando…"
          tone={status === 'CHARGED' ? 'primary' : status === 'WAIVED' ? 'info' : 'warning'}
          isPending={isPending}
          confirmDisabled={!canConfirm}
          className="px-6 pb-5"
        />
      </DialogContent>
    </Dialog>
  )
}
