---
Audiencia: Owner + agentes IA futuros + reviewer Channex Stage 4
Tipo: Plan de sprint técnico
Status: Propuesto — pendiente de aprobación
Branch: feature/channex-inbound (continúa en la misma rama hasta merge)
Padre: docs/sprints/CHANNEX-INBOUND-plan.md (sprint hermano, ya cerrado)
Última actualización: 2026-05-22 (post-audit)
Disparador: el sprint CHANNEX-INBOUND cubre Test 11 (booking receive) — los otros 13 tests cert son OUTBOUND y requieren este sprint dedicado
---

# Sprint CHANNEX-OUTBOUND-CERT — Cobertura completa de los 14 tests Channex

> **Misión del sprint**: dejar la rama `feature/channex-inbound` lista para
> aprobar TODOS los 14 tests de certificación Channex en el primer intento de
> Stage 4 (live screenshare), explícitamente diseñado para evitar los 14
> anti-patrones documentados (6 declarados oficialmente + 8 derivados).
>
> **No-objetivo**: solo cumplir; el código debe ser **production-grade** para
> hoteles con 1-100 properties, no un parche para pasar el test.

---

## 1. Contexto: qué hace ya el sprint INBOUND (Days 1-7)

Resuelto y mergeable hoy:
- ✅ **Test 11 — Booking Receive**: webhook + outbox + pull/ack flow + conflict UI
- ✅ **Test 12 — Rate limits (lado inbound)**: ChannexOutbox con backoff exponencial
- ✅ **Test 13 — Delta only (lado inbound)**: event-driven, no polling de DB Channex

Lo que **NO cubre** el sprint inbound y es objetivo de este:
- 🔴 Test 1-10: ARI push (Availability, Rates, Restrictions)
- 🔴 Test 12 lado outbound: queue + rate limiter + retry
- 🔴 Test 13 lado outbound: delta-only enforcement formal
- 🔴 Test 14: cuestionario de declaraciones

---

## 2. Mapa de los 14 anti-patrones → cómo los evitamos por diseño

### 2.1 Anti-patrones declarados (6 oficiales)

| # | Anti-patrón | Cómo lo evitamos |
|---|---|---|
| **AP-1** | Standalone script/CLI/Postman con valores hardcodeados | **Triggers son domain events emitidos por RatesService, AvailabilityService, RestrictionsService — no hay script standalone**. Los 14 tests se ejecutan ABRIENDO el calendar/rate plan UI y haciendo cambios reales que disparan los eventos de producción. Los integration tests viven en `*.integration.spec.ts` y solo verifican que el codepath productivo dispara correctamente, NO posean valores propios. |
| **AP-2** | "Certification UI" hecha solo para tests | **Cero UI nueva para cert**. Reusamos: SettingsPage > Rate Plans (existe), RatesPage > calendar grid (existe en RATES-METRICS-COMPSET sprint), MaintenancePage (block stop-sell — existe). Si el reviewer pide "abre 3 rates y cámbiales el precio", el supervisor lo hace en la UI normal de Zenix. |
| **AP-3** | Full sync en timer | **Hard prohibido por arquitectura**: no existe cron que dispare `pushFullSync`. La única corrida automática es `FullSyncOrchestrator.runOffPeak` que dispara máximo **1×/24h entre 03:00-05:00 local** del property, controlado por `PropertySettings.channexLastFullSyncAt` (idempotencia). Comentario en el código + test que verifica el throttle. |
| **AP-4** | Per-date / per-rate calls | **Batching obligatorio por contrato del Gateway**: `ChannexGateway.pushRates(entries[])` y `pushRestrictions(entries[])` toman ARRAYS. No existe método singular. ESLint rule custom prohíbe `for (date of dates) { gateway.pushRate(date,...) }`. Outbox accumulator agrupa hasta 60s o 100 entries antes de flushear. |
| **AP-5** | UUIDs hardcodeados del docs en producción | **Mappings viven en DB**: `Room.channexRoomTypeId`, `RatePlan.channexRatePlanId`, `PropertySettings.channexPropertyId`. Nuevo lint check al grep del codebase: `grep -rn "channex.*-[0-9a-f]\{8\}-" src/` debe retornar 0 hits en archivos NO-test. |
| **AP-6** | Lógica en archivos de test | **Reviewer file:line drill**: cualquier `pushRates`, `pushRestrictions`, `pushAvailability` se invoca desde `apps/api/src/pms/rates/rates.service.ts`, `availability.service.ts`, `restrictions.service.ts` en líneas que el reviewer puede ver. Los `.spec.ts` solo afirman el contrato — nunca contienen la lógica. |

### 2.2 Anti-patrones derivados (8 deducibles)

| # | Anti-patrón | Cómo lo evitamos |
|---|---|---|
| **AP-2.1** | Polling DB propia | **Domain events vía EventEmitter NestJS**: `rates.service.ts` emite `rate.updated` event en el mismo tx después de update; `outbox-builder.service.ts` escucha y persiste outbox row. Sin queries `WHERE updated_at > X`. Test dedicado verifica que el event listener existe. |
| **AP-2.2** | Llamar API directo desde save handler | **Outbox pattern obligatorio**: `OutboxBuilderService` (no el save handler) construye el outbox row. El save handler solo emite event + commits tx. El worker async (`ChannexOutboundWorker`) drena la cola respetando rate limit. **Si Channex está caído, el save sigue funcionando**. |
| **AP-2.3** | Retry ausente o silent drop | **Backoff documentado**: 429 → respeta Retry-After header (o default 60s); 5xx → exponential 2^attempts (max 5 attempts → DEAD_LETTER). Cada error que entra a DEAD_LETTER **dispara AppNotification ACTION_REQUIRED al SUPERVISOR**. Test simula 5×429 → verifica que el row queda DEAD_LETTER y la notif se crea. |
| **AP-2.4** | Data uniforme en full sync | **Seed productivo para sandbox** con variación realista: 4 rate plans con prices distintos por día (BAR weekday vs weekend), 2 restrictions distintos por rate, availability variable per room. El `FullSyncOrchestrator` lee de DB real — no genera valores. Documented en `docs/ops/channex-sandbox-seed.md`. |
| **AP-2.5** | No enviar ack | **Ya cumplido en INBOUND sprint** (ChannexRevisionPullerService line `gateway.ackBookingRevision`). Verificado por tests existentes + sandbox integration. |
| **AP-2.6** | Endpoint legacy `/bookings` | **Ya cumplido**: nuestro gateway llama `/booking_revisions/feed` y `/booking_revisions/:id/ack`. Cero referencias a `/bookings` en el código (verificable con grep). |
| **AP-2.7** | Pull "just in case" | **Feed scheduler 30min UTC** SOLO procesa lo que el feed retorna (revisions no acked). No hace pull preventivo de todas las bookings. Documented en `channex-feed.scheduler.ts:21-29`. |
| **AP-2.8** | Mezclar Availability + Rate&Restrictions | **Separación obligatoria por arquitectura**: el outbox tiene `kind: 'AVAILABILITY' \| 'RATES_RESTRICTIONS'`. El worker drena cada kind en mensajes separados (Availability prioritized vía higher priority weight). Mensajes mezclados son imposibles de construir. |

---

## 3. Arquitectura del sprint

```
┌──────────────────────────────────────────────────────────────────┐
│                       PMS save handlers                           │
│   rates.service.ts / availability.service.ts / restrictions.s.ts │
└─────────────────────────┬────────────────────────────────────────┘
                          │ EventEmitter.emit('channex.outbound.queue', ...)
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│  ChannexOutboundQueueBuilder (listener)                           │
│  · Lee el event payload (delta only)                              │
│  · Persiste 1+ rows en ChannexOutboundQueue table:                │
│      { kind: AVAILABILITY | RATES_RESTRICTIONS,                   │
│        propertyId, payload, status: PENDING, attempts, ... }      │
└─────────────────────────┬────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│  ChannexOutboundWorker  (cron cada 30s)                          │
│  · Token bucket: 10 ARI/min/property + 10 avail/min/property     │
│  · Batches per kind per property → 1 HTTP call por batch         │
│  · Priority: AVAILABILITY > RATES_RESTRICTIONS                    │
│  · Retry: 429 → Retry-After; 5xx → 2^attempts; max 5 → DEAD_LETTER│
└─────────────────────────┬────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│  ChannexGateway (extended)                                        │
│  · POST /availability    { values:[{property_id, room_type_id,   │
│                                     date, availability}, ...] }   │
│  · POST /rates           { values:[{property_id, room_type_id,   │
│                                     rate_plan_id, date, rate,    │
│                                     currency}, ...] }             │
│  · POST /restrictions    { values:[{property_id, room_type_id,   │
│                                     rate_plan_id, date,          │
│                                     min_stay_through, min_stay_  │
│                                     arrival, max_stay, cta, ctd, │
│                                     stop_sell}, ...] }            │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  FullSyncOrchestrator (cron 03:00-05:00 local, máx 1×/24h)        │
│  · Lee TODA la BD (500d futuros)                                  │
│  · Construye 2 mensajes:                                          │
│      Call 1: POST /availability (all rooms × 500d)                │
│      Call 2: POST /rates (rates+restrictions per rate plan × 500d)│
│  · Cada call respeta payload max 10MB                             │
│  · Idempotencia: PropertySettings.channexLastFullSyncAt           │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. Schema changes

```prisma
enum ChannexOutboundKind {
  AVAILABILITY            // separado per AP-2.8
  RATES_RESTRICTIONS      // rates + restrictions van juntos al endpoint /rates
}

enum ChannexOutboundStatus {
  PENDING
  IN_PROGRESS
  SUCCEEDED
  FAILED
  DEAD_LETTER
}

model ChannexOutboundQueue {
  id              String                  @id @default(uuid())
  propertyId      String                  @map("property_id")
  kind            ChannexOutboundKind
  // Payload es delta-only (AP-3): nunca un dump completo.
  // Shape: { entries: [{date, room_type_id, ...fields}] }
  payload         Json
  status          ChannexOutboundStatus   @default(PENDING)
  priority        Int                     @default(50)  // AVAILABILITY=100, R&R=50
  attempts        Int                     @default(0)
  lastError       String?                 @map("last_error")
  nextAttemptAt   DateTime                @default(now()) @map("next_attempt_at")
  lockedAt        DateTime?               @map("locked_at")
  lockedBy        String?                 @map("locked_by")
  processedAt     DateTime?               @map("processed_at")
  // Hash del payload para dedup (anti-flood: si el mismo delta llega 2× en 5s
  // por un double-click del recepcionista, solo encolamos uno).
  payloadHash     String                  @map("payload_hash")
  createdAt       DateTime                @default(now()) @map("created_at")
  updatedAt       DateTime                @updatedAt @map("updated_at")

  @@index([status, priority, nextAttemptAt])
  @@index([propertyId, status])
  @@index([payloadHash])
  @@map("channex_outbound_queue")
}

model PropertySettings {
  // ... fields existentes
  channexLastFullSyncAt        DateTime?  @map("channex_last_full_sync_at")
  channexFullSyncWindowStart   Int        @default(3) @map("channex_full_sync_window_start")  // hora local
  channexFullSyncWindowEnd     Int        @default(5) @map("channex_full_sync_window_end")
}

// Para AP-5 (UUIDs no hardcodeados):
model RatePlan {
  // ... fields del sprint RATES-METRICS-COMPSET-CORE
  channexRatePlanId  String?  @map("channex_rate_plan_id")  // mapping vivo en DB
}
```

Migration: `2026_channex_outbound_initial`.

---

## 5. Plan de implementación día-por-día (5-7 días)

### Día 1 — Schema + Gateway extension + outbox builder

**Entregables:**
- Migration `2026_channex_outbound_initial` con `ChannexOutboundQueue` + `ChannexOutboundKind` + `ChannexOutboundStatus` enums + `PropertySettings.channexLastFullSyncAt`.
- `ChannexGateway` extensions:
  - `pushRates(entries: ChannexRateEntry[]): Promise<void>`
  - `pushRestrictions(entries: ChannexRestrictionEntry[]): Promise<void>` (CTA, CTD, min_stay_through, min_stay_arrival, max_stay, stop_sell)
  - `pushAvailability(entries: ChannexAvailEntry[]): Promise<void>` (extiende pushAbsoluteAvailability con batching multi-property)
- `ChannexOutboundQueueBuilder` (event listener) — recibe domain events, persiste rows.
- Specs: ≥10 unit tests cubriendo cada método del Gateway con fetch mocks + types validation.

**Anti-patterns mitigados Day 1:** AP-4 (gateway acepta arrays), AP-2.8 (kind separado), AP-5 (sin UUIDs en código).

### Día 2 — Worker + rate limiter + retry

**Entregables:**
- `ChannexOutboundWorker` (cron cada 30s).
- `TokenBucketService`: 10 ARI/min/property + 10 avail/min/property (memory-resident por simplicidad v1.0; Redis-backed v1.0.5).
- Backoff: 429 lee `Retry-After` header; 5xx exp 2^attempts; max 5 → DEAD_LETTER.
- DEAD_LETTER → AppNotification ACTION_REQUIRED al SUPERVISOR.
- Specs: ≥8 unit tests (happy, 429 backoff, 5xx exp, exhausted, token bucket throttle, multi-property isolation).

**Anti-patterns mitigados Day 2:** AP-2.2 (worker separado del save handler), AP-2.3 (retry explícito), AP-2.7 (worker NO hace pull just-in-case).

### Día 3 — Domain events integration (rates + availability + restrictions)

**Entregables:**
- `rates.service.ts` emite `channex.rate.updated` event al crear/modificar RatePlan, RateOverride, RateSeason (delta-only).
- `availability.service.ts` extiende `notifyRelease`/`notifyReservation` para emitir `channex.availability.changed` event con el delta exacto.
- Nuevo `restrictions.service.ts` (parte del sprint RATES-METRICS-COMPSET-CORE) que emite `channex.restriction.updated`.
- `OutboxBuilderService` traduce cada event → outbox row con payload mínimo (delta only).
- Specs: ≥6 tests (rate change → 1 outbox row, availability change → 1 outbox row, batch detection cuando 2 cambios <5s).

**Anti-patterns mitigados Day 3:** AP-2.1 (domain events, no polling DB), AP-3 (delta-only enforced en el builder).

### Día 4 — FullSyncOrchestrator

**Entregables:**
- `FullSyncOrchestrator` con cron multi-tz IANA (mismo patrón que `NightAuditScheduler` §12).
- Window: `channexFullSyncWindowStart`/`channexFullSyncWindowEnd` (default 03:00-05:00 local).
- Idempotencia: `channexLastFullSyncAt` < 24h → skip.
- Construye 2 mensajes:
  - **Mensaje 1**: `POST /availability` con 500d de availability per room.
  - **Mensaje 2**: `POST /rates` con rates + restrictions de los próximos 500d.
- Payload guard: max 10MB; si excede, divide en chunks pero registra warning (no debería pasar para propiedades <100 rooms).
- Manual trigger admin endpoint `POST /v1/admin/channex/full-sync/:propertyId` (SUPERVISOR-only, anota actor en audit).
- Specs: ≥5 tests (cron multi-tz, idempotencia 24h, payload structure verifica los 2 mensajes, manual trigger, off-peak window enforcement).

**Anti-patterns mitigados Day 4:** AP-3 (full sync solo 1×/24h off-peak), AP-2.4 (data desde DB real, no sintética).

### Día 5 — Integration tests vs sandbox + 14 cert tests

**Entregables:**
- Suite `channex-cert-tests.integration.spec.ts` ejecutando los 14 escenarios oficiales contra `staging.channex.io`:

| Test | Setup | Action triggered by | Verificación |
|---|---|---|---|
| 1 | 500d data en DB | Manual full-sync trigger | 2 HTTP calls, ambos 200; verifica payload structure |
| 2 | Rate plan Twin BAR existe | `RatesService.updateRate(date=2026-11-22, rate=333)` | 1 POST /rates call, value=333 |
| 3 | Twin BAR + Twin B&B | `RatesService.batchUpdateRates([{...3 rates...}])` | 1 POST /rates call con 3 values |
| 4 | Multi-date multi-rate | `RatesService.batchUpdateRates([{...multi...}])` | 1 POST /rates call con N values |
| 5 | Min stay | `RestrictionsService.setMinStay([{...3...}])` | 1 POST /restrictions call, kind min_stay_through |
| 6 | Stop sell | `RestrictionsService.setStopSell([{...3...}])` | 1 POST /restrictions call, kind stop_sell |
| 7 | CTA+CTD+min+max | `RestrictionsService.batchUpdate([{...4 combos...}])` | 1 POST /restrictions call con CTA, CTD, min, max |
| 8 | Half-year update | `RatesService.batchUpdateForRange(2026-12-01, 2027-05-01)` | 1 POST /rates con rates+restrictions juntos |
| 9 | Single date avail | `AvailabilityService.updateInventory(Twin: 8→7)` | 1 POST /availability call |
| 10 | Multi-date avail | `AvailabilityService.batchUpdateInventory([...])` | 1-2 POST /availability calls |
| 11 | Already tested in Days 1-7 | n/a | n/a (Test 11 cubierto) |
| 12 | Burst 30 rates en 1 min | `RatesService.updateRate` ×30 rápido | Token bucket throttles to 10/min, resto encolado |
| 13 | 0 timer-based syncs | Suite verifies no cron exists that does full sync without idempotency check | grep + ASSERT |
| 14 | Declaration form answers | Manual review of `docs/ops/channex-test-14-declarations.md` | Documento exists con respuestas |

Cada test verifica 200 + payload shape correcto + 1-2 calls según spec.

**Anti-patterns mitigados Day 5:** TODOS verificados explícitamente como integration tests.

### Día 6 — UX polish + admin observability

**Entregables:**
- Page `/settings/channex` (SUPERVISOR-only):
  - Counter por status en `ChannexOutboundQueue`
  - Lista de DEAD_LETTER con detalle del error
  - Botón "Manual full sync" (dispara `FullSyncOrchestrator.runForProperty`)
  - Última hora de sync exitoso per kind
  - Last 24h: counts por status, average latency
- AppNotification template para DEAD_LETTER (ACTION_REQUIRED).
- Specs: web component tests + e2e flow del manual sync.

**Anti-patterns mitigados Day 6:** AP-2.3 (DEAD_LETTER visibility).

### Día 7 — Documentación + declaraciones Test 14 + sales master update

**Entregables:**
- `docs/ops/channex-test-14-declarations.md`: respuestas formales al cuestionario de Test 14 (Min Stay type, restrictions soportadas, PCI tokenization Stripe, multi-room/multi-rate-plan support, credit card requirement).
- `docs/ops/channex-sandbox-seed.md`: instrucciones de seed productivo para evitar AP-2.4 (data uniforme).
- Update CLAUDE.md §139-§148 con 10 decisiones D-CHX-OUT-1..10.
- Update `docs/zenix-sales-master.md` con sección "Channel manager — certified outbound" listando los 14 tests + anti-patrones evitados.
- Update roadmap v1.0.0 marcando CHANNEX-OUTBOUND-CERT como prerequisite formal para Stage 4 live screenshare scheduling.

---

## 6. Decisiones no-negociables (candidatas a §-numerar al cerrar)

### D-CHX-OUT-1 — Outbox queue obligatoria para todo outbound

Ningún `gateway.pushX` se llama directamente desde save handlers. **TODO** pasa por `ChannexOutboundQueueBuilder` event listener → `ChannexOutboundQueue` table → `ChannexOutboundWorker`. Excepción única: `FullSyncOrchestrator` puede llamar Gateway directo porque ya respeta su propia idempotencia + window enforcement.

### D-CHX-OUT-2 — Gateway methods toman arrays, no escalares

`pushRates(entries: Entry[])` y `pushRestrictions(entries: Entry[])` enforced en types. ESLint rule custom (o `tsc` strict type) rechaza `pushRate(date, value)` singular. AP-4 imposible por contrato.

### D-CHX-OUT-3 — Domain events vía EventEmitter, no polling

`@OnEvent('channex.rate.updated')` listener. Save handlers SOLO emiten — NO consultan DB Channex. AP-2.1 evitado por arquitectura.

### D-CHX-OUT-4 — Separación Availability vs Rates&Restrictions

`ChannexOutboundKind` enum con 2 valores explícitos. Worker drena cada kind como mensaje separado. Cero código que pueda mezclarlos. AP-2.8 estructuralmente imposible.

### D-CHX-OUT-5 — TokenBucket 10/min/property/kind

Memoria local por simplicidad v1.0.0. v1.0.5 → Redis backed cuando escalemos a multi-pod. Worker chequea bucket antes de llamar Gateway. 429 de Channex es señal de bucket mal calibrado → log critical + alert.

### D-CHX-OUT-6 — Retry-After header respetado, 5xx exp backoff

Implementación literal del estándar HTTP. 429 → `Math.max(retryAfterSec, 60)` (mínimo 60s per docs Channex "exponential backoff, minimum 1 minute pause"). 5xx → `2^attempts seconds` con max 5 attempts → DEAD_LETTER + AppNotif.

### D-CHX-OUT-7 — Full sync 1×/24h off-peak hard-coded

`FullSyncOrchestrator` chequea `channexLastFullSyncAt > 23h ago` antes de cualquier acción. Window: `channexFullSyncWindowStart..End` (default 03:00-05:00 local). Imposible disparar más seguido. AP-3 estructuralmente imposible.

### D-CHX-OUT-8 — Mapeos en DB, jamás en código

`Room.channexRoomTypeId`, `RatePlan.channexRatePlanId`, `PropertySettings.channexPropertyId`. Lint check pre-commit verifica que no haya UUIDs hardcodeados en `src/`. AP-5 detectable automáticamente.

### D-CHX-OUT-9 — Sandbox seed con variación realista

`prisma/seed-channex-sandbox.ts` (separado del seed principal) crea data variada per los lineamientos AP-2.4: 4 rate plans con rates distintos por día (BAR weekday vs weekend), restrictions varied, availability variable per room.

### D-CHX-OUT-10 — Suite cert tests es integration test de codepath real

Los 14 tests llaman a `RatesService`, `AvailabilityService`, `RestrictionsService` — **NO** al Gateway directo. Si el reviewer borra el archivo de tests, el sistema productivo sigue funcionando idéntico. AP-1 + AP-6 imposibles por construcción.

---

## 7. Lo que NO está en este sprint

- **Channex booking engine integration** — sprint v1.1+ separado.
- **Multi-property Brand-level sync** — requiere §63 multi-tenant v1.0.5+.
- **Group/master rates** — out of scope.
- **CTA/CTD per-channel overrides** — Channex no soporta per-channel restrictions vía CRS; los OTAs heredan del rate plan padre.
- **Outbound webhook from PMS to Channex** — Channex no implementa esto; lo nuestro es pull (Gateway).

---

## 8. Riesgos identificados

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| RATES-METRICS-COMPSET sprint no concluye antes que este → no hay RatePlan/RateOverride en DB para que rates.service.ts emita eventos | Alta (este sprint depende de ese) | Crítico | Coordinar orden: RATES-METRICS-COMPSET primero, luego este. O implementar mocks/stubs en RatesService que emitan los eventos con data hardcoded en sandbox seed. |
| Token bucket en memoria pierde estado al restart del worker | Media | Bajo (al restart reinicia bucket lleno → riesgo de burst 1× al arrancar) | Documentar; v1.0.5 → Redis |
| Channex sandbox no permite test de full-sync 500d | Baja | Medio (tendríamos que confiar en code review pre-screenshare) | Verificar con sandbox limit antes de Day 4. Si limitado, implementar test 100d y documentar el ramping a 500d con prueba en prod-like. |
| ESLint rule custom para prevenir UUIDs hardcoded es complejo de mantener | Baja | Bajo | Alternativa: pre-commit hook con grep simple. Documentado en `.husky/pre-commit`. |
| Worker concurrent runs en multi-pod → double processing | Baja (v1.0.0 es single-pod) | Crítico cuando escalemos | `FOR UPDATE SKIP LOCKED` mismo patrón que ChannexOutboxScheduler inbound. Multi-pod safe desde día 1. |

---

## 9. Definición de "Hecho" — checklist pre-Stage 4

Antes de pedir live screenshare a Channex:

- [ ] Los 14 integration tests pasan contra sandbox staging.channex.io
- [ ] `grep -rn "channex.*-[0-9a-f]\{8\}-" src/` returns 0 en archivos non-test
- [ ] Manual UI walkthrough: cambiar rate en RatesPage → POST /rates aparece en logs
- [ ] Manual UI walkthrough: stop-sell en MaintenancePage → POST /restrictions aparece
- [ ] Manual UI walkthrough: crear booking direct → POST /availability aparece
- [ ] DEAD_LETTER chaos test: provocar 5×429 → row queda DEAD_LETTER + AppNotif
- [ ] Full sync manual trigger: 2 HTTP calls, ambos 200
- [ ] Idempotency check: trigger full sync 2× en 1 min → segunda ignorada
- [ ] Token bucket test: 11 rate updates en 1 min → 10 enviadas, 1 encolada
- [ ] Documentación Test 14 declaraciones completa y publicada
- [ ] Logs operacionales: outbound queue counts en `/settings/channex`
- [ ] CLAUDE.md §139-§148 registradas como no-negociables
- [ ] Channex sandbox property tiene seed productivo variado (no uniforme)
- [ ] Sandbox booking real desde Booking.com test acct → recibido + acked (Test 11 ya cumplido por sprint INBOUND)

---

## 10. Notas finales

Este sprint **completa el ciclo de certificación Channex**. Combinado con CHANNEX-INBOUND (Days 1-7, ya cerrado), la rama `feature/channex-inbound` queda lista para merge a `main` cubriendo los 14 tests oficiales sin parches.

Estimación: **5-7 días-dev (1 dev secuencial)**.

Calendario revisado v1.0.0:
```
CHANNEX-INBOUND          5-7d  ✅ HECHO (Days 1-7 + audit fixes)
CHANNEX-OUTBOUND-CERT    5-7d  ← este sprint
CHECK-IN modal           1-2d
RATES-METRICS-COMPSET    20-23d (sprint hermano — habilita events para outbound rates)
QA-α mobile              4-5d
CI-RESCUE residual       0.5-1d
─────────────────────────────────
Total v1.0.0:            ~36-46d-dev = ~7-9 semanas calendar
```

**Dependencia crítica**: RATES-METRICS-COMPSET-CORE debe estar al menos parcialmente implementado (al menos RatePlan + RateOverride models) para que el outbound emita events de rates. Sin eso, este sprint queda incompleto en los Tests 2, 3, 4, 8. Decisión propuesta: **arrancar RATES-METRICS-COMPSET inmediatamente después de cerrar este plan**, y este sprint OUTBOUND-CERT se ejecuta durante la última semana de RATES-METRICS-COMPSET cuando los models ya están + en paralelo a su frontend.
