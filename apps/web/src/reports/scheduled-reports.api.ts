import { api } from '@/api/client'

export interface ScheduledReport {
  id: string
  reportKey: string
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  sendHour: number
  weekday: number | null
  monthday: number | null
  rangeDays: number
  recipients: string[]
  format: 'xlsx' | 'csv'
  filters: Record<string, unknown> | null
  active: boolean
  lastRunDate: string | null
  lastRunAt: string | null
  lastRunStatus: string | null
  createdAt: string
}

export interface CreateScheduledReportInput {
  reportKey: string
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  sendHour: number
  weekday?: number
  monthday?: number
  rangeDays: number
  recipients: string[]
  format: 'xlsx' | 'csv'
}

export const scheduledReportsApi = {
  list: () => api.get<ScheduledReport[]>('/v1/reports/scheduled'),
  create: (dto: CreateScheduledReportInput) => api.post<ScheduledReport>('/v1/reports/scheduled', dto),
  update: (id: string, dto: Partial<CreateScheduledReportInput> & { active?: boolean }) =>
    api.patch<ScheduledReport>(`/v1/reports/scheduled/${id}`, dto),
  remove: (id: string) => api.delete<{ deleted: boolean }>(`/v1/reports/scheduled/${id}`),
  runNow: (id: string) => api.post<{ sent: boolean; reason?: string; rowCount: number }>(`/v1/reports/scheduled/${id}/run-now`, {}),
}
