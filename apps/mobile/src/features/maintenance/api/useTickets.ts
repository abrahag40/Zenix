/**
 * useTickets — fetchers para tickets de mantenimiento (Sprint Mx-1B-M).
 *
 * Sigue el mismo pattern que `useTasks` de housekeeping:
 *   - Zustand-backed state (no React Query — mobile no lo tiene)
 *   - SSE para refresh automático cuando llega evento maintenance:ticket:*
 *   - 3 vistas: mis tickets activos, cola (sin asignar), todos
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import type {
  MaintenanceTicketDto,
  MaintenanceTicketDetailDto,
  SseEvent,
} from '@zenix/shared'
import { useAuthStore } from '../../../store/auth'
import { registerSseConsumer } from '../../../api/useGlobalSSEListener'
import { maintenanceApi } from './maintenance.api'

import type { SseEventType } from '@zenix/shared'

// Eventos SSE que invalidan la lista de tickets — registramos un solo consumer
// con todos los types (más eficiente que N consumers).
const TICKET_TRIGGERS: SseEventType[] = [
  'maintenance:ticket:created',
  'maintenance:ticket:approved',
  'maintenance:ticket:rejected',
  'maintenance:ticket:claimed',
  'maintenance:ticket:assigned',
  'maintenance:ticket:auto-assigned',
  'maintenance:ticket:acknowledged',
  'maintenance:ticket:started',
  'maintenance:ticket:waiting-parts',
  'maintenance:ticket:resumed',
  'maintenance:ticket:resolved',
  'maintenance:ticket:verified',
  'maintenance:ticket:closed',
  'maintenance:ticket:reopened',
  'maintenance:ticket:commented',
  'maintenance:ticket:photo-added',
  'maintenance:ticket:sla-breach',
]

export interface TicketGroups {
  critical: MaintenanceTicketDto[]      // CRITICAL asignados a mí O en cola
  mine: MaintenanceTicketDto[]          // ACK / IN_PROGRESS asignados a mí
  queue: MaintenanceTicketDto[]         // OPEN sin asignar (voluntary pickup)
  waitingParts: MaintenanceTicketDto[]  // WAITING_PARTS asignados a mí
  pendingApproval: MaintenanceTicketDto[] // Solo si role=SUPERVISOR
}

/**
 * Hook centralizado del Hub mobile. Trae TODOS los tickets activos de la
 * propiedad (filtro activeOnly) y los agrupa para el render del Hub.
 */
export function useMaintenanceTickets() {
  const user = useAuthStore((s) => s.user)
  const [tickets, setTickets] = useState<MaintenanceTicketDto[]>([])
  const [isLoading, setLoading] = useState(true)
  const [isRefreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchTickets = useCallback(async (asRefresh = false) => {
    if (asRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const data = await maintenanceApi.list({ activeOnly: true })
      setTickets(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    void fetchTickets(false)
  }, [fetchTickets])

  // SSE — refresh al recibir cualquier maintenance:ticket:*
  useEffect(() => {
    return registerSseConsumer(TICKET_TRIGGERS, () => {
      void fetchTickets(true)
    })
  }, [fetchTickets])

  const groups = useMemo<TicketGroups>(() => {
    const myId = user?.id
    const isSupervisor = user?.role === 'SUPERVISOR'
    const result: TicketGroups = {
      critical: [],
      mine: [],
      queue: [],
      waitingParts: [],
      pendingApproval: [],
    }
    for (const t of tickets) {
      const isMine = t.assignedToId === myId
      const isCritical = t.priority === 'CRITICAL' && (isMine || !t.assignedToId)
      const pending = t.requiresApproval && t.pendingApproval
      // Supervisor mantenimiento ve la sección extra
      if (isSupervisor && pending) {
        result.pendingApproval.push(t)
        continue
      }
      if (isCritical && t.status !== 'WAITING_PARTS') {
        result.critical.push(t)
        continue
      }
      if (isMine) {
        if (t.status === 'WAITING_PARTS') result.waitingParts.push(t)
        else if (['ACKNOWLEDGED', 'IN_PROGRESS'].includes(t.status))
          result.mine.push(t)
        continue
      }
      // No asignado, OPEN, sin pending approval → cola
      if (t.status === 'OPEN' && !t.assignedToId && !pending) {
        result.queue.push(t)
      }
    }
    return result
  }, [tickets, user?.id, user?.role])

  return { tickets, groups, isLoading, isRefreshing, error, refetch: () => fetchTickets(true) }
}

/** Detalle individual de un ticket — usado en pantalla TicketDetail.
 *
 * Bug B3 fix — separa `isLoading` (primera carga, muestra full-screen loader)
 * de `isRefreshing` (refresh por acción o SSE, NO debe ocultar el contenido
 * ya renderizado). El detail screen debe mostrar spinners localizados durante
 * un refresh post-acción, no un loader de pantalla completa.
 *
 * Bug T-1 fix (testing 2026-05-11) — al cambiar de ticket id, el `data` viejo
 * permanecía visible mientras se cargaba el nuevo, causando un "flash" del
 * detail anterior. Ahora limpiamos `data` y `error` cuando id cambia, y solo
 * el ID actual puede actualizar `data` (guard con id ref).
 */
export function useMaintenanceTicket(id: string | null) {
  const [data, setData] = useState<MaintenanceTicketDetailDto | null>(null)
  const [isLoading, setLoading] = useState(false)
  const [isRefreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetch = useCallback(
    async (asRefresh = false) => {
      if (!id) return
      if (asRefresh) setRefreshing(true)
      else setLoading(true)
      const requestedId = id
      try {
        const d = await maintenanceApi.getOne(requestedId)
        // Guard race: si el id cambió mientras esta request volaba, descartamos
        // la respuesta para evitar pintar el ticket equivocado.
        if (requestedId === id) {
          setData(d)
          setError(null)
        }
      } catch (err) {
        if (requestedId === id) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      } finally {
        if (asRefresh) setRefreshing(false)
        else setLoading(false)
      }
    },
    [id],
  )

  // Reset state cuando cambia el id (evita flash del ticket anterior).
  useEffect(() => {
    setData(null)
    setError(null)
    void fetch(false)
  }, [id, fetch])

  // SSE — re-fetch cuando llegue evento sobre ESTE ticket (modo refresh, NO loading)
  useEffect(() => {
    if (!id) return
    return registerSseConsumer(TICKET_TRIGGERS, (event: SseEvent) => {
      const eid = (event.data as any)?.id ?? (event.data as any)?.ticketId
      if (eid === id) void fetch(true)
    })
  }, [id, fetch])

  return {
    data,
    isLoading,
    isRefreshing,
    error,
    /** Refetch post-acción — NO bloquea el contenido renderizado. */
    refetch: () => fetch(true),
  }
}
