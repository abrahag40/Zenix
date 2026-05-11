/**
 * maintenance.api.ts — Sprint Mx-1B-W1
 *
 * Cliente HTTP tipado para los 18 endpoints del módulo de Mantenimiento web.
 * Espeja exactamente los DTOs del backend (`@zenix/shared`) para que cualquier
 * cambio del schema rompa el typecheck en compile-time, no en producción.
 */
import { api } from '../../../api/client'
import type {
  AddMaintenanceCommentInput,
  AddMaintenancePhotoInput,
  ApproveMaintenanceTicketInput,
  AssignMaintenanceTicketInput,
  CreateMaintenanceTicketInput,
  MaintenanceRecurrenceTemplateDto,
  MaintenanceTicketCommentDto,
  MaintenanceTicketDetailDto,
  MaintenanceTicketDto,
  MaintenanceTicketListQuery,
  MaintenanceTicketPhotoDto,
  RejectMaintenanceTicketInput,
  ReopenMaintenanceTicketInput,
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
  // ── Queries ────────────────────────────────────────────────────────────
  list: (query: MaintenanceTicketListQuery = {}) =>
    api.get<MaintenanceTicketDto[]>(`${ROOT}/tickets${qs(query)}`),

  getOne: (id: string) => api.get<MaintenanceTicketDetailDto>(`${ROOT}/tickets/${id}`),

  getQueue: () => api.get<MaintenanceTicketDto[]>(`${ROOT}/queue`),

  recurrenceTemplates: () =>
    api.get<MaintenanceRecurrenceTemplateDto[]>(`${ROOT}/recurrence-templates`),

  roomHistory: (roomId: string) =>
    api.get<MaintenanceTicketDto[]>(`${ROOT}/rooms/${roomId}/history`),

  assetHistory: (assetTag: string) =>
    api.get<MaintenanceTicketDto[]>(
      `${ROOT}/assets/${encodeURIComponent(assetTag)}/history`,
    ),

  // ── Mutations: lifecycle ───────────────────────────────────────────────
  create: (dto: CreateMaintenanceTicketInput) =>
    api.post<MaintenanceTicketDto>(`${ROOT}/tickets`, dto),

  approve: (id: string, dto: ApproveMaintenanceTicketInput) =>
    api.patch<MaintenanceTicketDto>(`${ROOT}/tickets/${id}/approve`, dto),

  reject: (id: string, dto: RejectMaintenanceTicketInput) =>
    api.patch<MaintenanceTicketDto>(`${ROOT}/tickets/${id}/reject`, dto),

  claim: (id: string) => api.patch<MaintenanceTicketDto>(`${ROOT}/tickets/${id}/claim`),

  assign: (id: string, dto: AssignMaintenanceTicketInput) =>
    api.patch<MaintenanceTicketDto>(`${ROOT}/tickets/${id}/assign`, dto),

  acknowledge: (id: string) =>
    api.patch<MaintenanceTicketDto>(`${ROOT}/tickets/${id}/acknowledge`),

  start: (id: string) => api.patch<MaintenanceTicketDto>(`${ROOT}/tickets/${id}/start`),

  requestParts: (id: string, note?: string) =>
    api.patch<MaintenanceTicketDto>(`${ROOT}/tickets/${id}/request-parts`, { note }),

  resume: (id: string) => api.patch<MaintenanceTicketDto>(`${ROOT}/tickets/${id}/resume`),

  resolve: (id: string, dto: ResolveMaintenanceTicketInput) =>
    api.patch<MaintenanceTicketDto>(`${ROOT}/tickets/${id}/resolve`, dto),

  verify: (id: string, dto: VerifyMaintenanceTicketInput) =>
    api.patch<MaintenanceTicketDto>(`${ROOT}/tickets/${id}/verify`, dto),

  close: (id: string) => api.patch<MaintenanceTicketDto>(`${ROOT}/tickets/${id}/close`),

  reopen: (id: string, dto: ReopenMaintenanceTicketInput) =>
    api.patch<MaintenanceTicketDto>(`${ROOT}/tickets/${id}/reopen`, dto),

  // ── Mutations: comments / photos ───────────────────────────────────────
  addComment: (id: string, dto: AddMaintenanceCommentInput) =>
    api.post<MaintenanceTicketCommentDto>(`${ROOT}/tickets/${id}/comments`, dto),

  addPhoto: (id: string, dto: AddMaintenancePhotoInput) =>
    api.post<MaintenanceTicketPhotoDto>(`${ROOT}/tickets/${id}/photos`, dto),

  // Sprint Mx-1B-W2 — W2-04: soft-delete con patrón Instagram (30d).
  deletePhoto: (ticketId: string, photoId: string) =>
    api.delete<{ ok: boolean }>(`${ROOT}/tickets/${ticketId}/photos/${photoId}`),
}
