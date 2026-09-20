# Channex PMS Certification — 2ª entrega (2026-06-21)

> **Estado:** formulario **ENVIADO** 2026-06-21, esperando respuesta del auditor (Andrew Yudin).
> **Rama:** `fix/channex-cert-remediation` (commit `7823043`), **NO mergeada**.
> **Doc oficial (fuente de verdad):** https://docs.channex.io/api-v.1-documentation/pms-certification-tests
> **Sandbox:** `staging.channex.io` · api-key en `apps/api/.env` (`CHANNEX_API_KEY` / `CHANNEX_BASE_URL`).

Este documento es el registro completo de la **2ª entrega** tras el rechazo de la 1ª. Si el auditor vuelve a rechazar, empezar por la sección **"Riesgos residuales"** abajo.

---

## 1. Lección #1 (la más importante): los tests tienen fechas/valores EXACTOS en el doc

El error de la 1ª entrega (y de la mitad de la 2ª mientras la armaba) fue **inventar fechas/valores**. **Los escenarios de Tests 2-10 están fijados verbatim en el doc oficial** (fechas de **noviembre 2026**, no relativas). Hay que reproducirlos al pie de la letra. Resumen verbatim:

| Test | Escenario EXACTO del doc |
|---|---|
| 2 Single date/single rate | Twin BAR · **22-nov-2026** · **333** |
| 3 Single date/multiple rates | Twin BAR 21-nov=333 · Double BAR 25-nov=444 · Double B&B 29-nov=**456.23** (1 call) |
| 4 Multiple dates/multiple rates | Twin BAR 01→10-nov=241 · Double BAR 10→16-nov=**312.66** · Double B&B 01→20-nov=111 (1 call) |
| 5 Min stay | Twin BAR 23-nov=3 · Double BAR 25-nov=2 · Double B&B 15-nov=5 (**3 combos**, 1 call) |
| 6 Stop sell | Twin BAR 14-nov · Double BAR 16-nov · Double B&B 20-nov = true (**3 combos**, 1 call) |
| 7 Multiple restrictions | Twin BAR 01→10-nov {cta:true, ctd:false, max:4, min:1} · Twin B&B 12→16-nov {cta:false, ctd:true, min:6} · Double BAR 10→16-nov {cta:true, min:2} · Double B&B 01→20-nov {min:10} (**4 combos**, 1 call) |
| 8 Half-year | Twin BAR + Double BAR · **01-dic-2026 → 01-may-2027** (¡01-may, no 31-may!) · rates 432/342 · min 2/3 (1 call) |
| 9 Single date availability | Twin **21-nov-2026 = 7** · Double **25-nov-2026 = 0**. Escenario doc: *"Have Twin at 8 and Double as 1, then add a booking."* |
| 10 Multiple date availability | Twin **10→16-nov-2026 = 3** · Double **17→24-nov-2026 = 4** |

**Test 1 (Full Sync) — verbatim, exige 4 cosas (NO dicta estructura por-día vs date_range):**
1. **2 API calls** (1 × availability all rooms · 1 × rates & restrictions all rates).
2. **500 días**.
3. **Todos los rooms / todos los rates**.
4. **Valores variados** *"different inventory/rate/restriction values for multiple days of the year… not all rooms with 1 availability and 100 USD."*
> El doc **no muestra payload de ejemplo** ⇒ no exige "por-día"; mandar date_range merged es válido. **No asumir** estructura que el doc no pide.

---

## 2. La causa raíz del rechazo del Test 1 (campos faltantes)

El auditor rechazó la 1ª entrega porque los objetos de restricción del full sync **declaraban solo `rate`** (más algún campo suelto donde tenía valor no-default). Conteo exacto del rechazo (coincide con el task viejo `f6a4161c` que sigue en BD dev):

```
1652/2000 sin min_stay_through · 2000/2000 sin min_stay_arrival · 1990/2000 sin max_stay
1983/2000 sin closed_to_arrival · 1995/2000 sin closed_to_departure · 1999/2000 sin stop_sell
```

**Regla aprendida:** en el **full sync**, **cada** objeto de restricción debe declarar **TODAS** las restricciones que el PMS dice soportar (los 7: rate, min_stay_through, min_stay_arrival, max_stay, closed_to_arrival, closed_to_departure, stop_sell) **incluso con valores default** (min_stay=1, max_stay=0, booleans=false). Esto debe coincidir con lo marcado en el form *"What restrictions is supported"*.

**Fix (commit `7823043`):**
- `channex-full-sync.orchestrator.ts` → `buildRestrictionEntries`: emite los 7 campos en cada objeto (resueltos o default) + mergea días consecutivos idénticos en `date_range`.
- `rates.service.ts` → `applyRatesAndRestrictions`: `minStay` mapea a **AMBOS** `min_stay_through` + `min_stay_arrival` (la propiedad de cert tiene `min_stay_type="both"` → el auditor exige ambos; era el *warning* de Tests 5/7/8).
- `availability.service.ts` → push de disponibilidad mergeado en `date_range`.
- **Gateway** (`channex.gateway.ts:436-442`): serializa cualquier campo `!== undefined`. Por eso basta con que el builder los **defina** (0/false sí se incluyen). No tocar.

Verificado: el full sync nuevo (`6ba0aea0`) tiene **35/35 objetos con los 7 campos completos**.

---

## 3. Setup de la propiedad de cert (confirmado contra la API de Channex)

Propiedad **`Test Property - Zenix`** (USD). Mapeada en BD dev a `prop-channex-cert`. Twin = **8** rooms físicos, Double = **5** rooms físicos.

| Entidad | Channex ID |
|---|---|
| Property | `94d70281-07a8-4e6b-9273-724fa3b725dd` |
| Twin Room | `2e0b297f-b44c-4d60-87c5-1d3e27219628` |
| Twin · Best Available Rate | `88a90aa7-1bcc-41e4-a3dd-3e2a35227028` |
| Twin · Bed & Breakfast Rate | `56319005-c419-43af-b05b-5d3ad1944592` |
| Double Room | `cdff8770-40ff-4f2d-b402-2463a2eec9c2` |
| Double · Best Available Rate | `c57ad75e-aeee-434e-9ce1-2170f379912c` |
| Double · Bed & Breakfast Rate | `ca745836-8385-4a9c-bad7-15fede59a755` |

Locales (BD dev): Twin roomType `d765dff1-4045-4e75-842e-9df81ea5713b` · Double `e937c002-ef7f-4551-8e8a-8cb09dfcd0ee` · RatePlan BAR `542efca5-d19b-4106-88a9-c3124597f87e` · B&B `d1567cb6-a7b4-4769-b9b2-e5f0f90f8027`. Enlace par (roomType×ratePlan)→channex en tabla `channex_rate_plan_links`. Login: `cert@z.co` / `123456`.

---

## 4. Lo que se ENVIÓ (2026-06-21)

**PMS functionality:** Multiple Room Types = **Yes** · Multiple Rate Plans per Room Type = **Yes** · Restrictions = **las 8** (Availability, Rate, Min Stay Through, Min Stay Arrival, Max Stay, Closed To Arrival, Closed To Departure, Stop Sell) · Need credit card details = **No** (SAQ A) · PCI Certified = **No**.

**Rate limits = Yes** (token bucket 10/60s por propiedad×tipo, respeta `Retry-After`, difiere si se agota) · **Only send updated changes = Yes** (outbound event-driven, full sync 1×/24h off-peak, nunca por timer).

**Task IDs (todos `Yes` en applicable):**

| Test | Task ID(s) | Valores verificados |
|---|---|---|
| 1 Full Sync | `24f809db-40e3-4063-acac-6c2b9dbc8014` (avail) · `6ba0aea0-1795-4e0d-b584-1c72daed1699` (rates/restr) | 2 calls · 500 días · 2 rooms / 4 rates · 35/35 objetos con los 7 campos · valores variados (avail Twin 3/7/8, Double 0/4/5; 13 rates distintos) |
| 2 | `9ce824d0-fa73-4170-a4f2-9eefc7a021ed` | Twin BAR 22-nov=333 |
| 3 | `ce50806a-1ff3-4e30-b021-406880932afc` | 21/25/29-nov = 333/444/456.23 |
| 4 | `edaf0aba-cc33-42d2-9053-030921c2785b` | 241/312.66/111 en rangos |
| 5 | `cb2c7865-9c97-488c-8030-2748d4de1bf0` | min through+arrival 3/2/5 |
| 6 | `dcab5206-b608-43fe-bf93-cf7855b97034` | stop_sell true ×3 |
| 7 | `e3f9c682-a421-46a4-bc3c-07c65d163e70` | 4 combos cta/ctd/max/min |
| 8 | `8145b8c3-57c4-43c1-aba3-1bfa4142034d` | dic1→may1, 432/342 |
| 9 | `a5760799-2b70-489f-a899-cd6f31c5ea60` (Twin 21-nov=7) · `61c34f81-6c79-4ea8-bb08-beca8f863ecb` (Double 25-nov=0) | single date |
| 10 | `7891bbd5-7421-4bda-bf91-198e9c1a9615` (Twin 10-16nov=3) · `f8024930-b46e-483e-b3b7-aed5eca38f6f` (Double 17-24nov=4) | date_range |
| 11 | Booking `c3ebe11b-1e4e-4871-b92c-b9c4a083de4f` · New `a8a8580a-9bc7-4e92-a082-92a3397dc986` · Modified `57bb3e3f-7143-4f21-af92-d7c7da60a0f4` · Cancelled `7c51f30c-d4e9-4fde-9383-df422cb25469` | las 3 `acknowledge_status=acknowledged` |

---

## 5. Test 11 (Booking Receiving) — cómo se hizo

El rechazo decía *"3 booking_revision_received_via_list… must be via webhook"*. La 1ª entrega no tenía webhook ⇒ el feed/list descubría las reservas.

**Solución:** registrar un webhook en Channex apuntando al PMS y crear la reserva vía la app **Booking CRS** (la API `POST /bookings` da **403** — Booking CRS write no habilitado en el api-key; eso NO bloquea la cert).

- **Túnel:** `ngrok http 3000` → URL pública → registrar webhook:
  `POST /webhooks {webhook:{property_id:<channex>, callback_url:"<ngrok>/api/webhooks/channex", event_mask:"booking", is_active:true, send_data:true, headers:{"X-Channex-Property-Id":"prop-channex-cert"}}}`
  - El header `X-Channex-Property-Id` debe ser **el id interno** (`prop-channex-cert`), porque `ChannexAuthGuard` busca `PropertySettings` por esa columna. Con `channexWebhookSecretRequired=false` hace fail-open (sandbox).
- **Flujo correcto (confirmado en el doc):** webhook notifica → PMS hace **`GET /booking_revisions/:id`** (¡NO `GET /bookings`!) → **ack** (`POST /booking_revisions/:id/ack`). El "by-id fetching" prohibido es usarlo como **descubrimiento** (polling), no como fetch tras el webhook.
- **Booking CRS:** Applications → Booking CRS instalado · `/bookings` → "New booking" (Online/Booking.com) · Edit → cambiar status a "Modified" (p.ej. OTA commission 0→15) · Edit → status "Cancelled". Cada Save dispara el webhook.
- **⚠️ El túnel ngrok ya se cerró** y el webhook `0c25a2f8-aa20-4a0d-b223-dd7d7c6e1e78` apunta a una URL muerta. Si hay que **re-probar** Test 11: levantar ngrok de nuevo, **re-registrar** el webhook con la URL nueva, y crear otra reserva.

---

## 6. Cómo reproducir los pushes ARI (Tests 1-10)

Todo se dispara por endpoints REALES del PMS (API en `localhost:3000`, levantar con `cd apps/api && npx nest start --watch`):

- **Tests 2-8 (rates/restricciones):** `POST /api/v1/rates/ari/batch` con `{propertyId, updates:[{roomTypeId, ratePlanId, dateFrom, dateTo, rate?, minStay?, maxStay?, cta?, ctd?, stopSell?}]}` (1 call por test). `minStay` → ambos campos min-stay. Capturar `last_task_id` de `channex_outbound_queue` (kind=`RATES_RESTRICTIONS`, status=`SUCCEEDED`).
- **Test 1 (full sync):** `POST /api/v1/admin/channex/full-sync/prop-channex-cert` (SUPERVISOR; salta guardas pero marca lastFullSync). Genera 2 tasks (kind `AVAILABILITY` + `RATES_RESTRICTIONS`).
- **Tests 9-10 (disponibilidad):** crear reservas con `POST /api/v1/guest-stays` (source `WALK_IN`) en las fechas/cuartos exactos → el evento dispara el push de disponibilidad absoluta. Test 9 = single date (reserva de 1 noche); Test 10 = rango (reserva multi-noche). El push refleja `totalRooms − cuartos ocupados distintos`.

**Trampas que costaron tiempo (NO repetir):**
- El enum `ChannexOutboundStatus` es `PENDING, IN_PROGRESS, SUCCEEDED, FAILED, DEAD_LETTER` — **no existe `DEFERRED`**. La espera ("drain") se hace sobre `PENDING/IN_PROGRESS`.
- Comparar `created_at > now()::text` es **timezone-unsafe** (la sesión psql no es UTC). Para distinguir el push dirigido del full sync viejo, filtrar por `jsonb_array_length(payload->'entries') <= 10` (el full sync tiene 1000/35; los dirigidos tienen 1).
- El **token bucket** (10/60s por propiedad×kind) difiere pushes cuando se hacen muchas reservas seguidas → esperar a que drene.
- Para fijar disponibilidad exacta hay que **resetear** las reservas de prueba primero. Soft-cancel a veces deja choques de overlap → mejor **hard-delete** en orden de FK: `segment_nights → stay_journey_events → stay_segments → stay_journeys → (guest_stay_logs/contact_logs/notes/payment_logs) → guest_stays` (y `UPDATE channex_webhook_logs SET resulting_stay_id=NULL`).

---

## 7. Riesgos residuales (si vuelven a rechazar, empezar por aquí)

Honestamente, **no hay garantía del veredicto** (es del auditor). Los 2 únicos puntos que dependen de Channex y no pude verificar 100% de mi lado:

1. **Test 1 manda 35 objetos `date_range`** (no 2000 por-día). Cada objeto lleva los 7 campos ⇒ al expandir, 0 faltantes. El doc no exige estructura y Channex es range-nativo (Tests 4/7/8 pasaron con rangos). Riesgo bajo. **Si rechazan por esto:** cambiar `buildRestrictionEntries` para emitir **por-día** (deshabilitar el merge de restricciones) → 2000 objetos cada uno con los 7 campos → re-correr full sync → **NUEVOS** task IDs → re-confirmar todo el form.
2. **Test 11 "received via webhook"** es telemetría interna de Channex. Verifiqué: webhook registrado, los 3 eventos entraron por webhook (logs `[Channex webhook] accepted`), y las 3 revisiones están `acknowledge_status=acknowledged`. Riesgo bajo.

---

## 8. Estado del código

- Fix en commit **`7823043`** (rama `fix/channex-cert-remediation`, **sin merge**). Spec de integración `channex-push.integration.spec.ts` actualizado (min-stay ambos campos). 104/104 tests verdes en las suites afectadas + typecheck api/web.
- **No mergear** sin autorización del owner. El branch del sprint previo era `chore/channex-cert-prep` (ya en main vía PR #132/#133).
- Datos de prueba en BD dev (`prop-channex-cert`): reservas nov-2026 + overrides de rates/restricciones — **no son producción**, re-seedeables.
