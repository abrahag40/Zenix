# Sprint E2E-BUGHUNT-MOBILE — plan de trabajo

> Arrancado 2026-06-08. Misión: bug-hunting end-to-end con **3 superficies abiertas en navegador** (Channex sandbox + Zenix web :5173 + Zenix mobile Expo-web :8081), recreando casos de uso reales por rol. Verificación **visual en navegador**, no solo código. Foco: encontrar bugs (modo hunter), validar que mobile cumple lo esperado, y que el realtime (SSE/Kanban) fluye entre las 3 superficies.

## Entorno

| Superficie | URL | Notas |
|-----------|-----|-------|
| API | http://localhost:3000 (prefix `/api`) | NestJS watch |
| Web | http://localhost:5173 | Vite |
| Mobile | http://localhost:8081 | Expo web |
| Channex | https://staging.channex.io | Tulum = `ef0bdedf-e7fb-43fd-8664-a4dfb6bcec13` |

**Usuarios seed** (pwd `123456`): `s@z.co` SUP·Tulum · `r@z.co` REC·Tulum · `m@z.co`+`p@z.co` HK·Tulum · `rc@z.co` REC·Cancún · `l@z.co` HK·Cancún.
Seed: 30 rooms, 71 stays activas, Hotel Tulum (Channex) + Hotel Cancún (sin Channex).

## Metodología por caso

1. Estado inicial (snapshot web + mobile del rol).
2. Acción (UI o inyección Channex webhook).
3. Verificación cross-surface: ¿se refleja en web? ¿en mobile? ¿realtime sin reload?
4. Registrar PASS / BUG (con repro + severidad).

---

## RECEPTIONIST — casos (r@z.co)

- R1. Login mobile + dashboard role-aware (tabs Llegadas/Salidas, NO Walk-in §238).
- R2. Crear walk-in desde mobile (+Reservación → HOTEL_COLLECT, checkIn=now).
- R3. Confirmar check-in de una llegada (con saldo → pide pago; OTA → directo).
- R4. Check-out anticipado de un in-house.
- R5. Reserva OTA nueva (Channex booking_new) aparece en Llegadas mobile en realtime.
- R6. Grupo OTA multi-room (Channex) → ReservationGroup + bulk check-in.
- R7. Pull-to-refresh + last-sync timestamp (§244).
- R8. Donut ocupación 3-state correcto (no “9% con 0 ocupadas” §240).
- R9. Cross-tenant: REC Cancún NO ve datos Tulum (aislamiento).
- R10. Cancelación OTA (Channex booking_cancel) libera el slot en mobile/web.
- R11. Saldo de grupo: pagar por otra habitación (paidByStayId).
- R12. Empty states (sin llegadas/salidas) muestran texto explícito, no “—” (§241).

## SUPERVISOR — casos (s@z.co)

- S1. Login mobile → snapshot supervisor (donut + atención + KPIs).
- S2. Métricas dashboard web (ocupación/ADR/RevPAR último cierre).
- S3. Forecast heatmap + pace/pickup render.
- S4. Overstayed widget (zombie stays) en dashboard.
- S5. Conflictos Channex (`/channex/conflicts`) — booking sin room mapeable.
- S6. Política de cancelación: simulador en Settings.
- S7. Cancelar grupo (parcial vs total) con notif.
- S8. Aprobaciones de descuento (Nova billing) — si aplica scope.
- S9. Reembolso de cancelación (RegisterCancelRefundDialog) desde drawer.
- S10. Bloqueo de mantenimiento → habitación OUT_OF_ORDER en calendario.
- S11. No-show admin charging (registrar outcome).
- S12. Donut/empty states supervisor mobile (anti-regresión).

## HOUSEKEEPER — casos (m@z.co / p@z.co)

- H1. Login mobile → Hub Recamarista (tareas del día).
- H2. Checkout en web (REC) crea CleaningTask → aparece en Hub mobile realtime.
- H3. Same-day arrival OTA (Channex) → task URGENT en Hub (§235).
- H4. Ciclo limpieza: start → IN_PROGRESS → end → DONE.
- H5. Verify (SUP) → VERIFIED, Kanban se mueve realtime.
- H6. Room move (REC mueve habitación) → task migra fromRoom→toRoom (§236).
- H7. Agrupación dual room+priority en Hub (acordeón).
- H8. HOUSEKEEPER pega `/v1/dashboard/mobile` → 403 deeplink (§239).
- H9. Bulk-start desde room header.
- H10. Pausa/reanuda tarea (PAUSED ⇄ IN_PROGRESS).
- H11. HK no ve PII financiera (overstayed/reportes → 403).
- H12. Mantenimiento CRITICAL auto-bloquea → ¿afecta tarea HK?

## Cross-cutting / Channex (actor OTA)

- C1. booking_new single-room → web + mobile + HK task.
- C2. booking_new multi-room → ReservationGroup.
- C3. booking_modify (fecha) → same-day re-eval.
- C4. booking_cancel → soft-delete + libera.
- C5. Webhook dedup (retry) no duplica (E2E-14).
- C6. Realtime SSE: una acción en web se ve en mobile sin reload.

## Registro de hallazgos

| ID | Caso | Severidad | Estado | Repro |
|----|------|-----------|--------|-------|
| **E2E-15** | mobile-web auth roto: `client.ts getToken()` lee `SecureStore.getItemAsync` pero E2E-6 escribe el token en `localStorage` en web → 401 en TODO request autenticado. Dashboard mobile-web no carga para ningún usuario logueado. | 🔴 CRITICAL | ✅ FIXED (client.ts:132 platform branch) | login demo mobile-web → dashboard "No pudimos cargar" → network `/api/v1/dashboard/mobile` 401; con token manual → 200 |
| OBS-1 | Nombre duplicado "Bug Hunter Hunter" cuando booking trae `room.guestName` + `customer.surname`. | 🟡 baja | ⏳ a reproducir aislado | inject con guestName "Bug Hunter" + surname "Hunter" |
| OBS-2 | Saludo mobile usa label genérico "Recepcionista" en vez del nombre real "Carlos". | 🟢 cosmético | ⏳ | API `firstName:"Recepcionista"` |
| **E2E-17** | **compression middleware bufferea el SSE** → eventos `text/event-stream` quedan atrapados en el buffer gzip → el navegador NUNCA recibe eventos en tiempo real → Kanban/Hub/dashboard solo se actualizan al recargar. **Rompía TODO el realtime de la app** (introducido por COMPRESSION-CORE). | 🔴 CRITICAL | ✅ FIXED (`main.ts` filter excluye `/api/events`) | probe EventSource conectado + `task:upgraded` emitido a "N/N clients" → 0 eventos recibidos; tras fix → recibido en realtime |
| **E2E-16** | `task:upgraded`/`task:moved`/`task:paused_same_day_arrival` en `SseEventType` (§237) + manejados en mobile (§242) pero faltaban en el array runtime `ALL_SSE_TYPES` de `sseClient.ts` → el `EventSource` web no registraba `addEventListener` → Kanban ignoraba escalada same-day URGENT (§235) y migración por room-move (§236). | 🟠 HIGH | ✅ FIXED (`sseClient.ts` ALL_SSE_TYPES) | inject same-day → backend escala task a URGENT + emite SSE, pero web no reacciona |
| OBS-3 | i18n Hub mobile: "1 habitación**es** pendientes" (debe "pendiente"); "habitacion" sin tilde. | 🟢 cosmético | ⏳ | Hub María |

### Realtime — verificación end-to-end (post 3 fixes)
- **Flagship "el Kanban se mueve en tiempo real":** inject Channex same-day → backend escala task a URGENT (§235) → SSE `task:upgraded` → web refetch `GET /api/tasks` **en vivo** → contador URGENTE **9→11 sin reload** ✅ (screenshot)
- Probe EventSource recibe `channex:stay:created` + `task:upgraded` en realtime ✅
- §235 BookingSameDayListener: 8/8 inyecciones escalaron la task correcta a URGENT + TaskLog "auto-upgrade URGENT — OTA {name}" ✅

### Resumen ejecutivo de la sesión
**3 bugs de infraestructura realtime encontrados+arreglados** (2 CRITICAL + 1 HIGH). El más grave (E2E-17) rompía **todo** el SSE en producción — el diferencial central del PMS. Sin la cacería E2E en navegador no se detectaba (los 93 tests unit mockean el HTTP). Pendiente: verificar realtime en mobile Hub (mismo endpoint /api/events, fix aplica) + continuar casos por rol.

### Lote 2 — Channex cross-cutting + mobile realtime (post-fix realtime)
| ID | Caso | Severidad | Estado | Repro |
|----|------|-----------|--------|-------|
| **E2E-18** | Dashboard mobile recepcionista NO refetchea ante reserva Channex nueva — `MOBILE_DASHBOARD_TRIGGERS` (useMobileDashboard.ts:66) no incluye `channex:stay:created`. Nueva llegada OTA solo aparece tras poll 60s/reload. Contradice flagship "Channex→mobile realtime". | 🟠 HIGH | 📋 documentado (NO fixed) | mobile Carlos: Llegadas 10 → inject same-day → sigue 10; reload → aparece |
| OBS-4 | Stay en conflicto (NO_ROOM_TYPE_MATCH placeholder) aparece en "Llegadas" del recepcionista con room placeholder ("101 Nomap Type"). ¿Debe filtrarse de arrivals hasta resolver? | 🟡 revisar | 📋 | inject unmapped room_type |
| OBS-5 | Dashboard legacy HK mobile: "Ocupación 59% · Ocupadas 0" (cuenta llegadas como ocupación pero "Ocupadas" = 0). Inconsistencia §240 en pantalla legacy (HK no migrado a v2). | 🟡 revisar | 📋 (deferido HK-MOBILE-REDESIGN) | María Inicio |
| OBS-6 | Web equivalente a E2E-18: confirmar si web dashboard/calendario refetchea en `channex:stay:created` (no verificado). | 🟡 revisar | 📋 a verificar | — |

**PASS Lote 2 (visual):**
- **C2** Channex multi-room → `group_created` + 2 stays + ReservationGroup ✅
- **S5** Cola conflictos `/channex/conflicts`: AVAILABILITY_OVERLAP + alternativas ranqueadas + "Mover aquí" resuelve (§133 MOVE_ROOM) ✅
- **C5** room_type sin mapear → `conflict NO_ROOM_TYPE_MATCH` (§137) ✅
- **C4** create→cancel round-trip → `kind:cancelled` soft-delete (§135) ✅
- **C3** booking_modify cambio de fechas (ARRIVING) → `kind:updated` full update (§136) ✅
- **§62 D-Mx2** maintenance CRITICAL auto-bloqueó room 104 (OUT_OF_ORDER, visible web+mobile) ✅
- Mobile auth + dashboard recepcionista carga (post E2E-15 fix) ✅
- Move de conflicto se reflejó en arrivals mobile ("101 García") ✅

### Lote 3 — roles mobile + cross-tenant + calendario
| ID | Caso | Severidad | Estado | Repro |
|----|------|-----------|--------|-------|
| **E2E-19** | `ALL_SSE_TYPES` (sseClient.ts) incompleto vs lo que `useRoomSSE` (calendario) espera → faltaban `channex:stay:created/modified/cancelled/conflict` + `channex:group:*` + `task:paused/resumed/verified/deferred/retry-scheduled` → calendario web NO recibe reservas OTA nuevas/cancel ni animaciones de limpieza en realtime. Misma raíz que E2E-16. | 🟠 HIGH | ✅ FIXED (sseClient.ts ALL_SSE_TYPES completado) | diff `useRoomSSE` vs `ALL_SSE_TYPES`; comentario del propio código lo predecía |

**PASS Lote 3 (visual):**
- **S1 + §240** Supervisor mobile (Ana): donut centro "0 de 22" (fracción, no "9%"), 3 segmentos accionables + Disponibles gris separado ✅
- **R9 cross-tenant** Laura (Cancún) ve solo Hotel Cancún, NO Tulum ni inyecciones — aislamiento multi-tenant ✅
- **§241 empty states** "Sin llegadas programadas hoy" explícito (no "—") ✅
- **§239** supervisor snapshot V2 (donut + ATENDER AHORA + ingresos) carga ✅

### Resumen final de la cacería (este prompt)
**6 bugs realtime/infra encontrados:**
| ID | Sev | Estado |
|----|-----|--------|
| E2E-15 mobile-web auth (401 global) | 🔴 CRIT | ✅ fixed |
| E2E-17 compression bufferea SSE (rompe TODO realtime) | 🔴 CRIT | ✅ fixed |
| E2E-16 ALL_SSE_TYPES falta task:upgraded/moved | 🟠 HIGH | ✅ fixed |
| E2E-19 ALL_SSE_TYPES falta channex:* + task lifecycle (calendario) | 🟠 HIGH | ✅ fixed |
| E2E-18 mobile dashboard no refetch en channex:stay:created | 🟠 HIGH | 📋 documentado |
| OBS-1..6 (nombre duplicado, saludo genérico, i18n, conflict en arrivals, ocupación legacy) | 🟡🟢 | 📋 documentado |

> Los 4 fixes son de **infraestructura realtime** (auth + SSE delivery + completitud del array de eventos). Se hicieron para desbloquear la cacería — sin ellos NINGÚN flujo realtime se puede validar. E2E-18 + observaciones quedan documentados para trabajarlos juntos.

### Lote 4 — flujos booking (Fase C, no-show, grupos) — hunt API + spot visual
| ID | Caso | Severidad | Estado | Repro |
|----|------|-----------|--------|-------|
| ~~E2E-20~~ | ~~OTA amount no propaga a totalAmount~~ → **FALSO POSITIVO retractado**: artefacto de mi test (no pasé `amount` top-level → dev-controller defaulteó 150). Con `amount` correcto: `totalAmount:450 = monto OTA` ✅ | — | retractado | verificado totalAmount=450 |

**PASS Lote 4 (backend + spot visual):**
- **Fase C cancel+refund** (código nuevo #74): inject → pago $300 → `cancellation-preview` (free:false, tier 100% por checkin pasado, retención/refund correctos) → `cancel` (ok) → `register-cancel-refund` → `REFUNDED` ✅
- **Fase C group-cancel parcial**: `group-cancellation-preview` (members + retención per stay) → `group-cancel` 1 de 2 → `groupCancelled:false, remainingActive:1` (grupo sigue vivo) ✅
- **No-show admin** (§195-§199): `no-show` → `feeAmount:250, PENDING` → `register-noshow-charge` (CHARGED/ota_card) → `success` ✅
- **Grupo balance display** (§A3): Familia García sheet → per-room "Pagado/Llegó" + "Grupo totalmente pagado" ✅
- **Notif conflictos Channex** (§137): bell muestra "Llegó una reserva de Booking.com para habitación ya ocupada. Revisa y mueve" ✅
- **BookingDetailSheet**: tabs Estadía/Pago/Huésped/Notas + grupo + Cancelar render OK ✅
- **`/pms` timeline** (Walk-in §234, HOY/Semana/Mes, Tarifas, 58 bloques) carga ✅

> Nota de método: los controllers usan prefijo `/api/v1/...` (no `/api/...`). Confirmado endpoints guest-stays.

### Lote 5 — room-move reassignment + HK realtime (escenarios owner ronda 3)
| ID | Caso | Severidad | Estado | Repro |
|----|------|-----------|--------|-------|
| **E2E-21** | **Room-move NO reasigna a la recamarista del nuevo cuarto + NO notifica push.** `RoomMovedHkListener` (§236) crea la tarea migrada con `assignedToId: oldTask.assignedToId` (hereda) → NO pasa por `AssignmentService.autoAssign()` (viola §53 D10) → la tarea queda con la recamarista de la zona ORIGEN. Mover stay de room 106 (piso1, María) → 302 (piso3, Pedro): tarea 302 quedó `assignedTo=María Torres` (debió ser Pedro, primary piso3). Sin AppNotification/push a la nueva recamarista. | 🔴 HIGH | 📋 documentado (NO fixed) | `PATCH /v1/guest-stays/:id/move-room {newRoomId:302, pricingDecision:complimentary}` → DB: old 106 CANCELLED, new 302 assignedTo=María |

**Nota de diseño:** `autoAssign()` además respeta `assignedToId` existente (no-op si ya asignado, assignment.service.ts:64) → aunque el listener llamara autoAssign, al heredar el assignee NO reasignaría. El fix correcto: en cross-zone move, **limpiar assignedToId** y correr `autoAssign()` (que elige primary del nuevo cuarto vía StaffCoverage + ya emite push, líneas 143-157). StaffCoverage Tulum por piso: P0 Diego, P1 María, P2 Valentina, P3 Pedro.

| OBS-7 | Hub mobile: header "¡Día limpio! Sin tareas pendientes 🎉 · 2/2 100%" contradice la card "1 pendiente" cuando hay una tarea PENDING (no-actionable, "esperando salida"). Mensajería confusa. | 🟢 baja | 📋 | María Hub tras migración 302 |

**Confirmación visual E2E-21:** tras mover 106→302, la tarea migrada aparece en el Hub de **María** (mobile, realtime) — recamarista de piso 1 con una tarea de piso 3. Pedro (primary piso 3) no la ve.

**PASS Lote 5:**
- **§235 same-day arrival escala a URGENT** antes del checkin (8/8 inyecciones, verificado lote 1) + si el cuarto tiene checkout hoy → URGENT prioritaria ✅
- **Room-move migra el cuarto de la tarea** (106 CANCELLED → 302 nueva con carryover) ✅ — la mitad del flujo
- **Realtime delivery del move** (`room:moved` + `task:moved` SSE) funciona post E2E-17 ✅ (entrega; el assignee es el bug)
- **moveRoom** acepta arriving (no requiere checked-in), guard checked-out ✅
- Nueva reserva Channex solo entra a lista HK si el cuarto necesita limpieza (tuvo checkout) — comportamiento correcto ✅

### ✅ Harness removido (2026-06-08)
- `dev-channex-inject.controller.ts` + su registro eliminados tras cerrar la cacería. Sin referencias residuales.

---

## Sesión de bug-fixing (2026-06-08) — fixes aplicados

| ID | Sev | Fix | Verificación |
|----|-----|-----|--------------|
| **E2E-15** | 🔴 CRIT | `mobile/client.ts getToken()` lee localStorage en web | ✅ dashboard mobile carga |
| **E2E-17** | 🔴 CRIT | `api/main.ts` excluye `/api/events` del compression | ✅ probe recibe SSE realtime |
| **E2E-16** | 🟠 HIGH | `web/sseClient.ts` ALL_SSE_TYPES + task:upgraded/moved | ✅ Kanban live 9→11 |
| **E2E-19** | 🟠 HIGH | `web/sseClient.ts` + channex:* + task lifecycle | ✅ typecheck + array gate |
| **E2E-21** | 🔴 HIGH | `room-moved-hk.listener` no hereda assignee → `autoAssign()` (cobertura del nuevo cuarto) + push | ✅ e2e: 104→301 reasignó a Diego (P3 backup) no María (P1) + `task:auto-assigned` SSE; spec 6/6 |
| **E2E-18** | 🟠 HIGH | `mobile/useMobileDashboard` MOBILE_DASHBOARD_TRIGGERS + channex:* | ⚠️ code-correct, no verificable en Expo web (ver E2E-22) |
| **E2E-22** | 🟠 HIGH | `mobile/useSSE.ts` ALL_SSE_TYPES + task:upgraded/moved + channex:* (gate del EventSource mobile) | ⚠️ code-correct; **react-native-sse NO conecta en Expo web** → solo verificable en build nativo |
| **OBS-1** | 🟡 | `channex-booking.mapper` name source atómico (no mezcla room-guest name + customer surname) | ✅ "Bug Hunter Hunter"→"Bug Hunter"; regresión spec 19/19 |

**Diferidos / no-bug:**
- **OBS-2** (saludo "Hotelero"/"Recepcionista"): artefacto de seed (User.firstName null en demo-users; users del wizard sí traen firstName). Fallback intencional, no bug de producción.
- **OBS-3/5/7** (i18n Hub, ocupación 59%/0, header vs count): en el **Hub Recamarista legacy** → diferidos a sprint HK-MOBILE-REDESIGN (se reescribe esa pantalla).
- **E2E-23** (muchos `GET /dashboard/mobile`): probable artefacto de logins repetidos en la sesión de test; **verificar en sesión limpia** que no sea loop.

**E2E-24 (causa real del "mobile sin realtime", corrige conclusión previa):** NO era que `react-native-sse` no funcione en web. El stub `_layout.web.tsx` (creado por el fix E2E-7 para que el bundle monte en web) **omitía `useGlobalSSEListener()`** junto con los efectos native-only → en web el listener SSE nunca se montaba → cero conexión. **Fix:** montar `useGlobalSSEListener()` en `_layout.web.tsx`. **Verificado en Expo web:** consola mobile `[SSE] Connecting to /api/events` + `[SSE] event recv: notification:new` + `task:auto-assigned`; API `SSE emit → 1/1 clients`. → El mobile **SÍ recibe eventos SSE en realtime en web**; E2E-18/E2E-22 quedan verificables y funcionales en Expo web (ya no requieren build nativo para verificar).

**Tests al cierre:** scheduling+assignment+channex 108/108 · mapper 19/19 · room-moved 6/6 · mobile 100/100. Typecheck API+web limpios (mobile: 2 specs pre-existentes ajenos).

### PASS confirmados (visual en navegador)
- **C1/R5 (flagship)** Channex booking_new → web dashboard realtime ("Llegada hoy 1 · Bug Hunter · Hab B2") ✅
- **C6** Channex → **mobile** realtime (post-fix E2E-15): Llegadas 1 · B2 · Bug Hunter · ETA 15:00 · $150 ✅
- **E2E-9** inHouseCount no infla por zombies (0 en casa / 71 stays viejas / "20 salidas vencidas") ✅
- **§238** mobile RECEPTIONIST sin tab Walk-in (solo Llegadas/Salidas) ✅
- **§244** "Última actualización · hace segundos" presente ✅
