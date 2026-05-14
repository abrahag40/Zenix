/**
 * useMaintenanceActionableCount — devuelve el número de tickets que requieren
 * acción del rol actual. Alimenta el badge del sidebar (W3.4 §60 plus).
 *
 * Por rol (NN/g "Notification Badge Discipline" 2023: el badge solo cuenta
 * lo que el usuario debe atender — no todo lo activo, eso satura):
 *   · SUPERVISOR    → pendingApproval + status RESOLVED (por verificar)
 *   · TECHNICIAN    → asignados a mí en (ACKNOWLEDGED|IN_PROGRESS|WAITING_PARTS) +
 *                     OPEN sin asignar (cola disponible)
 *   · RECEPTIONIST  → tickets que causan habitación bloqueada (hasAutoBlock=true)
 *
 * Cero overhead: reutiliza la query `useMaintenanceTickets({ activeOnly: true })`
 * (compartida con MaintenancePage y KpiBar) y solo deriva el count.
 */
import { useMemo } from 'react'
import { useMaintenanceTickets } from './useMaintenanceTickets'
import type { StaffRole, MaintenanceTicketDto } from '@zenix/shared'

interface Args {
  role: StaffRole
  staffId: string
  department?: string | null
}

export interface MaintenanceActionableSummary {
  count: number
  /** Breakdown legible para el tooltip ("2 por verificar · 1 esperando aprobación"). */
  description: string | null
}

/**
 * Variante simple — retorna solo el número, para compatibilidad.
 * Para tooltip narrativo usar `useMaintenanceActionableSummary`.
 */
export function useMaintenanceActionableCount({ role, staffId, department }: Args): number {
  return useMaintenanceActionableSummary({ role, staffId, department }).count
}

/**
 * Resumen accionable con narrativa para tooltip (W3.4 fix).
 * Convierte el número crudo en "scent + significado" — Apple HIG 2024:
 * "Pair quantitative badges with descriptive context on hover."
 */
export function useMaintenanceActionableSummary({
  role,
  staffId,
  department,
}: Args): MaintenanceActionableSummary {
  const { data: tickets = [] } = useMaintenanceTickets({ activeOnly: true })

  return useMemo(() => {
    const filtered = filterByRole(tickets, role, staffId, department)
    const count = filtered.length
    if (count === 0) return { count: 0, description: null }

    if (role === 'SUPERVISOR') {
      const pendingApproval = filtered.filter((t) => t.pendingApproval).length
      const toVerify = filtered.filter((t) => t.status === 'RESOLVED').length
      const parts: string[] = []
      if (toVerify > 0) parts.push(`${toVerify} por verificar`)
      if (pendingApproval > 0) parts.push(`${pendingApproval} esperando aprobación`)
      return { count, description: parts.join(' · ') || null }
    }
    if (role === 'HOUSEKEEPER' && department === 'MAINTENANCE') {
      const mine = filtered.filter((t) => t.assignedToId === staffId).length
      const queue = filtered.filter((t) => t.status === 'OPEN' && !t.assignedToId).length
      const parts: string[] = []
      if (mine > 0) parts.push(`${mine} asignados a ti`)
      if (queue > 0) parts.push(`${queue} en cola disponibles`)
      return { count, description: parts.join(' · ') || null }
    }
    if (role === 'RECEPTIONIST') {
      return {
        count,
        description: `${count} habitación${count === 1 ? '' : 'es'} bloqueada${count === 1 ? '' : 's'} por mantenimiento`,
      }
    }
    return { count, description: null }
  }, [tickets, role, staffId, department])
}

function filterByRole(
  tickets: MaintenanceTicketDto[],
  role: StaffRole,
  staffId: string,
  department?: string | null,
): MaintenanceTicketDto[] {
  if (role === 'SUPERVISOR') {
    return tickets.filter(
      (t) => t.pendingApproval || t.status === 'RESOLVED',
    )
  }
  if (role === 'HOUSEKEEPER' && department === 'MAINTENANCE') {
    return tickets.filter(
      (t) =>
        (t.assignedToId === staffId &&
          (t.status === 'ACKNOWLEDGED' ||
            t.status === 'IN_PROGRESS' ||
            t.status === 'WAITING_PARTS')) ||
        (t.status === 'OPEN' && !t.assignedToId && !t.pendingApproval),
    )
  }
  if (role === 'RECEPTIONIST') {
    return tickets.filter((t) => t.hasAutoBlock)
  }
  return []
}
