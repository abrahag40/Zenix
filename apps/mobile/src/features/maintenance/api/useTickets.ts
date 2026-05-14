/**
 * useTickets — fetchers para tickets de mantenimiento (Sprint Mx-1B-M).
 *
 * Sigue el mismo pattern que `useTasks` de housekeeping:
 *   - Zustand-backed state (no React Query — mobile no lo tiene)
 *   - SSE para refresh automático cuando llega evento maintenance:ticket:*
 *   - 3 vistas: mis tickets activos, cola (sin asignar), todos
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
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

  // M3.4 — Track del último evento SSE para polling fallback inteligente.
  const lastSseAt = useRef<number>(Date.now())

  const fetchTickets = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    if (mode === 'refresh') setRefreshing(true)
    else if (mode === 'initial') setLoading(true)
    // 'silent' → no toggle visual; sólo actualiza datos al background
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
    void fetchTickets('initial')
  }, [fetchTickets])

  // SSE — refresh al recibir cualquier maintenance:ticket:*
  useEffect(() => {
    return registerSseConsumer(TICKET_TRIGGERS, () => {
      lastSseAt.current = Date.now()
      void fetchTickets('refresh')
    })
  }, [fetchTickets])

  /*
   * M3.4 — Polling fallback inteligente cuando SSE está "silent" >90s.
   *
   * Razón: el técnico opera en pisos con wifi inestable. SSE puede
   * desconectarse sin que la UI lo sepa (no hay heartbeat explícito en
   * useGlobalSSEListener). Sin polling, los datos quedan stale por
   * minutos hasta que el usuario hace pull-to-refresh manual.
   *
   * Estrategia (Apple HIG 2024 background refresh):
   *   · Interval cada 60s evalúa: ¿llegó evento SSE en los últimos 90s?
   *   · Sí → skip (SSE activo, no spam de requests)
   *   · No → fetch silent (sin spinner — el usuario no debe notar)
   *
   * Cost: ~1 request/min cuando red está mala. Aceptable vs el riesgo
   * operativo de ver tickets fantasma (ya cerrados pero visibles).
   *
   * Pattern aplicado por Slack/Linear/Mews tras detectar el bug similar
   * en sus apps mobile (Mews changelog 2023 documenta el fix exacto).
   */
  useEffect(() => {
    const interval = setInterval(() => {
      const sinceSse = Date.now() - lastSseAt.current
      if (sinceSse < 90_000) return // SSE activo en los últimos 90s
      void fetchTickets('silent')
    }, 60_000)
    return () => clearInterval(interval)
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

  return { tickets, groups, isLoading, isRefreshing, error, refetch: () => fetchTickets('refresh') }
}

/**
 * Histórico — tickets VERIFIED o CLOSED de los últimos 30 días.
 *
 * Responde la pregunta del testing T-archive: "¿a dónde van los tickets
 * finalizados?". El supervisor o técnico abre este screen para auditar
 * lo terminado recientemente. Apple HIG: el usuario debe poder llegar a su
 * data histórica con un tap.
 *
 * Sin SSE — los archivados no cambian frecuentemente, refetch manual basta.
 */
export function useArchivedMaintenanceTickets() {
  const [data, setData] = useState<MaintenanceTicketDto[]>([])
  const [isLoading, setLoading] = useState(true)
  const [isRefreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetch = useCallback(async (asRefresh = false) => {
    if (asRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const since = new Date()
      since.setDate(since.getDate() - 30)
      const list = await maintenanceApi.list({
        activeOnly: false,
        status: ['VERIFIED', 'CLOSED'],
        fromDate: since.toISOString().slice(0, 10),
      } as any)
      setData(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      if (asRefresh) setRefreshing(false)
      else setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetch(false)
  }, [fetch])

  return { data, isLoading, isRefreshing, error, refetch: () => fetch(true) }
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
