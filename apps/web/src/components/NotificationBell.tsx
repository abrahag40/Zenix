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

export function NotificationBell() {
  const [panelOpen, setPanelOpen] = useState(false)
  const navigate = useNavigate()
  const propertyId = useActivePropertyId()
  const {
    notifications, unreadCount,
    markRead, markAllRead, approve, reject,
  } = useNotifications(propertyId)

  return (
    <>
      <button
        className={cn(
          'relative flex items-center justify-center',
          'w-9 h-9 rounded-lg text-slate-500 hover:text-slate-700',
          'hover:bg-slate-100 transition-colors duration-150',
        )}
        aria-label="Notificaciones"
        onClick={() => setPanelOpen((v) => !v)}
      >
        <Bell className="h-5 w-5" strokeWidth={1.75} />
        {/* Patrón Meta 2020+: al abrir el panel cesa el radar pulsante.
            El punto rojo persiste mientras haya unread real. */}
        {unreadCount > 0 && (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {!panelOpen && (
              <>
                <span className="absolute w-9 h-9 rounded-lg bg-red-400/20" style={{ animation: 'radar1 2.5s ease-out infinite' }} />
                <span className="absolute w-9 h-9 rounded-lg bg-red-400/15" style={{ animation: 'radar2 2.5s ease-out 0.6s infinite' }} />
              </>
            )}
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />
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
        onNavigate={(url) => { setPanelOpen(false); navigate(url) }}
      />
    </>
  )
}
