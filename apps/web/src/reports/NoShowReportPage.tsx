import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { ReportTable, type ReportColumn } from '@/components/shared/ReportTable'
import { usePropertyStore } from '@/store/property'
import { noShowReportApi, type NoShowReportResponse, type NoShowRow } from './no-show-report.api'

function ymd(d: Date) {
  return d.toISOString().slice(0, 10)
}
function fmtNum(n: number) {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const STATUS_LABEL: Record<string, string> = {
  NOT_APPLICABLE: 'No aplica', PENDING: 'Pendiente', CHARGED: 'Cobrado', FAILED: 'Fallido', WAIVED: 'Condonado',
}
const STATUS_STYLE: Record<string, string> = {
  CHARGED: 'bg-emerald-100 text-emerald-700', PENDING: 'bg-amber-100 text-amber-700',
  FAILED: 'bg-rose-100 text-rose-700', WAIVED: 'bg-slate-100 text-slate-600', NOT_APPLICABLE: 'bg-slate-100 text-slate-500',
}

/** Reporte tabular de No-shows (Estándar de Reportes). Lista auditada + export. */
export function NoShowReportPage() {
  const propertyId = usePropertyStore((s) => s.activePropertyId)
  const [from, setFrom] = useState(ymd(new Date(Date.now() - 30 * 86400000)))
  const [to, setTo] = useState(ymd(new Date()))
  const [currency, setCurrency] = useState<string | undefined>(undefined)
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('noShowAt')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  const params = { from, to, currency, status: status || undefined, sort, dir, page, pageSize: 25 }
  const { data, isLoading } = useQuery<NoShowReportResponse>({
    queryKey: ['report', 'no-shows', propertyId, params],
    queryFn: () => noShowReportApi.get(params),
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  })
  const cur = data?.currency ?? currency ?? 'MXN'

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('desc') }
    setPage(1)
  }

  const columns: ReportColumn<NoShowRow>[] = [
    { key: 'noShowAt', header: 'Marcado', sortable: true, render: (r) => r.noShowAt.slice(0, 10) },
    { key: 'guest', header: 'Huésped', sortable: true, render: (r) => r.guest },
    { key: 'room', header: 'Hab.', sortable: true, render: (r) => r.room },
    { key: 'scheduledCheckin', header: 'Llegada', render: (r) => r.scheduledCheckin.slice(0, 10) },
    { key: 'source', header: 'Canal', sortable: true, render: (r) => r.source },
    {
      key: 'fee',
      header: 'Cargo',
      align: 'right',
      sortable: true,
      render: (r) => (r.feeCurrency ? `${fmtNum(r.fee)} ${r.feeCurrency}` : '—'),
    },
    {
      key: 'chargeStatus',
      header: 'Estado cargo',
      sortable: true,
      render: (r) =>
        r.chargeStatus ? (
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLE[r.chargeStatus] ?? 'bg-slate-100 text-slate-600'}`}>
            {STATUS_LABEL[r.chargeStatus] ?? r.chargeStatus}
          </span>
        ) : '—',
    },
    { key: 'markedBy', header: 'Marcado por', render: (r) => r.markedBy ?? '—' },
  ]

  const totals = data ? { guest: `${data.totals.count} no-shows`, fee: `${fmtNum(data.totals.fee)} ${cur}` } : undefined

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
        Divisa (cargo)
        <select value={data?.currency ?? ''} onChange={(e) => { setCurrency(e.target.value); setPage(1) }} className="h-8 rounded-md border border-slate-200 px-2 text-xs min-w-[80px]">
          {(data?.availableCurrencies?.length ? data.availableCurrencies : ['MXN']).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-500 flex flex-col gap-1">
        Estado cargo
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="h-8 rounded-md border border-slate-200 px-2 text-xs">
          <option value="">Todos</option>
          {(data?.availableStatuses ?? []).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>
          ))}
        </select>
      </label>
    </>
  )

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <Link to="/reports" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
        <ChevronLeft className="h-3.5 w-3.5" /> Reportes
      </Link>
      <ReportTable<NoShowRow>
        title="No-shows"
        description="Reservas no presentadas, con cargo, estado y quién lo marcó. Evidencia para chargeback. Export Excel/CSV."
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
        onExport={(format) => noShowReportApi.download(params, format)}
        emptyText="Sin no-shows en el período."
      />
    </div>
  )
}
