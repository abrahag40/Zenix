/**
 * API mock helpers for Playwright E2E.
 * Sprint WIZARD-E2E (2026-05-29).
 *
 * Intercepta llamadas a `/api/v1/*` con `page.route()` y devuelve respuestas
 * canónicas. Cada test puede componer un escenario distinto. Esto elimina
 * la dependencia de backend+DB y mantiene tests deterministas + rápidos.
 *
 * Convención de uso:
 *
 *   await mockApi(page, {
 *     'GET /v1/auth/setup/:token': (req) => ({ status: 200, body: setupMeta() }),
 *     'POST /v1/auth/setup/:token': () => ({ status: 200, body: activateOk() }),
 *   })
 *
 * El matcher soporta path params (:token), wildcards trailing.
 */
import type { Page, Route } from '@playwright/test'

export type MockResponse = {
  status: number
  body?: unknown
  headers?: Record<string, string>
  delayMs?: number
}

export type RouteHandler = (req: { method: string; url: string; postData?: string }) => MockResponse | Promise<MockResponse>

export type RouteMap = Record<string, RouteHandler>

/**
 * Configura interceptores para el conjunto de routes provisto.
 * Routes NO matcheados se dejan pasar al network real (visible en error
 * si tu test no tiene backend — buena señal de que falta un mock).
 *
 * Patrón route: `METHOD /v1/segment/:param/...`
 *   - `:foo` matchea cualquier valor sin slashes
 *   - sin wildcards complejos para mantener simple
 */
export async function mockApi(page: Page, routes: RouteMap): Promise<void> {
  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request()
    const method = request.method().toUpperCase()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^\/api/, '') // normalize /api prefix

    // Busca handler que matchee METHOD + path con params
    for (const [pattern, handler] of Object.entries(routes)) {
      const [patternMethod, patternPath] = pattern.split(' ')
      if (patternMethod.toUpperCase() !== method) continue
      if (!matchPath(patternPath, path)) continue

      const response = await handler({ method, url: request.url(), postData: request.postData() ?? undefined })
      if (response.delayMs) {
        await new Promise((r) => setTimeout(r, response.delayMs))
      }
      await route.fulfill({
        status: response.status,
        contentType: 'application/json',
        body: typeof response.body === 'string' ? response.body : JSON.stringify(response.body ?? {}),
        headers: response.headers,
      })
      return
    }
    // No match → fall through (network call). Útil para detectar gaps.
    await route.continue()
  })
}

/**
 * Matcher path-con-params simple.
 *   pattern: '/v1/auth/setup/:token'
 *   actual:  '/v1/auth/setup/abc123'  → match
 *   actual:  '/v1/auth/setup/abc/foo' → no match
 */
function matchPath(pattern: string, actual: string): boolean {
  const patternParts = pattern.split('/').filter(Boolean)
  const actualParts = actual.split('/').filter(Boolean)
  if (patternParts.length !== actualParts.length) return false
  return patternParts.every((p, i) => p.startsWith(':') || p === actualParts[i])
}

// ─── Canonical response fixtures ─────────────────────────────────────────────

export function setupMetaFixture(overrides: Record<string, unknown> = {}) {
  return {
    organizationName: 'Hotel Boutique Tulum',
    organizationSlug: 'tulum-boutique',
    ownerName: 'Ana García',
    ownerEmail: 'ana@hotel-tulum.com',
    propertyCount: 1,
    hoursRemaining: 48,
    expiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    ...overrides,
  }
}

export function setupActivateOkFixture(overrides: Record<string, unknown> = {}) {
  return {
    access_token: 'fake.jwt.token-' + Math.random().toString(36).slice(2, 10),
    user: {
      id: 'user-owner-1',
      firstName: 'Ana',
      lastName: 'García',
      email: 'ana@hotel-tulum.com',
    },
    organizationId: 'org-1',
    ...overrides,
  }
}

export function subscriptionFixture(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    organizationId: 'org-1',
    status,
    stripeSubscriptionId: status === 'pending_payment_method' ? 'pending_xyz' : 'sub_stripe_real',
    planTier: 'PRO',
    billingCycle: 'monthly',
    currency: 'MXN',
    pendingTrialDays: 14,
    ...overrides,
  }
}

export function setupCheckoutSessionFixture(overrides: Record<string, unknown> = {}) {
  return {
    url: 'https://checkout.stripe.com/c/pay/cs_test_FAKE_SESSION',
    sessionId: 'cs_test_FAKE_SESSION',
    customerId: 'cus_FAKE',
    mode: 'setup',
    ...overrides,
  }
}
