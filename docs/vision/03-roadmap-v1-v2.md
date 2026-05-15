# 03 · Roadmap Zenix — v1.0 → v2.0

> Ladder de versionado **por bloques temáticos** con justificación, dependencias, y métricas de éxito por bloque.
> Cada bloque (v1.x) es vendible independientemente. v2.0 se reserva para rewrite arquitectónico real.
> **Última revisión:** 2026-05-14 — refactor de versionado de "versiones individuales" a "bloques temáticos" tras análisis comparativo con Mews/Stripe/Salesforce/Cloudbeds.

---

## 1. Resumen del ladder

| Bloque | Misión | Trigger comercial |
|--------|--------|-------------------|
| **v1.0.x — Foundation** | "Funciona en 1 hotel real sin perder dinero y cobra/factura sin sufrir" | Hotel Monica Tulum piloto |
| **v1.1.x — Hotel Operation Excellence** | "Excelencia operativa: tareas que un hotel boutique hace 100 veces al día, automatizadas" | Hotel quiere reducir tiempo en recepción >40% |
| **v1.2.x — Scale & Distribution** | "Crece a cadena multi-property + vende sin pagar 20% a OTAs" | Hotel quiere abrir 2da propiedad o reducir dependencia Booking |
| **v1.3.x — Ancillary Modules** | "El hotel deja de pagar 5 softwares distintos" | Hotel tiene restaurante, spa, compras, nómina, contabilidad |
| **v1.4.x — Data & AI Platform** | "Datos del hotel se monetizan + IA predictiva" | ZaharDev firma 1er contrato ABI |
| **v2.0 — Architectural Rewrite** | Multi-region DB + GraphQL federation + microservicios estrictos | ≥200 propiedades activas (estimado 2030+) |

**Por qué bloques en vez de versiones individuales:**
1. **SemVer integrity** — bumpear major (v2, v3) por feature expansion rompe API pública de partners.
2. **Mental model del cliente** — un hotelero compra "operación", "escala", "ancillary" — no v1.3 vs v1.7.
3. **Big tech consensus** — Mews, Cloudbeds, Stripe, Salesforce, HubSpot **nunca** bumpean major por feature expansion. Solo por rewrite arquitectónico.
4. **Comunicación comercial** — "Zenix 1.2 Scale & Distribution" se vende como expansión. "Zenix 2.0" suena a "ya no es lo mismo" y asusta a quien apenas adoptó v1.

---

## 2. v1.0.x — Foundation (Q2-Q3 2026, en curso)

### Misión
Producto operativo y estable para 1-3 hoteles piloto LATAM. Cierre fiscal mensual posible sin contador externo recableando datos. **Cobro y facturación NO opcionales** — el cliente paga, el hotel cobra, sale factura CFDI, fin.

### Sprints actuales (v1.0.0)

| Sprint | Alcance | Días |
|--------|---------|------|
| **SEC-α** | Hardening multi-tenant (bugs MT-5, MT-3, NS-3, NS-6, MT-7, MT-8) | 5-7 |
| **Mx-1B finalización** | Cerrar gaps menores del módulo de mantenimiento web + mobile | 3-4 |
| **HK-CFG (Setup Recamaristas)** | SettingsPage tab "Recamaristas" — turnos + cobertura + reglas | 5-7 |
| **POLISH-α** | Bugs medios (CAL-10, PAY-8, BLK-6, MAINT-4, NOTIF-7+13, NOTIF-11) | 2-3 |
| **QA-α** | Test coverage del Hub Recamarista mobile | 4-5 |

### v1.0.1 · PAY-CORE — Procesamiento de pagos profesional

> **Scope refinado 2026-05-15** tras investigación competitiva (Mews, Cloudbeds, Opera Cloud, Roomraccoon, Little Hotelier). Decisiones §81-§90 CLAUDE.md. Detalle arquitectónico completo en [14-payment-currency-tax-architecture.md](14-payment-currency-tax-architecture.md).

**Antes:** cobro manual con anotación tipo libreta. Recepcionista cobra efectivo, anota "USD 120 cash", el huésped se va, nadie reconcilía hasta fin de turno → discrepancias, pérdida de evidencia para chargebacks.

**Lo que entra en v1.0.1 (Core BASE — sin estos módulos Zenix no es viable comercialmente en LATAM):**

| Feature | Definición | Por qué importa |
|---------|------------|-----------------|
| **Stripe + Conekta integration** | Cobros con tarjeta crédito/débito + OXXO (México) + transferencia. SetupIntent para guardar tarjeta para no-show charge. | Sin esto, el hotel pierde 5-12% del revenue por chargebacks no defendibles y por turistas internacionales que no traen efectivo. |
| **Folio modal completo** | Panel en BookingDetailSheet con: total, pagado, saldo, cada cargo individual, cada pago individual, voids con razón. Append-only USALI 12ed. | Audit-trail fiscal-grade — requisito SAT para evidenciar lo cobrado. |
| **Folio splitting** | Dividir el folio entre 2+ huéspedes (pareja: él paga habitación, ella paga consumos) o entre huésped y empresa (ella paga habitación, empresa paga eventos). | Demanda real en boutique business. Sin esto el recepcionista lleva 2 libretas. |
| **Master billing corporativo** | Empresa "Acme Corp" hospedó a 5 viajeros en marzo. Sistema genera UNA factura mensual consolidada con desglose por viajero. | Captura segmento corporate del piloto (~15-20% del revenue boutique). |
| **Refund / Void workflow** | Reembolso parcial o total con razón, audit trail, devuelve a método original. Void crea PaymentLog negativo (no borra el original). | Hoy en Zenix void existe pero refund a Stripe/Conekta no está cableado. |
| **Multi-currency + `PaymentFxLock` inmutable §81** | `paidCurrency` en `PaymentLog`. Rate congelado al cobro. Reconciliación `realizedGainLoss` vs payout reports Stripe/Conekta (USALI 12ed Foreign Exchange line). | Tulum/Cancún 40-60% guests USD. Cumple Art. 20 CFF para CFDI 4.0. |
| **Banxico SF43718 integration §83** | Cron diario 12:00 CST → fetch FIX (token gratuito, 40k consultas/día). Fallback Open Exchange Rates. | Mismo rate que el SAT acepta. CFDI 4.0 lo exige. |
| **OTA-collect detection §87** | Channex `payment_collect` flag → `GuestStay.paymentModel: HOTEL_COLLECT \| OTA_COLLECT \| HYBRID_DEPOSIT`. `confirmCheckin` no exige balance pagado en OTA-collect. | Mews tiene gap aquí (feature request abierto desde hace años). Cloudbeds sí lo tiene. Evita doble cobro + chargeback Visa. |
| **Cash drawer multi-divisa §85** | `CashierShift` con `openingFloat/expectedClose/actualClose/variance` `Json {MXN, USD, EUR}`. Toda transacción cash requiere shiftId activo. Variance > umbral exige razón + approval SUPERVISOR. | Caso real Hotel Monica Tulum: cobrar 100 USD, devolver 360 MXN, aceptar 50 EUR — todos en el mismo turno. Patrón AHLEI / USALI Section 12. |
| **`GuestCredit` § 86 / §90** | Entidad de primera clase. Origins: EARLY_CHECKOUT, CANCELLATION_GOODWILL, SERVICE_RECOVERY, OVERPAYMENT, RATE_ADJUSTMENT, MANUAL. Audit append-only. Default `applicableChannels=['DIRECT']`. Aplicable solo intra-LegalEntity. | Ningún PMS premium tiene esto core — diferenciador frente a Mews/Opera (que dependen de VoucherCart add-on que cobra extra al hotelero). |
| **Aprobación gerencial para COMPs** | Cortesía (cargo $0) requiere `approvedById` + razón. Backend-enforced, no solo UI. | Anti-fraude — recepcionista no comp solo. CLAUDE.md §Sprint 8E. |

**Estimado v1.0.1: ~9.5 semanas (vs. estimación previa 3-4 sem — refleja scope completo de cobros LATAM-grade).**

### v1.0.2 · CFDI-CORE — Facturación electrónica México

> No es el "módulo Books" completo (eso es v1.3.x). Es **el cobro fiscal mínimo** para que el hotel emita CFDI sin contratar a un contador para procesarlos a mano.
>
> **Scope refinado 2026-05-15:** integrado con decisiones §82, §84, §86, §89 (ver [14-payment-currency-tax-architecture.md](14-payment-currency-tax-architecture.md)).

**Lo que entra (Core BASE para MX; adapters CO/PE/CR son DLC tier Pro):**

| Feature | Definición | Por qué importa |
|---------|------------|-----------------|
| **`MxCfdi40Adapter` PAC integration §89** | Strategy pattern. Conecta a Facturama o SW Sapien (PACs autorizados SAT) — genera XML CFDI 4.0 firmado y timbrado. Cada `FiscalRegime` tiene su `pacAdapterClass`. | Sin PAC, no hay factura legalmente válida en México. CFDI 4.0 obligatorio desde 2023. |
| **CFDI 4.0 desde el folio** | Botón "Solicitar factura" en folio → captura RFC + CURP + uso CFDI (G03, P01, etc) → envía a PAC → recibe XML + PDF con QR. | 1-2 minutos vs. 15-20 minutos hoy con sistema externo. |
| **Complemento de Pago (REP)** | Cuando el huésped paga en parcialidades o post-checkout, generar REP que liga el pago al CFDI original. **Usa `PaymentFxLock` para TipoCambio del día del pago, no de la factura** (§83). | Requisito SAT desde 2021 — sin esto, declaración mensual falla. |
| **Cancelación CFDI 4.0** | Cuando hay un error, cancelar la factura desde la UI. Requiere aceptación SAT (motivos 01/02/03/04). | Hoy en hotelería, el contador del cliente lo hace manualmente cada mes. |
| **CFDI E (Egreso) para GuestCredit §86** | Cuando se emite `GuestCredit` por conversión no-monetaria: CFDI E con `FormaPago=15 (Condonación)` + `UsoCFDI=G02 (Devoluciones)` referenciando el CFDI I original. Cuando se devuelve cash/tarjeta: CFDI E con FormaPago real. | Sin esto, conversión a crédito no tiene respaldo fiscal — observación SAT garantizada. |
| **Tax engine multi-impuesto §84** | `TaxRate` con `calculation: PERCENT_OF_BASE \| FIXED_PER_ROOM_NIGHT \| FIXED_PER_PERSON_NIGHT \| UMA_MULTIPLIER \| PER_BOOKING`. `UmaValue` versionada per-country (cambia cada febrero por inflación INEGI). `TaxLine` append-only análogo a PaymentLog. | Realidad QR 2026: IVA 16% + ISH 6% + Saneamiento UMA-based ~35 MXN/persona Tulum. Sin esto, hotelero sub-declara → multa SAT. |
| **Tax strategy INCLUSIVE default §82** | `PropertySettings.taxStrategy=INCLUSIVE` para LATAM hostal/boutique. Push Channex con `is_inclusive=true` para porcentuales (IVA/ISH). DSA per-night siempre `is_inclusive=false` + disclosure obligatorio en confirmation page del OTA. | Resuelve "problema Hostelworld" — 73% de quejas post-stay por extra fees inesperados (NN/g 2023). |
| **DIAN Colombia / SUNAT Perú / Hacienda CR (DLC)** | Adapters `CoDianAdapter`, `PeSunatAdapter`, `CrHaciendaAdapter`. Activables vía Zenix Activate wizard (§77-§80). | Habilita expansión LATAM como DLC, no como BASE — monetiza el costo de mantener cada PAC. |
| **Tax-exempt guest handling** | Diplomáticos, OEA, ONU — facturación distinta sin IVA. | Edge case relevante para hoteles en CDMX y zonas turísticas con cumbres. |

**Estimado v1.0.2: ~3 semanas adicionales (vs. estimación previa 4-5 — scope MX refinado).** Adapters CO/PE/CR no se contabilizan aquí (DLC).

### v1.0.3 · REPORTS-CORE — Los 12 reportes operativos esenciales

> **Esta es la sección más larga del documento porque es la que más le falta a Zenix hoy.**
> Estudio profundo: cruzamos las listas oficiales de reportes diarios de Cloudbeds, Hotelogix, RoomKey PMS, Manager's Report de Opera Cloud, y la sección 9.4 de USALI 11th Edition. **De ~40 reportes posibles, 12 son los que el 90%+ de hoteles boutique LATAM usan diariamente.**

#### Tabla maestra de los 12 reportes

| # | Reporte | Cadencia | Usuario | Volumen estimado/mes |
|---|---------|----------|---------|----------------------|
| R1 | **Arrivals Report** | Diaria | Recepción AM | 30 ejecuciones |
| R2 | **Departures Report** | Diaria | Recepción AM | 30 ejecuciones |
| R3 | **In-House Guest List** | Diaria/On-demand | Recepción + Housekeeping | 60+ |
| R4 | **Night Audit Report** | Diaria nocturna | Auditor / gerente AM | 30 |
| R5 | **Daily Revenue Report** | Diaria nocturna | Gerente / contabilidad | 30 |
| R6 | **Cashier Shift Report** | Por turno (3/día) | Recepcionista al cerrar turno | 90 |
| R7 | **Pickup Report** | Semanal | Revenue manager | 4-5 |
| R8 | **Forecast / Pace Report** | Semanal | Revenue manager + gerencia | 4-5 |
| R9 | **Occupancy / ADR / RevPAR Report** | Mensual + on-demand | Gerencia + propiedad | 5-10 |
| R10 | **Source of Business / Channel Mix** | Mensual | Gerencia + revenue | 2-4 |
| R11 | **Tax Report (CFDI + ISH + Saneamiento)** | Mensual SAT | Contabilidad | 1-3 |
| R12 | **Manager's Daily Executive Summary** | Diaria | Director / propietario | 30 |

#### Diseño detallado de cada reporte (formato exportable Excel/CSV)

##### R1 — Arrivals Report

**Pregunta que responde:** "¿Quién llega hoy?"
**Formato:** tabla, una fila por reserva con check-in hoy
**Filtros UI:** fecha (default = hoy), estado (todas / pendientes de check-in)

| Columna CSV | Tipo | Descripción |
|-------------|------|-------------|
| `booking_ref` | string | MX-B-001-2605-0134 — referencia única visible al huésped |
| `guest_name` | string | Apellido, Nombre |
| `guest_phone` | string | WhatsApp/teléfono para pre-arrival contact |
| `room_number` | string | "203" o "A1" |
| `room_type` | string | "Junior Suite" |
| `pax_count` | integer | 2 |
| `check_in_date` | date YYYY-MM-DD | |
| `check_in_time_estimated` | time HH:MM | Por defecto 15:00, override si el huésped notificó otra hora |
| `nights` | integer | 5 |
| `check_out_date` | date | |
| `source` | string | "Booking.com" / "Direct" / "Airbnb" / "Walk-in" |
| `rate_per_night` | decimal USD | 120.00 |
| `total_amount` | decimal USD | 600.00 |
| `amount_paid` | decimal USD | 200.00 (prepago) |
| `balance_due` | decimal USD | 400.00 |
| `payment_status` | enum | PAID / PARTIAL / UNPAID / PREPAID_OTA |
| `key_type` | enum | PHYSICAL / CARD / CODE / MOBILE |
| `special_requests` | string | "Llegada tardía 23:00, cuna" |
| `vip_status` | boolean | true si returning guest 3+ veces |
| `id_document_uploaded` | boolean | true si online check-in completado |

**Por qué es el #1 reporte:** la recepcionista AM lo imprime/abre apenas llega — es el guion del día. Sin esto, lee 30 reservas individuales del calendario.

##### R2 — Departures Report

Mismo formato que R1 pero con columnas distintas:

| Columna CSV | Tipo | Descripción |
|-------------|------|-------------|
| `booking_ref` | string | |
| `guest_name` | string | |
| `room_number` | string | |
| `check_out_date` | date | |
| `check_out_time_scheduled` | time | Default 12:00, late checkout si negociado |
| `balance_due` | decimal | Saldo pendiente al checkout |
| `payment_method_preferred` | string | Tarjeta guardada / efectivo / transferencia |
| `housekeeping_status` | enum | DIRTY / READY / IN_PROGRESS — para coordinación |
| `cfdi_requested` | boolean | El huésped pidió factura |
| `cfdi_rfc` | string | RFC del huésped si solicitó |
| `keys_returned` | boolean | Tracking de devolución de llaves físicas |
| `room_inspection_completed` | boolean | Inspección anti-daños hecha |
| `next_arrival_same_day` | boolean | Cama tiene check-in mismo día (priority limpieza) |

##### R3 — In-House Guest List

| Columna CSV | Tipo |
|-------------|------|
| `booking_ref` · `guest_name` · `room_number` · `check_in_date` · `check_out_date` · `nights_elapsed` · `nights_remaining` · `balance_due` · `vip_status` · `special_requests_pending` · `housekeeping_today` (boolean — si toca limpieza hoy) | varios |

**Por qué importa:** cuando llaman a recepción "tengo a Pedro García en mi cuarto", la recepcionista lo busca aquí.

##### R4 — Night Audit Report

**Pregunta que responde:** "¿Cierre del día N: cuadran las cuentas?"
**Generado automáticamente** por `NightAuditScheduler` (CLAUDE.md §12) a la hora local del hotel.

| Sección | Contenido |
|---------|-----------|
| **Encabezado** | Hotel, fecha, hora local, auditor |
| **Resumen ocupación** | Habitaciones disponibles, vendidas, ocupación %, ADR, RevPAR, GoPAR (si POS activo) |
| **Movimientos del día** | Arrivals físicos vs esperados / Departures físicos vs esperados / No-shows procesados (con audit trail completo) / Walk-ins / Early checkouts |
| **Ingresos por concepto** | Room revenue, taxes recaudados (IVA, ISH, Saneamiento), F&B, otros — desglosado |
| **Cobros por método** | Efectivo, tarjeta Stripe, tarjeta Conekta, OXXO, transferencia, prepago OTA — totales y conteo |
| **Discrepancias** | Habitaciones con status mismatch (housekeeping dice OCCUPIED, recepción dice VACANT) |
| **CFDI emitidos** | Cantidad, total facturado, % de huéspedes que solicitaron factura |
| **Pendientes** | Folios con balance > 0 al cierre (accounts receivable) |

**CSV export:** un archivo por cada sección + un PDF consolidado timbrado.

##### R5 — Daily Revenue Report

Versión "ejecutiva" del Night Audit para revisión rápida del gerente AM.

| Columna | Tipo |
|---------|------|
| `date` · `rooms_available` · `rooms_sold` · `rooms_complimentary` · `rooms_oos_maintenance` · `occupancy_pct` · `room_revenue` · `f_b_revenue` · `other_revenue` · `total_revenue` · `taxes_collected` · `adr` · `revpar` · `mtd_room_revenue` · `mtd_avg_occupancy` · `ytd_room_revenue` · `ytd_avg_occupancy` · `variance_vs_forecast_pct` · `variance_vs_last_year_pct` | varios |

##### R6 — Cashier Shift Report (Cash Drawer Reconciliation)

**Pregunta que responde:** "Recepcionista María terminó turno 14:00-22:00, ¿cuadra su caja?"
**Generado:** al cerrar turno con `POST /v1/cashier-sessions/:id/close`.

| Sección | Detalle |
|---------|---------|
| **Apertura** | Fecha, hora, recepcionista, fondo fijo inicial (en MXN / USD por separado) |
| **Cobros del turno** | Por cada PaymentLog del turno: timestamp, guest, monto, método, referencia |
| **Voids/Refunds** | Con razón, autorizado por |
| **COMP / Descuentos** | Con razón + aprobación gerencial |
| **Cierre esperado** | Fondo + Σ efectivo cobrado − Σ refunds efectivo |
| **Cierre real declarado** | Lo que el recepcionista cuenta físicamente |
| **Discrepancia** | Real − Esperado. Si ≠ 0, requiere comentario obligatorio del supervisor |
| **Tarjeta** | Total cobrado en tarjeta (no se cuenta físicamente, viene de Stripe/Conekta API) |

**Crítico:** el reporte se firma digitalmente por el recepcionista al cerrar; el supervisor co-firma si la discrepancia supera USD 5.

##### R7 — Pickup Report

**Pregunta que responde:** "¿Cuántas reservas entraron en las últimas 24h, para qué fechas, generando cuánto revenue?"

Matriz pivot:
- **Filas:** fecha de check-in (próximos 90 días)
- **Columnas:** "On the books ayer", "On the books hoy", "Pickup (delta)", "ADR pickup", "Revenue pickup"

Esto deja ver "ayer entraron 12 reservas, 8 son para diciembre, ADR de las nuevas es 12% mayor al promedio". Crítico para revenue management.

##### R8 — Forecast / Pace Report

| Columna | Tipo |
|---------|------|
| `date` (próximos 30/60/90 días) · `rooms_otb` (on the books) · `rooms_otb_last_year_same_day` · `occupancy_forecast_pct` · `occupancy_last_year_actual_pct` · `revenue_forecast` · `revenue_last_year_actual` · `pace_pct` (relative to historical baseline) · `pickup_needed_to_match_last_year` · `compset_avg_occupancy_pct` (cuando v1.1.x compset esté disponible) | varios |

##### R9 — Occupancy / ADR / RevPAR Report

Periodo: configurable (día / semana / mes / YTD).

| Columna | Cálculo |
|---------|---------|
| `period` | "2026-05" o "Week 19 2026" |
| `rooms_available` | Σ (rooms × days) − OOO |
| `rooms_sold` | Σ noches vendidas |
| `occupancy_pct` | rooms_sold / rooms_available × 100 |
| `room_revenue` | Σ rate noche (sin impuestos) |
| `adr` | room_revenue / rooms_sold |
| `revpar` | room_revenue / rooms_available |
| `trevpar` | total_revenue / rooms_available (incluye F&B y otros) |
| `goppar` | gross operating profit / rooms_available (cuando v1.3.x Books) |

**Fórmulas estandarizadas:** USALI 11th Edition Section 9.4 ([American Hotel & Lodging Association](https://www.ahla.com/usali)).

##### R10 — Source of Business / Channel Mix

| Columna | Detalle |
|---------|---------|
| `source` | "Booking.com" / "Expedia" / "Airbnb" / "Direct (web)" / "Direct (phone)" / "Walk-in" / "Corporate" / "Travel Agent" |
| `bookings_count` | Número de reservas |
| `room_nights` | Σ noches |
| `revenue` | Σ revenue |
| `commission_estimated` | Comisión estimada (15% Booking, 18% Airbnb, 20% Expedia — configurable per-source) |
| `net_revenue` | revenue − commission |
| `share_of_total_pct` | % del total del período |

**Por qué importa:** permite tomar decisión: "Booking nos genera 60% de revenue pero después de comisión 15% solo 51%. Si invertimos en booking engine directo (v1.2.x B1), recuperamos 4-9% del revenue total."

##### R11 — Tax Report (CFDI México + ISH QRoo + Saneamiento Tulum)

Período: mensual (default), exportable a Excel para entrega al contador.

| Sección | Contenido |
|---------|-----------|
| **CFDI emitidos** | Folio fiscal, UUID, RFC receptor, fecha, subtotal, IVA, total, estado SAT (Vigente/Cancelado) |
| **REP (Complementos de Pago)** | Pagos parciales/post-checkout vinculados a CFDI original |
| **IVA recaudado** | Σ IVA en CFDI vigentes |
| **ISH recaudado** | Σ Impuesto Sobre Hospedaje (3% QRoo) |
| **Saneamiento** | Σ Saneamiento Ambiental ($4 USD × room-nights) — Tulum específico |
| **Cancelaciones** | Listado de CFDI cancelados con motivo SAT (01/02/03/04) |
| **Comparativo declaración SAT** | Total a declarar vs total declarado (cuando v1.3.x Books haga el bridge) |

##### R12 — Manager's Daily Executive Summary

**Una página, 5 KPIs grandes, formato visual.**

```
┌────────────────────────────────────────────────────────────┐
│ HOTEL MONICA TULUM — Jueves 14 May 2026                    │
├────────────────────────────────────────────────────────────┤
│ Ocupación hoy           │  78% (18/23 hab)                 │
│ ADR / RevPAR            │  USD 145 / USD 113               │
│ Revenue hoy / MTD       │  USD 2,610 / USD 31,200          │
│ Llegadas / Salidas      │  7 / 5                           │
│ Saldo pendiente total   │  USD 1,840 (3 huéspedes)         │
├────────────────────────────────────────────────────────────┤
│ Alertas:                                                   │
│ ⚠ Hab 203 tiene ticket CRITICAL — agendar reparación      │
│ ⚠ Carlos Ramirez no se presentó (2 hab, ya marcado NS)    │
│ ⚠ Tarjeta de Pedro Vega declinada — gestionar con huésped │
├────────────────────────────────────────────────────────────┤
│ Próximos 7 días:                                           │
│ Vie 15: 92% ocupación · USD 2,890 forecast                │
│ Sáb 16: 100% ocupación · USD 3,150 forecast               │
│ Dom 17: 95%  · USD 2,980                                   │
│ ...                                                        │
└────────────────────────────────────────────────────────────┘
```

**Generado:** cada mañana a las 6 AM local, enviado por email + WhatsApp al director y propietario.

#### Reportes que SÍ tenemos hoy y siguen igual

- No-show Report (R-NS) — fiscal grade, ya implementado
- Cancellation Report (R-CAN) — ya implementado
- Maintenance Report (R-MT) — ya implementado Sprint Mx-1
- Housekeeping Report (R-HK) — ya implementado Sprint 8H

#### Estimado v1.0.3 REPORTS-CORE: 6-8 semanas

Es la mayor inversión de v1.0.x porque cubre 12 reportes con UI + filtros + export Excel/CSV + permisos + scheduling de generación nocturna.

### v1.0.4 · IMG + NS-UI + DEBT-α (cleanup técnico)

- IMG: S3 + Sharp upload infrastructure (extraído del placeholder Mx-1B-W2)
- NS-UI: Toggle "Ocultar no-shows" en calendario
- DEBT-α: BLK-4 PRIVATE rooms multi-bed, MAINT-3 photo size, PAY-9 WAIVED, PUSH-11 token property scoping

**Esfuerzo:** 1-2 semanas.

### Gate de release v1.0.x

- SEC-α verificado con pen-test interno (2 cuentas en distinta propiedad)
- HK-CFG permite onboarding en ≤30 min sin asistencia técnica
- v1.0.1 cobro con tarjeta funcional sandbox + producción
- v1.0.2 emite CFDI 4.0 válido aceptado por SAT
- v1.0.3 los 12 reportes generan + exportan a Excel sin errores
- DoD: latencia SSE <5s, CRITICAL→auto-block 100%, ≥150 tests verdes, 0 TS errors

### Streams activos
R1 (PMS subscription), R14 (consulting), **R1+ (PMS Pro tier con pagos/CFDI/reportes)**.

---

## 3. v1.1.x — Hotel Operation Excellence (Q4 2026 - Q1 2027)

### Misión
**Excelencia operativa.** Funcionalidades que un hotel boutique ejecuta 50-100 veces al día y que el competidor (Mews, Cloudbeds, Zavia, Opera) tienen y nosotros no — descubiertas en el estudio comparativo de mayo 2026.

### Subdivisión en minors

| Minor | Foco | Esfuerzo |
|-------|------|----------|
| **v1.1.0** | Mensajería OTA (Booking.com) + Online check-in + Digital signature | 6-8 sem |
| **v1.1.1** | IA tarifaria heurística + Pickup/Pace reports avanzados | 4-5 sem |
| **v1.1.2** | Group reservations + Master billing + Folio splitting refinado | 4-5 sem |
| **v1.1.3** | Mensajería Airbnb + Expedia + Upsell engine | 5-6 sem |
| **v1.1.4** | Guest CRM-lite + Concierge log + Lost & Found + Day-use + Late checkout fees | 4-5 sem |

### Features por minor — definiciones a detalle

#### v1.1.0 — Comunicación OTA + Llegada Pre-Configurada

**A1 · Mensajería OTA centralizada (Booking.com)**
- **Qué es:** bandeja única dentro del PMS donde llegan mensajes del Booking Inbox de cada reserva.
- **Cómo funciona:** webhook del Booking.com Messaging API → tabla `GuestMessage { stayId, channel, direction, content, sentAt, externalMessageId }` → UI tipo Slack timeline pegado a `BookingDetailSheet`.
- **Por qué importa:** recepcionista deja de abrir Booking Extranet 30 veces al día — gana 30 min/día. Tiempo de respuesta < 30 min mejora ranking Booking (penalización si >24h).
- **Fuente:** Booking.com Connectivity Partner Program docs.

**A3 · Online check-in / Pre-arrival registration form**
- **Qué es:** link único enviado al huésped 48h antes del check-in. Captura: datos personales completos, passport upload (foto), país, propósito de viaje, hora estimada de llegada, preferencias de cuna/almohada.
- **Por qué importa:** reduce 60-80% del tiempo en mostrador. El recepcionista solo confirma identidad física y entrega llave. Captura el RFC para CFDI upfront.

**A4 · Digital signature en registration card**
- **Qué es:** el huésped firma con dedo/mouse en pantalla. La firma queda asociada al registro con timestamp + IP + hash inmutable.
- **Por qué importa:** evidencia legal LFPDPPP (consentimiento de datos personales) + Visa §5.9.2 (evidencia chargeback). Sin firma física no podemos disputar.

#### v1.1.1 — Revenue Management Heurístico

**A2 · IA tarifaria — fase heurística**
- **Qué es:** servicio `apps/api/src/pricing/` que computa **tarifa sugerida** por habitación-noche basado en reglas:
  - +X% si ocupación >80% para esa fecha
  - +Y% si fecha es viernes/sábado/festivo
  - +Z% si hay evento local (configurable)
  - −W% si stay length >5 noches (estancia larga)
- **Output:** tabla `RoomRateSuggestion { roomId, date, suggestedRate, modelVersion: 'heuristic-v1', factors: [], appliedAt? }`. UI con curva temporal mostrando precio sugerido vs precio aplicado.
- **Por qué importa:** primer paso hacia revenue management. +5-8% RevPAR estimado solo con reglas heurísticas (Cornell Center for Hospitality Research, 2022).
- **NOTA:** fase ML real (XGBoost) se posterga a v1.4.x Data & AI Platform cuando tengamos ≥6 meses de histórico del piloto.

**Pickup / Pace reports avanzados**
- Versiones interactivas (no solo CSV export) con drill-down por fecha, segment, source.
- Comparativos mismo período año anterior.

#### v1.1.2 — Operación grupal y corporativa

**A6 · Group reservations / Event blocks**
- **Qué es:** modelo `GroupBlock { id, hotelId, eventName, leadGuestName, startDate, endDate, roomsAllocated, ratePerRoom, cutoffDate, status }`. Asigna N habitaciones a un grupo (boda, congreso, retiro) con tarifa especial.
- **Funcionalidades:** rooming list (lista de huéspedes individuales del grupo), cutoff date (después de esa fecha las habitaciones no asignadas vuelven al inventario), single folio para el grupo o folios separados por habitación, depósito de garantía configurable.
- **Por qué importa:** segmento bodas + eventos = 15-25% del revenue en boutique Riviera Maya según AHLEI 2023.

**A8 · Master billing corporativo (cleanup desde v1.0.1)**
- Empresa "Acme Corp" tiene 5 viajeros en marzo. Una factura consolidada mensual con desglose.

**A7 · Folio splitting (refinamiento)**
- Ya planeado en v1.0.1, este minor agrega UI completa con drag-and-drop de cargos entre folios hijos.

#### v1.1.3 — Comunicación OTA expandida + Upsell

**Mensajería Airbnb + Expedia**
- Igual que Booking.com pero con sus APIs (Airbnb Messaging v2, Expedia Partner Messaging).

**A5 · Upsell engine al check-in**
- **Qué es:** al hacer check-in, sistema muestra al recepcionista "¿Quiere ofrecer upgrade a Junior Suite por +USD 30/noche?" con lógica:
  - Hay Junior Suite disponible para todas las noches de la estadía
  - Diferencia de precio < 50% del rate original
  - Estadía ≥ 2 noches
- **Por qué importa:** Cloudbeds reporta +6-12% revenue per stay con upsell automatizado.
- **Fuente:** [Cloudbeds Upsell case studies](https://www.cloudbeds.com/articles/hotel-upselling-strategies/).

#### v1.1.4 — Operación detallada del día a día

**A9 · Guest CRM-lite**
- **Qué es:** `GuestProfile { id, primaryEmail, totalStays, totalRevenue, lastStayDate, preferences: { pillow, dietary, allergies }, vipFlag, notes[] }`. Se llena automáticamente con cada reserva del mismo email/teléfono.
- **Por qué importa:** "Carlos visita por 3a vez" → sistema sugiere "prefiere almohada extra firme + jugo de naranja en desayuno". Genera lealtad sin programa de puntos formal.

**A15 · Concierge / Guest request log**
- **Qué es:** modelo `GuestRequest { stayId, type, description, status, createdBy, slaTarget, completedAt }`. Tipos: TOWELS_EXTRA, TAXI, RESTAURANT_RECOMMENDATION, MAINTENANCE, CHECK_IN_LATE, CUSTOM.
- SLA visible por tipo de request. Asignable a staff. Push al staff asignado.
- **Por qué importa:** convierte conversaciones perdidas (WhatsApp, llamada) en tickets trazables.

**A14 · Lost & Found tracking**
- Tabla `LostItem { foundAt, location, description, photo, foundBy, claimedBy, claimedAt, status }`. Cuando huésped llama "olvidé mi reloj", el recepcionista busca por descripción + fecha + room.

**A12 · Day-use rates**
- **Qué es:** modalidad de venta sin pernocte (ej. 9 AM - 6 PM). Para business travelers, parejas, reuniones.
- Modelo: nueva `BookingType.DAY_USE`. Rate independiente. No impacta night audit (no es ocupación nocturna). Genera revenue.
- **Por qué importa:** segmento creciente en CDMX y Cancún para business meetings. +3-5% revenue total.

**A11 · Late checkout fee + Early arrival pricing**
- **Qué es:** reglas configurables:
  - Late checkout after 14:00 = +50% rate
  - Late checkout after 18:00 = +100% rate (cuenta como otra noche)
  - Early arrival before 9:00 = +30% rate
- Aplicación automática al folio si el guest extiende.
- **Por qué importa:** revenue "no operativo" que recepcionistas hoy olvidan cobrar 40-60% del tiempo.

### Categoría B — Distribución que va en v1.1.x también

Algunos features de "Scale & Distribution" caben aquí porque son cobranza interna (no escala):

**C1 · Tax engine multi-impuesto (ya en v1.0.2 CFDI-CORE)** — refinamiento para casos edge (impuestos federales vs estatales).

**B6 · Commission management para travel agents**
- **Qué es:** agencias offline frecuentes en LATAM ("Despegar el Viajero" en Tulum). Sistema calcula y agenda pago de comisión por reserva.
- **Por qué importa:** travel agents = ~10% revenue en boutique caribeño y hoy se administra a mano.

### Features que NO entran en v1.1.x — y por qué

> **Honestidad sobre decisiones de scope.** Listamos lo descartado con razón explícita.

| Feature descartado | Razón |
|--------------------|-------|
| **A13 · Wake-up call & breakfast preferences** | No agrega valor diferenciador. Hoteles boutique tienen ≤30 hab — recepcionista lo lleva en libreta o WhatsApp. Volver a esto en v1.4.x si demanda real surge. |
| **E1 · Spa / Wellness appointments** | Solo aplica a hoteles con spa. Hotel Monica Tulum no tiene. Va a v1.3.x Ancillary. |
| **E2 · Activities / Tours integration** | Mismo razonamiento — segmento específico, v1.3.x. |
| **E3 · Laundry tracking** | Cabe en v1.3.x Ancillary o se outsource a TPV externo. Demanda baja según research. |
| **D8 · API pública para developers del hotel** | El 99% de hoteles boutique no tienen developers internos. Va a v1.2.x cuando partners certificados lo necesiten. |

### Gate de release v1.1.x
- Mensajería Booking.com con tiempo de respuesta promedio < 30 min en piloto
- Online check-in adoptado por ≥50% de huéspedes internacionales
- IA tarifaria sugiere precios aceptados por revenue manager ≥70% de las veces
- Group reservations crean rooming lists sin errores
- 0 TS errors + tests verdes

### Streams activos
R1 PMS, R1+ PMS Pro, **R15 (Operation Excellence add-on tier)**.

---

## 4. v1.2.x — Scale & Distribution (Q2-Q3 2027)

### Misión
**Crece a cadena multi-property + reduce dependencia OTA.** El hotelero que ya pagó 6 meses de Zenix decide abrir una segunda propiedad O quiere reducir comisiones del 18% que paga a Booking. Esta versión habilita ambos.

### Subdivisión

| Minor | Foco | Esfuerzo |
|-------|------|----------|
| **v1.2.0** | RBAC-UI + Cross-property reports + Data consent | 4-5 sem |
| **v1.2.1** | Partner Network + Partner Portal | 5-6 sem |
| **v1.2.2** | Booking Engine propio del hotel + Direct booking incentives | 4-5 sem |
| **v1.2.3** | Marketplace de integraciones + API pública v1 + Rate parity monitoring | 5-7 sem |

### Features

**v1.2.0 — Multi-tenant maduro**
- **RBAC-UI:** página `/settings/permissions` con matrix role × feature. AUDITOR read-only. Renombrar StaffRole + crear `StaffRole.TECHNICIAN` real.
- **CROSS-PROP:** endpoint `GET /v1/reports/cross-property`. Página `/dashboard/organization` con KPIs sumados + comparativa per-property. Org-tree viz tipo SuccessFactors.
- **DATA-CONSENT:** schema fields `Property.consentToAggregation`, `GuestStay.guestConsentSnapshot`. UI doble consent (hotel autoriza agregación + huésped autoriza en check-in).

**v1.2.1 — Partner Network**
- **PARTNER-PORTAL:** nueva app `apps/partner` (React + Vite). CRM partner + multi-hotel pipeline + white-label parcial + billing dashboard.
- **PARTNER-CERT:** programa certificación Bronze/Silver/Gold/Platinum. Training online + práctico.

**v1.2.2 — Direct booking power**

**B1 · Booking Engine propio**
- **Qué es:** widget JS embebible en la web del hotel. Buscador de fechas → muestra habitaciones disponibles → checkout con Stripe/Conekta sin pasar por OTA.
- **Pricing:** mismo motor que el calendario interno usa (AvailabilityService).
- **Por qué importa:** **el feature más rentable de v1.2.** Hotel que mueve 20% del revenue de Booking a direct ahorra USD 3,600/mes en un hotel de 30 hab × USD 120 ADR × 70% ocupación. **Paga la suscripción Zenix entera 12 veces.**

**B4 · Member rates / Loyalty discounts**
- "Reserva directa = 10% descuento + early check-in gratis". Configurable per-property.

**B5 · Best rate guarantee**
- Promesa pública: si el huésped encuentra precio menor en otra OTA, hotel matchea + bonus. Habilita conversión web.

**v1.2.3 — Platform**

**Marketplace de integraciones**
- App registry + OAuth2 + scopes granulares + webhook dispatcher con retries.
- Primeros conectores: Stripe (ya), Conekta (ya), Mailchimp, TripleSeat (banquetes), Lightspeed (POS), Quore (maintenance externo).

**API pública v1**
- Documentación tipo Stripe Docs. SDK JavaScript + Python. Sandbox.

**B3 · Rate parity monitoring**
- Crawl diario de los precios que tu hotel muestra en Booking/Expedia/Airbnb. Alert si diverge >X% del precio direct.

### Features descartadas de v1.2

| Feature | Razón |
|---------|-------|
| **B2 · GDS/CRS connectivity (Amadeus, Sabre)** | Audiencia corporate travel — hoteles >100 hab. Hotel Monica Tulum (60 hab) no lo necesita. Posponer a v2.0+ o feature externa via marketplace. |
| **D5 · Channel parity dashboard** | Función avanzada de revenue. Va a v1.4.x Data & AI Platform donde tiene contexto. |
| **B8 · Multi-currency display refinado** | v1.0.1 ya tiene básico. Refinamiento avanzado (símbolo dinámico, tipo de cambio histórico) va a v1.4.x. |

### Streams activos
R10 Insights, R13 Partner license, R14 escalado, **R1++ (Multi-property tier)**.

---

## 5. v1.3.x — Ancillary Modules (Q4 2027 - Q4 2028)

### Misión
**El hotel deja de pagar 5 softwares distintos.** Reemplaza POS de restaurante, software de compras, app de huésped, cerraduras, HR, contabilidad.

### Subdivisión

| Minor | Módulo | Trigger comercial | Esfuerzo |
|-------|--------|-------------------|----------|
| **v1.3.0** | **Zenix POS** (restaurante + bar) | Hotel con F&B operativo | 8-10 sem |
| **v1.3.1** | **Zenix Procure** (compras + inventario + COGS) | POS lleno, quieren control de COGS | 10-12 sem |
| **v1.3.2** | **Zenix Stay** (Guest App con NFC) | Boutique upscale quiere diferenciar | 8-10 sem |
| **v1.3.3** | **Zenix Access** (cerraduras NFC + BLE white-label OEM) | Hotel quiere reemplazar card-keys | 12-16 sem (hardware) |
| **v1.3.4** | **Zenix People** (HR + nómina + ausentismo) | Cliente sufre rotación 40%+ | 10-12 sem |
| **v1.3.5** | **Zenix Books** (contabilidad nativa USALI 12ed) | Cliente quiere salir de SAP B1/Xero | 12-14 sem |

### Detalles por módulo

Cada módulo tiene su documento propio:
- **POS:** [docs/vision/04-module-pos.md](04-module-pos.md)
- **Procure:** [docs/vision/05-module-procure.md](05-module-procure.md)
- **Stay + Access:** [docs/vision/06-module-stay-access.md](06-module-stay-access.md)
- **People:** [docs/vision/07-module-people.md](07-module-people.md)
- **Books:** [docs/vision/08-module-books.md](08-module-books.md)

### Países iniciales por módulo
- **POS / Procure:** producto neutro, lanza global
- **People:** v1.3.4 inicial México (IMSS, INFONAVIT, SAT) + Colombia (EPS, ARL, Cesantías, ICBF)
- **Books:** v1.3.5 inicial México (CFDI 4.0 — ya hecho en v1.0.2) + Colombia (DIAN)

### Riesgos críticos
- **Access (cerraduras):** capital de trabajo para inventario. Modelo pre-orden 50% como mitigación inicial.
- **Books:** lock-in máximo del cliente — una vez en Books, no migran. Justifica el esfuerzo.

### Streams activos
R2 POS, R3 Procure, R4 Stay free, R5 NFC consumibles, R6 hardware Access, R7 maintenance Access, R8 People, R9 Books.

---

## 6. v1.4.x — Data & AI Platform (2029)

### Misión
**Monetiza los datos del ecosistema.** ZaharDev firma su primer contrato ABI con una OTA o tourism board.

### Subdivisión

| Minor | Foco | Esfuerzo |
|-------|------|----------|
| **v1.4.0** | IA tarifaria ML real (no heurística) + Demand forecasting | 12-16 sem |
| **v1.4.1** | Channel parity dashboard + Compset benchmarking | 6-8 sem |
| **v1.4.2** | Marketplace B2B (Procure cross-property) | 10-12 sem |
| **v1.4.3** | ABI External (data licensing API) | 14-18 sem |
| **v1.4.4** | AI predictivo housekeeping (Optii-like routing) + Cultural insights dashboard | 12-14 sem |

### Features clave

**IA tarifaria ML real**
- XGBoost / Prophet trained on ≥18 meses de histórico cross-property
- Variables: ocupación, día semana, festivos, eventos, weather forecast, compset prices, lead time

**ABI External (Augmented Business Intelligence)**
- Endpoints para clientes externos (OTAs, aerolíneas, tourism boards, REITs)
- Auth tier separado (no JWT first-party)
- Audit trail comercial completo

**Trigger comercial**
- ≥50 propiedades activas con consent
- ≥2 contratos ABI piloto firmados

### Streams activos
R11 Marketplace commissions, R12 ABI Data Licensing.

---

## 7. v2.0 — Architectural Rewrite (estimado 2030+)

### Misión
**Rewrite arquitectónico real.** No es feature expansion — es:
- Multi-region database (Postgres → CockroachDB o sharded Postgres)
- Monolito NestJS → GraphQL federation con microservicios por bounded context
- Migración de single-tenant logical → multi-tenant físico
- Refactor de cualquier deuda técnica acumulada en 4-5 años

### Trigger
- ≥200 propiedades activas
- Latencia P95 de queries cross-property >2s
- Equipos de partners externos requieren GraphQL federation

### Comunicación al mercado
"Zenix 2.0 — la mejor versión de Zenix con la misma alma." Migración transparente para clientes existentes.

---

## 8. Timeline visual

```
2026 Q2 ─ v1.0.0 ─── SEC-α + HK-CFG + POLISH + QA ──────── 🚀 PILOTO Hotel Monica Tulum
2026 Q3 ─ v1.0.1 ── PAY-CORE (Stripe + Conekta + folio + master billing)
2026 Q4 ─ v1.0.2 ── CFDI-CORE (PAC + complementos + tax engine MX/CO/PE)
2026 Q4 ─ v1.0.3 ── REPORTS-CORE (los 12 reportes operativos esenciales)
2027 Q1 ─ v1.0.4 ── IMG + NS-UI + DEBT-α
        ─ v1.1.0 ── Mensajería Booking + Online check-in + Digital signature
2027 Q2 ─ v1.1.1 ── IA tarifaria heurística + Pickup/Pace avanzados
        ─ v1.1.2 ── Group reservations + Master billing refinado
2027 Q3 ─ v1.1.3 ── Mensajería Airbnb + Expedia + Upsell engine
        ─ v1.1.4 ── Guest CRM + Concierge + Lost&Found + Day-use + Late fees
2027 Q4 ─ v1.2.0 ── RBAC-UI + Cross-property + Data consent
        ─ v1.2.1 ── Partner Network + Portal + Certificación
2028 Q1 ─ v1.2.2 ── Booking Engine propio + Direct booking incentives
        ─ v1.2.3 ── Marketplace + API pública + Rate parity
2028 Q2 ─ v1.3.0 ── Zenix POS launch
2028 Q3 ─ v1.3.1 ── Zenix Procure launch
2028 Q4 ─ v1.3.2 ── Zenix Stay (Guest App)
2029 Q1 ─ v1.3.3 ── Zenix Access (cerraduras white-label)
2029 Q2 ─ v1.3.4 ── Zenix People (HR — MX + CO inicial)
2029 Q3 ─ v1.3.5 ── Zenix Books (contabilidad — MX + CO inicial)
2029 Q4 ─ v1.4.0 ── IA tarifaria ML real + Demand forecasting
2030 Q1 ─ v1.4.1 ── Channel parity + Compset
2030 Q2 ─ v1.4.2 ── Marketplace B2B
2030 Q3 ─ v1.4.3 ── ABI External
2030 Q4 ─ v1.4.4 ── AI predictivo housekeeping + Cultural insights
2031+   ─ v2.0   ── Rewrite arquitectónico cuando ≥200 propiedades
```

**Cadencia:** ~1 minor cada 2-3 meses. Bloques v1.x.y de ~9-12 meses cada uno.

---

## 9. Dependencias críticas entre bloques

```
v1.0.x Foundation ──┬──→ v1.1.x Operation Excellence ──┬──→ v1.2.x Scale & Distribution
                    │                                  │
                    └──→ (datos para reports → IA)     └──→ v1.3.x Ancillary Modules
                                                            │
                                                            ▼
                                                       v1.4.x Data & AI
                                                            │
                                                            ▼
                                                       v2.0 Architectural Rewrite
```

**Lecturas:**
- v1.1.x depende de Foundation (Payments + Reports + CFDI) — no antes
- v1.2.x depende de v1.1.x (operation excellence valida product-market fit antes de escalar)
- v1.3.x módulos pueden ir en paralelo entre sí pero Books necesita data POS + Procure
- v1.4.x necesita base instalada + consent maduro (v1.2.x)
- v2.0 es rewrite — no antes de tener escala real

---

## 10. Bitácora de revisiones

- **2026-05-15** — **Refinamiento PAY-CORE / CFDI-CORE.** Tras investigación competitiva de 5 PMS premium (Mews, Cloudbeds, Opera Cloud, Roomraccoon, Little Hotelier), se consolidaron 9 sub-módulos arquitectónicos en nuevo doc [`14-payment-currency-tax-architecture.md`](14-payment-currency-tax-architecture.md). Decisiones §81-§90 agregadas a CLAUDE.md. Scope v1.0.1 PAY-CORE expandido de 3-4 a ~9.5 semanas (refleja realidad LATAM-grade: multi-currency + FX lock, OTA-collect detection, cash drawer multi-divisa, Banxico integration, GuestCredit con CFDI E). Scope v1.0.2 CFDI-CORE refinado a ~3 semanas para MX core; CO/PE/CR adapters reclasificados como DLC tier Pro activables vía Zenix Activate.
- **2026-05-14** — **Refactor mayor de versionado.** De "versiones individuales secuenciales (v1.0→v2.0)" a "bloques temáticos (v1.0.x → v1.4.x + v2.0 reservado para rewrite)". Justificación: análisis comparativo con Mews/Stripe/Salesforce/Cloudbeds confirmó que ninguna bumpea major por feature expansion. Re-integrados 25+ features descubiertos en estudio comparativo (mensajería OTA centralizada, IA tarifaria, online check-in, group reservations, day-use, master billing corporativo, guest CRM, concierge log, lost&found, late checkout fees, booking engine propio, rate parity, marketplace integrations, etc.). v1.0.x expandido con PAY-CORE + CFDI-CORE + REPORTS-CORE como funcionalidades NO opcionales del foundation. Features descartadas: wake-up calls, spa appointments básico (queda en Ancillary), GDS/CRS connectivity, laundry tracking.
- **2026-05-13** — Documento creado. Roadmap consolidado v1.0 → v2.0 con 12 versiones. Agregados People (v1.7) y Books (v1.8) tras conversación de visión Zenix↔ZaharDev. POS movido antes que Procure (high customer demand wedge).
