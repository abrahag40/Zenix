# RESERVATION-EDIT-PRECHECKIN — Editar el rango de fechas de una reserva pre-check-in

> **Fecha:** 2026-06-15 · **Estado:** PROPUESTA (pendiente arranque + confirmación de decisiones owner) · **Metodología:** SCRUM (épica → sprints → historias de usuario con criterios de aceptación → tareas). · **Rama sugerida:** `feat/reservation-edit-precheckin`.
>
> **Origen:** gap detectado en sesión 2026-06-15 al responder al owner *"si el huésped se pone en contacto para modificar las fechas, ¿es posible?"*. Investigación de código confirmó (Explore agent, archivos:línea abajo): el sistema edita reservas SOLO por acciones estructuradas (extender salida, mover habitación, acortar/early-checkout, partir, cancelar extensión) y **NO permite cambiar la fecha de LLEGADA ni mover libremente el rango de una reserva futura que aún no hizo check-in**. Hoy ese caso se resuelve cancelando + recreando (fricción + pérdida de trazabilidad).

---

## 1. Épica

**Como** recepcionista, **quiero** editar las fechas (llegada y/o salida) de una reserva que **aún no ha hecho check-in**, **para** atender al huésped que pide reprogramar su estadía sin tener que cancelarla y volver a crearla.

**Valor:** elimina el workaround "cancelar + recrear" (rompe `bookingRef`, audit, vínculo OTA, pricing) en el caso más común de atención al huésped. Paridad con Cloudbeds/Mews (editar fechas de una reserva no llegada es estándar de industria).

## 2. Estado actual verificado (de dónde partimos)

- **Modelo:** `GuestStay.checkinAt` + `scheduledCheckout` ([schema.prisma:1703-1704](../../apps/api/prisma/schema.prisma)); una reserva pre-check-in = `GuestStay` (`actualCheckin = null`) + `StayJourney` + un único `StaySegment` con `reason='ORIGINAL'`.
- **Acciones de edición existentes (NO cubren el gap):** `extend-same-room`/`extend-new-room` (solo extiende `scheduledCheckout`), `room-move` (mismo rango, otra hab.), `early-checkout` (acorta, requiere `actualCheckin != null`), `split`, `cancel-segment`. Todas en `stay-journeys.service.ts` / `guest-stays.service.ts`.
- **NO existe** endpoint que cambie `checkinAt` (llegada) de una reserva no llegada, ni que reasigne libremente `[checkinAt, scheduledCheckout)`. Confirmado: solo hay ajuste de `scheduledCheckout` vía late-checkout ([guest-stays.controller.ts:439](../../apps/api/src/pms/guest-stays/guest-stays.controller.ts)).
- **Disponibilidad:** todo cambio de fechas/hab. debe pasar por `AvailabilityService.check`/`assertRoomAvailable` (§35), excluyéndose a sí misma (self-exclusion).
- **Pricing:** modelo aditivo (§28) — recalcular noches × tarifa al cambiar el rango; el saldo se ajusta, no se reescribe destructivamente.
- **Channex:** cambiar fechas de una reserva con `channexBookingId` debería empujar la modificación a la OTA, pero **`CHANNEX_BOOKING_MODIFY_REQUESTED` NO está construido** (§157 / D-GRP-C6 lo dejó pendiente) → ver decisión D-REP-1.

## 3. Out of scope (explícito)

- Editar fechas de una reserva **ya con check-in** (eso ya lo cubren extend / early-checkout / room-move).
- Cambiar habitación como parte de esta edición **salvo** que el nuevo rango entre en conflicto en la habitación actual (ahí se ofrece alternativa, patrón `ExtendConfirmDialog`).
- Editar reservas de grupo a nivel masivo (un miembro a la vez en v1; bulk como mejora futura).
- Construir `CHANNEX_BOOKING_MODIFY` real (sprint Channex aparte; aquí solo se decide la política interina — D-REP-1).

## 4. Decisiones a confirmar con owner ANTES de codear (no asumir)

- **D-REP-1 — Reserva OTA (`channexBookingId != null`):** dado que el push MODIFY a Channex no existe, ¿(a) permitir editar local + **avisar** "ajusta también en el extranet de la OTA" (patrón §152 Airbnb), o (b) bloquear la edición de fechas en reservas OTA hasta tener Channex MODIFY? **Recomendación: (a)** con aviso ámbar explícito + notif al supervisor (entrega valor para reservas directas y OTA, sin prometer lo que no se cumple).
- **D-REP-2 — ¿Mover la llegada al pasado?** Un huésped que adelanta su llegada a "hoy" es válido; ¿permitir `checkinAt` < ahora (mismo día) o exigir `checkinAt >= startOfDay(hoy)`? **Recomendación:** permitir `>= startOfDay(hoy)` (no fechas pasadas reales).
- **D-REP-3 — ¿La edición incluye cambio de habitación opcional?** **Recomendación:** solo si el nuevo rango no cabe en la habitación actual → ofrecer alternativa (no como feature primaria).
- **D-REP-4 — Política de tarifa al cambiar fechas:** ¿recalcular al `RatePlan`/BAR vigente del nuevo rango, o conservar la tarifa pactada (`ratePerNight` del segmento)? **Recomendación:** conservar `ratePerNight` pactado y solo recalcular noches × esa tarifa (evita sorpresas; el cambio de tarifa es decisión aparte). Documentar.

## 5. Definition of Done (épica)

- Endpoint backend que edita `[checkinAt, scheduledCheckout)` de una reserva pre-check-in, transaccional, con guards + validación de disponibilidad (self-exclusion) + recálculo de noches/saldo + audit append-only.
- UI en `BookingDetailSheet`: acción "Editar fechas" → diálogo con date-pickers + preview de disponibilidad + diff de noches/saldo + confirmación (Radix Dialog §116, `DialogActions` §123).
- Reserva OTA: comportamiento de D-REP-1 implementado (aviso + notif).
- Tests unit (guards + cálculo) + verificación e2e en navegador (caso directo + caso conflicto→alternativa + caso OTA).
- typecheck api+web verde; sin merge hasta autorización del owner.
- Decisiones D-REP-1..4 §-numeradas al cerrar.

---

## 6. Sprints

### Sprint 1 — Backend: editar rango (núcleo)
**Meta:** un endpoint transaccional que cambie las fechas de una reserva pre-check-in con todos los guards.

- **HU-1.1** — Como sistema, valido que la reserva sea editable.
  - *Criterios:* `actualCheckin == null` (pre-check-in) · no `cancelledAt` · no `noShowAt` · journey con un único segmento ACTIVE `ORIGINAL` (si tiene extensiones, fuera de scope v1 → error claro). Error machine-readable (`NOT_PRECHECKIN`, `HAS_EXTENSIONS`).
  - *Tareas:* DTO `EditReservationDatesDto { checkInAt, scheduledCheckout, newRoomId? }` (class-validator, ISO, `checkOut > checkIn`); guards en `stay-journeys.service.editReservationDates` (o `guest-stays`); endpoint `POST /v1/stay-journeys/:id/edit-dates` (RECEPTIONIST/SUPERVISOR).
- **HU-1.2** — Como sistema, valido disponibilidad del nuevo rango excluyéndome a mí misma.
  - *Criterios:* `AvailabilityService.check(roomId, newCheckIn, newCheckOut, excludeStayId)` en la hab. actual; si conflicto y `newRoomId` provisto, validar la alternativa; si conflicto sin alternativa → `RANGE_UNAVAILABLE` + (opcional) lista de habitaciones libres del mismo tipo.
  - *Tareas:* confirmar/extender la self-exclusion en AvailabilityService; half-open `[checkIn, checkOut)`.
- **HU-1.3** — Como sistema, aplico el cambio atómicamente y recalculo.
  - *Criterios:* en `$transaction`: actualizar `GuestStay.checkinAt/scheduledCheckout`, el `StaySegment` ORIGINAL (`checkIn/checkOut`, y `roomId` si cambió), `StayJourney.journeyCheckIn/Out`; recalcular `nights` + `totalAmount = ratePerNight × nights` (D-REP-4, aditivo §28, sin tocar `amountPaid`); `GuestStayLog` append-only `event='DATES_EDITED'` con old/new (audit §11). Emitir `availability.changed` (Channex push) + SSE refresco calendario (§124).
  - *Tareas:* servicio + audit + evento; bridge housekeeping si aplica (normalmente N/A pre-check-in).
- **HU-1.4** — Tests unit del servicio (guards happy/edge + recálculo de noches/saldo + self-exclusion).

### Sprint 2 — Política OTA + alternativa de habitación
**Meta:** comportamiento correcto para reservas OTA y para conflicto de rango.

- **HU-2.1** — Reserva OTA editada → D-REP-1.
  - *Criterios:* si `channexBookingId != null`: aplicar local + `ChannexNotifService.raiseManualOtaAdjust` (notif SUPERVISOR "ajusta las fechas en {OTA} manualmente") + flag en respuesta para que la UI muestre aviso ámbar. NO intentar push MODIFY (no existe). Documentar dependencia del sprint Channex MODIFY (§157).
  - *Tareas:* rama OTA en el servicio + notif + (si se decide) `requiresOtaManualAdjust` en el log/metadata.
- **HU-2.2** — Conflicto de rango → ofrecer alternativa.
  - *Criterios:* si el nuevo rango no cabe en la hab. actual, la respuesta del preview lista habitaciones libres del mismo `RoomType` para el nuevo rango (patrón `ExtendConfirmDialog` conflicto).
  - *Tareas:* endpoint preview `GET /v1/stay-journeys/:id/edit-dates-preview?checkInAt&scheduledCheckout` → `{ available, conflicts, alternatives[], nightsDelta, balanceDelta }`.

### Sprint 3 — Frontend (BookingDetailSheet)
**Meta:** UI consistente para editar fechas.

- **HU-3.1** — Acción "Editar fechas" en `BookingDetailSheet` visible **solo** cuando la reserva es pre-check-in (gated por `actualCheckin == null` + no cancelada/no-show).
- **HU-3.2** — `EditReservationDatesDialog` (Radix Dialog §116, `useModalDismiss`, `DialogActions` §123 tone primary): date-pickers llegada/salida + preview en vivo (disponibilidad, noches, diff de saldo) consumiendo el endpoint preview; si conflicto → selector de habitación alternativa; si OTA → aviso ámbar (D-REP-1).
  - *Criterios:* botón confirmar deshabilitado si rango inválido o no disponible; `isDirty` vs snapshot inicial (§118); feedback informativo (§39) en cada error code.
- **HU-3.3** — Hooks `useEditReservationDates` + `useEditDatesPreview` (React Query, invalidación del calendario + sheet al confirmar).

### Sprint 4 — QA + cierre
- **HU-4.1** — Verificación e2e en navegador con datos reales: (a) reserva directa, cambio de rango sin conflicto; (b) cambio con conflicto → elige alternativa; (c) reserva OTA → aviso + notif; (d) intento sobre reserva ya con check-in → acción oculta/bloqueada.
- **HU-4.2** — typecheck api+web + suite verde; §-numerar D-REP-1..4 en CLAUDE.md; bitácora; PR (sin merge hasta autorización).

## 7. Estimación

~5-8 días-dev (1 dev): Sprint 1 ~2-3d · Sprint 2 ~1-2d · Sprint 3 ~1.5-2d · Sprint 4 ~0.5-1d. Riesgo bajo (reusa AvailabilityService + patrones de diálogos existentes); el único acoplamiento externo (Channex MODIFY) se evita con la política interina D-REP-1.

## 8. Dependencias / notas
- **Channex MODIFY** (push de modificación a OTA) es un sprint aparte (§157); este plan NO lo construye, solo decide la política interina (D-REP-1).
- Reutiliza: `AvailabilityService` (§35), patrón diálogos (`ExtendConfirmDialog`/`DialogActions`/`useModalDismiss`), `GuestStayLog` (audit §11), evento `availability.changed` + SSE (§124).

## 9. Bitácora
- **2026-06-15** — Plan creado al cerrar la sesión de reportería. Gap confirmado en código. Decisiones D-REP-1..4 propuestas (pendiente confirmación owner al arrancar).
