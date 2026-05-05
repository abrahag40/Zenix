/**
 * Task Overrides API client (Sprint 9 / D15 / OperationalOverridesPage).
 *
 * 4 mutations + 1 release que expone Zenix sobre el ciclo automático del cron:
 *   1. forceUrgent     — recepción fuerza priority=URGENT
 *   2. toggleDeepClean — flag de limpieza profunda
 *   3. holdCleaning    — hold por extensión sin formalizar
 *   4. releaseHold     — libera hold (sigue ciclo normal)
 *   5. createWalkIn    — crea GuestStay + CleaningTask atómicamente
 *
 * Cada mutation invalida el grid del día + el calendario PMS (los blocks
 * leen cleaningStatus y reflejan animación / counter dual D18).
 */
import { api } from './client'

export interface OverrideTaskDto {
  id: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  status: string
  deepClean: boolean
  holdReason: string | null
  heldAt: string | null
  heldById: string | null
  scheduledFor: string | null
}

export interface WalkInPayload {
  roomId: string
  unitId?: string
  guestName: string
  ratePerNight: number
  currency: string
  scheduledCheckout: string  // ISO
  paxCount?: number
}

export interface WalkInResult {
  stay: { id: string; guestName: string; pmsReservationId?: string }
  task: { id: string; status: string; unitId: string }
}

export const tasksOverridesApi = {
  forceUrgent: (taskId: string) =>
    api.post<OverrideTaskDto>(`/tasks/${taskId}/force-urgent`, {}),

  toggleDeepClean: (taskId: string) =>
    api.post<OverrideTaskDto>(`/tasks/${taskId}/toggle-deep-clean`, {}),

  hold: (taskId: string, reason: string) =>
    api.post<OverrideTaskDto>(`/tasks/${taskId}/hold`, { reason }),

  releaseHold: (taskId: string) =>
    api.post<OverrideTaskDto>(`/tasks/${taskId}/release-hold`, {}),

  walkIn: (payload: WalkInPayload) =>
    api.post<WalkInResult>('/tasks/walk-in', payload),
}
