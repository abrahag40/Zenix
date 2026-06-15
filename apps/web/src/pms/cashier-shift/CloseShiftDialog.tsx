import { useEffect, useState } from 'react'
import type { CashierShiftDto } from '@zenix/shared'
import { DialogActions } from '@/modules/rooms/components/shared/DialogActions'
import { CashDialogShell } from './CashDialogShell'
import { CurrencyAmountRows } from './CurrencyAmountRows'
import { useCloseShift } from './useCashierShift'

/**
 * Cerrar turno (entrega) con CONTEO A CIEGAS (D-CASH5/R3): el cajero cuenta el
 * efectivo físico por divisa sin ver el esperado. El sistema valida el cuadre y
 * el over/short lo revisa el supervisor — aquí NO se muestra.
 */
export function CloseShiftDialog({
  open,
  onOpenChange,
  shift,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  shift: CashierShiftDto
}) {
  const currencies = Object.keys(shift.openingFloat ?? { MXN: 0 })
  const [count, setCount] = useState<Record<string, number>>({})
  const mut = useCloseShift()

  useEffect(() => {
    if (open) setCount(Object.fromEntries(currencies.map((c) => [c, 0])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shift.id])

  const submit = () =>
    mut.mutate({ shiftId: shift.id, body: { actualClose: count } }, { onSuccess: () => onOpenChange(false) })

  return (
    <CashDialogShell
      open={open}
      onOpenChange={(o) => {
        if (!mut.isPending) onOpenChange(o)
      }}
      title="Cerrar turno (entrega)"
      subtitle="Cuenta el efectivo físico por divisa y confírmalo. El sistema validará el cuadre; las diferencias las revisa tu supervisor."
    >
      <div className="space-y-4">
        <CurrencyAmountRows value={count} onChange={setCount} fixed={currencies} />
        <DialogActions
          tone="warning"
          confirmLabel="Cerrar turno"
          isPending={mut.isPending}
          onCancel={() => onOpenChange(false)}
          onConfirm={submit}
          className="pt-3 border-t border-slate-100"
        />
      </div>
    </CashDialogShell>
  )
}
