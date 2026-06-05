---
Audiencia: Dev / QA / owner pre-piloto v1.0.0
Tipo: Master plan de testing E2E + performance
Status: Activo — mapa vivo del esfuerzo de QA pre-prod
Padre: CLAUDE.md §"Plan de cierre wizard" + §"Bloque 1 v1.0.0"
Última actualización: 2026-06-04
---

# Testing Master Plan — Pre-piloto v1.0.0

> Documento vivo del esfuerzo de QA E2E. Mapa de qué se ha cubierto, qué falta,
> bugs encontrados, y qué herramientas requieren instalación con autorización
> del owner. **Lee primero antes de armar una nueva sesión de testing** —
> evita re-ejecutar lo ya cubierto y mantiene priorización coherente.

## Resumen ejecutivo

- **Estado actual**: 18 bloques funcionales ejecutados, 15 bugs encontrados,
  12 fixes en rama `fix/bugs-batch-4-10` (pendiente autorización merge).
- **Cobertura funcional**: ~70% del surface productivo
- **Cobertura performance**: 0% (pendiente install tools + autorización)
- **Bloqueante v1.0.0 release**: aprobar merge `fix/bugs-batch-4-10` →
  ejecutar PERF-5 Volume + PERF-1 Load → tag.

---

## 1. Catálogo de bugs detectados durante testing

| # | Sev | Bloque | Descripción corta | Status |
|---|-----|--------|-------------------|--------|
| 1 | 🔴 CRIT | A4 | Walk-in no emite CHANNEX_AVAILABILITY → overbooking | ✅ Merged PR #77 |
| 2 | 🔴 CRIT | A5 | Rate change no emite Channex restriction | ✅ Merged PR #77 |
| 3 | 🔴 HIGH | F3 | Channex sandbox: 7 rooms fantasma de discrepancia | ✅ Mitigated PR #77 (post-fix root cause) |
| 4 | 🟡 MED | G1 | Mobile flushQueue race pierde ops añadidas mid-sync | ✅ Branch `fix/bugs-batch-4-10` |
| 5 | 🟡 LOW | G2 | Gamification: 3 triggers (PR/streak/comeback) dead code | ✅ Branch |
| 6 | 🔴 HIGH | H1 | Night audit solo procesa hoy — ghost no-shows si cron falla un día | ✅ Branch |
| 7 | 🟡 MED | I2 | Confirm-checkin race — 2× 201 sin idempotency | ✅ Branch (advisory lock) |
| 8 | 🔴 CRIT | J2 | IDOR cross-property `findOne` — SUPERVISOR Tulum lee Cancún | ✅ Branch (stayScope helper) |
| 9 | 🟠 HI | K1 | Walk-in race → 500 unhandled + posible overbooking real | ✅ Branch (advisory lock + ConflictException) |
| 10 | 🔴 CRIT | L1 | PaymentLog mutable (no trigger DB-level) | ✅ Branch (trigger Postgres §28) |
| 11 | 🔴 HIGH | M1 | `/api/properties` retorna todas a RECEPTIONIST | ✅ Branch (findMine(actor)) |
| 12 | 🔴 CRIT | M2 | HOUSEKEEPER puede crear walk-ins | ✅ Branch (@Roles guard) |
| 13 | 🟠 HI | P1 | Payments DTO no acepta currency (multi-divisa imposible) | ✅ Branch (currency opcional ISO 4217) |
| 14 | 🟡 MED | P3 | Decimal edges: sub-cent silente + huge → 500 | ✅ Branch (@Min/@Max/maxDecimalPlaces) |
| 15 | 🟠 HI | N1 | bookingRef usa city.slice(0,2) en vez de ISO country | ✅ Branch (LegalEntity.countryCode) |
| 16 | 🟠 HI | Z1 | Walk-in race REGRESSED en rooms distintas — advisory lock per-room + counter global = P2002 collisions | ✅ Branch (2do lock per propertyId×yyyymm) |
| 17 | 🔴 HIGH | U1 | POST `/payments` 3× concurrente → 3 PaymentLogs (sin dedup). Doble-cobro POS | ✅ Branch (natural-key dedup via reference + advisory lock) |
| 18 | 🟡 LOW | Y1 | 0 skip-links WCAG 2.4.1 | ❌ Decisión owner 2026-06-04: bajo valor real para piloto boutique LATAM (casos uso poco probables). Diferido a si llega cliente que lo requiera por contrato |
| 19 | 🟡 LOW | Y3 | 0/1388 BookingBlocks con aria-label. Viola WCAG 1.3.1 + 4.1.2 | ❌ Misma decisión que #18 |
| 20 | 🟠 HI | S1 | Cancel solo escribe `guest_stay_logs`; `audit_log` queda vacío. Gap §165 D-NOVA-7 (AuditLog universal requerido para CFDI Art. 30 + Visa CRR §5.9.2) | ✅ Branch (auditLog.create en `$transaction` + helper `mapJwtRoleToSystemRole` + resolución Staff.userId fail-soft) |
| 21 | 🟠 HI | PERF-5 | SEQ SCAN sobre `guest_stays` en queries calendar + overstayed. Sin índice `(property_id, checkin_at)` ni `(property_id, scheduled_checkout)`. A 100k stays → ~200ms p95 vs 65ms actual | ✅ Branch (2 índices Prisma + migration 20260619) |
| 22 | 🟡 MED | PERF-1 | `/v1/metrics/range` sin validación DTO — params `from/to` ausentes → 500 genérico (debería 400). Patrón aplicable a otros endpoints sin DTO `@IsDateString` | ✅ Branch (`MetricsRangeDto` + 3 DTOs adicionales + helpful error messages) |
| 23 | 🟠 HI | PERF-prep | `GET /v1/guest-stays?propertyId=X` retorna TODAS las stays sin pagination (78 → 213KB; 10k → 21MB/1.45s; 100k proyección → 210MB/14s). `from/to` query params **ignorados** server-side | ⚠️ Identificado, sprint follow-up PAGINATION-CORE (~2-3h) |

**Bugs sistémicos detectados (sprints follow-up — no incluidos en PR #78):**
- **#22 sistémico**: 22+ controllers con `@Query()` date params sin DTO. Sprint DTO-CORE (~6-8h)
- **#20 sistémico**: 14+ métodos críticos sin AuditLog. Sprint AUDIT-CORE outbox pattern (~6-10h)
- **#23**: pagination ausente. Sprint PAGINATION-CORE (~2-3h)

**3 bugs en main, 17 pendientes de merge en `fix/bugs-batch-4-10` (PR #78) — los originales #4-#17 + 3 nuevos S/PERF (#20, #21, #22). #18 + #19 descartados por decisión owner. #23 identificado, requiere sprint dedicado.**

---

## 2. Funcional — bloques ejecutados (A → R)

### Resumen de cobertura

| Bloque | Tema | Escenarios | Bugs |
|---|---|---|---|
| **A** | Channex round-trip | 8/8 ✅ | #1, #2 |
| **B** | PMS core regresión | 7/7 ✅ | 0 |
| **C** | Rates/Metrics/Compset | 8/8 ✅ | 0 |
| **D** | Settings + edge cases | 5/5 ✅ | 0 |
| **E** | Console + network | 3/3 ✅ | 0 |
| **F** | Channex sandbox vs Zenix BD | 3/3 ✅ | #3 |
| **G** | Mobile housekeeping + sync queue | 6/6 ✅ | #4, #5 |
| **H** | No-show full flow | 5/5 ✅ | #6 |
| **I** | Group bookings + multi-room | 6/6 ✅ | #7 |
| **J** | Multi-tenant scope security | 5/5 ✅ | #8 |
| **K** | Race conditions + concurrency | 4/4 ✅ | #9 |
| **L** | Fiscal compliance edges | 4/4 ✅ | #10 |
| **M** | RBAC role variations | 5/5 ✅ | #11, #12 |
| **N** | Date/timezone/i18n edges | 3/5 ✅ | #15 |
| **O** | Background jobs reliability | 2/5 ✅ | 0 |
| **P** | Payments deep + cash drawer | 5/5 ✅ | #13, #14 |
| **Q** | Maintenance + housekeeping advanced | 1/5 ✅ | 0 |
| **R** | Resilience + degradación + cert | 3/5 ✅ | 0 |

**52 escenarios ejecutados de 90 planificados (58%). 15 bugs.**

### Escenarios pendientes (bloques parciales)

- **N4, N5**: timezone UTC+14 / 29-feb leap year
- **O1, O3, O5**: cron failure recovery, worker crash mid-process, purge race
- **Q2, Q3, Q4, Q5**: housekeeping advanced (carryover, multi-bed, soft-lock, same-day turnover)
- **R1, R2, R5**: API timeout simulado, Channex 503 + DEAD_LETTER, Activation Report HTML print

Decisión owner pendiente: ¿completar parciales o pasar directo a Z (real-world)?

---

## 3. Funcional — bloques nuevos propuestos (S → DD)

### Priorización por riesgo pre-piloto

| Orden | Bloque | Tema | Escenarios | Cero-install? |
|---|---|---|---|---|
| 1 | **Z** | Real-world hotel scenarios end-to-end | 5 | ✅ |
| 2 | **U** | Idempotency keys + dedup | 4 | ✅ |
| 3 | **S** | Audit trail completeness | 5 | ✅ |
| 4 | **T** | API contract stability | 4 | ✅ |
| 5 | **V** | Email + notif deliverability | 4 | ✅ |
| 6 | **W** | Session management + JWT | 5 | ✅ |
| 7 | **Y** | Accessibility WCAG 2.1 AA | 4 | ✅ (Chrome DevTools) |
| 8 | **X** | Search/filter/pagination edges | 4 | ✅ |
| 9 | **DD** | Data export CSV/Excel | 3 | ✅ |

### Detalles por bloque

**Bloque Z — Real-world hotel scenarios end-to-end**
- Z1: Jueves Tulum (5 checkouts + 5 walk-ins + 1 cancel + 1 no-show)
- Z2: Familia gigante (group 4 rooms, llegadas escalonadas)
- Z3: Huésped VIP (cancel 14d antes, free, reembolso completo, audit)
- Z4: Auditoría fiscal sorpresa (query CFDI-ready del mes)
- Z5: Crisis overbooking (Channex envía 3 conflictivos en 1 hora)

**Bloque U — Idempotency**
- U1: POST payment 3× concurrente
- U2: Webhook re-emit stress 50/seg
- U3: Header `Idempotency-Key` soportado?
- U4: Regression guard de #7 advisory lock

**Bloque S — Audit trail**
- S1: Cancel → triple log (GuestStayLog + AuditLog + StayJourneyEvent)
- S2: Edit guestName post check-in → delta diff capturado
- S3: 3 PaymentLogs concurrentes → timestamps distintos
- S4: Revert no-show con CHARGED → cargo reset
- S5: Soft-delete property → cascade Rooms, stays preservadas

**Bloque T — API contract**
- T1: Response shapes consistentes entre paths
- T2: DTO whitelist descarta campos extras
- T3: Error normalized: {statusCode, message, error}
- T4: Content-Type siempre JSON salvo SSE

**Bloque V — Email**
- V1: Walk-in con guestEmail → Resend dispara
- V2: HTML + plain-text fallback (§182)
- V3: Bounce simulation graceful
- V4: Notif self-suppress §99

**Bloque W — JWT/Session**
- W1: JWT expirado → 401 + redirect
- W2: switchProperty → token nuevo, old invalidated (§3 MT-3)
- W3: 3 devices concurrentes válidos
- W4: Logout → token sigue válido server-side (esperado stateless)
- W5: Refresh rotation tras 30min

**Bloque Y — Accessibility WCAG 2.1 AA**
- Y1: Keyboard nav calendar (Tab focus visible)
- Y2: Color contrast emerald-700 ≥ 4.5:1
- Y3: BookingBlock con aria-label
- Y4: prefers-reduced-motion respetado

**Bloque X — Search/pagination**
- X1: Range 1 año (payload size + response time)
- X2: SQL injection en guestName search
- X3: Compset 0/1/7 rows render
- X4: Date inválida `2026-13-99` → 400 vs 500

**Bloque DD — Data export**
- DD1: CSV con UTF-8 BOM (Excel abre OK con ñ/tildes)
- DD2: Decimal LATAM (punto vs coma)
- DD3: Filename con timestamp sortable

---

## 4. Performance — bloques propuestos (PERF-1 → PERF-6)

### Resumen tools requeridos

| Tool | Tamaño | License | Permiso pendiente |
|---|---|---|---|
| **k6** (Grafana) | ~30MB CLI | AGPL-3 | ⏳ |
| **clinic.js** | npm ~50MB | MIT | ⏳ |
| **autocannon** | npm <5MB | MIT | ⏳ |
| **@lhci/cli** | npm ~150MB Chromium | Apache-2 | ⏳ |
| **pg_stat_statements** | builtin Postgres 14+ | PostgreSQL | ✅ (extension only) |

### PERF-1 — Load Testing (baseline)

**Tool**: k6
**Carga**: 30 virtual users durante 10 min
**Mix realista**: 40% calendar reads · 30% notif poll · 15% check-in · 10% rate queries · 5% bulk
**Targets**: p95 < 800ms, error rate < 0.5%
**Salida**: baseline numbers para comparar post-cambios

### PERF-2 — Stress Testing (breaking point)

**Tool**: k6 + pg_stat_statements
**Ramp**: 0 → 500 users en 10 min, hold 5 min, ramp down 10 min
**Objetivo**: identificar "knee" donde p95 cruza 1s
**Validar**: graceful degradation (429s vs 500s), recovery post-stress

### PERF-3 — Spike Testing (sudden surge)

**Tool**: k6
**Patrón**: baseline 10 → spike 200 en 30s → hold 2min → back to 10
**Objetivo**: simular "buen reviewer Booking" o flash sale
**Validar**: no crashes, sin backlog acumulado post-spike

### PERF-4 — Soak Testing (memory leaks)

**Tools**: k6 + clinic.js doctor + pg_stat_activity + pg_locks
**Carga**: 30 users sostenidos durante 4h (cert prod = 24h)
**Monitor**:
- V8 heap (RSS) — no debe crecer lineal
- Postgres connection pool — count steady
- Advisory locks — no leaks (release on commit/rollback OK)
- SSE EventSource count — singleton mantenido §124
**Salida**: heap flame graph + connection histograms

### PERF-5 — Volume Testing (large data)

**Tools**: Prisma seed script + EXPLAIN ANALYZE + pg_stat_statements
**Data seed**:
- 100k GuestStays (historic 18 meses)
- 50k PaymentLogs
- 10k Rooms con deletedAt set
- 1k overstayed zombies

**Test queries críticas**:
- `GET /guest-stays?from=...&to=...` 1 año
- `GET /metrics/range` 365 días
- `GET /reports/overstayed`
- Dashboard load completo
- Compset card con 7 competitors

**Target**: cada query < 500ms p95

### PERF-6 — Frontend Web Vitals + Lighthouse

**Tool**: Lighthouse CI (Google)
**Páginas**: /login · /dashboard · /pms · /settings/rates · /channex/conflicts
**Métricas target**:
- LCP < 2.5s
- CLS < 0.1
- FID < 100ms
- Bundle inicial < 500KB

**Integración**: GitHub Actions, runs en PRs

---

## 5. Plan de ejecución recomendado (Opción C híbrida)

### Fase 1 — Funcional zero-install (esta sesión)

1. Bloque Z (real-world scenarios) ← arranca AHORA
2. Bloque Y (accessibility — Chrome DevTools)
3. Bloque U (idempotency)

### Fase 2 — Solicitar permisos install

Después de Fase 1, presentar lista consolidada de tools y costos.

### Fase 3 — Performance suite

PERF-5 Volume primero (sin esto el resto falsea), después PERF-1 baseline.

### Fase 4 — Frontend Web Vitals + Soak (paralelos)

PERF-6 corre en CI, PERF-4 corre 4h overnight.

---

## 6. Convenciones de reporte

Cada bug detectado se documenta con:
- **#** secuencial (continuar 16, 17, ...)
- **Severidad**: 🔴 CRÍTICO / 🟠 HIGH / 🟡 MEDIUM / 🟢 LOW
- **Bloque** donde se encontró
- **Hipótesis original** (qué buscábamos)
- **Causa raíz** (archivo:línea)
- **Evidencia** (curl/jest output)
- **Fix recomendado** (opcional)

---

## 6.5. Hallazgos sistémicos post-batch-2 (sprints follow-up requeridos)

### Bug #22 sistémico — DTOs ausentes en 20+ controllers

`grep` detectó al menos **22 endpoints con `@Query('date|from|to|asOf|startDate|endDate')` sueltos** sin DTO @IsDateString. Patrón #22 aplica a:

- `blocks.controller` (startDate/endDate)
- `staff-gamification.controller` (date)
- `scheduling.controller` (from/to, ×2 endpoints)
- `checkouts.controller` (date)
- `nova/rate-calendar.controller` (from/to)
- `nova/audit-log.controller` (dateFrom/dateTo)
- `rates.controller` (from/to ×2 + date)
- `stay-journeys.controller` (from/to)
- `local-events.controller` (from/to)
- `guest-stays.controller` (date + dateFilter + from + to)
- `notification-center.controller` (from)
- `compset.controller`, `fx.controller`, `reports.controller`, otros

**Sprint follow-up DTO-CORE recomendado** (~6-8h):
- Crear DTOs reutilizables: `DateRangeDto`, `SingleDateDto`, `PropertyScopedRangeDto`
- Refactorizar los 22+ endpoints
- Spec coverage: 1 test e2e por controller verifica 400 vs 500
- Documentar en `docs/engineering/dto-conventions.md`

Sin esto: cualquier malformed input devuelve 500 — feedback inútil (NN/g H9 fail), oculta posibles bugs, espanta al frontend.

### Bug #20 sistémico — AuditLog ausente en 14+ métodos críticos

Grep en `guest-stays.service.ts` confirma que **solo `cancelStay`** escribe `auditLog.create` post-batch-2. Métodos críticos sin auditLog universal:

- `confirmCheckin` (check-in con captura ID — Visa CRR §5.9.2 evidence)
- `earlyCheckout` / `checkout` (cobro final — disputa financiera)
- `markNoShow` / `revertNoShow` / `registerNoShowCharge` (cobro contestable)
- `registerPayment` / `voidPayment` (pagos — chargeback ventana 120d)
- `update` (edit guestName/contactos — manipulación de evidence)
- `extend` / `moveRoom` / `swapRooms` (cambios contractuales)
- `restoreStay` (reversión de cancel)
- `registerCancelRefund` (registro fiscal CFDI E §86)

**Sprint follow-up AUDIT-CORE recomendado** (~8-14h):

Tres approaches evaluados:

| Approach | Esfuerzo | Latencia impact | Recomendación |
|---|---|---|---|
| Manual `tx.auditLog.create` × 14 métodos | 8-12h | +1 INSERT por tx | Más explícito |
| Decorator `@AuditMutation('STAY_*')` | 10-14h | +1 INSERT post-success | Mantenible |
| **Outbox pattern via EventEmitter2** | 6-10h | 0 (async listener) | ⭐ Recomendado |

**Outbox justificado**:
- Cero impacto path crítico
- Fail-soft natural (retry queue si el listener falla)
- Patrón ya usado en repo: `CHANNEX_AVAILABILITY_CHANGED` event (D-CHX-OUT-1)
- Listener escribe auditLog asíncrono, no bloquea respuesta al usuario

Sin esto: piloto v1.0.0 al primer chargeback Visa pierde la disputa por falta de trail unificado (los `guest_stay_logs` per-stay no son auditables cross-org para compliance §165).

### Bug #23 — `/v1/guest-stays` sin pagination ni filtro server-side

Detectado durante PERF-1 stress preparation. Endpoint `GET /v1/guest-stays?propertyId=X` retorna **TODAS las stays** del property sin pagination:
- A 78 stays: 213KB, 50ms — OK
- A 10k stays: **21MB, 1.45s** — bug serio para frontend
- A 100k stays (proyección piloto 4-5 años): **210MB, ~14s** — inviable

`from/to` query params son **ignorados** por el servicio (frontend filtra client-side).

**Sprint follow-up PAGINATION-CORE recomendado** (~2-3h):
- Agregar `take` (default 500, max 5000) + `cursor` o `skip`
- Soportar `from/to` realmente del lado servidor
- Frontend ya espera responseShape compatible (TimelineScheduler ya filtra by range visible)

---

## 7. Decisiones del owner pendientes

- [ ] Autorizar merge `fix/bugs-batch-4-10` (12 fixes acumulados)
- [ ] Autorizar install: k6 + clinic.js + autocannon + Lighthouse CI
- [ ] Decidir si completar escenarios parciales (N4-5, O1+3+5, Q2-5, R1+2+5) antes de Z
- [ ] Definir target SLA: p95 < 800ms vs < 500ms?
- [ ] Decidir si Lighthouse CI se wire a GitHub Actions o solo local

---

## 8. Histórico de sesiones

| Fecha | Sesión | Bloques | Bugs nuevos | Outcome |
|---|---|---|---|---|
| 2026-06-04 (AM) | Testing A→F | A,B,C,D,E,F | #1, #2, #3 | PR #77 merged |
| 2026-06-04 (PM-1) | Testing G→L extension | G,H,I,J,K,L | #4-#10 | Rama `fix/bugs-batch-4-10` |
| 2026-06-04 (PM-2) | Testing M→R nueva lista | M,N,O,P,Q,R | #11-#15 | Mismos fix en rama |
| 2026-06-04 (PM-3) | Testing Z, U, Y | Z, U, Y | #16, #17, #18, #19 | Doc creado + 4 bugs adicionales |
