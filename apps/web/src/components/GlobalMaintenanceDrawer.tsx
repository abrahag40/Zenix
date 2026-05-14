/**
 * GlobalMaintenanceDrawer — TicketDetailDrawer montado a nivel App.
 *
 * Sprint Mx-1B-W3 W3.6 — Single source of truth para abrir el detalle
 * de un ticket de mantenimiento desde cualquier parte de la app.
 *
 * Lee del store `useMaintenanceDrawer` (Zustand). Cualquier componente
 * llama `useMaintenanceDrawer.getState().open(ticketId)` y el drawer
 * aparece encima de la vista actual sin navegación.
 *
 * Consumers que usan este drawer global (deprecan sus drawers locales):
 *   · NotificationBell — click en notif de mantenimiento
 *   · TimelineScheduler — click en bloque originado por ticket CRITICAL
 *   · BookingDetailSheet callout — link a ticket de la habitación
 *   · MaintenancePage — click en card de ticket
 *   · KanbanPage — futuro: badge "Mtto pendiente" en card
 */
import { useMemo } from 'react'
import { TicketDetailDrawer } from '../modules/maintenance/components/TicketDetailDrawer'
import { useMaintenanceDrawer } from '../store/maintenanceDrawer'
import { useAuthStore } from '../store/auth'
import type { JwtPayload } from '@zenix/shared'

export function GlobalMaintenanceDrawer() {
  const ticketId = useMaintenanceDrawer((s) => s.ticketId)
  const close = useMaintenanceDrawer((s) => s.close)
  const user = useAuthStore((s) => s.user)

  // Construye el JwtPayload desde el authStore (mismo patrón que MaintenancePage).
  // organizationId no se expone en el user shape; el backend lo infiere del JWT.
  const actor = useMemo<JwtPayload | null>(() => {
    if (!user) return null
    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      department: user.department,
      propertyId: user.propertyId,
      organizationId: '',
    }
  }, [user])

  // Sin actor (no logueado) o sin ticketId activo → no renderiza nada.
  if (!actor) return null

  return (
    <TicketDetailDrawer
      ticketId={ticketId}
      actor={actor}
      onClose={close}
    />
  )
}
