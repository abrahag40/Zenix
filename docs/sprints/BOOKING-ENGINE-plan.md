# Sprint BOOKING-ENGINE — Plan + Estudio de Mercado

> **Status:** RESEARCH ✓ · Plan técnico inicial · Implementación pendiente de aprobación
> **Sprint owner:** ZaharDev consulting + Zenix product
> **Estimado total:** 6-8 semanas (Fase 1 MVP) + 4-6 semanas (Fase 2 website builder bundle)
> **Justificación negocio:** monetizar combo PMS + website + booking engine + marketing como upsell del piloto

---

## 0. Nomenclatura — terminología correcta de industria

Lo que llamaste "plugin" tiene varios nombres formales en industria, con matices:

| Término | Significado preciso |
|---------|---------------------|
| **Booking Engine** (BE) | El motor que procesa reservas. Backend + UI. Término más usado |
| **Internet Booking Engine (IBE)** | Sinónimo formal usado por Sabre, Amadeus, Pegasus |
| **Direct Booking Widget** | Solo la pieza UI embebible en el sitio web del hotel |
| **Booking Plugin** | Específicamente la versión para CMS (WordPress, Wix, Squarespace) |
| **Reservation Engine** | Usado por Opera/SynXis |

Tu "plugin" mapea exactamente al concepto de **Direct Booking Widget** (la pieza embebible) respaldada por un **Booking Engine** (el motor server-side). Para el sprint usamos: **Zenix Booking Engine (ZBE)** + **Zenix Direct Widget (ZDW)** como nombres internos.

---

## 1. Resumen ejecutivo

### El problema operativo
Un hotel cliente de Zenix tiene su propio sitio web (WordPress, Wix, Squarespace, o custom). Hoy cuando alguien visita el sitio y quiere reservar:
- **(a)** No puede — debe llamar / mandar email (pierde la conversión)
- **(b)** Es redirigido a Booking.com / Expedia → reserva con comisión 15-30% para el hotel
- **(c)** Si usa un competidor de Zenix (Cloudbeds/Mews/Little Hotelier), reserva directo pero el hotel paga el bundle de PMS+BE caro

### La oportunidad para Zenix
**Combo único en LATAM:** PMS + Direct Booking Engine + Website Builder opcional + Marketing strategy. Modelo de pricing dual:
- 1 mes = X precio (probar)
- 3 meses = X−% precio (compromiso para que el marketing dé resultado — el SEO/SEM toma 2-3 meses en madurar)

### Estado del mercado (datos del estudio)

| Player | Mensual | Target | Pain | Oportunidad Zenix |
|--------|---------|--------|------|-------------------|
| **Cloudbeds** | €150-200 | 20-100 rooms | Iframe deprecating, español parcial | Bundle más barato, español nativo |
| **Mews** | €85+ ($8-15/room) | Boutique premium | Caro para hostal LATAM | Pricing accesible |
| **SiteMinder** | Variable | Distribución multi-channel | Sin PMS propio sólido | All-in-one |
| **Little Hotelier** | $30+ | <20 rooms | Limitado en customization | Más flexible |
| **WP plugins (MotoPress, Vik)** | One-time fee | DIY WP users | Sin PMS de verdad | Bundle integrado real |

**Conversión benchmark:** sitios con booking engine embebido convierten **+37%** vs redirect externo. Mobile-first design da **+7-12%** lift adicional. Top-performing hotels logran 5%+ conversion rate. Promedio 1.5-2.5%.

---

## 2. Estudio de mercado completo

### 2.1 Players principales (deep dive)

#### Cloudbeds Booking Engine
- **Tech:** Migrando de iframe a **web component** (Booking Engine "Plus" / "Immersive Experience 2.0"). Deprecación iframe documentada oficialmente.
- **Razón del cambio:** iframe tenía SEO destruido (0 content indexable) + clickjacking risk + brand inconsistency
- **Pricing:** ~€150-200/mes bundled con PMS
- **Posición de mercado:** #1 voted en HotelTechAwards 2021. 27,000 clientes en 150 países
- **Gap:** español parcial; checkout flow no optimizado para LATAM (faltan OXXO, MercadoPago, SPEI México)

#### Mews Booking Engine
- **Tech:** Web component nativo + headless API
- **Pricing:** €85+ base + €8-15/room/mes
- **Posición:** Premium boutique. 12,500 propiedades en 85 países. $19.7B GMV anual
- **Gap:** Caro para hostales LATAM (un hostal de 20 cuartos paga $160-300 USD/mes solo BE)

#### SiteMinder
- **Posición:** 41,000 propiedades, 450+ channels. No tiene PMS — vende solo distribution
- **Pricing:** Variable, depende del bundle con channel manager
- **Gap:** Necesitas otro PMS además, doble suscripción

#### Little Hotelier
- **Pricing:** Desde $30/mes. Target ≤20 rooms
- **Gap:** Customization limitada — branding hotelero pobre

#### WordPress (MotoPress, VikBooking, Gravity Booking)
- **Pricing:** Compra única (~$80-200) sin SaaS
- **Gap:** NO son PMS de verdad. Calendario + form. Sin housekeeping, sin no-show, sin reportes. Hotel termina necesitando un PMS adicional

### 2.2 Conversion benchmarks (datos 2026)

| Métrica | Promedio | Top performers |
|---------|----------|----------------|
| Hotel website conversion | 1.5-2.5% | 5%+ |
| Mobile traffic share | 60-70% | 70%+ |
| Booking engine drop-off | **62%** (transition site→BE) | <30% (embedded native) |
| Page load target | <3s | <2s |
| Mobile vs desktop lift | +7-12% | +15-20% |
| Embedded vs redirect | +37% conversion |  |
| Video content on listing | +80% conversion |  |
| Trust signals visibility | +23-31% |  |

### 2.3 Patrones de integración técnica

| Pattern | Pros | Cons | Recomendación 2026 |
|---------|------|------|-------------------|
| **Iframe** (legacy) | Install 1-line, isolated | ❌ SEO=0, clickjacking risk, brand inconsistency, CORS hell, slow load | **DEPRECATED** (Cloudbeds eliminando) |
| **JS Widget / Web Component** | SEO friendly, brand consistent, faster, secure | Más complejo de implementar correctamente | ✅ **State of the art** |
| **WordPress plugin (PHP)** | Deep CMS integration, shortcodes, no JS knowledge | Solo WP sites | ✅ Para target WP (40% del mercado web) |
| **REST API + custom** | Total flexibility | Requiere developer del hotel | ✅ Para enterprise / dev teams |
| **Hosted booking page** | Cero install del hotel | Pierde brand (redirect a `hotel.zenix.com/book`) | Fallback minimalista |

**Decisión:** Implementar **los 3 primeros** (web component principal + WP plugin + hosted fallback). REST API ya tenemos.

### 2.4 OTA economics — por qué importa direct booking

| Métrica | Datos |
|---------|-------|
| Comisión Booking.com / Expedia | 15-25% (estándar) hasta 30% (programa "Genius") |
| Comisión Airbnb | 14-16% (host service fee + co-host adjustments) |
| Comisión Hotels.com (Expedia Group) | 18-22% |
| **ROI direct booking** | Reportado 50x el costo del booking engine (Lighthouse data) |
| **Conversion price-parity boost** | +34% si el hotel iguala precio OTA en su sitio (Triptease) |
| **Database health** | #1 differentiator entre hoteles que crecen direct vs no |

**Implicación para Zenix:** un hotel boutique 30-cuartos con $500k revenue anual y 40% OTA mix paga ~$60k/año en comisiones. Si Zenix Booking Engine baja eso a 20% OTA, ahorra ~$20k/año. Pricing del bundle Zenix puede ser $200-400/mes ($2.4-4.8k/año) — **ROI 4-8x** sin contar el upselling marketing.

---

## 3. Arquitectura técnica propuesta

### 3.1 Componentes

```
┌────────────────────────────────────────────────────────────┐
│  WEBSITE DEL HOTEL (WP / Wix / Squarespace / custom)        │
│                                                              │
│  <script src="https://cdn.zenix.com/zbe.js"                 │
│          data-property-id="prop-xxxx"></script>             │
│  <div data-zenix-booking></div>                             │
└────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│  ZENIX DIRECT WIDGET (web component, no iframe)             │
│  • availability search + rate display                        │
│  • room selection (cards con fotos)                          │
│  • guest details form                                        │
│  • payment (Stripe Elements / Mercado Pago / OXXO)           │
└────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│  ZENIX BOOKING ENGINE API (NestJS)                          │
│  POST /v1/public/booking-engine/availability                │
│  POST /v1/public/booking-engine/quote                       │
│  POST /v1/public/booking-engine/reserve                     │
│  • CORS abierto al dominio del hotel (allowlist)            │
│  • Rate limit per IP + per propertyId                       │
│  • API key pública (read) + token transient para reserve    │
└────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│  ZENIX PMS CORE — crea GuestStay como source='direct_web'   │
│  • Pasa por AvailabilityService (§35) — protege overbooking │
│  • Channex push: notifica a OTAs que la noche se reservó    │
│  • Emite SSE para que el calendar del recepcionista refresh │
│  • Notification al manager: "Nueva reserva direct web"      │
└────────────────────────────────────────────────────────────┘
```

### 3.2 Decisiones técnicas clave

**Web Component vs iframe:**
- ✅ **Web Component** (Custom Element). Igual que Cloudbeds Booking Engine Plus
- Razones: SEO indexable, brand consistency (hereda CSS del hotel), sin clickjacking, faster load
- Tech: Vanilla web components (no React bundle pesado en el sitio del hotel) o Lit (3KB)
- Shadow DOM: estilos isolated del hotel pero permitiendo CSS variables override

**REST API design:**
- **Public endpoints** (`/v1/public/booking-engine/*`) — sin JWT del staff. Auth via API key del booking engine + propertyId
- **Rate limiting** — necesario porque endpoints públicos son target de scraping/abuso
- **CORS allowlist** — el hotel registra su dominio en Settings, solo ese dominio puede llamar. Bloquea uso del API key fuera del sitio del hotel

**Payment processing:**
- **Stripe Elements** para US/EU/MX cards (ya integrado con v1.0.1 PAY-CORE)
- **Mercado Pago** para MX/AR/BR/CO/CL — popular en LATAM, soporta OXXO + transferencias
- **OXXO voucher** específicamente para MX (huésped paga en tiendita) — diferencial enorme vs Mews/Cloudbeds que NO lo soportan
- **No-CC reservation** opcional (deposit on arrival) — para hostales que aún operan así

**Source attribution:**
- Nueva `BookingSource = 'DIRECT_WEB'` en `GuestStay.source` (además de DIRECT, BOOKING_COM, EXPEDIA, etc.)
- Trackeo de referrer/UTM para attribution marketing (saber si vino de Google ads, Instagram bio, etc.)

**Cache + performance:**
- Endpoint `/availability` cacheado 30s (CDN Cloudflare)
- Endpoint `/quote` con dates+roomType cache 60s
- Endpoint `/reserve` NUNCA cached, idempotency-key obligatoria
- Widget bundle minificado <20KB gzip (vs Cloudbeds widget ~80KB)

### 3.3 Edge cases que cubrir (gaps detectados en competidores)

| Edge case | Cómo lo cubrimos |
|-----------|------------------|
| Race condition: 2 personas reservan misma noche simultáneamente | §35 AvailabilityService transactional + hard block 409 |
| Mobile abandono al rellenar formulario | One-page checkout (no wizard), auto-fill detection, Apple Pay sheet |
| Guest sin tarjeta quiere reservar (común MX) | Toggle "Pagar en hotel" / "OXXO" / "Transferencia bancaria" |
| Sitio del hotel en español sin traducciones de la UI | i18n built-in (es-MX, en-US, pt-BR, fr-FR mínimo) |
| Hotel cambia precios — widget muestra stale | Quote endpoint TTL 60s + Last-Modified header |
| Booking del widget se duplica si user clickea 2× | Idempotency-Key generado client-side + 409 si repite |
| Hotel no tiene SSL en su sitio web | Widget requiere HTTPS; fallback a hosted page `zenix.com/book/{slug}` |
| Pricing diferente por origen (move-in promo Instagram) | Promo codes + UTM-aware rate plans (v1.2+) |

---

## 4. Cobertura vs. estándares de industria

### 4.1 Mapeo con benchmarks de conversion

| Best practice (industry 2026) | Plan Zenix |
|-------------------------------|------------|
| Page load <3s | ✅ Widget <20KB + lazy load |
| Mobile-first (60-70% traffic) | ✅ Responsive native, NO desktop-first |
| Embedded > redirect (+37%) | ✅ Web component embedded |
| Trust signals visible (+23-31%) | ✅ Review score + cancellation policy + best-rate badge default |
| Pricing transparency (anti-fee anxiety) | ✅ Total con impuestos visible desde el step 1 |
| Apple Pay / Google Pay | ✅ Via Stripe Elements |
| Video on listing (+80%) | ⚠️ v1.1 (Fase 2) |
| Multi-language | ✅ es/en/pt/fr core |
| Price-parity widget (+34%) | ⚠️ v1.2 (vs OTA scraping) |

### 4.2 Gaps de competidores que NO tienen y nosotros sí

| Diferencial Zenix | Players que NO lo tienen |
|-------------------|--------------------------|
| **OXXO voucher payment** | Mews, Cloudbeds, Little Hotelier, SiteMinder |
| **Mercado Pago native** | Mews, Cloudbeds, Little Hotelier |
| **SPEI México** | Todos los grandes |
| **i18n es-MX como first-class** (no es traducción de en-US) | La mayoría |
| **CFDI auto-generation post-booking** (v1.0.2) | Nadie en occidental space |
| **Bundle PMS + BE + Website + Marketing** | Cloudbeds tiene parcial; nadie completo |
| **Pricing escalonado 1mes vs 3meses** (tu idea) | Nadie usa este modelo |

---

## 5. Modelo de negocio + pricing propuesto

### 5.1 Tu propuesta (1-mes vs 3-mes pricing)

Tu insight: el marketing toma 2-3 meses en madurar (SEO, brand awareness, repeat customer database). Si cobras solo 1 mes el cliente termina diciendo "no funcionó" cuando en realidad nunca le dimos tiempo. Pricing dual:

| Plan | Mensual efectivo | Compromiso | Descuento |
|------|------------------|------------|-----------|
| **Mensual** | $X | 1 mes (cancelable) | — |
| **Trimestral** | $X × 0.75 | 3 meses pagados upfront | **25% off** |

### 5.2 Bundle Zenix Activate Plus (concepto comercial)

```
┌─────────────────────────────────────────────────────────────┐
│  ZENIX ACTIVATE PLUS — All-in-one para hoteles boutique     │
├─────────────────────────────────────────────────────────────┤
│  ✓ PMS Zenix (calendar + HK + no-show + reportes)           │
│  ✓ Direct Booking Engine + widget para sitio del hotel       │
│  ✓ Website builder opcional (template hotelero responsive)   │
│  ✓ SEO setup inicial (Google Business + sitemap + schema)    │
│  ✓ Marketing trimestral (Meta ads + Google ads strategy)     │
│  ✓ Email automation (post-booking confirmation, pre-arrival) │
├─────────────────────────────────────────────────────────────┤
│  Pricing sugerido (MVP — calibrar con piloto):              │
│  • Mensual: $299 USD/mes  (probar)                          │
│  • Trimestral: $674 USD ($225/mes) — ahorra $222            │
│  • Anual: $2,388 USD ($199/mes) — ahorra $1,200             │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Comparativo vs competidores (TCO anual hotel 30 rooms)

| Solución | Costo año 1 | Incluye website? | Incluye marketing? |
|----------|-------------|------------------|--------------------|
| Cloudbeds Bundle | $3,000-4,000 | ❌ | ❌ |
| Mews + Bookassist | $3,500-5,000 | ❌ | ❌ |
| SiteMinder + PMS aparte | $2,500-3,500 | ❌ | ❌ |
| Little Hotelier | $1,500-2,500 | Template basic | ❌ |
| **Zenix Activate Plus** | **$2,388** | ✅ | ✅ |

**Differential principal:** competidores cobran PMS + booking engine como add-ons separados. Zenix unifica + agrega website + marketing = TCO menor con MÁS valor.

### 5.4 Posicionamiento

> "Tu hotel boutique en LATAM tiene un sitio web bonito pero NO recibe reservas directo? Con Zenix Activate Plus: PMS profesional, motor de reservas embebido en tu sitio en 1 click, y estrategia de marketing trimestral que te baja la comisión OTA del 25% al 10% en 3 meses garantizado o te devolvemos el último mes."

---

## 6. Implementation roadmap (fases)

### Fase 1 — MVP Booking Engine (6-8 semanas)

**Sprint BE-α: Backend API pública (2 sem)**
- New module `apps/api/src/booking-engine/`
- Endpoints `/v1/public/booking-engine/{availability,quote,reserve}`
- Auth via `BookingEngineApiKey` model (per property, regenerable, allowlisted domain)
- Rate limiting `@nestjs/throttler` (60 req/min per IP, 1000/h per propertyId)
- CORS dinámico que lee `BookingEngineApiKey.allowedOrigins`
- `BookingSource.DIRECT_WEB` añadido + attribution UTM
- Reserve endpoint usa `AvailabilityService.check` (§35) + crea GuestStay como source='direct_web'

**Sprint BE-β: Widget web component (2 sem)**
- New repo `zenix-booking-widget` (o folder `apps/widget/`)
- Vanilla web component + Lit (3KB) — sin React dependency en el sitio del hotel
- Build: 1 archivo JS minificado <20KB gzip, hosted en CDN Cloudflare
- Componentes: AvailabilitySearch / RoomCards / GuestForm / PaymentStep / Confirmation
- i18n built-in (es-MX, en-US, pt-BR mínimo)
- Stripe Elements + Mercado Pago SDK
- Shadow DOM con CSS variables para theming
- Mobile-first responsive (tested en iPhone 12, Galaxy S22)

**Sprint BE-γ: Hosted fallback + WP plugin (1 sem)**
- Hosted booking page `zenix.com/book/{property-slug}` para hoteles sin sitio
- WordPress plugin: shortcode `[zenix_booking property="xxx"]` + Gutenberg block
- Plugin distribuible vía WP repo + zip directo

**Sprint BE-δ: Settings + onboarding (1 sem)**
- Settings tab "Booking Engine" en panel admin: API key, allowed origins, theme color, default language
- Onboarding wizard: paste el snippet → preview live → guardar
- Reports: conversion funnel (impressions → searches → reservations) + revenue attribution per source

**Sprint BE-ε: QA + piloto (2 sem)**
- Test en 3 sitios reales (WP, Squarespace, custom) con clientes early-adopters del piloto
- A/B test contra Cloudbeds/Mews si algún cliente comparte sitio
- Load testing 500 concurrent searches

### Fase 2 — Website Builder bundle (4-6 sem) — opcional según demand

Template hotelero responsive + CMS minimal para hoteles que NO tienen sitio:
- Builder no-code (similar a Wix lite) específico hotelero
- 5 templates predefinidos (boutique playa / hostal urbano / cabañas / hotel business / B&B)
- Booking engine pre-embebido
- Galería + reviews integration
- Mapa + contacto auto-generado

### Fase 3 — Marketing automation (4-6 sem) — addon

- Email post-booking (confirmation, pre-arrival 48h, post-stay review request)
- Re-marketing pixel para visitors que abandonan
- Google Business profile sync (precios, fotos auto-update)
- Meta Pixel + Conversion API
- Promo codes engine (descuento Instagram, ads campaign tracking)

---

## 7. Riesgos + mitigaciones

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|--------|--------------|---------|------------|
| R1 | API pública = vector de DDoS / scraping | 🔴 Alta | Backend overload | Cloudflare WAF + rate limit estricto + API key revocable |
| R2 | Race condition overbook directo desde widget | 🟠 Media | Chargeback Visa 13.7 | §35 AvailabilityService transactional + hard 409 |
| R3 | Widget afecta performance del sitio del hotel | 🟠 Media | Hotel lo desinstala | Bundle <20KB gzip + lazy load + Core Web Vitals testing |
| R4 | Hotel sin SSL pierde acceso | 🟡 Baja | Soporte | Hosted fallback `zenix.com/book/{slug}` + onboarding ayuda con Let's Encrypt |
| R5 | Pagos OXXO/Mercado Pago timeout (voucher 24-72h) | 🟠 Media | Hotel guarda noche bloqueada | Inventory hold con TTL configurable + auto-release si voucher no pagado |
| R6 | Competencia Cloudbeds bajar precio | 🟡 Baja | Margen | Diferencial = LATAM payments + bundle marketing |
| R7 | Hoteles confunden "bundle marketing" con servicio agencia | 🟠 Media | Expectativas | Disclaimer claro: setup + tooling, ejecución requiere su tiempo |

---

## 8. Métricas de éxito post-launch

| Métrica | Target Fase 1 | Target Fase 2 |
|---------|---------------|---------------|
| Hoteles que activan widget | 50% del piloto | 80% |
| Conversion rate del widget | ≥2.5% (industry avg) | ≥4% (top tier) |
| % bookings vía direct (vs OTA) | de 30% → 40% en 3 meses | → 50% en 6 meses |
| Comisiones ahorradas/hotel/mes | $500-1500 USD | $1500-3000 USD |
| Widget load time | <2s en 4G | <1.5s |
| Bundle renewal rate (3-mes plan) | 70% | 80% |
| Mobile share of bookings | ≥65% | ≥70% |

---

## 9. Decisión pendiente — bloqueos antes de iniciar

| # | Decisión | Quién decide |
|---|----------|--------------|
| 1 | **Naming comercial:** "Zenix Direct" / "Zenix Connect" / "Zenix Booking" / otro | Producto |
| 2 | **Pricing exacto** mensual/trimestral/anual del bundle | Negocio |
| 3 | **¿Website builder Fase 2 in-scope o partner externo?** (ej. partnership con Webflow templates) | Producto + negocio |
| 4 | **¿Open source el widget?** (estrategia hype + adopción) | Estratégica |
| 5 | **Channex bidirectional first** (CHANNEX-INBOUND sprint pendiente bloquea esto?) | Técnica — sí, idealmente cierre CHANNEX-INBOUND antes para reservas direct + OTA convivan limpio |
| 6 | **¿White-label para partners?** Permitir que ZaharDev parcera resellers cobren su propio bundle por encima | Estratégica |

---

## Sources

- [Cloudbeds Booking Engine Immersive Experience 2.0](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/32048321731739-Cloudbeds-Booking-Engine-Immersive-Experience-2-0-Everything-you-need-to-know)
- [Cloudbeds iFrame Deprecation announcement](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/42963882806299-iFrame-Deprecation-What-s-Changing-and-Why-to-Upgrade-to-Cloudbeds-Booking-Engine-Plus)
- [STAAH Technical Guide to Booking Engine Widgets](https://www.staah.com/blogs/thoughtful-thursday-a-technical-guide-to-booking-engine-widgets-types-use-cases-best-practices-for-hoteliers/)
- [Best Hotel Booking Engine 2026 — HotelTechReport](https://hoteltechreport.com/marketing/hotel-booking-engine)
- [Direct Booking Strategy — ZuzuHospitality](https://zuzuhospitality.com/blog/direct-booking-strategy-how-to-reduce-ota-commissions)
- [Triptease Direct Booking Strategies](https://www.triptease.com/resources/tag/direct-booking-strategies)
- [Hotel Website Conversion Rate Benchmarks 2026 — Roomstay](https://www.roomstay.io/blog/optimising-hotel-average-conversion-rate)
- [Mobile Booking Experience for Hotels — OneWebcare](https://onewebcare.com/blog/mobile-booking-experience-for-hotel-websites/)
- [Iframe Security Risks 2026 — Qrvey](https://qrvey.com/blog/iframe-security/)
- [WordPress Hotel Booking Plugins — Gravity Booking](https://gravitybooking.com/hotel-booking-plugins/)
- [SiteMinder Hotel Booking Plugin Top 10](https://www.siteminder.com/r/hotel-booking-plugin/)
- [12 ways to increase direct bookings — Lighthouse](https://www.mylighthouse.com/resources/blog/increase-hotel-direct-bookings-cut-ota-commissions)
