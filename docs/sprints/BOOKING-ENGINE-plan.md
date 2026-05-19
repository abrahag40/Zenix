# Sprint BOOKING-ENGINE — Plan + Estudio de Mercado

> **Status:** RESEARCH ✓ · Plan técnico aprobado · Implementación pendiente de scheduling
> **Sprint owner:** ZaharDev consulting + Zenix product
> **Estimado Fase 1 (API + Hosted UI):** 5-6 semanas
> **Justificación negocio:** habilitar a Zenix para conectarse a cualquier sitio web en tiempo real (3 tiers de integración) — diferencial LATAM vs Cloudbeds/Mews

---

## 0. Nomenclatura — terminología correcta de industria

Lo que coloquialmente se llama "plugin" tiene varios términos formales según el componente:

| Término | Significado preciso |
|---------|---------------------|
| **Booking Engine** (BE) | El motor que procesa reservas (backend + UI). Término más usado |
| **Internet Booking Engine (IBE)** | Sinónimo formal usado por Sabre, Amadeus, Pegasus |
| **Direct Booking Widget** | Solo la pieza UI embebible en el sitio web del hotel |
| **Hosted Booking Page** | Página completa hosted en el dominio del PMS (ej. Cloudbeds: `hotels.cloudbeds.com/reservation/{id}`) |
| **Booking Plugin** | Específicamente la versión para CMS (WordPress, Wix, Squarespace) |

Para este sprint usamos como nombres internos:
- **Zenix Booking API (ZBA)** — el motor REST público
- **Zenix Booking Page (ZBP)** — la hosted UI en `book.zenix.com/{property-slug}`
- **Zenix Booking Widget (ZBW)** — el web component embebible (Fase 2 opcional)

---

## 1. Resumen ejecutivo

### Objetivo
Habilitar a Zenix para que **cualquier sistema externo** (sitio web del hotel, app móvil, partner OTA boutique, Zapier workflows, sistema interno de cadena) pueda consultar disponibilidad y crear reservas en tiempo real con comunicación bidireccional. Las reservas creadas externamente llegan a Zenix con `source='DIRECT_WEB'` (cero comisión OTA).

### Estrategia tier-based (estándar de industria)

```
┌─────────────────────────────────────────────────────────────────┐
│  ZENIX BOOKING API (REST público)                                │
│  GET  /availability  /rates  /room-types                         │
│  POST /reservations  (con Idempotency-Key)                       │
│  Webhooks outbound: reservation.created · availability.changed   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
       ┌──────────────────┼──────────────────┐
       ▼                  ▼                  ▼
┌─────────────┐  ┌──────────────────┐  ┌────────────────┐
│ HOSTED UI   │  │ EMBED WIDGET     │  │ CUSTOM         │
│ book.zenix  │  │ <script src=...> │  │ Cliente con su │
│ .com/{slug} │  │ web component    │  │ API key        │
└─────────────┘  └──────────────────┘  └────────────────┘
   80% mercado       15-25% Fase 2          5% advanced
```

**Tres tiers de integración** que el customer self-selecciona según su capacidad técnica. **Una sola API backend** = un solo punto de mantenimiento. La Hosted UI es la "reference implementation" de la API (dogfooding total).

### Pattern Cloudbeds/Mews/Stripe validado por la industria

| Plataforma | Hosted | Embed | API |
|-----------|--------|-------|-----|
| Cloudbeds | `hotels.cloudbeds.com/reservation/{id}` | Booking Engine Plus (web component) | API REST + GraphQL |
| Mews | Booking Engine hosted | Distributor widget | Connector API |
| Stripe (paradigma adyacente) | Stripe Checkout | Stripe Elements | Stripe API |

**No es coincidencia.** Cada tier captura un segmento de mercado distinto. Implementar solo uno deja entre 25-80% del mercado fuera.

---

## 2. ¿Es posible? — Datos de viabilidad

### Lo que YA existe en Zenix (70% del trabajo)

| Componente | Estado | Por qué importa |
|------------|--------|-----------------|
| `AvailabilityService.check` con transactional guard (§35) | ✅ | Anti-overbook garantizado para reservas externas |
| `createGuestStay` con source attribution | ✅ | Solo agregar `DIRECT_WEB` al enum |
| Channex push outbound | ✅ stub | Notificar a OTAs cuando hay direct booking |
| SSE singleton para refresh tiempo real | ✅ §124 | Calendar del recepcionista se actualiza al instante |
| Multi-tenancy + propertyId isolation | ✅ | Cada hotel tiene su scope |
| `@nestjs/throttler` rate limiting | ✅ disponible | DDoS protection para API pública |
| `@nestjs/swagger` OpenAPI generation | ✅ disponible | Docs auto-generadas |
| Stripe Elements integration | 🟡 v1.0.1 PAY-CORE | Payment processing |

### Lo que falta (30%)

1. Módulo `apps/api/src/public-booking/` con endpoints REST públicos
2. Modelo `BookingApiKey` para autenticar requests externos
3. Modelo `WebhookSubscription` para outbound notifications
4. CORS dinámico por dominio del customer
5. Hosted UI React app en `apps/booking-page/` (o sub-route)
6. Documentación OpenAPI + sandbox keys

**Conclusión:** Sí, es posible. 5-6 semanas focused work para Fase 1 (API + Hosted UI).

---

## 3. Estudio de mercado

### 3.1 Competencia directa

| Player | Pricing/mes | Target | Tech BE | Gap LATAM |
|--------|-------------|--------|---------|-----------|
| **Cloudbeds** | $150-200 | 20-100 rooms | Web component (deprecando iframe) | Español parcial, sin OXXO/MercadoPago/SPEI |
| **Mews** | $85+ ($8-15/room) | Premium boutique | Web component nativo | Caro para hostal LATAM, mismo gap de pagos |
| **SiteMinder** | Variable | Distribución multi-channel | No tiene BE propio | Requiere PMS aparte |
| **Little Hotelier** | $30+ | <20 rooms | Hosted page basic | Customization limitada |
| **WP plugins (MotoPress, VikBooking, Gravity)** | One-time $80-200 | DIY WordPress | Embebido WP | No son PMS de verdad — solo form + calendar |

### 3.2 Conversion benchmarks (datos 2026)

| Métrica | Promedio | Top |
|---------|----------|-----|
| Hotel website conversion | 1.5-2.5% | 5%+ |
| Mobile share | 60-70% | 70%+ |
| Booking engine drop-off (transition site→BE) | 62% | <30% (embedded) |
| Page load target | <3s | <2s |
| Embedded vs redirect | +37% conversion |  |
| Mobile-first design | +7-12% lift |  |
| Trust signals visible | +23-31% |  |

**Implicación:** la hosted page tiene ~62% drop-off industry-wide. El widget embebido captura +37% adicional. Por eso ofrecer AMBOS importa.

### 3.3 OTA economics que justifican el sprint

| Métrica | Datos |
|---------|-------|
| Comisión Booking.com / Expedia | 15-25% estándar, 30% programa "Genius" |
| Comisión Airbnb | 14-16% |
| ROI direct booking reportado | 50x el costo del booking engine (Lighthouse) |
| Conversion boost si hotel iguala precio OTA | +34% (Triptease parity) |

**Para un hotel boutique 30-cuartos con $500k revenue anual y 40% OTA mix:** paga ~$60k/año en comisiones. Si Zenix Booking Engine baja eso a 20% OTA, ahorra ~$20k/año. ROI claro.

### 3.4 Diferenciadores Zenix únicos en LATAM

| Diferencial | Players que NO lo tienen |
|-------------|--------------------------|
| **OXXO voucher payment** (MX) | Mews, Cloudbeds, Little Hotelier, SiteMinder |
| **Mercado Pago native** | Mews, Cloudbeds, Little Hotelier |
| **SPEI transferencia (MX)** | Todos los grandes |
| **i18n es-MX first-class** (no traducción de en-US) | La mayoría |
| **CFDI auto post-booking** (v1.0.2) | Nadie en occidental space |

---

## 4. Arquitectura técnica

### 4.1 Una sola API backend, tres formas de consumirla

```
┌────────────────────────────────────────────────────────────────────┐
│  PUBLIC REST API (apps/api/src/public-booking/)                     │
│                                                                      │
│  READ (sin commit, cacheable):                                       │
│    GET  /v1/public/properties/:slug          info pública            │
│    GET  /v1/public/properties/:slug/availability                     │
│    GET  /v1/public/properties/:slug/rates                            │
│    GET  /v1/public/properties/:slug/room-types                       │
│                                                                      │
│  WRITE (require API key + Idempotency-Key):                          │
│    POST   /v1/public/reservations                                    │
│    GET    /v1/public/reservations/:id                                │
│    DELETE /v1/public/reservations/:id  (si política lo permite)      │
│                                                                      │
│  OUTBOUND webhooks (Zenix avisa a otros):                            │
│    reservation.created · reservation.confirmed                       │
│    reservation.cancelled · availability.changed                      │
└────────────────────────────────────────────────────────────────────┘
                                   │
       ┌──────────────────────────┼──────────────────────────┐
       ▼                          ▼                          ▼
┌────────────────────┐  ┌────────────────────┐  ┌──────────────────┐
│ HOSTED UI          │  │ EMBED WIDGET       │  │ CUSTOM INTEGRATION│
│ book.zenix.com/    │  │ Fase 2 (opcional)  │  │ Cliente con su    │
│ {property-slug}    │  │ <script src=...>   │  │ propia API key    │
│                    │  │ web component Lit  │  │                   │
│ React app dogfood- │  │ <20KB bundled      │  │ Built whatever    │
│ ing de la API.     │  │ Shadow DOM CSS     │  │ they want         │
│ Reference impl.    │  │ vars override      │  │                   │
└────────────────────┘  └────────────────────┘  └──────────────────┘
   "Reservar ahora"        Embebido sin redirect    Chains, partners,
   link from hotel site    (mejor UX +37%)          mobile apps, Zapier
   → captura 80% del       → captura 15-25%         → captura 5%
     mercado                 (devs técnicos)
```

### 4.2 Decisiones técnicas no-negociables

**Para la API:**
1. **API key con prefix** (`pk_live_xxx`, `pk_test_xxx`) — pattern Stripe. Hash bcrypt en DB, plaintext solo en momento de generar
2. **CORS estricto** — cada API key registra `allowedOrigins[]`. Llamadas desde otros dominios → 403
3. **Rate limit dual** — per-IP (DDoS) + per-key (abuse) usando `@nestjs/throttler`
4. **Idempotency-Key obligatorio** en POST — evita doble booking accidental al reintentar
5. **Webhook HMAC SHA256** con secret per-subscription — el cliente verifica que el evento viene de Zenix
6. **Versioning vía URL** (`/v1/public/`) — futuro `/v2/` sin breaking change
7. **Cache headers** — GET endpoints con `Cache-Control: max-age=30` (CDN-friendly)
8. **Idioma de respuesta** — `Accept-Language` header con fallback es-MX

**Para la Hosted UI:**
1. **React app standalone** en `apps/booking-page/` (NO mezclar con `apps/web` que es el panel admin)
2. **SSR opcional** — para SEO de la página `book.zenix.com/{slug}`. Probablemente NextJS o Vite SSR
3. **Mobile-first** — 60-70% del tráfico es mobile. Diseñar primero phone, scale up
4. **Branding del hotel** — load colores del PropertySettings + logo + fotos via API
5. **Single-page checkout** — NO wizard de pasos. Apple HIG: minimize friction
6. **Payment integrated** — Stripe Elements + Mercado Pago + OXXO (diferencial LATAM)
7. **i18n built-in** — es-MX default + en-US, pt-BR, fr-FR

### 4.3 Source attribution

```ts
enum BookingSource {
  DIRECT,           // walk-in / phone (recepcionista creates)
  DIRECT_WEB,       // via Zenix Booking API/Page/Widget — NUEVO
  BOOKING_COM,      // via Channex
  EXPEDIA,          // via Channex
  AIRBNB,           // via Channex
  HOTELS_COM,
  AGODA,
  // etc.
}
```

Permite reports tipo "qué % de bookings vinieron directo vs OTA" para que el hotel mida ROI del booking engine.

### 4.4 Edge cases cubiertos

| Edge case | Solución |
|-----------|----------|
| Race condition: 2 reservas simultáneas misma noche | `AvailabilityService.check` transactional (§35) + 409 al loser |
| Cliente click 2× en "Reservar" | `Idempotency-Key` UUID client-side → segundo request retorna primer resultado |
| API key compromised | Revocable instant desde Settings + audit log de uso por IP/timestamp |
| Hotel sin SSL en su sitio | Hosted UI en `book.zenix.com` (sí tiene SSL nuestro) → fallback siempre disponible |
| Pago OXXO voucher 24-72h | Reservation hold con TTL configurable + auto-release si voucher no pagado |
| Webhook URL del cliente caída | Retry exponential backoff 5 intentos + dead letter queue + alerta supervisor |
| Promo codes / discounts | Reserved para v1.2+ (out of scope sprint inicial) |
| Multi-property / chain | API key scoped a 1 property; chain users tienen N API keys |

---

## 5. Plan de implementación

### Fase 1 — Habilitar conexión a cualquier sitio web (5-6 sem)

**El orden importa: API primero, UI después.** La hosted UI es consumidor de la API; no podemos construir la UI sin la API.

#### Sprint 1A — API pública READ (1 sem)

- New module `apps/api/src/public-booking/`
- Endpoints solo SELECT (sin commit DB):
  - `GET /v1/public/properties/:slug` — info pública del hotel (nombre, fotos, ciudad, currency, languages)
  - `GET /v1/public/properties/:slug/availability?checkIn=&checkOut=&adults=&children=`
  - `GET /v1/public/properties/:slug/rates?checkIn=&checkOut=&roomTypeId=`
  - `GET /v1/public/properties/:slug/room-types`
- CORS abierto a todos (read-only, no requiere API key inicialmente)
- Cache headers `Cache-Control: max-age=30`
- Rate limit per-IP estricto (60 req/min)
- Property slug system (`prop-hotel-tulum-001` → `hotel-tulum`)

**Entregable:** cualquier sitio web puede consultar disponibilidad sin auth.

#### Sprint 1B — API pública WRITE + Auth + Webhooks (1-2 sem)

- New models:
  ```prisma
  model BookingApiKey {
    id              String   @id @default(uuid())
    propertyId      String
    keyPrefix       String   // pk_live_xxx (visible)
    keyHash         String   // bcrypt(plaintext)
    label           String   // "Sitio web hotel"
    allowedOrigins  String[] // ["https://hotelxyz.com"]
    active          Boolean  @default(true)
    lastUsedAt      DateTime?
    createdAt       DateTime @default(now())
    revokedAt       DateTime?
  }

  model WebhookSubscription {
    id          String   @id @default(uuid())
    propertyId  String
    url         String
    events      String[] // ["reservation.created", "availability.changed"]
    secret      String   // HMAC signing key
    active      Boolean  @default(true)
    createdAt   DateTime @default(now())
  }
  ```
- Endpoint `POST /v1/public/reservations` con:
  - Auth via `X-API-Key` header
  - CORS dinámico que lee `allowedOrigins`
  - `Idempotency-Key` header obligatorio
  - Body: propertyId, roomTypeId, checkIn, checkOut, guest{}, paymentToken
  - Integration con `AvailabilityService.check` (§35) — protege overbook
  - Crea GuestStay con `source='DIRECT_WEB'`
  - Dispara webhook async `reservation.created`
- Endpoint `GET /v1/public/reservations/:id` — consulta status
- Endpoint `DELETE /v1/public/reservations/:id` — cancela si política lo permite
- `WebhookDispatcher` service:
  - Queue async (BullMQ o in-memory para v1)
  - HMAC SHA256 signature header `X-Zenix-Signature`
  - Retry exponential 1s/5s/30s/5min/30min
  - Dead letter después de 5 intentos
- Rate limit per-key (1000/h)

**Entregable:** cualquier sitio puede CREAR reservas y RECIBIR notificaciones.

#### Sprint 1C — Settings UI + Onboarding (3-5 días)

- New Settings tab "API & Webhooks" en panel admin Zenix
- Generar/revocar API keys (plaintext mostrado solo 1 vez)
- Configurar `allowedOrigins`
- Suscribir webhooks (URL + events checkboxes)
- Dashboard de uso: requests/día, % errors, last used
- Testing tools: "Send test webhook" button + "Try API" sandbox

**Entregable:** customer puede self-service activar la integración.

#### Sprint 1D — Hosted UI `book.zenix.com/{slug}` (2-3 sem)

- New app `apps/booking-page/` (Vite + React + SSR opcional)
- Routes:
  - `/{slug}` → search box (dates + guests)
  - `/{slug}/results` → room cards con fotos/precios
  - `/{slug}/checkout` → guest form + payment
  - `/{slug}/confirmation` → success + booking ref
- Brand customization: lee `PropertySettings.brandColor` + `logo` + `photos[]` via API
- Mobile-first responsive
- Payment integration:
  - Stripe Elements (cards US/EU/MX)
  - Mercado Pago SDK (MX/AR/BR/CO/CL)
  - OXXO voucher (MX)
- i18n: es-MX default, en-US, pt-BR, fr-FR
- SEO: meta tags + Open Graph + structured data (schema.org Hotel)
- Subdomain DNS: `book.zenix.com` con wildcard `*.book.zenix.com` para futuro white-label

**Entregable:** cualquier hotel puede pegar `<a href="book.zenix.com/{slug}">Reservar</a>` en su sitio.

#### Sprint 1E — OpenAPI docs + sandbox (3 días)

- `@nestjs/swagger` auto-genera spec OpenAPI 3.0
- Hosted en `docs.zenix.com/api` (Swagger UI)
- Sandbox API keys para testing sin commit a producción
- Ejemplos curl/JavaScript/Python
- Guía "Cómo integrar Zenix Booking en tu sitio en 5 minutos"

**Entregable:** developers externos pueden integrar sin contactar soporte.

#### Sprint 1F — QA + piloto (1 sem)

- Test en 3 sitios reales (WordPress, Squarespace, custom HTML)
- Load testing 500 concurrent searches
- Security audit: API key leaks, rate limit bypass, webhook spoofing
- A/B test conversion vs Cloudbeds si algún cliente comparte sitio

### Fase 2 — Widget embebido (2-3 sem, opcional)

Si Fase 1 muestra demanda y los clientes piden "embebido en mi sitio sin redirect":

- New `apps/booking-widget/` con Lit 3KB + vanilla web components
- Reutiliza los componentes de la Hosted UI (1 codebase, 2 builds)
- Build minificado <20KB gzip, hosted CDN Cloudflare
- Shadow DOM con CSS variables para theming
- Install: `<script src=".../widget.js"></script><div data-zenix-booking="slug"></div>`

### Fase 3 — WordPress plugin (1 sem, opcional)

Si Fase 1 muestra demanda de WordPress específicamente:

- PHP plugin wrapper del widget
- Shortcode `[zenix_booking property="xxx"]`
- Gutenberg block
- Distribución WP repo oficial

---

## 6. Riesgos + mitigaciones

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|--------|--------------|---------|------------|
| R1 | API pública = vector DDoS / scraping | 🔴 Alta | Backend overload | Cloudflare WAF + `@nestjs/throttler` per-IP/per-key |
| R2 | Race condition overbook desde API externa | 🟠 Media | Chargeback Visa 13.7 | `AvailabilityService.check` transactional (§35) + hard 409 |
| R3 | Hosted UI performance afecta SEO del subdomain | 🟠 Media | Bookings perdidos | SSR + Lighthouse audits + Core Web Vitals monitoring |
| R4 | API key compromised | 🟡 Baja | Bookings spam | Revocable instant + audit log + alerta uso anómalo |
| R5 | Pagos OXXO/MercadoPago timeout (24-72h voucher) | 🟠 Media | Hotel guarda noche bloqueada | Inventory hold TTL + auto-release si voucher no pagado |
| R6 | Webhook URL del cliente cae → eventos perdidos | 🟠 Media | Inconsistencia | Retry exponential 5x + dead letter + supervisor alert |
| R7 | Hotel cambia precios — cache 30s muestra stale | 🟡 Baja | Disputa precio | `Last-Modified` header + ETag + invalidation manual desde Settings |
| R8 | Subdomain DNS misconfiguration (wildcard) | 🟡 Baja | Hosted UI inaccesible | Pre-deploy DNS validation + health checks |

---

## 7. Decisiones pendientes antes de iniciar

| # | Decisión | Quién decide |
|---|----------|--------------|
| 1 | **Naming comercial:** "Zenix Direct" / "Zenix Connect" / "Zenix Booking" | Producto |
| 2 | **Pricing del feature** — incluido en PMS o addon | Negocio |
| 3 | **Dependencia CHANNEX-INBOUND** — ¿cerrar ese sprint antes para que direct + OTA convivan limpio? (recomendado: SÍ) | Técnica |
| 4 | **Subdomain DNS** — `book.zenix.com` o `reservations.zenix.com` o `{property-slug}.book.zenix.com` (white-label friendly) | Producto |
| 5 | **SSR vs SPA puro** para Hosted UI — SSR mejor SEO pero más complejidad de deploy. Recomendación: Vite SSR mínimo, NextJS si necesidad crece | Técnica |
| 6 | **Sandbox** — ¿permitir que ANY developer cree sandbox key o solo customers Zenix pagados? | Negocio |
| 7 | **Open source el widget** (Fase 2) — estrategia hype + adopción, GitHub stars como marketing | Estratégica |

---

## 8. Métricas de éxito post-launch

| Métrica | Target Fase 1 (3 meses) | Target Fase 1+2 (6 meses) |
|---------|--------------------------|----------------------------|
| Hoteles que activan la integración | 50% del piloto | 80% |
| Conversion rate Hosted UI | ≥2.5% (industry avg) | ≥3.5% |
| Conversion rate Widget embed (si Fase 2) | ≥3.5% | ≥4.5% |
| % bookings via direct (vs OTA) post-activación | 30% → 40% | 40% → 50% |
| Comisiones ahorradas/hotel/mes | $500-1500 USD | $1500-3000 |
| Hosted UI mobile load time | <2s en 4G | <1.5s |
| Webhook delivery rate | ≥99% (con retries) | ≥99.5% |
| Mobile share of bookings | ≥65% | ≥70% |

---

## 9. Cómo se ve el end-state

### Customer "fácil" (80% del mercado — sin dev team)
```html
<!-- Lo único que pega en su sitio WordPress/Wix/cualquier cosa -->
<a href="https://book.zenix.com/hotel-tulum?lang=es&currency=mxn"
   class="btn-reservar">Reservar ahora</a>
```
Click → Hosted UI Zenix → reservar → vuelve a su sitio con confirmación. **5 minutos de setup.**

### Customer "intermedio" (15-25% — Fase 2)
```html
<script src="https://cdn.zenix.com/widget.js" defer></script>
<div data-zenix-booking="hotel-tulum"></div>
```
Embebido sin redirect. **+37% conversion** vs hosted.

### Customer "advanced" (5% — chains, partners, mobile apps, Zapier)
```js
// Cliente construye su propia UI consumiendo la API
const res = await fetch('https://api.zenix.com/v1/public/properties/hotel-tulum/availability?...', {
  headers: { 'X-API-Key': 'pk_live_xxx' }
})
const { rooms } = await res.json()
// ... cliente maneja la UI como quiera

// Crear reservación
await fetch('https://api.zenix.com/v1/public/reservations', {
  method: 'POST',
  headers: {
    'X-API-Key': 'pk_live_xxx',
    'Idempotency-Key': crypto.randomUUID(),
  },
  body: JSON.stringify({ /* booking data */ })
})

// Reciben webhooks cuando algo cambia
// → su backend procesa reservation.created, availability.changed, etc.
```

**Los 3 paths consumen la MISMA API backend.** Zero duplicación.

---

## Sources

- [Cloudbeds Booking Engine Immersive Experience 2.0](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/32048321731739-Cloudbeds-Booking-Engine-Immersive-Experience-2-0-Everything-you-need-to-know)
- [Cloudbeds iFrame Deprecation announcement](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/42963882806299-iFrame-Deprecation-What-s-Changing-and-Why-to-Upgrade-to-Cloudbeds-Booking-Engine-Plus)
- [STAAH Technical Guide to Booking Engine Widgets](https://www.staah.com/blogs/thoughtful-thursday-a-technical-guide-to-booking-engine-widgets-types-use-cases-best-practices-for-hoteliers/)
- [Best Hotel Booking Engine 2026 — HotelTechReport](https://hoteltechreport.com/marketing/hotel-booking-engine)
- [Hotel Website Conversion Rate Benchmarks 2026 — Roomstay](https://www.roomstay.io/blog/optimising-hotel-average-conversion-rate)
- [Mobile Booking Experience for Hotels — OneWebcare](https://onewebcare.com/blog/mobile-booking-experience-for-hotel-websites/)
- [Iframe Security Risks 2026 — Qrvey](https://qrvey.com/blog/iframe-security/)
- [Stripe Checkout vs Elements vs API design docs](https://stripe.com/docs/payments/checkout) — paradigma adyacente
- [12 ways to increase direct bookings — Lighthouse](https://www.mylighthouse.com/resources/blog/increase-hotel-direct-bookings-cut-ota-commissions)
- [Triptease Direct Booking Strategies](https://www.triptease.com/resources/tag/direct-booking-strategies)
