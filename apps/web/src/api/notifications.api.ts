import { api } from './client'

const BASE = '/v1/notification-center'

export type AppNotificationType     = 'INFORMATIONAL' | 'ACTION_REQUIRED' | 'APPROVAL_REQUIRED'
export type AppNotificationCategory =
  // Legacy (Sprint 7D)
  | 'CHECKIN_UNCONFIRMED' | 'EARLY_CHECKOUT' | 'NO_SHOW' | 'NO_SHOW_REVERTED'
  | 'ARRIVAL_RISK' | 'CHECKOUT_COMPLETE' | 'TASK_COMPLETED' | 'MAINTENANCE_REPORTED'
  | 'PAYMENT_PENDING' | 'SYSTEM'
  // Sprint Mx-1 — Módulo de Mantenimiento (9 categorías)
  | 'MAINTENANCE_TICKET_CREATED' | 'MAINTENANCE_TICKET_UPDATED'
  | 'MAINTENANCE_TICKET_CRITICAL' | 'MAINTENANCE_TICKET_NEEDS_APPROVAL'
  | 'MAINTENANCE_TICKET_ASSIGNED' | 'MAINTENANCE_TICKET_RESOLVED'
  | 'MAINTENANCE_TICKET_VERIFIED' | 'MAINTENANCE_TICKET_QUEUED'
  | 'MAINTENANCE_SLA_BREACH'
  // Sprint 9 — Dual toast+panel + late checkout escalation
  | 'TASK_VERIFIED_READY'
  | 'LATE_CHECKOUT_PENDING' | 'LATE_CHECKOUT_ESCALATED'
export type AppNotificationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

export interface AppNotification {
  id:          string
  type:        AppNotificationType
  category:    AppNotificationCategory
  priority:    AppNotificationPriority
  title:       string
  body:        string
  metadata:    Record<string, unknown> | null
  actionUrl:   string | null
  createdAt:   string
  isRead:      boolean
  readAt:      string | null
  triggeredBy: string | null
  approval:    { action: 'APPROVED' | 'REJECTED' | 'ESCALATED'; actionAt: string; reason: string | null } | null
}

export const notificationsApi = {
  list: (propertyId: string, limit = 50) =>
    api.get<AppNotification[]>(`${BASE}?propertyId=${propertyId}&limit=${limit}`),

  unreadCount: (propertyId: string) =>
    api.get<{ count: number }>(`${BASE}/unread-count?propertyId=${propertyId}`),

  markRead: (id: string) =>
    api.patch(`${BASE}/${id}/read`, {}),

  markAllRead: (propertyId: string) =>
    api.patch(`${BASE}/read-all?propertyId=${propertyId}`, {}),

  /** FB+LinkedIn hybrid — al abrir el panel, baja el bell counter sin marcar
   *  items individuales como leídos. NN/g 2023 "Notification Patterns". */
  acknowledge: () =>
    api.post<{ ok: true }>(`${BASE}/acknowledge`, {}),

  approve: (id: string, reason?: string) =>
    api.post(`${BASE}/${id}/approve`, { reason }),

  reject: (id: string, reason?: string) =>
    api.post(`${BASE}/${id}/reject`, { reason }),

  auditLog: (propertyId: string, from: Date, to: Date) =>
    api.get(`${BASE}/audit?propertyId=${propertyId}&from=${from.toISOString()}&to=${to.toISOString()}`),
}
