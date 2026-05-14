# 08 · Zenix Books — Contabilidad Multi-País

> Versión activación: **v1.8 (Q3 2028)**
> Streams: **R9 (Books subscription)**
> Países iniciales: México (CFDI 4.0) + Colombia (DIAN). Otros en v1.8.x sucesivos.

---

## 1. Por qué este módulo es el "máximo lock-in"

**Realidad:**
- Un hotel boutique opera con: Excel + contador externo + (a veces) SAP Business One Hotel o Xero
- Cambiar de PMS es factible (migración de datos posible)
- **Cambiar de sistema contable es prácticamente imposible** — implica migrar histórico fiscal de 5+ años, re-certificar con SAT/DIAN, re-entrenar al contador
- Una vez que el hotel pone su contabilidad en Zenix, **no se va a ningún lado**

**Posicionamiento estratégico:**
- v1.0-v1.7 = "Zenix es nuestra operación" (factible cambiar)
- v1.8+ con Books adoptado = "Zenix es nuestro hotel" (cambio implausible)

Esto es exactly what hace a SAP irreemplazable en empresas grandes. Una vez que ECC/S4HANA tiene 10 años de financials, nadie migra a Oracle. Books es la versión hotelera de eso.

**Competencia:** SAP Business One Hotel (enterprise pricing), Sage Intacct Hospitality, Xero + manual integrations, ContPAQi MX, Alegra LATAM, Siigo Colombia. **Ninguno tiene PMS integrado nativo.**

---

## 2. Funcionalidad

### Core accounting

| Sub-feature | Qué hace | Equivalente |
|-------------|----------|-------------|
| **Chart of Accounts USALI 12 ed** | Plan de cuentas estándar hotelería + ajustable | SAP B1 Hotel |
| **General Ledger** | Asientos contables con audit trail inmutable | Xero |
| **Accounts Receivable** | Facturación a huéspedes + corporativos | Sage Intacct |
| **Accounts Payable** | Gestión facturas proveedores (consume Procure) | QuickBooks |
| **Bank reconciliation** | Conciliación con extractos bancarios (Plaid / Belvo) | Xero |
| **Multi-currency** | Operación en MXN/USD/COP con FX automático | Xero |
| **Cash flow forecasting** | Predicción de caja 30/60/90 días | Float, Fathom |
| **Budget vs Actual** | Presupuesto anual con tracking mensual | Sage Intacct |

### Hotel-specific reports (USALI compliant)

| Reporte | Frecuencia | Audiencia |
|---------|-----------|-----------|
| **Daily Income Statement** | Diaria | Gerente |
| **Monthly P&L USALI** | Mensual | Owner, board |
| **GOPPAR (Gross Op Profit Per Available Room)** | Mensual | Owner, inversionistas |
| **Department P&L** | Mensual | Por jefe de área (F&B, Rooms, Spa) |
| **Balance Sheet** | Mensual | Owner, auditor |
| **Cash Flow Statement** | Mensual | CFO |
| **STR Report (data export)** | Mensual | Si suscriben a STR |

### Tax compliance por país

**México (v1.8 inicial):**
- CFDI 4.0 — emisión de facturas con timbrado certificado (PAC)
- Complemento de Pagos (REP)
- Declaración mensual ISR provisional
- Declaración mensual IVA
- DIOT (Declaración Informativa de Operaciones con Terceros)
- Constancia de retenciones a proveedores
- Cumplimiento Anexo 20 SAT 2026

**Colombia (v1.8 inicial):**
- Facturación electrónica DIAN
- IVA mensual / bimestral
- Retención en la fuente
- ICA municipal
- Reteica
- Declaración anual renta

---

## 3. Países sucesivos (v1.8.x)

| País | Versión | Complejidad principal |
|------|---------|----------------------|
| Perú | v1.8.1 | SUNAT + RUC + Comprobantes electrónicos |
| Argentina | v1.8.2 | AFIP + Inflación + Ajuste por inflación |
| Chile | v1.8.3 | SII + Factura electrónica |
| Brasil | v1.8.4 | NF-e + Complejidad federal/estatal |
| Costa Rica | v1.8.5 | DGT + Factura electrónica |
| República Dominicana | v1.8.5 | DGII + NCF |
| España | v1.8.6 | SII AEAT + Modelo 303/390 |

---

## 4. Datos para ZaharDev

| Data point | Producto derivado |
|------------|-------------------|
| GOPPAR cross-property | **Financial benchmarks USALI-grade** (vendible a inversionistas) |
| Margen por departamento | Operational efficiency consulting |
| Cash conversion cycle | Treasury optimization reports |
| OPEX patterns | Cost optimization consulting |
| Revenue mix (Rooms / F&B / Other) | Market positioning reports |
| ADR vs OCC vs RevPAR | Pricing strategy consulting |

**Ejemplo de insight comercial vendible a inversionistas:** "Hoteles boutique 30-50 habitaciones en Tulum tienen GOPPAR promedio de $42 USD. Top quartile $78. Bottom quartile $18. El driver del top quartile es food cost % (28% vs 41%) y labor productivity (12 minutes/room vs 22)."

Esto vale **$25K-50K USD** a un grupo inversor que evalúa comprar un hotel.

---

## 5. Arquitectura técnica

### Schema delta

```prisma
model ChartOfAccount {
  id              String   @id @default(uuid())
  organizationId  String
  code            String   // "100-1000-001"
  name            String   // "Cash on Hand"
  type            AccountType  // ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
  parentId        String?
  usaliCategory   String?  // mapping USALI 12 ed
  isActive        Boolean
  // ...
}

model JournalEntry {
  id              String   @id @default(uuid())
  organizationId  String
  propertyId      String
  date            DateTime
  reference       String
  description     String
  sourceModule    String   // "PMS", "POS", "PROCURE", "PEOPLE", "MANUAL"
  sourceEntityId  String?  // FK a folio, tab, payroll, etc.
  isReversal      Boolean  @default(false)
  reversesEntryId String?
  createdById     String
  approvedById    String?
  // immutable: no @updatedAt
}

model JournalLine {
  id            String   @id @default(uuid())
  entryId       String
  accountId     String   // FK ChartOfAccount
  debitAmount   Decimal? @db.Decimal(15,2)
  creditAmount  Decimal? @db.Decimal(15,2)
  currency      String
  exchangeRate  Decimal? @db.Decimal(10,6)
  description   String?
  // ...
}

model FiscalDocument {
  id                String   @id @default(uuid())
  organizationId    String
  propertyId        String
  type              DocType  // INVOICE, CREDIT_NOTE, DEBIT_NOTE, PAYMENT_COMPLEMENT
  country           String   // 'MX', 'CO', etc.
  status            DocStatus // PENDING, STAMPED, CANCELLED
  totalAmount       Decimal  @db.Decimal(12,2)
  currency          String
  cfdiUuid          String?  // MX
  cfdiXml           String?  // raw XML
  cfdiPdf           String?
  dianCufe          String?  // CO
  recipientTaxId    String?
  recipientName     String
  guestStayId       String?
  // ...
}

model BankAccount {
  id              String   @id @default(uuid())
  organizationId  String
  propertyId      String
  name            String
  bank            String
  accountNumber   String   // encrypted
  currency        String
  // ...
}

model BankTransaction {
  id            String   @id @default(uuid())
  accountId     String
  date          DateTime
  description   String
  amount        Decimal  @db.Decimal(15,2)
  reconciledWithEntryId String?
  externalId    String?  // ID en Plaid/Belvo
  // ...
}

enum AccountType { ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE }
enum DocType { INVOICE, CREDIT_NOTE, DEBIT_NOTE, PAYMENT_COMPLEMENT, EXPENSE }
enum DocStatus { PENDING, STAMPED, CANCELLED }
```

### Servicios modulares por país

```
apps/api/src/books/
├── books.module.ts
├── ledger.service.ts             // GL core
├── ar.service.ts                  // Accounts Receivable
├── ap.service.ts                  // Accounts Payable
├── reconciliation.service.ts
├── reporting.service.ts           // USALI reports
└── country/
    ├── country-tax.interface.ts
    ├── mx/
    │   ├── mx-cfdi.service.ts     // PAC integration
    │   ├── mx-tax.calculator.ts
    │   └── sat-validators.ts
    ├── co/
    │   ├── co-dian.service.ts
    │   ├── co-tax.calculator.ts
    │   └── ...
    └── ...
```

### Integraciones bancarias

- **Plaid** — USA, parcial LATAM
- **Belvo** — México, Colombia, Brasil, Chile (open banking nativo LATAM)
- **STP/SPEI** — México transferencias

---

## 6. Integraciones cruzadas (Books consume todo)

### Con Zenix PMS
- Cada PaymentLog en folio → JournalEntry automático: Bank/Cash + Revenue + Tax
- No-show charges → asiento de penalty revenue
- Refunds → asiento reverso

### Con Zenix POS
- Cada Tab cerrada → asiento: Bank/AR + F&B Revenue + IVA + COGS

### Con Zenix Procure
- PO recibida + factura matched → asiento AP: Inventory + IVA = AP
- Pago a proveedor → asiento AP: AP = Cash

### Con Zenix People
- Cada Payroll → asiento: Salarios + Tax retentions = Bank

### Con Zenix Access (mantenimiento recurring)
- Invoice anual → AR automático

**Resultado:** todo el ciclo contable corre **sin intervención manual**. El contador solo revisa, no captura.

---

## 7. Esfuerzo estimado

| Sprint | Alcance | Semanas |
|--------|---------|---------|
| **BOOKS-CORE** | ChartOfAccounts USALI + JournalEntry + Ledger | 4 |
| **BOOKS-AR-AP** | Accounts Receivable + Accounts Payable + reconciliation | 4 |
| **BOOKS-MX** | Calculadora MX + CFDI 4.0 + PAC integration + reportes SAT | 6 |
| **BOOKS-CO** | Calculadora CO + DIAN + reportes | 5 |
| **BOOKS-REPORTS** | Reports USALI 12 ed + GOPPAR + Balance Sheet + Cash Flow | 4 |
| **BOOKS-BANK** | Belvo/Plaid integration + reconciliación automática | 3 |
| **BOOKS-INTEGRATIONS** | Bridges con PMS, POS, Procure, People | 3 |

**Total: ~29 semanas (~7 meses)** para v1.8 con MX + CO.

Países sucesivos: ~6-8 semanas c/u.

---

## 8. Riesgos y mitigaciones

### Riesgo 1 — Certificación PAC en México (CFDI)
Cada timbre cuesta dinero. Requiere convenio con PAC certificado (Facturama, Solución Factible, etc.).
**Mitigación:** convenio reseller con PAC. ZaharDev compra timbres en volumen y revende a margen.

### Riesgo 2 — Cambios fiscales frecuentes
SAT/DIAN actualizan reglas todos los años.
**Mitigación:** suscripción a Thompson Reuters Checkpoint + revisión trimestral por abogado fiscal local.

### Riesgo 3 — Cliente no quiere migrar de SAP B1
Hoteles con SAP ya invertido NO van a migrar.
**Mitigación:** ofrecer Books como módulo independiente con import de SAP B1 + run-parallel 3 meses. ROI claro: ahorro $30K-100K/año en SAP licensing.

### Riesgo 4 — Errores en CFDI generan multa al hotel
**Mitigación:** SLA contractual con responsabilidad limitada. Validación XSD automática antes de timbrar.

### Riesgo 5 — Contadores resistentes al cambio
**Mitigación:** Books exporta a formato compatible con ContPAQi, Aspel, Siigo. El contador externo puede seguir trabajando como hoy.

---

## 9. Posicionamiento

| Vs SAP B1 Hotel | Vs Xero | Vs ContPAQi | Vs Siigo |
|-----------------|---------|-------------|---------|
| Mejor: 10× más barato | Mejor: hotel-native + integración PMS | Mejor: integración + USALI | Mejor: PMS integrado + multi-país |
| Peor: madurez enterprise | Peor: madurez accounting | Peor: madurez accounting | Peor: madurez accounting |

**Pitch:** "Si tu PMS, POS, compras, y nómina están en Zenix, ¿por qué tu contabilidad sigue en SAP B1 que cuesta 50K al año y nadie sabe usar? Books cierra el círculo. USALI nativo, CFDI/DIAN automático, GOPPAR en un click. Tu contador ya no captura — revisa."

---

## 10. Bitácora de revisiones

- **2026-05-13** — Documento creado. Books posicionado como máximo lock-in del ecosistema. Multi-país country-by-country en v1.8.x.
