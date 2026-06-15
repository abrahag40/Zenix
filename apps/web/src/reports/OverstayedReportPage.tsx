import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { ReportTable, type ReportColumn } from '@/components/shared/ReportTable'
import { usePropertyStore } from '@/store/property'
import { overstayedReportApi, type OverstayedReportResponse, type OverstayedRow } from './overstayed-report.api'

function fmtNum(n: number) {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const PAYMENT_LABEL: Record<string, string> = {
  PAID: 'Pagado', PARTIAL: 'Parcial', PENDING: 'Pendiente', UNPAID: 'Sin pagar', REFUNDED: 'Reembolsado',
}
const PAYMENT_STYLE: Record<string, string> = {
  PAID: 'bg-emerald-100 text-emerald-700', PARTIAL: 'bg-amber-100 text-amber-700',
  PENDING: 'bg-amber-100 text-amber-700', UNPAID: 'bg-rose-100 text-rose-700', REFUNDED: 'bg-slate-100 text-slate-600',
}

/** Reporte tabular de Saldos vencidos / overstayed (Estándar de Reportes). Snapshot al día + export. */
export function OverstayedReportPage() {
  const propertyId = usePropertyStore((s) => s.activePropertyId)
  const [currency, setCurrency] = useState<string | undefined>(undefined)
  const [sort, setSort] = useState('scheduledCheckout')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)

  const params = { currency, sort, dir, page, pageSize: 25 }
  const { data, isLoading } = useQuery<OverstayedReportResponse>({
    queryKey: ['report', 'overstayed', propertyId, params],
    queryFn: () => overstayedReportApi.get(params),
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  })
  const cur = data?.currency ?? currency ?? 'MXN'

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('desc') }
    setPage(1)
  }

  const columns: ReportColumn<OverstayedRow>[] = [
    { key: 'guest', header: 'Huésped', sortable: true, render: (r) => r.guest },
    { key: 'room', header: 'Hab.', sortable: true, render: (r) => r.room },
    { key: 'scheduledCheckout', header: 'Salida programada', sortable: true, render: (r) => r.scheduledCheckout.slice(0, 10) },
    {
      key: 'hoursOverdue',
      header: 'Vencido',
      align: 'right',
      sortable: true,
      render: (r) => (r.daysOverdue >= 1 ? `${r.daysOverdue} d` : `${r.hoursOverdue} h`),
    },
    { key: 'balance', header: 'Saldo', align: 'right', sortable: true, render: (r) => `${fmtNum(r.balance)} ${r.currency}` },
    { key: 'source', header: 'Canal', render: (r) => r.source },
    {
      key: 'paymentStatus',
      header: 'Pago',
      render: (r) => (
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${PAYMENT_STYLE[r.paymentStatus] ?? 'bg-slate-100 text-slate-600'}`}>
          {PAYMENT_LABEL[r.paymentStatus] ?? r.paymentStatus}
        </span>
      ),
    },
    { key: 'contact', header: 'Contacto', render: (r) => r.contact || '—' },
  ]

  const totals = data ? { guest: `${data.totals.count} vencidos`, balance: `${fmtNum(data.totals.balance)} ${cur}` } : undefined

  const filters = (
    <label className="text-xs text-slate-500 flex flex-col gap-1">
      Divisa (saldo)
      <select value={data?.currency ?? ''} onChange={(e) => { setCurrency(e.target.value); setPage(1) }} className="h-8 rounded-md border border-slate-200 px-2 text-xs min-w-[80px]">
        {(data?.availableCurrencies?.length ? data.availableCurrencies : ['MXN']).map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <Link to="/reports" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
        <ChevronLeft className="h-3.5 w-3.5" /> Reportes
      </Link>
      <ReportTable<OverstayedRow>
        title="Saldos vencidos"
        description="Reservas con salida programada vencida y sin checkout confirmado (zombie), con su saldo pendiente. Contabilidad cobra/concilia desde aquí. Export Excel/CSV."
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
        onExport={(format) => overstayedReportApi.download(params, format)}
        emptyText="Sin saldos vencidos. Todas las salidas están confirmadas."
      />
    </div>
  )
}
