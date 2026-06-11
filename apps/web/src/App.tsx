import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
// Sprint CHANNEX-UX-E2-E3 — single toast lib (Sonner bottom-right richColors).
// Previously dual stack (react-hot-toast top-right + sonner bottom-right)
// generaba dos UIs distintos para el mismo concepto. Estandarizado a Sonner.
import { Toaster as SonnerToaster } from 'sonner'
import { useAuthStore } from './store/auth'
import { Sidebar } from './components/Sidebar'
import { PacStatusBanner } from './components/PacStatusBanner'
import { LoginPage } from './pages/LoginPage'
import { SetupPage } from './pages/SetupPage'
import { PrecheckinPage } from './pages/PrecheckinPage'
import { OnboardingCardCapture } from './pages/OnboardingCardCapture'
import { GlobalMaintenanceDrawer } from './components/GlobalMaintenanceDrawer'
import { useNotificationAlerts } from './hooks/useNotificationAlerts'

// AUTO-CHECKIN aislamiento (2026-06-11) — las páginas de STAFF se cargan
// lazy (code-split). Una ruta PÚBLICA del huésped (/precheckin) NO debe
// descargar el bundle operativo interno. Las páginas públicas (Login/Setup/
// Precheckin/Onboarding) quedan eager arriba. Named exports → {default: m.X};
// default exports (Channex*) → directo.
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })))
const PmsPage = lazy(() => import('./modules/rooms/pages/RoomsPage').then(m => ({ default: m.RoomsPage })))
const KanbanPage = lazy(() => import('./pages/KanbanPage').then(m => ({ default: m.KanbanPage })))
const CheckoutsPage = lazy(() => import('./pages/CheckoutsPage').then(m => ({ default: m.CheckoutsPage })))
const ReportsPage = lazy(() => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })))
const DiscrepanciesPage = lazy(() => import('./pages/DiscrepanciesPage').then(m => ({ default: m.DiscrepanciesPage })))
const ChannexConflictsPage = lazy(() => import('./pages/ChannexConflictsPage'))
const ChannexAdminPage = lazy(() => import('./pages/ChannexAdminPage'))
const BlocksPage = lazy(() => import('./pages/BlocksPage').then(m => ({ default: m.BlocksPage })))
const MaintenancePage = lazy(() => import('./pages/MaintenancePage').then(m => ({ default: m.MaintenancePage })))
const ReservationDetailPage = lazy(() => import('./pages/ReservationDetailPage').then(m => ({ default: m.ReservationDetailPage })))
const NovaClientsPage = lazy(() => import('./nova/pages/NovaClientsPage').then(m => ({ default: m.NovaClientsPage })))
const NovaDashboardPage = lazy(() => import('./nova/pages/NovaDashboardPage').then(m => ({ default: m.NovaDashboardPage })))
const NovaSettingsPage = lazy(() => import('./nova/pages/NovaSettingsPage').then(m => ({ default: m.NovaSettingsPage })))
const NovaChannexPage = lazy(() => import('./nova/pages/NovaChannexPage').then(m => ({ default: m.NovaChannexPage })))
const NovaAuditLogPage = lazy(() => import('./nova/pages/NovaAuditLogPage').then(m => ({ default: m.NovaAuditLogPage })))
const NovaWizardPage = lazy(() => import('./nova/pages/NovaWizardPage').then(m => ({ default: m.NovaWizardPage })))
const NovaBillingPage = lazy(() => import('./nova/pages/NovaBillingPage').then(m => ({ default: m.NovaBillingPage })))
const NovaBillingCodesPage = lazy(() => import('./nova/pages/NovaBillingCodesPage').then(m => ({ default: m.NovaBillingCodesPage })))
const NovaBillingChannexPage = lazy(() => import('./nova/pages/NovaBillingChannexPage').then(m => ({ default: m.NovaBillingChannexPage })))
const NovaBillingApprovalsPage = lazy(() => import('./nova/pages/NovaBillingApprovalsPage').then(m => ({ default: m.NovaBillingApprovalsPage })))
const NovaBillingClientPage = lazy(() => import('./nova/pages/NovaBillingClientPage').then(m => ({ default: m.NovaBillingClientPage })))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

function getToken(): string | null {
  // Zustand v5 persist hydrates asynchronously — on first render the store
  // state is still the default (null). Fall back to the raw localStorage key
  // that setAuth() writes simultaneously so cold loads don't redirect to login.
  return useAuthStore.getState().token ?? localStorage.getItem('hk_token')
}

function PmsLayout({ children }: { children: React.ReactNode }) {
  useAuthStore((s) => s.token) // subscribe so re-renders happen after hydration
  if (!getToken()) return <Navigate to="/login" replace />
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  )
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  useAuthStore((s) => s.token) // subscribe so re-renders happen after hydration
  if (!getToken()) return <Navigate to="/login" replace />
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Global top bar with hamburger (AppMenu) — same UX everywhere */}
      <Sidebar />
      {/* pt-14 leaves room for the fixed top bar (h-14) */}
      <main className="pt-14 min-h-screen">
        {/*
          Sprint PAC-CLIENT-WARNING (2026-05-29) — banner inline al top
          del contenido. Scrollea con la página (less intrusive que fixed)
          pero siempre es lo primero que el cliente ve al cargar /dashboard
          o cualquier otra ruta. NN/g 2022: non-blocking warnings deben ser
          visibles sin obstruir flujo. Dismissible per-session (no per-render).
        */}
        <PacStatusBanner />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 lg:py-6">
          {children}
        </div>
      </main>
    </div>
  )
}

function NotificationAlertsMount() {
  // Hook mounted UNA vez global para escuchar SSE notification:new y
  // disparar sound + sonner banner. Vive en un componente propio porque
  // useSSE/useNotificationAlerts requieren estar dentro del React tree.
  useNotificationAlerts()
  return null
}

// AUTO-CHECKIN bug-hunt (2026-06-11) — las rutas PÚBLICAS (huésped/onboarding)
// NO deben montar la maquinaria de staff (SSE /api/events + sonidos/banners de
// notificaciones). Un huésped abriendo /precheckin en su móvil recibía un stream
// de notificaciones de staff (y, en un navegador con token de staff persistido,
// el SSE autenticado quedaba abierto). Gateamos por prefijo de ruta.
const PUBLIC_ROUTE_PREFIXES = ['/login', '/setup', '/precheckin', '/onboarding']
function ConditionalAlertsMount() {
  const { pathname } = useLocation()
  const isPublic = PUBLIC_ROUTE_PREFIXES.some((p) => pathname.startsWith(p))
  return isPublic ? null : <NotificationAlertsMount />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ConditionalAlertsMount />
        <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Day 17 — Org Owner activation. Public route. Token validation
              en backend (single-use, 72h TTL, SHA256 hashed at-rest). */}
          <Route path="/setup/:token" element={<SetupPage />} />
          {/* AUTO-CHECKIN — mini web-app pública del huésped (pre-arrival) */}
          <Route path="/precheckin/:token" element={<PrecheckinPage />} />
          {/* Netflix-style trial — card capture post-password (Day 2) */}
          <Route path="/onboarding/card" element={<OnboardingCardCapture />} />
          <Route path="/dashboard"       element={<ProtectedLayout><DashboardPage /></ProtectedLayout>} />
          {/* Sprint 9 D15 consolidación: /overrides y /planning → /kanban.
              Acciones operativas (confirmar salida, ad-hoc, forzar URGENT,
              limpieza profunda) viven en kanban. Redirects mantenidos
              1-2 semanas por deep-links externos. Eliminar después. */}
          <Route path="/overrides"       element={<Navigate to="/kanban" replace />} />
          <Route path="/planning"        element={<Navigate to="/kanban" replace />} />
          {/* /rooms (board "Estado de habitaciones") deprecado 2026-06-09 → Kanban */}
          <Route path="/rooms"           element={<Navigate to="/kanban" replace />} />
          <Route path="/pms"             element={<PmsLayout><PmsPage /></PmsLayout>} />
          <Route path="/kanban"          element={<ProtectedLayout><KanbanPage /></ProtectedLayout>} />
          <Route path="/checkouts"       element={<ProtectedLayout><CheckoutsPage /></ProtectedLayout>} />
          <Route path="/discrepancies"   element={<ProtectedLayout><DiscrepanciesPage /></ProtectedLayout>} />
          <Route path="/channex/conflicts" element={<ProtectedLayout><ChannexConflictsPage /></ProtectedLayout>} />
          <Route path="/settings/channex" element={<ProtectedLayout><ChannexAdminPage /></ProtectedLayout>} />
          <Route path="/blocks"          element={<ProtectedLayout><BlocksPage /></ProtectedLayout>} />
          <Route path="/maintenance"     element={<ProtectedLayout><MaintenancePage /></ProtectedLayout>} />
          <Route path="/reports"         element={<ProtectedLayout><ReportsPage /></ProtectedLayout>} />
          <Route path="/settings/:section?" element={<ProtectedLayout><SettingsPage /></ProtectedLayout>} />
          <Route path="/reservations/:id"  element={<ProtectedLayout><ReservationDetailPage /></ProtectedLayout>} />
          {/* ── Nova (Day 9+) ──────────────────────────────────────────── */}
          <Route path="/nova"            element={<Navigate to="/nova/clientes" replace />} />
          <Route path="/nova/clientes"   element={<NovaClientsPage />} />
          <Route path="/nova/dashboard"  element={<NovaDashboardPage />} />
          {/* Placeholders Days 10-15 — todos abren el NovaShell empty con el
              page-title. Cada uno se reemplaza por su page real al avanzar. */}
          <Route path="/nova/channex"    element={<NovaChannexPage />} />
          <Route path="/nova/wizard"     element={<NovaWizardPage />} />
          <Route path="/nova/billing"          element={<NovaBillingPage />} />
          <Route path="/nova/billing/codigos"      element={<NovaBillingCodesPage />} />
          <Route path="/nova/billing/channex"      element={<NovaBillingChannexPage />} />
          <Route path="/nova/billing/aprobaciones" element={<NovaBillingApprovalsPage />} />
          <Route path="/nova/billing/cliente"      element={<NovaBillingClientPage />} />
          <Route path="/nova/audit"      element={<NovaAuditLogPage />} />
          <Route path="/nova/settings"   element={<NovaSettingsPage />} />
          <Route path="*"                element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
      <SonnerToaster
        position="bottom-right"
        richColors
        closeButton
        expand
        gap={10}
        toastOptions={{
          classNames: {
            // Tarjeta base — bordes redondeados consistentes con resto del sistema,
            // shadow elevation +2 (Apple HIG depth), padding cómodo.
            toast:
              'rounded-xl shadow-[0_10px_30px_rgba(15,23,42,0.10),0_2px_8px_rgba(15,23,42,0.06)] border border-slate-200/70 backdrop-blur-sm',
            title: 'text-[13px] font-semibold tracking-tight',
            description: 'text-[12px] text-slate-600 leading-snug',
            // Action button — patrón shadcn primary chico, no el botón "OK" plano
            // de Sonner default. Diferenciador visual claro de la card.
            actionButton:
              '!bg-slate-900 !text-white !font-medium !text-[11px] !px-3 !py-1.5 !rounded-md hover:!bg-slate-700 transition-colors',
            cancelButton:
              '!bg-transparent !text-slate-600 !text-[11px] !font-medium !px-2 !py-1.5 hover:!text-slate-900',
            closeButton:
              '!border-slate-200 !bg-white hover:!bg-slate-50 !text-slate-500',
          },
        }}
      />
      {/* Sprint Mx-1B-W3 W3.6 — TicketDetailDrawer global. Cualquier
          componente (NotificationBell, BookingDetailSheet, TimelineScheduler,
          KanbanPage, etc.) puede abrirlo via useMaintenanceDrawer.open(id)
          sin acoplar state. El drawer aparece sobre la página actual
          manteniendo el contexto (Apple HIG 2024 Modality). */}
      <GlobalMaintenanceDrawer />
    </QueryClientProvider>
  )
}
