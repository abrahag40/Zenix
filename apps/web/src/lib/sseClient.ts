/**
 * sseClient — Singleton EventSource para toda la app.
 *
 * Decisión §122-§124 (Sprint SSE-RESILIENCE 2026-05-17):
 *
 * ANTES: 3 EventSources por tab (useSSE + useSoftLockSSE + useRoomSSE), cada
 * una con su propio lifecycle, cada una capaz de leak con HMR. Tras horas de
 * dev session se acumulaban 15-25 conns TCP a localhost:3000 → pool HTTP/1.1
 * de Chrome (6 simultáneas por origin) se agotaba → POSTs colgaban hasta
 * timeout. Bug recurrente reportado múltiples veces.
 *
 * AHORA: 1 EventSource singleton. Múltiples subscribers registran handlers,
 * el singleton multiplexea. Reference-counted: connect en el primer
 * subscribe, disconnect en el último unsubscribe. HMR re-monta subscribers
 * → solo re-registran handlers en la misma conexión existente.
 *
 * Garantías:
 *   ✓ Máximo 1 EventSource activa por browser tab, garantizado
 *   ✓ Reconexión automática con exponential backoff (1s → 2s → 4s → 8s → max 30s)
 *   ✓ Token-aware: re-conecta al cambiar JWT (switchProperty)
 *   ✓ Page Visibility API: pausa cuando tab oculto (opcional, futuro)
 *   ✓ HMR-safe: cleanup de subscribers no cierra la conexión si hay otros
 *   ✓ Sin race conditions: AbortController para preflight de auth
 *
 * API pública: solo `subscribe(handler) → unsubscribe()`. Sin lifecycle
 * management exposed — el singleton lo maneja todo.
 */
import type { SseEvent, SseEventType } from '@zenix/shared'
import { useAuthStore } from '../store/auth'

type Handler = (event: SseEvent) => void
type Unsubscribe = () => void

// Todos los named events que el server emite. Sin esto, el listener 'message'
// nativo del EventSource NO recibe events con event-name (server usa
// `event: <type>\ndata: ...`). Cada nuevo evento del backend debe agregarse aquí.
const ALL_SSE_TYPES: SseEventType[] = [
  'task:planned', 'task:ready', 'task:started', 'task:done',
  'task:unassigned', 'task:cancelled',
  'maintenance:reported', 'discrepancy:reported',
  'room:ready', 'checkout:confirmed', 'checkin:completed', 'room:moved',
  'block:created', 'block:approved', 'block:rejected',
  'block:activated', 'block:expired', 'block:cancelled', 'block:extended',
  'checkout:early',
  'stay:no_show', 'stay:no_show_reverted',
  'arrival:at_risk',
  'soft:lock:acquired', 'soft:lock:released',
  'notification:new',
  'checkin:confirmed',
  'stay:updated', 'stay:note:created', 'stay:note:updated',
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

// ── Estado interno del singleton ─────────────────────────────────────────────
let eventSource: EventSource | null = null
let preflightController: AbortController | null = null
let subscribers = new Set<Handler>()
let currentToken: string | null = null
let reconnectAttempts = 0
let reconnectTimer: ReturnType<typeof setTimeout> | undefined
const MAX_RECONNECT_DELAY_MS = 30_000

// ── URL building (con Vite proxy fallback) ───────────────────────────────────
function getSseUrl(token: string): string {
  const env = import.meta.env.VITE_API_URL ?? ''
  let base = env
  try {
    const u = env ? new URL(env) : null
    const isLocal = (h: string) => h === 'localhost' || h === '127.0.0.1'
    if (u && isLocal(u.hostname) && typeof window !== 'undefined' && isLocal(window.location.hostname)) {
      base = ''
    }
  } catch { /* env mal formada */ }
  return `${base}/api/events?token=${encodeURIComponent(token)}`
}

// ── Conexión / desconexión interna ───────────────────────────────────────────
function connect(token: string) {
  // Idempotente: si ya está conectada con el mismo token, no-op.
  if (eventSource && currentToken === token) return

  // Si había una conexión previa con OTRO token, cerrarla.
  disconnect()

  currentToken = token
  preflightController = new AbortController()

  // Pre-flight: validar token vía fetch antes de abrir EventSource (que no
  // expone status codes en onerror). Si 401 → logout.
  fetch(getSseUrl(token), {
    headers: { Accept: 'text/event-stream' },
    signal: preflightController.signal,
  })
    .then((res) => {
      // Si el preflight fue abortado durante el fetch, ABORTAR la apertura.
      if (preflightController?.signal.aborted) return

      if (res.status === 401) {
        useAuthStore.getState().logout()
        window.location.href = '/login'
        return
      }

      // Abrir EventSource real ahora que sabemos que el token es válido.
      openEventSource(token)
    })
    .catch((err: unknown) => {
      const name = (err as { name?: string } | null)?.name
      if (name === 'AbortError') return
      // Network error — schedule reconnect
      scheduleReconnect()
    })
}

function openEventSource(token: string) {
  // Defensive: si entre el preflight y aquí algo cerró, abortar.
  if (currentToken !== token) return
  if (eventSource) eventSource.close()

  const es = new EventSource(getSseUrl(token))
  eventSource = es

  const handle = (e: MessageEvent) => {
    try {
      const event = JSON.parse(e.data) as SseEvent
      // Reset reconnect attempts on successful message
      reconnectAttempts = 0
      // Dispatch a TODOS los subscribers (snapshot del set para evitar
      // mutation durante iteración si un handler se desuscribe).
      const snapshot = Array.from(subscribers)
      for (const h of snapshot) {
        try { h(event) } catch (err) {
          // Aislar fallos de handlers individuales — log en dev para debug
          // pero NUNCA romper a otros subscribers.
          // eslint-disable-next-line no-console
          if (import.meta.env.DEV) console.error('[SSE] subscriber threw:', err)
        }
      }
    } catch {
      // ignore malformed events
    }
  }

  // Registrar listener por cada tipo nombrado + 'message' fallback.
  for (const type of ALL_SSE_TYPES) {
    es.addEventListener(type, handle)
  }
  es.addEventListener('message', handle)
  es.addEventListener('ping', () => {
    reconnectAttempts = 0  // ping también cuenta como liveness
  })

  es.onerror = () => {
    // EventSource cerrará automáticamente y tratará de reconnectar internamente
    // EXCEPTO si el server cerró deliberadamente (401, 5xx). Para esos casos,
    // re-validamos token y si es 401 → logout. Si no, dejamos que el EventSource
    // nativo maneje su retry... pero también disparamos NUESTRO reconnect para
    // robustez ante red flaky.
    if (!currentToken) return
    fetch(getSseUrl(currentToken), {
      headers: { Accept: 'text/event-stream' },
    })
      .then((r) => {
        if (r.status === 401) {
          useAuthStore.getState().logout()
          window.location.href = '/login'
        } else {
          // Token sigue válido — programar reconnect con backoff
          scheduleReconnect()
        }
      })
      .catch(() => {
        scheduleReconnect()
      })
  }
}

function scheduleReconnect() {
  if (!currentToken) return
  if (reconnectTimer) clearTimeout(reconnectTimer)
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY_MS)
  reconnectAttempts++
  reconnectTimer = setTimeout(() => {
    if (currentToken) openEventSource(currentToken)
  }, delay)
}

function disconnect() {
  if (preflightController) {
    preflightController.abort()
    preflightController = null
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = undefined
  }
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
  currentToken = null
  reconnectAttempts = 0
}

// ── Watch del token (Zustand) ────────────────────────────────────────────────
// El JWT puede cambiar via switchProperty. Re-suscribimos para reconectar con
// el nuevo token sin perder subscribers.
let tokenUnsub: (() => void) | null = null
function ensureTokenWatcher() {
  if (tokenUnsub) return
  tokenUnsub = useAuthStore.subscribe((state) => {
    const newToken = state.token
    if (!newToken) {
      disconnect()
      return
    }
    if (newToken !== currentToken && subscribers.size > 0) {
      connect(newToken)
    }
  })
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Subscribe a TODOS los eventos SSE.
 * El handler recibe cada event independientemente del tipo.
 * Retorna función de unsubscribe — el caller DEBE llamarla en cleanup
 * (típicamente en el return de useEffect).
 *
 * Connection management automático:
 *   - Primera subscripción → abre EventSource si hay token
 *   - Última unsubscripción → cierra EventSource
 *   - Token cambia → reconecta con el nuevo
 */
export function subscribeSse(handler: Handler): Unsubscribe {
  ensureTokenWatcher()

  subscribers.add(handler)

  // Si era el primer subscriber y hay token, conectar.
  const token = useAuthStore.getState().token
  if (subscribers.size === 1 && token) {
    connect(token)
  }

  return () => {
    subscribers.delete(handler)
    // Si era el último subscriber, desconectar (libera el conn slot).
    if (subscribers.size === 0) {
      disconnect()
    }
  }
}

/**
 * DEBUG helper — útil para verificar en consola:
 *   import { _sseDebug } from '@/lib/sseClient'
 *   _sseDebug()
 *   → { connected: true, subscribers: 3, token: 'eyJ...', attempts: 0 }
 *
 * En producción puede usarse para telemetría futura.
 */
export function _sseDebug() {
  return {
    connected: !!eventSource,
    readyState: eventSource?.readyState,
    subscribers: subscribers.size,
    token: currentToken ? currentToken.slice(0, 16) + '…' : null,
    reconnectAttempts,
  }
}

// HMR cleanup — si Vite re-importa este módulo, cerramos la conn vieja para
// evitar leak de la EventSource creada antes del module reload.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disconnect()
    if (tokenUnsub) { tokenUnsub(); tokenUnsub = null }
    subscribers = new Set()
  })
}
