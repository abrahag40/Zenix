/**
 * MaintenancePage.tsx — Sprint Mx-1B-W1
 *
 * Vista raíz del módulo de mantenimiento. Adaptativa por rol del actor:
 *   · SUPERVISOR  → "¿Qué necesita mi atención AHORA?" (aprobación + críticos + verificar)
 *   · HOUSEKEEPER (department=MAINTENANCE) → "¿Qué tengo asignado + cola?"
 *   · RECEPTIONIST → "¿Hay habitaciones bloqueadas?"
 *
 * Estructura:
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │ Header: "Mantenimiento"            [+ Nuevo ticket]             │
 *   │ KpiBar adaptativa (clickeable como filtro)                      │
 *   │ KanbanBoard 7 columnas (+ esperando aprobación si SUP)          │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * Side-effect: TicketDetailDrawer 480px slide-in al click en una card.
 *
 * El PropertySwitcher es heredado del GlobalTopBar — `/maintenance` no está
 * en `ROUTES_WITHOUT_SWITCHER` así que aparece automáticamente.
 */
import { useMemo, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '../store/auth'
import {
  useMaintenanceTickets,
  useMaintenanceSSE,
} from '../modules/maintenance/hooks/useMaintenanceTickets'
import {
  useMaintenanceKpis,
  type KpiCard,
} from '../modules/maintenance/hooks/useMaintenanceKpis'
import { KpiBar } from '../modules/maintenance/components/KpiBar'
import { KanbanBoard } from '../modules/maintenance/components/KanbanBoard'
import { TicketDetailDrawer } from '../modules/maintenance/components/TicketDetailDrawer'
import { CreateTicketDialog } from '../modules/maintenance/components/CreateTicketDialog'
import type {
  JwtPayload,
  MaintenanceTicketListQuery,
} from '@zenix/shared'

export function MaintenancePage() {
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)

  // Drawer + dialog state
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  // SSE subscription — UNA sola vez por página. NO mover dentro de hooks
  // hijos: cada useSSE abre EventSource y Chrome agota su pool HTTP/1.1.
  useMaintenanceSSE()

  // KPI activo (filtro aplicado al Kanban)
  const [activeKpi, setActiveKpi] = useState<KpiCard | null>(null)
  // Búsqueda local por friendlyId / título / habitación / asset.
  const [search, setSearch] = useState('')

  const queryFilter: MaintenanceTicketListQuery = activeKpi?.filter ?? { activeOnly: true }

  const { data: rawTickets = [], isLoading } = useMaintenanceTickets(queryFilter)
  // Para los KPIs queremos el universo completo, no el filtrado.
  const { data: allTickets = [] } = useMaintenanceTickets({ activeOnly: true })

  // Filtro local — case-insensitive sobre friendlyId, título, habitación, asset.
  const tickets = useMemo(() => {
    if (!search.trim()) return rawTickets
    const q = search.trim().toLowerCase()
    return rawTickets.filter((t) =>
      [t.friendlyId, t.title, t.roomNumber, t.assetTag, t.assignedToName, t.reportedByName]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q)),
    )
  }, [rawTickets, search])

  if (!user || !token) {
    return null
  }

  // El JwtPayload del actor — lo construimos desde el authStore (mismo
  // patrón que otras páginas; el store sincroniza con el JWT al login).
  const actor: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    department: user.department,
    propertyId: user.propertyId,
    organizationId: '', // not exposed in user shape — backend ignora; tenant se infiere del JWT
  }

  const kpis = useMaintenanceKpis({
    role: user.role,
    staffId: user.id,
    tickets: allTickets,
  })

  return (
    <div className="space-y-5">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Mantenimiento</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {roleSubtitle(user.role)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Búsqueda local — friendlyId / título / habitación / asset */}
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por ID, título, hab. o asset…"
              className="pl-8 pr-8 h-9 w-64 text-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Nuevo ticket
          </Button>
        </div>
      </header>

      {/* ── KPI Bar adaptativa ────────────────────────────────────────── */}
      <KpiBar
        kpis={kpis}
        activeKpiId={activeKpi?.id ?? null}
        onToggle={setActiveKpi}
      />

      {/* Indicador de filtro activo */}
      {activeKpi && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Filtro activo:</span>
          <button
            onClick={() => setActiveKpi(null)}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700"
          >
            {activeKpi.emoji} {activeKpi.label}
            <span className="ml-1 text-slate-400">✕</span>
          </button>
        </div>
      )}

      {/* ── Kanban ─────────────────────────────────────────────────────── */}
      {isLoading ? (
        <KanbanSkeleton />
      ) : (
        <KanbanBoard
          tickets={tickets}
          role={user.role}
          onSelectTicket={setSelectedId}
        />
      )}

      {/* ── Drawer detalle ─────────────────────────────────────────────── */}
      <TicketDetailDrawer
        ticketId={selectedId}
        actor={actor}
        onClose={() => setSelectedId(null)}
      />

      {/* ── Dialog crear ───────────────────────────────────────────────── */}
      <CreateTicketDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        defaultRequireApproval={
          // Housekeepers y recepcionistas crean con aprobación por default
          user.role !== 'SUPERVISOR'
        }
      />
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────

function roleSubtitle(role: string): string {
  switch (role) {
    case 'SUPERVISOR':
      return 'Aprueba reportes, asigna técnicos, verifica resoluciones.'
    case 'HOUSEKEEPER':
      return 'Tus tickets activos y disponibles en cola.'
    case 'RECEPTIONIST':
      return 'Habitaciones bloqueadas y tus reportes en proceso.'
    default:
      return 'Sistema de tickets de mantenimiento.'
  }
}

function KanbanSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="w-72 shrink-0 space-y-2">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ))}
    </div>
  )
}
