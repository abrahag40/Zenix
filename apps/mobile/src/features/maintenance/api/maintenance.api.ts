/**
 * Mobile API client for maintenance tickets (Sprint Mx-1B-M).
 * Espeja exactamente la web — DTOs vienen de @zenix/shared.
 */
import { api } from '../../../api/client'
import type {
  ApproveMaintenanceTicketInput,
  CreateMaintenanceTicketInput,
  MaintenanceTicketDetailDto,
  MaintenanceTicketDto,
  MaintenanceTicketListQuery,
  RejectMaintenanceTicketInput,
  ResolveMaintenanceTicketInput,
  VerifyMaintenanceTicketInput,
} from '@zenix/shared'

const ROOT = '/v1/maintenance'

function qs(query: MaintenanceTicketListQuery): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue
    if (Array.isArray(v)) v.forEach((item) => params.append(k, String(item)))
    else params.append(k, String(v))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

export const maintenanceApi = {
  list: (query: MaintenanceTicketListQuery = {}) =>
    api.get<MaintenanceTicketDto[]>(`${ROOT}/tickets${qs(query)}`),
  getOne: (id: string) => api.get<MaintenanceTicketDetailDto>(`${ROOT}/tickets/${id}`),
  getQueue: () => api.get<MaintenanceTicketDto[]>(`${ROOT}/queue`),

  create: (dto: CreateMaintenanceTicketInput) =>
    api.post<MaintenanceTicketDto>(`${ROOT}/tickets`, dto),
  claim: (id: string) => api.patch<MaintenanceTicketDto>(`${ROOT}/tickets/${id}/claim`),
  start: (id: string) => api.patch<MaintenanceTicketDto>(`${ROOT}/tickets/${id}/start`),
  resolve: (id: string, dto: ResolveMaintenanceTicketInput) =>
    api.patch<MaintenanceTicketDto>(`${ROOT}/tickets/${id}/resolve`, dto),
  requestParts: (id: string, note?: string) =>
    api.patch<MaintenanceTicketDto>(`${ROOT}/tickets/${id}/request-parts`, { note }),
  resume: (id: string) => api.patch<MaintenanceTicketDto>(`${ROOT}/tickets/${id}/resume`),

  approve: (id: string, dto: ApproveMaintenanceTicketInput = {}) =>
    api.patch<MaintenanceTicketDto>(`${ROOT}/tickets/${id}/approve`, dto),
  reject: (id: string, dto: RejectMaintenanceTicketInput) =>
    api.patch<MaintenanceTicketDto>(`${ROOT}/tickets/${id}/reject`, dto),
  verify: (id: string, dto: VerifyMaintenanceTicketInput = {}) =>
    api.patch<MaintenanceTicketDto>(`${ROOT}/tickets/${id}/verify`, dto),

  addPhoto: (id: string, dto: { url: string; caption?: string; isAfterPhoto?: boolean }) =>
    api.post<{ id: string }>(`${ROOT}/tickets/${id}/photos`, dto),
  addComment: (id: string, content: string) =>
    api.post<{ id: string }>(`${ROOT}/tickets/${id}/comments`, { content }),
}
