# PAY-CORE v1.0.1 — Prisma migration draft

> **Audiencia:** ingeniería v1.0.1 PAY-CORE.
> **Estado:** DRAFT — listo para revisión y ajuste antes de generar migration real.
> **Versión target:** v1.0.1 PAY-CORE (entidades) + v1.0.2 CFDI-CORE (extiende con TaxCatalogEntry).
> **Última actualización:** 2026-05-15.

Este documento contiene el **esquema Prisma completo** que se debe agregar a `apps/api/prisma/schema.prisma` para implementar las decisiones §81-§94. Está pensado para ser revisado, ajustado, y luego convertido en migration real via:

```bash
cd apps/api
npx prisma migrate dev --name v1_0_1_pay_core_entities
```

**No** ejecutar `prisma migrate dev` directamente desde este draft — copiar primero al schema y revisar los `@relation` con los modelos preexistentes (`Property`, `LegalEntity`, `Organization`, `GuestStay`, `GuestProfile`, `Folio`, `Staff`, `PaymentLog`).

---

## Estructura de la migración

Se divide en **5 bloques** que se pueden mergear como una sola migration o secuencialmente:

| Bloque | Modelos | Decisiones | Esfuerzo |
|---|---|---|---|
| **1. Multi-currency** | `ExchangeRate`, `PaymentFxLock` | §81, §83, §88 | 0.5 sem |
| **2. Cash Drawer** | `CashierShift`, `CashMovement` | §85 | 0.75 sem |
| **3. OTA-collect** | `GuestStay.paymentModel` (extensión) | §87 | 0.25 sem |
| **4. GuestCredit** | `GuestCredit`, `GuestCreditApplication`, `GuestCreditLog` | §86, §90 | 1.5 sem |
| **5. Tax Catalog** | `TaxCatalogEntry`, `TaxCatalogOverride`, `TaxApplicationLog`, `UmaValue`, `FiscalCreditNote` | §82, §84, §91-§94 | 1.5 sem (v1.0.2) |

---

## Bloque 1 — Multi-currency + FX lock (§81, §83, §88)

```prisma
enum ExchangeRateSource {
  BANXICO_FIX
  BANXICO_LIQUIDATION
  OPEN_EXCHANGE_RATES
  ECB
  MANUAL_OVERRIDE
  STRIPE_REPORTED
}

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
  sourceChecksum  String?  // para cron de verificación

  legalEntity     LegalEntity? @relation(fields: [legalEntityId], references: [id])
  property        Property?    @relation(fields: [propertyId], references: [id])

  @@index([baseCurrency, targetCurrency, validFrom])
  @@index([legalEntityId, propertyId])
  @@index([source, fetchedAt])
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
  reconciledAt    DateTime?
  reconciledFromPayoutId String?

  paymentLog      PaymentLog   @relation(fields: [paymentLogId], references: [id])
  guestStay       GuestStay    @relation(fields: [guestStayId], references: [id])
  exchangeRate    ExchangeRate @relation(fields: [exchangeRateId], references: [id])

  @@index([guestStayId])
  @@index([reconciledAt])
}
```

**Cambios a modelos preexistentes:**

```prisma
model PaymentLog {
  // ... campos existentes
  paidCurrency    String   @db.VarChar(3) // ISO 4217 — default = property base currency
  paidAmount      Decimal? @db.Decimal(18, 4) // monto en paidCurrency
  baseAmount      Decimal? @db.Decimal(18, 4) // monto convertido a moneda de property
  fxLock          PaymentFxLock?
  cashierShiftId  String?  // requerido cuando method=CASH
  cashierShift    CashierShift? @relation(fields: [cashierShiftId], references: [id])

  // PaymentMethod enum se mantiene SIN factorizar por divisa (§88)
}
```

> **Migration step:** UPDATE existing `PaymentLog` rows con `paidCurrency = property.currency` (backfill).

---

## Bloque 2 — Cash Drawer multi-divisa (§85)

```prisma
enum CashierShiftStatus {
  OPEN
  CLOSED
  RECONCILED
  DISPUTED
}

model CashierShift {
  id              String   @id @default(cuid())
  staffId         String
  propertyId      String
  legalEntityId   String
  organizationId  String   // multi-tenant guard

  openedAt        DateTime
  closedAt        DateTime?
  status          CashierShiftStatus @default(OPEN)

  // Multi-divisa — Json { MXN: 2000, USD: 0, EUR: 0 }
  openingFloat    Json
  expectedClose   Json?    // calculado al cerrar
  actualClose     Json?    // ingresado por cajero (conteo físico)
  variance        Json?    // { MXN: -5, USD: +20, EUR: 0 }
  varianceReason  String?  @db.Text  // requerido si abs(variance) > threshold
  reconciledById  String?
  reconciledAt    DateTime?

  staff           Staff    @relation("ShiftCashier", fields: [staffId], references: [id])
  property        Property @relation(fields: [propertyId], references: [id])
  legalEntity     LegalEntity @relation(fields: [legalEntityId], references: [id])
  reconciledBy    Staff?   @relation("ShiftReconciler", fields: [reconciledById], references: [id])
  payments        PaymentLog[]
  movements       CashMovement[]

  @@index([propertyId, staffId, openedAt])
  @@index([status, openedAt])
}

enum CashMovementType {
  PAID_IN
  PAID_OUT
  CHANGE_GIVEN
  FX_CONVERSION
  CORRECTION
  OPENING_FLOAT
}

model CashMovement {
  id              String   @id @default(cuid())
  shiftId         String
  type            CashMovementType
  currency        String   @db.VarChar(3)
  amount          Decimal  @db.Decimal(12, 2)
  paymentLogId    String?
  transactionGroupId String? // agrupa PAID_IN USD + CHANGE_GIVEN MXN como una transacción

  notes           String?  @db.Text
  createdAt       DateTime @default(now())
  createdById     String

  shift           CashierShift @relation(fields: [shiftId], references: [id])
  paymentLog      PaymentLog?  @relation(fields: [paymentLogId], references: [id])
  createdBy       Staff        @relation(fields: [createdById], references: [id])

  @@index([shiftId, createdAt])
  @@index([transactionGroupId])
}
```

**PropertySettings nuevas columnas:**

```prisma
model PropertySettings {
  // ... campos existentes
  cashVarianceThreshold      Decimal? @db.Decimal(8, 2) @default(50) // MXN
  cashShiftAutoCloseHours    Int      @default(24) // alerta supervisor si shift abierto >24h
  guestCreditEnabled         Boolean  @default(true)
  guestCreditExpirationMonths Int     @default(12)
  guestCreditApprovalThreshold Decimal? @db.Decimal(12, 2)
  guestCreditMultiCurrencyMode String  @default("KEEP_ORIGINAL")
  taxStrategy                String   @default("INCLUSIVE") // INCLUSIVE_DISPLAY | EXCLUSIVE_DISPLAY
}
```

---

## Bloque 3 — OTA-collect detection (§87)

```prisma
enum PaymentCollectModel {
  HOTEL_COLLECT
  OTA_COLLECT
  HYBRID_DEPOSIT
}

model GuestStay {
  // ... campos existentes
  paymentModel    PaymentCollectModel @default(HOTEL_COLLECT)
  otaVirtualCardId String?  // ref al token VCC cuando OTA entrega tarjeta virtual
  otaCommissionPercent Decimal? @db.Decimal(5, 4) // info para reconciliación (no descuenta del folio)
  otaPayoutExpectedAt  DateTime? // cuándo esperar el payout (Booking suele +30d post-checkout)
}
```

**Lógica en `confirmCheckin`:**

```typescript
async function confirmCheckin(stayId: string, actor: JwtPayload) {
  const stay = await this.prisma.guestStay.findUniqueOrThrow({ where: { id: stayId } })

  if (stay.paymentModel === 'HOTEL_COLLECT') {
    // Guard existente — exige balance pagado salvo COMP
    if (stay.folio.balance.gt(0) && !stay.folio.hasCompApproval) {
      throw new ConflictException('Balance unpaid; collect payment or mark COMP first')
    }
  }
  // OTA_COLLECT: no exige balance (la OTA es merchant of record)
  // HYBRID_DEPOSIT: balance = totalCharges - depositReceived
  // ...
}
```

---

## Bloque 4 — GuestCredit (§86, §90)

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
  organizationId      String
  legalEntityId       String   // §64 — fiscal por LegalEntity
  propertyId          String

  guestProfileId      String
  sourceStayId        String?
  sourceFolioId       String?

  originalAmount      Decimal  @db.Decimal(12, 2)
  consumedAmount      Decimal  @default(0) @db.Decimal(12, 2)
  remainingAmount     Decimal  @db.Decimal(12, 2)
  currency            String   @db.VarChar(3)

  status              GuestCreditStatus @default(ISSUED)
  origin              GuestCreditOrigin
  reason              String   @db.Text

  issuedAt            DateTime @default(now())
  expiresAt           DateTime?
  voidedAt            DateTime?
  voidedReason        String?

  issuedById          String
  approvedById        String?
  approvalThreshold   Decimal? @db.Decimal(12, 2)

  fiscalCreditNoteId  String?  @unique // CFDI E ID
  fiscalRequired      Boolean  @default(true)

  transferable        Boolean  @default(false)
  transferredToGuestId String?
  transferredAt       DateTime?

  // §90 — mitigación OTA commission
  applicableChannels  String[] @default(["DIRECT"])

  organization        Organization      @relation(fields: [organizationId], references: [id])
  legalEntity         LegalEntity       @relation(fields: [legalEntityId], references: [id])
  property            Property          @relation(fields: [propertyId], references: [id])
  guestProfile        GuestProfile      @relation("CreditOwner", fields: [guestProfileId], references: [id])
  sourceStay          GuestStay?        @relation("CreditSource", fields: [sourceStayId], references: [id])
  sourceFolio         Folio?            @relation("CreditSourceFolio", fields: [sourceFolioId], references: [id])
  issuedBy            Staff             @relation("CreditIssuer", fields: [issuedById], references: [id])
  approvedBy          Staff?            @relation("CreditApprover", fields: [approvedById], references: [id])
  fiscalCreditNote    FiscalCreditNote? @relation(fields: [fiscalCreditNoteId], references: [id])
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

  exchangeRate      Decimal? @db.Decimal(12, 6)
  amountAppliedInFolioCurrency Decimal? @db.Decimal(12, 2)

  reversedAt        DateTime?
  reversedById      String?
  reversalReason    String?

  credit            GuestCredit @relation(fields: [creditId], references: [id])
  appliedToFolio    Folio       @relation(fields: [appliedToFolioId], references: [id])
  appliedBy         Staff       @relation(fields: [appliedById], references: [id])

  @@index([creditId])
  @@index([appliedToFolioId])
}

model GuestCreditLog {
  id          String   @id @default(cuid())
  creditId    String
  event       String
  actorId     String?
  metadata    Json
  createdAt   DateTime @default(now())

  credit      GuestCredit @relation(fields: [creditId], references: [id])

  @@index([creditId, createdAt])
}
```

---

## Bloque 5 — Tax Catalog + UmaValue + FiscalCreditNote (v1.0.2 CFDI-CORE — §82, §84, §91-§94)

```prisma
enum TaxType {
  VAT
  LODGING_TAX
  ENVIRONMENTAL
  TOURISM_PARAFISCAL
  MUNICIPAL_ISS
  STATE_VAT_BR
  SERVICE_FEE
  OTHER
}

enum TaxCalculation {
  PERCENT_OF_BASE
  FIXED_PER_ROOM_NIGHT
  FIXED_PER_PERSON_NIGHT
  UMA_MULTIPLIER
  UMA_PER_PERSON_TIERED
  PER_BOOKING
}

enum CatalogStatus {
  ACTIVE
  DEPRECATED
  DRAFT
  AMBIGUOUS
  NEEDS_REVIEW
}

enum OverrideScope {
  LEGAL_ENTITY
  PROPERTY
}

model TaxCatalogEntry {
  id                String   @id @default(cuid())

  country           String   @db.VarChar(2)
  region            String?  @db.VarChar(10)
  municipality      String?

  taxType           TaxType
  calculation       TaxCalculation
  rateValue         Decimal? @db.Decimal(12, 6)
  fixedAmount       Decimal? @db.Decimal(12, 4)
  fixedCurrency     String?  @db.VarChar(3)
  tieredRates       Json?

  baseIncludesTaxes String[] @default([])

  appliesToPlatformDigital Boolean @default(false)
  appliesToMotel    Boolean @default(false)
  appliesToCorporate Boolean @default(true)

  validFrom         DateTime
  validTo           DateTime?
  sourceUrl         String
  sourceChecksum    String?
  legalReference    String
  lastVerifiedAt    DateTime?
  verifiedBy        String?
  verificationNotes String? @db.Text

  status            CatalogStatus @default(DRAFT)
  successorId       String?

  cfdiTrasladoCode  String? @db.VarChar(10)
  metadata          Json?

  successor         TaxCatalogEntry?  @relation("CatalogSuccession", fields: [successorId], references: [id])
  predecessors      TaxCatalogEntry[] @relation("CatalogSuccession")
  overrides         TaxCatalogOverride[]
  applications      TaxApplicationLog[]

  @@index([country, region, municipality, validFrom])
  @@index([status, validFrom])
}

model TaxCatalogOverride {
  id              String   @id @default(cuid())
  catalogEntryId  String
  scope           OverrideScope
  scopeId         String        // legalEntityId o propertyId
  organizationId  String        // multi-tenant guard

  disabled        Boolean  @default(false)
  customRate      Decimal? @db.Decimal(12, 6)
  customFixedAmount Decimal? @db.Decimal(12, 4)

  reason          String   @db.Text
  approvedById    String
  approvedAt      DateTime @default(now())
  validFrom       DateTime
  validTo         DateTime?

  catalogEntry    TaxCatalogEntry @relation(fields: [catalogEntryId], references: [id])
  approvedBy      Staff           @relation(fields: [approvedById], references: [id])

  @@index([scope, scopeId, validFrom])
  @@index([organizationId])
}

model TaxApplicationLog {
  id              String   @id @default(cuid())
  guestStayId     String
  folioLineId     String?
  catalogEntryId  String
  catalogSnapshot Json     // entry serializado al momento de aplicar

  baseAmount      Decimal  @db.Decimal(12, 4)
  taxAmount       Decimal  @db.Decimal(12, 4)
  currency        String   @db.VarChar(3)
  calculationSnapshot Json
  occupants       Int?

  appliedAt       DateTime @default(now())
  voidsApplicationId String?

  guestStay       GuestStay       @relation(fields: [guestStayId], references: [id])
  catalogEntry    TaxCatalogEntry @relation(fields: [catalogEntryId], references: [id])

  @@index([guestStayId])
  @@index([appliedAt])
}

model UmaValue {
  id          String   @id @default(cuid())
  country     String   @default("MX") @db.VarChar(2)
  value       Decimal  @db.Decimal(12, 4)
  validFrom   DateTime
  validTo     DateTime?

  @@unique([country, validFrom])
  @@index([country, validFrom])
}

model FiscalCreditNote {
  id              String   @id @default(cuid())
  organizationId  String
  legalEntityId   String

  sourceCfdiIngresoUuid String?  // CFDI I original referenciado
  cfdiEgresoUuid  String?  @unique  // UUID del CFDI E emitido (post timbrado)
  cfdiEgresoXml   String?  @db.Text
  cfdiEgresoPdf   Bytes?

  formaPago       String   @db.VarChar(2)  // "15" Condonación | "01" Efectivo | ...
  usoCfdi         String   @db.VarChar(5)  // "G02" Devoluciones, descuentos o bonificaciones
  motivoCancelacion String? @db.VarChar(2)

  amount          Decimal  @db.Decimal(12, 2)
  currency        String   @db.VarChar(3)
  exchangeRate    Decimal? @db.Decimal(18, 8)

  pacAdapter      String   // 'FACTURAMA' | 'SW_SAPIEN' | ...
  pacResponseRaw  Json?

  emittedAt       DateTime @default(now())
  emittedById     String

  legalEntity     LegalEntity   @relation(fields: [legalEntityId], references: [id])
  guestCredit     GuestCredit?

  @@index([organizationId])
  @@index([legalEntityId, emittedAt])
}
```

---

## Roles RBAC nuevos (extender Staff.systemRole)

```prisma
enum SystemRole {
  // existentes
  RECEPTIONIST
  HOUSEKEEPER
  SUPERVISOR
  // nuevos PAY-CORE
  TAX_CURATOR        // Zenix interno — CRUD TaxCatalogEntry
  FINANCE_AUDITOR    // cliente — read-only de PaymentFxLock, CashierShift, GuestCredit
}
```

> Aclaración: `TAX_CURATOR` es interno de Zenix (Org root admin). No es asignable a un staff de un cliente. Se valida con `actor.organizationId === ZENIX_ROOT_ORG_ID`.

---

## Pasos para ejecutar la migration

1. **Copiar schemas al `apps/api/prisma/schema.prisma`** en este orden:
   - Enums primero (todos los nuevos)
   - UmaValue (sin dependencies)
   - ExchangeRate
   - CashierShift + CashMovement
   - PaymentFxLock (FK a ExchangeRate)
   - GuestStay extension (paymentModel)
   - GuestCredit + Application + Log + FiscalCreditNote
   - TaxCatalogEntry + Override + ApplicationLog
   - PropertySettings extension
2. **Revisar @relation** con los modelos existentes (Property, LegalEntity, Organization, GuestStay, GuestProfile, Folio, Staff, PaymentLog).
3. **Generar migration:**
   ```bash
   cd apps/api
   npx prisma migrate dev --name v1_0_1_pay_core_entities
   ```
4. **Backfill scripts** (en un segundo migration):
   - `UPDATE PaymentLog SET paidCurrency = property.currency WHERE paidCurrency IS NULL`
   - Seed inicial `UmaValue` para MX (3 valores históricos — ver `PAY-CORE-tax-catalog-seed.md`)
5. **Sembrar Tax Catalog** vía `prisma db seed` con datos de `PAY-CORE-tax-catalog-seed.md`.
6. **Tests E2E críticos:**
   - PaymentLog en USD con FxLock atómico
   - CashierShift abre/cierra con variance per-divisa
   - GuestCredit emisión + aplicación intra-LegalEntity
   - GuestCredit aplicado a LegalEntity distinta → debe rechazar
   - TaxCatalogOverride PROPERTY > LEGAL_ENTITY > base resolución correcta
   - resolveTaxesForProperty con DSA Tulum status=AMBIGUOUS → wizard solicita modalidad

---

## Bitácora de revisiones

- **2026-05-15** — Versión inicial DRAFT. Cubre los 5 bloques de migration (multi-currency, cash drawer, OTA-collect, GuestCredit, Tax Catalog). Listo para revisión y conversión a Prisma schema real.
