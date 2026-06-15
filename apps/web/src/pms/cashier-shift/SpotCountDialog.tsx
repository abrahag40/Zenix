import { useEffect, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { DialogActions } from '@/modules/rooms/components/shared/DialogActions'
import { CashDialogShell } from './CashDialogShell'
import { CurrencyAmountRows } from './CurrencyAmountRows'
import { useRecordSpotCount } from './useCashierShift'

/**
 * Arqueo "spot" del SUPERVISOR (D-CASH13): cuenta físico a mitad de turno SIN
 * cerrarlo y sin interrumpir al cajero. Muestra la variance sólo al supervisor.
 */
export function SpotCountDialog({
  open,
  onOpenChange,
  shiftId,
  currencies,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  shiftId: string
  currencies: string[]
}) {
  const ccys = currencies.length ? currencies : ['MXN']
  const [count, setCount] = useState<Record<string, number>>({})
  const mut = useRecordSpotCount()

  useEffect(() => {
    if (open) setCount(Object.fromEntries(ccys.map((c) => [c, 0])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shiftId])

  const submit = () =>
    mut.mutate({ shiftId, body: { counted: count } }, { onSuccess: () => onOpenChange(false) })

  return (
    <CashDialogShell
      open={open}
      onOpenChange={(o) => {
        if (!mut.isPending) onOpenChange(o)
      }}
      title="Arqueo sorpresa (supervisor)"
      subtitle="Cuenta físicamente la caja del turno activo. No cierra el turno ni interrumpe al recepcionista."
    >
      <div className="space-y-4">
        <CurrencyAmountRows value={count} onChange={setCount} fixed={ccys} />
        <DialogActions
          tone="info"
          confirmLabel="Registrar arqueo"
          confirmIcon={ClipboardCheck}
          isPending={mut.isPending}
          onCancel={() => onOpenChange(false)}
          onConfirm={submit}
          className="pt-3 border-t border-slate-100"
        />
      </div>
    </CashDialogShell>
  )
}
