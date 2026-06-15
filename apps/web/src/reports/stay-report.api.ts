import { api } from '@/api/client'
import { downloadFile } from '@/api/download'

export interface StayReportParams {
  from: string
  to: string
  currency?: string
  source?: string
  sort?: string
  dir?: string
  page?: number
  pageSize?: number
}

export interface StayRow {
  id: string
  guest: string
  room: string
  checkIn: string
  checkOut: string
  nights: number
  revenue: number
  currency: string
  source: string
  contact: string | null
}

export interface StayReportResponse {
  rows: StayRow[]
  total: number
  totals: { count: number; nights: number; revenue: number }
  currency: string
  availableCurrencies: string[]
  availableSources: string[]
  sort: string
  dir: string
  page: number
  pageSize: number
}

function qs(p: StayReportParams): string {
  const q = new URLSearchParams()
  q.set('from', p.from)
  q.set('to', p.to)
  if (p.currency) q.set('currency', p.currency)
  if (p.source) q.set('source', p.source)
  if (p.sort) q.set('sort', p.sort)
  if (p.dir) q.set('dir', p.dir)
  if (p.page) q.set('page', String(p.page))
  if (p.pageSize) q.set('pageSize', String(p.pageSize))
  return q.toString()
}

export const stayReportApi = {
  get: (p: StayReportParams) => api.get<StayReportResponse>(`/reports/stays-table?${qs(p)}`),
  download: (p: StayReportParams, format: 'xlsx' | 'csv') =>
    downloadFile(`/reports/stays-table/export?${qs(p)}&format=${format}`, `estadias-extendidas.${format}`),
}
