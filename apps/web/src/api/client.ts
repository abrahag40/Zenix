/**
 * HTTP Client — Zenix frontend single entry point.
 *
 * ▸ Especificación formal: docs/engineering/http-client.md
 * ▸ Anclaje en project rules: CLAUDE.md §122
 *
 * Toda llamada HTTP del frontend pasa por aquí. NO se permite `fetch()` raw
 * fuera de este archivo (única excepción: useSSE.ts — usa EventSource que
 * no acepta el wrapper). Cualquier PR que rompa este contrato no merge.
 *
 * Garantías del cliente:
 *   - Auth automático (Bearer token desde Zustand store)
 *   - Timeout automático per verbo (GET 30s, POST/PATCH 20s, DELETE 15s)
 *   - 401 → logout + redirect a /login con returnTo
 *   - Errores tipados (`ApiError` con .status, .code machine-readable, .body)
 *   - Estado terminal para mutations (nunca queda en pending indefinido)
 *
 * Si necesitas modificar este archivo, lee la spec primero y actualiza:
 *   1. Este archivo
 *   2. docs/engineering/http-client.md
 *   3. CLAUDE.md §122
 */
import { useAuthStore } from '../store/auth'

// Sprint EDIT-RESERVATION iter 6 — en DEV con Vite, ignoramos VITE_API_URL
// si apunta a localhost:* y usamos URL relativa. Beneficios:
//   1. Same-origin → cero CORS preflight (saves 1 round-trip per request).
//   2. Pool de conexiones HTTP/1.1 compartido con la página (no se agota
//      por SSE leaks colaterales a localhost:3000).
//   3. Vite proxy ya configurado en vite.config.ts proxea /api → backend.
// En PROD (Vercel deploy), VITE_API_URL apunta al backend público real
// (no localhost) y se respeta tal cual.
function computeBase(): string {
  const env = import.meta.env.VITE_API_URL
  if (!env || env === '/') return ''
  // Si la URL es localhost (cualquier port) y estamos en localhost, usar
  // proxy relativo. Detección: parsear URL y comparar hostname.
  try {
    const url = new URL(env)
    const isDevLocalhost = (host: string) => host === 'localhost' || host === '127.0.0.1'
    if (isDevLocalhost(url.hostname) && typeof window !== 'undefined' && isDevLocalhost(window.location.hostname)) {
      return '' // → URL relativa → Vite proxy
    }
  } catch { /* env mal formada, fallthrough */ }
  return env.replace(/\/$/, '')
}
const BASE = computeBase()

function getToken(): string | null {
  return localStorage.getItem('hk_token')
}

// ── Global 401 guard ──────────────────────────────────────────────────────────
//
// When any request returns 401 (expired or invalid JWT), we immediately:
//   1. Call logout() to clear the token and Zustand state
//   2. Redirect to /login with:
//      - reason=session_expired  → login page shows an informative amber banner
//      - returnTo=<currentPath>  → after re-auth the user lands back where they were
//
// A module-level flag prevents a burst of simultaneous 401s from triggering
// multiple redirects (e.g. SSE + REST requests all failing at once).

let redirectingToLogin = false

function handleUnauthorized(): void {
  if (redirectingToLogin) return
  redirectingToLogin = true

  // Clear auth state — works outside React because Zustand exposes .getState()
  useAuthStore.getState().logout()

  const returnTo = encodeURIComponent(
    window.location.pathname + window.location.search,
  )
  // Full navigation (not React Router) so stale component state is flushed
  window.location.href = `/login?reason=session_expired&returnTo=${returnTo}`
}

// ─────────────────────────────────────────────────────────────────────────────

interface RequestOptions extends RequestInit {
  skipAuth?: boolean
  /**
   * Sprint EDIT-RESERVATION iter 6 — timeout en ms. Si el servidor no
   * responde en este tiempo, el fetch se aborta y se lanza `ApiError(0)`
   * con `code: 'TIMEOUT'`. Defaults por método:
   *   GET    → 30_000  (queries puras, tolera congestión)
   *   POST   → 20_000  (mutaciones, debe ser perceptible más rápido)
   *   PATCH  → 20_000
   *   DELETE → 15_000  (acción simple, debe responder rápido)
   *
   * Justificación: el browser por default NUNCA timeoutea fetch — un POST
   * puede quedarse esperando indefinido si la red glitch o el server
   * crashea mid-request. Mutations colgadas trampean al usuario en estado
   * "Cargando..." sin error visible. Pattern de Stripe SDK / axios.
   */
  timeoutMs?: number
}

// Defaults por verbo HTTP — perceptible vs paciencia razonable.
const TIMEOUT_DEFAULTS: Record<string, number> = {
  GET:    30_000,
  POST:   20_000,
  PATCH:  20_000,
  DELETE: 15_000,
}

// Throttle de errores de red para reducir ruido de consola cuando el backend
// está caído. Si el mismo endpoint timea N veces seguidas, solo loggeamos la
// PRIMERA dentro de una ventana de 30s. Sin esto la consola se llena de la
// misma URL repetida cada vez que React Query reintenta.
const errorLogThrottle = new Map<string, number>()
const ERROR_LOG_WINDOW_MS = 30_000
function shouldLogNetworkError(key: string): boolean {
  const now = Date.now()
  const last = errorLogThrottle.get(key)
  if (last && now - last < ERROR_LOG_WINDOW_MS) return false
  errorLogThrottle.set(key, now)
  // Periódico cleanup — evita leak en sesiones largas
  if (errorLogThrottle.size > 50) {
    for (const [k, t] of errorLogThrottle) {
      if (now - t > ERROR_LOG_WINDOW_MS) errorLogThrottle.delete(k)
    }
  }
  return true
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { skipAuth = false, timeoutMs, signal: callerSignal, ...init } = options
  const headers = new Headers(init.headers)

  if (!headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  if (!skipAuth) {
    const token = getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  const url = `${BASE}/api${path}`

  // Compose AbortSignal: caller-provided OR auto-timeout (lo que dispare primero).
  const method = (init.method ?? 'GET').toUpperCase()
  const effectiveTimeout = timeoutMs ?? TIMEOUT_DEFAULTS[method] ?? 30_000
  const timeoutSignal = AbortSignal.timeout(effectiveTimeout)
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutSignal])
    : timeoutSignal

  let res: Response
  try {
    res = await fetch(url, { ...init, headers, signal })
  } catch (networkError) {
    // Distinguir timeout vs network error genuino para mostrar mensaje accionable.
    const isTimeout =
      (networkError as { name?: string } | null)?.name === 'TimeoutError' ||
      timeoutSignal.aborted
    if (isTimeout) {
      // Throttled — solo 1 log por endpoint por ventana de 30s para no inundar
      // la consola cuando el backend está caído y React Query reintenta loops.
      if (shouldLogNetworkError(`TIMEOUT:${url}`)) {
        console.warn(`[API] Timeout (${effectiveTimeout}ms) → ${url}`)
      }
      throw new ApiError(
        0,
        `El servidor tardó más de ${Math.round(effectiveTimeout / 1000)}s en responder. Verifica tu conexión y reintenta.`,
        { code: 'TIMEOUT', timeoutMs: effectiveTimeout },
      )
    }
    // ERR_CONNECTION_REFUSED, offline, CORS preflight fail.
    const msg = 'No se pudo conectar con el servidor. Verifica que la API esté corriendo.'
    if (shouldLogNetworkError(`NETWORK:${url}`)) {
      console.warn(`[API] Network error → ${url}`, networkError)
    }
    throw new ApiError(0, msg, { code: 'NETWORK_ERROR' })
  }

  if (res.status === 401 && !options.skipAuth) {
    // Session expired or token invalid — redirect to login automatically
    handleUnauthorized()
    // Throw so any awaiting caller (mutation, query) receives a clean error
    // rather than trying to parse a 401 JSON body as valid data.
    throw new ApiError(401, 'Sesión expirada')
  }

  if (!res.ok) {
    let message = res.statusText
    let body: unknown
    try {
      body = await res.json()
      const b = body as { message?: string; error?: string }
      message = b.message ?? b.error ?? res.statusText
    } catch {
      // respuesta no-JSON — mantener statusText
    }
    console.error(`[API] ${res.status} ${res.url} — ${message}`)
    throw new ApiError(res.status, message, body)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Raw parsed body — preserva códigos machine-readable (§110 CHECK-IN-α). */
    public readonly body?: unknown,
  ) {
    super(message)
  }

  /**
   * NestJS BadRequest/ConflictException con un objeto { code, message, ... } se
   * serializa como `body.message` siendo el objeto entero. Este helper recupera
   * el `code` desde ambos shapes para que la UI lo pueda matchear.
   */
  get code(): string | undefined {
    if (this.body && typeof this.body === 'object') {
      const b = this.body as { code?: string; message?: { code?: string } | string }
      if (typeof b.code === 'string') return b.code
      if (b.message && typeof b.message === 'object' && typeof b.message.code === 'string') {
        return b.message.code
      }
    }
    return undefined
  }
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) =>
    request<T>(path, { method: 'GET', ...opts }),

  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body), ...opts }),

  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body), ...opts }),

  delete: <T>(path: string, opts?: RequestOptions) =>
    request<T>(path, { method: 'DELETE', ...opts }),

  /**
   * Multipart POST — para upload de archivos (Sprint Mx-1B-W2).
   * El browser fija automáticamente el `Content-Type: multipart/form-data;
   * boundary=…`; nuestro wrapper detecta FormData y NO sobrescribe el header.
   */
  postForm: <T>(path: string, form: FormData, opts?: RequestOptions) =>
    request<T>(path, { method: 'POST', body: form, ...opts }),
}
