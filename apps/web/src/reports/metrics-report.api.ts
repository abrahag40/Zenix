import { api } from '@/api/client'
import { downloadFile } from '@/api/download'

export interface MetricsReportParams {
  propertyId: string
  from: string
  to: string
  sort?: string
  dir?: string
  page?: number
  pageSize?: number
}

export interface MetricsRow {
  id: string
  date: string
  occupancy: number
  roomsSold: number
  roomsAvailable: number
  adr: number
  revpar: number
  revenue: number
  arrivals: number
  departures: number
  cancellations: number
  noShows: number
  currency: string
}

export interface MetricsReportResponse {
  rows: MetricsRow[]
  total: number
  totals: {
    days: number
    occupancy: number
    roomsSold: number
    adr: number
    revpar: number
    revenue: number
    arrivals: number
    departures: number
    cancellations: number
    noShows: number
  }
  currency: string
  sort: string
  dir: string
  page: number
  pageSize: number
}

function qs(p: MetricsReportParams): string {
  const q = new URLSearchParams()
  q.set('propertyId', p.propertyId)
  q.set('from', p.from)
  q.set('to', p.to)
  if (p.sort) q.set('sort', p.sort)
  if (p.dir) q.set('dir', p.dir)
  if (p.page) q.set('page', String(p.page))
  if (p.pageSize) q.set('pageSize', String(p.pageSize))
  return q.toString()
}

export const metricsReportApi = {
  get: (p: MetricsReportParams) => api.get<MetricsReportResponse>(`/v1/metrics/report?${qs(p)}`),
  download: (p: MetricsReportParams, format: 'xlsx' | 'csv') =>
    downloadFile(`/v1/metrics/report/export?${qs(p)}&format=${format}`, `metricas-diarias.${format}`),
}
