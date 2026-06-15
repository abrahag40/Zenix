import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { ReportTable, type ReportColumn } from '@/components/shared/ReportTable'
import { cashierShiftApi, type TransactionRow } from './cashier-shift.api'
import { useTransactionsReport } from './useCashierShift'

function ymd(d: Date) {
  return d.toISOString().slice(0, 10)
}
function fmtNum(n: number) {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const METHOD_LABEL: Record<string, string> = {
  CASH: 'Efectivo',
  CARD_TERMINAL: 'Terminal',
  BANK_TRANSFER: 'Transferencia',
  OTA_PREPAID: 'OTA prepago',
  COMP: 'Cortesía',
}

/** Reporte tabular de Movimientos (transacciones / PaymentLog) — Transaction Report USALI. */
export function CashTransactionsReportPage() {
  const [from, setFrom] = useState(ymd(new Date(Date.now() - 30 * 86400000)))
  const [to, setTo] = useState(ymd(new Date()))
  const [currency, setCurrency] = useState<string | undefined>(undefined)
  const [method, setMethod] = useState('')
  const [sort, setSort] = useState('date')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  const params = {
    from: `${from}T00:00:00.000Z`,
    to: `${to}T23:59:59.000Z`,
    currency,
    method: method || undefined,
    sort,
    dir,
    page,
    pageSize: 25,
  }
  const { data, isLoading } = useTransactionsReport(params)
  const cur = data?.currency ?? currency ?? 'MXN'

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('desc') }
    setPage(1)
  }

  const columns: ReportColumn<TransactionRow>[] = [
    { key: 'date', header: 'Fecha', sortable: true, render: (r) => r.date.slice(0, 10) },
    { key: 'bookingRef', header: 'Reserva', render: (r) => r.bookingRef ?? '—' },
    { key: 'guest', header: 'Huésped', sortable: true, render: (r) => r.guest },
    { key: 'method', header: 'Método', sortable: true, render: (r) => METHOD_LABEL[r.method] ?? r.method },
    {
      key: 'amount',
      header: `Monto (${cur})`,
      align: 'right',
      sortable: true,
      render: (r) => <span className={r.isVoid || r.amount < 0 ? 'text-rose-600' : ''}>{fmtNum(r.amount)}</span>,
    },
    { key: 'reference', header: 'Referencia', render: (r) => r.reference ?? '—' },
    { key: 'cashier', header: 'Cajero', sortable: true, render: (r) => r.cashier },
    { key: 'isVoid', header: 'Anulado', render: (r) => (r.isVoid ? 'Sí' : '') },
  ]

  const totals = data ? { amount: fmtNum(data.totals.amount) } : undefined

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
          {(data?.availableCurrencies?.length ? data.availableCurrencies : ['MXN']).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-500 flex flex-col gap-1">
        Método
        <select value={method} onChange={(e) => { setMethod(e.target.value); setPage(1) }} className="h-8 rounded-md border border-slate-200 px-2 text-xs">
          <option value="">Todos</option>
          {(data?.availableMethods ?? []).map((m) => (
            <option key={m} value={m}>{METHOD_LABEL[m] ?? m}</option>
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
      <ReportTable<TransactionRow>
        title="Movimientos de caja"
        description="Cada pago, anticipo y anulación. Filtra por divisa/método; descarga a Excel/CSV para tu contabilidad."
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
        onExport={(format) => cashierShiftApi.downloadTransactionsExport(params, format)}
      />
    </div>
  )
}
