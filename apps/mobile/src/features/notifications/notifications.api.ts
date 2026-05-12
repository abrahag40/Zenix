/**
 * notifications.api — cliente del NotificationCenter para mobile.
 *
 * El equivalente del web (apps/web/src/api/notifications.api.ts). Mobile
 * usa el mismo backend `/v1/notification-center/*` con la misma forma
 * de datos. La diferencia: mobile no tiene react-query, por eso usamos
 * `useApiResource` y mutations manuales con `api.patch`.
 *
 * Sincronizado con AppNotificationCategory de schema.prisma — 22 categorías
 * (Sprint 7D legacy + Sprint Mx-1 + Sprint 9). Cualquier categoría nueva
 * del backend debe añadirse aquí.
 */
import { api } from '../../api/client'

const BASE = '/v1/notification-center'

export type AppNotificationType = 'INFORMATIONAL' | 'ACTION_REQUIRED' | 'APPROVAL_REQUIRED'

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
  // Sprint 9
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
  actionUrl:   string | null
  createdAt:   string
  isRead:      boolean
  readAt:      string | null
  expiresAt:   string | null
}

/**
 * Parser de actionUrl para abrir el detalle correcto al tap-ear una notif.
 * Soporta dos formatos:
 *   · `/maintenance?ticketId=X` (formato nuevo, backend post-commit 414889f)
 *   · `/maintenance/tickets/X`  (formato legacy en notifs persistidas viejas)
 *
 * W3.7 mobile: paridad con apps/web/src/store/maintenanceDrawer.ts.
 * Returns el ticketId si es URL de ticket de mantenimiento; null si es
 * otra ruta (caller decide qué hacer).
 */
export function parseMaintenanceTicketUrl(url: string): string | null {
  const qmatch = url.match(/^\/maintenance\?(?:.*&)?ticketId=([^&]+)/)
  if (qmatch) return qmatch[1]
  const lmatch = url.match(/^\/maintenance\/tickets\/([^/?#]+)/)
  if (lmatch) return lmatch[1]
  return null
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
}

/**
 * Mapping de categoría → avatar emoji + grupo de color para el Avatar circular.
 * Cubre las 22 categorías + fallback SYSTEM para defensa ante categorías nuevas.
 */
type AvatarBg = 'urgent' | 'warning' | 'system' | 'success' | 'info'

export const CATEGORY_AVATAR: Record<AppNotificationCategory, { emoji: string; bg: AvatarBg }> = {
  // Legacy Sprint 7D
  CHECKIN_UNCONFIRMED:               { emoji: '📅', bg: 'info'    },
  EARLY_CHECKOUT:                    { emoji: '🚪', bg: 'warning' },
  NO_SHOW:                           { emoji: '⚠️', bg: 'urgent'  },
  NO_SHOW_REVERTED:                  { emoji: '↩️', bg: 'success' },
  ARRIVAL_RISK:                      { emoji: '⏰', bg: 'warning' },
  CHECKOUT_COMPLETE:                 { emoji: '✓',  bg: 'success' },
  TASK_COMPLETED:                    { emoji: '🧹', bg: 'success' },
  MAINTENANCE_REPORTED:              { emoji: '🔧', bg: 'info'    },
  PAYMENT_PENDING:                   { emoji: '💳', bg: 'warning' },
  SYSTEM:                            { emoji: '⚙️', bg: 'system'  },
  // Sprint Mx-1 — Módulo de Mantenimiento
  MAINTENANCE_TICKET_CREATED:        { emoji: '🔧', bg: 'info'    },
  MAINTENANCE_TICKET_UPDATED:        { emoji: '🔧', bg: 'info'    },
  MAINTENANCE_TICKET_CRITICAL:       { emoji: '🚨', bg: 'urgent'  },
  MAINTENANCE_TICKET_NEEDS_APPROVAL: { emoji: '🟡', bg: 'warning' },
  MAINTENANCE_TICKET_ASSIGNED:       { emoji: '👤', bg: 'info'    },
  MAINTENANCE_TICKET_RESOLVED:       { emoji: '🔍', bg: 'system'  },
  MAINTENANCE_TICKET_VERIFIED:       { emoji: '✅', bg: 'success' },
  MAINTENANCE_TICKET_QUEUED:         { emoji: '📥', bg: 'system'  },
  MAINTENANCE_SLA_BREACH:            { emoji: '⏰', bg: 'urgent'  },
  // Sprint 9
  TASK_VERIFIED_READY:               { emoji: '🏨', bg: 'success' },
  LATE_CHECKOUT_PENDING:             { emoji: '🕐', bg: 'warning' },
  LATE_CHECKOUT_ESCALATED:           { emoji: '🚨', bg: 'urgent'  },
}
