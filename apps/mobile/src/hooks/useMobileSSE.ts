/**
 * useMobileSSE — foreground-only SSE listener for the mobile app.
 *
 * Decision context (CLAUDE.md §42 / D8):
 *   Mobile devices have battery and data constraints that web doesn't.
 *   Keeping a persistent EventSource open while the app is backgrounded
 *   forces the OS to either:
 *     - keep the JS bridge alive (battery hog, fights iOS Doze / Android
 *       App Standby), or
 *     - kill the connection silently and reconnect on next foreground
 *       (the result we want, but unmanaged).
 *
 *   Apple's WWDC 2019 "Background Execution Demystified" and Google's
 *   Android Power Management docs both recommend: short-lived sockets
 *   tied to UI lifecycle. Push notifications cover the gap when the app
 *   is in the background — they are the OS-blessed wake-up channel.
 *
 *   This hook implements that pattern:
 *     - AppState 'active' (foreground)  → EventSource OPEN
 *     - AppState 'background' / 'inactive' → EventSource CLOSED
 *     - background → active transition  → fire `onForeground` so the
 *       consumer can refetch any stale state that may have changed
 *       while we were offline.
 *
 * Usage:
 *   useMobileSSE({
 *     onEvent: (e) => {
 *       if (e.type === 'task:ready') taskStore.refetch()
 *     },
 *     onForeground: () => {
 *       // App just came back from background — refresh all stores
 *       taskStore.refetch()
 *       notificationStore.refetch()
 *     },
 *   })
 *
 * Privacy:
 *   The backend filters events by propertyId from the JWT — the client
 *   only ever receives events for the active property. Switching property
 *   re-issues the JWT, which causes this hook to tear down and re-open.
 */

import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import EventSource from 'react-native-sse'
import type { SseEvent } from '@zenix/shared'
import { useAuthStore } from '../store/auth'
import { resolveApiBaseUrl } from '../api/client'
import { createLogger } from '../logger'

const log = createLogger('mobile-sse')

interface UseMobileSSEOptions {
  /** Called for every SSE message received while the connection is open. */
  onEvent: (event: SseEvent) => void
  /**
   * Called when the app transitions from background → foreground.
   * Use to refetch any state that may be stale (the SSE was closed
   * while you were offline, so push notifications are the only events
   * you may have missed).
   */
  onForeground?: () => void
}

export function useMobileSSE({ onEvent, onForeground }: UseMobileSSEOptions) {
  // Stash callbacks in refs so changes don't tear down the connection.
  const eventRef = useRef(onEvent)
  eventRef.current = onEvent
  const foregroundRef = useRef(onForeground)
  foregroundRef.current = onForeground

  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    if (!token) return

    let es: EventSource | null = null
    let lastAppState: AppStateStatus = AppState.currentState

    function open() {
      if (es) return  // already open
      const base = resolveApiBaseUrl()
      const url = `${base}/api/events?token=${encodeURIComponent(token!)}`
      log.debug('opening SSE', { url: url.replace(/token=[^&]+/, 'token=***') })

      es = new EventSource(url, {
        headers: {
          // Some intermediaries strip query auth — also send as header
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
        pollingInterval: 0,
      })

      ;(es as any).addEventListener('message', (e: any) => {
        try {
          const parsed = JSON.parse(e.data) as SseEvent
          eventRef.current(parsed)
        } catch (err) {
          log.warn('malformed SSE event', err)
        }
      })

      ;(es as any).addEventListener('ping', () => {})  // keepalive — ignore

      ;(es as any).addEventListener('error', (e: any) => {
        // 401 → token expired → logout. Anything else: lib reconnects.
        if (e?.xhrStatus === 401) {
          log.warn('SSE 401 — logging out')
          useAuthStore.getState().logout()
        } else {
          log.debug('SSE transient error', { status: e?.xhrStatus })
        }
      })
    }

    function close() {
      if (!es) return
      log.debug('closing SSE (background)')
      es.removeAllEventListeners()
      es.close()
      es = null
    }

    // Initial state: open if foreground, otherwise wait for foreground.
    if (lastAppState === 'active') open()

    const sub = AppState.addEventListener('change', (next) => {
      const wasBackground = lastAppState !== 'active'
      const isForeground  = next === 'active'

      if (isForeground && wasBackground) {
        log.info('foreground transition — reopening SSE + refetching stale state')
        open()
        foregroundRef.current?.()
      } else if (!isForeground && lastAppState === 'active') {
        // Going to background or inactive — release the connection.
        close()
      }

      lastAppState = next
    })

    return () => {
      sub.remove()
      close()
    }
  }, [token])
}
