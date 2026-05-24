---
Audiencia: Owner + agentes IA futuros
Tipo: Roadmap post-certificación
Status: Decisiones aprobadas — backlog para v1.0.1/v1.0.2
Padre: docs/sprints/CHANNEX-INBOUND-plan.md
Última actualización: 2026-05-22 PM
---

# Channex inbound — mejoras post-certificación

> Capturadas durante Day 7 tras debate sobre latencia y overbooking
> prevention. Estas mejoras NO bloquean la certificación Stage 4 (el flujo
> base con webhook + outbox + feed reconciliation cumple los requisitos
> oficiales) pero llevan a Zenix de "cumple cert" a "best-in-class LATAM".

---

## 1. Trigger directo post-webhook (✅ implementado en Day 7)

**Antes:** webhook → outbox `PENDING` → ChannexOutboxScheduler cada 30s pickea
→ puller → handler → ack. Latencia P95 ~20-30s.

**Ahora:** mismo flujo + `setImmediate(() => puller.processOutboxRow(outboxId))`
dispara inmediato post-200. Latencia P95 ~2-3s. Outbox sigue como safety net:
si el setImmediate crashea, el cron pickea en la próxima vuelta (sin race —
status PENDING preserva el lock).

**Por qué `setImmediate` y no async dentro del handler:** queremos que el
HTTP response a Channex se envíe FIRST (< 100ms) para que Channex marque su
delivery exitoso y libere su queue. El procesamiento es post-response.

---

## 2. Outbound push síncrono para "last room" (planeado v1.0.1)

**Problema documentado** (Caso C race): walk-in y OTA reservan el último
cuarto en la misma ventana de 1-3 segundos. Outbound push (`pushAbsoluteAvailability`)
es actualmente fire-and-forget — Channex puede no haber procesado el cambio
cuando llega el booking del OTA.

**Mitigación propuesta v1.0.1:**

- Detectar "last room" → cuando `AvailabilityService.check()` confirma libre
  pero `remainingInRoomType === 1` post-reserva.
- En ese caso, `pushAbsoluteAvailability` se hace **síncrono ANTES** de
  devolver 201 al recepcionista.
- Si Channex falla, **abortar la creación local** y devolver 503 al cliente
  con mensaje "El sistema de canales no respondió. Re-intenta en unos
  segundos." Esto cumple §31 (best-effort) excepto cuando el riesgo es
  alto (último cuarto = overbooking irreversible).

**Trade-off documentado:** +500ms de latencia en el `POST /guest-stays`
para hoteles con poco inventario. Para hoteles con >5 habitaciones libres
del tipo, el path async normal sigue. Decisión de UX: el +500ms vale para
prevenir overbooking en temporada alta.

**Decisión pendiente:** umbral para "last room" — ¿siempre cuando es el
último del room_type, o cuando es uno de los últimos N (configurable)?

---

## 3. Postgres advisory locks o SELECT FOR UPDATE (planeado v1.0.5)

**Problema:** AvailabilityService.check + create no es estrictamente
serializable bajo `Read Committed`. Dos clientes PMS chequeando
simultáneamente la misma habitación pueden ambos pasar el check antes de
que uno commit.

**Mitigación v1.0.5:**

- `pg_advisory_xact_lock(hash(roomId))` al inicio de la transacción de
  create.
- O `SELECT FOR UPDATE` sobre `Room` row en el check.
- Ambos garantizan serialización per-room sin convertir toda la DB a
  serializable isolation (que mata performance multi-tenant).

**Por qué v1.0.5 y no antes:** requiere refactor de `AvailabilityService.check`
+ `GuestStaysService.create` para pasar la `tx` explícitamente. Riesgo de
regresión alto. Justifica un sprint dedicado con cobertura de tests
exhaustiva (chaos tests con clientes concurrentes).

---

## 4. Outbound retry queue (planeado v1.0.1)

**Problema:** `pushInventory` / `pushAbsoluteAvailability` fail-soft significa
que un 5xx de Channex pierde el push permanentemente. El feed inbound
detecta drift al recibir bookings que asumimos imposibles — tarde.

**Mitigación v1.0.1:**

- Tabla `ChannexOutboundQueue { id, propertyId, payload, attempts,
  nextAttemptAt, lastError, status }`.
- Cuando `pushInventory` falla → encola row + cron retry exp backoff.
- Status SUCCEEDED / DEAD_LETTER terminales.
- Idéntico patrón al inbound `ChannexOutbox` — código reutilizable.

---

## 5. Health monitor + alertas (planeado v1.0.1)

**Métricas a exponer en `/health/channex`:**

- Outbox: count by status (alertar si DEAD_LETTER > 0)
- Feed scheduler: minutes since last successful run
- Webhook deliveries last hour
- Average handler latency P50/P95/P99
- Outbound queue depth

**Alerta SUPERVISOR vía AppNotif** cuando:
- DEAD_LETTER count > 0 (intervención humana requerida)
- Feed scheduler last run > 60 min (cron muerto)
- Outbound queue depth > 10 (Channex caído o creds rotas)

---

## 6. Smart Suggestions v2 — multi-property + Bed-level (planeado v1.0.5+)

**v1.0.0 (actual Day 7):** ranking simple por similitud Room-level (category,
capacity, floor, roomType, channexRoomTypeId, status).

**v1.0.5+:**
- Bed-level matching para hostales: en SHARED rooms con N units, considerar
  qué bed específica (top bunk vs bottom) tiene similitud con la original.
- Multi-property scope: si la property destino está sold out, sugerir
  habitación en una property hermana del mismo Brand (§63).
- Aprendizaje histórico: pesos del scoring se ajustan según qué sugerencias
  el SUPERVISOR aceptó vs rechazó.

---

## 7. WebSocket bidireccional con Channex (especulativo v1.1+)

**Estado actual:** webhook = HTTP POST unidirectional + nuestro polling
periódico al feed.

**Hipótesis:** si Channex expone una conexión WebSocket persistente
(no documentado actualmente — verificar con su equipo en discovery call
post-cert), podríamos:
- Eliminar el polling feed scheduler completo (recovery vía connection
  re-establish).
- Latencia inbound → ~50ms.
- Outbound push también via WS → no más HTTP retry queue.

**Acción para Stage 4 live screenshare:** preguntar a Channex si tienen
WS roadmap. Si sí, agendar v1.1 sprint.

---

## Resumen de impacto

| Mejora | Sprint | Latencia | Overbooking risk | Complejidad |
|---|---|---|---|---|
| 1. Trigger directo | v1.0.0 ✅ | 30s → 3s | sin cambio | baja |
| 2. Last-room sync push | v1.0.1 | +500ms en edge case | reduce ~95% en último cuarto | media |
| 3. Postgres advisory lock | v1.0.5 | sin cambio | reduce ~99% race local PMS | alta |
| 4. Outbound retry queue | v1.0.1 | sin cambio | elimina silent drift outbound | baja |
| 5. Health monitor + alertas | v1.0.1 | sin cambio | descubrimiento proactivo | media |
| 6. Smart Suggestions v2 | v1.0.5+ | sin cambio | UX, no risk | media |
| 7. WS bidireccional | v1.1+ | 3s → 50ms | sin cambio | depende Channex |

---

## Notas para el owner / próximo agente IA

- Mejoras 1, 4, 5 son las más críticas para "production-ready" — bajan el
  riesgo a niveles equivalentes a Mews/Cloudbeds enterprise.
- Mejora 2 es la respuesta directa al escenario de overbooking en temporada
  alta que el owner identificó como preocupación principal (2026-05-22).
- Mejora 3 es la "defensa en profundidad" — combinada con #2 hace el
  overbooking interno casi imposible. Combinada con #7 elimina la race
  irreductible documentada en §"Caso C" del análisis original.
- Smart Suggestions v1 (Day 7) es el primer paso del aprendizaje ML — los
  datos de aceptación/rechazo del supervisor se persisten en
  `GuestStayLog.metadata` y pueden alimentar un modelo v1.0.5+.
