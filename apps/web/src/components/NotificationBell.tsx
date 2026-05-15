/**
 * NotificationBell — campana del header + panel deslizante.
 *
 * Self-contained: lee el propertyId activo del authStore, hace fetch al
 * NotificationCenter, maneja el toggle del panel y todas las mutations
 * (markRead / markAllRead / approve / reject).
 *
 * Refactor 2026-05-13 — antes existían 2 implementaciones:
 *   · Sidebar.tsx (cableado completo con API real) — usado en algunas vistas
 *   · TimelineTopBar.tsx (STUB decorativo SIN onClick) — usado en /pms
 * El usuario clickeaba el del PMS y nada pasaba. Ahora ambos lugares
 * importan este componente, garantizando un único punto de verdad.
 *
 * Patrón Meta 2020+ "tiered fade": el radar pulsante cesa cuando el panel
 * está abierto (signal implícito "I saw it"). El punto rojo permanece
 * mientras unreadCount > 0. Cada item conserva su dot azul individual
 * hasta interacción explícita (click/navegar).
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NotificationPanel } from './NotificationPanel'
import { useNotifications, useActivePropertyId } from '@/hooks/useNotifications'
import { useMaintenanceDrawer, parseMaintenanceTicketUrl } from '@/store/maintenanceDrawer'

export function NotificationBell() {
  const [panelOpen, setPanelOpen] = useState(false)
  const navigate = useNavigate()
  const openMaintenanceDrawer = useMaintenanceDrawer((s) => s.open)
  const propertyId = useActivePropertyId()
  const {
    notifications, unreadCount,
    markRead, markAllRead, approve, reject,
    isApproveOrRejectPending,
  } = useNotifications(propertyId)

  /*
   * W3.6 — Click en notificación:
   *   1) Si el actionUrl apunta a un ticket de mantenimiento (formato nuevo
   *      `/maintenance?ticketId=X` o legacy `/maintenance/tickets/X`) →
   *      abre el GlobalMaintenanceDrawer in-place sin navegación.
   *   2) Para cualquier otra ruta (ej. /reservations/:id, /pms?date=X) →
   *      navega normalmente.
   *
   * Beneficio: el usuario nunca pierde su contexto (Apple HIG 2024) y
   * notifs viejas en BD con actionUrl legacy también funcionan.
   */
  function handleNotificationNavigate(url: string) {
    setPanelOpen(false)
    const maintTicketId = parseMaintenanceTicketUrl(url)
    if (maintTicketId) {
      openMaintenanceDrawer(maintTicketId)
      return
    }
    navigate(url)
  }

  return (
    <>
      <button
        className={cn(
          'relative flex items-center justify-center',
          'w-9 h-9 rounded-lg text-slate-500 hover:text-slate-700',
          'hover:bg-slate-100 transition-colors duration-150',
        )}
        aria-label="Notificaciones"
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        onClick={() => setPanelOpen((v) => !v)}
      >
        <Bell className="h-5 w-5" strokeWidth={1.75} />
        {/* W3.5 — Badge con contador + pulso desde el dot (no halo).
            Patrón FB/IG/LinkedIn: el dot rojo lleva el conteo (1-9, 9+).
            Pulse ring emana desde el dot mismo, no del botón entero.
            Color psicológico: red-500 sólido = atención inmediata
            (Mehrabian-Russell 1974); pulso = peripheral movement que
            captura atención sin sobrecargar el chrome (Treisman 1980).
            El pulse cesa cuando el panel está abierto (Meta 2020+ pattern). */}
        {unreadCount > 0 && (
          <span className="pointer-events-none absolute -top-0.5 -right-0.5 flex items-center justify-center">
            {/* Ring pulse — emana desde el dot mismo */}
            {!panelOpen && (
              <span className="absolute inset-0 rounded-full bg-red-500 bell-pulse-ring" aria-hidden />
            )}
            {/* Dot sólido con número — min 18px (Apple HIG touch-target hint) */}
            <span
              className="relative inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none px-1 ring-2 ring-white tabular-nums"
              aria-label={`${unreadCount} sin leer`}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          </span>
        )}
      </button>

      <NotificationPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        notifications={notifications}
        unreadCount={unreadCount}
        onRead={markRead}
        onMarkAll={markAllRead}
        onApprove={approve}
        onReject={reject}
        onNavigate={handleNotificationNavigate}
        isActionPending={isApproveOrRejectPending}
      />
    </>
  )
}
