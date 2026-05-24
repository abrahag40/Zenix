/**
 * ChannexTokenBucketService — rate limit cert AP-2.3 + Test 12.
 *
 * Cobertura:
 *   · Capacidad 10 per (property, kind) — consume 10× sin bloquear
 *   · 11ª consume bloquea con retryAfterMs > 0
 *   · Window 60s — tras 60s tokens vuelven (sliding window)
 *   · Isolation: bucket per property + per kind
 *   · inspect() snapshot para admin UI
 */

import { ChannexTokenBucketService } from './channex-token-bucket.service'

describe('ChannexTokenBucketService', () => {
  let svc: ChannexTokenBucketService

  beforeEach(() => {
    svc = new ChannexTokenBucketService()
  })

  it('CAPACITY = 10 — consume 10 tokens sin bloquear', () => {
    for (let i = 0; i < 10; i++) {
      const r = svc.consume('p1', 'AVAILABILITY')
      expect(r.ok).toBe(true)
    }
  })

  it('11ª consume → bloquea con retryAfterMs > 0', () => {
    for (let i = 0; i < 10; i++) svc.consume('p1', 'AVAILABILITY')
    const r = svc.consume('p1', 'AVAILABILITY')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.retryAfterMs).toBeGreaterThan(0)
      // Debe estar en la ventana 0-60s (ningún token tiene >60s)
      expect(r.retryAfterMs).toBeLessThanOrEqual(60_000)
    }
  })

  it('isolation: property A no consume tokens de property B', () => {
    for (let i = 0; i < 10; i++) svc.consume('pA', 'AVAILABILITY')
    // pA agotado, pB aún tiene full capacity
    const a = svc.consume('pA', 'AVAILABILITY')
    const b = svc.consume('pB', 'AVAILABILITY')
    expect(a.ok).toBe(false)
    expect(b.ok).toBe(true)
  })

  it('isolation: kind AVAILABILITY no comparte con RATES_RESTRICTIONS', () => {
    // Mismo property, dos kinds — buckets separados (20 total = 10 + 10)
    for (let i = 0; i < 10; i++) svc.consume('p1', 'AVAILABILITY')
    for (let i = 0; i < 10; i++) svc.consume('p1', 'RATES_RESTRICTIONS')
    expect(svc.consume('p1', 'AVAILABILITY').ok).toBe(false)
    expect(svc.consume('p1', 'RATES_RESTRICTIONS').ok).toBe(false)
  })

  it('sliding window: tras 60s simulados, tokens vuelven (via Date.now mock)', () => {
    const now = Date.now()
    jest.spyOn(Date, 'now').mockReturnValue(now)
    for (let i = 0; i < 10; i++) svc.consume('p1', 'AVAILABILITY')
    expect(svc.consume('p1', 'AVAILABILITY').ok).toBe(false)

    // Avanzar tiempo 61s — todos los tokens expiran
    jest.spyOn(Date, 'now').mockReturnValue(now + 61_000)
    expect(svc.consume('p1', 'AVAILABILITY').ok).toBe(true)
    jest.restoreAllMocks()
  })

  it('inspect: snapshot sin consumir state', () => {
    svc.consume('p1', 'AVAILABILITY')
    svc.consume('p1', 'AVAILABILITY')
    const snap = svc.inspect('p1', 'AVAILABILITY')
    expect(snap.tokensRemaining).toBe(8)
    expect(snap.windowConsumed).toBe(2)
    expect(snap.capacity).toBe(10)
  })

  it('inspect en bucket nunca tocado → tokens full', () => {
    const snap = svc.inspect('pNew', 'AVAILABILITY')
    expect(snap.tokensRemaining).toBe(10)
    expect(snap.windowConsumed).toBe(0)
  })
})
