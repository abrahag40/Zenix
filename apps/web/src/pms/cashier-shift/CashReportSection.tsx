import { useState } from 'react'
import { ClipboardCheck, Download, Scale } from 'lucide-react'
import { StaffRole, type CashierShiftDto } from '@zenix/shared'
import { useAuthStore } from '@/store/auth'
import { usePropertyStore } from '@/store/property'
import { cashierShiftApi } from './cashier-shift.api'
import { useCashSummary, useShiftList } from './useCashierShift'
import { ShiftReportDialog } from './ShiftReportDialog'
import { SpotCountDialog } from './SpotCountDialog'
import { ReconcileDialog } from './ReconcileDialog'

function ymd(d: Date) {
  return d.toISOString().slice(0, 10)
}
function money(rec: Record<string, number> | null | undefined): string {
  if (!rec || Object.keys(rec).length === 0) return '—'
  return Object.entries(rec)
    .map(([c, n]) => `${c} ${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    .join(' · ')
}
const STATUS_STYLE: Record<string, string> = {
  OPEN: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-amber-100 text-amber-700',
  RECONCILED: 'bg-slate-100 text-slate-600',
  DISPUTED: 'bg-rose-100 text-rose-700',
}

/** Tab "Caja" en /reports — Cashier Shift Report + resumen diario + acciones del
 *  supervisor (arqueo spot, conciliar). El cajero ve sus turnos sin over/short (R3). */
export function CashReportSection() {
  const role = useAuthStore((s) => s.user?.role)
  const isSupervisor = role === StaffRole.SUPERVISOR
  const propertyId = usePropertyStore((s) => s.activePropertyId)

  const today = ymd(new Date())
  const weekAgo = ymd(new Date(Date.now() - 7 * 86400000))
  const [from, setFrom] = useState(weekAgo)
  const [to, setTo] = useState(today)
  const [summaryDate, setSummaryDate] = useState(today)
  const [filter, setFilter] = useState<'' | 'overages' | 'shortages'>('')

  const list = useShiftList({ from: `${from}T00:00:00.000Z`, to: `${to}T23:59:59.000Z` })
  const summary = useCashSummary(summaryDate, filter || undefined)

  const [reportShift, setReportShift] = useState<string | null>(null)
  const [spotShift, setSpotShift] = useState<CashierShiftDto | null>(null)
  const [reconcileShift, setReconcileShift] = useState<CashierShiftDto | null>(null)

  return (
    <div className="space-y-6">
      {/* Resumen del día — SUPERVISOR */}
      {isSupervisor ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold text-slate-800">Resumen de caja del día</h3>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={summaryDate}
                onChange={(e) => setSummaryDate(e.target.value)}
                className="h-8 rounded-md border border-slate-200 px-2 text-xs"
              />
              <button
                type="button"
                onClick={() => propertyId && cashierShiftApi.downloadSummaryCsv(propertyId, summaryDate, filter || undefined)}
                className="h-8 inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
            </div>
          </div>
          <div className="flex gap-1.5 mb-3">
            {([['', 'Todos'], ['overages', 'Sobrantes'], ['shortages', 'Faltantes']] as const).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`h-7 px-3 rounded-full text-xs font-medium border transition-colors ${
                  filter === k ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          {summary.isLoading ? (
            <p className="text-sm text-slate-400">Cargando…</p>
          ) : summary.data ? (
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Por método y divisa</p>
                {summary.data.byCurrencyMethod.length === 0 ? (
                  <p className="text-sm text-slate-400">Sin pagos.</p>
                ) : (
                  summary.data.byCurrencyMethod.map((e, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-slate-600">{e.method} · {e.currency}</span>
                      <span className="tabular-nums text-slate-800">{e.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))
                )}
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Por cajero</p>
                {summary.data.byCollector.length === 0 ? (
                  <p className="text-sm text-slate-400">Sin pagos.</p>
                ) : (
                  summary.data.byCollector.map((c, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-slate-600">{c.collectorName} · {c.currency}</span>
                      <span className="tabular-nums text-slate-800">{c.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Turnos */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-slate-800">Turnos de caja</h3>
          <div className="flex items-center gap-1.5 text-xs">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2" />
            <span className="text-slate-400">→</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2" />
          </div>
        </div>
        {list.isLoading ? (
          <p className="text-sm text-slate-400">Cargando…</p>
        ) : !list.data?.length ? (
          <p className="text-sm text-slate-400 py-6 text-center">Sin turnos en el rango.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left border-b border-slate-100">
                  <th className="py-2 pr-3">Apertura</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2 pr-3">Fondo</th>
                  {isSupervisor ? <th className="py-2 pr-3">Diferencia</th> : null}
                  <th className="py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((s) => (
                  <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="py-2 pr-3 text-slate-700 tabular-nums">{new Date(s.openedAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLE[s.status] ?? 'bg-slate-100 text-slate-600'}`}>{s.status}</span>
                    </td>
                    <td className="py-2 pr-3 text-slate-600 tabular-nums">{money(s.openingFloat)}</td>
                    {isSupervisor ? (
                      <td className="py-2 pr-3 tabular-nums text-slate-700">{s.variance ? money(s.variance) : '—'}</td>
                    ) : null}
                    <td className="py-2 text-right whitespace-nowrap">
                      <button onClick={() => setReportShift(s.id)} className="text-xs font-medium text-emerald-700 hover:text-emerald-800 px-1.5">Ver</button>
                      {isSupervisor && s.status === 'OPEN' ? (
                        <button onClick={() => setSpotShift(s)} title="Arqueo sorpresa" className="text-xs font-medium text-slate-500 hover:text-slate-700 px-1.5 inline-flex items-center gap-1">
                          <ClipboardCheck className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      {isSupervisor && s.status === 'CLOSED' ? (
                        <button onClick={() => setReconcileShift(s)} title="Conciliar" className="text-xs font-medium text-amber-700 hover:text-amber-800 px-1.5 inline-flex items-center gap-1">
                          <Scale className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ShiftReportDialog open={!!reportShift} onOpenChange={(o) => !o && setReportShift(null)} shiftId={reportShift} />
      {spotShift ? (
        <SpotCountDialog
          open={!!spotShift}
          onOpenChange={(o) => !o && setSpotShift(null)}
          shiftId={spotShift.id}
          currencies={Object.keys(spotShift.openingFloat ?? {})}
        />
      ) : null}
      {reconcileShift ? (
        <ReconcileDialog
          open={!!reconcileShift}
          onOpenChange={(o) => !o && setReconcileShift(null)}
          shiftId={reconcileShift.id}
          variance={reconcileShift.variance ?? null}
        />
      ) : null}
    </div>
  )
}
