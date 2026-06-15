import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { ReportTable, type ReportColumn } from '@/components/shared/ReportTable'
import { cashierShiftApi, type ShiftsReportRow } from './cashier-shift.api'
import { useShiftsReport } from './useCashierShift'
import { ShiftReportDialog } from './ShiftReportDialog'

function ymd(d: Date) {
  return d.toISOString().slice(0, 10)
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
}
function fmtNum(n: number | null) {
  if (n == null) return '—'
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const STATUS_STYLE: Record<string, string> = {
  OPEN: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-amber-100 text-amber-700',
  RECONCILED: 'bg-slate-100 text-slate-600',
  DISPUTED: 'bg-rose-100 text-rose-700',
}

/** Reporte tabular de Turnos de caja (Estándar de Reportes). Per-divisa SUM-able. */
export function CashShiftsReportPage() {
  const [from, setFrom] = useState(ymd(new Date(Date.now() - 30 * 86400000)))
  const [to, setTo] = useState(ymd(new Date()))
  const [currency, setCurrency] = useState<string | undefined>(undefined)
  const [status, setStatus] = useState<string>('')
  const [sort, setSort] = useState('openedAt')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [drill, setDrill] = useState<string | null>(null)

  const params = {
    from: `${from}T00:00:00.000Z`,
    to: `${to}T23:59:59.000Z`,
    currency,
    status: status || undefined,
    sort,
    dir,
    page,
    pageSize: 25,
  }
  const { data, isLoading } = useShiftsReport(params)
  const cur = data?.currency ?? currency ?? 'MXN'

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('desc') }
    setPage(1)
  }

  const columns: ReportColumn<ShiftsReportRow>[] = [
    { key: 'openedAt', header: 'Apertura', sortable: true, render: (r) => fmtDate(r.openedAt) },
    { key: 'closedAt', header: 'Cierre', render: (r) => fmtDate(r.closedAt) },
    { key: 'cashier', header: 'Cajero', sortable: true, render: (r) => r.cashier },
    {
      key: 'status',
      header: 'Estado',
      sortable: true,
      render: (r) => (
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLE[r.status] ?? 'bg-slate-100 text-slate-600'}`}>
          {r.status}
        </span>
      ),
    },
    { key: 'opening', header: `Fondo (${cur})`, align: 'right', sortable: true, render: (r) => fmtNum(r.opening) },
    { key: 'expected', header: `Esperado (${cur})`, align: 'right', sortable: true, render: (r) => fmtNum(r.expected) },
    { key: 'actual', header: `Contado (${cur})`, align: 'right', sortable: true, render: (r) => fmtNum(r.actual) },
    {
      key: 'variance',
      header: `Diferencia (${cur})`,
      align: 'right',
      sortable: true,
      render: (r) => <span className={r.variance != null && r.variance < 0 ? 'text-rose-600' : ''}>{fmtNum(r.variance)}</span>,
    },
    { key: 'reconciledBy', header: 'Conciliado por', render: (r) => r.reconciledBy ?? '—' },
  ]

  const totals = data
    ? {
        opening: fmtNum(data.totals.opening),
        expected: fmtNum(data.totals.expected),
        actual: fmtNum(data.totals.actual),
        variance: fmtNum(data.totals.variance),
      }
    : undefined

  const filters = (
    <>
      <label className="text-xs text-slate-500 flex flex-col gap-1">
        Desde
        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} className="h-8 rounded-md border border-slate-200 px-2 text-xs" />
      </label>
      <label className="text-xs text-slate-500 flex flex-col gap-1">
        Hasta
        <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} className="h-8 rounded-md border border-slate-200 px-2 text-xs" />
      </label>
      <label className="text-xs text-slate-500 flex flex-col gap-1">
        Divisa
        <select
          value={data?.currency ?? ''}
          onChange={(e) => { setCurrency(e.target.value); setPage(1) }}
          className="h-8 rounded-md border border-slate-200 px-2 text-xs min-w-[80px]"
        >
          {(data?.availableCurrencies?.length ? data.availableCurrencies : ['MXN']).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-500 flex flex-col gap-1">
        Estado
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="h-8 rounded-md border border-slate-200 px-2 text-xs">
          <option value="">Todos</option>
          <option value="OPEN">Abierto</option>
          <option value="CLOSED">Por conciliar</option>
          <option value="RECONCILED">Conciliado</option>
          <option value="DISPUTED">Disputado</option>
        </select>
      </label>
    </>
  )

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <Link to="/reports" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
        <ChevronLeft className="h-3.5 w-3.5" /> Reportes
      </Link>
      <ReportTable<ShiftsReportRow>
        title="Turnos de caja"
        description="Arqueo por turno de recepción. Filtra por divisa para totales sumables; descarga a Excel/CSV para tu contabilidad."
        columns={columns}
        rows={data?.rows ?? []}
        loading={isLoading}
        total={data?.total ?? 0}
        page={page}
        pageSize={25}
        onPage={setPage}
        sort={sort}
        dir={dir}
        onSort={onSort}
        totals={totals}
        filters={filters}
        onExport={(format) => cashierShiftApi.downloadShiftsExport(params, format)}
        onRowClick={(r) => setDrill(r.id)}
      />
      <ShiftReportDialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)} shiftId={drill} />
    </div>
  )
}
