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

export function useMaintenanceActionableCount({ role, staffId, department }: Args): number {
  // El query es shared — staleTime 30s y SSE invalida en tiempo real.
  const { data: tickets = [] } = useMaintenanceTickets({ activeOnly: true })

  return useMemo(() => filterByRole(tickets, role, staffId, department).length, [
    tickets,
    role,
    staffId,
    department,
  ])
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
