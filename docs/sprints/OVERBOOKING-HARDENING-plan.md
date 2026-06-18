# OVERBOOKING-HARDENING — cerrar todos los huecos de overbooking

> **Fecha:** 2026-06-17 · **Estado:** EN EJECUCIÓN · **Rama:** `fix/overbooking-hardening` · **Origen:** auditoría anti-overbooking sistémica (todos los puntos de escritura de inventario). Un hueco crítico secuencial (`lateCheckout`) fue **confirmado con E2E** (la noche siguiente se vendía dos veces). Varios métodos validan disponibilidad pero sin lock transaccional (race check→write).

## Épica
**Como** hotel, **quiero** que NINGÚN punto de escritura de inventario pueda producir overbooking (ni secuencial ni por concurrencia), **para** no vender la misma noche/habitación dos veces.

## Patrón canónico (ya probado en `create`/`editReservationDates`)
Toda escritura que ocupe/extienda inventario:
1. abre `$transaction`,
2. toma `pg_advisory_xact_lock(hashtext('walk-in:'+roomId)::bigint)` — **misma key** en TODOS los flujos para que serialicen entre sí,
3. re-valida disponibilidad con self-exclusión DENTRO del lock,
4. recién entonces escribe.

Helper compartido: `GuestStaysService.lockAndAssertAvailable(tx, roomId, from, to, {excludeStayId, excludeJourneyId})`.

## Estado inicial (auditado)
| Método | Valida | Lock+recheck | Veredicto |
|---|:--:|:--:|---|
| create, editReservationDates | ✅ | ✅ | seguro |
| **lateCheckout** | ❌ | ❌ | 🔴 crítico (E2E confirmado) |
| **swapStayRooms** | ❌ | ❌ | 🔴 alto |
| moveRoom, restoreStay | ✅ | ❌ | 🟠 race |
| extendSameRoom/extendNewRoom/executeMidStayRoomMove/splitReservation/initJourneyAndExtend (via assertRoomAvailable) | ✅ | ❌ | 🟠 race |
| Channex booking-new / booking-modify | ✅ | ❌ | 🟠 race staff↔OTA (lock no compartido) |
| revertNoShow | ⚠️ guard manual | ❌ | 🟡 mitigado |
| cancel*/markAsNoShow/bulkCheckin/confirmMove | n/a | — | no toman inventario |

## Sprints
- **S1 — Graves (no validan):** lateCheckout (validar noches extendidas + lock), swapStayRooms (validar ambas habitaciones destino + lock dual).
- **S2 — Race (validan sin lock):** moveRoom, restoreStay, assertRoomAvailable (cubre los 5 de journeys), revertNoShow (lock al guard).
- **S3 — Channex inbound:** booking-new / booking-modify usan la misma key de lock que recepción.
- **S4 — Tests + E2E de regresión + cierre.**

## Definition of Done
- Cada método listado escribe inventario sólo tras lock+recheck (o validación, en los que no validaban).
- Tests unit por método + E2E de regresión del overbooking de lateCheckout (debe ahora dar 409).
- typecheck api verde; suite guest-stays+availability+stay-journeys+channex verde.
- Sin merge hasta autorización del owner.

## Cierre (2026-06-17) — EJECUTADO en rama `fix/overbooking-hardening`
- **Infra:** helper `GuestStaysService.lockAndAssertAvailable(tx, checks[])` (lock multi-habitación ordenado + re-check per-rango) + `AvailabilityCheckDto.excludeJourneyIds` (array, para swap).
- **S1 graves:** `lateCheckout` (valida el rango extendido + lock; antes NO validaba — overbooking confirmado e2e) · `swapStayRooms` (valida ambas habitaciones destino + lock dual, excluyendo A y B).
- **S2 race:** `moveRoom`, `restoreStay`, `revertNoShow` → check movido dentro de la tx con lock. `assertRoomAvailable` (stay-journeys) acepta `tx` y toma el lock; sus callers (`extendSameRoom`/`extendNewRoom`/`executeMidStayRoomMove`/`initJourneyAndExtend`/`moveExtensionRoom`) llaman el check DENTRO de su tx; `splitReservation` toma lock por habitación dentro de la tx.
- **S3 Channex inbound:** `booking-new` (single + multi-room) y `booking-modify` re-validan bajo el MISMO lock `walk-in:<roomId>` que recepción dentro de su tx; si pierden la carrera contra un walk-in, persisten como **conflicto** (no overbooking).
- **Verificación:** typecheck api verde · suite guest-stays+stay-journeys+availability+channex **339/339** (incl. nuevo test de regresión `lateCheckout` ConflictException) · **E2E real:** A(mar1-3)+B(mar3-5) back-to-back, `lateCheckout(A→mar4)` → **409** "se solapa con la reserva de Reg Bbb"; `lateCheckout(A→mar3 16:00)` (mismo día) → éxito.
- **Pendiente:** PR + merge tras autorización del owner. Decisiones D-OB-1..4 a §-numerar en consolidación.
