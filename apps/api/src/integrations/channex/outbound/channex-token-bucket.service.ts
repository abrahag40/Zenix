import { Injectable, Logger } from '@nestjs/common'

/**
 * ChannexTokenBucketService — D-CHX-OUT-5, cert AP-2.3 + Test 12.
 *
 * Token bucket per (propertyId, kind) que enforce el rate limit oficial
 * Channex (verified 2026-05-22 docs):
 *   · 10 restrictions/rates per minute per property
 *   · 10 availability per minute per property
 *   · 20 ARI total per minute per property
 *
 * **Por qué in-memory en v1.0.0** (no Redis):
 *   1. Sin Redis deployment (cumple fase 1 infra §73 Vercel+Render+Neon).
 *   2. Single-pod worker garantiza una sola autoridad de tokens.
 *   3. Restart pierde estado pero las consecuencias son benignas (bucket
 *      reinicia lleno → 1× burst max al boot — Channex absorbe fácil).
 *
 * Refill model: cada 60s se restauran 10 tokens al cap. La consulta
 * `consume()` resta 1 si hay; si no, retorna `{ ok: false, retryAfterMs }`
 * indicando cuánto esperar.
 *
 * v1.0.5 → Redis-backed cuando escalemos multi-pod (sharded por propertyId).
 */
@Injectable()
export class ChannexTokenBucketService {
  private readonly logger = new Logger(ChannexTokenBucketService.name)

  /** Capacidad oficial Channex per (property, kind). */
  static readonly CAPACITY = 10
  /** Ventana de refill — 60s acumulados (token bucket model). */
  static readonly WINDOW_MS = 60_000

  /** key = `${propertyId}::${kind}` → state */
  private readonly buckets = new Map<string, BucketState>()

  /**
   * Intenta consumir 1 token para el (property, kind) dado.
   * - Si el bucket tiene tokens → retorna `{ ok: true }` y resta 1.
   * - Si está vacío → retorna `{ ok: false, retryAfterMs }` con el tiempo
   *   exacto hasta que un token vuelva a estar disponible.
   *
   * El worker usa el `retryAfterMs` para programar `nextAttemptAt` del row
   * (en vez de reintentar inmediato y saturar el bucket).
   */
  // ━━ CHANNEX-CERT ▸ Test 12 + AP-2.3 ▸ rate limit (10/min) ━━━━━━━━━━━━━━━━━
  // QUÉ MOSTRAR: 10 fichas por (propiedad, tipo) en ventana de 60s. Antes de
  // cada llamada pedimos una ficha; si no hay, diferimos (sin contar como
  // fallo). Imposible pasar de 10/min por diseño. Guía §3 (AP-2.3) / §7-Q6.
  consume(propertyId: string, kind: 'AVAILABILITY' | 'RATES_RESTRICTIONS' | 'BOOKING_CANCEL'): TokenConsumeResult {
    const key = `${propertyId}::${kind}`
    const now = Date.now()
    const state = this.buckets.get(key) ?? {
      tokens: ChannexTokenBucketService.CAPACITY,
      // Lista circular de timestamps de consumo (sliding window).
      consumedAt: [],
    }

    // Limpiar timestamps fuera de la ventana de 60s — esos tokens "se
    // refrescan" implícitamente con el sliding window.
    const windowStart = now - ChannexTokenBucketService.WINDOW_MS
    state.consumedAt = state.consumedAt.filter((t) => t > windowStart)
    state.tokens = ChannexTokenBucketService.CAPACITY - state.consumedAt.length

    if (state.tokens > 0) {
      state.consumedAt.push(now)
      state.tokens -= 1
      this.buckets.set(key, state)
      return { ok: true }
    }

    // Bucket vacío. El token más antiguo dentro de la ventana define cuándo
    // volverá a haber capacidad.
    const oldestInWindow = state.consumedAt[0] ?? now
    const refillsAt = oldestInWindow + ChannexTokenBucketService.WINDOW_MS
    const retryAfterMs = Math.max(1_000, refillsAt - now)

    this.buckets.set(key, state)
    this.logger.warn(
      `[Channex bucket] EXHAUSTED property=${propertyId} kind=${kind} ` +
        `retryAfterMs=${retryAfterMs}`,
    )
    return { ok: false, retryAfterMs }
  }

  /**
   * Snapshot para observabilidad — usado por la admin UI Day 6.
   * NO cleans state, solo reporta.
   */
  inspect(propertyId: string, kind: 'AVAILABILITY' | 'RATES_RESTRICTIONS' | 'BOOKING_CANCEL'): BucketSnapshot {
    const key = `${propertyId}::${kind}`
    const state = this.buckets.get(key)
    if (!state) {
      return {
        tokensRemaining: ChannexTokenBucketService.CAPACITY,
        windowConsumed: 0,
        capacity: ChannexTokenBucketService.CAPACITY,
      }
    }
    const now = Date.now()
    const windowStart = now - ChannexTokenBucketService.WINDOW_MS
    const windowConsumed = state.consumedAt.filter((t) => t > windowStart).length
    return {
      tokensRemaining: ChannexTokenBucketService.CAPACITY - windowConsumed,
      windowConsumed,
      capacity: ChannexTokenBucketService.CAPACITY,
    }
  }

  /** Test helper — reset all buckets between specs. */
  reset(): void {
    this.buckets.clear()
  }
}

interface BucketState {
  tokens: number
  consumedAt: number[]
}

export type TokenConsumeResult =
  | { ok: true }
  | { ok: false; retryAfterMs: number }

export interface BucketSnapshot {
  tokensRemaining: number
  windowConsumed: number
  capacity: number
}
