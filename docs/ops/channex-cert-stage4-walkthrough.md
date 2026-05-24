---
Audiencia: Dev haciendo el live screenshare cert + Channex reviewer
Tipo: Script de demo Stage 4
Status: Activo — usar al agendar live screenshare con Channex team
Padre: docs/sprints/CHANNEX-OUTBOUND-CERT-plan.md
Última actualización: 2026-05-22
---

# Channex Cert Stage 4 — Live Screenshare Walkthrough (Zenix)

> **Tiempo estimado**: 45-60 min.
> **Audiencia**: Channex certification reviewer.
> **Objetivo**: demostrar codepath productivo cumple los 14 cert tests +
> 14 anti-patrones, en orden que minimice friction.

---

## Pre-screenshare checklist (24h antes)

- [ ] Branch `feature/channex-inbound` mergeado a `main` (o screenshare desde la branch directamente)
- [ ] Sandbox property setup en `staging.channex.io` con datos VARIADOS
  (no uniformes) — ver `docs/ops/channex-sandbox-seed.md`
- [ ] `.env` con `CHANNEX_API_KEY` apuntando al sandbox confirmado
- [ ] `CHANNEX_SANDBOX_PROPERTY_ID`, `CHANNEX_SANDBOX_ROOM_TYPE_ID`,
  `CHANNEX_SANDBOX_RATE_PLAN_ID` envs seteados (si los tests rate los
  necesitan)
- [ ] Apps locales corriendo: `apps/api` + `apps/web` + Postgres
- [ ] Dev tools abiertos: VSCode + browser con `/settings/channex` cargada
- [ ] Browser logueado como SUPERVISOR (`s@z.co` / `123456`)

---

## Walkthrough order (optimizado para velocidad)

### Sección 1 — Setup verification (5 min)

**Goal**: probar al reviewer que estamos vivos en sandbox.

1. Abrir `/settings/channex` en browser → muestra status snapshot
   - Counts outbound + inbound últimas 24h
   - Token bucket bars
   - Last full sync timestamp
2. Click "Manual full sync" → toast "Full sync disparado"
3. Refresh 30s → counts SUCCEEDED suben

**Lo que el reviewer ve**:
- ✅ Queue/outbox existe entre PMS y Channex (AP-2.2)
- ✅ Token bucket activo (AP-2.3 + Test 12)
- ✅ Manual trigger funcional (cert Test 1)

---

### Sección 2 — Tests 9 + 10: Availability batching (10 min)

**Goal**: ver POST /availability con multiple entries en 1 HTTP call.

1. Abrir VSCode → mostrar
   [apps/api/src/pms/availability/availability.service.ts:399-450](../../apps/api/src/pms/availability/availability.service.ts)
   - Señalar `notifyChannex` → emit event (NO direct API call)
   - Señalar `CHANNEX_AVAILABILITY_CHANGED` constant
2. Abrir browser → calendar de reservas
3. Crear reserva manual (un walk-in) → save commit
4. **Inmediato**: refresh `/settings/channex` → counts OUTBOUND SUCCEEDED +1
5. Tab Channex sandbox extranet → ver availability=N-1 en la fecha
6. Crear OTRA reserva 5 segundos después
7. Refresh `/settings/channex` → 2 SUCCEEDED rows
   - **Punto crítico**: 2 reservas = 2 events = 2 outbox rows = 2 HTTP
     calls (no batched en este flow porque cada uno es independiente
     y dispara save handler separado)
8. Trigger Manual full sync → ver entry batch de 500d en una sola call
   en Channex logs

**Lo que el reviewer ve**:
- ✅ Test 9 (single avail) ✓
- ✅ Test 10 (multi-date avail) ✓ via full sync
- ✅ AP-2.2 — save handler no llama Gateway direct (mostrar archivo)
- ✅ AP-4 — gateway acepta arrays, no per-date loop

---

### Sección 3 — Test 11: Booking Receive + Ack (10 min)

**Goal**: webhook real-time inbound → save → ack.

1. Sandbox extranet → simular booking en Booking.com test acct
2. Browser pestaña `/settings/channex` → counts INBOUND +1 (PENDING → SUCCEEDED en <5s)
3. Browser pestaña Calendario → reserva nueva aparece (con badge OTA)
4. Abrir VSCode →
   [channex-revision-puller.service.ts:88-120](../../apps/api/src/integrations/channex/inbound/channex-revision-puller.service.ts)
   - Señalar orden: `getBookingRevision` → `bookingNew.handle` → `ackBookingRevision`
   - Ack SOLO después de successful save (AP-2.5)
5. Modify booking en sandbox → calendar refresca, modify reflejado
6. Cancel booking en sandbox → reserva marcada `cancelledAt` con
   `cancelInitiator=OTA`

**Lo que el reviewer ve**:
- ✅ Test 11 booking receive + ack ✓
- ✅ AP-2.5 ack después de save (mostrar código)
- ✅ AP-2.6 endpoint `/booking_revisions` (NO legacy `/bookings`)

---

### Sección 4 — Test 13: Delta-only update logic (5 min)

**Goal**: probar NO timer-based full sync.

1. Abrir VSCode →
   [channex-full-sync.orchestrator.ts:64-100](../../apps/api/src/integrations/channex/outbound/channex-full-sync.orchestrator.ts)
   - Señalar `@Cron('*/30 * * * *')` UTC
   - Señalar dos guards estructurales: `inWindow` + `MIN_INTERVAL_MS`
2. Demo: cambiar `Date.now()` mental para que esté fuera de window
   (no hace falta correr — explicar)
3. Mostrar `/settings/channex` → "Próxima full sync elegible: en 15h"
4. Trigger Manual full sync 2 veces seguidas → segunda llamada respeta
   `TOO_RECENT` guard (idempotencia visible en API response)

**Lo que el reviewer ve**:
- ✅ Test 13 delta-only ✓
- ✅ AP-3 timer full-sync estructuralmente prevented
- ✅ Idempotencia 23h enforced

---

### Sección 5 — Test 12: Rate limits (5 min)

**Goal**: probar el TokenBucketService activo.

1. Abrir
   [channex-token-bucket.service.ts](../../apps/api/src/integrations/channex/outbound/channex-token-bucket.service.ts)
   - Señalar `CAPACITY = 10`, `WINDOW_MS = 60_000`
   - Sliding window comments
2. Abrir
   [channex-outbound-worker.service.ts:148-170](../../apps/api/src/integrations/channex/outbound/channex-outbound-worker.service.ts)
   - Señalar `bucket.consume()` ANTES del Gateway call
   - Si `!ok` → row DEFERRED sin attempt++
3. `/settings/channex` → mostrar bar de tokens al 60% → 70% → 80%
4. Disparar 11 modificaciones rápidas (puede ser via integration test
   running) → 11th deferred + queue muestra PENDING vs IN_PROGRESS

**Lo que el reviewer ve**:
- ✅ Test 12 rate limiter ✓
- ✅ AP-2.3 retry logic visible (FAILED → DEAD_LETTER)

---

### Sección 6 — DEAD_LETTER visibility (3 min)

**Goal**: probar AP-2.3 "no silent drop".

1. Si hay DEAD_LETTER rows en sandbox: mostrar en `/settings/channex`
2. Si no: provocar uno temporal apagando el `CHANNEX_API_KEY` en `.env`
   y disparando una notify
   - Ver row FAILED → FAILED ×5 → DEAD_LETTER → AppNotification bell badge
3. Mostrar
   [channex-outbound-notif.service.ts](../../apps/api/src/integrations/channex/outbound/channex-outbound-notif.service.ts)
   - `expiresAt: null` (compliance permanente)
   - Visible al SUPERVISOR vía bell + `/settings/channex`

---

### Sección 7 — Code grep walk (5 min)

**Goal**: cumplir "Stage 4 reviewer reads your code" requirement.

1. Abrir terminal en repo
2. Correr `npx jest channex.cert-tests.integration --runInBand`
3. Reviewer ve los 11 tests verde + 9 skipped (Tests 2-8 marked como
   pendientes RATES sprint con doc handoff)
4. Correr grep checks integrados en el spec:
   ```
   ✓ AP-5: no UUIDs hardcoded
   ✓ AP-2.6: no GET /bookings legacy
   ✓ AP-2.5: ack después de save
   ✓ AP-2.2: no direct API from save handlers
   ```
5. Mostrar [CHANNEX-OUTBOUND-CERT-handoff-to-rates.md](../sprints/CHANNEX-OUTBOUND-CERT-handoff-to-rates.md) —
   contrato exacto que RatesService va a usar cuando exista

---

### Sección 8 — Test 14 declarations review (5 min)

**Goal**: leer juntos el form de declaraciones.

1. Abrir
   [docs/ops/channex-test-14-declarations.md](channex-test-14-declarations.md)
2. Leer cada sección 14.1 a 14.10 — el reviewer marca checkbox
3. Aclarar el "pending" item 14.10 sobre rates push

---

## Sección 9 — Q&A (5-10 min)

Reviewer probablemente pregunta:

**Q: "What happens if Channex returns 500 for 30 seconds?"**
- A: Worker marks FAILED, exponential backoff 2,4,8,16,32 seconds.
  Próximo tick cron retries. Si Channex recovera entre attempts → SUCCEEDED.
  Si 5 attempts pasan sin éxito → DEAD_LETTER + SUPERVISOR notif.
- Demo: live mocking the gateway throw → ver row pasa de PENDING → FAILED → DEAD_LETTER.

**Q: "What if the PMS server crashes mid-processing?"**
- A: Outbox status PENDING/IN_PROGRESS preservado en Postgres. Restart
  → cron next tick → FOR UPDATE SKIP LOCKED picks it up. Booking
  acknowledge se hace SOLO post-save (no inflight loss).

**Q: "Multi-property scenarios?"**
- A: Hoy Zenix soporta 1 property por instance (v1.0.0). Multi-property
  Brand-level sync requiere v1.0.5+ multi-tenant migration. Roadmap
  documented en CLAUDE.md §63-§80.

**Q: "When will rates push be live?"**
- A: Infra outbound 100% lista. Espera del sprint RATES-METRICS-COMPSET-CORE
  (~20-23 días-dev) que agregue RatePlan model + RatesService. Una vez
  ese sprint cierre, 0.5-1d-dev de wiring activa los Tests 2-8. ETA: 5-6
  semanas calendar tras este Stage 4 review.

---

## Post-screenshare

- [ ] Pedir feedback formal del reviewer (qué falló, qué pasó, qué falta)
- [ ] Si pass → solicitar credenciales production + plan de rollout
- [ ] Si fail → revisar feedback + sprint corrective antes de re-request
- [ ] Documentar en sprint retro en `docs/ops/channex-cert-retro.md`
