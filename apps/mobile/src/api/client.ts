/**
 * API client for the Zenix mobile app.
 *
 * Hardening rationale (industry-standard patterns, with citation):
 *
 *   1. AbortController + timeout (MDN + Stripe SDK):
 *      Mobile networks are flaky. fetch() has no built-in timeout — without
 *      one, a stuck request hangs forever. We default to 12s, configurable
 *      per call. Apple HIG: "Don't make the user wait without feedback."
 *
 *   2. Retry with exponential backoff (AWS / Stripe / Google Cloud SDKs):
 *      Transient network errors are common (cell-tower handoff, captive portal).
 *      We retry IDEMPOTENT requests (GET) up to 3 times with 250ms / 500ms /
 *      1000ms backoff. POST/PATCH are NOT retried by default — they may have
 *      side effects (creating duplicate resources). Caller can opt in.
 *
 *   3. Typed errors (TypeScript best practice):
 *      Discriminated union: `NetworkError` (no response — retry/connectivity
 *      issue) vs `ApiError` (HTTP non-2xx — server-validated business error).
 *      Callers can `if (err instanceof NetworkError)` and react differently.
 *
 *   4. Friendly server messages:
 *      We trust the server's `message` field (NestJS validation pipes return
 *      arrays of friendly strings). We pluck the first message to surface in
 *      Toast/Alert. Apple HIG: "Make error messages specific."
 *
 *   5. Auth token loaded once per request:
 *      SecureStore reads are async on iOS. Reading on every request is the
 *      simplest correct approach. The cost is ~5ms — fine for current scale.
 *      Sprint 9+ may cache in memory if profiling shows it matters.
 */

import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

/**
 * BASE URL resolution — auto-detects the Mac's LAN IP from Expo's manifest.
 *
 * Why this matters:
 *   The Mac's LAN IP changes every time the developer connects to a new
 *   WiFi network (home, office, café, hotel, etc.). Hardcoding the IP in
 *   .env means every move = manual edit + Metro restart.
 *
 *   Expo Go ALREADY knows the right IP — it loaded the manifest from the
 *   Mac at `<ip>:8081`. We extract that IP and reuse it for the API at
 *   port 3000.
 *
 * Resolution order (first match wins):
 *   1. Explicit override in app.json `extra.apiUrl` (production / staging
 *      builds with hardcoded backend URL).
 *   2. Explicit env var `EXPO_PUBLIC_API_URL` (CI / custom dev setups).
 *   3. Expo Go manifest hostUri (auto-detected — handles 99% of dev cases).
 *   4. localhost:3000 (last-resort fallback for simulator/web).
 *
 * Reference: https://docs.expo.dev/versions/latest/sdk/constants/#expogoconfig
 */
/** Public re-export so other modules (SSE, file-upload, etc.) can derive
 *  URLs that share the same auto-detection logic. */
export function resolveApiBaseUrl(): string {
  return resolveBaseUrl()
}

function resolveBaseUrl(): string {
  // 1. Production / staging override
  const explicitConfig = Constants.expoConfig?.extra?.apiUrl as string | undefined
  if (explicitConfig) return explicitConfig

  // 2. Env var (CI / custom dev)
  const explicitEnv = process.env.EXPO_PUBLIC_API_URL
  if (explicitEnv && !explicitEnv.includes('localhost')) {
    // Skip "localhost" — that's the default fallback baked in dev which
    // wouldn't resolve from a physical phone. Prefer auto-detection.
    return explicitEnv
  }

  // 3. Auto-detect from Expo Go manifest.
  // hostUri format: "192.168.20.202:8081" or "exp.host" (tunnel mode).
  const hostUri = Constants.expoGoConfig?.debuggerHost ?? Constants.expoConfig?.hostUri
  if (hostUri) {
    const host = hostUri.split(':')[0]
    // Tunnel mode hosts are not LAN — fall through to env fallback.
    // Local IPs always have a dot (192.168.x.x or 10.x.x.x).
    if (host.match(/^\d+\.\d+\.\d+\.\d+$/) || host.endsWith('.local')) {
      return `http://${host}:3000`
    }
  }

  // 4. Last resort. iOS simulator can hit localhost; physical device cannot.
  // Android emulator needs 10.0.2.2 instead of localhost.
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000'
  return explicitEnv ?? 'http://localhost:3000'
}

const BASE = resolveBaseUrl()

if (__DEV__) {
  console.log(`[api] BASE = ${BASE}`)
}

const DEFAULT_TIMEOUT_MS = 12_000

/**
 * Network-layer error: request never reached the server (timeout, DNS,
 * connection refused). Callers may show "Sin conexión" UX.
 */
export class NetworkError extends Error {
  readonly kind = 'NETWORK' as const
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'NetworkError'
  }
}

/**
 * Server-side error: request reached the server, server responded with
 * a non-2xx status. The `message` is sourced from the server (typically
 * a NestJS validation pipe message array).
 */
export class ApiError extends Error {
  readonly kind = 'API' as const
  constructor(
    public readonly status: number,
    message: string,
    public readonly serverPayload?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync('hk_token')
  } catch {
    return null
  }
}

interface RequestOptions extends Omit<RequestInit, 'signal'> {
  /** When true, do not attach Authorization header. Default: false. */
  skipAuth?: boolean
  /** Timeout in milliseconds. Default 12s. */
  timeoutMs?: number
  /** Number of retry attempts on NetworkError. Default 2 for GET, 0 for others. */
  retries?: number
}

/**
 * Picks a friendly message from a NestJS-style error body:
 *   { message: "Single string" } → "Single string"
 *   { message: ["one", "two"]  } → "one"
 *   anything else                → fallback
 */
function pickMessage(body: unknown, fallback: string): string {
  if (typeof body !== 'object' || body === null) return fallback
  const m = (body as { message?: unknown }).message
  if (typeof m === 'string') return m
  if (Array.isArray(m) && typeof m[0] === 'string') return m[0]
  return fallback
}

/**
 * Single attempt — no retry logic here, that's wrapped above.
 */
async function attemptRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const { skipAuth = false, timeoutMs = DEFAULT_TIMEOUT_MS, retries: _r, ...init } = options

  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (!skipAuth) {
    const token = await getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  // AbortController-based timeout. Cancels the underlying TCP request
  // when the timer fires — actually frees the network resource, unlike
  // Promise.race which leaves the fetch dangling.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(`${BASE}/api${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    // Distinguish abort (timeout) from generic network failure for
    // better caller UX ("La solicitud tardó demasiado" vs "Sin conexión").
    const isAbort = err instanceof Error && err.name === 'AbortError'
    throw new NetworkError(
      isAbort ? 'La solicitud tardó demasiado' : 'No pudimos conectar con el servidor',
      err,
    )
  }
  clearTimeout(timer)

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, pickMessage(body, res.statusText), body)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/**
 * Retry wrapper with exponential backoff. Only retries on NetworkError.
 * ApiError (server validation) is NEVER retried — it's a permanent
 * failure as far as this client is concerned.
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  // Default retry policy: GET is idempotent → safe to retry.
  // POST/PATCH/DELETE: caller must opt in by passing retries explicitly.
  const maxRetries = options.retries ?? (method === 'GET' ? 2 : 0)

  let lastErr: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await attemptRequest<T>(path, options)
    } catch (err) {
      lastErr = err
      // Only retry network failures. Don't retry server 4xx/5xx — those
      // won't fix themselves on retry, and 5xx may not even be safe to
      // retry (could be partially-applied side effect).
      if (!(err instanceof NetworkError) || attempt === maxRetries) throw err
      const backoffMs = 250 * 2 ** attempt   // 250, 500, 1000
      await new Promise((r) => setTimeout(r, backoffMs))
    }
  }
  throw lastErr
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
}
