import { api } from '@/api/client'
import { downloadFile } from '@/api/download'

export interface NoShowReportParams {
  from: string
  to: string
  currency?: string
  status?: string
  sort?: string
  dir?: string
  page?: number
  pageSize?: number
}

export interface NoShowRow {
  id: string
  noShowAt: string
  guest: string
  room: string
  scheduledCheckin: string
  source: string
  fee: number
  feeCurrency: string | null
  chargeStatus: string | null
  reason: string | null
  markedBy: string | null
}

export interface NoShowReportResponse {
  rows: NoShowRow[]
  total: number
  totals: { count: number; fee: number }
  currency: string
  availableCurrencies: string[]
  availableStatuses: string[]
  sort: string
  dir: string
  page: number
  pageSize: number
}

function qs(p: NoShowReportParams): string {
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

export const noShowReportApi = {
  get: (p: NoShowReportParams) => api.get<NoShowReportResponse>(`/reports/no-shows-table?${qs(p)}`),
  download: (p: NoShowReportParams, format: 'xlsx' | 'csv') =>
    downloadFile(`/reports/no-shows-table/export?${qs(p)}&format=${format}`, `no-shows.${format}`),
}
