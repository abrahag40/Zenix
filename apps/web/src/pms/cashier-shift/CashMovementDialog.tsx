import { useEffect, useState, type ReactNode } from 'react'
import type { CashierShiftDto } from '@zenix/shared'
import { DialogActions } from '@/modules/rooms/components/shared/DialogActions'
import { StyledInput } from '@/modules/rooms/components/shared/StyledInput'
import { StyledSelect } from '@/modules/rooms/components/shared/StyledSelect'
import { CashDialogShell } from './CashDialogShell'
import { useAddCashMovement } from './useCashierShift'

const TYPE_OPTIONS = [
  { value: 'PAID_OUT', label: 'Pago de caja (sale)' },
  { value: 'CHANGE_GIVEN', label: 'Cambio entregado (sale)' },
  { value: 'PAID_IN', label: 'Entrada de efectivo' },
  { value: 'CORRECTION', label: 'Corrección' },
]
const CCY_OPTIONS = [
  { value: 'MXN', label: 'MXN' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
]
const DIR_OPTIONS = [
  { value: 'OUT', label: 'Sale de caja' },
  { value: 'IN', label: 'Entra a caja' },
]

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

/** Movimiento de caja append-only (E3): paid-out, cambio, entrada, corrección. */
export function CashMovementDialog({
  open,
  onOpenChange,
  shift,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  shift: CashierShiftDto
}) {
  const [type, setType] = useState('PAID_OUT')
  const [currency, setCurrency] = useState('MXN')
  const [amount, setAmount] = useState(0)
  const [direction, setDirection] = useState<'IN' | 'OUT'>('OUT')
  const [notes, setNotes] = useState('')
  const mut = useAddCashMovement()

  useEffect(() => {
    if (open) {
      setType('PAID_OUT')
      setCurrency('MXN')
      setAmount(0)
      setDirection('OUT')
      setNotes('')
    }
  }, [open])

  const needsDirection = type === 'CORRECTION'
  const valid = amount > 0

  const submit = () =>
    mut.mutate(
      {
        shiftId: shift.id,
        body: {
          type,
          currency,
          amount,
          direction: needsDirection ? direction : undefined,
          notes: notes.trim() || undefined,
        },
      },
      { onSuccess: () => onOpenChange(false) },
    )

  return (
    <CashDialogShell
      open={open}
      onOpenChange={(o) => {
        if (!mut.isPending) onOpenChange(o)
      }}
      title="Movimiento de caja"
      subtitle="Registra salidas o entradas de efectivo fuera de los cobros (paid-outs, cambio, correcciones)."
    >
      <div className="space-y-3">
        <Field label="Tipo">
          <StyledSelect value={type} onChange={setType} options={TYPE_OPTIONS} />
        </Field>
        <div className="grid grid-cols-[100px_1fr] gap-2">
          <Field label="Divisa">
            <StyledSelect value={currency} onChange={setCurrency} options={CCY_OPTIONS} />
          </Field>
          <Field label="Monto">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 pointer-events-none">$</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={amount || ''}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full h-9 rounded-md border border-slate-200 bg-white pl-7 pr-3 text-sm tabular-nums text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 transition-colors"
              />
            </div>
          </Field>
        </div>
        {needsDirection ? (
          <Field label="Dirección">
            <StyledSelect value={direction} onChange={(v) => setDirection(v as 'IN' | 'OUT')} options={DIR_OPTIONS} />
          </Field>
        ) : null}
        <Field label="Nota (opcional)">
          <StyledInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo del movimiento" />
        </Field>
        <DialogActions
          tone="primary"
          confirmLabel="Registrar"
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
