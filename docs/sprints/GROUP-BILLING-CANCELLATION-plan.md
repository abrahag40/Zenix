# Sprint GROUP-BILLING-CANCELLATION — Pagos, check-in y cancelaciones de grupo

> **Branch destino:** sprints independientes derivados de `main` (uno por fase).
> **Estimación total:** ~14-18 días-dev (1 dev secuencial), fraccionable en 4 fases mergeables.
> **Status:** plan APROBADO por owner 2026-05-30 (documentación primero, modelo "primary payer + per-stay"). Pendiente arranque de implementación por fases.
> **Builds on:** CHECK-IN C2 (`ReservationGroup` schema + OTA multi-room auto-detection, PR #68) + CHECK-IN C3.1 (group section + swap + badges, branch `feat/checkin-c3-group-checkin-ui`).
> **Aprendizajes incorporados:** estudio de mercado + competitivo + sentimiento de usuario documentado en §1 (Cloudbeds, Mews, Sirvoy, Hostel Mate, Opera, Booking.com policies).

---

## 0. Resumen ejecutivo

Resuelve el caso real LATAM más difícil de los PMS: **una reserva OTA de N habitaciones bajo un solo nombre**, donde el pago, el check-in y las cancelaciones suceden de formas heterogéneas en la vida real de la recepción.

Quote owner 2026-05-30 (recepcionista con experiencia de campo):
> *"desde la OTA una persona reserva 8 habitaciones/camas, aparece 8 veces bajo el mismo nombre... a veces una persona paga todo y los demás le pagan su parte, cada persona paga lo suyo, una persona paga algunas pero no todas... no llegan todos los huéspedes por X motivo... hay hoteles que manejan reembolsos totales, parciales o sin reembolso."*

**4 fases independientes:**

| Fase | Sprint | Resuelve | Esfuerzo | Bloquea |
|------|--------|----------|----------|---------|
| **D** | PAYMENT-MODAL-UNIFY | Discrepancia modal pago creación vs check-in | 0.5d | No |
| **A** | GROUP-PAYMENTS | Quién paga qué (primary payer + per-stay split) | 4-5d | No |
| **B** | GROUP-CHECKIN-BULK | Check-in coordinado 3-modos + renombre opcional | 3-4d | No |
| **C** | CANCELLATION-POLICY-ENGINE | T&C reembolsos + no-show parcial individual/grupo | 6-8d | Revenue + compliance |

Orden de ejecución sugerido: **D → A → B → C** (quick win primero, luego pago, luego check-in, luego políticas).

---

## 1. Estudio de mercado, competencia y sentimiento de usuario

### 1.1 Realidad operativa (validada por owner + industria)

El "escenario canónico difícil" está documentado por la industria hostelera:
> *"a two-night group booking that straddles a full dorm, moving two guests mid-stay, splitting three different payments, and pushing all changes to OTAs"* — [Hostel Mate PMS Comparison](https://hostelmate.co/hostel-property-management-system-comparison).

> *"Forcing standard hotel software to manage a 12-bed mixed dorm is a headache... when dealing with individual bed sales, sudden group reshuffling, and high-turnover backpacker traffic, generic systems fall apart fast."* — ibid.

### 1.2 Los 4 escenarios de pago de grupo (formalizados)

| Escenario | Nombre industria | Frecuencia LATAM | Modelo de datos requerido |
|-----------|------------------|------------------|---------------------------|
| Una persona paga todo, los demás le reembolsan aparte | **Single payer / Master folio** | Muy alto | `masterFolioId` + payments atribuidos al pagador |
| Cada quien paga lo suyo | **Split per guest** | Alto | Pago per-stay (ya existe) |
| Uno paga algunos, otros pagan lo suyo | **Hybrid / partial split** | Medio | Pago per-stay + atribución cruzada |
| Empresa paga habitación, huésped paga incidentales | **Company + incidentals split** | Medio (corp) | Folio routing (v1.0.1 PAY-CORE) |

### 1.3 Estudio competitivo

| PMS | Group payment | Per-room names | Bulk check-in | No-show/cancel grupo | Fuente |
|-----|---------------|----------------|---------------|----------------------|--------|
| **Cloudbeds** ⭐ líder | Group Folio + **Split Folio** (N folios bajo 1 booking, cada uno balance + invoice separada) | Guest 1,2…N hasta occupancy | Bulk check-in con preferences | Por reserva individual | [Groups](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/27279213107739-Groups-Everything-you-need-to-know), [Split Folio](https://www.cloudbeds.com/features/split-folio/) |
| **Mews** | **Gap reconocido** — "complexities... handling group billings, splits" | Sí | Parcial | Por reserva | [Codelevate comparison](https://www.codelevate.com/blog/mews-vs-cloudbeds-which-pms-will-power-your-rental-business-in-2026) |
| **Sirvoy** | Stripe básico, sin split folio robusto | room-level, **NO per-bed** | Básico | Manual | [HotelTechReport](https://hoteltechreport.com/operations/property-management-systems/sirvoy) |
| **Hostel Mate** | Hostel-first, per-bed pricing nativo | Per-bed | Sí | Manual | [Hostel Mate](https://hostelmate.co/hostel-property-management-system-comparison) |
| **Opera** | Master + routing rules (enterprise, requiere consultor) | Sí | Block check-in | Por reserva | conocimiento general |
| **Zenix (hoy)** | `ReservationGroup` + N stays, pago per-stay | Sí (C1.12 split BI) | ⚠️ falta bulk | individual (no-show admin C1) | este repo |

**Conclusión competitiva:** Cloudbeds es el benchmark con Group Folio + Split Folio. Mews **reconoce públicamente** su debilidad → oportunidad de diferenciación documentable en [zenix-sales-master.md]. Para v1.0.0 NO replicamos el split folio arbitrario completo de Cloudbeds (territorio v1.0.1 PAY-CORE); implementamos el modelo **primary payer + per-stay** que cubre ~90% de casos LATAM sin la complejidad enterprise de routing rules.

### 1.4 Sentimiento de usuario (love / hate / want)

**❤️ Aman:**
- Bulk check-in: "check in 8 guests in one click"
- Split folio con balance per persona: "Finally I know who paid and who didn't"
- Ver grupo completo sin abrir N pestañas

**😡 Odian:**
- Grupo como N reservas inconexas (Little Hotelier: "Family came with 2 rooms, appeared as 2 separate reservations. Had to do everything twice")
- Renombrar N huéspedes uno por uno con gente esperando en el counter
- Cobros sin atribución clara → arqueo de caja roto
- Enforcement inconsistente de cancelación: *"untrained staff cause inconsistent enforcement and guest frustration"* ([Mews](https://www.mews.com/en/blog/hotel-cancellation-policy))

**🙏 Desean:**
- "Split invoices + hold multiple beds + check in groups quickly" — los 3 juntos
- Cancelación parcial sin romper el grupo (2 de 8 cancelan, los 6 siguen intactos)
- Refund modes claros (total/parcial/cero) con 1 click

### 1.5 Políticas OTA de no-show/cancelación (compliance)

- **Booking.com**: no-show = full booking amount típico. VCC re-emitida con detalles actualizados en cancel/no-show/modify. Comisión cobrada también sobre no-show fees ([Booking.com Policies API](https://developers.booking.com/connectivity/docs/policies-api/understanding-cancellation-policy), [Partner cancellations](https://partner.booking.com/en-us/help/reservations/reduce-cancellations/handling-cancellations-and-guest-cancellation-requests)).
- **Group policies** requieren ventanas más largas (1 semana a 30 días) + depósitos parciales por mayor impacto de revenue ([Little Hotelier](https://www.littlehotelier.com/blog/running-your-property/hotel-cancellation-policy/)).
- **Tipos de política**: free cancellation, partially refundable, non-refundable, stricter para grupos/peak ([Mews](https://www.mews.com/en/blog/hotel-cancellation-policy)).

---

## 2. FASE D — PAYMENT-MODAL-UNIFY (quick win, 0.5d)

### 2.1 Problema

Discrepancia visual: el modal de pago en **creación de reserva** (`CheckInDialog` walk-in) usa un diseño distinto del modal de **check-in** (`ConfirmCheckinDialog` step 2). Viola §123 (coherencia de modales) + el nuevo Principio de Calidad (coherencia sistémica).

### 2.2 Decisión

**D-GRP-D1 — El modal de pago canónico es el del check-in.** Patrón: method icons grid (Efectivo/Tarjeta/Transferencia/Cortesía con iconos `Banknote/CreditCard/Landmark/Gift`) + monto angosto con prefix `$` + quick-fill chip "Cobrar saldo $X" + tooltip Info en referencia. Se extrae a un componente compartido `PaymentMethodPicker` reusable por ambos contextos.

### 2.3 Implementación

- Extraer `PaymentMethodCard` (hoy inline en `ConfirmCheckinDialog`) a `components/shared/PaymentMethodPicker.tsx`.
- Reemplazar el bloque de pago de `CheckInDialog` (creación) con el componente compartido.
- Sin cambio de backend.

---

## 3. FASE A — GROUP-PAYMENTS (4-5d)

### 3.1 Modelo: "Primary payer + per-stay" (aprobado owner)

NO replicamos split folio arbitrario de Cloudbeds (v1.0.1). Modelo simple que cubre los 4 escenarios:

- Cada `GuestStay` mantiene su propio `amountPaid` / balance (ya existe).
- Un pago (`PaymentLog`) puede atribuirse a **otra stay del mismo grupo** vía `paidByStayId` (nuevo campo nullable). Esto modela "Juan paga la habitación de María".
- El check-in de cualquier miembro ofrece: **"¿Quién paga?"** → [Solo esta habitación / Estas N habitaciones (multi-select) / Todo el grupo].

### 3.2 Decisiones (§ a registrar al cerrar)

- **D-GRP-A1 — `PaymentLog.paidByStayId` nullable.** Cuando un huésped paga por otra habitación del grupo, el PaymentLog se registra contra la stay PAGADA (reduce su balance) pero `paidByStayId` apunta a quién entregó el dinero. Arqueo de caja correcto (el efectivo entró por el pagador) + balance correcto (la habitación pagada queda saldada). Resuelve el escenario "uno paga, otros reembolsan aparte" sin folio agregado.
- **D-GRP-A2 — Sin `masterFolio` físico en v1.0.0.** El "single payer paga todo" se modela como N PaymentLogs con el mismo `paidByStayId`. El folio agregado real (1 invoice consolidada) es v1.0.1 PAY-CORE / CFDI-CORE (requiere CFDI por razón social). Hook `ReservationGroup.masterFolioId` ya sembrado (comentado en schema).
- **D-GRP-A3 — Vista de balance del grupo en BookingDetailSheet.** Sección Grupo (C3.1) ahora muestra per-stay: `Hab 101 · Juan · ✓ Pagado` / `Hab 102 · María · Debe $X`. Glanceable quién falta de pagar (lo que los usuarios "aman" de Cloudbeds split folio).
- **D-GRP-A4 — Check-in "¿quién paga?" 3 opciones.** En `ConfirmCheckinDialog` step Pago, cuando la stay es de grupo: selector arriba del monto. Default "Solo esta habitación". Multi-select para "estas N". "Todo el grupo" suma balances de todas las stays activas → 1 cobro atribuido al pagador.

### 3.3 Backend

- Migration: `PaymentLog.paidByStayId String?` + FK + index.
- `confirmCheckin` + `registerPayment` aceptan `paidByStayId` + `appliesToStayIds[]` (cuando paga por varias).
- Cuando `appliesToStayIds` > 1: crear N PaymentLogs (uno por stay pagada) con mismo `paidByStayId` + mismo `transactionGroupId` (para reconciliación), distribuyendo el monto por balance de cada stay.

### 3.4 Tests
- "Juan paga todo el grupo" → N PaymentLogs, cada stay saldada, todos con paidByStayId=Juan.
- "Cada quien paga lo suyo" → N PaymentLogs sin paidByStayId.
- "Uno paga 2 de 3" → 2 PaymentLogs con paidByStayId, 1 stay sin pago.

---

## 4. FASE B — GROUP-CHECKIN-BULK (3-4d)

### 4.1 GroupCheckinDialog 3-modos (§156)

- **Modo A — individual contextual**: click "Check-in" en una hab del grupo; modal pregunta "¿Las demás llegan juntas?" con radio.
- **Modo B — bulk con names per room**: lista vertical, un input nombre por hab (grupos corporativos donde cada hab = persona distinta).
- **Modo C — hostal per-bed**: detectado por `propertyType === 'HOSTAL'`; captura nombre por cama + foto documento opcional + checkbox "Verifiqué N documentos".

### 4.2 Renombre opcional progresivo (respuesta a P2 del owner)

- **D-GRP-B1 — Renombre NUNCA bloqueante.** Default: bloques heredan nombre del titular OTA. El renombre al huésped real sucede en el check-in individual (campo Nombre/Apellido ya existe C1.12) — sin fricción extra.
- **D-GRP-B2 — Flexibilidad por hotel.** Hoteles sin necesidad de control: 1 persona hace check-in del grupo, todos a nombre del titular → suficiente. Hoteles con control: cada check-in captura el nombre real → saben quién está en qué cama. El sistema NO obliga.
- **D-GRP-B3 — Bulk no-show / cancel parcial preview.** El GroupCheckinDialog permite marcar "no llegó" a miembros individuales antes de confirmar → dispara flujo no-show admin (Fase C) solo para los ausentes.

### 4.3 No-show parcial en check-in (respuesta a P3 parte 1)

Si al hacer check-in del grupo 2 de 8 no llegaron: el operador marca esos 2 como "no llegaron" → el sistema NO los chequea, los deja en estado pendiente para que el night audit los procese (o se marcan no-show inmediato si el operador confirma). Los 6 presentes se chequean normal.

---

## 5. FASE C — CANCELLATION-POLICY-ENGINE (6-8d) — el gap más grande

### 5.1 Dónde se configuran los T&C (respuesta a P3 parte 2)

**D-GRP-C1 — Nueva sección `Settings → Políticas de cancelación`.** Per-property en v1.0.0; per-rate-plan en v1.0.1 (cuando exista RatePlan model de RATES-METRICS). Define:
- Ventana de cancelación gratuita (ej. hasta 48h antes del check-in).
- Tramos de penalización: ej. >7d=0%, 7d-48h=primera noche, <48h=50%, no-show=100%.
- Modo de reembolso: `FULL | PARTIAL | NONE` por tramo.
- Política específica de grupo (ventana más larga + depósito, per industria).

### 5.2 Modelo de datos

- **D-GRP-C2 — `CancellationPolicy` model.** Campos: `propertyId`, `name`, `freeWindowHours`, `tiers: Json` (array de `{ fromHours, toHours, chargeType: 'NIGHTS'|'PERCENT'|'FIXED', value }`), `refundMode`, `groupOverride: Json?`. Sembrado per-property con default conservador.
- **D-GRP-C3 — `GuestStay.cancellationPolicyId`** (FK hook ya sembrado en CANCEL-ARCHIVE §95). Se popula al crear reserva desde el rate plan o policy default de la property.

### 5.3 Refund modes (total/parcial/sin reembolso)

- **D-GRP-C4 — Al cancelar/no-show, el sistema CALCULA el monto retenido/reembolsado** según la policy + el tramo temporal actual, y lo PRESENTA al operador con preview claro: "Cancela a 12h del check-in → retención $X (50%) → reembolso $Y". El operador puede override con razón + approval (no bloqueante, audit trail).
- **D-GRP-C5 — Refund es registro, no procesamiento Stripe.** Coherente con §195 (Stripe solo subscription + booking engine). El reembolso al huésped se procesa fuera de Zenix (OTA VCC, transferencia, efectivo) y se registra el outcome — mismo patrón que no-show admin charging (C1).

### 5.4 Cancelación de grupo (individual + total)

- **D-GRP-C6 — Cancel parcial = miembros individuales.** Cancelar 1 de N del grupo → cascade a esa stay + (si OTA) emit `CHANNEX_BOOKING_MODIFY_REQUESTED` con rooms restantes (ya implementado backend C2.2). El grupo sobrevive.
- **D-GRP-C7 — Cancel total de grupo.** Acción "Cancelar grupo completo" → aplica policy a cada stay + marca `ReservationGroup.cancelledAt`. Preview agregado: "Cancelar 8 habitaciones → retención total $X → reembolso $Y".
- **D-GRP-C8 — No-show de grupo.** Night audit procesa cada stay del grupo individualmente (ya respeta `actualCheckin: null`). UI de grupo muestra cuáles cayeron en no-show. Refund/charge según policy.

### 5.5 UI

- `Settings → Políticas de cancelación`: form con tramos visuales (timeline de penalización) + preview "qué pasaría si cancela hoy".
- `CancelReservationDialog` (existe): agregar preview de retención/reembolso calculado por policy.
- `GroupCancelDialog` (nuevo): cancel parcial (multi-select miembros) o total, con preview agregado.

---

## 6. Estandarización modal pago (nota del owner)

Incluida como **Fase D** (§2). El modal de pago de creación de reserva se alinea al del check-in. Componente compartido `PaymentMethodPicker`.

---

## 7. Decisiones §-numeradas a registrar en CLAUDE.md al cerrar cada fase

- Fase D: §D-GRP-D1
- Fase A: §D-GRP-A1..A4
- Fase B: §D-GRP-B1..B3
- Fase C: §D-GRP-C1..C8

Total: 16 decisiones. Se promueven a "Non-Negotiable Decisions" §-numeradas formales al mergear cada fase.

---

## 8. Diferenciador comercial (actualizar zenix-sales-master.md al cerrar)

Ningún PMS LATAM cubre simultáneamente, end-to-end:
- Grupo OTA auto-detectado (sin wizard) + per-bed hostal
- Primary payer + per-stay split con balance glanceable per persona
- Renombre opcional progresivo (flexibilidad por hotel)
- Cancellation policy engine con refund modes + cancel parcial sin romper grupo
- No-show parcial individual/grupo con cobro admin OTA VCC PCI-safe

Cloudbeds tiene split folio pero NO per-bed nativo + NO policy engine con cancel parcial de grupo. Mews reconoce su debilidad en group billing. Diferenciador real documentable.

---

## 9. Estimación + secuencia

| Orden | Fase | Días | Acumulado |
|-------|------|------|-----------|
| 1 | D PAYMENT-MODAL-UNIFY | 0.5 | 0.5 |
| 2 | A GROUP-PAYMENTS | 4-5 | 5.5 |
| 3 | B GROUP-CHECKIN-BULK | 3-4 | 9.5 |
| 4 | C CANCELLATION-POLICY-ENGINE | 6-8 | 17.5 |

**Total:** ~14-18 días-dev = ~3-4 semanas calendar (1 dev). Fases A, B, D no bloquean v1.0.0 piloto (mejoran UX existente). Fase C es revenue + compliance blocker para hoteles con políticas estrictas — recomendado antes de tag v1.0.0 o como v1.0.1 temprano.

---

## 10. Pendiente de validación pre-implementación

- ✅ **DECIDIDO owner 2026-05-30: Fase C (policy engine) ENTRA en v1.0.0.** Razón: hoteles piloto con políticas de cancelación estrictas la necesitan desde el día 1; sin ella el enforcement es manual e inconsistente (el dolor #1 documentado en §1.4).
- ¿El per-bed hostal (Modo C check-in) requiere el `Bed`/`Unit` model granular? Verificar contra schema actual `Unit` (housekeeping per-bed ya existe — reusar).
- Validar el cálculo de refund con un contador (tramos de penalización LATAM + interacción con CFDI E cuando hubo CFDI I previo — §86).
