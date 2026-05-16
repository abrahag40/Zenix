---
Audiencia: Equipo de desarrollo Zenix · Product owner
Estado: Plan propuesto — pendiente de aprobación
Branch: feature/channex-inbound
Última actualización: 2026-05-16
Sprint anterior: Bug-fixes UI + same-day turnover (PR #28, #29, #30)
Disparador: sin Channex inbound el PMS hace MENOS que un PMS comercial — fricción crítica antes de release v1.0.0
---

# Sprint CHANNEX-INBOUND — Webhooks bidireccionales contra Channex.io

> **Misión del sprint**: cerrar el loop de sincronización con OTAs aceptando webhooks de Channex (`booking_new`, `booking_modify`, `booking_cancel`) y materializándolos como `GuestStay` con audit trail completo. Sin esto, una reserva creada en Booking.com vive solo en el extranet del OTA hasta que un recepcionista la transcriba manualmente — overbooking garantizado.

---

## 1. Contexto y motivación

### El gap actual (post-Sprint 8C)

| Dirección | Estado | Resultado operativo |
|---|---|---|
| **Outbound** (Zenix → Channex) | `notifyReservation` / `notifyRelease` fire-and-forget desde `AvailabilityService` (§31). Stub en piloto. | Una reserva creada en Zenix bloquea inventario en OTAs (cuando el push real esté activo). |
| **Inbound** (Channex → Zenix) | **No implementado.** Solo el comentario `// Consumidos en /api/webhooks/channex (ver Sprint 8)` en [channex.gateway.ts:20-21](../../apps/api/src/integrations/channex/channex.gateway.ts#L20). | Una reserva creada en Booking.com NO existe en Zenix. Doble-booking inevitable. |

### Por qué es no-negociable para v1.0.0

Cita del usuario (2026-05-15):
> "No podemos dejar el tema de Channex en la v1.0.1 porque sin sincronización con las OTA tenemos un PMS que hace MENOS que un PMS de un hotel."

Inbound es **más crítico que outbound**:
- Outbound failure → OTA acepta venta de habitación bloqueada → resolvible con CSR + relocation (caso recuperable, costo financiero limitado).
- Inbound failure → reserva OTA invisible para recepción → guest llega y no hay habitación / cama doblemente vendida → reseña pública 1★ + chargeback + costo reputacional permanente.

Visa Core Rules §5.9.2 sobre chargebacks de hospitalidad cita "merchant failure to honor confirmed reservation" como categoría de **no-defendible** sin evidencia de check-in attempt.

### Por qué Channex y no integración directa con cada OTA

- Cobertura: 130+ OTAs en un solo contrato (Booking, Expedia, Airbnb, Hostelworld, Agoda, Hotelbeds, etc.).
- Costos: ~$5-15 USD/mes/property vs $200+/OTA en contratos directos.
- Mantenimiento: cambios de protocolo (ej. Booking.com OAuth2 2024) los absorbe Channex.
- Aislamiento: 1 sola integración a mantener → 1 sola superficie de auth, retry, idempotencia.

---

## 2. Investigación de mercado — cómo lo hacen los competidores

### 2.1 Tres tiers de integración inbound

| Tier | Implementación | Latencia OTA → PMS | Riesgo overbooking |
|---|---|---|---|
| **Webhook real-time** | Channex push → endpoint del PMS → DB en <2s | <5s | Mínimo. Solo race entre webhook simultáneos. |
| **Polling cada N min** | PMS hace `GET /bookings?since=X` cada 5-15min | 5-15min | Medio. Una venta OTA en el intervalo es invisible. |
| **Manual import** | El recepcionista descarga CSV diario del OTA | 24h | Alto. Inviable para hotel con OTA share >20%. |

### 2.2 Benchmark de PMS comerciales

| PMS | Inbound impl | Idempotencia | Conflict resolution | Notas |
|---|---|---|---|---|
| **Cloudbeds** | Webhook + retry exponencial | `ota_reservation_id` UNIQUE | Last-write-wins, log de conflictos | Estándar de mercado. |
| **Mews** | Channel Manager API custom + webhooks | UUID interno por reserva | Manual review queue para conflicts | Enterprise-grade. |
| **Opera Cloud** | OPI (Oracle Hospitality Property Interface) + ORS push | Confirmation number único | Block manual con audit trail | Pesado, requiere middleware. |
| **RoomRaccoon** | Webhooks Channex/SiteMinder | Reservation ID externo | Auto-merge si match en email+dates | Pattern simple. |
| **Little Hotelier** | Webhook + pull diario reconciliación | OTA ID + booking ref | Sobreescribe si diff | Riesgo de data loss documentado. |

### 2.3 La decisión defendible para Zenix

**Inbound webhook real-time + idempotency strict + conflict log append-only** — alineado con §28 (PaymentLog append-only) y §11 (no-show inmutable).

---

## 3. Decisiones no-negociables (candidatas a sumar a CLAUDE.md §)

### D-CHX1: Webhook real-time, no polling

Endpoint `POST /api/webhooks/channex` recibe payloads. Polling solo como **fallback de reconciliación nocturna** (no como mecanismo principal). Latencia objetivo: P95 < 3s desde Channex emit hasta `GuestStay` materializado.

### D-CHX2: Idempotencia estricta por `channexBookingId` UNIQUE

Cada reserva OTA tiene `channexBookingId: String @unique` en `GuestStay`. El webhook handler hace `upsert` por este key — replays no duplican. Sin esto, un Channex retry crea reservas fantasma.

### D-CHX3: HMAC verification obligatoria

Channex firma cada webhook con HMAC-SHA256 sobre el body usando `webhook_secret` per-property. Rechazar 401 si firma inválida. Sin esto, un atacante puede inyectar reservas falsas. Secret rotation cada 90 días vía Zenix Activate.

### D-CHX4: Webhook log append-only (fiscal-grade)

Tabla `ChannexWebhookLog { id, propertyId, eventType, payload Json, signatureValid, processedAt, result, errorMessage }`. Inmutable. Cubre §11 (no-show legal trace), §38 (auditabilidad de operaciones), y disputa de chargeback Visa §5.9.2.

### D-CHX5: Conflict resolution — overlap rechaza, no sobreescribe

Si Channex envía `booking_new` que se solapa con una `GuestStay` existente (no-OTA o de otro OTA), el handler:
1. Crea la reserva en `GuestStay` con flag `channexConflict: true` y `noShowChargeStatus = 'WAIVED'` (no bloquea inventario aún).
2. Emite SSE `channex:conflict` al canal de la property.
3. Crea `AppNotification` nivel 3 (Elevated, §58) al SUPERVISOR con CTA "Revisar conflicto".
4. NO modifica la `GuestStay` preexistente.

Esto preserva ambas verdades hasta que un humano decida. Patrón Mews "Manual review queue".

### D-CHX6: Channex pull diario como guard anti-drift

Cron 03:00 local (post night-audit) hace `GET /bookings?since=24h` y reconcilia. Cualquier reserva en Channex no presente en Zenix → SSE `channex:drift-detected` + AppNotif nivel 2. No auto-importa (D-CHX5 conflict logic se ejecutó al webhook fallido — si el pull lo detecta, hay un bug real que requiere humano).

### D-CHX7: Mapeo de cancelaciones OTA → flujo cancel-archive de Zenix

`booking_cancel` webhook NO hace hard-delete. Llama a `GuestStayService.cancelByOtaWebhook()` que ejecuta el mismo path que cancelación manual (ver sprint CANCEL-ARCHIVE), con `cancelKind: OTA_CANCELLATION` y `cancelledById: 'channex-system'`. Audit trail intacto.

### D-CHX8: `booking_modify` solo permite cambios reversibles

Channex permite modificar fechas, nombre, pax. Solo procesamos automáticamente si:
- Stay sigue en `ARRIVING` (no check-in confirmado, no no-show, no checkout).
- Nuevas fechas siguen disponibles (`AvailabilityService.check()` excluyendo este stay).

Si falla cualquier guard, NO modifica + SSE conflict + AppNotif al SUPERVISOR. NUNCA modifica un stay con `actualCheckin != null` automáticamente (impacta facturación, room state, housekeeping).

### D-CHX9: Mapping room → OTA room mediante `Room.channexRoomTypeId` + override

Channex envía `room_type_id` (el de Channex), no el de Zenix. Cada `Room` o `RoomType` tiene `channexRoomTypeId: String?`. Si no hay match → reserva creada en estado `UNASSIGNED` (sin roomId) + AppNotif al SUPERVISOR. Pattern Cloudbeds.

### D-CHX10: Rate limit interno propio del handler

Channex puede burstear en backfill (~100 webhooks/s). El handler usa una queue async (in-memory Bull o similar) con concurrency=4 para no saturar Postgres. Webhook responde 200 al recibirse, procesamiento es async. Idempotencia (D-CHX2) hace que retries de Channex sean seguros si la queue cae.

---

## 4. Schema changes (Prisma)

```prisma
model GuestStay {
  // ── Channex inbound (Sprint CHANNEX-INBOUND) ─────────────────────
  channexBookingId    String?  @unique @map("channex_booking_id")
  channexRevision     Int?     @map("channex_revision")
  channexConflict     Boolean  @default(false) @map("channex_conflict")
  channexLastSyncAt   DateTime? @map("channex_last_sync_at")
  // ──────────────────────────────────────────────────────────────────
  // ... resto sin cambios
}

model Room {
  channexRoomTypeId   String?  @map("channex_room_type_id")
  // o en RoomType si se prefiere
}

model PropertySettings {
  channexWebhookSecret String?  @map("channex_webhook_secret")
  channexPullEnabled   Boolean  @default(true) @map("channex_pull_enabled")
  channexPullLastRunAt DateTime? @map("channex_pull_last_run_at")
}

model ChannexWebhookLog {
  id              String   @id @default(uuid())
  propertyId      String   @map("property_id")
  eventType       String   @map("event_type")  // booking_new | booking_modify | booking_cancel | availability_modify
  channexBookingId String? @map("channex_booking_id")
  payload         Json
  signatureValid  Boolean  @map("signature_valid")
  receivedAt      DateTime @default(now()) @map("received_at")
  processedAt     DateTime? @map("processed_at")
  result          String?  // 'created' | 'updated' | 'cancelled' | 'conflict' | 'rejected'
  errorMessage    String?  @map("error_message")
  resultingStayId String?  @map("resulting_stay_id")

  property        Property @relation(fields: [propertyId], references: [id])

  @@index([propertyId, receivedAt])
  @@index([channexBookingId])
  @@map("channex_webhook_logs")
}
```

Migration: `2026_channex_inbound_initial`.

---

## 5. Plan de implementación (5-7 días)

### Día 1 — Schema + skeleton
- Migration con campos arriba.
- `ChannexInboundModule` registrado en `app.module`.
- `ChannexWebhookController` con endpoint `POST /webhooks/channex` que solo loggea y responde 200.
- Decorator `@Public()` para evitar JWT guard (Channex no envía token).
- Middleware capture raw body (necesario para HMAC verification).
- Tests: 1 e2e que postea payload mock y verifica que se loguea en `ChannexWebhookLog`.

### Día 2 — HMAC verification + idempotencia
- `ChannexSignatureService.verify(rawBody, signature, secret)` — implementa HMAC-SHA256 timing-safe compare.
- Lookup `PropertySettings.channexWebhookSecret` por header `X-Channex-Property-Id`.
- Reject 401 si falla. Loggear en `ChannexWebhookLog` con `signatureValid: false`.
- Idempotency lock: redis (o tabla `ChannexWebhookLock` por `channexBookingId` con TTL 60s) para que requests concurrentes del mismo bookingId se serialicen.
- Tests: 4 specs cubriendo (a) firma válida, (b) inválida, (c) replay idempotente, (d) lock concurrente.

### Día 3 — `booking_new` happy path
- `ChannexBookingService.handleBookingNew(payload)`:
  1. Lookup `Room` por `channexRoomTypeId` → si no match: `UNASSIGNED` + AppNotif.
  2. `AvailabilityService.check()` excluyendo nada (es reserva nueva externa).
  3. Si available → `GuestStay.create` con `channexBookingId`, `source: payload.ota_name`, etc.
  4. Si NO available → D-CHX5 conflict path.
  5. Emit SSE `stay:created`.
- Tests: 5 specs (happy path, unassigned room, conflict, duplicate revision, missing required fields).

### Día 4 — `booking_modify` + `booking_cancel`
- `handleBookingModify(payload)`:
  - Solo si `stay.status === 'ARRIVING'` y no hay `actualCheckin`.
  - Guards de fecha + availability con `excludeStayIds: [stayId]`.
  - Update `GuestStay` + `StaySegment.checkOut`.
  - Si guards fallan → conflict (D-CHX8).
- `handleBookingCancel(payload)`:
  - Llama `GuestStayService.cancelByOtaWebhook` (puente al sprint CANCEL-ARCHIVE).
  - Set `cancelKind: OTA_CANCELLATION`.
- Tests: 6 specs.

### Día 5 — Conflict UI + AppNotif
- `AppNotification` tipo `CHANNEX_CONFLICT` con metadata `{ channexBookingId, conflictType, otaName }`.
- Web: `NotificationPanel` ya muestra (§17 obligatorio). Banner naranja con CTA "Revisar conflicto".
- Página `/channex/conflicts` con lista de stays con `channexConflict: true`.
- Acción manual: "Mover a hab. libre" o "Cancelar reserva OTA" (notifica de vuelta a Channex via API).
- Tests web: 2 component tests + 1 e2e.

### Día 6 — Pull reconciliación nocturna
- `ChannexPullScheduler` análogo a `NightAuditScheduler` (multi-tz IANA).
- Cron 03:00 local per-property.
- Llama `GET /bookings?since=24h` y compara con DB.
- Cualquier drift → AppNotif al SUPERVISOR (NO auto-import — la cita explícita es D-CHX6).
- Tests: 3 specs.

### Día 7 — QA E2E + docs
- E2E flow completo: webhook mock → DB → SSE → UI banner → resolución → Channex.cancel call mock.
- Update CLAUDE.md con §95-§104 (las 10 decisiones D-CHX*).
- Update [docs/zenix-sales-master.md](../zenix-sales-master.md) con sección "Channel manager Channex.io inbound".
- Update [docs/vision/03-roadmap-v1-v2.md](../vision/03-roadmap-v1-v2.md) — mover Channex inbound de v1.0.1 a v1.0.0.

---

## 6. Lo que NO está en este sprint

- **Channex Group/Brand sync** — multi-property bajo un Brand (§63) requiere mapping diferente. v1.0.5+.
- **Channex Payments (collect_at_property vs OTA-collect)** — cubierto por sprint PAY-CORE §87. Este sprint solo persiste `paymentModel` desde el webhook payload.
- **Booking.com Genius rates / loyalty tags** — payload extra que se ignora hasta v1.1+.
- **Channex Promotions / Discount Codes** — no aplicables en piloto.
- **Channex Property Health Dashboard pull** — métricas de mapping correctness. v1.1+.

---

## 7. Riesgos identificados y mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Webhook secret leakage (sub a producción) | Media | Crítico (atacante inyecta reservas) | Secret nunca en repo. Solo en `PropertySettings`. Rotation 90d via Activate (§77-§80). |
| Postgres saturado por backfill burst | Baja | Alto (Zenix down 5-10min) | Queue async D-CHX10 + idempotencia (retries safe). |
| Mismatched timezones (Channex UTC vs local) | Alta | Medio (reservas con fecha off-by-one) | Convertir a Property timezone usando IANA (patrón §12). Test fixtures con TZ=America/Cancun. |
| Channex emit duplicate webhooks | Alta (documentado) | Bajo | D-CHX2 idempotency UNIQUE. |
| Hotel cancela manualmente en Zenix, Channex no se entera | Baja (outbound se hizo en Sprint 8C) | Alto (OTA sigue vendiendo) | Sprint outbound completion: `notifyRelease` debe llamar `Channex.cancelBooking` cuando `cancelKind: HOTEL_INITIATED` y el stay tiene `channexBookingId`. |
| OTA modifica fecha pasada (back-dated edit) | Baja | Medio | Reject `booking_modify` si `checkIn < now - 7d` con AppNotif manual. |

---

## 8. Definición de "hecho"

- [ ] Migration aplicada en piloto Tulum.
- [ ] Webhook endpoint responde 200 con HMAC válido, 401 con inválido.
- [ ] 3 escenarios E2E pasan: new (sin conflicto), modify (en ARRIVING), cancel (OTA-initiated).
- [ ] Conflict path crea AppNotif + UI banner clickable.
- [ ] Pull nocturno detecta drift sintético y notifica.
- [ ] CLAUDE.md actualizado con D-CHX1..10.
- [ ] Sales master + roadmap reflejan el cambio.
- [ ] ChannexWebhookLog tiene cobertura completa (todos los webhooks dejan trace).
- [ ] Tests: ≥20 unit + ≥3 e2e, todos verdes.
