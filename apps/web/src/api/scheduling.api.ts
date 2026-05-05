/**
 * Scheduling API client — Sprint 8H endpoints.
 *
 * Wraps `/v1/scheduling/*` for the SettingsPage "Recamaristas" tab.
 * Single source of truth for shape contracts (re-uses shared DTOs).
 *
 * Design: thin pass-through. No optimistic mutations here — those live in
 * React Query hooks colocated with the components that consume them.
 */
import type {
  StaffShiftDto,
  StaffShiftExceptionDto,
  StaffCoverageDto,
  OnShiftStaffDto,
  ShiftExceptionType,
} from '@zenix/shared'
import { api } from './client'

// ── Shifts ────────────────────────────────────────────────────────────────────

export interface CreateShiftInput {
  staffId: string
  dayOfWeek: number      // 0 (Sun) - 6 (Sat)
  startTime: string      // "HH:mm"
  endTime: string        // "HH:mm"
  effectiveFrom?: string // ISO date
  effectiveUntil?: string
}

export interface UpdateShiftInput {
  startTime?: string
  endTime?: string
  active?: boolean
  effectiveUntil?: string
}

export const schedulingApi = {
  // Shifts ───
  listShifts: () => api.get<StaffShiftDto[]>('/v1/scheduling/shifts'),

  createShift: (dto: CreateShiftInput) =>
    api.post<StaffShiftDto>('/v1/scheduling/shifts', dto),

  updateShift: (id: string, dto: UpdateShiftInput) =>
    api.patch<StaffShiftDto>(`/v1/scheduling/shifts/${id}`, dto),

  deleteShift: (id: string) =>
    api.delete<void>(`/v1/scheduling/shifts/${id}`),

  // Exceptions ───
  listExceptions: (from?: string, to?: string) => {
    const qs = new URLSearchParams()
    if (from) qs.set('from', from)
    if (to)   qs.set('to', to)
    const suffix = qs.toString() ? `?${qs}` : ''
    return api.get<StaffShiftExceptionDto[]>(`/v1/scheduling/exceptions${suffix}`)
  },

  createException: (dto: {
    staffId: string
    date: string
    type: ShiftExceptionType
    startTime?: string
    endTime?: string
    reason?: string
  }) => api.post<StaffShiftExceptionDto>('/v1/scheduling/exceptions', dto),

  deleteException: (id: string) =>
    api.delete<void>(`/v1/scheduling/exceptions/${id}`),

  /** D5 — atajo "marcar ausencia": crea OFF + reasigna tareas elegibles. */
  markAbsence: (dto: { staffId: string; date: string; reason?: string }) =>
    api.post<StaffShiftExceptionDto>('/v1/scheduling/absences', dto),

  // Coverage ───
  listCoverage: () => api.get<StaffCoverageDto[]>('/v1/scheduling/coverage'),

  createCoverage: (dto: {
    staffId: string
    roomId: string
    isPrimary?: boolean
    weight?: number
  }) => api.post<StaffCoverageDto>('/v1/scheduling/coverage', dto),

  updateCoverage: (id: string, dto: { isPrimary?: boolean; weight?: number }) =>
    api.patch<StaffCoverageDto>(`/v1/scheduling/coverage/${id}`, dto),

  deleteCoverage: (id: string) =>
    api.delete<void>(`/v1/scheduling/coverage/${id}`),

  // On-shift snapshot ───
  getOnShift: (atIso?: string) => {
    const suffix = atIso ? `?at=${encodeURIComponent(atIso)}` : ''
    return api.get<OnShiftStaffDto[]>(`/v1/scheduling/on-shift${suffix}`)
  },

  // Manual roster trigger (testing / disaster recovery) ───
  runRoster: () =>
    api.post<{ created: number; carryover: number; assigned: number }>(
      '/v1/scheduling/run-roster',
    ),
}
