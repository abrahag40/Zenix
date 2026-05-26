import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
// Sprint CHANNEX-UX-E2-E3 — single toast lib (Sonner bottom-right richColors).
// Previously dual stack (react-hot-toast top-right + sonner bottom-right)
// generaba dos UIs distintos para el mismo concepto. Estandarizado a Sonner.
import { Toaster as SonnerToaster } from 'sonner'
import { useAuthStore } from './store/auth'
import { Sidebar } from './components/Sidebar'
import { LoginPage } from './pages/LoginPage'
import { SetupPage } from './pages/SetupPage'
import { DashboardPage } from './pages/DashboardPage'
import { RoomsPage } from './pages/RoomsPage'
import { RoomsPage as PmsPage } from './modules/rooms/pages/RoomsPage'
// OperationalOverridesPage import retirado (Sprint 9 D15) — la página existe
// en /pages/ pero ya no se enruta. Las acciones se migraron a KanbanPage.
import { KanbanPage } from './pages/KanbanPage'
import { CheckoutsPage } from './pages/CheckoutsPage'
import { ReportsPage } from './pages/ReportsPage'
import { SettingsPage } from './pages/SettingsPage'
import { DiscrepanciesPage } from './pages/DiscrepanciesPage'
import ChannexConflictsPage from './pages/ChannexConflictsPage'
import ChannexAdminPage from './pages/ChannexAdminPage'
import { BlocksPage } from './pages/BlocksPage'
import { MaintenancePage } from './pages/MaintenancePage'
import { ReservationDetailPage } from './pages/ReservationDetailPage'
import { GlobalMaintenanceDrawer } from './components/GlobalMaintenanceDrawer'
import { useNotificationAlerts } from './hooks/useNotificationAlerts'
// Sprint NOVA-CHANNEX-COMMAND-CENTER Day 9 — Nova shell + landing
import { NovaClientsPage } from './nova/pages/NovaClientsPage'
import { NovaDashboardPage } from './nova/pages/NovaDashboardPage'
import { NovaSettingsPage } from './nova/pages/NovaSettingsPage'
// Day 10 — Channex Command Center
import { NovaChannexPage } from './nova/pages/NovaChannexPage'
// Day 13 — Audit log page
import { NovaAuditLogPage } from './nova/pages/NovaAuditLogPage'
// Day 14 — Wizard Zenix Activate
import { NovaWizardPage } from './nova/pages/NovaWizardPage'

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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <NotificationAlertsMount />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Day 17 — Org Owner activation. Public route. Token validation
              en backend (single-use, 72h TTL, SHA256 hashed at-rest). */}
          <Route path="/setup/:token" element={<SetupPage />} />
          <Route path="/dashboard"       element={<ProtectedLayout><DashboardPage /></ProtectedLayout>} />
          {/* Sprint 9 D15 consolidación: /overrides y /planning → /kanban.
              Acciones operativas (confirmar salida, ad-hoc, forzar URGENT,
              limpieza profunda) viven en kanban. Redirects mantenidos
              1-2 semanas por deep-links externos. Eliminar después. */}
          <Route path="/overrides"       element={<Navigate to="/kanban" replace />} />
          <Route path="/planning"        element={<Navigate to="/kanban" replace />} />
          <Route path="/rooms"           element={<ProtectedLayout><RoomsPage /></ProtectedLayout>} />
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
          <Route path="/nova/audit"      element={<NovaAuditLogPage />} />
          <Route path="/nova/settings"   element={<NovaSettingsPage />} />
          <Route path="*"                element={<Navigate to="/dashboard" replace />} />
        </Routes>
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
