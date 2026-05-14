# 04 · Zenix POS — Punto de Venta Hotelero

> Versión activación: **v1.3 (Q2 2027)**
> Streams: **R2 (POS subscription)**
> Apps nuevas: `apps/pos-terminal`, `apps/kds`

---

## 1. Por qué este módulo es estratégico

**Datos del mercado LATAM:**
- 70-80% de hoteles boutique tienen restaurante propio (no franquiciado)
- Hoy usan Square, Toast, o sistemas locales **desconectados del PMS**
- **Friction principal:** folio del huésped y ticket del restaurante son sistemas separados → conciliación manual al checkout, fugas de cobro, errores fiscales (CFDI no liga consumo a estadía)

**Diferencial Zenix:** integración nativa folio↔POS. Mesero pone "Charge to room 302" → cargo aparece en folio automáticamente → recepcionista lo cobra al checkout. Cero conciliación manual.

**Competencia:** Mews POS, Cloudbeds POS, Square for Restaurants, Toast, Lightspeed Hotel. Todos más maduros tecnológicamente. **Diferencial Zenix es ser hotelero-nativo, no genérico de restaurante.** Si Toast es McDonald's, Zenix POS es Aman Resorts.

---

## 2. Funcionalidad — Front-of-house (mesero/barman)

| Feature | Qué hace | Equivalente competidor |
|---------|----------|------------------------|
| **Menu engineering** | Categorías, modificadores, combos, recetas | Toast |
| **Mesa & tab management** | Abrir mesa, transferir, dividir cuenta | Square |
| **Course pacing** | Pedido en oleadas (entradas → plato fuerte → postre) | Toast |
| **Send to KDS** | Kitchen Display System (impresoras o pantallas) | Toast Kitchen |
| **Modificadores complejos** | "Sin cebolla", "extra queso", alergenos | Toast |
| **Split bill** | Por persona o por item | Square |
| **Charge to room** | Cargo directo al folio (**Zenix-exclusive**) | Diferenciador único |
| **Tip distribution** | Tronc, propina entre staff con auditoría | Toast Tips |
| **Walk-in tab** | Cliente sin habitación, cierra con cash/tarjeta | Toast |
| **Happy Hour pricing** | Reglas de pricing por hora del día | Lightspeed |

---

## 3. Funcionalidad — Back-of-house (chef/gerente)

| Feature | Qué hace | Equivalente competidor |
|---------|----------|------------------------|
| **Reportes USALI F&B** | Food cost %, beverage cost %, prime cost | Adaco |
| **86 list** | Items agotados marcados real-time en menú | Toast 86 |
| **Menu pricing engine** | Sugerencia de precio basado en COGS objetivo | Plate IQ |
| **Inventory bridge** | Consumo de recetas decrementa stock en Procure | Lightspeed |
| **Staff scheduling** | Horarios meseros + cocina (reusa StaffShift del PMS) | 7shifts |
| **Recipe management** | BOM de cada plato → costo automático | Optimum Control |
| **Avg ticket analytics** | Por mesero, por hora, por día de semana | Toast Analytics |
| **Table turnover** | Tiempo promedio de ocupación de mesa | Toast |
| **Course timing** | Tiempo desde send-to-kitchen hasta servido | Toast Kitchen |

---

## 4. Datos que alimentan ZaharDev

| Data point | Producto ZaharDev derivado |
|------------|----------------------------|
| Avg ticket por nacionalidad del huésped (linked via Stay) | Cultural F&B insights vendibles |
| Items más vendidos por estación / clima / día | Tourism board reports |
| Cross-sell patterns (cliente que pide X también pide Y) | Menu engineering consulting |
| Margen real por plato (con datos Procure) | Food cost optimization reports |
| Patrón de propinas por mercado emisor | Behavioral economics insights |
| Time-of-day consumption por nacionalidad | Demand forecasting para Books |

**Ejemplo de insight comercial:** "Brasileños en Cancún consumen 40% más cocteles entre 16:00-19:00 que mexicanos. Si tu hotel tiene 20% huéspedes brasileños, programa happy hour 16:00-19:00 con bebidas de marca premium."

---

## 5. Arquitectura técnica

### Decisión: módulo NestJS dentro del monolito Zenix

POS **NO** es microservicio. Comparte:
- Auth, multi-tenancy, audit, SSE
- `Staff` model (meseros son Staff con `department: RESTAURANT`)
- `GuestStay` model (charge-to-room genera entrada en folio)
- `PaymentLog` model (pagos cash/card POS usan el mismo sistema fiscal con `source: 'POS'`)

### Schema preliminar (NO implementar hasta v1.3)

```prisma
model Restaurant {
  id          String   @id @default(uuid())
  propertyId  String
  name        String
  layout      Json?    // mesas configurables
  isActive    Boolean  @default(true)
  // ...
}

model MenuCategory {
  id           String   @id @default(uuid())
  restaurantId String
  name         String
  sortOrder    Int
  // ...
}

model MenuItem {
  id           String   @id @default(uuid())
  categoryId   String
  name         String
  description  String?
  price        Decimal  @db.Decimal(10,2)
  costOfGoods  Decimal? @db.Decimal(10,2)
  recipeId     String?  // FK a Procure cuando v1.4 active
  imageUrl     String?
  isActive     Boolean  @default(true)
  is86         Boolean  @default(false)  // out-of-stock real-time
  // ...
}

model MenuModifier {
  id          String   @id @default(uuid())
  itemId      String
  name        String
  priceDelta  Decimal  @db.Decimal(10,2)
  required    Boolean  @default(false)
  // ...
}

model RestaurantTable {
  id           String   @id @default(uuid())
  restaurantId String
  label        String   // "Mesa 4", "Barra 1"
  seats        Int
  layoutX      Float?
  layoutY      Float?
  // ...
}

model Order {
  id           String        @id @default(uuid())
  tableId      String?
  restaurantId String
  status       OrderStatus   @default(OPEN)
  openedById   String        // mesero que abrió
  openedAt     DateTime      @default(now())
  closedAt     DateTime?
  // ...
}

model OrderItem {
  id              String   @id @default(uuid())
  orderId         String
  menuItemId      String
  qty             Int
  modifiers       Json?
  sentToKitchenAt DateTime?
  servedAt        DateTime?
  // ...
}

model Tab {
  id           String     @id @default(uuid())
  orderId      String
  type         TabType    // GUEST_ROOM | WALK_IN
  guestStayId  String?    // si CHARGE_TO_ROOM
  totalAmount  Decimal    @db.Decimal(10,2)
  tipAmount    Decimal?   @db.Decimal(10,2)
  closedAt     DateTime?
  closedById   String?
  // ...
}

enum OrderStatus { OPEN, SENT, READY, SERVED, CLOSED, VOIDED }
enum TabType { GUEST_ROOM, WALK_IN }
```

### Apps que toca

| App | Función |
|-----|---------|
| `apps/api` | Módulo `pos/` con controllers `restaurant`, `menu`, `order`, `tab`, `kds` |
| `apps/web` | Configuración de menú (gerente) en `/pos/setup` |
| `apps/pos-terminal` | **Nueva app**. iPad-first (8.3" o 11"). Posiblemente PWA o React Native iPad-only. Decisión técnica al iniciar v1.3. |
| `apps/kds` | **Nueva app o webview**. Pantalla de cocina. Simple, robusto, kiosk mode sin auth UI. |

### Hardware compatible

- **iPad** (10.9" o iPad Mini) — meseros
- **Impresoras térmicas** — recibos (Star Micronics TSP100, Epson TM-T20)
- **Impresoras de cocina** — comanda (Star SP742, Epson TM-U220)
- **Kitchen Display** — pantalla touch 21-32" Android/web kiosk
- **POS terminal** — Square Terminal compatible (NFC tap)

---

## 6. Integraciones cruzadas

### Con Zenix PMS
- Charge-to-room → entrada automática en folio del GuestStay
- Si GuestStay tiene `actualCheckin: null` → bloquear charge-to-room (no confirmar consumo sin huésped activo)
- Folio aparece en BookingDetailSheet con sección "Consumos restaurante"

### Con Zenix Procure (v1.4+)
- Receta de plato → BOM con SKUs de Procure
- Venta de plato decrementa inventory automáticamente
- Reorder alert cuando par level bajo

### Con Zenix Stay (v1.5+)
- Huésped tap NFC en POS → identificado automáticamente sin pedir habitación
- VIP/loyalty status visible al mesero
- Charge-to-room sin contraseña (autenticado por NFC)

### Con Zenix People (v1.7+)
- Meseros y cocina son Staff del PMS con `department: RESTAURANT`
- Horas trabajadas POS feed a People para nómina
- Propinas distribuidas calculan tax retention automáticamente

### Con Zenix Books (v1.8+)
- Cada Tab cerrada genera asiento contable: Ingresos restaurante - IVA - COGS
- USALI 12 ed: F&B Revenue + F&B Cost of Sales separados por outlet

---

## 7. Esfuerzo estimado

| Fase | Semanas | Alcance |
|------|---------|---------|
| Diseño | 2 | UX terminal iPad + KDS + flujo charge-to-room |
| Schema + Backend core | 3 | Restaurant, MenuItem, Order, Tab, OrderItem |
| Backend integrations | 2 | Folio bridge, PaymentLog source POS |
| `apps/pos-terminal` | 4 | iPad UI completo con offline-first |
| `apps/kds` | 1 | Webview simple |
| `apps/web` setup | 2 | Configuración menú + reportes |
| Testing + QA | 2 | E2E en piloto |

**Total: 12-16 semanas** (~3-4 meses).

---

## 8. Riesgos y mitigaciones

### Riesgo 1 — Latencia send-to-kitchen
**Mitigación:** WebSocket dedicado para KDS + retry queue offline-first en pos-terminal.

### Riesgo 2 — Offline mode crítico
Un restaurante NO puede dejar de operar por wifi caído.
**Mitigación:** pos-terminal con cola local (PouchDB o SQLite) + sync cuando reconecta. Patrón Toast Offline Mode.

### Riesgo 3 — Conciliación de propinas con tax
**Mitigación:** Tronc system con audit trail. Cada propina queda registrada con quién recibió, cuándo, y deducciones fiscales por país (vincula con Books).

### Riesgo 4 — Hotel sin restaurante propio
Algunos hoteles tercerizan el restaurante.
**Mitigación:** módulo POS opcional (Growth tier en adelante). Si el restaurante es externo, ofrecer integración API mínima para charge-to-room sin obligar uso completo de POS.

---

## 9. Posicionamiento competitivo

| Vs Toast | Vs Cloudbeds POS | Vs Mews POS | Vs Lightspeed |
|----------|------------------|-------------|---------------|
| Mejor: hotel folio integration | Mejor: arquitectura modular | Mejor: pricing más accesible | Mejor: cultural insights ZaharDev |
| Peor: madurez de features | Peor: ningún diferencial significativo | Peor: madurez vs Mews | Peor: madurez retail |

**Pitch resumen:** "Si tu hotel ya usa Zenix PMS, agregar POS es la decisión obvia. Cero conciliación. Cero double-entry. Reportes USALI nativos. Y a diferencia de Toast, sabemos que un huésped no es solo un cliente — es una estadía con datos que matter."

---

## 10. Bitácora de revisiones

- **2026-05-13** — Documento creado. POS movido antes que Procure en roadmap (high customer demand wedge). Foundation técnica especificada para v1.3.
