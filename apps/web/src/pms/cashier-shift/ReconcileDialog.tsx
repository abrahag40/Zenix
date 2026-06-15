import { useEffect, useState } from 'react'
import { DialogActions } from '@/modules/rooms/components/shared/DialogActions'
import { CashDialogShell } from './CashDialogShell'
import { useReconcileShift } from './useCashierShift'

/**
 * Conciliación del SUPERVISOR de un turno CLOSED fuera de tolerancia (D-CASH6).
 * Decide RECONCILED (justificado) o DISPUTED, con razón obligatoria (≥5, audit).
 */
export function ReconcileDialog({
  open,
  onOpenChange,
  shiftId,
  variance,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  shiftId: string
  variance: Record<string, number> | null
}) {
  const [decision, setDecision] = useState<'RECONCILED' | 'DISPUTED'>('RECONCILED')
  const [reason, setReason] = useState('')
  const mut = useReconcileShift()

  useEffect(() => {
    if (open) {
      setDecision('RECONCILED')
      setReason('')
    }
  }, [open])

  const valid = reason.trim().length >= 5
  const submit = () =>
    mut.mutate({ shiftId, body: { decision, varianceReason: reason.trim() } }, { onSuccess: () => onOpenChange(false) })

  const varStr = variance
    ? Object.entries(variance)
        .map(([c, n]) => `${c} ${n > 0 ? '+' : ''}${n}`)
        .join(' · ')
    : '—'

  return (
    <CashDialogShell
      open={open}
      onOpenChange={(o) => {
        if (!mut.isPending) onOpenChange(o)
      }}
      title="Conciliar turno"
      subtitle="Revisa la diferencia y decide. La razón queda en el registro de auditoría."
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Diferencia (over/short)</span>
          <p className="text-sm tabular-nums text-amber-900 mt-0.5">{varStr}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDecision('RECONCILED')}
            className={`h-9 rounded-md text-xs font-medium border transition-colors ${
              decision === 'RECONCILED'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Conciliar (justificado)
          </button>
          <button
            type="button"
            onClick={() => setDecision('DISPUTED')}
            className={`h-9 rounded-md text-xs font-medium border transition-colors ${
              decision === 'DISPUTED'
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Disputar
          </button>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Razón ({reason.trim().length}/5 mín.)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Ej. faltante por cambio mal entregado, repuesto por el cajero…"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 transition-colors resize-none"
          />
        </div>
        <DialogActions
          tone={decision === 'DISPUTED' ? 'destructive' : 'primary'}
          confirmLabel={decision === 'DISPUTED' ? 'Disputar turno' : 'Conciliar turno'}
          isPending={mut.isPending}
          confirmDisabled={!valid}
          onCancel={() => onOpenChange(false)}
          onConfirm={submit}
          className="pt-3 border-t border-slate-100"
        />
      </div>
    </CashDialogShell>
  )
}
