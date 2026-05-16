---
Audiencia: Equipo de desarrollo Zenix · Product owner · Contador / asesor fiscal LATAM
Estado: Plan propuesto — pendiente de aprobación
Branch: feature/cancel-archive
Última actualización: 2026-05-16
Sprint anterior: Bug-fixes UI + same-day turnover (PR #28, #29, #30)
Disparador: feedback usuario 2026-05-15 — "no tenemos forma de cancelar o eliminar una reserva generada"
---

# Sprint CANCEL-ARCHIVE — Cancelación, archivado y CFDI E para reservas

> **Misión del sprint**: dar al recepcionista una forma legítima de cancelar una reserva (errónea o solicitada por el huésped) sin perder el registro fiscal/operativo. Cubre soft-delete con preservación de PII solo el tiempo legalmente requerido, distinción entre cancelación legítima y error administrativo, emisión automática de CFDI E (Egreso) en México, y UI estilo "archivo" inspirada en Cloudbeds — la cita explícita del usuario.

---

## 1. Contexto y motivación

### Cita del usuario (2026-05-15)

> "No tenemos forma de cancelar o eliminar una reserva generada. CloudBeds recuerdo que no las borra, como que las archivaba..."

### El problema operativo

Hoy en Zenix, una reserva creada solo puede:
- Marcarse como no-show (post 20:00, requiere ventana 48h reversible §16).
- Hacer checkout anticipado.
- Modificarse mediante drag/extend.

**No existe** el caso "el huésped llamó para cancelar la próxima semana" o "creé la reserva en la habitación equivocada y la otra ya tiene confirmación enviada". Esto fuerza al recepcionista a usar workarounds (mover a una habitación bloqueada, marcar no-show fuera de tiempo, etc.) que **rompen el audit trail fiscal** y comprometen la calidad de los reportes.

### Por qué es no-negociable para v1.0.0

Cualquier hotel real opera con un ~5-15% de cancelaciones (Cornell Hospitality Quarterly, 2023, n=2,800 properties). Lanzar v1.0.0 sin esta capacidad obliga al cliente piloto a improvisar.

Además: una cancelación en CFDI 4.0 MX **requiere emisión de CFDI E (Egreso) con FormaPago=15** si el folio original tuvo CFDI I emitido (§86 de CLAUDE.md ya lo establece para GuestCredit — extiende natural a cancelaciones).

---

## 2. Investigación de mercado — patterns competitivos

### 2.1 Cómo lo hacen los 5 PMS estudiados

| PMS | Soft-delete | Archive UI | CancelKind distinción | CFDI/fiscal auto |
|---|---|---|---|---|
| **Cloudbeds** | Sí (`cancelled_at` field) | "Cancelled" sub-tab en Reservations + slider footer | "Cancelled" vs "No-show" vs "Walked" | Manual — usuario emite NC |
| **Mews** | Sí (`state: CANCELED`) | Cancelled lane en Timeline | Reason mandatory desde dropdown configurable | Vía add-on Mews Pay |
| **Opera Cloud** | Sí — record permanente | "Cancellation History" report | Cancel reason code (configurable per-property) | OPERA Cloud Financials integration con SAP |
| **RoomRaccoon** | Sí | Filter "Cancelled" en list | Limited (genérico) | Vía add-on Belastingdienst NL |
| **Little Hotelier** | Hard-delete después de 90d (default) | Filter | No | No — solo log |

### 2.2 La cita textual de Cloudbeds que motiva el patrón

[Cloudbeds Help Center](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/360008188313):
> "*When a reservation is cancelled in Cloudbeds, it is NOT deleted. The reservation remains in the system, accessible via the Cancelled filter, and all financial records (deposits, refunds, fees) remain intact for accounting purposes.*"

Esto es exactamente lo que el usuario describió. Lo adoptamos.

### 2.3 Diferenciadores Zenix

| Feature | Zenix | Mercado |
|---|---|---|
| `cancelKind: LEGITIMATE vs ADMIN_ERROR` | ✅ — bloquea cargos automáticos si error administrativo | ❌ Nadie distingue |
| CFDI E automático en cancelación post-emisión | ✅ con `MxCfdi40Adapter` (§89) | Solo enterprise (Opera + adapter manual) |
| PII anonymization scheduler post-retention | ✅ — GDPR/LFPDPPP compliance (§11) | Cloudbeds requiere request manual |
| Archive UI tipo slide footer | ✅ — referencia Cloudbeds | Cloudbeds (✓), otros no |
| Restore desde archive | ✅ ventana 30d configurable | Cloudbeds (read-only), nadie permite restore |

---

## 3. Decisiones no-negociables (candidatas a CLAUDE.md §)

### D-CAN1: Soft-delete obligatorio, hard-delete prohibido

`GuestStay` con `cancelledAt != null` permanece en DB indefinidamente. Acción de "borrar" en UI **siempre** ejecuta soft-delete. No existe endpoint hard-delete público. Análogo a §11 (no-show inmutable).

Razón: **Visa Reason Code 13.7 "Cancelled Merchandise/Services"** — ventana 120 días filing del cardholder + 30 días respuesta del acquirer ([Visa Dispute Management Guidelines junio 2024](https://usa.visa.com/content/dam/VCOM/global/support-legal/documents/merchants-dispute-management-guidelines.pdf)). CFDI 4.0 Art. 30 CFF (5 años retención fiscal MX). GDPR Art. 17.3.b/e (excepción "establishment, exercise or defense of legal claims").

### D-CAN2: Distinción `CancelKind: LEGITIMATE | ADMIN_ERROR | OTA_CANCELLATION` + sub-kind refundability

Enum principal:
- **LEGITIMATE** — el huésped o el hotel canceló legítimamente. Aplican penalty rules del rate plan. Si hubo CFDI I → emite CFDI E. Sub-kind obligatorio `refundability: GUEST_INITIATED_REFUNDABLE | GUEST_INITIATED_NON_REFUNDABLE | HOTEL_INITIATED`.
- **ADMIN_ERROR** — el recepcionista creó la reserva equivocada (wrong room, wrong dates, duplicate). NO aplica penalty. NO emite CFDI E (no hubo operación real). Requiere `approvedById` SUPERVISOR (forcing function análoga a COMP §28).
- **OTA_CANCELLATION** — cancelación entrante via Channex (sprint CHANNEX-INBOUND D-CHX7). Penalty según política del OTA, no del rate plan local.

UI: dropdown explícito en `CancelReservationDialog`. Default = LEGITIMATE para reducir fricción del caso común. ADMIN_ERROR requiere segundo clic + reason text. Sub-kind de refundability se calcula default desde rate plan + fecha; el usuario puede override con audit log.

Razón del sub-kind: documentado por [Mews community](https://help.mews.com/en/articles/4583147) — el tipo de cancel determina si Refund logic v1.0.1 PAY-CORE dispara auto-refund o solo deja open folio. Sin esta distinción el flujo cancel ↔ refund queda ambiguo.

### D-CAN3: Ventana de cancelación según estado

| Estado del stay | ¿Cancelable? | Path |
|---|---|---|
| `ARRIVING` (future) | Sí, sin restricción | Cancel directo, penalty según rate plan |
| `ARRIVING` (today, no actualCheckin) | Sí, pero abre warning "este huésped llega hoy" | Cancel + sugiere usar no-show post 20:00 si no se presenta |
| `IN_HOUSE` | No — usar early-checkout en su lugar | UI muestra path correcto |
| `DEPARTED` | No — historial inmutable | UI deshabilita acción |
| `NO_SHOW` | No — usar revert no-show (§16, ventana 48h) | UI redirige |
| `CANCELLED` ya | No (idempotencia) | UI muestra "Ya cancelada" |

### D-CAN4: Inventory liberation inmediata en cancelación

Al cancelar, ejecuta en la misma transacción:
1. `GuestStay.cancelledAt = now`, `cancelKind`, `cancelReason`, `cancelledById`.
2. `StaySegment[*].status = 'CANCELLED'` para todos los segments del journey.
3. `StayJourney.status = 'CANCELLED'`.
4. `Room.status` no cambia (no estaba ocupada todavía).
5. `AvailabilityService.notifyRelease` (fire-and-forget §31) para sync Channex outbound.
6. Crear `GuestStayLog` append-only con event `CANCELLED` + metadata.

`AvailabilityService.check` ya excluye `cancelledAt != null` (regla a agregar — actualmente solo excluye `noShowAt`).

### D-CAN5: CFDI E automático si `cancelKind === LEGITIMATE` y folio tuvo CFDI I

En la misma transacción (post v1.0.2 CFDI-CORE):
1. Si `stay.cfdiIssuedAt != null` y `cancelKind === LEGITIMATE`:
   - Calcular `refundAmount` según penalty del rate plan.
   - Llamar `MxCfdi40Adapter.emitEgreso({ folioOriginal, formaPago: '15', usoCfdi: 'G02', monto: refundAmount })`.
   - Persistir resultado en `CfdiEmission` con relación al stay.
   - **Tracking del estado fiscal asíncrono** (`PENDING_RECEPTOR_ACK | ACCEPTED | REJECTED`) — Regla SAT 2.7.1.35 obliga aceptación del receptor via Buzón Tributario en **3 días hábiles** ([ContadorMx 2026](https://contadormx.com/cancelacion-cfdi-complemento-de-pago-sat-2026/), [SAT Anexo 20 v4.0 FAQ](http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/PregFrecCFDIVer4_0.pdf)). UI muestra estado; AppNotif al contador si REJECTED.
2. Si `cancelKind === ADMIN_ERROR` y hubo CFDI I:
   - Llamar `MxCfdi40Adapter.cancelCfdi(folioOriginal, motivo: '02-comprobante con errores sin relacion')`.
   - No emite CFDI E (no fue operación real).
3. Si `cancelKind === OTA_CANCELLATION`: igual que LEGITIMATE pero `motivo` específico OTA.

Para v1.0.0 (pre-CFDI-CORE) el flag fiscal está latente — el código emite TODO log y `requiresFiscalAction: true`. Al activar v1.0.2 el flag dispara la acción automáticamente.

### D-CAN6: PII retention según ley local, anonymization scheduler

`GuestStay.cancelledAt + propertySettings.cancelledRetentionDays` (default 90d MX, 30d EU GDPR base). Scheduler diario:
- Anonymiza: `guestName → 'ANON-' + hashShort(id)`, `guestEmail → null`, `guestPhone → null`, `documentNumber → '***' + last4`.
- Preserva: `cancelledAt`, `cancelKind`, `cancelReason`, `totalAmount`, `cfdiIssuedAt`, `cancelledById`, `bookingRef`.
- Análogo al patrón GDPR-safe del módulo no-show (§11).

### D-CAN7: Restore window 30 días

Una reserva cancelada con `cancelKind: ADMIN_ERROR` y dentro de los 30 días (configurable) puede ser **restaurada** por SUPERVISOR si la habitación + fechas siguen disponibles.

Path:
1. SUPERVISOR clic "Restaurar" en archive view.
2. `AvailabilityService.check` con dates originales.
3. Si OK → `cancelledAt = null`, segments `ACTIVE`, journey `ACTIVE`, audit log `RESTORED`.
4. Si NO available → AppNotif "habitación ya ocupada, restauración bloqueada".

LEGITIMATE / OTA cancellations no son restaurables (operación real ya cerrada).

### D-CAN8: UI archive — sub-tab + slide footer

Inspirado en Cloudbeds. Doble entrada:

**(a) Sub-tab en `/reservations` (lista filtrada):**
- Filtros: Active | Cancelled | Archived (anonymized) | All.
- Default: Active.
- Columna "Cancelled at" + "Cancelled by" + "Reason" + "Kind chip" (rojo ADMIN_ERROR, naranja LEGITIMATE, púrpura OTA).

**(b) Slide-up footer en TimelineScheduler:**
- Botón "Cancelled today" (counter) en footer del calendario.
- Click expande slide drawer con lista de cancelaciones del día actual.
- Patrón directo Cloudbeds — confirmado por el usuario como UX deseado.

### D-CAN9: Cancel desde sheet — acción "Cancelar reserva" con forcing function

`BookingDetailSheet` agrega botón "Cancelar reserva" en el footer junto a "Mover hab.". Color rojo neutral (no destructive-red — la cancelación es legítima, no destructiva del sistema).

Click abre `CancelReservationDialog`:
- Resumen de la reserva (huésped, fechas, monto).
- Dropdown `cancelKind` (default LEGITIMATE).
- Textarea `cancelReason` (mandatory).
- Si `ADMIN_ERROR` → segundo paso de confirmación + warning "esta acción NO genera CFDI E porque no hubo operación".
- Si `LEGITIMATE` con CFDI emitido → preview del CFDI E que se emitirá (post v1.0.2).
- Botón "Confirmar cancelación" → mutación + close sheet + toast.

### D-CAN10: No-cancel para journeys con cualquier IN_HOUSE segment

Si el journey tiene 1+ segments en estado IN_HOUSE (huésped llegó, está alojado en alguno), la cancelación del journey completo NO es válida. Solo cancel del segment futuro vía cancel per-segment (path existente `cancelCheckout(stayId, bedId)` §9).

UI: botón "Cancelar reserva" del sheet bloqueado con tooltip "Huésped en casa — usar checkout o early-checkout".

---

## 4. Schema changes (Prisma)

```prisma
enum CancelKind {
  LEGITIMATE         // Cancelación legítima — guest o hotel
  ADMIN_ERROR        // Error administrativo del recepcionista
  OTA_CANCELLATION   // Cancelación inbound desde OTA via Channex
}

enum CancelRefundability {
  GUEST_INITIATED_REFUNDABLE
  GUEST_INITIATED_NON_REFUNDABLE
  HOTEL_INITIATED
}

enum CfdiCancelStatus {
  NOT_APPLICABLE      // No hubo CFDI I previo
  PENDING_RECEPTOR_ACK
  ACCEPTED
  REJECTED
}

model GuestStay {
  // ── Cancel-archive (Sprint CANCEL-ARCHIVE) ───────────────────────
  cancelledAt          DateTime?            @map("cancelled_at")
  cancelledById        String?              @map("cancelled_by_id")
  cancelKind           CancelKind?          @map("cancel_kind")
  cancelRefundability  CancelRefundability? @map("cancel_refundability")
  cancelReason         String?              @map("cancel_reason")
  cancelReasonCode     String?              @map("cancel_reason_code")     // per-property enum, ver D-CAN config
  cancelApprovedById   String?              @map("cancel_approved_by_id")  // SUPERVISOR para ADMIN_ERROR
  cancelChannexAck     Boolean              @default(false) @map("cancel_channex_ack")
  requiresFiscalAction Boolean              @default(false) @map("requires_fiscal_action")
  cfdiCancelStatus     CfdiCancelStatus     @default(NOT_APPLICABLE) @map("cfdi_cancel_status")
  cfdiCancelAckAt      DateTime?            @map("cfdi_cancel_ack_at")
  anonymizedAt         DateTime?            @map("anonymized_at")
  // ──────────────────────────────────────────────────────────────────
  // ... resto sin cambios
}

model GuestStayLog {
  id          String   @id @default(uuid())
  stayId      String   @map("stay_id")
  event       String   // CREATED | MODIFIED | CANCELLED | RESTORED | ANONYMIZED | CFDI_E_ISSUED
  actorId     String?  @map("actor_id")
  metadata    Json?
  occurredAt  DateTime @default(now()) @map("occurred_at")

  stay        GuestStay @relation(fields: [stayId], references: [id])

  @@index([stayId, occurredAt])
  @@map("guest_stay_logs")
}

model PropertySettings {
  cancelledRetentionDays Int @default(90) @map("cancelled_retention_days")
  cancelRestoreWindowDays Int @default(30) @map("cancel_restore_window_days")
}
```

Migration: `2026_cancel_archive_initial`.

---

## 5. Plan de implementación (4-6 días)

### Día 1 — Schema + backend service core
- Migration con campos arriba.
- `GuestStayService.cancelStay(stayId, dto)`:
  - Guards (estado, in-house, idempotencia).
  - Transaction: update GuestStay + segments + journey + audit log.
  - Emit `stay:cancelled` SSE.
  - Fire-and-forget `notifyRelease` a Channex.
- `GuestStayService.restoreStay(stayId)` (D-CAN7).
- `AvailabilityService.check` actualizada — excluye `cancelledAt != null`.
- Tests: 10 specs (happy paths + guards).

### Día 2 — Anonymization scheduler + retention
- `CancelledAnonymizationScheduler` análogo a `NightAuditScheduler` (multi-tz IANA §12).
- Cron diario 04:00 local per-property.
- Anonimiza stays con `cancelledAt + retentionDays < now`.
- Preserva fields fiscales (§11 pattern).
- Tests: 4 specs cubriendo timezone edge cases.

### Día 3 — Cancel sheet UI + dialog
- `CancelReservationDialog` (web):
  - Resumen reserva.
  - Dropdown `cancelKind`.
  - Reason mandatory.
  - Two-step para ADMIN_ERROR.
  - Mutation + toast + sheet close.
- `BookingDetailSheet` — botón "Cancelar reserva" con guards D-CAN3 + D-CAN10.
- Tests: 3 component tests + 1 e2e.

### Día 4 — Archive UI (sub-tab + slide footer)
- `/reservations` sub-tab "Cancelled" con filtros.
- Columnas + chips por `cancelKind`.
- `TimelineScheduler` footer "Cancelled today (N)" + slide drawer.
- Click en row → sheet read-only con history completo del stay.
- Restore button visible solo si `cancelKind: ADMIN_ERROR` y `< restoreWindow`.
- Tests: 2 component + 1 e2e.

### Día 5 — CFDI E placeholder (v1.0.0) + Channex outbound cancel
- Stub `MxCfdi40Adapter.emitEgreso` — solo loggea y setea `requiresFiscalAction: true`. Real implementation en v1.0.2.
- `Channex.cancelBooking` — si stay tiene `channexBookingId`, notifica al canal. Best-effort, no revierte tx local.
- Reconciliación: cron diario verifica `cancelChannexAck === false` y reintenta.
- Tests: 5 specs.

### Día 6 — QA E2E + docs
- E2E flow completo: crear → cancelar LEGITIMATE → ver en archive → intentar restore (rechazado) → crear con ADMIN_ERROR → restore exitoso → anonymization manual trigger.
- Update CLAUDE.md con §105-§114 (las 10 decisiones D-CAN*).
- Update [docs/zenix-sales-master.md](../zenix-sales-master.md) con "Cancelación auditada + archive Cloudbeds-style".
- Update [docs/vision/03-roadmap-v1-v2.md](../vision/03-roadmap-v1-v2.md) con sprint completado.

---

## 6. Lo que NO está en este sprint

- **CFDI E real (Facturama/SW Sapien adapter completo)** — sprint v1.0.2 CFDI-CORE. Aquí solo el stub + flag.
- **Cancellation policies per rate plan** (e.g. "free until 48h before") — v1.1+. Default: cancel libre, no aplica penalty automático (excepto NO_SHOW path existente §41).
- **Guest-initiated cancellation portal (apps/guest)** — v1.5 según roadmap.
- **Refund processing automatic** (Stripe/Conekta refund call) — v1.0.1 PAY-CORE. Aquí solo flag `refundRequested: true`.
- **Bulk cancel** (cancelar grupo de reservas) — v1.1.2 (group reservations).
- **Cancel desde mobile** (`apps/mobile`) — fuera de scope del sprint; v1.1+.

---

## 7. Riesgos identificados y mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Cancelación accidental de reserva con CFDI emitido | Media | Crítico fiscal | Two-step confirm si `cfdiIssuedAt != null`. Preview del CFDI E a emitir. |
| ADMIN_ERROR abuso (esquivar penalty) | Alta | Medio | Forcing function `approvedById` SUPERVISOR + audit log + reporte mensual de ADMIN_ERROR ratio. |
| Restore re-crea conflict con reserva intermedia | Media | Medio | `AvailabilityService.check` antes de restaurar. UI bloquea si conflict. |
| Anonymization rompe reportes históricos | Baja | Bajo | Preserva campos agregados (totalAmount, dates). Solo PII se borra. |
| Channex outbound cancel falla | Alta | Alto (OTA sigue vendiendo) | Reconciliation cron diario con retry exponencial. AppNotif al SUPERVISOR si falla >3 veces. |
| Soft-delete confunde a recepcionista buscando reserva activa | Alta | Bajo | Default filter "Active" en todas las listas. "Cancelled" como filtro explícito. |
| Race: cancel mientras otro recepcionista hace check-in | Baja | Alto | Soft-lock SSE (§32) ya cubre. Mutation usa transaction + version check. |

---

## 8. Definición de "hecho"

- [ ] Migration aplicada en piloto Tulum.
- [ ] `cancelStay` endpoint expone los 3 kinds + guards.
- [ ] UI `CancelReservationDialog` validada por usuario en preview.
- [ ] Archive UI (sub-tab + footer slider) navegable.
- [ ] Restore funciona solo para ADMIN_ERROR + dentro de ventana.
- [ ] Anonymization scheduler corre en preview con fixture artificial.
- [ ] AvailabilityService excluye cancelled.
- [ ] Channex outbound `cancelBooking` llamada al cancelar (stub OK si Sprint CHANNEX-INBOUND aún no mergeado).
- [ ] CFDI E stub registra `requiresFiscalAction: true`.
- [ ] CLAUDE.md actualizado con D-CAN1..10.
- [ ] Sales master + roadmap actualizados.
- [ ] Tests: ≥20 unit + ≥3 e2e, todos verdes.

---

## 9. Dependencias con otros sprints

| Sprint | Relación | Bloqueante? |
|---|---|---|
| **CHANNEX-INBOUND** | OTA_CANCELLATION path llama `cancelStay` desde el webhook handler. | No bloqueante — se puede mergear este primero y el webhook lo cablea después. |
| **PAY-CORE (v1.0.1)** | Refund processing real. Aquí solo flag. | No bloqueante. |
| **CFDI-CORE (v1.0.2)** | Emit CFDI E real. Aquí solo stub + flag. | No bloqueante. |
| **DEBT-α (BLK-4)** | Cancel de stays multi-bed (dorm) — comportamiento per-bed ya cubierto por §9. | No bloqueante. |
