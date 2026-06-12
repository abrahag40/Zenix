# Sprint BOOKING-ENGINE ("Zenix Booking") — Plan + Estudio de Mercado

> **Status (2026-06-11):** RESEARCH ✓ · Plan técnico aprobado · **Decisiones de arranque tomadas con owner** · Implementación lista para iniciar (v1.1.0).
> **Sprint owner:** ZaharDev consulting + Zenix product
> **Estimado Fase 1 (API + Hosted UI, modo PAY_AT_HOTEL):** 5-6 semanas
> **Justificación negocio:** habilitar a Zenix para conectarse a cualquier sitio web en tiempo real (3 tiers de integración) — diferencial LATAM vs Cloudbeds/Mews
>
> ### Decisiones de arranque (2026-06-11, con owner) — resuelven §8
> | # | Decisión | Resolución |
> |---|----------|-----------|
> | **Naming** (§8.1) | Nombre comercial del feature | **"Zenix Booking"** — alinea con nomenclatura interna ZBA/ZBP/ZBW. Módulo backend `public-booking`, app `apps/booking-page/`. |
> | **Secuencia A/B** (CLAUDE.md) | ¿PAY-CORE antes o booking engine primero? | **Opción B** — Fase 1 arranca en **`PAY_AT_HOTEL`-only**, CERO dependencia Stripe/PAY-CORE. Captura reservas directas (`source='DIRECT_WEB'`) desde ya; el prepago online se enchufa cuando PAY-CORE (v1.0.1) aterrice, sin reescritura. Justificación: desacopla releases + entrega valor antes + el insight nuclear (reserva directa sin comisión OTA) no requiere prepago para existir. |
> | **Channex** (§8.3) | ¿Cerrar CHANNEX-INBOUND antes? | **YA RESUELTO** — CHANNEX-INBOUND cerrado + CHANNEX-CANCEL-FIX mergeado (PR #75). Direct + OTA conviven hoy. No es bloqueante. |
>
> **Ver el work plan re-secuenciado para Opción B en la [§5-B](#5b-plan-de-implementación--opción-b-pay_at_hotel-first).** El §5 original (prepago integrado en Fase 1) queda como referencia del end-state v1.1.1+.

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

#### Sprint 1C — Wizard Step 5.5 + Settings UI (1-1.5 sem) — REVISADO 2026-05-24

**Decisión owner 2026-05-24**: la configuración del booking engine es
**consultor-led desde el Wizard Zenix Activate**, NO self-service. Ver
detalle completo en [BOOKING-ENGINE-wizard-integration.md](BOOKING-ENGINE-wizard-integration.md).

**Wizard Step 5.5 — Booking Engine config** (consultor llena durante onboarding):
- Sub-5.5.1 Slug & domain (`book.zenix.com/<slug>` + opcional CNAME custom)
- Sub-5.5.2 Branding (logo, primaryColor, accentColor, fontFamily)
- Sub-5.5.3 Copy & policies (heroTitle/Subtitle, cancellation policy, T&C)
- Sub-5.5.4 Photos (hotel general + per room type, drag-and-drop a R2)
- Sub-5.5.5 Payment policy (FULL_PREPAY / DEPOSIT_30 / DEPOSIT_50 / PAY_AT_HOTEL
  + OXXO/SPEI/MercadoPago toggles)
- Preview live iframe del BE con cambios al tiro

**Schema additions** (ver wizard-integration doc §3):
- `BookingEngineConfig` (1:1 con Property)
- `BookingEnginePhoto` (N por config)
- `RoomTypePhoto` (N por roomType)

**Settings UI** (post-onboarding, para edits posteriores del consultor):
- Tab "Booking Engine" en `/nova/channex` o Settings dedicado
- Editar mismo schema, mismo preview live
- "API & Webhooks" sub-tab para Tier 3 enterprise (API key + allowedOrigins
  + webhook subscriptions)

**Entregable**: consultor sale del wizard con `book.zenix.com/<slug>` LIVE
sin que el cliente toque nada técnico.

**Diferenciador comercial registrado**: cero PMS en la comparativa (Cloudbeds,
Mews, Little Hotelier, RoomRaccoon, SiteMinder, Opera) tiene wizard end-to-end
consultor-led para Booking Engine. Cloudbeds = self-service (cliente sufre
12h setup), Mews = sales-led onboarding manager (4 semanas), Opera = consultor
Oracle ($15-30k). Zenix = wizard 1 día.

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

## 5-B. Plan de implementación — OPCIÓN B (PAY_AT_HOTEL-first)

> **Re-secuenciado 2026-06-11 tras decisión owner.** El §5 de arriba asume prepago integrado en Fase 1 (depende de PAY-CORE). Esta versión **B** desacopla el prepago: Fase 1 entrega el motor completo + hosted UI capturando reservas con **pago en recepción**, cero dependencia Stripe. El prepago llega como capa enchufable post-PAY-CORE. **Este es el orden de trabajo vigente.**

### Principio de diseño que hace B posible

El checkout se construye desde el día 1 con un campo `paymentPolicy` (`FULL_PREPAY | DEPOSIT_30 | DEPOSIT_50 | PAY_AT_HOTEL`). En Fase 1 el **único valor habilitado es `PAY_AT_HOTEL`**; los demás existen en el schema/UI pero aparecen deshabilitados con copy "Disponible próximamente". Cuando PAY-CORE aterriza, se habilitan sin tocar el flujo de reserva — solo se enchufa el `PaymentProvider` en el step de pago. Patrón "feature flag por capacidad", no rama de código.

### Tabla de seguimiento — Fase 1-B (5-6 semanas)

| Etapa | Alcance | Días-dev | Dependencia | Estado |
|-------|---------|----------|-------------|--------|
| **B0 — Foundation** | `source='DIRECT_WEB'` (string, sin migration de enum, schema.prisma:1545) + `BookingEngineConfig` model (slug + branding + `paymentPolicy=PAY_AT_HOTEL`) + property slug system (`packages/shared/booking-slug.ts`) + seed Hotel Tulum | 2-3 | — | ✅ **hecho** (2026-06-11) |
| **B1 — API pública READ** | Módulo `apps/api/src/public-booking/` · `GET /v1/public/properties/:slug[/availability\|/rates\|/room-types]` · `@Public()` + `Cache-Control: max-age=30` · delega §35 · filtro capacidad · **verificado e2e** (200 vs hotel-tulum). ⚠️ Follow-ups: throttle per-IP (falta `@nestjs/throttler`) + CORS abierto en prod para `/api/v1/public/*` (hoy restringido por ALLOWED_ORIGINS) | 4-5 | B0 | ✅ **hecho** (2026-06-11) · 2 follow-ups |
| **B2 — API pública WRITE (PAY_AT_HOTEL)** | `BookingApiKey` (pk_live/pk_test, bcrypt, allowedOrigins CORS) + `ApiKeyGuard` · idempotencia `BookingIdempotencyRecord` · `POST /v1/public/reservations` con `rooms[]` (multi-tipo/multi-fecha/grupo) + `AvailabilityService.check` (§35, atómico) → `GuestStay{source:'DIRECT_WEB', HOTEL_COLLECT}` + Journey + Segment + `ReservationGroup` si N>1 · `GET /reservations/:ref` status · SSE `booking:created` (§124). **Verificado e2e** (single + grupo + idempotencia + capacidad 400 + 401). ⚠️ `DELETE`/cancel → B2.1 (requiere wire del cancellation engine Fase C) | 5-6 | B1 | ✅ **hecho** (2026-06-11) |
| **B3 — Webhooks + feed de disponibilidad** | `WebhookSubscription` + `WebhookDelivery` · `WebhookDispatcher` (HMAC `X-Zenix-Signature`, retry expo 1s/5s/30s/5m/30m, dead-letter + notif supervisor) · listener reusa `channex.availability.changed` (§141) + `booking.*` · eventos `reservation.created` + `availability.changed` · **`GET /availability-calendar`** (feed advisory per-noche para que el website pinte fechas sin cupo en gris). **Verificado e2e** (HMAC válido + retry FAILED + calendario). ⚠️ `reservation.cancelled` → follow-up (cubierto hoy por `availability.changed`) | 3-4 | B2 | ✅ **hecho** (2026-06-11) |
| **B4 — Panel consultor (Nova)** | **OPCIONAL** — `BookingEngineManagementController` `/v1/nova/booking-engine` (Nova-scoped + IDOR check §191): list + **toggle on/off** + upsert config + generate/revoke API key + create/toggle webhook. UI `NovaBookingEnginePage` (sidebar "Zenix Booking"). **Verificado e2e EN NAVEGADOR**: render en Nova shell, toggle Cancún INACTIVO→ACTIVO (config creada al vuelo), detalle URL+policy, "Generar llave" → plaintext una vez, sección webhooks. Sin errores de consola. Pendiente: Step 5.5 del wizard + preview live + branding form | 5-6 | B0-B3 | ✅ **hecho** (2026-06-11) |
| *Follow-up B1/B2* | **`@nestjs/throttler`** instalado + `ThrottlerGuard` 60/min per-IP en el controller público — **verificado e2e** (60×200 → 429) | — | — | ✅ **hecho** |
| **B5 — Hosted page `book.zenix.com/{slug}`** | `BookingPage` en `apps/web/src/booking/` ruta pública `/book/:slug` (patrón PrecheckinPage — sin shell PMS, en `PUBLIC_ROUTE_PREFIXES`). Endpoint **first-party slug-scoped sin API key** `POST /properties/:slug/reservations` (rate-limited, patrón Cloudbeds). Flujo single-page mobile-first search→results→checkout→confirmation · branding del config (color/hero) vía API · banner PAY_AT_HOTEL · maneja 409. **Verificado e2e EN NAVEGADOR**: reserva real Cabaña → `MX-W-000-2606-0001` DIRECT_WEB/HOTEL_COLLECT/PENDING en BD; bug email-vacío encontrado+corregido. **Detalles cerrados:** SEO (title/description/Open Graph + JSON-LD schema.org Hotel inyectados client-side, verificados) + code-split lazy (el huésped no descarga el bundle PMS) + guard de fechas + "Hacer otra reserva" (reset idempotency). Sin errores consola. ⚠️ B5.1 (infra-coupled, diferido): extracción a `apps/booking-page/` standalone + SSR (cuando se provisione `book.zenix.com`) + i18n. Payment = Fase P (post-PAY-CORE) | 8-10 | B1-B2 | ✅ **hecho** (2026-06-11, SEO ✅, sin SSR) |
| **B6 — OpenAPI docs + sandbox** | `@nestjs/swagger` + plugin introspección DTOs · doc scoped a `PublicBookingModule` (controller Nova excluido con `@ApiExcludeController`) · **Swagger UI en `/api/docs`** + spec `/api/docs-json` (8 paths, security `X-API-Key`, summaries) · guía [docs/booking-engine-integration.md](../booking-engine-integration.md) "integra en 5 min" (curl/JS + tabla de errores 409/400/403/401 + HMAC) · sandbox = keys `pk_test_`. **Verificado e2e EN NAVEGADOR** (Swagger UI renderiza, Nova no se filtra, DTOs introspectados). ⚠️ Caveat dev: `deleteOutDir:false` → un `nest start` sobre dist stale no re-aplica el plugin; build limpio sí | 3 | B1-B3 | ✅ **hecho** (2026-06-11) |
| **B7 — QA + piloto** | **Suite automatizada 11/11 verde** (`booking-api-key.service.spec` 5 + `public-reservations.service.spec` 6): genera/verifica API key (bcrypt, revoke scoped), **aislamiento multi-tenant** (roomTypeId de otro hotel → 404), hotel-por-slug, capacidad 400, no-disponible 409, idempotencia replay/conflict, slug apagado 404. + validación e2e navegador (hosted page completa + panel + Swagger). Security: throttler per-IP + bcrypt keys + CORS allowedOrigins + HMAC webhooks + idempotencia + tenant isolation + IDOR check Nova. ⚠️ **Ops/piloto (no-código):** load test 500 concurrent + test en 3 sitios reales | 5 | todo | ✅ **código hecho** (2026-06-11) · ops pendiente |

**Total Fase 1-B:** ~32-42 días-dev = ~6-8 semanas calendar (1 dev secuencial). Sin bloqueo PAY-CORE.

### Capa de prepago (post-PAY-CORE, v1.1.1+) — se enchufa, no se reescribe

| Etapa | Alcance | Depende |
|-------|---------|---------|
| **P1 — PaymentProvider en checkout** | Habilitar `FULL_PREPAY/DEPOSIT_*` en el step de pago del Hosted UI · Stripe Elements + Mercado Pago SDK + OXXO voucher (diferencial LATAM) | PAY-CORE v1.0.1 |
| **P2 — Stripe Connect split + CommissionLog** | Marketplace Tier 2 (§6): split guest→hotel 97% / Zenix 3% · `CommissionLog` model · attribution matrix por UTM | P1 + COMMISSION-MODEL |

### Qué desbloquea cada etapa (valor incremental)

- **Tras B2:** un hotel ya recibe reservas directas vía API (pago en recepción) → mide `source='DIRECT_WEB'` en reports → ahorro de comisión OTA empieza.
- **Tras B5:** cualquier hotel pega `<a href="book.zenix.com/{slug}">Reservar</a>` en su sitio → **producto vendible end-to-end sin una línea de Stripe**.
- **Tras P1:** el huésped prepaga online → reduce no-shows + captura el segmento que exige pago al reservar.

### Riesgo específico de B (pago en recepción) + mitigación

| Riesgo | Mitigación |
|--------|-----------|
| No-show sin garantía de tarjeta (no hay prepago) | `cancellationPolicy` engine (Fase C GROUP-BILLING, **ya en main**) aplica retención documentada + `hold TTL` auto-libera inventario si la reserva no se confirma · el night audit ya marca no-shows (§13) |
| Hotel espera prepago y B no lo da | Copy explícito en wizard + hosted UI: "Fase 1 captura la reserva; el cobro online llega con PAY-CORE". El `paymentPolicy` deshabilitado comunica el roadmap sin prometer de más (§4 honestidad técnica) |

### Bug hunt pre-merge (2026-06-11) — hallazgos y fixes

Auditoría doble (seguridad + correctitud) antes del merge. Corregido + verificado (13/13 tests + e2e):

| # | Hallazgo | Severidad | Fix |
|---|----------|-----------|-----|
| 1 | Race de overbooking — availability check fuera de tx, sin lock | 🔴 Crítico | `pg_advisory_xact_lock('booking:'+propertyId)` + re-check DENTRO de `$transaction` (patrón `guest-stays.create` BUG #9) |
| 2 | Idempotencia no-atómica (record post-commit best-effort) → dup bajo concurrencia | 🟠 Alto | record insertado dentro de la tx bajo lock; P2002 → 409 |
| 3 | CORS prod bloquea `/api/v1/public/*` cross-origin → motor inservible para websites externos | 🔴 Crítico | middleware CORS abierto para el prefijo público (READ público + WRITE con X-API-Key, sin cookies) |
| 4 | Webhook dead-letter emitía SSE `booking:created` fantasma | 🟠 Alto | removido; estado DEAD_LETTER + failureCount persistidos |
| 5 | SSRF vía URL de webhook (169.254/localhost/RFC1918) | 🟡 Medio | `assertSafeWebhookUrl` rechaza hosts internos |
| 6 | `from`/`to` del calendar aceptaban basura silenciosa | 🟡 Medio | validación → 400 |
| 7 | Total de reserva rotulaba moneda inconsistente | 🟡 Medio | `currency` del response = tarifa real |
| 8 | System staff password determinista | 🟢 Bajo | `randomBytes(32)` |

**Diferidos (documentados, no bloquean piloto single-instance):**
- Aislamiento test/live keys (comparten DB) — sandbox compartido por diseño Fase 1 (el integration guide ya lo dice).
- `FOR UPDATE SKIP LOCKED` en `WebhookRetryScheduler` — solo relevante multi-instance (el plan ya prevé Redis-backed para multi-pod, §143 pattern).
- `trust proxy` para que el rate-limit per-IP funcione detrás del LB (Render/Vercel) — verificar en deploy.
- Queries de disponibilidad O(rooms×días) — mitigado por cache 30-60s; agregado batcheado si escala.

---

## 6. Modelo de monetización — DUAL TIER

Sprint extiende su scope para incluir monetización del booking engine. Modelo **diferente a Cloudbeds/Mews** (que son 100% SaaS sin comisión), híbrido entre PMS y low-cost OTA marketplace.

### Tier 1 — Zenix Booking Standard (incluido en plan PMS)
- Acceso completo al motor de reservas
- URL hosted `book.zenix.com/{slug}` + widget embebido + API REST
- **Comisión: $0** cuando el guest llega via referral del sitio del hotel
- Atribución técnica: header `Referer` del hotel O UTM `utm_source=hotel_website` O API key directa
- Equivalente operativo a Cloudbeds/Mews commission-free model

### Tier 2 — Zenix Marketplace (opt-in, commission-based)
- Hotel aparece **listado en `book.zenix.com` homepage marketplace**
- Zenix invierte en SEO orgánico + Google Ads + Meta Ads + email newsletter
- Featured spots opcionales (sponsored) para premium positioning
- Cross-promotion en cadenas (Brand → ver otras properties)
- **Comisión: 3-5%** del booking value cuando el lead provino de Zenix
- Atribución: UTM `utm_source=zenix_marketplace` + cookie 30d para multi-touch attribution
- **Posicionamiento:** 8x más barato que Booking.com (25%) vs 3% Zenix

### Hotel opt-in/opt-out por property

`PropertySettings.marketplaceListingEnabled: Boolean @default(false)` — cada property decide individualmente.

### Modelo financiero del hotel comparativo

Hotel 30 cuartos, $300k USD revenue/año, mix actual 60% OTAs (25% comisión):

| Escenario | Comisiones pagadas/año | Saving |
|-----------|------------------------|--------|
| Hoy (60% OTAs) | $45,000 | — |
| Migra 30% del volumen a Zenix Marketplace (3%) | $32,250 | **$12,750/año** |
| Migra 50% del volumen a Zenix Marketplace | $24,000 | **$21,000/año** |

### Attribution matrix — cuándo se cobra commission

| Origen del booking | Atribución técnica | Comisión Zenix |
|-------------------|-------------------|----------------|
| Click directo desde sitio del hotel | `utm_source=hotel_website` o referrer matches | $0 |
| Widget embebido en sitio hotel | `utm_source=hotel_widget` | $0 |
| Direct API call con hotel API key | sin UTM, API key origin | $0 |
| Click en book.zenix.com homepage | `utm_source=zenix_marketplace` | 3% |
| Click en email Zenix newsletter | `utm_source=zenix_email` | 3% |
| Click en Google Ads de Zenix | `utm_source=zenix_gads` | 5% (premium acquisition) |
| Click en Meta Ads de Zenix | `utm_source=zenix_meta` | 5% |

El sistema guarda `referralSource` en `GuestStay` al momento de crear la reservación. Al cierre del mes, `CommissionLog` calcula total comisionable per property → Zenix factura al hotel.

### Implementación técnica — Stripe Connect

Stripe **Connect** (no Stripe estándar) permite **split payments nativos**. Guest paga $1,580 USD → Stripe automáticamente:
- $1,533 deposita al hotel (97%)
- $47 deposita a Zenix (3% commission)

Cero reconciliación manual. Mismo pattern que usan Uber, Airbnb, Shopify Payments.

Cuando attribution es Tier 1 ($0 commission) → Stripe deposita 100% al hotel.

Ver detalle completo en [`COMMISSION-MODEL-plan.md`](COMMISSION-MODEL-plan.md).

### Schema additions

```prisma
model CommissionLog {
  id              String   @id @default(uuid())
  organizationId  String
  propertyId      String
  guestStayId     String
  referralSource  String   // 'zenix_marketplace' | 'zenix_email' | 'zenix_gads' | etc.
  bookingAmount   Decimal  @db.Decimal(10, 2)
  commissionRate  Decimal  @db.Decimal(5, 4)  // 0.0300 = 3%
  commissionAmount Decimal @db.Decimal(10, 2)
  currency        String
  stripeTransferId String? // ID del transfer en Stripe Connect
  status          CommissionStatus @default(PENDING) // PENDING | CHARGED | REFUNDED | DISPUTED
  createdAt       DateTime @default(now())
  chargedAt       DateTime?

  guestStay       GuestStay @relation(...)
  property        Property  @relation(...)
}

// Y en GuestStay:
referralSource    String?  // capturado al crear via booking engine
```

### Posicionamiento comercial (one-liner para sales)

> En Cloudbeds pagas $400 USD/mes y tú haces todo el marketing. En Booking.com no pagas SaaS pero pierdes 25% de cada venta. Con Zenix pagas el SaaS más bajo del mercado, y solo cuando QUIERES, te listas en nuestro marketplace por 3% — **8x menos que Booking**. Sin lock-in. Sin sorpresas.

---

## 7. Riesgos + mitigaciones

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

## 8. Decisiones pendientes antes de iniciar

| # | Decisión | Quién decide | Estado |
|---|----------|--------------|--------|
| 1 | **Naming comercial:** "Zenix Direct" / "Zenix Connect" / "Zenix Booking" | Producto | ✅ **"Zenix Booking"** (2026-06-11) |
| 2 | **Pricing del feature** — incluido en PMS o addon | Negocio | ⏳ Tier 1 incluido en plan PMS ($0 comisión); Tier 2 Marketplace opt-in 3-5% (§6). Confirmar al cerrar Fase 1. |
| 3 | **Dependencia CHANNEX-INBOUND** — ¿cerrar antes? | Técnica | ✅ **Resuelto** — CHANNEX-INBOUND + CANCEL-FIX ya en main (PR #75). No bloquea. |
| — | **Secuencia A/B** (PAY-CORE antes vs booking engine primero) | Owner | ✅ **Opción B** (2026-06-11) — Fase 1 PAY_AT_HOTEL-only, prepago se enchufa post-PAY-CORE. Ver §5-B. |
| 4 | **Subdomain DNS** — `book.zenix.com` vs `{slug}.book.zenix.com` (white-label) | Producto | ⏳ Recomendación: `book.zenix.com/{slug}` ahora + wildcard `*.book.zenix.com` reservado para white-label futuro. Decidir en B5. |
| 5 | **SSR vs SPA puro** para Hosted UI | Técnica | ⏳ Recomendación: Vite SSR mínimo en B5; NextJS solo si SEO lo exige. |
| 6 | **Sandbox** — ¿any developer o solo customers pagados? | Negocio | ⏳ Decidir en B6. |
| 7 | **Open source el widget** (Fase 2) | Estratégica | ⏳ Diferido a Fase 2. |

---

## 9. Métricas de éxito post-launch

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

## 10. Cómo se ve el end-state

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
