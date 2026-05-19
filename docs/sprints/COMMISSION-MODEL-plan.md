# Sprint COMMISSION-MODEL — Zenix Marketplace 3-tier monetization

> **Tipo:** Plan técnico
> **Sprint:** parte de v1.0.1 PAY-CORE expandido O sprint paralelo a Booking Engine
> **Duración:** 2-3 semanas (dependiente de PAY-CORE Stripe Connect setup)
> **Justificación:** habilitar el modelo de monetización dual tier (free SaaS + commission marketplace) que diferencia Zenix de Cloudbeds/Mews y compite directo contra OTAs sin lock-in

---

## 1. Resumen ejecutivo

Zenix Booking Engine se monetiza con **2 tiers superpuestos**:

| Tier | Comisión | Quién atrae el lead | Equivalente competidor |
|------|----------|---------------------|------------------------|
| **1 — Standard** | $0 per booking | Hotel (su sitio web, widget, API) | Cloudbeds/Mews ($0 commission) |
| **2 — Marketplace** | 3-5% per booking | Zenix (SEO + ads + marketplace) | Booking.com low-cost (vs 15-30%) |

Tier 1 es default. Tier 2 es **opt-in per property** vía Settings → "Zenix Marketplace".

**Atribución técnica:** UTM tracking + referrer matching. Sistema decide automáticamente cuándo cobrar commission, sin intervención del hotel.

**Stripe Connect** ejecuta split payments nativamente — cero reconciliación manual.

---

## 2. Justificación de mercado

### El gap entre Cloudbeds y Booking.com

```
Cloudbeds / Mews / SiteMinder       Booking.com / Expedia / Airbnb
─────────────────────────────       ──────────────────────────────
SaaS only ($200-1000/mes)            Comisión 15-30% por booking
$0 commission                         $0 SaaS
Hotel hace TODO el marketing          OTA trae tráfico masivo
Conversion baja sin marketing         Conversion alta pero caro
```

**Hueco que Zenix llena:** modelo híbrido low-commission marketplace.

### Datos validan el hueco

- Booking.com cobra 15-25% (programa Genius 30%) → hoteles ahogados en comisiones
- Direct booking ROI = 50x el costo del booking engine (Lighthouse data 2025)
- Conversion del sitio del hotel sin marketing pro = 1.5-2.5% (muy bajo)
- 62% de visitors abandonan en transition site → external BE (research industry)

**Si Zenix:**
- Invierte en SEO + Google Ads para `book.zenix.com` como marketplace LATAM boutique/hostal
- Cobra 3% por bookings que vienen de ese tráfico (vs 25% Booking)
- Hotel ahorra **8x menos comisión** y mantiene control de pricing/policy

**Resultado:** Zenix se posiciona como "tu OTA propietaria barata" para el segmento LATAM.

---

## 3. Decisiones técnicas no-negociables

### D-COMM1: Attribution explícita por UTM/referrer

El sistema NUNCA cobra commission "implícitamente". Cada booking lleva `referralSource` explícito determinado al momento de crear el booking:

| Origen | `referralSource` value | Commission |
|--------|------------------------|------------|
| Hotel link directo | `hotel_website` | $0 |
| Hotel widget embed | `hotel_widget` | $0 |
| Hotel API call | `hotel_api` | $0 |
| Zenix marketplace homepage | `zenix_marketplace` | 3% |
| Zenix email newsletter | `zenix_email` | 3% |
| Zenix Google Ads | `zenix_gads` | 5% (premium) |
| Zenix Meta Ads | `zenix_meta` | 5% (premium) |

Si UTM ausente y referrer no matches hotel → fallback default `direct_unknown` → $0 commission (conservador).

### D-COMM2: Cookie 30d para multi-touch attribution

Visitor llega via Zenix marketplace, navega 3 días, luego va al sitio del hotel, hace click "Reservar" → reserva. Cookie de Zenix (30d) preserva attribution → Zenix cobra commission.

Mismo patrón que Amazon Associates / Booking.com partner program.

Cookie almacena: `referralSource + sourceTimestamp + utmCampaign`. Se lee al crear booking.

### D-COMM3: Stripe Connect para split payment nativo

NO se factura mensualmente acumulando — se descuenta **al momento del cobro** vía Stripe Connect:

```
Guest paga $1,580 USD
  ↓
Stripe procesa
  ↓ split automático
  ├── $1,533 (97%) → cuenta Stripe del hotel
  └── $47 (3%)    → cuenta Stripe de Zenix
```

Ventajas:
- Cero reconciliación manual
- Zero risk de "hotel no quiere pagar la commission al fin de mes"
- Audit trail nativo en Stripe Dashboard
- Refunds: Stripe automáticamente revierte el split proporcional

Pattern usado por: Uber (driver split), Airbnb (host split), Shopify Payments (Shopify fee split), Substack, Patreon, Etsy.

### D-COMM4: Audit append-only en CommissionLog

Cada booking commission queda registrado en `CommissionLog` inmutable:

```prisma
model CommissionLog {
  id              String   @id @default(uuid())
  organizationId  String
  propertyId      String
  guestStayId     String   @unique
  bookingRef      String
  referralSource  String   // hotel_website | zenix_marketplace | etc.
  bookingAmount   Decimal  @db.Decimal(10, 2)
  commissionRate  Decimal  @db.Decimal(5, 4)  // 0.0300 = 3%
  commissionAmount Decimal @db.Decimal(10, 2)
  currency        String   @db.VarChar(3)
  stripeTransferId String?  // ID del Stripe Transfer (split execution)
  status          CommissionStatus @default(PENDING)
  createdAt       DateTime @default(now())
  capturedAt      DateTime?
  refundedAt      DateTime?
  refundedAmount  Decimal? @db.Decimal(10, 2)

  property        Property  @relation(...)
  guestStay       GuestStay @relation(...)
  @@index([propertyId, status, createdAt])
}

enum CommissionStatus {
  PENDING     // booking created, commission calculated
  CAPTURED    // Stripe Transfer ejecutado, plata en cuenta Zenix
  REFUNDED    // guest cancelo, commission revertida proporcional
  DISPUTED    // chargeback Visa, en hold
  WAIVED      // ADMIN_ERROR override, no se cobró
}
```

### D-COMM5: Commission refund en cancellation

Si guest cancela y se le refunda el booking → Stripe automáticamente revierte el split proporcional:
- Refund 100% → CommissionLog status REFUNDED, monto $0 a Zenix
- Refund 50% (política moderada) → Zenix recibe 1.5% (en lugar de 3%)
- Refund 0% (non-refundable cancelado) → Zenix mantiene full commission

Logic implementada vía Stripe webhook `charge.refunded` → CommissionService recalcula.

### D-COMM6: Hotel opt-in/opt-out por property

```prisma
model PropertySettings {
  // ... existing ...
  marketplaceListingEnabled    Boolean  @default(false)
  marketplaceListingActivatedAt DateTime?
  marketplaceCommissionRate    Decimal  @default(0.03) @db.Decimal(5, 4)  // override per-property si negociado
}
```

Default OFF — hotel debe activamente opt-in. Sin lock-in, opt-out cuando quiera.

### D-COMM7: Featured spots opcionales (sponsored)

Marketplace homepage muestra hoteles en orden: featured > org cross-promote > rating > nuevos > resto.

Hotel puede comprar **featured spot** (~$200-500/mes por property en posición top) — addicional revenue stream para Zenix.

### D-COMM8: Cross-promote en cadenas

Si Hotel A (Brand X) y Hotel B (Brand X) ambos en marketplace:
- Página detalle de Hotel A muestra footer "Otras propiedades de Brand X"
- Cross-promote sin commission entre properties de la MISMA marca (driver de upsell)

### D-COMM9: Commission rate ajustable per country/tier

`marketplaceCommissionRate` default 3% pero puede ajustarse:
- Países premium (USA tier 1 city) → 5%
- LATAM target → 3%
- Hoteles enterprise multi-property → 2% negociado

Cambio requiere SUPER_ADMIN Zenix + audit log.

### D-COMM10: Compliance fiscal — Stripe Connect emite facturas

Zenix recibe los 3% como ingreso → debe emitir CFDI por servicio comisional al hotel. Stripe Connect provee API para emitir facturas automáticas. En MX: `CFDI tipo I (Ingreso), uso G03 (Gastos en general), formaPago 03 (Transferencia)`.

Hotel recibe CFDI y lo deduce. Limpio fiscalmente para ambos lados.

---

## 4. Plan de implementación (2-3 semanas)

### Sprint COMM-1: Schema + attribution capture (3-4 días)

- Migration `CommissionLog` model
- `PropertySettings.marketplaceListingEnabled` + `marketplaceCommissionRate`
- `GuestStay.referralSource` field
- Booking Engine frontend captura UTM + referrer al cargar la página
- Cookie 30d con attribution data
- API endpoint `POST /v1/public/reservations` extiende para guardar `referralSource`

### Sprint COMM-2: Stripe Connect integration (1 sem)

- Zenix Stripe Atlas account (parent)
- Onboarding flow para que cada hotel customer cree su Stripe Connect connected account (Standard o Express)
- Hotel completa KYC en Stripe Dashboard (compliance)
- Test mode: bookings via Tier 2 attribution → split 3% verificable en Stripe Test Dashboard
- Live mode con piloto Hotel Monica Tulum

### Sprint COMM-3: CommissionService backend (4-5 días)

- `CommissionService.calculateForBooking(stayId)` — lee referralSource + rate + amount
- `CommissionService.executeStripeTransfer(stayId)` — dispara split al momento del pago
- `CommissionService.handleRefund(chargeId)` — webhook Stripe → recalcula commission
- `CommissionService.monthlyReport(propertyId)` — para hotel dashboard

### Sprint COMM-4: Frontend Settings + Dashboard (3-4 días)

- Settings tab "Zenix Marketplace" en panel admin:
  - Toggle opt-in/opt-out
  - Ver commission rate vigente
  - Featured spot purchase flow
- Dashboard "Comisiones del mes":
  - Tabla CommissionLog filtrable
  - Total comisionable + total cobrado
  - Export CSV/PDF
  - Comparativa "Si esos bookings hubieran sido Booking.com: $X comisión paid"

### Sprint COMM-5: Marketplace homepage MVP (3-4 días)

- `book.zenix.com` (sin slug) muestra marketplace
- Listado por ciudad / país / categoría
- Search box + filters (price range, amenities, dates)
- Tarjetas property con foto + nombre + ciudad + price-from + rating
- Click → `book.zenix.com/{slug}` (página individual del hotel)
- SEO meta tags + structured data (schema.org TravelAgency)

### Sprint COMM-6: Marketing infrastructure (paralelo, no bloquea release)

- Google Search Console + Bing Webmaster setup
- Google Ads campaign para keywords "hotel boutique tulum", "hostal cancún", etc
- Meta Pixel + Conversion API
- Email newsletter setup (Mailchimp / Resend)
- Analytics: GA4 + Mixpanel funnel tracking

---

## 5. UX — settings hotel + dashboard

### Settings → Zenix Marketplace

```
┌─────────────────────────────────────────────────────────────┐
│  🔷 Zenix Marketplace                                       │
│  ───────────────────────────────────────────────────────── │
│                                                              │
│  ☐ Listar mi hotel en book.zenix.com                        │
│                                                              │
│  Cuando activas, tu hotel aparece en:                       │
│  • Página homepage book.zenix.com (búsqueda por ciudad)    │
│  • Campañas Google + Meta de Zenix                          │
│  • Email newsletter Zenix Travel                            │
│                                                              │
│  Comisión: 3% del booking total                             │
│  (solo cuando el guest llegó vía Zenix marketplace)         │
│                                                              │
│  Comparativa:                                                │
│  • Booking.com cobra 25% — tú ahorras 22%                  │
│  • Tu sitio web propio sigue siendo 0% commission           │
│                                                              │
│  [ Activar marketplace ]                                     │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│  Featured spot (opcional)                                    │
│  ☐ $300/mes - Posición top home + email destacado          │
└─────────────────────────────────────────────────────────────┘
```

### Dashboard → Comisiones del mes

```
┌─────────────────────────────────────────────────────────────┐
│  Comisiones marketplace - Mayo 2026                          │
│  ───────────────────────────────────────────────────────── │
│                                                              │
│  Bookings vía Zenix marketplace:  18                        │
│  Total bookings amount:            $24,500 USD              │
│  Comisión Zenix (3%):              $735 USD                 │
│  Ya cobrada (split Stripe):        $735 USD                 │
│                                                              │
│  📊 Comparativa vs OTAs:                                    │
│  Si esos 18 bookings hubieran sido en Booking.com (25%):    │
│  Habrías pagado: $6,125 USD                                 │
│  Ahorraste: $5,390 USD (730% ROI vs OTA tradicional)       │
│                                                              │
│  [Ver detalle] [Export CSV]                                  │
└─────────────────────────────────────────────────────────────┘
```

### Booking detail del huésped

```
Marco Rossi · Suite Vista Mar
─────────────────────────────────────────
Origen:           🔷 Zenix Marketplace
Atribución:       zenix_marketplace + zenix_email
Cookie sourcetime: 18 abril 2026 14:30
Booking creado:    19 abril 2026 09:15
Comisión Zenix:   $47 USD (3%) - status: CAPTURED
Stripe Transfer:   tr_xxx (ver Stripe Dashboard)
```

---

## 6. Riesgos identificados

| # | Riesgo | Probabilidad | Mitigación |
|---|--------|--------------|------------|
| R1 | Hotel reclama commission diciendo "el guest era mío" | 🟠 Media | Cookie 30d + UTM + audit log inmutable — evidencia clara para cada commission |
| R2 | Cookie clearance por guest entre Zenix discovery y reserva | 🟡 Baja | Multi-touch attribution + email signup tracking → backup attribution |
| R3 | Stripe Connect onboarding del hotel falla (KYC) | 🟠 Media | Onboarding wizard guiado + soporte Zenix para hoteles con problemas tax docs |
| R4 | Marketplace homepage no genera tráfico real | 🔴 Alta primer año | Sprint COMM-6 marketing — sin esto el tier 2 es vacío. Inversión sostenida 6-12 meses para traction |
| R5 | Competencia (Cloudbeds) responde lanzando mismo modelo | 🟡 Mediano plazo | Acumular hoteles antes que reaccionen + diferencial LATAM payments (OXXO/MercadoPago) |
| R6 | Compliance fiscal CFDI mensual emisión | 🟢 Baja | Stripe Connect API auto-emite facturas; backup: Facturama integration en v1.0.2 |
| R7 | Refunds masivos por temporada baja → commission negativa | 🟡 Baja | `CommissionLog.refundedAmount` rastrea; reports muestran net effective rate |
| R8 | Guest hace booking marketplace pero hace check-in walk-in luego | 🟢 Edge case | Attribution sigue siendo marketplace — el booking se hizo via marketplace |

---

## 7. Métricas de éxito

| Métrica | Target mes 3 | Target mes 12 |
|---------|--------------|---------------|
| % hoteles que opt-in marketplace | 20% | 60% |
| Bookings/mes via marketplace | 30 | 500 |
| Commission acumulada Zenix/mes | $500 USD | $15,000 USD |
| Conversion marketplace homepage | 0.5% (early) | 2% |
| Featured spots vendidos | 0 | 10 |
| Ahorro promedio per hotel vs OTAs | $200 USD/mes | $1,500 USD/mes |
| Refund rate commission | <8% | <5% |

---

## 8. Posicionamiento comercial — pitch principal

> *"En Cloudbeds pagas $400 USD/mes y tú haces todo el marketing. En Booking.com no pagas SaaS pero pierdes 25% de cada venta. Con Zenix pagas el SaaS más bajo del mercado, y solo cuando QUIERES, te listas en nuestro marketplace por 3% — **8x menos que Booking**. Sin lock-in. Sin sorpresas. Te ahorras 70-90% en comisiones OTAs al final del año."*

Variantes según buyer persona:

**Para el dueño contador (foco precio):**
> "Pasaste de $45k/año en comisiones a $5k. Eso paga 3 años de Zenix."

**Para el operador (foco operación):**
> "Sin lock-in. Si en 6 meses no funciona el marketplace, lo apagas con un toggle. Sigues con tu SaaS PMS."

**Para el manager joven (foco growth):**
> "Tu sitio web ya genera bookings directos. Zenix amplifica eso con marketplace + ads pagados. Tú decides cuánto delegar."

---

## 9. Dependencias

- **PAY-CORE Sub-módulo E** (Card payments con Stripe) debe estar completo antes
- **Booking Engine Fase 1** (REST API + Hosted UI) debe estar completo antes
- **BE-PREP** (Property enrichment con slug + photos + branding) bloqueante de marketplace

Por eso este sprint es **paralelo o post** a Booking Engine, no antes.

---

## Sources

- [Stripe Connect Standard accounts](https://stripe.com/docs/connect/standard-accounts)
- [Stripe Connect Application fees](https://stripe.com/docs/connect/direct-charges#collecting-fees)
- [Cloudbeds commission-free booking engine](https://www.cloudbeds.com/booking-engine/) — confirmación que NO cobran commission
- [Booking.com commission rates 2026](https://partner.booking.com/) — referencia comparativa
- [Direct booking ROI 50x Lighthouse](https://www.mylighthouse.com/resources/blog/increase-hotel-direct-bookings-cut-ota-commissions)
- [Multi-touch attribution patterns](https://en.wikipedia.org/wiki/Multi-touch_attribution)
- Internal: [`BOOKING-ENGINE-plan.md`](BOOKING-ENGINE-plan.md) — sprint base
- Internal: [`TAP-TO-PAY-research.md`](TAP-TO-PAY-research.md) — payment infrastructure
- Internal: [`docs/vision/14`](../vision/14-payment-currency-tax-architecture.md) — PAY-CORE architecture
