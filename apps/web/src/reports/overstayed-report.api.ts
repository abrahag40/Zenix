import { api } from '@/api/client'
import { downloadFile } from '@/api/download'

export interface OverstayedReportParams {
  currency?: string
  sort?: string
  dir?: string
  page?: number
  pageSize?: number
}

export interface OverstayedRow {
  id: string
  guest: string
  room: string
  scheduledCheckout: string
  hoursOverdue: number
  daysOverdue: number
  balance: number
  currency: string
  source: string
  paymentStatus: string
  contact: string
}

export interface OverstayedReportResponse {
  rows: OverstayedRow[]
  total: number
  totals: { count: number; balance: number }
  currency: string
  availableCurrencies: string[]
  sort: string
  dir: string
  page: number
  pageSize: number
}

function qs(p: OverstayedReportParams): string {
  const q = new URLSearchParams()
  if (p.currency) q.set('currency', p.currency)
  if (p.sort) q.set('sort', p.sort)
  if (p.dir) q.set('dir', p.dir)
  if (p.page) q.set('page', String(p.page))
  if (p.pageSize) q.set('pageSize', String(p.pageSize))
  return q.toString()
}

export const overstayedReportApi = {
  get: (p: OverstayedReportParams) => api.get<OverstayedReportResponse>(`/reports/overstayed-table?${qs(p)}`),
  download: (p: OverstayedReportParams, format: 'xlsx' | 'csv') =>
    downloadFile(`/reports/overstayed-table/export?${qs(p)}&format=${format}`, `saldos-vencidos.${format}`),
}
