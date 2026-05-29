# E2E tests — Sprint WIZARD-E2E

Playwright suite covering client activation flow (SetupPage + OnboardingCardCapture).

## Coverage

| Test | Scenario |
|---|---|
| Happy | Token valid → password strong → submit → redirect /onboarding/card |
| Edge 1 | Token expired (HTTP 410) → ErrorCard "expirado o ya consumido" visible |
| Edge 2 | Password weak (<10 chars) → submit button disabled |
| Edge 3 | Stripe Checkout cancelled (`?payment=cancel`) → cancelled state + retry button |

## Backend mocking

All API calls intercepted with `page.route('**/api/v1/**', ...)` via the helper
`mockApi(page, routeMap)` in `_fixtures/api-mocks.ts`. **No backend / DB required**.

## Run

```bash
# 1. One-time: install Chromium binary (~300MB)
npm run test:e2e:install

# 2. Start Vite dev server in another terminal:
npm run dev

# 3. Run tests (headless):
npm run test:e2e

# Variants:
npm run test:e2e:headed   # visible browser, useful for debug
npx playwright test --debug   # step-by-step debugger
npx playwright show-report    # view HTML report after run
```

## Adding new scenarios

1. Add fixtures to `_fixtures/api-mocks.ts` (canonical response shapes)
2. New `.spec.ts` in `e2e/` per page or flow
3. Pattern: `mockApi(page, { 'METHOD /v1/path/:param': () => ({ status, body }) })`
4. Match assertions to the actual rendered text (Spanish copy)

## CI integration

Deferred to a separate sprint. To wire up locally GitHub Actions:
- Add `webServer: { command: 'npm run dev', port: 5173 }` to `playwright.config.ts`
- Cache `~/.cache/ms-playwright` to skip browser download
- Run `npm run test:e2e:install` in CI before tests

## Maintenance

When wizard UI copy changes, update selectors here. Selectors prefer
**semantic** queries (`getByRole`, `getByText`) over CSS — survives
markup refactors better.
