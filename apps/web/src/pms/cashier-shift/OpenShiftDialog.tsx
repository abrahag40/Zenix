import { useEffect, useMemo, useState } from 'react'
import { ArrowRightLeft, Wallet } from 'lucide-react'
import { DialogActions } from '@/modules/rooms/components/shared/DialogActions'
import { CashDialogShell } from './CashDialogShell'
import { CurrencyAmountRows } from './CurrencyAmountRows'
import { useOpenShift, usePendingHandover } from './useCashierShift'

function fmtMoney(rec: Record<string, number>): string {
  return Object.entries(rec)
    .map(([c, n]) => `${c} ${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    .join(' · ')
}

/**
 * Abrir turno (recibir caja). Modelo gaveta compartida (D-CASH14/15):
 *  - Si hay un turno por recibir (handover pendiente) → el cajero que entra
 *    CUENTA el efectivo y lo ACEPTA; el backend valida que coincida con lo
 *    declarado por el saliente.
 *  - Si no hay handover → fondo inicial fresco (FRESH_BANK).
 */
export function OpenShiftDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const pendingQ = usePendingHandover(open)
  const pending = pendingQ.data ?? null
  const isHandover = !!pending
  const handoverCurrencies = useMemo(
    () => (pending ? Object.keys(pending.declaredClose) : []),
    [pending],
  )

  const [float, setFloat] = useState<Record<string, number>>({ MXN: 0 })
  const mut = useOpenShift()

  // Semilla del conteo: en handover, las divisas declaradas (en 0, el cajero cuenta);
  // en fresco, MXN. Re-siembra cuando el handover llega o cambia.
  useEffect(() => {
    if (!open) return
    if (isHandover) setFloat(Object.fromEntries(handoverCurrencies.map((c) => [c, 0])))
    else setFloat({ MXN: 0 })
  }, [open, isHandover, handoverCurrencies])

  const submit = () =>
    mut.mutate(
      isHandover
        ? { openingFloat: float, openingSource: 'HANDOVER', handoverFromShiftId: pending!.id }
        : { openingFloat: float, openingSource: 'FRESH_BANK' },
      { onSuccess: () => onOpenChange(false) },
    )

  return (
    <CashDialogShell
      open={open}
      onOpenChange={(o) => {
        if (!mut.isPending) onOpenChange(o)
      }}
      title={isHandover ? 'Recibir caja del turno anterior' : 'Abrir turno de caja'}
      subtitle={
        isHandover
          ? `Cuenta el efectivo y acéptalo. Al confirmar quedas como responsable de la caja.`
          : 'Cuenta y registra el fondo inicial con el que recibes la caja. Lo entregarás al cerrar el turno.'
      }
    >
      <div className="space-y-4">
        {isHandover ? (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-sky-700 uppercase tracking-wider">
              <ArrowRightLeft className="h-3.5 w-3.5" /> Entrega de {pending!.cashier.name}
            </div>
            <p className="text-sm text-sky-900 tabular-nums mt-1">Declaró: {fmtMoney(pending!.declaredClose)}</p>
            <p className="text-[11px] text-sky-700 mt-1">
              Cuenta físicamente y captura lo recibido. Si no coincide, recuenta o llama a tu supervisor antes de aceptar.
            </p>
          </div>
        ) : null}

        <CurrencyAmountRows value={float} onChange={setFloat} fixed={isHandover ? handoverCurrencies : undefined} />

        <DialogActions
          tone="primary"
          confirmLabel={isHandover ? 'Aceptar y abrir turno' : 'Abrir turno'}
          confirmIcon={isHandover ? ArrowRightLeft : Wallet}
          isPending={mut.isPending}
          onCancel={() => onOpenChange(false)}
          onConfirm={submit}
          className="pt-3 border-t border-slate-100"
        />
      </div>
    </CashDialogShell>
  )
}
