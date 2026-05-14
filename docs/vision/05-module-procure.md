# 05 · Zenix Procure — Compras y Costos

> Versión activación: **v1.4 (Q3 2027)**
> Streams: **R3 (Procure subscription), R11 semilla (Marketplace v1.9)**

---

## 1. Por qué este módulo redefine a Zenix

Un hotel boutique gasta:
- **20-30%** de revenue en F&B (food & beverage)
- **8-12%** en amenities (jabón, papel, sábanas)
- **4-6%** en OS&E (Operating Supplies & Equipment)
- **15-20%** en labor (cubierto por People)

**Zenix PMS v1.0 cubre solo labor de housekeeping. Zenix Procure cubre los otros 32-48% del costo operativo total.** Es el módulo que convierte a Zenix de "PMS competitivo" a "sistema de gestión hotelera integral".

Sin Procure, el hotel sigue usando Excel + email para gestionar proveedores. Con Procure, ZaharDev tiene visibilidad cross-property de qué compran, a quién, a qué precio.

---

## 2. Funcionalidad — Para el hotel (visible)

| Sub-feature | Qué hace | Equivalente competidor |
|-------------|----------|------------------------|
| **Catálogo de SKUs** | Items con UoM, par levels, supplier preferido, categoría USALI | Birchstreet, Adaco |
| **Purchase Orders** | Crear, aprobar, recibir POs con audit trail | M3 (Sage Intacct), Adaco |
| **Three-way matching** | PO + Recibo + Factura = pago auto-aprobado | Stripe-level automation |
| **Inventory tracking** | Conteo físico vs sistema, alertas par level bajo | Birchstreet |
| **Cost-of-goods (COGS)** | Reportes USALI 12 ed por departamento | Opera, Sun (Sage) |
| **Recetas (BOM)** | Plato de menú con ingredientes → costo plato auto-calc | Optimum Control |
| **Aprobaciones por monto** | $100 = chef · $500 = manager · $2000 = owner | Quore |
| **Proveedor scorecards** | Tasa cumplimiento, on-time, precio histórico | Birchstreet |
| **Mobile scanner** | App para conteo físico con código de barras | Lightspeed |
| **Reorder automation** | PO auto-generada cuando par level baja | Birchstreet Pro |
| **Vendor catalog** | Catálogos electrónicos por proveedor | EDI / Punchout |

---

## 3. Funcionalidad — Para ZaharDev (datos cross-property)

| Sub-feature | Valor de negocio |
|-------------|------------------|
| **Price Index agregado** | "Hoteles boutique en Cancún pagan $45/kg de tomate en mayo" → Benchmark vendible |
| **Margin Intelligence** | "Hotel X paga 23% por encima del promedio en amenities" → Lead para consultoría |
| **Supplier Performance Cross-Property** | "Proveedor A entrega tarde 18% en mayo vs 4% en abril" → Insight para hotel + presión sobre proveedor |
| **Demand Forecasting** | "Hoteles con +15% ocupación en julio compraron 30% más amenities el 1 de junio" → Predictivo |
| **Procurement Health Score** | KPI compuesto que ZaharDev ofrece como "diagnóstico" → Pull para servicios premium |
| **Geographic clustering** | Qué proveedores sirven qué ciudades → base para Marketplace v1.9 |

---

## 4. Marketplace v1.9 — El play de los datos

Cuando 5+ hoteles usan Procure en una zona (Cancún, CDMX, Medellín):
1. ZaharDev tiene datos de **qué compran, a quién, a qué precio**
2. Negocia volúmenes con proveedores: "Te garantizo 5 hoteles, dame 12% descuento"
3. Lanza marketplace donde hoteles compran al precio negociado
4. **ZaharDev cobra comisión 5-15% al proveedor (no al hotel)**
5. **El hotel paga menos, el proveedor vende más, ZaharDev gana comisión.** Win-win-win clásico de two-sided marketplace.

**Referencia de mercado:** modelo **Avendra** (procurement broker para Marriott, IHG, Hyatt — vendido a Aramark por $1.35B en 2017). Misma jugada, mercado LATAM más pequeño pero menos competido.

### Arquitectura del Marketplace

```
HOTELES (consumidores Procure)
        │
        ▼
ZAHARDEV MARKETPLACE LAYER
- Catálogo agregado
- Pricing negociado
- Order routing
        │
        ▼
PROVEEDORES VETTED
- Onboarding por ZaharDev
- Rating cross-hotel
- Comisión 5-15% al cierre
```

---

## 5. Arquitectura técnica

### Schema preliminar (NO implementar hasta v1.4)

```prisma
model Sku {
  id              String   @id @default(uuid())
  organizationId  String
  name            String
  category        SkuCategory   // F&B, AMENITIES, OS&E, FF&E
  subcategory     String?
  uom             String        // "kg", "lt", "pza"
  parLevel        Float?
  preferredSupplierId String?
  imageUrl        String?
  // ...
}

model Supplier {
  id              String   @id @default(uuid())
  organizationId  String
  name            String
  contact         Json     // email, phone, address
  taxId           String?  // RFC, NIT, RUC según país
  paymentTerms    String?  // "30 days", "COD"
  // ...
}

model PurchaseOrder {
  id              String       @id @default(uuid())
  propertyId      String
  supplierId      String
  status          PoStatus     // DRAFT, PENDING_APPROVAL, APPROVED, SENT, RECEIVED, CLOSED, CANCELLED
  totalAmount     Decimal      @db.Decimal(12,2)
  currency        String
  approvedById    String?
  approvedAt      DateTime?
  createdById     String
  // ...
}

model PurchaseOrderItem {
  id        String  @id @default(uuid())
  poId      String
  skuId     String
  qty       Float
  unitPrice Decimal @db.Decimal(10,2)
  qtyReceived Float @default(0)
  // ...
}

model InventoryMovement {
  id          String   @id @default(uuid())
  skuId       String
  propertyId  String
  type        MovementType  // RECEIPT, CONSUMPTION, ADJUSTMENT, WASTE, TRANSFER
  qty         Float    // signed: + recibo, - consumo
  reasonCode  String?
  sourcePoId  String?
  sourceOrderItemId String?  // si consumo viene de POS recipe
  staffId     String?
  // ...
}

model Invoice {
  id                String   @id @default(uuid())
  poId              String?
  supplierId        String
  supplierInvoiceNumber String
  amount            Decimal  @db.Decimal(12,2)
  currency          String
  paymentStatus     InvoicePaymentStatus // PENDING, PAID, OVERDUE, DISPUTED
  cfdiUuid          String?  // CFDI MX
  dianFolio         String?  // DIAN CO
  // ...
}

model Recipe {
  id           String   @id @default(uuid())
  organizationId String
  name         String
  yieldQty     Float
  yieldUom     String
  // ...
}

model RecipeItem {
  id       String @id @default(uuid())
  recipeId String
  skuId    String
  qty      Float
  uom      String
  // ...
}

enum SkuCategory { F_AND_B, AMENITIES, OS_AND_E, FF_AND_E, OTHER }
enum PoStatus { DRAFT, PENDING_APPROVAL, APPROVED, SENT, RECEIVED, CLOSED, CANCELLED }
enum MovementType { RECEIPT, CONSUMPTION, ADJUSTMENT, WASTE, TRANSFER }
enum InvoicePaymentStatus { PENDING, PAID, OVERDUE, DISPUTED }
```

---

## 6. Integraciones cruzadas

### Con Zenix POS (v1.3 ya existente cuando v1.4 arranca)
- POS receta consume SKUs → genera `InventoryMovement(type: CONSUMPTION)` automático
- 86-list real-time se alimenta de inventory bajo
- Menu pricing engine sugiere precio basado en `costOfGoods` derivado de receta

### Con Zenix Books (v1.8+)
- PO recibida + factura → asiento contable automático
- Three-way matching → flag de "ready to pay" en accounts payable
- COGS USALI calculado de InventoryMovement.CONSUMPTION

### Con Zenix Insights (v1.2+ activo, expandido en v1.4)
- Price index agregado por ciudad/categoría → reporte mensual benchmark
- Margin vs benchmark → alert al hotel "estás pagando 18% sobre promedio"

### Con Zenix People (v1.7+)
- Aprobación de PO por rol (chef → manager → owner) usa role hierarchy de People
- Audit de quién aprobó qué para reportes de compliance

---

## 7. Esfuerzo estimado

| Sprint | Alcance | Semanas |
|--------|---------|---------|
| **E1 · PROC-FOUNDATION** | Schema SKU + Supplier + PO + Invoice + InventoryMovement | 3 |
| **E2 · PROC-WORKFLOW** | UI POs con aprobaciones por monto + three-way matching | 4 |
| **E3 · PROC-INVENTORY** | Conteo físico, par levels, alertas, mobile scanner | 3 |
| **E4 · PROC-USALI** | Reportes COGS USALI 12 ed compliant + recetas/BOM | 3 |
| **E5 · PROC-INTELLIGENCE** | Backend ZaharDev: price index, margin benchmarks (cross-property) | 2 |

**Total: ~15 semanas (~4 meses).**

---

## 8. Riesgos y mitigaciones

### Riesgo 1 — Adopción baja porque hotel ya usa Excel
**Mitigación:** import wizard de Excel → SKU + supplier catalog. Onboarding asistido en primer mes.

### Riesgo 2 — Proveedores no quieren EDI ni catálogos electrónicos
**Mitigación:** soporte de PO en PDF + email + WhatsApp. Proveedor no necesita estar en Zenix.

### Riesgo 3 — Multi-currency complica reports
**Mitigación:** todo PO se almacena en currency del PO + conversión a base currency en tiempo de reporting. No re-convertir histórico.

### Riesgo 4 — Marketplace puede entrar en conflicto con relaciones existentes hotel-proveedor
**Mitigación:** marketplace es opt-in. El hotel puede seguir comprando direct y solo usar marketplace para items específicos.

---

## 9. Posicionamiento competitivo

| Vs Birchstreet | Vs Adaco | Vs Excel del hotel |
|----------------|----------|--------------------|
| Mejor: precio (Birchstreet es enterprise $$$) | Mejor: integración nativa con PMS/POS | Mejor: todo integrado |
| Peor: madurez de features | Peor: madurez | Peor: requiere change management |

**Pitch:** "Si Zenix maneja tu reserva y tu folio, ¿por qué tu compra de tomates sigue en WhatsApp con el proveedor? Procure cierra el ciclo. Y al mismo tiempo, te conectamos con la red de hoteles Zenix para que negocies mejores precios sin levantar el teléfono."

---

## 10. Bitácora de revisiones

- **2026-05-13** — Documento creado. Procure consolidado como columna vertebral del data flywheel hacia Marketplace v1.9 + Books v1.8.
