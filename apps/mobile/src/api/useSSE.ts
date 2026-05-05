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
import type { SseEvent } from '@zenix/shared'
import { useAuthStore } from '../store/auth'
import { resolveApiBaseUrl } from './client'

type Handler = (event: SseEvent) => void

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
    // generic, but we accept any string event name from the server.
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
