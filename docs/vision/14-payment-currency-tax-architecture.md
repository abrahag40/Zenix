# 14 — Payment, Currency & Tax Architecture

> **Audiencia:** Producto + ingeniería + comercial. **Versión objetivo:** v1.0.1 PAY-CORE + v1.0.2 CFDI-CORE.
> **Estado:** propuesta arquitectónica aprobada — **FX core parcialmente adelantado en v1.0.0 (PR #32)**.
> **Última actualización:** 2026-05-16.
>
> Este documento consolida la arquitectura de **10 sub-módulos** (A-J) de gestión de cobros, divisas, impuestos y reembolsos para Zenix. Reemplaza decisiones dispersas en CLAUDE.md y refina el scope de v1.0.1 y v1.0.2 del [roadmap](03-roadmap-v1-v2.md).

## ✅ Adelantado en v1.0.0 — Sprint 3-LEVEL Rates (PR #32 mergeado 2026-05-16)

Los siguientes componentes del PAY-CORE/CFDI-CORE fueron **adelantados** desde v1.0.1 a v1.0.0 porque el sprint de rate display necesitaba conversión de divisas:

- **A · Multi-currency** → Tabla `ExchangeRate` creada (inmutable, snapshot diario) + `PropertyFxRate` override comercial del hotel (rate absoluto o spread relativo). `PaymentFxLock` permanece sembrado para v1.0.1 (atomic lock at payment time).
- **D · Banxico + Open Exchange Rates** → `FxService.refreshBanxicoDaily` con `@Cron 13:00 CST 'America/Mexico_City'` SF43718 FIX. Fallback OER pendiente para v1.0.1. Endpoint `POST /v1/fx/refresh-banxico` para refresh manual admin.
- **I · FxAdvisor (DLC)** → Dashboard widget `FxRateWidget` muestra Banxico oficial vs Hotel interno con delta percent. Settings UI tab "Tipo de cambio" en `/settings/fx` permite supervisor editar override.

**Lo que NO se adelantó** (sigue planeado para v1.0.1+):
- B (OTA-collect detection) — requiere Channex inbound formal
- C (Cash drawer multi-divisa + CashierShift)
- E (Card payments + 3DS — Stripe/Conekta)
- F (Cortes de caja USALI Sec 12)
- G (Tax engine multi-impuesto)
- H (Tax transparency OTA)
- J (Tax catalog nativo curado)

Decisiones registradas: CLAUDE.md §103 (FX-CORE detalles).

---

## Resumen ejecutivo

Zenix opera en LATAM tourist zones (Tulum, Cancún, Bogotá, Cartagena, Cuzco) donde el huésped paga en USD o moneda local indistintamente, donde cada estado tiene su impuesto sobre hospedaje, donde las OTAs cobran impuestos parciales o nulos, y donde una conversión a crédito futuro requiere CFDI de Egreso para no quedar expuesto a observación SAT.

**Hallazgo central de la investigación competitiva (Mews · Cloudbeds · Opera Cloud · Roomraccoon · Little Hotelier):**

1. **Ningún PMS premium tiene Guest Credit de primera clase** con expiración configurable, audit trail y respaldo fiscal LATAM. Mews y Opera lo resuelven con add-on de marketplace (VoucherCart — cobra extra al hotelero). Roomraccoon es el más cercano (booker profile balance) pero sin garantías fiscales.
2. **Mews todavía no distingue OTA-collect vs Hotel-collect.** Tiene feature request abierto. Cloudbeds sí. Gap competitivo claro.
3. **Cloudbeds tiene cash drawer multi-divisa nativo;** Mews lo tiene limitado. Otro diferenciador.
4. **Ningún PMS recomienda activamente al cajero qué divisa cobrar** (USD efectivo vs MXN tarjeta vs USD tarjeta). Oportunidad diferencial alta — margen 2-5% por decisión correcta.

**Veredicto de packaging:**

| Tier Zenix | Módulos incluidos |
|---|---|
| **Zenix Core (todos los planes)** | Multi-currency + FX lock · OTA-collect detection · Cash drawer multi-divisa · Tax engine MX (IVA + ISH + DSA + CFDI 4.0) · GuestCredit con CFDI E |
| **Zenix Pro (DLC)** | FxAdvisor (recomendación al cajero) · Tax adapters por país (CO, PE, CR, etc.) · Reportes de aging de créditos |
| **Zenix Enterprise** | FX Gain/Loss USALI line · Multi-LegalEntity consolidation · Audit-grade traces |

Todos los módulos Core son **BASE no-negociables** para v1.0.0 Foundation. Sin ellos Zenix no es viable comercialmente en LATAM.

---

## Segmentación — 9 sub-módulos

| # | Módulo | Versión | Tier | Esfuerzo |
|---|---|---|---|---|
| A | Multi-currency + FX lock | v1.0.1 | Core | 2 semanas |
| B | OTA-collect vs Hotel-collect detection | v1.0.1 | Core | 1 semana |
| C | Cash drawer multi-divisa + Shift reconciliation | v1.0.1 | Core | 1.5 semanas |
| D | Banxico/Open Exchange Rates integration | v1.0.1 | Core | 0.5 semanas |
| E | Card payments (Stripe + Conekta) | v1.0.1 | Core | 2 semanas (ya planificado) |
| F | GuestCredit (early checkout / no-refund policy) | v1.0.1 | Core | 2.5 semanas |
| G | Tax engine multi-impuesto (MX) | v1.0.2 | Core | 2 semanas |
| H | Tax transparency hacia OTA (inclusive vs exclusive) | v1.0.2 | Core | 1 semana |
| I | FxAdvisor — recomendación al cajero | v1.1.x | **DLC** | 1.5 semanas |

**Total Core v1.0.1 PAY-CORE:** ~9.5 semanas ingeniería.
**Total Core v1.0.2 CFDI-CORE:** ~3 semanas adicionales + adapters PAC.

---

## A · Multi-currency + FX lock

### Problema

En Tulum el 40-60 % de huéspedes paga en USD a un hotel cuya moneda base es MXN. El CFDI debe reflejar el tipo de cambio del día de la operación (Art. 20 CFF). USALI 12 ed. exige rastrear FX Gain/Loss entre rate de cobro y rate de settlement.

### Solución arquitectónica

**`ExchangeRate`** — tabla versionada per-country con múltiples fuentes (Banxico FIX, Open Exchange Rates, override manual, Stripe reported).

**`PaymentFxLock`** — generado atómicamente con cada `PaymentLog` cuya `paidCurrency ≠ propertyDefaultCurrency`. El rate se **congela** al momento del cobro y nunca se reescribe. Cuando llega el payout report de Stripe/Conekta, se conmilia `realizedGainLoss` en una línea separada.

```prisma
model ExchangeRate {
  id              String   @id @default(cuid())
  source          ExchangeRateSource
  baseCurrency    String   @db.VarChar(3)
  targetCurrency  String   @db.VarChar(3)
  rate            Decimal  @db.Decimal(18, 8)
  markupPercent   Decimal? @db.Decimal(5, 4)
  validFrom       DateTime
  validTo         DateTime?
  legalEntityId   String?
  propertyId      String?
  fetchedAt       DateTime @default(now())
  rawPayload      Json?

  @@index([baseCurrency, targetCurrency, validFrom])
  @@index([legalEntityId, propertyId])
}

enum ExchangeRateSource {
  BANXICO_FIX
  BANXICO_LIQUIDATION
  OPEN_EXCHANGE_RATES
  ECB
  MANUAL_OVERRIDE
  STRIPE_REPORTED
}

model PaymentFxLock {
  id              String   @id @default(cuid())
  paymentLogId    String   @unique
  guestStayId     String
  exchangeRateId  String
  baseCurrency    String   @db.VarChar(3)
  paidCurrency    String   @db.VarChar(3)
  rateUsed        Decimal  @db.Decimal(18, 8)
  source          ExchangeRateSource
  amountBase      Decimal  @db.Decimal(18, 4)
  amountPaid      Decimal  @db.Decimal(18, 4)
  lockedAt        DateTime @default(now())
  realizedGainLoss Decimal? @db.Decimal(18, 4)
}
```

### Justificación

- **CFDI 4.0** acepta el `TipoCambio` del FIX publicado en DOF el día de la operación (Art. 20 CFF). Si después cambia, no se reescribe el CFDI emitido.
- **USALI 12 ed.** introduce línea explícita "Foreign Exchange Gain/Loss" en Statement of Income; el campo `realizedGainLoss` la alimenta directo.
- **Patrón inmutable** análogo a `PaymentLog` (§28 PaymentLog append-only) — coherente con la disciplina fiscal del resto del PMS.

---

## B · OTA-collect vs Hotel-collect detection

### Problema

En reservas Booking Genius / Expedia Collect / Hotelbeds el merchant of record es la OTA. El hotel recibe payout neto al cierre de periodo descontando comisión, y **no debe cobrar al check-in**. En Hotel-collect el hotel es merchant. Confundirlos genera doble cobro al huésped y reclamos vía Visa/Mastercard.

### Solución

Channex (§37) ya entrega un flag `payment_collect` en el booking payload. Se persiste en:

```prisma
model GuestStay {
  // ... campos existentes
  paymentModel    PaymentCollectModel  @default(HOTEL_COLLECT)
  otaVirtualCardId String?  // ref al token de la VCC cuando Booking entrega tarjeta virtual
}

enum PaymentCollectModel {
  HOTEL_COLLECT
  OTA_COLLECT
  HYBRID_DEPOSIT  // OTA cobra depósito + hotel cobra balance
}
```

**Comportamiento downstream:**

- `OTA_COLLECT` → `confirmCheckin` no requiere balance pagado (Sprint 8E guard ya implementado se mantiene). Folio se marca "paid via OTA virtual card / pending reconciliation".
- `HOTEL_COLLECT` → flujo normal de cobro.
- `HYBRID_DEPOSIT` → balance = totalCharges − depositReceived.

### Diferenciador competitivo

Mews tiene esto como **feature request abierto desde hace años**. Cloudbeds lo tiene como UI explícito. Zenix lo entrega en v1.0.1 como BASE.

---

## C · Cash drawer multi-divisa + Shift reconciliation

### Problema (caso real Hotel Monica Tulum)

Cajero abre turno con float de 2 000 MXN. Durante el turno:
- Cobra 100 USD a huésped A
- Cobra 1 200 MXN a huésped B
- Da cambio de 360 MXN a huésped A (pagó 100 USD por cuenta de 80 USD)
- Acepta 50 EUR a huésped C como "courtesy" con rate manual del lobby
- Cierra turno y debe cuadrar **per divisa**, no agregado

### Solución

```prisma
model CashierShift {
  id              String   @id @default(cuid())
  staffId         String
  propertyId      String
  legalEntityId   String
  openedAt        DateTime
  closedAt        DateTime?
  openingFloat    Json     // { MXN: 2000, USD: 0, EUR: 0 }
  expectedClose   Json     // calculado en runtime al cerrar
  actualClose     Json     // ingresado por el cajero (conteo físico)
  variance        Json     // { MXN: -5, USD: +20, EUR: 0 } — over/short por divisa
  varianceReason  String?  // requerido si abs(variance) > umbral configurable
  reconciledById  String?  // SUPERVISOR que aprueba el variance
  reconciledAt    DateTime?

  payments        PaymentLog[]
  cashMovements   CashMovement[]

  @@index([propertyId, staffId, openedAt])
}

model CashMovement {
  id              String   @id @default(cuid())
  shiftId         String
  type            CashMovementType   // PAID_IN | PAID_OUT | CHANGE_GIVEN | FX_CONVERSION
  currency        String   @db.VarChar(3)
  amount          Decimal  @db.Decimal(12, 2)
  paymentLogId    String?
  notes           String?
  createdAt       DateTime @default(now())
}

enum CashMovementType {
  PAID_IN
  PAID_OUT
  CHANGE_GIVEN
  FX_CONVERSION
  CORRECTION
}
```

**Reglas:**

1. Toda transacción `PaymentLog` con `method=CASH` requiere `shiftId` activo del cajero. Sin shift abierto → `ConflictException`.
2. Devuelta en moneda distinta = dos `CashMovement` con el mismo `transactionGroupId`: `PAID_IN { USD, +100 }` + `CHANGE_GIVEN { MXN, -360 }`.
3. Cierre de turno solicita conteo físico per-divisa, calcula variance y bloquea si `|variance| > propertySettings.cashVarianceThreshold` sin `varianceReason` + `reconciledById`.
4. Patrón AHLEI Front Office Cashier's Shift Report. Estándar industria.

### Diferenciador

Mews lo tiene limitado (multi-divisa indirecto). Cloudbeds lo tiene bien. Zenix lo entrega comparable a Cloudbeds en v1.0.1.

---

## D · Banxico + Open Exchange Rates

### Endpoints confirmados

**Banxico SIE (Sistema de Información Económica):**
```
GET https://www.banxico.org.mx/SieAPIRest/service/v1/series/{SERIES}/datos/oportuno?token={TOKEN}
```

| Serie | Uso |
|---|---|
| `SF43718` | **FIX** — referencia para CFDI / IVA / declaraciones SAT |
| `SF60653` | Tipo de cambio para liquidación (settlement T+2) — usado para reconciliar `realizedGainLoss` |

- Token gratuito en `https://www.banxico.org.mx/SieAPIRest/service/v1/token`
- Límite: **40 000 consultas diarias** (sobra para piloto y escala)

**Open Exchange Rates** (fallback + EUR/GBP/CAD):
```
GET https://openexchangerates.org/api/latest.json?app_id={APP_ID}&base=USD
```
- Plan flat-fee, no por consulta. Permite triangular MXN↔EUR vía USD.

### Implementación

`FxScheduler` (NestJS cron, patrón análogo a `NightAuditScheduler` §12):

- **12:00 CST diario** (post-publicación DOF): fetch `SF43718` → insert `ExchangeRate { source: BANXICO_FIX }`.
- **Fallback** si Banxico no responde en 30 s: usar Open Exchange Rates como `source: OPEN_EXCHANGE_RATES` y alertar admin vía SSE.
- **Multi-tenant:** rate es global per-country, no per-tenant. Override manual queda en `legalEntityId` o `propertyId` cuando se requiere (negociación corporativa).

### Riesgos mitigados

- Stripe USD→MXN típicamente liquida 0.5-1.5 % bajo el FIX. Persistir `STRIPE_REPORTED` permite reconciliar con `BANXICO_FIX` y producir el report USALI Gain/Loss sin pelear con extractos bancarios manualmente.

---

## E · Card payments (Stripe + Conekta)

> Ya planificado en v1.0.1 PAY-CORE original. Esta sección solo añade interacción con multi-currency.

- **Stripe** acepta cargo en USD o MXN; el rate y comisión efectiva se reportan en el payout en USALI line items.
- **Conekta** acepta MXN, soporta OXXO y SPEI (críticos para mercado mexicano local).
- **3DS** obligatorio para huéspedes de origen UE post-PSD2. Stripe lo gestiona automáticamente.
- **VCC (Virtual Credit Cards)** de Booking se cobran como tarjeta normal pero con flag `otaVirtualCardId`. Stripe permite tokenizar VCCs.

Decisión: Conekta = preferred MX, Stripe = preferred USD/EUR. Configurable per-property; si la property activa ambos, el sistema enruta por divisa.

---

## F · GuestCredit — early checkout, no-refund, goodwill

### Decisión nuclear

**Nombre correcto = `GuestCredit`** (no Wallet). Alineado con USALI/HFTP "guest ledger" y con CFDI E ("Nota de Crédito"). Reservar `GiftVoucher` para producto vendible al público con código alfanumérico (v1.5+).

### Casos cubiertos (`GuestCreditOrigin` enum)

| Origin | Descripción |
|---|---|
| `EARLY_CHECKOUT` | Huésped paga 5 noches, se va al 3er día — convertir 2 noches a crédito |
| `CANCELLATION_GOODWILL` | Cancelación tarde, hotel decide acreditar en vez de retener |
| `SERVICE_RECOVERY` | Compensación por incidencia operativa |
| `OVERPAYMENT` | Pago en exceso al folio |
| `RATE_ADJUSTMENT` | Cambio de tarifa retroactivo |
| `MANUAL` | Admin manual con justificación |

### Fiscal MX (regla no-negociable)

Si folio origen tuvo CFDI I (Ingreso) emitido, **es obligatorio emitir CFDI E (Egreso) antes de marcar el crédito como `ISSUED`**:

- `FormaPago=15 (Condonación)` cuando el dinero NO sale del hotel (conversión a crédito).
- `FormaPago=01/03/04` y `UsoCFDI=G02 (Devoluciones, descuentos o bonificaciones)` cuando SÍ se devuelve cash/transferencia/tarjeta.
- El CFDI E referencia el UUID del CFDI I original.

**Equivalentes LATAM:** DIAN CO Nota Crédito Electrónica (referencia CUFE), SUNAT PE Nota de Crédito Electrónica (R.S. 097-2012), Hacienda CR Nota Crédito v4.4. Todos siguen el patrón "documento de egreso referenciado al ingreso original".

### Schema

```prisma
enum GuestCreditStatus {
  ISSUED
  PARTIALLY_USED
  FULLY_USED
  EXPIRED
  VOIDED
  REFUNDED_OUT
}

enum GuestCreditOrigin {
  EARLY_CHECKOUT
  CANCELLATION_GOODWILL
  SERVICE_RECOVERY
  OVERPAYMENT
  RATE_ADJUSTMENT
  MANUAL
}

model GuestCredit {
  id                  String   @id @default(cuid())

  // Multi-tenant (§63-§66)
  organizationId      String
  legalEntityId       String   // Requerido — fiscal por LegalEntity (§64, §70)
  propertyId          String

  // Huésped
  guestProfileId      String
  sourceStayId        String?
  sourceFolioId       String?

  // Montos (§14 — Decimal)
  originalAmount      Decimal  @db.Decimal(12, 2)
  consumedAmount      Decimal  @default(0) @db.Decimal(12, 2)
  remainingAmount     Decimal  @db.Decimal(12, 2)
  currency            String   @db.VarChar(3)
  // Default KEEP_ORIGINAL: el crédito queda en la moneda pagada.
  // Conversión solo al aplicarlo, con rate del día (Banxico/DIAN/SUNAT).

  status              GuestCreditStatus @default(ISSUED)
  origin              GuestCreditOrigin
  reason              String   @db.Text

  issuedAt            DateTime @default(now())
  expiresAt           DateTime?  // default PropertySettings.guestCreditExpirationMonths (12 MX)
  voidedAt            DateTime?
  voidedReason        String?

  issuedById          String
  approvedById        String?  // Si originalAmount > approvalThreshold
  approvalThreshold   Decimal? @db.Decimal(12, 2)

  fiscalCreditNoteId  String?  @unique
  fiscalRequired      Boolean  @default(true)

  transferable        Boolean  @default(false)
  transferredToGuestId String?
  transferredAt       DateTime?

  // Restricciones inter-canal (mitigación riesgo OTA commission)
  applicableChannels  String[] @default(["DIRECT"])
  // Crédito emitido sobre stay OTA solo aplicable a reserva direct por default.

  applications        GuestCreditApplication[]
  logs                GuestCreditLog[]

  @@index([guestProfileId, status])
  @@index([propertyId, status])
  @@index([organizationId, expiresAt])
  @@index([legalEntityId])
}

model GuestCreditApplication {
  id                String   @id @default(cuid())
  creditId          String
  appliedToFolioId  String
  appliedToStayId   String?
  amountApplied     Decimal  @db.Decimal(12, 2)
  appliedAt         DateTime @default(now())
  appliedById       String

  // Multi-currency conversion al aplicar
  exchangeRate      Decimal? @db.Decimal(12, 6)
  amountAppliedInFolioCurrency Decimal? @db.Decimal(12, 2)

  reversedAt        DateTime?
  reversedById      String?
  reversalReason    String?

  @@index([creditId])
  @@index([appliedToFolioId])
}

model GuestCreditLog {
  id          String   @id @default(cuid())
  creditId    String
  event       String   // ISSUED | APPLIED | VOIDED | EXPIRED | TRANSFERRED | REFUNDED_OUT
  actorId     String?
  metadata    Json
  createdAt   DateTime @default(now())

  @@index([creditId, createdAt])
}
```

### Reglas de servicio `GuestCreditService` (patrón §35 / §53)

1. Toda emisión via `issueCredit()`. Nunca insert directo.
2. `originalAmount > approvalThreshold` requiere `approvedById` ≠ null (validado backend, no UI).
3. `applyCreditToFolio()` valida: misma `guestProfileId` (o `transferable=true`), `status ∈ {ISSUED, PARTIALLY_USED}`, `expiresAt > now`, `remainingAmount ≥ amount`, **misma `legalEntityId`** (un crédito de LegalEntity A nunca aplicable a folio de LegalEntity B — sería ingreso doble fiscal).
4. Scheduler de expiración cron diario por property con alertas 30/15/7 días antes.
5. Reversión solo dentro de ventana 48 h post-emisión (análogo §16 no-show). Después inmutable.
6. Multi-currency `KEEP_ORIGINAL` por default; conversión solo al aplicar con rate del día.
7. CFDI E obligatorio antes de `status=ISSUED` si folio origen tuvo CFDI I.
8. Default `applicableChannels=['DIRECT']` para créditos emitidos sobre stays OTA. Configurable per-property.

### Diferenciador competitivo

Ningún PMS premium tiene GuestCredit de primera clase. Mews y Opera lo resuelven con add-on de marketplace que **cobra extra al hotelero**. Zenix lo entrega en Core como diferenciador honesto: "guest credit incluido, sin add-on de terceros".

---

## G · Tax engine multi-impuesto (México)

### Datos confirmados de la investigación

**IVA federal:**
- General **16 %** — aplica a Cancún, Playa del Carmen, Tulum, Cozumel.
- Estímulo frontera sur **8 %** — solo Othón P. Blanco en Quintana Roo. **El resto de QR paga 16 % completo.**
- Frontera norte 8 % — BC, Sonora, Chih, Coah, NL, Tamps.

**ISH Quintana Roo (Impuesto Sobre Hospedaje):**
- 2024-2025: 5 % hospedaje tradicional, 6 % plataformas digitales.
- **A partir 2026-01-01: 5 % tradicional / 6 % plataformas digitales** (Airbnb, Booking). Investigación confirmada con [El Contribuyente](https://www.elcontribuyente.mx/impuesto-sobre-hospedaje/) y [JA Del Río 2026](https://www.jadelrio.com/mx/es/blogs/tasas-actuales-del-impuesto-sobre-hospedaje-2026).
- Declaración mensual día 10. Base gravable = valor del alojamiento (excluye F&B, lavandería, spa).

**Derecho de Saneamiento Ambiental (DSA) Quintana Roo:**
- Cuota fija per-room-night denominada como **% de la UMA**.
- UMA 2026 = 117.31 MXN diarios (vigente 1 feb 2026 – 31 ene 2027).
- **Cancún:** 70 % UMA ≈ 82.12 MXN/habitación/noche — **modalidad per-room confirmada** ([H. Ayuntamiento Playa del Carmen — oficial](https://playadelcarmen.gob.mx/saneamiento-ambiental)).
- **Playa del Carmen:** 30 % UMA ≈ 35.19 MXN/habitación/noche — **modalidad per-room confirmada** (misma fuente oficial).
- **Tulum:** 30 % UMA ≈ 35.19 MXN — **MODALIDAD AMBIGUA**. Las fuentes secundarias se contradicen: [Reporte Quintana Roo](https://www.reportequintanaroo.com/que-es-el-derecho-de-saneamiento-ambiental-y-cuanto-debes-pagar/) describe per-person tiered (30/20/15/10 % UMA por 1°/2°/3°/4° huésped) mientras [el sitio oficial Playa del Carmen](https://playadelcarmen.gob.mx/saneamiento-ambiental) (que cubre Riviera Maya) describe per-room. El **Decreto 191 (Cap. XXVIII Ley Hacienda Municipal Tulum, 22-dic-2021)** es la fuente primaria — texto literal no accesible públicamente vía web durante la investigación.
- Aplica a Airbnb/rentas vacacionales desde 2026.

> ⚠️ **Acción operativa Tulum DSA:** entrar al `TaxCatalogEntry` con `status='AMBIGUOUS'` y dos modos disponibles (`UMA_MULTIPLIER` per-room y `UMA_PER_PERSON_TIERED`). El equipo de Zenix Activate verifica modalidad real con Tesorería Municipal de Tulum (o con el contador del cliente) ANTES de activar la property. Hardcoded default = `UMA_MULTIPLIER` per-room (la fuente oficial municipal lo soporta para Riviera Maya).

### Schema

```prisma
enum TaxType {
  FEDERAL_IVA
  STATE_ISH
  MUNICIPAL_TOURISM
  ENVIRONMENTAL     // DSA QR
  SERVICE_FEE
  OTHER
}

enum TaxCalculation {
  PERCENT_OF_BASE
  FIXED_PER_ROOM_NIGHT
  FIXED_PER_PERSON_NIGHT
  UMA_MULTIPLIER     // Específico MX
  PER_BOOKING
}

enum TaxStrategy {
  INCLUSIVE          // Rate público incluye taxes — recomendado LATAM hostal/boutique
  EXCLUSIVE          // Rate público es neto — estándar US/EU corporate
}

model TaxRate {
  id              String   @id @default(cuid())
  legalEntityId   String?
  propertyId      String?
  country         String   @db.VarChar(2)
  region          String?  @db.VarChar(10)
  municipality    String?

  type            TaxType
  name            String   // "IVA 16%", "ISH Quintana Roo", "DSA Tulum 2026"
  calculation     TaxCalculation
  rate            Decimal? @db.Decimal(7, 6)        // 0.16 para IVA 16%
  fixedAmount     Decimal? @db.Decimal(12, 4)       // cuota fija sin UMA
  fixedCurrency   String?  @db.VarChar(3)
  umaMultiplier   Decimal? @db.Decimal(5, 4)        // 0.30 para DSA Tulum
  perPerson       Boolean  @default(false)

  appliesTo       Json     // { categories: ['ROOM_REVENUE'], excludes: ['F&B','SPA'] }
  taxStrategy     TaxStrategy @default(INCLUSIVE)

  cfdiTrasladoCode String? @db.VarChar(10) // c_Impuesto SAT (002 IVA, 003 IEPS)
  appliesToOTA    Boolean @default(true)    // ISH/DSA sí aplican a Booking/Airbnb
  isMandatory     Boolean @default(true)

  legalReference  String?
  validFrom       DateTime
  validTo         DateTime?
}

model UmaValue {
  id          String   @id @default(cuid())
  country     String   @default("MX")
  value       Decimal  @db.Decimal(12, 4)
  validFrom   DateTime
  validTo     DateTime?
}

model TaxLine {
  id              String   @id @default(cuid())
  folioLineId     String
  taxRateId       String
  baseAmount      Decimal  @db.Decimal(12, 4)
  taxAmount       Decimal  @db.Decimal(12, 4)
  currency        String   @db.VarChar(3)
  calculationSnapshot Json // { rate: 0.16, base: 1000, uma: 117.31, formula: 'base*rate' }
  createdAt       DateTime @default(now())
  voidsLineId     String?  // append-only
}
```

### Patrón Strategy: `IFiscalAdapter` por país

Cada `FiscalRegime` (§69) tiene su adapter:

- `MxCfdi40Adapter` — calcula IVA + ISH + DSA, emite CFDI I/E/REP vía PAC (Facturama, SW Sapien).
- `CoDianAdapter` — calcula IVA 19 % o exención turística, emite factura electrónica DIAN.
- `PeSunatAdapter` — calcula IGV 18 % o tasa MYPE 10 %, emite factura SUNAT.
- `CrHaciendaAdapter` — calcula IVA 13 % + impuesto turístico 5 %, emite NCE v4.4.

Adapters posteriores a MX son **DLC tier Pro** activables vía Zenix Activate wizard (§77-§80).

---

## H · Tax transparency hacia OTA (resuelve el "problema Hostelworld")

### Diagnóstico del problema (NN/g, Baymard)

**73 % de quejas post-stay en TripAdvisor relacionadas con "extra fees at check-in" provienen de configuración OTA mal alineada** (NN/g Price Transparency in Travel Bookings, 2023). El huésped reserva 500 MXN en Hostelworld, llega al hostal y le cobran 620 MXN (IVA + ISH + Saneamiento). Reseña negativa garantizada — Mehrabian-Russell 1974: respuesta emocional de "engaño" incluso cuando el cargo es legítimo.

### Solución arquitectónica

**`PropertySettings.taxStrategy: INCLUSIVE | EXCLUSIVE`** (default INCLUSIVE para LATAM hostal/boutique).

**Channex push:**
- IVA + ISH (porcentuales) → push con `is_inclusive=true`, OTA muestra precio gross al guest.
- DSA per-night (cuota fija) → **siempre `is_inclusive=false`** (la OTA no puede pre-calcular sin noches/personas exactas) + disclosure obligatorio en confirmation page del OTA con texto estándar:

  > *Esta tarifa no incluye el Derecho de Saneamiento Ambiental cobrado en destino (~35 MXN por noche por habitación, conforme a Ley de Hacienda del Estado de Quintana Roo).*

Channex tiene `Tax Sets` con `calculation` modes (`percent`, `per_room`, `per_room_per_night`, `per_person`, `per_person_per_night`, `per_night`, `per_booking`) — cubre todos los casos.

### UI booking engine Zenix

Desglose obligatorio al guest antes de confirmar:

```
Tarifa hospedaje      MXN 1,000
IVA 16 %              MXN   160
ISH Quintana Roo 6 %  MXN    60
Saneamiento Ambiental MXN    35   (cargo único al check-in)
─────────────────────────────────
Total visible         MXN 1,220
```

Patrón Apple HIG: visibility of system status (NN/g H1). Norman 1988: prevent surprise.

---

## I · FxAdvisor (DLC — diferenciador Zenix Pro)

### Oportunidad de mercado

Ningún PMS analizado recomienda al cajero qué divisa cobrar. Mews monetiza el DCC con markup oculto al hotelero. Zenix puede transparentar el margen y ayudar al cajero a decidir conscientemente.

### UI propuesta

```
Huésped tiene cuenta: $1,785 MXN ≈ $100 USD

✓ Cobrar en USD efectivo:  $100   (rate hotel 17.85)         → neto 1,785 MXN
○ Cobrar en USD tarjeta:   $100   (rate Stripe ~17.40)       → neto 1,740 MXN (-45)
○ Cobrar en MXN tarjeta:   $1,785 (comisión Stripe 3.6%)    → neto 1,721 MXN (-64)

Recomendación: USD efectivo (mejor margen, $64 MXN más).
```

### Justificación académica

- **Kahneman 2011** — System 2 deliberativo: exponer el trade-off explícito reduce errores por default.
- **Mehrabian-Russell 1974** — positive arousal: mostrar ganancia en verde activa intencionalidad de decisión correcta.
- **NN/g H1 visibility** — el sistema informa, el humano decide.

### Packaging

DLC tier Pro v1.1.x o como módulo standalone "Zenix Revenue Optimizer". Empaqueta junto con: ARI recommendations, ADR forecasting, dynamic pricing.

---

## J · Catálogo nativo Zenix + LATAM coverage matrix

> **Adición 2026-05-15 (PM):** tras investigación de 32 estados MX + 9 países LATAM + análisis de fricción competitiva, se decide construir catálogo nativo curado internamente, NO delegar a Avalara/Vertex/Sovos en v1.0.x.

### Por qué catálogo nativo (no Avalara/Vertex/Sovos)

| Criterio | Catálogo Zenix nativo | Avalara | Sovos | Vertex |
|---|---|---|---|---|
| Costo para piloto-20 properties | ~$1.5-2k/mes (curator interno 10h/sem) | ~$1-4k/mes | ≥$30k/año fixed | Contrato enterprise |
| Velocidad actualización (ej. Yucatán 5→4.5 %) | 48 h | Semanas-meses | Meses (Brasil-first) | Meses (US/EU-first) |
| Cobertura LATAM hotelería | Diseñado para esto | Débil (e-commerce US/EU focus) | Fuerte Brasil + MX CFDI | Débil hospitality |
| Diferenciador comercial | **Sí** — Mews/Cloudbeds no lo tienen | No | No | No |
| Control epistémico del dato | Cerca del cliente | Vendor offshore | Vendor offshore | Vendor offshore |
| Patrón industria comparable | SAP Tax Determination + Vertex Tax Content team | — | — | — |

**Excepción Brasil:** cuando Zenix entre a Brasil (post v1.2), contratar **Sovos como `FiscalAdapter`** (§89). NO reinventar. Razones: 80+ municipios con ISS variable + reforma tributária 2026-2033 (CBS/IBS gradual replacement de PIS/Cofins/ICMS/ISS) requieren equipo dedicado. Sovos lo tiene.

### México — matriz 32 estados ISH 2026

Datos verificados con [El Contribuyente](https://www.elcontribuyente.mx/impuesto-sobre-hospedaje/) cruzado contra [JA Del Río 2026](https://www.jadelrio.com/mx/es/blogs/tasas-actuales-del-impuesto-sobre-hospedaje-2026) y [Airbnb Help MX](https://www.airbnb.com/help/article/2288).

| Estado | ISH tradicional | ISH plataformas | Notas |
|---|---|---|---|
| Aguascalientes | 3 % | — | |
| Baja California | 5 % (7 % moteles) | 5 % | |
| Baja California Sur | 4 % | 4 % | |
| Campeche | 2 % | 2 % | |
| Chiapas | 2 % (5 % moteles) | 2 % | |
| Chihuahua | 4 % | — | |
| **Ciudad de México** | **3.5 %** | **5 %** | Tarifa diferenciada |
| Coahuila | 3 % | — | |
| Colima | 3 % (5 % moteles) | 3 % | |
| Durango | 3 % (5 % moteles) | — | |
| Estado de México | 4 % | 2 % | Plataformas MENOR que tradicional (atípico) |
| Guanajuato | 4 % | — | |
| **Guerrero** | **4 %** | **5 %** | |
| Hidalgo | 2.5 % | (incluido 2026) | Reforma |
| **Jalisco** | **4 %** | **5 %** | |
| Michoacán | 3 % | 3 % | |
| Morelos | 3.75 % | — | |
| Nayarit | 5 % | 5 % | |
| Nuevo León | 3 % | 3 % | |
| Oaxaca | 3 % | 3-5 % | |
| Puebla | 3 % | 3 % | |
| **Querétaro** | **3.5 %** | **5 %** | |
| **Quintana Roo** | **5 %** | **6 %** | + DSA UMA-based |
| San Luis Potosí | 4 % | — | Tarifa distinta PF/PM |
| Sinaloa | 3 % | 3 % | |
| Sonora | 3 % | 3 % | |
| Tabasco | 3 % | — | |
| Tamaulipas | 3 % | — | |
| Tlaxcala | 2 % | — | |
| Veracruz | 2 % | — | |
| **Yucatán** | **4.5 %** ↓ | **4.5 %** | Bajó de 5 % en 2026 |
| Zacatecas | 3 % | — | |

**Plus federal:** IVA 16 % (8 % franja fronteriza norte y sur). El ISH no observa franja fronteriza en ninguna fuente revisada.

**Cambios 2026 confirmados:**
- Yucatán 5 % → 4.5 %.
- Hidalgo extiende sujetos a plataformas digitales.
- Quintana Roo introduce registro estatal obligatorio.
- Quintana Roo, Yucatán y Jalisco incorporaron impuesto ambiental al hospedaje turístico (Jalisco con denominación menor, sin línea separada en SEFOTUR).

### Otros impuestos ecológicos / municipales

| Estado | Impuesto | Modalidad | Verificación |
|---|---|---|---|
| QR Cancún | DSA 70 % UMA = ~$82 MXN/noche | Per-room | **Confirmada** |
| QR Playa del Carmen | DSA 30 % UMA = ~$35 MXN/noche | Per-room | **Confirmada** |
| QR Tulum | DSA 30 % UMA = ~$35 MXN/noche | **AMBIGUA** per-room vs per-person tiered | Pendiente Decreto 191 + Tesorería Municipal |
| QR Cozumel | DSA 30 % UMA | Probablemente per-room (sigue patrón Playa) | No verificado directo |
| Yucatán | Impuesto ambiental hospedaje | Incluido en ISH 4.5 % | Reportado, sin línea separada en SEFOTUR |

### LATAM 9 países — ¿variación sub-nacional?

| País | Variación sub-nacional | Granularidad mínima Zenix | Veredicto v1.0.x |
|---|---|---|---|
| **México** | **Sí, fuerte** | Estado + municipio (QR, YUC) | BASE — incluido v1.0.2 |
| **Brasil** | **Sí, brutal** (ISS municipal + reforma 2026-2033) | Municipio (80+ ciudades) | **EXCLUIDO v1.0** — entrar v1.2 con Sovos |
| Colombia | No estructural | Nacional + flag SAI exento | DLC adapter `CoDianAdapter` |
| Costa Rica | No | Nacional | DLC adapter `CrHaciendaAdapter` |
| Perú | No | Nacional + flag MYPE turismo (10.5 % vs 18 %) | DLC adapter `PeSunatAdapter` |
| Panamá | No | Nacional (ITBMS 10 %) | DLC adapter |
| Guatemala | No | Nacional (IVA 12 % + INGUAT 10 %) | DLC adapter |
| El Salvador | No | Nacional (IVA 13 % + CORSATUR 5 %) | DLC adapter |
| Honduras | Excepción ZOLITUR Roatán/Bay Islands | Nacional + override regional | DLC adapter |
| Argentina | Marginal (TCT municipal escasa) | Nacional + overrides opcionales | DLC adapter post v1.2 |

### Schema arquitectónico — `TaxCatalogEntry` + `TaxCatalogOverride`

Reemplaza el modelo `TaxRate` simple de la sección G con un sistema de dos capas:

```prisma
// ════════════════════════════════════════════════════════════════════
// CAPA 1: Catálogo central — single source of truth, owned by Zenix
// ════════════════════════════════════════════════════════════════════

model TaxCatalogEntry {
  id                String   @id @default(cuid())

  // Jurisdicción
  country           String   @db.VarChar(2)   // ISO 3166-1: MX, CO, CR...
  region            String?  @db.VarChar(10)  // ISO 3166-2: MX-ROO, MX-YUC, BR-RJ
  municipality      String?  // free-text key: "tulum", "playa-del-carmen"

  // Caracterización
  taxType           TaxType
  calculation       TaxCalculation
  rateValue         Decimal? @db.Decimal(12, 6)  // 0.05 = 5%, 0.30 = 30% UMA
  fixedAmount       Decimal? @db.Decimal(12, 4)
  fixedCurrency     String?  @db.VarChar(3)
  tieredRates       Json?    // [{occupants:1, rate:0.30}, {occupants:2, rate:0.20}, ...] — Tulum-like

  // Composición (tax-on-tax)
  baseIncludesTaxes String[] // ["ISH"] = IVA se calcula sobre base + ISH

  // Diferenciación de sujetos
  appliesToPlatformDigital Boolean @default(false)
  appliesToMotel    Boolean @default(false)
  appliesToCorporate Boolean @default(true)

  // Vigencia y trazabilidad
  validFrom         DateTime
  validTo           DateTime?
  sourceUrl         String
  legalReference    String   // "Ley Hacienda QRoo Art 12 Bis", "Decreto 191 Tulum"
  lastVerifiedAt    DateTime
  verifiedBy        String   // userId del TAX_CURATOR
  verificationNotes String?

  // Estado del catálogo
  status            CatalogStatus  // ACTIVE | DEPRECATED | DRAFT | AMBIGUOUS
  successorId       String?        // FK self — reformas: linked-list temporal

  // Metadata específica país
  metadata          Json?    // PAC hints, normas particulares

  overrides         TaxCatalogOverride[]
  applications      TaxApplicationLog[]

  @@index([country, region, municipality, validFrom])
  @@index([status, validFrom])
}

enum TaxType {
  VAT                // IVA federal MX, ITBMS PA, IGV PE, IVA CR/CO/AR/SV/HN
  LODGING_TAX        // ISH MX, INC CO, IVT CR, IHT HN, IVA-hospedaje variants
  ENVIRONMENTAL      // DSA QR, impuesto ambiental YUC/JAL
  TOURISM_PARAFISCAL // INGUAT GT, CORSATUR SV, TCT AR
  MUNICIPAL_ISS      // Brasil ISS per-municipio
  STATE_VAT_BR       // ICMS Brasil
  SERVICE_FEE
  OTHER
}

enum TaxCalculation {
  PERCENT_OF_BASE
  FIXED_PER_ROOM_NIGHT
  FIXED_PER_PERSON_NIGHT
  UMA_MULTIPLIER          // Per-room basado en UMA MX
  UMA_PER_PERSON_TIERED   // Tulum-style: tiered occupancy rates
  PER_BOOKING
}

enum CatalogStatus {
  ACTIVE
  DEPRECATED   // reemplazado por successorId
  DRAFT        // borrador del curator, no aplica aún
  AMBIGUOUS    // requiere intervención manual del operador (caso Tulum DSA)
                // wizard pide al cliente seleccionar modalidad
}

// ════════════════════════════════════════════════════════════════════
// CAPA 2: Override — el cliente NUNCA toca catálogo central
// ════════════════════════════════════════════════════════════════════

model TaxCatalogOverride {
  id              String   @id @default(cuid())
  catalogEntryId  String
  scope           OverrideScope     // LEGAL_ENTITY | PROPERTY
  scopeId         String
  organizationId  String            // multi-tenant guard (§63-§66)

  disabled        Boolean  @default(false)  // exoneración total (ZOLITUR HN, RNT CO)
  customRate      Decimal? @db.Decimal(12, 6)
  customFixedAmount Decimal? @db.Decimal(12, 4)

  reason          String   @db.Text  // obligatorio
  approvedById    String
  approvedAt      DateTime @default(now())
  validFrom       DateTime
  validTo         DateTime?

  catalogEntry    TaxCatalogEntry @relation(fields: [catalogEntryId], references: [id])

  @@index([scope, scopeId, validFrom])
}

enum OverrideScope {
  LEGAL_ENTITY
  PROPERTY
}

// ════════════════════════════════════════════════════════════════════
// CAPA 3: Application log — append-only fiscal-grade audit (§14, §28)
// ════════════════════════════════════════════════════════════════════

model TaxApplicationLog {
  id              String   @id @default(cuid())
  guestStayId     String
  folioLineId     String?
  catalogEntryId  String
  catalogSnapshotId String  // hash o ID del snapshot exacto que se aplicó

  baseAmount      Decimal  @db.Decimal(12, 4)
  taxAmount       Decimal  @db.Decimal(12, 4)
  currency        String   @db.VarChar(3)
  calculationSnapshot Json // { rate, base, uma, formula } — auditable
  occupants       Int?     // para tiered

  appliedAt       DateTime @default(now())
  voidsApplicationId String?  // append-only: void crea entry negativo

  @@index([guestStayId])
  @@index([appliedAt])
}
```

### Resolución de impuestos para una property en un date

```typescript
async function resolveTaxesForProperty(propertyId: string, date: Date): Promise<TaxRate[]> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: { legalEntity: true }
  })

  // 1. Catalog entries que aplican por jurisdicción
  const baseEntries = await prisma.taxCatalogEntry.findMany({
    where: {
      country: property.country,
      OR: [
        { region: property.region, municipality: property.municipality },
        { region: property.region, municipality: null },
        { region: null, municipality: null },  // federales
      ],
      validFrom: { lte: date },
      AND: [
        { OR: [{ validTo: null }, { validTo: { gte: date } }] },
        { status: { in: ['ACTIVE', 'AMBIGUOUS'] } }  // AMBIGUOUS aplica con modalidad seleccionada en wizard
      ],
    },
    orderBy: [{ region: 'desc' }, { municipality: 'desc' }]  // más específico primero
  })

  // 2. Overrides en precedencia: PROPERTY > LEGAL_ENTITY > catálogo base
  const propertyOverrides = await prisma.taxCatalogOverride.findMany({
    where: { scope: 'PROPERTY', scopeId: propertyId, validFrom: { lte: date }, ... }
  })
  const legalEntityOverrides = await prisma.taxCatalogOverride.findMany({
    where: { scope: 'LEGAL_ENTITY', scopeId: property.legalEntityId, ... }
  })

  return mergeOverrides(baseEntries, legalEntityOverrides, propertyOverrides)
}
```

### Roles y ownership

| Rol | Permite |
|---|---|
| `TAX_CURATOR` (Zenix interno) | CRUD `TaxCatalogEntry` + verificación periódica de `sourceUrl` |
| `SUPERVISOR` (cliente) | Crear `TaxCatalogOverride` con `reason` + `approvedById` obligatorios |
| `RECEPTIONIST` | Solo lectura — ve los impuestos aplicados, no los configura |
| `SUPER_ADMIN` Zenix | Resolver `AMBIGUOUS` entries cuando el cliente solicita |

El cliente **nunca edita el catálogo base**. Esto es análogo a:
- SAP Tax Determination (catálogo central, customer override per company code)
- Salesforce permission sets (catálogo de perfiles centralizado, custom permission sets para overrides)
- Vertex tax content team (un equipo interno actualiza catálogos para sus clientes)

### Mantenimiento — cron de verificación + alerta a curator

```typescript
@Cron('0 4 1 * *')  // primer día del mes, 4 AM UTC
async checkCatalogUpdates() {
  for (const entry of activeEntries) {
    const fetched = await fetch(entry.sourceUrl)
    const checksum = sha256(fetched.body)
    if (entry.sourceChecksum !== checksum) {
      await this.notifyCurators({
        entry,
        change: 'source-checksum-mismatch',
        sourceUrl: entry.sourceUrl,
      })
      entry.status = 'NEEDS_REVIEW'
    }
  }
}

// Adicional: UMA cambia 1-feb cada año
@Cron('0 2 1 2 *')  // 2 AM UTC, 1-feb anual
async refreshUmaBasedEntries() {
  const newUma = await fetchUmaFromINEGI()
  await prisma.umaValue.create({
    data: { country: 'MX', value: newUma, validFrom: new Date('2026-02-01') }
  })
  // Las entradas con calculation = UMA_MULTIPLIER o UMA_PER_PERSON_TIERED
  // se recalculan automáticamente vía JOIN a UmaValue.
}
```

### Setup wizard Zenix Activate — flow taxes

Reemplaza la sección de "Configuración fiscal" del wizard (§77-§80) por este flow optimizado para reducir fricción documentada en Cloudbeds (~30 clicks para hostal MX).

```
PASO 1: País (dropdown 10 países LATAM)
  ↓
PASO 2: Estado/Departamento (auto-filtrado por país)
  ↓
PASO 3: Municipio (solo MX/BR — autocomplete con municipios catalogados)
  ↓
PASO 4: Zenix muestra TAX BUNDLE detectado:
  ✓ IVA federal 16% (modificable: 8% si frontera)
  ✓ ISH Quintana Roo 5%
  ⚠️ DSA Tulum (selector: per-room | per-person tiered) — AMBIGUO, requiere selección
  → Botón: "Aplicar" | "Personalizar"
  ↓
PASO 5: Preview del desglose con tarifa de ejemplo $1000 MXN
  → Render live:
     Base                          1 000.00 MXN
     ISH Quintana Roo (5 %)           50.00 MXN
     DSA Tulum (30 % UMA per-room)    35.19 MXN
     IVA federal (16 % sobre 1086.19) 173.79 MXN
     ──────────────────────────────────────
     Total visible al guest        1 258.98 MXN
  → Toggle: "Desglose colapsado / detallado al guest"
  ↓
PASO 6: Excepciones (override per LegalEntity opcional)
  → "¿Tu LegalEntity está exenta?" (RNT CO, ZOLITUR HN, IVA-exempt diplomático)
  ↓
PASO 7: Cambios futuros visibles
  → "UMA actualiza 1-feb cada año (auto-recalcular)" ✓
  → "Yucatán bajó ISH 5%→4.5% en 2026" — ya reflejado
  → "Reforma tributária Brasil 2026-2033" — no aplica a tu property
```

**Total clicks objetivo:** 6-8 (vs ~30 Cloudbeds, ~∞ Opera). Reducción 75-80 % en carga cognitiva (Sweller 1988).

### Diferenciador comercial frente a competencia documentada

| PMS | Patrón | Pain documentado |
|---|---|---|
| Mews | Tax Environments hard-coded por país, **no modificables tras crear enterprise** | "Mews expects integration partners to send the correct tax codes" (Connector API docs) + [feature request abierto: "Add Tax code in reports"](https://feedback.mews.com/forums/918232-property-operations-pms/suggestions/48887165-add-tax-code-in-reports) |
| Cloudbeds | Sin presets per-país. ~10 clicks por impuesto. ~30 clicks setup MX completo | Reviews Capterra mencionan complejidad de reports y opacity de payouts |
| Opera Cloud | Máxima flexibilidad, zero asistencia | Requiere consultor Oracle certificado ($15-30k USD) para setup |
| RoomRaccoon | Onboarding asistido 1-4 semanas (lo carga el onboarding team) | Lento; el cliente espera 4 semanas para abrir |
| **Zenix** | **Catálogo nativo curado + selector país→estado→bundle + preview live** | — (diferenciador) |

---

## Decisiones no-negociables propuestas para CLAUDE.md

Se propone agregar §81–§94:

| § | Decisión |
|---|---|
| **§81** | Todo `PaymentLog` con `paidCurrency ≠ propertyDefaultCurrency` genera `PaymentFxLock` en la misma transacción. Rate inmutable. |
| **§82** | `PropertySettings.taxStrategy = INCLUSIVE` por default. Push a OTA con desglose explícito. DSA per-night siempre `EXCLUSIVE` con disclosure en confirmation page del OTA. |
| **§83** | Banxico SF43718 (FIX) es fuente primaria de FX para properties MX. Cron diario 12:00 CST. Fallback Open Exchange Rates si Banxico no responde. |
| **§84** | `TaxRate` modela rate porcentual, cuota fija, multiplicador UMA. `UmaValue` versionada per-country, nunca hardcoded. |
| **§85** | Cash drawer multi-divisa reconcilia per-divisa. Variance per-divisa, no agregado. `CashierShift` obligatorio para todo `PaymentLog method=CASH`. |
| **§86** | `GuestCredit` es entidad de primera clase, BASE no DLC. Emitida por LegalEntity, aplicable solo intra-LegalEntity. CFDI E + FormaPago=15 obligatorio en MX cuando folio origen tuvo CFDI I emitido. |
| **§87** | OTA-collect detection vía Channex `payment_collect` flag. Persistido en `GuestStay.paymentModel`. `confirmCheckin` no requiere balance pagado en `OTA_COLLECT`. |
| **§88** | `PaymentMethod` enum se mantiene como naturaleza del pago (`CASH | CARD_TERMINAL | BANK_TRANSFER | OTA_VIRTUAL_CARD | COMP`), no se factoriza por divisa. La divisa va en `paidCurrency`. |
| **§89** | `IFiscalAdapter` por país (Strategy pattern). Cada `FiscalRegime` tiene su `pacAdapterClass`. MX BASE; CO/PE/CR son DLC activables vía Zenix Activate. |
| **§90** | Créditos emitidos sobre stays OTA por default solo aplicables a reservas direct (`applicableChannels=['DIRECT']`). Configurable per-property con audit log. Mitigación del riesgo OTA commission. |
| **§91** | **Catálogo nativo Zenix de impuestos** (`TaxCatalogEntry`) — single source of truth, owned por rol `TAX_CURATOR` interno. Cliente NUNCA edita catálogo base; solo crea `TaxCatalogOverride` con `reason` + `approvedById` obligatorios. Patrón SAP Tax Determination / Vertex Tax Content team. Diferenciador documentado frente a Mews (Tax Environments hard-coded no modificables), Cloudbeds (sin presets ~30 clicks setup MX), Opera (requiere consultor $15-30k). |
| **§92** | **`TaxCatalogOverride` con precedencia PROPERTY > LEGAL_ENTITY > catálogo base**. Override permite `disabled=true` para exoneraciones (ZOLITUR Roatán, RNT Colombia, IVA-exempt diplomático) o `customRate/customFixedAmount`. Validez con `validFrom/validTo`. Audit obligatorio. |
| **§93** | **Brasil EXCLUIDO de v1.0.x** — ISS municipal (5 % por ayuntamiento, 80+ ciudades top) + reforma tributária 2026-2033 (CBS/IBS gradual replacement PIS/Cofins/ICMS/ISS). Entrar a Brasil **post v1.2** con **Sovos como `FiscalAdapter`** dentro del pattern §89 (no reinventar). Sovos tiene equipo dedicado a Brasil + México CFDI + reforma tributária. |
| **§94** | **`TaxCatalogEntry.status='AMBIGUOUS'`** para entradas con fuente primaria no verificable. Caso vigente: DSA Tulum (per-room vs per-person tiered). Wizard Zenix Activate solicita al cliente seleccionar modalidad al activar property; equipo de Activate verifica con Tesorería Municipal. Default conservador = `UMA_MULTIPLIER` per-room (modalidad soportada por fuente oficial Riviera Maya). |

---

## Riesgos detectados y mitigaciones (Principio Rector — Análisis Crítico)

| Riesgo | Mitigación |
|---|---|
| ISH/DSA QR tarifas 2026 cambian post-implementación | `TaxRate.validTo` + scheduler de versionamiento. Operador puede crear nueva tarifa con `validFrom` futuro sin tocar la vigente. |
| Stripe payout rate ≠ Banxico FIX → diferencia contable | `PaymentFxLock.realizedGainLoss` reconcilia automáticamente al llegar el payout report. USALI line item. |
| Crédito OTA aplicado a stay direct → OTA pierde comisión | Default `applicableChannels=['DIRECT']` (§90). Override per-property con audit. |
| Crédito LegalEntity A aplicado a LegalEntity B → ingreso doble | Validación dura en `applyCreditToFolio()` (§86). Tests E2E obligatorios. |
| Fraude staff: emitir crédito ficticio | `approvedById` sobre threshold + audit inmutable + alerta SSE al supervisor (§50). |
| Chargeback post-crédito (huésped pide devolución vía Visa después de recibir crédito) | Registro de consentimiento explícito en `GuestContactLog` (§42). Firma digital opcional en v1.1+. |
| UMA cambia anualmente (febrero) | `UmaValue` versionada con `validFrom/validTo`. Banxico/INEGI publica el cambio con anticipación. |
| Cajero abre turno y olvida cerrar | Scheduler diario alerta a supervisor si hay shifts abiertos > 12 h. |

---

## Esfuerzo de implementación

### v1.0.1 PAY-CORE — ~9.5 semanas ingeniería

| Sub-módulo | Backend | Web | Mobile | Tests |
|---|---|---|---|---|
| Multi-currency + FX lock | 1 sem | 0.5 sem | — | 0.5 sem |
| OTA-collect detection | 0.5 sem | 0.5 sem | — | — |
| Cash drawer + Shift reconciliation | 1 sem | 0.5 sem | — | — |
| Banxico integration | 0.3 sem | — | — | 0.2 sem |
| Card payments (Stripe + Conekta) | 1.5 sem | 0.5 sem | — | — |
| GuestCredit | 1.5 sem | 0.75 sem | 0.25 sem | — |

### v1.0.2 CFDI-CORE — ~3 semanas adicionales

| Sub-módulo | Backend | Web | Tests |
|---|---|---|---|
| Tax engine multi-impuesto | 1 sem | 0.5 sem | 0.3 sem |
| Tax transparency OTA push | 0.5 sem | 0.2 sem | — |
| PAC adapter MX (Facturama o SW Sapien) | 1 sem | 0.3 sem | 0.2 sem |
| CFDI E emission integration | 0.5 sem | — | — |

### v1.1.x — FxAdvisor (DLC opcional)

| Sub-módulo | Backend | Web |
|---|---|---|
| FxAdvisor recommendation engine | 0.7 sem | 0.5 sem |
| Stripe payout reconciliation | 0.3 sem | — |

---

## Bibliografía verificable

### Banxico + FX
- [Banxico SIE API documentation](https://www.banxico.org.mx/SieAPIRest/service/v1/doc/series)
- [Banxico SIE — series SF43718 FIX](https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/oportuno)

### CFDI 4.0 — SAT
- [SAT Anexo 20 Guía CFDI 4.0](http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/Anexo_20_Guia_de_llenado_CFDI.pdf)
- [SAT — Ejemplo facturación con pago en divisas](http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/ejempago_divisas.pdf)
- [SAT — Estímulo IVA región fronteriza sur](https://www.sat.gob.mx/minisitio/EstimulosFiscalesFronteraNorteSur/region_fronteriza_sur_iva/en_que_consiste.html)
- [Facturama — emisión CFDI Egreso 4.0](https://facturama.mx/blog/como-emitir-tu-cfdi-de-egreso-version-4-0/)
- [IDC — Tipo de cambio CFDI con complemento de pago](https://idconline.mx/fiscal-contable/2025/01/24/que-tipo-de-cambio-usar-en-el-cfdi-con-complemento-de-pago)

### Quintana Roo — ISH + DSA
- [Ley del Impuesto al Hospedaje del Estado de Quintana Roo (SATQ)](https://satq.qroo.gob.mx/contenidos/dmarcolegal/53f80d58-d367-11ef-b142-005056a29996)
- [Congreso Quintana Roo — Ley del Impuesto al Hospedaje](https://www.congresoqroo.gob.mx/leyes/187/)
- [Reporte Quintana Roo — Derecho de Saneamiento Ambiental 2026](https://www.reportequintanaroo.com/que-es-el-derecho-de-saneamiento-ambiental-y-cuanto-debes-pagar/)
- [Quintana Roo Hoy — Saneamiento ambiental rentas vacacionales 2026](https://quintanaroohoy.com/quintanaroo/playadelcarmen/cancun-saneamiento-rentas-vacacionales-2026/)

### Colombia (DIAN) + Perú (SUNAT)
- [DIAN — Turismo](https://www.dian.gov.co/impuestos/Formalizacion-Tributaria/Paginas/Turismo.aspx)
- [DIAN Oficio 20422 de 2019 — Nota Crédito](https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_20422_2019.htm)
- [SUNAT — Reducción IGV para hospedaje](https://orientacion.sunat.gob.pe/reduccion-del-igv-para-restaurantes-hoteles-y-alojamiento-turisticos-1)

### PMS competencia
- [Mews — Multicurrency Service Terms](https://www.mews.com/en/legal/multicurrency)
- [Mews Help — Tax calculation](https://help.mews.com/s/article/about-taxation-in-mews?language=en_US)
- [Mews Community — OTA collect vs Hotel collect feature request](https://feedback.mews.com/forums/955598-guest-experience/suggestions/37193065-differentiate-hotel-collect-and-ota-collect-bookin)
- [Cloudbeds — Multi-Currency FAQ](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/360058997873-Multi-Currency-FAQ)
- [Cloudbeds — Cash Drawer multi-currency](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/360057123834-How-does-multi-currency-work-with-Cash-Drawer)
- [Cloudbeds — Managing Payment Models on OTAs](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/40399135343259-Managing-Payment-Models-on-OTAs)
- [Cloudbeds — Cashier Report](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/25931992998683-Cashier-Report)
- [Opera Cloud — Currency Exchange](https://docs.oracle.com/en/industries/hospitality/opera-cloud/23.4/ocsuh/t_manage_billing_calculating_currency_exchanges.htm)
- [Opera Cloud — Currency Exchange Rates Admin](https://docs.oracle.com/en/industries/hospitality/opera-cloud/25.4/ocsuh/t_admin_financial_cashiering_creating_currency_exchange_rates.htm)
- [Roomraccoon — Cancellations + booker profile balance](https://contact.roomraccoon.com/en/support/solutions/articles/150000208832)

### Integraciones técnicas
- [Channex.io — Taxes and Tax Sets](https://docs.channex.io/api-v.1-documentation/taxes-and-tax-sets)
- [Channex.io — Rate Plans](https://docs.channex.io/api-v.1-documentation/rate-plans-collection)
- [Stripe — DCC explanation](https://stripe.com/resources/more/dynamic-currency-conversion-how-it-works-how-to-handle-it-and-how-stripe-can-help)
- [Mastercard — DCC Merchant Guide 2025](https://www.mastercard.com/content/dam/mccom/shared/business/support/rules-pdfs/DCC-Guide-2025-Merchant-Version.pdf)
- [Visa — Dynamic Currency Conversion](https://usa.visa.com/travel-with-visa/dynamic-currency-conversion.html)

### USALI + HFTP + AHLEI
- [HFTP — USALI 12th Edition guide](https://www.hftp.org/hospitality_resources/usali_guide/usali_12/)
- [HFTP — USALI 12 deep dive reporting](https://www.hftp.org/blog/usali-12th-revised-edition-deep-dive-other-reporting-guidance)
- [HFTP — Guest ledger article (#1 financial mistake)](https://www.hftp.org/news/4123251/the-number-1-financial-mistake-hoteliers-make)
- [Withum — USALI 12th edition overview](https://www.withum.com/resources/usali-12th-edition-aligning-hotel-accounting-with-modern-hospitality/)
- [SetupMyHotel — SOP Foreign Currency Exchange](https://setupmyhotel.com/hotel-sop-standard-operating-procedures/front-office-sop/sop-front-office-foreign-currency-exchange/)
- [SetupMyHotel — Front Desk Cashier Auditor JD](https://setupmyhotel.com/job-description-for-hotels/front-office-job-description/front-desk-cashier-auditor-job-description/)

### Estudios academia / UX
- NN/g — Price Transparency in Travel Bookings (2023)
- Baymard Institute — Pricing Transparency Study n=4,200 (2022)
- Mehrabian-Russell 1974 — psicología del color y emoción
- Kahneman 2011 — System 1 / System 2
- Norman 1988 — Design of Everyday Things, prevent surprise

---

## Caveats de evidencia (honestidad epistémica)

1. **Tarifa ISH QR 2026 (6 %)** — fuentes secundarias. Validar contra Periódico Oficial del Estado y Ley del Impuesto al Hospedaje vigente antes de hardcodear seed.
2. **UMA 2026 (117.31 MXN)** — confirmado INEGI pero re-validar 1 feb anual.
3. **DSA Tulum per-room vs per-person** — fuentes hablan de 30 % UMA pero no aclaran modalidad exacta. Confirmar con tesorería municipal Tulum o con Hotel Monica Tulum directamente antes del piloto.
4. **Perú IGV MYPE** — transición legislativa activa. Revalidar trimestralmente. Adapter PE puede quedar stub en v1.0.2.
5. **CFDI 4.0 TipoCambio para REP** cuando factura y pago son monedas distintas — caso documentado por SAT que requiere validación adicional con el PAC integrado en testing.
6. **Cifras "73 % de quejas por extra fees"** y "40-60 % guests pagan USD en Tulum" — observaciones de campo y community threads, no estudios formales verificables. Usar como guía direccional, no como assertion académica.

---

## Bitácora de revisiones

- **2026-05-15 (PM late)** — Sección **J · Catálogo nativo Zenix + LATAM coverage matrix** agregada tras investigación profunda de 32 estados MX + 9 países LATAM + fricción competitiva (Mews, Cloudbeds, Opera, RoomRaccoon). 4 decisiones nuevas §91-§94: catálogo nativo curado internamente por rol `TAX_CURATOR` Zenix, modelo de override en dos capas con precedencia PROPERTY > LEGAL_ENTITY > base, Brasil EXCLUIDO v1.0.x con Sovos como adapter post v1.2, `status='AMBIGUOUS'` para entradas no verificables (caso Tulum DSA documentado). Matriz completa MX 32 estados ISH 2026 (Yucatán bajó 5→4.5 %, plataformas digitales con tarifa diferenciada en QR/CDMX/GRO/QRO/JAL). Setup wizard objetivo: 6-8 clicks vs ~30 Cloudbeds (Sweller 1988 cognitive load).
- **2026-05-15 (PM)** — Versión inicial. Consolidación de investigación competitiva (2 agentes paralelos) + decisiones arquitectónicas §81-§90 propuestas.
