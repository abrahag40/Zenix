/**
 * Sidebar.tsx — navegación global (top bar) para rutas fuera del PMS.
 *
 * Las rutas del calendario (/pms) usan <TimelineTopBar /> embebido; el
 * resto de las páginas (dashboard, planning, kanban, etc.) usan este
 * componente, rendereado por <ProtectedLayout />. Ambos comparten la
 * misma UX:
 *
 *   · Izquierda: <PropertySwitcher /> — nombre de la sucursal activa
 *                 con dropdown para cambiar.
 *   · Derecha:   <AppMenu align="end" /> — hamburguesa con las 3
 *                 secciones globales y la sesión activa.
 *
 * Ambos exports se conservan para compatibilidad con imports antiguos;
 * renderizan el mismo top bar.
 */
import { PropertySwitcher } from './PropertySwitcher'
import { AppMenu } from './AppMenu'

function GlobalTopBar() {
  return (
    <div className="fixed top-0 left-0 right-0 z-30 flex items-center gap-3 px-4 h-14 bg-white border-b border-slate-200">
      <PropertySwitcher />
      <div className="flex-1" />
      <AppMenu align="end" />
    </div>
  )
}

export function Sidebar() {
  return <GlobalTopBar />
}

export function MobileNav() {
  // Compatibility shim — the nav is unified under GlobalTopBar + AppMenu.
  return null
}
