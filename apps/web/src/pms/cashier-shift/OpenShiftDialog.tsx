import { useEffect, useState } from 'react'
import { Wallet } from 'lucide-react'
import { DialogActions } from '@/modules/rooms/components/shared/DialogActions'
import { CashDialogShell } from './CashDialogShell'
import { CurrencyAmountRows } from './CurrencyAmountRows'
import { useOpenShift } from './useCashierShift'

/**
 * Abrir turno (recibir caja). Sprint 4 — fondo inicial per-divisa (FRESH_BANK).
 * El flujo de HANDOVER (aceptar el cierre del turno anterior) se habilita cuando
 * se agregue el endpoint "último turno cerrado de la propiedad" (S5).
 */
export function OpenShiftDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [float, setFloat] = useState<Record<string, number>>({ MXN: 0 })
  const mut = useOpenShift()

  useEffect(() => {
    if (open) setFloat({ MXN: 0 })
  }, [open])

  const submit = () =>
    mut.mutate(
      { openingFloat: float, openingSource: 'FRESH_BANK' },
      { onSuccess: () => onOpenChange(false) },
    )

  return (
    <CashDialogShell
      open={open}
      onOpenChange={(o) => {
        if (!mut.isPending) onOpenChange(o)
      }}
      title="Abrir turno de caja"
      subtitle="Cuenta y registra el fondo inicial con el que recibes la caja. Lo entregarás al cerrar el turno."
    >
      <div className="space-y-4">
        <CurrencyAmountRows value={float} onChange={setFloat} />
        <DialogActions
          tone="primary"
          confirmLabel="Abrir turno"
          confirmIcon={Wallet}
          isPending={mut.isPending}
          onCancel={() => onOpenChange(false)}
          onConfirm={submit}
          className="pt-3 border-t border-slate-100"
        />
      </div>
    </CashDialogShell>
  )
}
