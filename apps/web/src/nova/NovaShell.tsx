/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 9.
 *
 * NovaShell — layout principal de la interfaz Nova (consultor/admin).
 *
 * Estructura:
 *   - ImpersonationBanner (top, sticky, z-50)
 *   - NovaSidebar (lateral, vertical)
 *   - NovaTopbar (horizontal, dentro del main column)
 *   - <main> children (page-specific)
 *
 * Guards:
 *   1. Si no hay JWT → redirect /login (con returnTo)
 *   2. Si actorTier === 'ORG_STAFF' → redirect /dashboard (Nova no-go)
 *
 * Diferencia con PmsLayout (apps/web/src/App.tsx): Nova es SEPARADO.
 * Tiene su propia sidebar, topbar, store, branding. Cliente sigue en
 * app.zenix.com con sus propias rutas y UI (§159 D-NOVA-1, Phase 1
 * comparte `apps/web` pero con shells distintos; Phase 2 v1.0.5 extraerá
 * a `apps/partner` con build separado + dominio `nova.zenix.com`).
 */
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { ImpersonationBanner } from './components/ImpersonationBanner'
import { NovaSidebar } from './components/NovaSidebar'
import { NovaTopbar } from './components/NovaTopbar'

interface NovaShellProps {
  /** Page title (puede mostrarse en topbar). */
  title?: string
  /** Slot de acciones a la derecha del topbar (botones específicos de la página). */
  actions?: React.ReactNode
  children: React.ReactNode
}

export function NovaShell({ title, actions, children }: NovaShellProps) {
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token) ?? localStorage.getItem('hk_token')
  const location = useLocation()

  // Guard 1 — no JWT
  if (!token) {
    return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname)}`} replace />
  }

  // Guard 2 — ORG_STAFF no debe estar en Nova
  // (Day 9: si actorTier no viene en user, defensive default ORG_STAFF.
  //  Después del login Day 9 backend update, viene poblado.)
  const tier = user?.actorTier ?? 'ORG_STAFF'
  if (tier === 'ORG_STAFF') {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col antialiased">
      {/* ImpersonationBanner sticky por encima de todo */}
      <ImpersonationBanner />

      {/* Layout: sidebar dark + main column light */}
      <div className="flex flex-1 min-h-0">
        <NovaSidebar />

        <div className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
          {/* Subtle ambient gradient — bridge tonal entre sidebar dark warm
              y main light. Emerald hint en el left edge (cerca del sidebar)
              tiende un "puente cromático" sutil que reduce el contraste
              perceptible sin matar la legibilidad del content. */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                // Left edge: emerald hint que continúa la identidad del sidebar
                'radial-gradient(700px circle at 0% 30%, rgba(16,185,129,0.04) 0%, transparent 55%),' +
                // Top-right: violet ambient (color complement)
                'radial-gradient(1000px circle at 100% 0%, rgba(99,102,241,0.035) 0%, transparent 55%),' +
                // Bottom-right: warm soft
                'radial-gradient(800px circle at 100% 100%, rgba(245,158,11,0.02) 0%, transparent 50%)',
            }}
            aria-hidden
          />
          <NovaTopbar title={title} actions={actions} />

          <main className="relative flex-1 overflow-y-auto">
            <div className="max-w-screen-2xl mx-auto px-5 sm:px-7 lg:px-9 py-7">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
