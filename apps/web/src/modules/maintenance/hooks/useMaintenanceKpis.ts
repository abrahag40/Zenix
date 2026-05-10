/**
 * useMaintenanceKpis.ts — Sprint Mx-1B-W1
 *
 * KPI bar adaptativa por rol (§37 CLAUDE.md — KPIs adaptativos, no estáticos).
 * Mostrar info irrelevante al rol viola Cognitive Load (Sweller 1988) y
 * Apple HIG "Information Hierarchy" (surface what matters NOW).
 *
 * Cada KPI es clickeable → aplica un filtro al Kanban (patrón Stripe Dashboard).
 * Si el conteo es 0, el KPI se oculta para evitar ruido visual.
 */
import { useMemo } from 'react'
import type { MaintenanceTicketDto, StaffRole } from '@zenix/shared'
import type { MaintenanceTicketListQuery } from '@zenix/shared'

export interface KpiCard {
  id: string
  label: string
  count: number
  emoji: string
  color: 'red' | 'amber' | 'emerald' | 'slate' | 'blue'
  /** Filter to apply when clicking this KPI. */
  filter: Partial<MaintenanceTicketListQuery>
  /** If true, hide when count is 0 (Sweller — no ruido). */
  hideOnZero: boolean
}

interface KpiArgs {
  role: StaffRole
  staffId: string
  tickets: MaintenanceTicketDto[]
}

/**
 * Computación local — evita roundtrip extra al servidor. Como `tickets` ya
 * vino del endpoint principal, derivar los KPI de él es 1ms vs N requests.
 */
export function useMaintenanceKpis({ role, staffId, tickets }: KpiArgs): KpiCard[] {
  return useMemo(() => {
    const cards: KpiCard[] = []
    const supervisorView = role === 'SUPERVISOR'
    const myActive = tickets.filter(
      (t) =>
        t.assignedToId === staffId &&
        ['ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING_PARTS'].includes(t.status),
    )
    const queue = tickets.filter((t) => t.status === 'OPEN' && !t.assignedToId)
    const pendingApproval = tickets.filter(
      (t) => t.requiresApproval && t.pendingApproval,
    )
    const critical = tickets.filter(
      (t) =>
        t.priority === 'CRITICAL' &&
        ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING_PARTS'].includes(t.status),
    )
    const toVerify = tickets.filter((t) => t.status === 'RESOLVED')
    const slaBreached = tickets.filter((t) => !!t.slaBreachAt)
    const blockedRooms = tickets.filter((t) => t.hasAutoBlock)
    const myReports = tickets.filter(
      (t) => t.reportedById === staffId && t.requiresApproval && t.pendingApproval,
    )
    const waitingParts = tickets.filter(
      (t) => t.status === 'WAITING_PARTS' && t.assignedToId === staffId,
    )

    if (supervisorView) {
      // KPI 1 — Esperan tu aprobación (Flujo B)
      cards.push({
        id: 'pending-approval',
        label: 'Esperan tu aprobación',
        count: pendingApproval.length,
        emoji: '🟡',
        color: 'amber',
        filter: { pendingApprovalOnly: true },
        hideOnZero: true,
      })
      // KPI 2 — Críticos activos
      cards.push({
        id: 'critical',
        label: 'Críticos activos',
        count: critical.length,
        emoji: '🚨',
        color: 'red',
        filter: { priority: 'CRITICAL', activeOnly: true },
        hideOnZero: false,
      })
      // KPI 3 — Por verificar
      cards.push({
        id: 'to-verify',
        label: 'Por verificar',
        count: toVerify.length,
        emoji: '✅',
        color: 'blue',
        filter: { status: 'RESOLVED' },
        hideOnZero: true,
      })
      // KPI 4 — SLA vencidos
      cards.push({
        id: 'sla-breach',
        label: 'SLA vencidos',
        count: slaBreached.length,
        emoji: '⏰',
        color: 'red',
        filter: {},
        hideOnZero: true,
      })
      return cards.filter((c) => !c.hideOnZero || c.count > 0)
    }

    // ── MAINTENANCE / técnico (HOUSEKEEPER + Department=MAINTENANCE) ──────
    if (role === 'HOUSEKEEPER') {
      cards.push({
        id: 'my-active',
        label: 'Mis tickets activos',
        count: myActive.length,
        emoji: '🔧',
        color: 'emerald',
        filter: { assignedToId: staffId, activeOnly: true },
        hideOnZero: false,
      })
      cards.push({
        id: 'queue',
        label: 'Disponibles en cola',
        count: queue.length,
        emoji: '📥',
        color: 'amber',
        filter: { queueOnly: true },
        hideOnZero: false,
      })
      cards.push({
        id: 'waiting-parts',
        label: 'En espera de partes',
        count: waitingParts.length,
        emoji: '⏸',
        color: 'slate',
        filter: { status: 'WAITING_PARTS', assignedToId: staffId },
        hideOnZero: true,
      })
      return cards.filter((c) => !c.hideOnZero || c.count > 0)
    }

    // ── RECEPTIONIST ──────────────────────────────────────────────────────
    if (role === 'RECEPTIONIST') {
      cards.push({
        id: 'blocked-rooms',
        label: 'Habitaciones bloqueadas',
        count: blockedRooms.length,
        emoji: '🚨',
        color: 'red',
        filter: {},
        hideOnZero: false,
      })
      cards.push({
        id: 'my-reports',
        label: 'Mis reportes pendientes',
        count: myReports.length,
        emoji: '📝',
        color: 'amber',
        filter: { pendingApprovalOnly: true },
        hideOnZero: true,
      })
      return cards.filter((c) => !c.hideOnZero || c.count > 0)
    }

    return cards
  }, [role, staffId, tickets])
}

export const KPI_COLOR_CLASSES: Record<KpiCard['color'], string> = {
  red: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-100',
  amber: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 hover:bg-amber-100',
  emerald: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100',
  slate: 'bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-100',
  blue: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 hover:bg-blue-100',
}
