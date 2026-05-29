/**
 * Playwright config — Sprint WIZARD-E2E (2026-05-29).
 *
 * Tests E2E del flujo de activación del cliente (SetupPage +
 * OnboardingCardCapture). Mockea backend con `page.route()` para evitar
 * dependencia de API+DB en cada run y mantener determinismo.
 *
 * Convención:
 *   · `test:e2e`             — corre headless contra dev server
 *   · `test:e2e:headed`      — con navegador visible (debug)
 *   · `test:e2e:install`     — descarga browsers (~300MB; one-time)
 *
 * CI integration deferred (sprint separate). Run local solo por ahora.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  /* Max time per test */
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  /* Fail fast en CI; reintenta 1× local */
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'list' : 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  /* Webserver: asumimos Vite dev server ya corriendo. En CI futuro
     se puede agregar `webServer: { command: 'npm run dev', port: 5173 }`. */
})
