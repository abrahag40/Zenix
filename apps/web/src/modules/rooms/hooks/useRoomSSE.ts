import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { SseEventType } from '@zenix/shared'
import { subscribeSse } from '@/lib/sseClient'

const ROOM_EVENT_TYPES = new Set<SseEventType>([
  'room:ready',
  'room:moved',
  'checkin:completed',
  'checkout:confirmed',
  'stay:no_show',
  'stay:no_show_reverted',
  'arrival:at_risk',
  // Block lifecycle events — keep calendar and all modules in sync
  'block:created',
  'block:approved',
  'block:rejected',
  'block:activated',
  'block:expired',
  'block:cancelled',
  'block:extended',
  // Sprint 9 — cleaning state animations on calendar blocks (CLAUDE.md §54-§57).
  // Each task lifecycle event changes `cleaningStatus` of the stay's room → re-fetch.
  'task:planned',
  'task:ready',
  'task:started',
  'task:paused',
  'task:resumed',
  'task:done',
  'task:verified',
  'task:cancelled',
  'task:deferred',
  'task:retry-scheduled',
  'task:blocked',
  'task:rescheduled',
])

/**
 * Subscribes to room-related events vía sseClient singleton e invalida queries
 * de room/timeline cuando llegan. Sprint SSE-RESILIENCE (2026-05-17):
 *
 * ANTES: este hook abría SU PROPIA EventSource a /api/events. Combinado con
 * useSSE + useSoftLockSSE = 3 conns por tab. Con HMR los cleanups raceaban
 * y se acumulaban zombies hasta agotar el pool HTTP/1.1.
 *
 * AHORA: subscriber filtrado del singleton compartido. 1 conn total para
 * todo el tab. HMR re-monta solo el handler, no la conexión.
 */
export function useRoomSSE(propertyId: string) {
  const queryClient = useQueryClient()
  const propertyIdRef = useRef(propertyId)
  propertyIdRef.current = propertyId

  useEffect(() => {
    if (!propertyId) return

    const unsub = subscribeSse((event) => {
      if (!ROOM_EVENT_TYPES.has(event.type)) return

      // Invalidate relevant queries — TanStack refetches active ones
      queryClient.invalidateQueries({
        queryKey: ['guest-stays'],
        refetchType: 'active',
      })
      queryClient.invalidateQueries({
        queryKey: ['rooms'],
        refetchType: 'active',
      })
      queryClient.invalidateQueries({
        queryKey: ['room-readiness'],
        refetchType: 'active',
      })
      queryClient.invalidateQueries({
        queryKey: ['blocks'],
        refetchType: 'active',
      })
    })

    return unsub
  }, [propertyId, queryClient])
}
