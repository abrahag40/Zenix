import { api } from '@/api/client'
import { useAuthStore } from '@/store/auth'
import type {
  CashDailySummaryDto,
  CashierShiftDto,
  CashierShiftReportDto,
  CashMovementDto,
} from '@zenix/shared'

/**
 * Cliente HTTP de Caja / Turnos (Sprint CASH-DRAWER-REPORTS S4). El propertyId NO
 * viaja en el body — el backend lo deriva del JWT (tenant context). El cajero opera
 * su turno en la propiedad activa de su sesión.
 */

export interface OpenShiftBody {
  openingFloat: Record<string, number>
  openingSource?: 'FRESH_BANK' | 'SAFE' | 'HANDOVER'
  handoverFromShiftId?: string
}

export interface CloseShiftBody {
  actualClose: Record<string, number>
  witnessId?: string
}

export interface AddMovementBody {
  type: string
  currency: string
  amount: number
  direction?: 'IN' | 'OUT'
  notes?: string
}

export interface ReconcileBody {
  decision: 'RECONCILED' | 'DISPUTED'
  varianceReason: string
}

export interface RecordSpotCountBody {
  counted: Record<string, number>
  witnessId?: string
  notes?: string
}

export interface ShiftListParams {
  from?: string
  to?: string
  status?: string
}

export interface ShiftsReportParams {
  from: string
  to: string
  currency?: string
  status?: string
  sort?: string
  dir?: string
  page?: number
  pageSize?: number
}

export interface ShiftsReportRow {
  id: string
  openedAt: string
  closedAt: string | null
  cashier: string
  status: string
  opening: number
  expected: number | null
  actual: number | null
  variance: number | null
  reconciledBy: string | null
}

export interface ShiftsReportResponse {
  rows: ShiftsReportRow[]
  total: number
  totals: { opening: number; expected: number; actual: number; variance: number }
  currency: string
  availableCurrencies: string[]
  sort: string
  dir: string
  page: number
  pageSize: number
}

function shiftsReportQs(p: ShiftsReportParams): string {
  const q = new URLSearchParams()
  q.set('from', p.from)
  q.set('to', p.to)
  if (p.currency) q.set('currency', p.currency)
  if (p.status) q.set('status', p.status)
  if (p.sort) q.set('sort', p.sort)
  if (p.dir) q.set('dir', p.dir)
  if (p.page) q.set('page', String(p.page))
  if (p.pageSize) q.set('pageSize', String(p.pageSize))
  return q.toString()
}

/** Descarga un CSV autenticado (Blob) — `fetch` directo porque el `api` client
 *  parsea JSON. Misma resolución de base que el client (dev: relativo + proxy). */
async function downloadCsv(path: string, filename: string): Promise<void> {
  const base = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL ?? '')
  const token = useAuthStore.getState().token
  const res = await fetch(`${base}/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error('No se pudo descargar el CSV')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export interface PendingHandover {
  id: string
  cashier: { id: string; name: string }
  closedAt: string | null
  status: string
  declaredClose: Record<string, number>
}

export const cashierShiftApi = {
  current: () => api.get<CashierShiftDto | null>('/v1/cashier-shifts/current'),
  pendingHandover: () => api.get<PendingHandover | null>('/v1/cashier-shifts/pending-handover'),
  open: (body: OpenShiftBody) => api.post<CashierShiftDto>('/v1/cashier-shifts', body),
  close: (shiftId: string, body: CloseShiftBody) =>
    api.post<{ id: string; status: string }>(`/v1/cashier-shifts/${shiftId}/close`, body),
  addMovement: (shiftId: string, body: AddMovementBody) =>
    api.post<CashMovementDto>(`/v1/cashier-shifts/${shiftId}/movements`, body),
  list: (params?: ShiftListParams) => {
    const q = new URLSearchParams()
    if (params?.from) q.set('from', params.from)
    if (params?.to) q.set('to', params.to)
    if (params?.status) q.set('status', params.status)
    const qs = q.toString()
    return api.get<CashierShiftDto[]>(`/v1/cashier-shifts${qs ? `?${qs}` : ''}`)
  },
  reconcile: (shiftId: string, body: ReconcileBody) =>
    api.post<CashierShiftDto>(`/v1/cashier-shifts/${shiftId}/reconcile`, body),
  recordSpotCount: (shiftId: string, body: RecordSpotCountBody) =>
    api.post<{ shiftId: string; expected: Record<string, number>; counted: Record<string, number>; variance: Record<string, number>; withinTolerance: boolean }>(
      `/v1/cashier-shifts/${shiftId}/spot-count`,
      body,
    ),
  // ── Reportes (S3/S5b) ──
  shiftReport: (shiftId: string) => api.get<CashierShiftReportDto>(`/v1/cash-reports/shift/${shiftId}`),
  cashSummary: (propertyId: string, date: string, filter?: string) => {
    const q = new URLSearchParams({ propertyId, date })
    if (filter) q.set('filter', filter)
    return api.get<CashDailySummaryDto>(`/v1/cash-reports/cash-summary?${q.toString()}`)
  },
  downloadShiftCsv: (shiftId: string) =>
    downloadCsv(`/v1/cash-reports/shift/${shiftId}/csv`, `turno-${shiftId.slice(0, 8)}.csv`),
  downloadSummaryCsv: (propertyId: string, date: string, filter?: string) => {
    const q = new URLSearchParams({ propertyId, date })
    if (filter) q.set('filter', filter)
    return downloadCsv(`/v1/cash-reports/cash-summary/csv?${q.toString()}`, `caja-${date}.csv`)
  },
  // ── Reporte tabular de Turnos de caja (Estándar de Reportes) ──
  shiftsReport: (p: ShiftsReportParams) =>
    api.get<ShiftsReportResponse>(`/v1/cash-reports/shifts?${shiftsReportQs(p)}`),
  downloadShiftsExport: (p: ShiftsReportParams, format: 'xlsx' | 'csv') =>
    downloadCsv(`/v1/cash-reports/shifts/export?${shiftsReportQs(p)}&format=${format}`, `turnos-caja.${format}`),
}
