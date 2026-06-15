import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { ReportTable, type ReportColumn } from '@/components/shared/ReportTable'
import { usePropertyStore } from '@/store/property'
import { cashierShiftApi } from './cashier-shift.api'
import { useCashSummary } from './useCashierShift'

function ymd(d: Date) {
  return d.toISOString().slice(0, 10)
}
function fmtNum(n: number) {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const METHOD_LABEL: Record<string, string> = {
  CASH: 'Efectivo', CARD_TERMINAL: 'Terminal', BANK_TRANSFER: 'Transferencia', OTA_PREPAID: 'OTA prepago', COMP: 'Cortesía',
}

type MethodRow = { id: string; currency: string; method: string; total: number; count: number }
type CollectorRow = { id: string; collectorName: string; currency: string; total: number; count: number }

/** Resumen diario de caja como reporte (Estándar de Reportes). Pivots por método/divisa y por cajero. */
export function CashSummaryReportPage() {
  const propertyId = usePropertyStore((s) => s.activePropertyId)
  const [date, setDate] = useState(ymd(new Date()))
  const { data, isLoading } = useCashSummary(date)

  const methodRows: MethodRow[] = (data?.byCurrencyMethod ?? []).map((e) => ({
    id: `${e.currency}-${e.method}`,
    currency: e.currency,
    method: e.method,
    total: e.total,
    count: e.count,
  }))
  const collectorRows: CollectorRow[] = (data?.byCollector ?? []).map((c) => ({
    id: `${c.collectedById}-${c.currency}`,
    collectorName: c.collectorName,
    currency: c.currency,
    total: c.total,
    count: c.count,
  }))

  const methodCols: ReportColumn<MethodRow>[] = [
    { key: 'currency', header: 'Divisa', render: (r) => r.currency },
    { key: 'method', header: 'Método', render: (r) => METHOD_LABEL[r.method] ?? r.method },
    { key: 'total', header: 'Total', align: 'right', render: (r) => fmtNum(r.total) },
    { key: 'count', header: 'Movimientos', align: 'right', render: (r) => String(r.count) },
  ]
  const collectorCols: ReportColumn<CollectorRow>[] = [
    { key: 'collectorName', header: 'Cajero', render: (r) => r.collectorName },
    { key: 'currency', header: 'Divisa', render: (r) => r.currency },
    { key: 'total', header: 'Total', align: 'right', render: (r) => fmtNum(r.total) },
    { key: 'count', header: 'Movimientos', align: 'right', render: (r) => String(r.count) },
  ]

  const dateFilter = (
    <label className="text-xs text-slate-500 flex flex-col gap-1">
      Día
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-xs" />
    </label>
  )

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <Link to="/reports" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
        <ChevronLeft className="h-3.5 w-3.5" /> Reportes
      </Link>

      <ReportTable<MethodRow>
        title="Resumen de caja del día · por método y divisa"
        description="Totales del día por método de pago y divisa. Descarga a Excel/CSV para tu contabilidad."
        columns={methodCols}
        rows={methodRows}
        loading={isLoading}
        total={methodRows.length}
        page={1}
        pageSize={1000}
        onPage={() => {}}
        filters={dateFilter}
        emptyText="Sin pagos registrados ese día."
        onExport={(format) => propertyId && cashierShiftApi.downloadSummaryExport(propertyId, date, format)}
      />

      <ReportTable<CollectorRow>
        title="Por cajero"
        columns={collectorCols}
        rows={collectorRows}
        loading={isLoading}
        total={collectorRows.length}
        page={1}
        pageSize={1000}
        onPage={() => {}}
        emptyText="Sin pagos registrados ese día."
      />
    </div>
  )
}
