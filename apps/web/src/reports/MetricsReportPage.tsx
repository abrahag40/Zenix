import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { ReportTable, type ReportColumn } from '@/components/shared/ReportTable'
import { usePropertyStore } from '@/store/property'
import { metricsReportApi, type MetricsReportResponse, type MetricsRow } from './metrics-report.api'

function ymd(d: Date) {
  return d.toISOString().slice(0, 10)
}
function fmtNum(n: number) {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtPct(n: number) {
  return `${n.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

/** Reporte tabular de Métricas diarias (Estándar de Reportes). ADR/RevPAR/ocupación + export. */
export function MetricsReportPage() {
  const propertyId = usePropertyStore((s) => s.activePropertyId)
  const [from, setFrom] = useState(ymd(new Date(Date.now() - 30 * 86400000)))
  const [to, setTo] = useState(ymd(new Date()))
  const [sort, setSort] = useState('date')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  const params = { propertyId: propertyId ?? '', from, to, sort, dir, page, pageSize: 25 }
  const { data, isLoading } = useQuery<MetricsReportResponse>({
    queryKey: ['report', 'metrics', propertyId, params],
    queryFn: () => metricsReportApi.get(params),
    enabled: !!propertyId,
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  })
  const cur = data?.currency ?? 'USD'

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('desc') }
    setPage(1)
  }

  const columns: ReportColumn<MetricsRow>[] = [
    { key: 'date', header: 'Fecha', sortable: true, render: (r) => r.date.slice(0, 10) },
    { key: 'occupancy', header: 'Ocupación', align: 'right', sortable: true, render: (r) => fmtPct(r.occupancy) },
    { key: 'roomsSold', header: 'Hab. vendidas', align: 'right', sortable: true, render: (r) => `${r.roomsSold} / ${r.roomsAvailable}` },
    { key: 'adr', header: 'ADR', align: 'right', sortable: true, render: (r) => `${fmtNum(r.adr)} ${r.currency}` },
    { key: 'revpar', header: 'RevPAR', align: 'right', sortable: true, render: (r) => `${fmtNum(r.revpar)} ${r.currency}` },
    { key: 'revenue', header: 'Ingreso', align: 'right', sortable: true, render: (r) => `${fmtNum(r.revenue)} ${r.currency}` },
    { key: 'arrivals', header: 'Llegadas', align: 'right', sortable: true, render: (r) => r.arrivals },
    { key: 'departures', header: 'Salidas', align: 'right', sortable: true, render: (r) => r.departures },
    { key: 'cancellations', header: 'Cancel.', align: 'right', sortable: true, render: (r) => r.cancellations },
    { key: 'noShows', header: 'No-shows', align: 'right', sortable: true, render: (r) => r.noShows },
  ]

  const t = data?.totals
  const totals = t
    ? {
        date: `${t.days} días`,
        occupancy: fmtPct(t.occupancy),
        roomsSold: String(t.roomsSold),
        adr: `${fmtNum(t.adr)} ${cur}`,
        revpar: `${fmtNum(t.revpar)} ${cur}`,
        revenue: `${fmtNum(t.revenue)} ${cur}`,
        arrivals: String(t.arrivals),
        departures: String(t.departures),
        cancellations: String(t.cancellations),
        noShows: String(t.noShows),
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
    </>
  )

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <Link to="/reports" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
        <ChevronLeft className="h-3.5 w-3.5" /> Reportes
      </Link>
      <ReportTable<MetricsRow>
        title="Métricas diarias"
        description="Ocupación, ADR y RevPAR por día (USALI), con llegadas, salidas, cancelaciones y no-shows. Totales agregados. Export Excel/CSV."
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
        onExport={(format) => metricsReportApi.download(params, format)}
        emptyText="Sin métricas para el período (¿se corrió el backfill del snapshot diario?)."
      />
    </div>
  )
}
