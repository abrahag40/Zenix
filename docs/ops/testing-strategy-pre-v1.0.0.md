# Testing Strategy — Pre-v1.0.0 release

> **Pregunta del owner (2026-05-24)**:
> *"¿Tenemos los mejores tipos de testing? Recuerdo uno que se llama 'prueba de estrés'. ¿Qué otros tipos hay y cuáles deberíamos aplicar antes de lanzar oficialmente la v1.0.0?"*
>
> **Respuesta corta**: hay ~12 familias de testing reconocidas en la industria. Antes de v1.0.0 deberías ejecutar 6 (MUST), 4 más son SHOULD, 2 son NICE-TO-HAVE para piloto pero crecen en importancia post-launch.
>
> Este doc inventaria los 12, asigna prioridad para Zenix, y especifica herramienta + alcance + bloqueante o no.

---

## 1. Las 12 familias de testing — definiciones limpias

Tomado del ISTQB Foundation 2018 syllabus + Kent Beck *Test-Driven Development* (2003) + Cindy Sridharan modern observability practices.

| # | Familia | Qué pregunta responde | Herramienta típica |
|---|---|---|---|
| 1 | **Unit test** | "¿Esta función pura hace lo correcto?" | Jest, Vitest, Mocha |
| 2 | **Integration test** | "¿Estos 2-3 módulos hablan bien entre sí?" | Jest + Supertest, Testcontainers |
| 3 | **E2E (end-to-end)** | "¿El usuario puede completar el flujo entero?" | Playwright, Cypress, Selenium |
| 4 | **Smoke test** | "¿La app arranca y los 5 endpoints críticos responden 200?" | curl scripts, Playwright headless |
| 5 | **Regression test** | "¿Lo que ya funcionaba sigue funcionando?" | Auto (re-run de unit+integration+E2E) |
| 6 | **Performance / Load test** | "¿Aguanta carga normal sin degradar?" | k6, Artillery, JMeter |
| 7 | **Stress test** | "¿En qué punto se rompe y cómo se rompe?" | k6 con escalado agresivo |
| 8 | **Soak / Endurance test** | "¿Aguanta carga sostenida 24h sin memory leak?" | k6 long-run, custom scripts |
| 9 | **Chaos test** | "¿Sobrevive si Postgres muere 30s o Channex devuelve 500?" | Chaos Mesh, Toxiproxy, Gremlin |
| 10 | **Security test (pen-test + SAST + DAST)** | "¿Un atacante puede romper auth o exfil data?" | OWASP ZAP, Snyk, Burp Suite |
| 11 | **Accessibility test** | "¿Persona con discapacidad puede usarlo?" | axe-core, Lighthouse, NVDA screen reader |
| 12 | **UAT (User Acceptance Testing)** | "¿El cliente real lo aprueba?" | Manual, beta program |

Algunos textbooks listan 15-20 categorías. Las que omitimos:
- **Sanity test** = variante mini-regression. Lo cubro en smoke.
- **Compatibility / cross-browser** = subset de E2E con matrix de browsers.
- **Localization / i18n test** = subset de E2E con multi-locale fixtures.
- **Mutation test** = meta-test que verifica calidad del unit suite. Avanzado, post-launch.
- **Property-based / fuzz test** = excelente pero requiere training (Hypothesis Python, fast-check JS). Post-launch.

---

## 2. Prioridad por familia para Zenix pre-v1.0.0

| # | Familia | Prioridad | Por qué |
|---|---|---|---|
| 1 | Unit | **MUST** | Lógica de negocio (no-show window 48h, rate cap enforcement, tax calc) — un bug aquí = pérdida de plata cliente |
| 2 | Integration | **MUST** | Auth + tenant isolation + Channex gateway con mock — sin esto el multi-tenancy es teoría |
| 3 | E2E | **MUST** | Flow check-in completo + flow checkout + flow cancel — los 3 críticos para release |
| 4 | Smoke | **MUST** | 5 endpoints post-deploy en runbook — sin esto el zero-downtime es ciego |
| 5 | Regression | **MUST** (automático) | Se ejecuta solo en CI cada PR — incluido sin esfuerzo extra |
| 6 | Performance / Load | **MUST** | Tu pregunta del cap 5000 es exactamente esto — sin medirlo no sabes capacity |
| 7 | Stress | **SHOULD** | Saber dónde se rompe = saber a qué tamaño escalar primero |
| 8 | Soak | **SHOULD** | Memory leaks de SSE / outbox listeners → 24h test caza esto |
| 9 | Chaos | **NICE** post-piloto | Vale el esfuerzo cuando tienes >10 clientes — antes es over-engineering |
| 10 | Security | **MUST** | Una vulnerabilidad de auth = chargeback masivo + reputational damage irreparable |
| 11 | Accessibility | **SHOULD** | LATAM regulatoria liviana; WCAG 2.1 AA es target marketing diferenciador |
| 12 | UAT | **MUST** | Hotel piloto Monica Tulum opera la beta — esto YA está pasando |

**Lo que NO hace falta antes de v1.0.0** (post-launch):
- Mutation testing
- Property-based / fuzz
- Cross-browser exhaustive (cubrir Chrome + Safari + Firefox + Edge basic OK; Opera/legacy IE = NO)
- Localization testing exhaustive (i18n llega v1.1.1+)

---

## 3. Estado actual del testing en el repo (2026-05-24)

### Lo que ya tenemos

| Familia | Estado | Detalle |
|---|---|---|
| Unit (apps/api) | 🟢 305 tests verdes | Jest + ts-jest. Cobertura informal ~70% líneas core |
| Unit (apps/web) | 🟡 Algunos componentes con specs | React Testing Library puntual |
| Unit (apps/mobile) | 🟡 26 tests post QA-α batch 1 | Sub-cobertura aún |
| Integration | 🟢 Channex cert tests (11) + multi-tenant hierarchy + tenant isolation | Suite específica con DB real Postgres |
| E2E | ⚫ 0 specs | Sprint QA-α pendiente |
| Smoke | ⚫ 0 specs | Pendiente OPS-α sugerido |
| Regression | 🟢 Automático en CI | GitHub Actions corre todo unit+integration en cada PR |
| Performance / Load | ⚫ 0 specs | Pendiente |
| Stress | ⚫ 0 specs | Pendiente |
| Soak | ⚫ 0 specs | Pendiente |
| Chaos | ⚫ N/A | Post-launch |
| Security | 🟡 Bug audit 2026-05-13 (manual) — SEC-α sprint cerrado | Falta: scanner automatizado en CI |
| Accessibility | 🟡 Algunos componentes diseñados HIG/WCAG | Falta: axe-core en CI |
| UAT | 🟢 Hotel Boutique Test Tulum sandbox conectado a Channex | Hotel Monica Tulum piloto en pipeline |

### Gaps críticos a cubrir pre-v1.0.0

1. **E2E inexistente** — sin esto no validamos el flujo cliente completo. **6-8 días-dev** del sprint QA-α.
2. **Smoke tests inexistentes** — sin esto el deploy es ciego. **1 día** del sprint OPS-α.
3. **Load test inexistente** — sin esto el cap 5000 es opinión. **2 días** del sprint OPS-α o nuevo PERF-α.
4. **Security scanner CI** — sin esto cualquier dep vulnerable se mete sin avisar. **0.5 día** (Snyk + npm audit).
5. **a11y scanner CI** — sin esto regresiones a accesibilidad pasan invisibles. **0.5 día** (axe-core).

**Costo total cubrir gaps**: ~10-12 días-dev distribuidos en 2 sprints (QA-α + OPS-α/PERF-α).

---

## 4. Detalle de cada familia — alcance recomendado pre-v1.0.0

### 4.1 Unit tests (MUST — ya parcialmente)

**Cobertura mínima objetivo v1.0.0**: ~70% líneas en módulos críticos:
- `apps/api/src/checkouts/*`
- `apps/api/src/pms/availability/*`
- `apps/api/src/pms/guest-stays/*` (no-show, late-checkout, check-in confirm)
- `apps/api/src/integrations/channex/*`
- `apps/api/src/nova/*` (todo el sprint actual)
- `apps/api/src/tasks/*` (lifecycle CleaningTask)

**No objetivo 100% cobertura** — esto incentiva tests inútiles. NN/g de testing: tests que documentan comportamiento, no tests que aumentan número.

**Comando**: `npx jest --coverage` muestra reporte.

### 4.2 Integration tests (MUST — ya parcialmente)

**Alcance v1.0.0**:
- ✅ Tenant isolation (multi-tenant-hierarchy + tenant-isolation specs ya existen)
- ✅ Channex cert integration tests (11 verdes)
- ⚠️ Nova RBAC integration (PLATFORM_ADMIN vs PARTNER_MEMBER vs ORG_OWNER acceso cross-org) — falta, agregar Day 8
- ⚠️ End-to-end booking → check-in → checkout → CFDI emission (futuro v1.0.2)

**Lo que falta crítico**:
1. Test integration de wizard Zenix Activate Step 7 health checks (Day 15).
2. Test integration de impersonation chain (PLATFORM_ADMIN onBehalfOf ORG_OWNER en property X).

### 4.3 E2E tests (MUST — 0% hoy)

**Framework recomendado**: **Playwright**. Razones:
- Más rápido y estable que Cypress (2x speed, mejor concurrent execution).
- Auto-wait inteligente reduce flakiness.
- Browser real (Chromium + WebKit + Firefox) — Cypress solo Chromium.
- TypeScript nativo + screenshot/video debugging excelente.

**Specs MUST tener pre-v1.0.0** (5-7 flows):

| Spec | Flow |
|---|---|
| `e2e/specs/login-and-switch-property.spec.ts` | Login → ver TimelineScheduler → switch property → ver otra TimelineScheduler |
| `e2e/specs/booking-create-from-calendar.spec.ts` | Drag celda vacía → modal NewReservation → submit → block aparece |
| `e2e/specs/checkin-flow.spec.ts` | Click reserva ARRIVING → confirmar check-in → balance pagado → block emerald |
| `e2e/specs/checkout-two-phase.spec.ts` | batchCheckout 7:00 → confirmDeparture 11:00 → task READY mobile |
| `e2e/specs/cancel-reservation.spec.ts` | Cancel stay → drawer "Canceladas hoy: 1" → restore window 7d |
| `e2e/specs/no-show-flow.spec.ts` | NightAudit dispara no-show → block rayado → mark-as-noshow manual + revert 48h |
| `e2e/specs/nova-impersonation.spec.ts` (post Day 11) | PARTNER_MEMBER acceso a workspace cliente con banner persistente |

**Setup**:
```bash
# Una sola vez
cd apps/web && npm install -D @playwright/test
npx playwright install --with-deps

# Comando dev
npx playwright test
npx playwright test --ui    # interactive mode
npx playwright codegen      # genera selectores
```

**Tiempo invertido**: 6-8 días-dev = QA-α sprint.

### 4.4 Smoke tests (MUST — 0% hoy)

**Definición**: pegada de 5-10 endpoints o flows que verifican que la app "está viva" post-deploy. Ejecuta en <2 minutos.

**Implementation: bash + curl + jq script en `scripts/smoke-test.sh`**

```bash
#!/bin/bash
set -e

API=${API:-https://api.zenix.com}
TOKEN=${TOKEN:-}

# 1. Healthcheck
test "$(curl -s "$API/health" | jq -r .status)" = "ok"

# 2. Login
if [ -z "$TOKEN" ]; then
  TOKEN=$(curl -s -X POST "$API/auth/login" \
    -H 'content-type: application/json' \
    -d '{"email":"s@z.co","password":"123456"}' | jq -r .accessToken)
fi

# 3. Properties list
test "$(curl -s "$API/v1/properties" -H "authorization: Bearer $TOKEN" | jq 'length')" -gt 0

# 4. Rooms list
test "$(curl -s "$API/v1/rooms?propertyId=prop-hotel-tulum-001" -H "authorization: Bearer $TOKEN" | jq 'length')" -gt 0

# 5. Channex outbound queue status
test "$(curl -s "$API/v1/channex/admin/state" -H "authorization: Bearer $TOKEN" | jq -r .deadLetterCount)" = "0"

echo "✅ All smoke tests passed"
```

**Integración**: ejecuta como GitHub Action `post-deploy` step + manualmente en runbook.

### 4.5 Regression (MUST — automático)

Sin esfuerzo adicional. GitHub Actions `.github/workflows/ci.yml` ya ejecuta:
- `npx tsc --noEmit` typecheck
- `npx jest` unit + integration
- `npx eslint` (lint, post CI-RESCUE)

**Gap**: el step `test` sigue con `continue-on-error: true` por los 8 stale tests (CLAUDE.md CI-RESCUE sprint, pendiente cerrar). Bloquea fix antes de v1.0.0.

### 4.6 Performance / Load test (MUST — 0% hoy)

**Framework**: **k6** by Grafana Labs. JavaScript native, declarative scenarios, integration con Prometheus/Datadog.

**Scenarios MUST pre-v1.0.0**:

```javascript
// k6/scenarios/normal-load.js
import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // ramp up to 50 VU
    { duration: '10m', target: 50 },  // sustain 50 VU 10 min
    { duration: '2m', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<800'], // 95% of requests <800ms
    http_req_failed: ['rate<0.01'],   // <1% errors
  },
}

export default function () {
  // Scenario 1: list properties
  const r1 = http.get('https://api.zenix.com/v1/properties', { headers: { Authorization: `Bearer ${__ENV.TOKEN}` } })
  check(r1, { 'status 200': (r) => r.status === 200 })

  // Scenario 2: get rate calendar
  const r2 = http.get(`https://api.zenix.com/v1/nova/channex/properties/${__ENV.PROP_ID}/rate-calendar?from=2026-06-01&to=2026-06-07`, {
    headers: { Authorization: `Bearer ${__ENV.TOKEN}`, 'x-acting-organization-id': __ENV.ORG_ID },
  })
  check(r2, { 'status 200': (r) => r.status === 200 })

  sleep(1)
}
```

**Run**:
```bash
docker run --rm -i grafana/k6 run --vus 50 --duration 10m - <k6/scenarios/normal-load.js
```

**Scenarios para v1.0.0**:
1. Normal load 50 VU sostenido 10 min (simula 50 hoteles con 1 user activo cada uno).
2. Peak load 200 VU spike 2 min (simula spike check-in 14:00).
3. Rate calendar bulk PATCH con 1000 entries × 5 VU (simula 5 consultores concurrentes).

**Tiempo**: 2 días-dev incluyendo escribir scripts + correr + tunear umbrales.

### 4.7 Stress test (SHOULD — 0% hoy)

**Diferencia con load**: load mide capacity normal. Stress busca el **breaking point**.

```javascript
// k6/scenarios/stress.js
export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 200 },
    { duration: '5m', target: 400 },  // donde típicamente rompe
    { duration: '5m', target: 800 },  // post-break: ¿se recupera?
    { duration: '2m', target: 0 },
  ],
}
```

**Outcome esperado**: ver dónde error_rate sube >5% y latency P95 >3s. Es el **número** que pones en el roadmap "next scale milestone".

**Tiempo**: 0.5 día post-load.

### 4.8 Soak test (SHOULD — 0% hoy)

**Run k6 normal load por 24h**. Lo que buscas:

- Memory utilization sube monotónica? → leak en NestJS (probable culpable: SSE handler global no limpia subscribers correctamente).
- DB connections crecen sin liberar? → connection pool leak.
- Disk crece más de lo esperado? → log retention mal configurado.

**Setup**: Render container instance dedicado pre-prod. Apuntar k6 24h.

**Tiempo**: 0.5 día setup + 24h espera + 0.5 día análisis.

### 4.9 Chaos test (NICE — post-launch)

**Conceptos**: Netflix introdujo Chaos Monkey 2011. Idea: matar componentes random en producción para probar que el sistema se recupera.

**Para piloto Zenix con 1-10 hoteles, OVERKILL**. Espera a Fase 2 (10+ properties) cuando el costo de un fail es mayor.

**Cuando llegue**, herramientas:
- **Toxiproxy** (Shopify) — proxy TCP que introduce latency/timeout/error en tráfico de red.
- **Chaos Mesh** — Kubernetes-native, mata pods random.
- **LitmusChaos** — similar, más declarativo.
- **Gremlin** — SaaS, mejor para enterprise.

**Tests iniciales** (cuando los hagas, post-v1.0.0):
1. Mata API container durante check-in: SSE reconecta? Idempotency holds?
2. Postgres se vuelve lento 5s+ por 30s: timeouts respetados? Cliente avisado?
3. Channex responde 500 por 2 min: outbox queue acumula? Worker retry exponencial?

### 4.10 Security test (MUST — parcial)

**Cubrimos hoy** (CLAUDE.md):
- Audit manual 2026-05-13 (1 crítico MT-5 ✅, 2 altos ✅, 11 medios ✅).
- Sprint SEC-α cerrado commit `aa6f122` (PropertyScopeGuard global).
- Multi-tenant isolation tests.

**Gaps críticos pre-v1.0.0**:
1. **Snyk en CI** (0.5 día):
   ```yaml
   - name: Snyk vulnerability scan
     uses: snyk/actions/node@master
     env: { SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }} }
     with: { args: --severity-threshold=high }
   ```
2. **npm audit fix** ejecutado y review (15 min).
3. **OWASP ZAP baseline scan** (1 día):
   ```bash
   docker run -t owasp/zap2docker-stable zap-baseline.py \
     -t https://staging.zenix.com -r zap-report.html
   ```
4. **Pen test externo** (post-launch). $3-8k USD un firm respetable (HackerOne marketplace, Bishop Fox, Doyensec).

**Threats categóricos a validar (OWASP Top 10 2021)**:
- A01 Broken Access Control — ✅ tenant isolation + PropertyScopeGuard
- A02 Cryptographic Failures — ⚠️ JWT secret rotation pendiente, password bcrypt OK
- A03 Injection — ⚠️ Prisma protege SQL injection; pendiente review de raw queries
- A04 Insecure Design — ✅ append-only audit log
- A05 Security Misconfig — ⚠️ headers helmet pendiente
- A06 Vulnerable Components — ⚠️ Snyk pendiente
- A07 Auth Failures — ✅ JWT + bcrypt + rate limit login pendiente
- A08 Software Integrity — ⚠️ npm package-lock.json integrity pendiente CI verify
- A09 Logging Failures — ✅ Sentry pendiente, audit log existe
- A10 SSRF — ⚠️ Channex gateway única salida; whitelist URLs

**Sprint dedicado SEC-β** sugerido (2-3 días) pre-v1.0.0 GA.

### 4.11 Accessibility test (SHOULD — parcial)

**Cubrimos hoy**:
- Diseño componentes con HIG/WCAG en mente (decisiones §31, §43, motion-reduce, 44pt targets).
- ConfirmDialog tones semánticos.

**Gap**: NO hay automated check en CI. Una regression invisible degrada esto.

**Recomendación**:
1. **axe-core en Playwright E2E** (1 día):
   ```typescript
   import { test, expect } from '@playwright/test'
   import AxeBuilder from '@axe-core/playwright'

   test('TimelineScheduler is accessible', async ({ page }) => {
     await page.goto('/')
     const results = await new AxeBuilder({ page }).analyze()
     expect(results.violations).toEqual([])
   })
   ```
2. **Lighthouse CI** en GitHub Actions (0.5 día):
   ```yaml
   - run: npm install -g @lhci/cli
   - run: lhci autorun --upload.target=temporary-public-storage
   ```
3. **Screen reader manual smoke** (NVDA Windows + VoiceOver Mac): 1 día manual pre-release.

### 4.12 UAT — User Acceptance Testing (MUST)

**Status**: hotel piloto Monica Tulum acordado, sandbox conectado a Channex sandbox.

**Protocol pre-v1.0.0 GA**:
1. **Beta semana 1-2**: solo recepción Monica usa Zenix en paralelo con su PMS actual. Reportan bugs.
2. **Beta semana 3-4**: switch total a Zenix (PMS actual archivado). Soporte 24/7 owner.
3. **Sign-off form**: recepcionista + supervisor + dueño firman documento "operamos con Zenix sin regresar al anterior".

Sin este sign-off = no es GA. Es RC (release candidate).

---

## 5. Sprint OPS-α / PERF-α / SEC-β — propuesta pre-v1.0.0

**Sprint conjunto sugerido**: 8-10 días-dev, ejecutar inmediatamente post-NOVA-CHANNEX-COMMAND-CENTER (cierre del sprint actual).

### Día por día

| Día | Foco | Output |
|---|---|---|
| 1 | Sentry + BetterStack + healthcheck `/health` | Errors logged + uptime tracked |
| 2 | OpenTelemetry instrumentation + métricas custom | Métricas en `/metrics` Prometheus format |
| 3 | PostHog Web + Mobile + funnels críticos | Conversion data |
| 4 | Smoke test bash + GitHub Actions post-deploy step | Deploy con verificación automática |
| 5 | Snyk + npm audit + OWASP ZAP baseline | Security scan en CI |
| 6 | axe-core + Lighthouse CI | a11y en CI |
| 7-8 | k6 normal load + stress + soak scenarios | Capacity baseline measured |
| 9 | CEO Dashboard `/nova/dashboard` widgets v1 | Owner ve tira de vida real |
| 10 | Runbook ensayo en sandbox + chaos test manual #1 | Deploy procedure validated |

### Costo

- 10 días-dev = ~2 semanas calendar 1 dev.
- Tools subscriptions: Sentry $0 (free 5k) + BetterStack $0 (free 1GB) + PostHog $0 (free 1M) + k6 $0 OSS = **$0/mes incremental hasta crecer**.
- Snyk free tier OK para 1 dev.
- Sin esto, v1.0.0 es deploy-y-reza. Con esto, v1.0.0 es ingeniería operativa de verdad.

---

## 6. Anti-patterns de testing — qué NO hacer

| Anti-pattern | Por qué falla | Alternativa |
|---|---|---|
| **Test-after retroactivo** (escribir tests post-código) | Tests reflejan implementación actual, no spec. No detectan regresiones de intent. | TDD ligero — escribe spec antes de fix bug, refactoriza con confianza. |
| **100% coverage como meta** | Incentiva tests triviales (`expect(x).toBe(x)`). Da false confidence. | 70-80% líneas críticas, 100% mutation surface en módulos sensibles. |
| **Mock everything** | Tests pasan, prod rompe. Mock contracts pueden divergir de la API real. | Integration tests con DB real (Testcontainers Postgres) + mocks solo en bordes (HTTP externos). |
| **E2E para todo** | Lentos (minutos cada uno), flakys, masivamente caros mantener. | Pirámide: 70% unit, 20% integration, 10% E2E. Solo flows críticos en E2E. |
| **Skip flaky tests indefinidamente** | Debt acumula, suite degrada. Eventualmente nadie cree el test verde. | Fix raíz en 24h o delete. No `xit` permanente. |
| **Tests sin assertion clara** | "Verifica que no crashea" no es spec. | Cada test responde a una pregunta de negocio explícita. |
| **No medir tests perf** | Suite >5 min destruye productividad. | Track wall-clock por suite, ataca top-3 slow. |

---

## 7. Pirámide ideal de testing para Zenix v1.0.0

```
                  /\
                 /  \       UAT (manual hotel piloto)
                /----\
               /  E2E  \    5-7 specs Playwright = 10% del suite
              /---------\
             / Integration \ ~30-50 specs Jest+Supertest = 20% suite
            /---------------\
           /     Unit         \ ~300+ specs Jest = 70% suite
          /-------------------- \

       + Smoke (5 endpoints curl) post-deploy
       + Load/Stress/Soak (k6, ad-hoc + pre-release)
       + Security (Snyk CI + ZAP pre-release + pen-test post-launch)
       + Accessibility (axe-core en E2E + Lighthouse CI)
       + Chaos (post-launch Fase 2)
```

**Cobertura ideal por capa**:

| Capa | Cantidad | Tiempo total run | Cuando |
|---|---|---|---|
| Unit (api+web+mobile) | 400+ | 30-60s | Cada commit local |
| Integration | 30-50 | 1-3 min | Cada PR en CI |
| E2E | 5-10 | 5-10 min | Cada PR en CI (subset) + nightly (todo) |
| Smoke | 5-10 | 1-2 min | Post-deploy (cada release) |
| Load | 3 scenarios | 20-30 min | Pre-release manual + nightly staging |
| Stress | 1 scenario | 20 min | Pre-release manual + 1x/mes |
| Soak | 1 scenario | 24h | Pre-release manual + 1x/mes |
| Chaos | varies | varies | Post-launch Fase 2 |
| Security scan | continuous | <1 min | Cada PR en CI |
| a11y | parte de E2E | incluido | mismo |

---

## 8. Lectura de profundidad

- **Kent Beck** — *Test-Driven Development by Example* (Addison-Wesley 2003). Fundación TDD.
- **ISTQB Foundation Level syllabus 2018** — definiciones canónicas de las 12 familias.
- **Lisa Crispin + Janet Gregory** — *Agile Testing Condensed* (2019). Pirámide moderna.
- **k6.io docs** — *Load testing types* es la mejor guía gratis sobre load/stress/soak.
- **OWASP Top 10 2021** — clasificación industry de amenazas web.
- **WCAG 2.1 AA quick reference** — w3.org/WAI/WCAG21/quickref.
- **Charity Majors** — *Observability Engineering* + blog posts sobre "testing in production".
- **Nicole Forsgren et al** — *Accelerate* (IT Revolution 2018). Métricas DORA: deployment frequency, lead time, MTTR, change fail rate.

---

## 9. Tu acción inmediata como CEO

**1. Aprueba el sprint OPS-α (10 días-dev)** pre-v1.0.0 GA. No es negociable — sin esto vas a producción a ciegas.

**2. Aprueba presupuesto $3-8k USD para pen-test externo** post-v1.0.0 launch (semana 2-4). HackerOne marketplace es el camino más simple.

**3. Defínete cuándo es GA vs RC**: 
- **GA = General Availability** cuando hotel piloto firma "operamos sin volver al anterior" + smoke/load tests verde + 0 issues críticos abiertos.
- **RC = Release Candidate** es el estado actual post-Day 7+ — funcional pero no aún validado en prod real.

**4. Acepta que tests cuestan**: 1 día de testing previene 5 días de incident response. La razón se compone — un cliente perdido vale 5+ años de subscription.

**5. La pirámide de testing escala con dolor, no con miedo**: hoy estás en buen lugar de pirámide para piloto. NO sobre-construyas. Cada sprint suma 1-2 capas concretas según necesidad.
