/**
 * setup-page.spec.ts — E2E tests del flujo de activación del cliente
 * (Sprint WIZARD-E2E 2026-05-29).
 *
 * Cubre:
 *   · Happy path: token válido → password fuerte → submit → redirect /onboarding/card
 *   · Edge token expired: GET retorna 410 → ErrorCard visible con mensaje correcto
 *   · Edge password weak: <10 chars → botón disabled
 *   · Edge Stripe declined: redirect con ?payment=cancel → estado cancelled visible
 *
 * Backend mockeado con page.route() — tests deterministas sin necesidad de
 * BD ni red. Para correr:
 *   1. Asegurate de tener Vite dev server: `npm run dev` en apps/web
 *   2. Otra terminal: `npm run test:e2e` en apps/web
 *   3. Browsers descargados una vez: `npm run test:e2e:install`
 */
import { test, expect } from '@playwright/test'
import {
  mockApi,
  setupMetaFixture,
  setupActivateOkFixture,
  setupCheckoutSessionFixture,
  subscriptionFixture,
} from './_fixtures/api-mocks'

test.describe('SetupPage — flujo activación cliente', () => {
  // El owner siempre llega con `/setup/:token`. Usamos un token de prueba estable.
  const TOKEN = 'test-token-abc123'

  test.beforeEach(async ({ page }) => {
    // Cleanup localStorage para evitar contaminación entre tests
    await page.goto('/login') // landing inicial conocida
    await page.evaluate(() => localStorage.clear())
  })

  // ─── Happy path ────────────────────────────────────────────────────────
  test('happy: token válido → password fuerte → activación + redirect a /onboarding/card', async ({ page }) => {
    await mockApi(page, {
      'GET /v1/auth/setup/:token': () => ({
        status: 200,
        body: setupMetaFixture({
          organizationName: 'Hotel Boutique Tulum',
          ownerName: 'Ana García',
          ownerEmail: 'ana@hotel-tulum.com',
          propertyCount: 2,
          hoursRemaining: 36,
        }),
      }),
      'POST /v1/auth/setup/:token': () => ({
        status: 200,
        body: setupActivateOkFixture({
          user: { id: 'u-1', firstName: 'Ana', lastName: 'García', email: 'ana@hotel-tulum.com' },
        }),
      }),
      // OnboardingCardCapture: idle → genera Stripe Checkout session
      'POST /v1/billing/setup-checkout': () => ({
        status: 200,
        body: setupCheckoutSessionFixture(),
      }),
      'GET /v1/billing/subscriptions/by-organization': () => ({
        status: 200,
        body: subscriptionFixture('pending_payment_method'),
      }),
    })

    await page.goto(`/setup/${TOKEN}`)

    // Card del owner con datos del wizard visible
    await expect(page.getByText('Hotel Boutique Tulum')).toBeVisible()
    await expect(page.getByText('Ana García')).toBeVisible()
    await expect(page.getByText('ana@hotel-tulum.com')).toBeVisible()
    await expect(page.getByText('36h restantes para activar')).toBeVisible()
    await expect(page.getByText('2 properties creadas')).toBeVisible()

    // Form rendered
    const passwordInput = page.getByPlaceholder('Mínimo 10 caracteres')
    await expect(passwordInput).toBeVisible()

    // Botón disabled inicialmente
    const submitBtn = page.getByRole('button', { name: /Activar mi cuenta/i })
    await expect(submitBtn).toBeDisabled()

    // Password fuerte + confirm match
    await passwordInput.fill('UnaPasswordSegura2026!')
    const confirmInput = page.locator('input[type="password"]').nth(1)
    await confirmInput.fill('UnaPasswordSegura2026!')

    // Botón habilitado
    await expect(submitBtn).toBeEnabled()

    // Submit y verifica redirect a /onboarding/card
    await submitBtn.click()
    await expect(page).toHaveURL(/\/onboarding\/card/, { timeout: 5000 })
  })

  // ─── Edge 1: token expirado ────────────────────────────────────────────
  test('edge: token expirado (410) → ErrorCard "expirado o ya consumido"', async ({ page }) => {
    await mockApi(page, {
      'GET /v1/auth/setup/:token': () => ({
        status: 410,
        body: { message: 'Setup link expirado. Pídele al consultor que re-emita.' },
      }),
    })

    await page.goto(`/setup/${TOKEN}`)

    // Estado expired renderiza ErrorCard tone='warning'
    await expect(page.getByText('Setup link expirado o ya consumido')).toBeVisible()
    await expect(page.getByText(/Pídele al consultor/i)).toBeVisible()

    // Form NO debe estar visible
    await expect(page.getByPlaceholder('Mínimo 10 caracteres')).toHaveCount(0)
  })

  // ─── Edge 2: password débil ────────────────────────────────────────────
  test('edge: password <10 chars → botón submit disabled', async ({ page }) => {
    await mockApi(page, {
      'GET /v1/auth/setup/:token': () => ({
        status: 200,
        body: setupMetaFixture(),
      }),
    })

    await page.goto(`/setup/${TOKEN}`)

    const passwordInput = page.getByPlaceholder('Mínimo 10 caracteres')
    await expect(passwordInput).toBeVisible()

    // Botón inicialmente disabled
    const submitBtn = page.getByRole('button', { name: /Activar mi cuenta/i })
    await expect(submitBtn).toBeDisabled()

    // Llena con 5 chars (insuficiente)
    await passwordInput.fill('12345')

    // Confirm también
    const confirmInput = page.locator('input[type="password"]').nth(1)
    await confirmInput.fill('12345')

    // Sigue disabled porque <10 chars
    await expect(submitBtn).toBeDisabled()

    // Llena hasta 10 chars
    await passwordInput.fill('SegurísimaPwd2026')
    await confirmInput.fill('SegurísimaPwd2026')

    // Ahora habilitado
    await expect(submitBtn).toBeEnabled()
  })
})

test.describe('OnboardingCardCapture — flujo card capture', () => {
  // Stub mínimo de auth en localStorage para entrar a /onboarding/card
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('hk_token', 'fake.jwt.test')
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: {
            token: 'fake.jwt.test',
            user: {
              id: 'u-1',
              name: 'Ana García',
              email: 'ana@hotel-tulum.com',
              role: 'OWNER',
              propertyId: '',
            },
          },
          version: 0,
        }),
      )
    })
  })

  // ─── Edge 3: Stripe Checkout cancelled ─────────────────────────────────
  test('edge: redirect con ?payment=cancel → estado cancelled visible + botón retry', async ({ page }) => {
    await mockApi(page, {
      'GET /v1/billing/subscriptions/by-organization': () => ({
        status: 200,
        body: subscriptionFixture('pending_payment_method'),
      }),
    })

    // Simula return desde Stripe Checkout con cancel
    await page.goto('/onboarding/card?payment=cancel')

    // Estado cancelled — copy esperado
    await expect(page.getByText(/cancel|Cancelado|cancelaste/i).first()).toBeVisible({ timeout: 8000 })

    // Botón retry / reintentar debe estar presente para que el cliente reintente
    const retryButton = page.getByRole('button', { name: /Reintentar|Agregar tarjeta|Volver|Intentar/i }).first()
    await expect(retryButton).toBeVisible()
  })
})
