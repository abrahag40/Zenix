---
Audiencia: Channex certification team + owner ZaharDev
Tipo: Cert Stage 4 — Test 14 declaraciones formales
Status: ACTIVO — entregable junto al request de live screenshare
Padre: docs/sprints/CHANNEX-OUTBOUND-CERT-plan.md
Última actualización: 2026-05-22
---

# Channex PMS Cert — Test 14 Declarations (Zenix PMS)

> **Test 14 (oficial)**: "Extra Notes — Declare: Min-Stay support type,
> unsupported restrictions, room/rate plan support, PCI status."
>
> Este doc responde formalmente cada pregunta del cuestionario Test 14
> y se adjunta al request de Stage 4 live screenshare review.

---

## Partner identification

| Campo | Valor |
|---|---|
| PMS name | Zenix PMS |
| Vendor | ZaharDev S.A. de C.V. |
| Country of operation | México (HQ) — multi-country LATAM |
| First production target | Tulum, Quintana Roo (Hotel Monica) |
| Contact | abrahag40@gmail.com |
| Repo branch | `feature/channex-inbound` (será merged a `main` antes de cert) |
| Sandbox property tested | `ef0bdedf-e7fb-43fd-8664-a4dfb6bcec13` (Hotel Boutique Test Tulum) |

---

## 14.1 — Min-Stay support

**Question**: "What types of Min-Stay does your PMS support: Min Stay Through, Min Stay Arrival, both?"

**Answer**: **BOTH**

- `min_stay_through` ✅ — la restricción aplica a TODOS los días de la
  estadía. Si min_stay_through=3 el día Friday, una reserva que CUBRA
  Friday debe ser de al menos 3 noches.
- `min_stay_arrival` ✅ — la restricción aplica solo al día de check-in.
  Si min_stay_arrival=2 el Friday, una reserva con check-in Friday debe
  ser de al menos 2 noches.

Ambos son pasados directamente al endpoint `/restrictions` via
`ChannexRestrictionEntry`:

```typescript
// apps/api/src/integrations/channex/channex.gateway.ts:534
minStayThrough?: number
minStayArrival?: number
```

`min_stay` (legacy) también soportado por backward-compat.

---

## 14.2 — Restrictions soportadas

**Question**: "Which restrictions does your PMS support? Stop Sell, CTA, CTD, Min Stay, Max Stay?"

| Restricción | Status | Notas |
|---|---|---|
| Stop Sell | ✅ Soportado | `stopSell: boolean` |
| Closed to Arrival (CTA) | ✅ Soportado | `closedToArrival: boolean` |
| Closed to Departure (CTD) | ✅ Soportado | `closedToDeparture: boolean` |
| Min Stay Through | ✅ Soportado | `minStayThrough: number` |
| Min Stay Arrival | ✅ Soportado | `minStayArrival: number` |
| Max Stay | ✅ Soportado | `maxStay: number` |
| Days filter | ✅ Soportado | `days: ['mo','tu',...]` para weekday-only restrictions |
| Per-occupancy rates | ✅ Soportado | `rates: [{occupancy, rate}]` array |

Todas las restricciones se envían vía `POST /api/v1/restrictions` en una
sola llamada por property/kind (cert Test 7 cumplido). Validación
`pushRestrictions` rechaza entries sin al menos un restriction field
(Channex requirement enforced en gateway).

---

## 14.3 — Room types + Rate plans

**Question**: "Does your PMS support multi-room types and multi-rate-plans?"

**Answer**: **YES (multi-room types) + PENDING (multi-rate-plans v1.0.x)**

### Multi-room types ✅

- Cada `Room` en Zenix puede mapear a un `channex_room_type_id`
- Multiple Zenix Rooms pueden compartir el mismo `channex_room_type_id`
  (ejemplo: 10 habitaciones "Standard Double" → 1 Channex room type)
- El `FullSyncOrchestrator` agrupa por `channex_room_type_id` y agrega
  la availability sumando los rooms del grupo

### Multi-rate-plans 🟡 (sprint en curso)

- **Infraestructura outbound 100% lista**: `pushRestrictions` toma
  `ratePlanId` y batches multi-rate-plan en 1 HTTP call
- **Modelo de datos**: `RatePlan` está documentado en
  [docs/sprints/RATES-METRICS-COMPSET-CORE-plan.md](../sprints/RATES-METRICS-COMPSET-CORE-plan.md)
  como sprint v1.0.0 — estimado 20-23 días-dev
- **Wiring**: una vez RatesService exista, agregar
  `events.emit(CHANNEX_RESTRICTION_UPDATED, ...)` post-save. 0.5-1d-dev.
  Documentación handoff: [docs/sprints/CHANNEX-OUTBOUND-CERT-handoff-to-rates.md](../sprints/CHANNEX-OUTBOUND-CERT-handoff-to-rates.md)
- **ETA full cert outbound rates**: cuando RATES sprint cierre

---

## 14.4 — Credit card / PCI compliance

**Question**: "Are credit cards required with bookings? PCI certified or tokenization service?"

**Answer**: **TOKENIZATION via Stripe — NO direct CC handling**

- Zenix usa Stripe SetupIntent para guardar `card-on-file` de huéspedes
  al momento del check-in. La PAN nunca toca nuestros servers.
- Pre-stay CC tokenization es opcional per-rate-plan (futuro v1.0.1
  PAY-CORE — cuando RatePlan model exista)
- Para reservas que llegan con virtual card via Channex (`payment_collect=ota`),
  los campos `guarantee.card_*` enmascarados de Channex se persisten en
  `GuestStay.channexGuaranteeMeta` (post v1.0.1) — masked PAN solamente,
  PCI-safe
- **PCI level**: SAQ A (merchant outsources all CC handling to Stripe).
  Zenix NUNCA almacena PAN, CVV ni magnetic stripe data.

Ver detalle: [CLAUDE.md §63 SEC-α](../../CLAUDE.md) + Stripe integration
docs en [apps/api/src/payments/](../../apps/api/src/payments/)

---

## 14.5 — Booking acknowledge flow

**Question**: "Confirm booking_revisions ack flow per Channex docs."

**Answer**: ✅ **Compliant**

- PMS llama `GET /api/v1/booking_revisions/:id` al recibir webhook
- PMS llama `POST /api/v1/booking_revisions/:id/ack` SOLO después de
  successful save en DB local
- Idempotency: ack 404 / 422 tratado como `alreadyAcked: true` (no
  DEAD_LETTER falso alarm)
- Implementación: [channex-revision-puller.service.ts](../../apps/api/src/integrations/channex/inbound/channex-revision-puller.service.ts)
- Tests: 21 unit + 3 sandbox integration

---

## 14.6 — Rate limits compliance

**Question**: "Confirm queue/limiter respects 10 ARI/min + 10 avail/min per property."

**Answer**: ✅ **TokenBucketService enforces estructural**

- 10 tokens / 60s sliding window per (property, kind)
- AVAILABILITY y RATES_RESTRICTIONS tienen buckets separados (20 total
  per property max)
- Implementación: [channex-token-bucket.service.ts](../../apps/api/src/integrations/channex/outbound/channex-token-bucket.service.ts)
- 429 response from Channex → Worker programa `nextAttemptAt =
  max(60s, Retry-After header)` (cert recommendation "minimum 1 minute pause")
- 5xx → exponential backoff `2^attempts` seconds, max 5 attempts →
  DEAD_LETTER + AppNotification SUPERVISOR
- Observability: `/settings/channex` admin page muestra token bucket
  capacity en tiempo real

---

## 14.7 — Update logic (delta vs full sync)

**Question**: "Confirm no timer-based full sync; deltas only."

**Answer**: ✅ **Delta-only enforced estructuralmente**

- Save handlers emiten domain events (`channex.availability.changed`,
  `channex.restriction.updated`) con delta exacto post-commit
- `OutboxBuilder` listener traduce events a outbox rows
- `Worker` drena batch=4 cada 30s respetando rate limit
- **Full sync**: SOLO via `FullSyncOrchestrator` con 2 hard guards
  estructurales:
  1. `channexLastFullSyncAt > 23h ago` (idempotency)
  2. Local hour ∈ `[channexFullSyncWindowStart, channexFullSyncWindowEnd)`
     (default 03:00-05:00 local)
- Manual trigger admin API también marca lastSync (cron no re-dispara)
- Grep static check en CI: no `EveryMinute` / `EveryFiveMinutes` triggers
  para full sync

Ver: [channex-full-sync.orchestrator.ts](../../apps/api/src/integrations/channex/outbound/channex-full-sync.orchestrator.ts)

---

## 14.8 — Webhook acknowledge timing

**Question**: "What's your typical ack timing post-booking receive?"

**Answer**: **P95 ~2-3 segundos end-to-end**

- Webhook arrive → respond 200 in <100ms (`setImmediate` trigger del
  puller fire-and-forget)
- Puller pickup → `GET /booking_revisions/:id` ~500-1000ms
- Handler save → `POST /booking_revisions/:id/ack` ~500ms
- Safety net: `ChannexOutboxScheduler` cron 30s cubre si setImmediate
  falla
- `non_acked_booking` event (Channex 30-min retry) automáticamente
  procesado por el feed scheduler (cubre webhook drops)

---

## 14.9 — Anti-patterns explicit acknowledgement

| Anti-pattern | Status | Evidence |
|---|---|---|
| 1. Standalone script/CLI/Postman | ✅ Avoided | Integration tests llaman codepath productivo |
| 2. Certification UI separada | ✅ Avoided | No UI nueva; reusa SettingsPage existente |
| 3. Full-sync timer | ✅ Avoided | 2 guards estructurales + grep CI check |
| 4. Per-date loops | ✅ Avoided | Gateway methods toman arrays solamente |
| 5. UUIDs hardcoded | ✅ Avoided | Mappings en DB (Room.channexRoomTypeId) |
| 6. Logic in test files | ✅ Avoided | Tests llaman services, no contienen lógica |
| 2.1 DB polling | ✅ Avoided | EventEmitter in-process domain events |
| 2.2 Direct API from save | ✅ Avoided | Outbox pattern obligatorio + grep CI test |
| 2.3 Silent drop 429 | ✅ Avoided | DEAD_LETTER + AppNotif visible |
| 2.4 Data uniforme | ✅ Avoided | Full sync queries real Prisma data |
| 2.5 No ack | ✅ Avoided | Ack always called post-save (grep verifies order) |
| 2.6 Legacy /bookings | ✅ Avoided | Only `/booking_revisions/feed` used |
| 2.7 Constant pull | ✅ Avoided | Feed scheduler 30min, processes unacked only |
| 2.8 Mixed payload | ✅ Avoided | `ChannexOutboundKind` enum separa estructuralmente |

Cada anti-pattern tiene cobertura verificable en
[channex.cert-tests.integration.spec.ts](../../apps/api/src/integrations/channex/channex.cert-tests.integration.spec.ts).

---

## 14.10 — Pending items (transparencia al reviewer)

| Item | Status | ETA |
|---|---|---|
| Outbound rates push (Tests 2-8) | Infra 100% lista; espera `RatePlan` model del sprint RATES-METRICS-COMPSET-CORE | 4-5 semanas (sprint en cola) |
| Multi-occupancy rates push | Gateway soporta `rates: [{occupancy, rate}]`; activación junto con #1 | Mismo sprint |
| Promotions / Discount Codes | Out of scope v1.0.x | v1.1+ |
| Brand-level multi-property sync | Requiere multi-tenant migration v1.0.5+ | v1.0.5 |

---

## Aprobación del owner

Las respuestas anteriores son fiel reflejo del estado actual del codebase
en branch `feature/channex-inbound` al commit `20f799d` (Day 6 cierre).

Cualquier cambio en restricciones soportadas o flujos descritos debe
re-revisarse antes del Stage 4 live screenshare scheduling.

**Owner**: Abraham Hernandez
**Email**: abrahag40@gmail.com
**Fecha**: 2026-05-22
