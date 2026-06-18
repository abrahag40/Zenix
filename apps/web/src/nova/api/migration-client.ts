/**
 * Migration API client — Zenix Onboard (MIGRATION-CORE). Espejo de
 * apps/api/src/migration/migration.controller.ts. Surface /v1/nova/migration/*.
 * Auth: X-Acting-Organization-Id vía actingOrgHeader() (elige cliente en /nova/clientes).
 */
import { api } from '../../api/client'
import { useNovaStore } from '../../store/nova'

function actingOrgHeader(): Record<string, string> {
  const state = useNovaStore.getState()
  if (!state.actingOrgId) throw new Error('Nova: elige un cliente en /nova/clientes primero')
  return { 'X-Acting-Organization-Id': state.actingOrgId }
}

export interface MigrationSourceOption { id: string; label: string; hasDefaultMapping: boolean }
export interface MigrationPropertyOption { id: string; name: string; city: string | null }
export interface MigrationRoomOption { id: string; number: string; category: 'PRIVATE' | 'SHARED' }

export interface MigrationCounts {
  parsed?: number; ok?: number; warn?: number; error?: number
  skipped?: number; conflicts?: number; overlaps?: number; blocking?: number; loaded?: number
  mapped?: number; existing?: number; failed?: number
}

export interface MigrationJobDetail {
  id: string
  organizationId: string
  propertyId: string
  sourceSystem: string
  status: string
  fileName: string | null
  counts: MigrationCounts | null
  columnMapping: unknown
  detectedHeaders: string[]
  totalRows: number
  sample: Array<{ rowIndex: number; raw: Record<string, unknown>; mapped: Record<string, unknown> | null }>
  createdAt: string
}

export interface MigrationConflict {
  id: string
  type: string
  severity: 'WARN' | 'ERROR'
  rowRefs: string[]
  message: string | null
}
export interface MigrationConflictsView {
  jobId: string
  total: number
  byType: Record<string, number>
  conflicts: MigrationConflict[]
}

export interface MigrationJobListItem {
  id: string; sourceSystem: string; status: string; fileName: string | null
  counts: MigrationCounts | null; createdAt: string
}

const BASE = '/v1/nova/migration'

export const migrationApi = {
  sources: () =>
    api.get<MigrationSourceOption[]>(`${BASE}/sources`, { headers: actingOrgHeader() }),

  properties: () =>
    api.get<MigrationPropertyOption[]>(`${BASE}/properties`, { headers: actingOrgHeader() }),

  rooms: (propertyId: string) =>
    api.get<MigrationRoomOption[]>(`/v1/nova/properties/${propertyId}/migration/rooms`, { headers: actingOrgHeader() }),

  listJobs: (propertyId: string) =>
    api.get<MigrationJobListItem[]>(`/v1/nova/properties/${propertyId}/migration/jobs`, { headers: actingOrgHeader() }),

  createJob: (propertyId: string, body: {
    sourceSystem: string; fileName: string; fileBase64: string
    mapping?: { reservation: Record<string, string>; dateFormat?: string }
  }) =>
    api.post<MigrationJobDetail>(`/v1/nova/properties/${propertyId}/migration/jobs`, body, { headers: actingOrgHeader() }),

  getJob: (jobId: string) =>
    api.get<MigrationJobDetail>(`${BASE}/jobs/${jobId}`, { headers: actingOrgHeader() }),

  getConflicts: (jobId: string) =>
    api.get<MigrationConflictsView>(`${BASE}/jobs/${jobId}/conflicts`, { headers: actingOrgHeader() }),

  applyMapping: (jobId: string, mapping: { reservation: Record<string, string>; dateFormat?: string }) =>
    api.post<MigrationJobDetail>(`${BASE}/jobs/${jobId}/mapping`, { mapping }, { headers: actingOrgHeader() }),

  resolveRow: (jobId: string, rowIndex: number, body: { action: 'SKIP' | 'ACCEPT' | 'REASSIGN'; targetRoomId?: string; reason?: string }) =>
    api.patch<MigrationJobDetail>(`${BASE}/jobs/${jobId}/rows/${rowIndex}/resolution`, body, { headers: actingOrgHeader() }),

  deleteJob: (jobId: string) =>
    api.delete<{ deleted: boolean }>(`${BASE}/jobs/${jobId}`, { headers: actingOrgHeader() }),

  /** Sprint 4 — dispara el load idempotente a producción (crea las reservas reales). */
  load: (jobId: string) =>
    api.post<MigrationJobDetail>(`${BASE}/jobs/${jobId}/load`, {}, { headers: actingOrgHeader() }),

  /** Reporte post-migración (HTML imprimible). Devuelve el HTML — la UI lo abre en blob. */
  report: (jobId: string) =>
    api.get<string>(`${BASE}/jobs/${jobId}/report`, { headers: actingOrgHeader(), responseType: 'text' }),
}
