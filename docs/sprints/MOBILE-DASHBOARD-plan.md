# MOBILE-DASHBOARD-plan — rediseño dashboard role-aware + fix gaps HK ↔ Channex

**Status**: borrador para aprobación owner · 2026-06-08
**Estimación total**: 8-11 días-dev secuencial 1 dev · ~2 semanas calendar
**Bloquea**: v1.0.0 piloto (cualquier supervisor móvil del piloto Hotel Monica Tulum tendrá esta UX)
**Branch propuesto**: `feat/mobile-dashboard-role-aware`

---

## 1. Contexto + research base

### 1.1 Hallazgos del audit visual (4 screenshots owner 2026-06-08)

| Tipo | Detalle | Severidad |
|------|---------|-----------|
| 🔴 Bug datos | Donut "9% ocupación" inconsistente con Ocupadas=0 + Vacías=20 (22 total → debería ser 0%). El verde grande = "Vacías" (semántica invertida). | Crítico |
| 🔴 Bug datos | "EN CASA 5 huéspedes" con Ocupadas=0 — físicamente imposible | Crítico |
| 🔴 Trust | "Datos en tiempo real próximamente" banner permanente erosiona confianza en TODO el dashboard | Alto |
| 🟠 Operación | "Tu día — tareas activas" muestra `—` (placeholder roto) en lugar de 0 | Alto |
| 🟠 Operación | "104 Bloqueo automático por ticket..." truncado — info crítica oculta | Alto |
| 🟠 UX | Sin pull-to-refresh detectable (estándar iOS/Android operations) | Alto |
| 🟡 UX | Sin "última sync" timestamp | Medio |
| 🟡 UX | Tipo de cambio card vacía siempre visible (desperdicio prime real estate) | Medio |
| 🟡 UX | Color "104 bloqueado" rojo solid (debe ser ámbar — no es alarma vital, es importante) | Medio |
| 🟡 UX | Tipografía sin escala modular (5+ tamaños distintos sin patrón) | Medio |
| 🟡 UX | Sin diferenciación por rol (mezcla métricas Supervisor + operación Recepcionista + Housekeeper) | Medio |

### 1.2 Referencias visuales (research previo §84 + §39)

| App | Patrón referenciable | Acción |
|-----|---------------------|--------|
| **Mews Pocket** (G2 4.4★ n=312) | Dashboard supervisor: top zone = ocupación donut 4-state + ingresos hoy + adaptive content per time-of-day | Adoptar estructura top zone |
| **Cloudbeds Mobile** (G2 4.5★ n=580) | Receptionist primer view = movimientos hoy (llegadas/salidas tabs) + tareas pendientes | Adoptar para rol RECEPTIONIST |
| **Airbnb Host** (App Store 4.8★) | Pull-to-refresh + last-sync timestamp + glanceable cards | Estándar mobile que vamos a adoptar |
| **Linear iOS** (Best Designed 2024 Apple WWDC) | Tipografía escala modular 12/13/15/17/22/28 + dark theme operations + bottom tabs minimal | Tipografía + temas |
| **Stripe Dashboard mobile** | Live indicator (verde pulse) + last sync 1 minuto + número grande + sparkline | Patrón "última sync" + sparkline |
| **Behance "PMS Hotel Mobile" colección top 10 votes** (sprint #84) | Bento asimétrico + iconos outlined + numeros tabular | Bento + tabular nums |
| **Vercel iOS** (HTR 2024 mention) | Adaptive empty states (no `—`, sino "Todo limpio" con illustration) | Empty states |
| **AHLEI Front Office Operations Manual 2023** | Hierarchy supervisor↔recepción↔HK no operations bleed entre roles | Role-awareness |

### 1.3 Gaps verificados en código backend (NO asumidos)

**Caso 1 — booking OTA same-day llega 10am sin escalación a HK:**
- `booking-new.handler.ts` solo crea `GuestStay` + notif al SUPERVISOR. NO toca `CleaningTask`.
- `morning-roster.scheduler.ts` cron 07:00 ya pasó cuando aterriza la booking 10am.
- **Resultado**: recamarista NO ve la urgencia hasta el siguiente cron del día siguiente.

**Caso 2 — moveRoom NO mueve CleaningTasks de room antigua:**
- `guest-stays.service.ts:1724-1810 moveRoom()` actualiza `Room.status` + `GuestStay.roomId` + emite `room.moved`.
- `pms-sse.listener.ts:47-58 OnEvent('room.moved')` SOLO re-emite SSE para UI calendar.
- **NO existe listener que mueva `CleaningTask.roomId` o haga el carryover task antigua → nueva.**
- **Resultado**: recamarista limpia la habitación equivocada si no se entera del move.

Ambos gaps son **bloqueantes operativos para el piloto** (Hotel Monica Tulum tiene 22 habitaciones, 1 recamarista turno mañana, alto turnover OTA durante temporada alta). Sin esto, escalan tickets de cliente.

---

## 2. Decisiones de scope (espera tu confirmación ✋)

### D-MOB-1: Walk-in tab eliminado
Owner 2026-06-08: *"no sé qué tanto valor agregado tenga mostrar walk-in ya que para mí es básicamente un checkin y ya"*.
**Implementación**: el botón "Walk-in" del Receptionist dashboard se reemplaza por **"+ Reservación"** que abre el flujo de check-in con `paymentModel='HOTEL_COLLECT'` pre-seleccionado y `checkInAt=now()`. Es el mismo flujo del Check-in dialog pero arranca sin booking previa. Cero código adicional.

### D-MOB-2: 3 dashboards, no 1 con feature flags
**SUPERVISOR**, **RECEPTIONIST**, **HOUSEKEEPER** ven 3 estructuras DIFERENTES (diferentes layouts, diferentes endpoints), no el mismo dashboard con condicionales. Pattern Salesforce App Builder. Reduce condicionales nested → mantenibilidad.

### D-MOB-3: Endpoints split por rol
- Existente: `GET /v1/dashboard/snapshot` (genérico)
- Nuevo: `GET /v1/dashboard/mobile/supervisor`
- Nuevo: `GET /v1/dashboard/mobile/receptionist`
- Existente reusar: `GET /v1/housekeeping/my-day` (HK ya tiene su flow propio)

Cada endpoint retorna SOLO la data que su rol consume. Reduce payload + esconde data sensible al rol equivocado (revenue stats no van al HK).

### D-MOB-4: Pull-to-refresh estándar
React Native `RefreshControl` en TODO mobile dashboard. Threshold 60pt. Spinner Apple HIG nativo.

### D-MOB-5: Adaptive por time-of-day (§43 D17)
Ya está en backend. Cablear al mobile.

### D-MOB-6: Donut 3-state (vacías es complemento implícito, no se grafica)

Owner 2026-06-08: *"no veo valor agregado en mostrar las habitaciones vacías dentro de la gráfica, qué sentido tendría?"* — argumento válido. Vacías no es accionable (no requiere atención del supervisor). Solo los 3 estados con acción asociada se grafican:

- 🟢 **Ocupadas** (verde = revenue captured, "todo bajo control")
- 🟡 **Llegadas hoy** (ámbar = en proceso, requiere atención eventual)
- 🔴 **Bloqueadas** (rojo = mtto/OOO, problema activo)

Vacías queda como **track gris claro del donut** (background no destacado) y como número aislado en el header: "**Disponibles 15/22**". Pattern Apple Fitness (rings progress) — el track sin progress = potencial, no estado.

Centro del donut: **`N° ocupadas / total`** en formato fracción.

### D-MOB-7: Empty states con illustration, no "—"
Sin tareas → ilustración inline + "Día limpio. Sin pendientes urgentes." (no "0" frío).
Sin movimientos → "Sin llegadas hoy."

### D-MOB-8: Quitar tipo de cambio del dashboard
Si no está configurado, NO se muestra en dashboard. Vive en /settings/fx solamente.

---

## 3. Plan secuencial — 11 días-dev

### Etapa 0 — Limpieza git (0.25d, hoy)
- [ ] Commit los 6 grupos coherentes sobre `feat/dashboard-plain-language`
- [ ] Push + PR + merge a main
- [ ] Borrar 4 branches stale (cancellation/billing/channex-cancel)
- [ ] Decidir destino de `sprint/checkin-alpha-plan` (cherry-pick docs / drop)

### Etapa A — Fix gap HK ↔ Channex (BLOQUEANTE operativo, 2-3d)

**§A1 — Caso 1**: nuevo listener `booking-same-day.listener.ts`
- `apps/api/src/scheduling/booking-same-day.listener.ts`
- `@OnEvent('channex.booking.same-day-arrival')` emitido al final de `BookingNewHandler.save()` cuando `stay.checkIn` cae HOY (timezone-aware con `Intl.DateTimeFormat`)
- Service method `escalateHkTaskForSameDayArrival(roomId, propertyId, stayId)`:
  - Pull `CleaningTask` PENDING/READY/UNASSIGNED para `unit.roomId == roomId` + `scheduledFor=startOfDayLocal()`
  - Si existe: `update({ priority: URGENT, hasSameDayCheckIn: true })` + `taskLog event=PRIORITY_UPGRADED reason='OTA booking same-day arrival'`
  - Si NO existe + room en checkout pending hoy (zombie/overstay) → crear task READY URGENT
  - Si NO existe + room ya limpia → no-op (la room está lista, sin task pendiente significa que ya pasó el ciclo)
  - Emit SSE `task:upgraded` per recamarista asignada
  - Trigger push notif via NotificationCenterService con priority=HIGH a recamarista asignada del shift actual
- Tests `booking-same-day.listener.spec.ts`: 4 escenarios
  - Same-day arrival → task PENDING existente upgradea a URGENT
  - Same-day arrival → task READY existente upgradea a URGENT + hasSameDayCheckIn
  - Same-day arrival → room limpia sin task = no-op
  - Mañana arrival (no es hoy) = no-op
- Edge case: si el booking es para HOY pero check-in time es 19:00 y son las 8AM → todavía urgente (es hoy)

**§A2 — Caso 2**: nuevo listener `room-moved.listener.ts`
- `apps/api/src/scheduling/room-moved.listener.ts`
- `@OnEvent('room.moved')` después del existente en pms-sse.listener.ts
- Service method `migrateHkTasksForRoomMove(fromRoomId, toRoomId, propertyId, stayId, actorId)`:
  - Pull `CleaningTask` PENDING/READY/UNASSIGNED de unidades en `fromRoomId` para `scheduledFor=startOfDayLocal()` Y vinculadas al stay que se mueve
  - Para cada task encontrada:
    - **Si status=IN_PROGRESS** → ConflictException (no permitir move durante limpieza activa, ya hay guard §54 D11 pero aquí debemos respetar)
    - Si PENDING/READY/UNASSIGNED:
      - Marcar task antigua `status='CANCELLED'` + `taskLog event=CANCELLED reason='room move to X'`
      - Crear task nueva en `toRoomId` con `priority` heredada + `carryoverFromTaskId` + `hasSameDayCheckIn` heredada
      - Emit SSE `task:moved` con `{ fromTaskId, toTaskId, fromRoomId, toRoomId }`
      - Push notif al staff asignado: "La habitación cambió de {fromRoom} a {toRoom}, tu próxima tarea es ahí"
- Audit: AuditLog `ROOM_MOVE_HK_MIGRATED` permanente (CLAUDE.md §165 D-NOVA-7)
- Tests `room-moved.listener.spec.ts`: 4 escenarios
  - Move antes de checkin → task migra fromRoom → toRoom
  - Move con task IN_PROGRESS → ConflictException (rechaza moveRoom)
  - Move sin task pendiente (room nueva sin checkout previo) → no-op
  - Move durante stay activo → migra tasks futuras del stay journey

**§A3 — Frontend Hub Recamarista**:
- Mobile `app/(app)/hub` reacciona a SSE `task:upgraded` y `task:moved`:
  - Toast emerald "Llegada urgente — Hab X" + haptic notification
  - Refetch automático de "Mi día"
  - Card de la task animada al re-ordenar (slide-in pattern Apple Mail)
- Tests jest-expo: 3 escenarios (upgrade UI + move UI + offline queue)

**§A4 — Documentación CLAUDE.md**:
- Nuevas decisiones `§D-HK-CHX1` (caso 1) + `§D-HK-CHX2` (caso 2)
- Sección "Flujo Operativo Central" actualizada con nuevos eventos

### Etapa B — Mobile dashboard role-aware (5-7d)

**§B1 — Backend role-split endpoints** (1d)
- `GET /v1/dashboard/mobile/supervisor` — top zone ocupación 4-state + ingresos hoy + adaptive HOY
- `GET /v1/dashboard/mobile/receptionist` — movimientos hoy + cobros pendientes + tareas críticas
- Cada uno cache 30s server-side per (propertyId, actorId)
- Tests unit por endpoint

**§B2 — Frontend SupervisorDashboard.tsx** (2d)
- `apps/mobile/app/(app)/dashboard/supervisor.tsx`
- Layout vertical scrollable + pull-to-refresh:
  1. Hero greeting + role chip + time-of-day chip
  2. Ocupación donut 4-state + last sync timestamp
  3. Ingresos hoy big number + sparkline 7d
  4. "Atender ahora" sección adaptive (top 3 tareas críticas)
  5. "Tu jornada" próximas 4h
  6. Quick actions (Calendario, Buscar reserva)
- Componentes nuevos: `OccupancyDonut4State`, `BigNumberCard`, `AdaptiveAttentionList`
- Tipografía escala unificada (Apple HIG iOS: SF Pro)
- Empty states con illustration componente reusable `<EmptyState />`

**§B3 — Frontend ReceptionistDashboard.tsx** (1.5d)
- `apps/mobile/app/(app)/dashboard/receptionist.tsx`
- Layout:
  1. Hero greeting
  2. Movimientos hoy con tabs Llegadas/Salidas (sin walk-in tab per D-MOB-1)
  3. Cobros pendientes (lista de top 5 con monto + guest)
  4. Habitaciones bloqueadas (cards con CTA "ver ticket")
  5. Quick actions (Calendario, Buscar reserva, + Reservación)

**§B4 — Router de rol** (0.5d)
- `apps/mobile/app/(app)/dashboard/index.tsx` lee actor.role del store + redirige a /supervisor /receptionist /housekeeping
- Si rol no reconocido → fallback supervisor view

**§B5 — Tests mobile** (1d)
- jest-expo: 1 test snapshot por rol + 3 tests interaction (pull-to-refresh + tap card + navigation)

**§B6 — Documentación + sales master** (0.5d)
- CLAUDE.md decisiones `§D-MOB-1..8`
- `docs/zenix-sales-master.md` Módulo Mobile actualizado con diferenciador role-aware

### Etapa C — QA + polish (1.5d)

**§C1 — Pixel-perfect audit** (0.5d)
- Verificar en simulador iOS + Android con preview tool
- Tipografía consistency cross-screen
- Empty states ✓

**§C2 — Performance** (0.5d)
- Bundle size mobile + first paint <2s
- Refetch intervals (30s polling vs SSE para mobile fg only)

**§C3 — Documentación final + merge** (0.5d)
- CHANGELOG entry
- Screenshots before/after
- Tag release `mobile-dashboard-v1`

---

## 4. Métricas de éxito (validables post-merge)

| Métrica | Antes (audit 2026-06-08) | Después (target) |
|---------|--------------------------|------------------|
| Inconsistencias datos visibles | 3 (donut, en-casa, tareas-activas) | 0 |
| Tiempo a "qué hay urgente" supervisor | ~8s (scroll + interpret) | <3s (top zone glance) |
| Tiempo a "próxima llegada" recepcionista | ~6s (scroll a movimientos) | <2s (top zone) |
| Roles con UI optimizada | 0 de 3 | 3 de 3 |
| Empty states con illustration | 0 | 100% |
| Pull-to-refresh disponible | No | Sí cross-screen |
| Bug HK: room move sin migrar task | 100% reproducible | 0 (test passing) |
| Bug HK: same-day OTA sin escalar | 100% reproducible | 0 (test passing) |

---

## 5. Riesgos identificados

| Riesgo | Mitigación |
|--------|-----------|
| Migración Hub Recamarista vivo durante piloto | Etapa A NO toca Hub UI — solo agrega listeners backend + nuevos eventos SSE que el Hub ya escucha. Backward-compat 100%. |
| Push notifs spam si OTA arriva multi-room | Throttle por rol + dedup por roomId+timestamp en NotificationCenterService (ya implementado §99-§101) |
| Mobile dashboard cambia layout drásticamente para usuarios actuales del piloto | Etapa B se entrega con feature flag `MOBILE_DASHBOARD_V2` per Organization. Owner Hotel Monica Tulum activa cuando esté listo. |
| Performance mobile con 22 rooms + 3 dashboards | Endpoints cache 30s server + React Query staleTime 60s mobile. Probado con seed 10k stays en sprint PERF-1 §9. |

---

## 6. Diferenciadores comerciales nuevos

Post-merge se agregan a `docs/zenix-sales-master.md`:

1. **3 mobile dashboards role-specific** (no genérico) — vs Cloudbeds/Mews que tienen 1 dashboard genérico con feature gates
2. **Real-time HK task escalation** cuando OTA aterriza same-day — vs Mews/Opera que dependen del night audit / morning roster con ventana de 24h
3. **Auto-migration de HK tasks** en room move — único en LATAM (Cloudbeds tiene staff move pero NO automigra task)

---

## 7. Decisiones esperando confirmación owner

1. ✋ Autorizar Etapa 0 (commits + PR + merge + cleanup branches)
2. ✋ Confirmar D-MOB-1 (walk-in eliminado, reemplazado por "+ Reservación" del check-in flow)
3. ✋ Confirmar D-MOB-3 (split endpoints por rol vs 1 endpoint genérico con role filter)
4. ✋ Confirmar prioridad Etapa A antes que Etapa B (gap operativo vs nice-to-have visual)
5. ✋ Aprobar el doc `MOBILE-DASHBOARD-plan.md`

---

## 8. Estimación total ajustada

| Etapa | Días-dev | Calendar 1 dev |
|-------|----------|----------------|
| 0 — Cleanup git | 0.25 | 0.25d |
| A — Fix gap HK ↔ Channex (Casos 1+2) | 2-3 | 3-4d |
| B — Mobile dashboard role-aware | 5-7 | 6-8d |
| C — QA + polish + tag | 1.5 | 2d |
| **Total** | **8.75-11.75** | **~11-14 días calendar** |

Si paralelizo Etapa A backend con B1 backend → ~9 días calendar.
