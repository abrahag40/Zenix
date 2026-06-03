/**
 * RegisterCancelRefundDialog — registra el outcome del reembolso de una reserva
 * cancelada. Sprint GROUP-BILLING Fase C C3b (D-GRP-C5, 2026-06-02).
 *
 * Flujo 100% administrativo (igual que RegisterNoShowChargeDialog): el reembolso
 * se procesa FUERA de Zenix (OTA Virtual Card, transferencia, efectivo) y aquí se
 * registra el resultado. NO usa Stripe (§195/§C5).
 *
 * Estados: REFUNDED (se reembolsó) | WAIVED (no se reembolsó — huésped renunció /
 * política). El monto a reembolsar viene calculado por la política (cancelStay);
 * el operador puede ajustarlo si reembolsó un parcial. Razón obligatoria si WAIVED.
 */
import { useState } from 'react'
import { CreditCard } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DialogActions } from '../shared/DialogActions'
import { cn } from '@/lib/utils'

type RefundStatus = 'REFUNDED' | 'WAIVED'
type RefundMethod = 'cash' | 'transfer' | 'ota_card' | 'manual_card' | 'ota_collect' | 'other'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: (dto: {
    status: RefundStatus
    method?: RefundMethod
    reference?: string
    amount?: number
    reason?: string
  }) => void
  isPending: boolean
  guestName: string
  /** Monto a reembolsar calculado por la política (cancelStay). */
  refundAmount?: number | null
  /** Retención del hotel (informativo). */
  retentionAmount?: number | null
  currency?: string
}

const STATUS_OPTIONS: { value: RefundStatus; label: string; tone: string; helper: string }[] = [
  { value: 'REFUNDED', label: 'Reembolsado', tone: 'emerald', helper: 'El reembolso se procesó (OTA VCC / transferencia / efectivo).' },
  { value: 'WAIVED',   label: 'No reembolsado', tone: 'slate', helper: 'No se devolvió al huésped (renunció / política). Requiere razón.' },
]

const METHOD_OPTIONS: { value: RefundMethod; label: string }[] = [
  { value: 'transfer',    label: 'Transferencia bancaria (SPEI / wire)' },
  { value: 'ota_card',    label: 'OTA Virtual Card (Booking / Expedia)' },
  { value: 'cash',        label: 'Efectivo en mostrador' },
  { value: 'manual_card', label: 'Reverso en terminal POS' },
  { value: 'ota_collect', label: 'Reembolso gestionado en la OTA' },
  { value: 'other',       label: 'Otro' },
]

export function RegisterCancelRefundDialog({
  open, onClose, onConfirm, isPending, guestName, refundAmount, retentionAmount, currency = 'MXN',
}: Props) {
  const due = refundAmount ?? 0
  const [status, setStatus] = useState<RefundStatus>('REFUNDED')
  const [method, setMethod] = useState<RefundMethod>('transfer')
  const [reference, setReference] = useState('')
  const [reason, setReason] = useState('')
  const [amountStr, setAmountStr] = useState('')

  const amount = amountStr.trim() === '' ? due : parseFloat(amountStr) || 0
  const reasonMissing = status === 'WAIVED' && reason.trim().length < 5
  const referenceMissing =
    status === 'REFUNDED' && (method === 'transfer' || method === 'ota_card') && reference.trim().length === 0
  const canConfirm = !reasonMissing && !referenceMissing

  const handleConfirm = () => {
    if (!canConfirm) return
    onConfirm({
      status,
      method: status === 'REFUNDED' ? method : undefined,
      reference: reference.trim() || undefined,
      reason: reason.trim() || undefined,
      // Solo enviamos amount si difiere del calculado (reembolso parcial).
      amount: status === 'REFUNDED' && Math.abs(amount - due) > 0.001 ? amount : undefined,
    })
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && !isPending) {
      setStatus('REFUNDED'); setMethod('transfer'); setReference(''); setReason(''); setAmountStr('')
      onClose()
    }
  }

  const selectedStatus = STATUS_OPTIONS.find((s) => s.value === status)!
  const money = (n: number) => `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-slate-500" />
            Registrar reembolso de la cancelación
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-1 pb-2">
          {/* Resumen */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700">
            <div className="flex items-baseline justify-between gap-3">
              <div className="truncate font-medium text-slate-800">{guestName}</div>
              <div className="shrink-0 font-mono text-[11px] text-slate-500">
                A reembolsar: {money(due)}
              </div>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {retentionAmount != null && retentionAmount > 0
                ? `Retención del hotel: ${money(retentionAmount)}. `
                : ''}
              El reembolso se procesa fuera de Zenix; aquí registras el outcome (audit permanente).
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Resultado</label>
            <div className="grid grid-cols-2 gap-1.5">
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

          {status === 'REFUNDED' && (
            <>
              {/* Método */}
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Método del reembolso</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as RefundMethod)}
                  disabled={isPending}
                  className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                >
                  {METHOD_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>

              {/* Monto (default = calculado; editable para parcial) */}
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Monto reembolsado ({currency})
                </label>
                <div className="flex gap-1.5 items-center">
                  <input
                    type="number" min={0} step="0.01" inputMode="decimal"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    placeholder={due.toFixed(2)}
                    disabled={isPending}
                    className="flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                  />
                  {amountStr.trim() !== '' && Math.abs(amount - due) > 0.001 && (
                    <button type="button" onClick={() => setAmountStr('')}
                      className="px-2 rounded-md border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50">
                      = {money(due)}
                    </button>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">Por defecto el calculado por la política. Edítalo si reembolsaste un parcial.</p>
              </div>

              {/* Referencia */}
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Referencia {referenceMissing ? <span className="text-red-500">*</span> : '(opcional)'}
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Transfer ID, OTA case ID, folio…"
                  disabled={isPending}
                  className={cn(
                    'w-full rounded-md border bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400',
                    referenceMissing ? 'border-red-300' : 'border-slate-200',
                  )}
                />
                {referenceMissing && (
                  <p className="mt-1 text-[11px] text-red-600">Referencia requerida para transferencia / OTA VCC (evidencia).</p>
                )}
              </div>
            </>
          )}

          {status === 'WAIVED' && (
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Razón <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Ej: política de no reembolso, huésped renunció, ajuste comercial aprobado…"
                disabled={isPending}
                className={cn(
                  'w-full resize-none rounded-md border bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400',
                  reasonMissing ? 'border-red-300' : 'border-slate-200',
                )}
              />
              {reasonMissing && <p className="mt-1 text-[11px] text-red-600">Razón requerida (mín 5 caracteres) para audit trail.</p>}
            </div>
          )}
        </div>

        <DialogActions
          onCancel={onClose}
          onConfirm={handleConfirm}
          confirmLabel="Registrar reembolso"
          confirmPendingLabel="Registrando…"
          tone={status === 'REFUNDED' ? 'primary' : 'info'}
          isPending={isPending}
          confirmDisabled={!canConfirm}
          className="px-6 pb-5"
        />
      </DialogContent>
    </Dialog>
  )
}
