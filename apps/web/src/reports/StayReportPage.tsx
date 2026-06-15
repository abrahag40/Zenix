import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { ReportTable, type ReportColumn } from '@/components/shared/ReportTable'
import { usePropertyStore } from '@/store/property'
import { stayReportApi, type StayReportResponse, type StayRow } from './stay-report.api'

function ymd(d: Date) {
  return d.toISOString().slice(0, 10)
}
function fmtNum(n: number) {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Reporte tabular de Estadías extendidas (Estándar de Reportes). CRM/retención + export. */
export function StayReportPage() {
  const propertyId = usePropertyStore((s) => s.activePropertyId)
  const [from, setFrom] = useState(ymd(new Date(Date.now() - 30 * 86400000)))
  const [to, setTo] = useState(ymd(new Date()))
  const [currency, setCurrency] = useState<string | undefined>(undefined)
  const [source, setSource] = useState('')
  const [sort, setSort] = useState('checkIn')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  const params = { from, to, currency, source: source || undefined, sort, dir, page, pageSize: 25 }
  const { data, isLoading } = useQuery<StayReportResponse>({
    queryKey: ['report', 'stays', propertyId, params],
    queryFn: () => stayReportApi.get(params),
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  })
  const cur = data?.currency ?? currency ?? 'USD'

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('desc') }
    setPage(1)
  }

  const columns: ReportColumn<StayRow>[] = [
    { key: 'guest', header: 'Huésped', sortable: true, render: (r) => r.guest },
    { key: 'room', header: 'Hab.', sortable: true, render: (r) => r.room },
    { key: 'checkIn', header: 'Llegada', sortable: true, render: (r) => r.checkIn.slice(0, 10) },
    { key: 'checkOut', header: 'Salida', render: (r) => r.checkOut.slice(0, 10) },
    { key: 'nights', header: 'Noches extra', align: 'right', sortable: true, render: (r) => String(r.nights) },
    { key: 'revenue', header: 'Ingreso extra', align: 'right', sortable: true, render: (r) => `${fmtNum(r.revenue)} ${r.currency}` },
    { key: 'source', header: 'Canal', sortable: true, render: (r) => r.source },
    { key: 'contact', header: 'Contacto', render: (r) => r.contact ?? '—' },
  ]

  const totals = data
    ? { guest: `${data.totals.count} estadías`, nights: String(data.totals.nights), revenue: `${fmtNum(data.totals.revenue)} ${cur}` }
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
        <select value={data?.currency ?? ''} onChange={(e) => { setCurrency(e.target.value); setPage(1) }} className="h-8 rounded-md border border-slate-200 px-2 text-xs min-w-[80px]">
          {(data?.availableCurrencies?.length ? data.availableCurrencies : ['USD']).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-500 flex flex-col gap-1">
        Canal
        <select value={source} onChange={(e) => { setSource(e.target.value); setPage(1) }} className="h-8 rounded-md border border-slate-200 px-2 text-xs">
          <option value="">Todos</option>
          {(data?.availableSources ?? []).map((s) => (
            <option key={s} value={s}>{s}</option>
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
      <ReportTable<StayRow>
        title="Estadías extendidas"
        description="Huéspedes que extendieron su estadía, con noches/ingreso extra y datos de contacto para retención. Export Excel/CSV."
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
        onExport={(format) => stayReportApi.download(params, format)}
        emptyText="Sin extensiones en el período."
      />
    </div>
  )
}
