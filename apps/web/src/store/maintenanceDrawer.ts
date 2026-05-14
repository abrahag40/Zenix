/**
 * maintenanceDrawer — Zustand store global del TicketDetailDrawer.
 *
 * Sprint Mx-1B-W3 W3.6 — Permite abrir el drawer desde CUALQUIER lugar
 * de la app (notification panel, calendar, kanban, booking detail sheet,
 * etc.) sin navegación de página + sin acoplar state entre componentes
 * que no se conocen.
 *
 * Patrón: el TicketDetailDrawer se monta UNA VEZ en App.tsx (root)
 * leyendo del store. Cualquier consumidor llama:
 *
 *   import { useMaintenanceDrawer } from '@/store/maintenanceDrawer'
 *   useMaintenanceDrawer.getState().open(ticketId)
 *
 * O en componente: `const open = useMaintenanceDrawer((s) => s.open)`
 *
 * Apple HIG 2024 / NN/g 2020: maintener contexto del usuario (no
 * navegar fuera de la vista actual) — el drawer abre encima del PMS
 * calendar, kanban, settings, etc. sin perder la ubicación.
 */
import { create } from 'zustand'

interface MaintenanceDrawerState {
  ticketId: string | null
  open: (id: string) => void
  close: () => void
}

export const useMaintenanceDrawer = create<MaintenanceDrawerState>((set) => ({
  ticketId: null,
  open: (id) => set({ ticketId: id }),
  close: () => set({ ticketId: null }),
}))

/**
 * Helper para parsear actionUrl de notificaciones legacy.
 * Soporta tanto el formato nuevo `/maintenance?ticketId=X` como el
 * legacy `/maintenance/tickets/X` (commit 414889f migró el backend,
 * pero notifs viejas en BD aún apuntan al formato legacy).
 *
 * Returns el ticketId si la URL apunta a un ticket de mantenimiento,
 * o `null` si la URL es de otro tipo (debe navegar normalmente).
 */
export function parseMaintenanceTicketUrl(url: string): string | null {
  // Formato nuevo: /maintenance?ticketId=X (o con query extra)
  const qmatch = url.match(/^\/maintenance\?(?:.*&)?ticketId=([^&]+)/)
  if (qmatch) return qmatch[1]
  // Formato legacy: /maintenance/tickets/X
  const lmatch = url.match(/^\/maintenance\/tickets\/([^/?#]+)/)
  if (lmatch) return lmatch[1]
  return null
}
