/**
 * useSSE — Server-Sent Events listener para mobile.
 *
 * Wrap de `react-native-sse` (no hay EventSource nativo en RN). Usamos
 * la lib porque permite headers Bearer (el EventSource API estándar no).
 *
 * Conexión:
 *   GET /api/events?token=<jwt>
 *
 * Cada mensaje recibido se parsea como SseEvent y se entrega al
 * callback. El consumer típicamente:
 *   - invalida queries de React Query (no aplica — usamos useApiResource)
 *   - dispara `refetch()` en hooks específicos
 *   - actualiza optimistically un store (Zustand) si aplica
 *
 * Lifecycle:
 *   - Conexión se abre cuando el callback existe + token está set
 *   - Cierra automáticamente al unmount o logout
 *   - Reconexión automática (lib la maneja)
 *
 * Privacy:
 *   El backend filtra eventos por propertyId del token. No es necesario
 *   filtrar en cliente — solo recibimos eventos de NUESTRA propiedad.
 */

import { useEffect, useRef } from 'react'
import EventSource from 'react-native-sse'
import type { SseEvent, SseEventType } from '@zenix/shared'
import { useAuthStore } from '../store/auth'
import { resolveApiBaseUrl } from './client'

type Handler = (event: SseEvent) => void

// react-native-sse (igual que el EventSource del browser) solo dispara el
// listener 'message' para eventos SIN nombre. El backend Zenix emite TODOS
// los eventos con nombre (`event: task:ready\ndata: ...\n\n`), por lo que
// debemos registrar un listener por cada tipo conocido. Sin esto, los
// eventos jamás llegan al callback en mobile.
//
// Mismo bug que se arregló en apps/web/src/hooks/useSSE.ts (commit 8H).
// Sintomatología: el housekeeper no recibe la alarma al checkout, solo se
// entera vía pull-to-refresh. La fallback Mechanism 2 (task store watcher)
// dispara la alarma para el primer READY que encuentra, NO el más reciente.
const ALL_SSE_TYPES: SseEventType[] = [
  'task:planned', 'task:ready', 'task:started', 'task:paused', 'task:resumed',
  'task:done', 'task:verified', 'task:unassigned', 'task:cancelled',
  'task:carryover', 'task:auto-assigned', 'task:reassigned',
  'task:extension-confirmed', 'task:deferred', 'task:retry-scheduled',
  'task:blocked', 'task:rescheduled', 'task:priority-overridden',
  'task:deep-clean-flagged', 'task:hold-placed', 'task:hold-released',
  'maintenance:reported', 'discrepancy:reported',
  'room:ready', 'checkout:confirmed', 'checkin:completed', 'room:moved',
  'block:created', 'block:approved', 'block:rejected',
  'block:activated', 'block:expired', 'block:cancelled', 'block:extended',
  'checkout:early',
  'stay:no_show', 'stay:no_show_reverted', 'arrival:at_risk',
  'soft:lock:acquired', 'soft:lock:released',
  'notification:new', 'checkin:confirmed',
  'roster:published', 'shift:absence', 'shift:clock-in', 'shift:clock-out',
  'stayover:published',
]

export function useSSE(onEvent: Handler) {
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent

  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    if (!token) return

    const base = resolveApiBaseUrl()
    const url = `${base}/api/events?token=${encodeURIComponent(token)}`

    const es = new EventSource(url, {
      headers: {
        // Some intermediaries strip query auth — also send as header
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
      // Keep connection alive; reconnect on failure with backoff
      pollingInterval: 0, // 0 = use SSE proper, not long-poll fallback
    })

    const handleMessage = (e: any) => {
      try {
        const parsed = JSON.parse(e.data) as SseEvent
        handlerRef.current(parsed)
      } catch {
        // ignore malformed events
      }
    }

    // Type cast to `any` — react-native-sse types are strict on the
    // generic, pero aceptamos cualquier nombre de evento del server.
    // Registrar TODOS los tipos nombrados (ver comentario ALL_SSE_TYPES arriba).
    for (const type of ALL_SSE_TYPES) {
      ;(es as any).addEventListener(type, handleMessage)
    }
    // Fallback para eventos sin nombre (legacy o ad-hoc)
    ;(es as any).addEventListener('message', handleMessage)
    // Some servers send a "ping" event for keepalive — ignore silently
    ;(es as any).addEventListener('ping', () => {})

    ;(es as any).addEventListener('error', (e: any) => {
      // 401 → token expired → logout
      if (e?.xhrStatus === 401) {
        useAuthStore.getState().logout()
      }
      // Other errors: lib reconnects automatically
    })

    return () => {
      es.removeAllEventListeners()
      es.close()
    }
  }, [token])
}
