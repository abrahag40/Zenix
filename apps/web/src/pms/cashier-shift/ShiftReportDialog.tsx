import { Download, Printer } from 'lucide-react'
import { CashDialogShell } from './CashDialogShell'
import { cashierShiftApi } from './cashier-shift.api'
import { useShiftReport } from './useCashierShift'

function money(rec: Record<string, number> | null | undefined): string {
  if (!rec || Object.keys(rec).length === 0) return '—'
  return Object.entries(rec)
    .map(([c, n]) => `${c} ${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    .join(' · ')
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      <span className="text-sm tabular-nums text-slate-800 text-right">{value}</span>
    </div>
  )
}

/** Detalle del Cashier Shift Report (D-CASH7). El bloque de reconciliación llega
 *  null para el cajero (R3) y completo para el supervisor. */
export function ShiftReportDialog({
  open,
  onOpenChange,
  shiftId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  shiftId: string | null
}) {
  const { data: r, isLoading } = useShiftReport(open ? shiftId : null)

  return (
    <CashDialogShell open={open} onOpenChange={onOpenChange} title="Reporte de turno de caja" maxW="max-w-lg">
      {isLoading || !r ? (
        <p className="text-sm text-slate-500 py-6 text-center">Cargando…</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 p-3">
            <Row label="Cajero" value={r.shift.cashier?.name ?? '—'} />
            <Row label="Estado" value={r.shift.status} />
            <Row label="Abierto" value={new Date(r.shift.openedAt).toLocaleString('es-MX')} />
            <Row label="Cerrado" value={r.shift.closedAt ? new Date(r.shift.closedAt).toLocaleString('es-MX') : '—'} />
            <Row label="Fondo de apertura" value={money(r.shift.openingFloat)} />
            {r.shift.openingAcceptedBy ? <Row label="Recibido por" value={r.shift.openingAcceptedBy.name} /> : null}
          </div>

          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Pagos por método y divisa</p>
            {r.payments.byMethodCurrency.length === 0 ? (
              <p className="text-sm text-slate-400">Sin pagos.</p>
            ) : (
              <div className="space-y-0.5">
                {r.payments.byMethodCurrency.map((p, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-slate-600">{p.method} · {p.currency}</span>
                    <span className="tabular-nums text-slate-800">
                      {p.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })} <span className="text-slate-400">×{p.count}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {r.movements.length > 0 ? (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Movimientos</p>
              <div className="space-y-0.5">
                {r.movements.map((m) => (
                  <div key={m.id} className="flex justify-between text-sm">
                    <span className="text-slate-600">{m.type} · {m.currency}{m.notes ? ` — ${m.notes}` : ''}</span>
                    <span className={`tabular-nums ${m.amount < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                      {m.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {r.reconciliation ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Arqueo (over/short)</p>
              <Row label="Esperado" value={money(r.reconciliation.expected)} />
              <Row label="Contado" value={money(r.reconciliation.actual)} />
              <Row label="Diferencia" value={money(r.reconciliation.variance)} />
              {r.reconciliation.varianceReason ? <Row label="Razón" value={r.reconciliation.varianceReason} /> : null}
              {r.reconciliation.reconciledBy ? <Row label="Conciliado por" value={r.reconciliation.reconciledBy.name} /> : null}
            </div>
          ) : null}

          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <Printer className="h-3.5 w-3.5" /> Imprimir
            </button>
            <button
              type="button"
              onClick={() => cashierShiftApi.downloadShiftCsv(r.shift.id)}
              className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>
        </div>
      )}
    </CashDialogShell>
  )
}
