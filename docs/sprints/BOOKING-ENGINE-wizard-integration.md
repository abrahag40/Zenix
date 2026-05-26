# Booking Engine + Wizard Zenix Activate — Integration Plan

> **Origen**: pregunta owner 2026-05-24 — "¿la interfaz de reserva del huésped se puede pre-configurar en el wizard del consultor para que el cliente no necesite developer?"
>
> **Respuesta corta**: sí, exactamente eso es el plan. Tu idea aterriza al **80% del mercado** (Cloudbeds/Mews pattern) y va más lejos en un aspecto: **integración profunda con el wizard del consultor** — algo que ningún competidor hace bien.
>
> Este doc complementa [BOOKING-ENGINE-plan.md](BOOKING-ENGINE-plan.md) detallando el ángulo wizard-driven que el plan original no cubría a profundidad.

---

## 1. Tu idea aterrizada

### Lo que propones

```
Consultor en Wizard Zenix Activate
  ├── Step 4 — Properties
  ├── Step 5 — Inventory (rooms + roomTypes)
  ├── Step 5.5 — Booking Engine config (NUEVO, lo que tú propones)
  │     ├── Branding: logo del hotel, colores primario/secundario
  │     ├── Currency display + tax disclosure (INCLUSIVE/EXCLUSIVE)
  │     ├── Texto bienvenida + términos
  │     ├── Cancellation policy
  │     ├── Photos por room type (subir o link)
  │     └── Slug del hotel: book.zenix.com/<slug>
  ├── Step 7 — Integrations (Channex, Stripe, PAC)
  └── Step 8 — Activación

Al activar (Step 8):
  ✅ book.zenix.com/<slug> queda LIVE automáticamente
  ✅ Con todas las rooms + tipos + tarifas + branding
  ✅ Sin que el cliente toque una línea de código
  ✅ El developer del website del cliente solo necesita:
      - Botón "Reservar ahora" → href="https://book.zenix.com/<slug>"
      - O widget embebido (Fase 2) → <script src="..."></script>
      - O API call si tiene su propio frontend custom

Guest experience:
  1. Visita www.hotel-cliente.com (su website actual)
  2. Click "Reservar" → redirect o popup a book.zenix.com/<slug>
  3. Selecciona fechas + rooms + paga (Stripe + OXXO + MercadoPago)
  4. Reservación aparece en el TimelineScheduler del PMS al instante
```

### Por qué tu idea está bien

1. **Reduce el time-to-value del cliente** — sale del wizard con BE listo, no espera 2 semanas de desarrollo web custom.
2. **Reduce el costo de adopción** — el website del cliente puede ser un Wix/Squarespace básico hecho por un sobrino. No necesita dev senior.
3. **Captura el 80% del mercado boutique** — esos hoteles NO tienen developer interno, NO van a configurar Cloudbeds desde cero.
4. **Es exactamente el pattern Cloudbeds + Mews** validado por 50,000+ hoteles globalmente.
5. **Es scope coherente con la propuesta de valor Zenix**: "tu consultor te activa, tú operas".

### Lo único que matizo

**No es "el consultor configura una interfaz pre-construida sin que nadie de dev intervenga"** en sentido literal. Es:

- **Zenix ya tiene construida la interfaz** (`book.zenix.com/<slug>`) — esa es la pieza que el dev de Zenix desarrolla 1 vez y replica a infinitos hoteles.
- **El consultor configura SOLO datos** del cliente: branding, copy, tarifas, fotos.
- **El dev del website del hotel solo agrega 1 botón** que linkea a la URL pre-configurada.

Eso significa: la interfaz NO es "independiente" en el sentido que el consultor la diseñe — es **white-label** (parametrizable). Distinción importante porque define el alcance del wizard.

---

## 2. Cómo lo hacen los otros PMS — estudio comparativo profundo

| PMS | Hosted UI | Embed widget | API pública | Configuración del cliente | Wizard-driven setup |
|---|---|---|---|---|---|
| **Cloudbeds** | ✅ `hotels.cloudbeds.com/reservation/{id}` (white-label) | ✅ Web Component (V3, deprecado iframe) | ✅ REST + GraphQL para developers Premium | Dashboard del cliente — 6-12 horas setup self-service | ❌ NO hay wizard guiado. Self-service trial — cliente se pierde. |
| **Mews** | ✅ Distributor hosted | ✅ Distributor widget (iframe legacy + JS custom) | ✅ Connector API (developers) | Backoffice del cliente, ~4-8 horas | ❌ NO hay wizard. Requiere onboarding manual de Mews team. |
| **Little Hotelier** | ✅ Hosted page (subdomain) | ✅ Widget embed básico | ⚠️ API limitada | Wizard 5-step orientado a small hotels | ✅ Tiene wizard pero NO incluye BE config — eso queda separado |
| **RoomRaccoon** | ✅ Hosted | ✅ Widget | ⚠️ API solo para enterprise | Dashboard self-service | ❌ No wizard formal |
| **SiteMinder** | ⚠️ Hosted via "Little Hotelier" sister product | ✅ Widget | ✅ Channel Manager API | Dashboard | ❌ No wizard — onboarding por sales team |
| **Hotelogix** | ✅ Hosted simple | ⚠️ iframe legacy | ⚠️ Limitada | Settings panel | ❌ No wizard |
| **WebHotelier (Greek)** | ✅ Hosted muy custom | ✅ Widget potente | ✅ API | Dashboard self-service | ❌ No wizard |
| **Opera Cloud** | ❌ Requiere Sabre SynXis o partner ($$$) | ❌ Custom build | ✅ OPERA Web Services | Onboarding por consultor Oracle ($15-30k) | ⚠️ "Configuration Manager" pero no para PMS-novatos |
| **Booking.com / Expedia DIRECT** | N/A — son OTAs | N/A | API para grandes cadenas | Onboarding equipo OTA (~30 días) | N/A |

### Lo que NADIE hace bien (gap de mercado para Zenix)

| Gap | Tu plan lo resuelve? |
|---|---|
| Wizard end-to-end (Step 1 cliente → Step 8 BE live en 1 sesión consultor) | ✅ SÍ — esto es exactamente tu idea |
| Pre-poblar copy + photos + branding del BE desde el setup del PMS | ✅ SÍ |
| LATAM payments nativos (OXXO/SPEI/MercadoPago) en el BE | ✅ SÍ — BOOKING-ENGINE-plan §3.4 |
| Consultor partner-led (no self-service ni sales-led) | ✅ SÍ — Nova architecture §168 D-NOVA-10 |
| 1 sola sesión consultor + cliente, BE live al final | ✅ SÍ — paridad o superior a Mews onboarding (~días/semanas) |

**Esto es diferenciador comercial real.** El pitch al hotel boutique:

> *"En Cloudbeds te dan acceso al dashboard y tú averiguas. En Mews te asignan un onboarding manager que tarda 4 semanas. Con Zenix tu consultor configura todo en 1 día — incluido tu booking engine listo para conectar a tu website. Al final del día tienes URL pública lista para recibir reservas direct."*

---

## 3. Pieza específica: Wizard Step 5.5 — Booking Engine config

Esto es lo que TU propuesta agrega y el [BOOKING-ENGINE-plan.md](BOOKING-ENGINE-plan.md) original NO detalla suficiente:

### Field-level breakdown

```typescript
// Modelo Prisma propuesto (extiende PropertySettings)
model BookingEngineConfig {
  id                   String   @id @default(uuid())
  propertyId           String   @unique
  // ── Slug & domain ───────────────────────────────────
  slug                 String   @unique // book.zenix.com/<slug>
  customDomainEnabled  Boolean  @default(false)  // book.hotel.com via CNAME
  customDomain         String?
  customDomainVerified Boolean  @default(false)
  // ── Branding (consultor llena en wizard) ────────────
  logoUrl              String?  // R2 hosted, 200x60px optimal
  primaryColor         String   @default("#0e9264")  // hex, hotel brand
  accentColor          String   @default("#0c7e5a")
  fontFamily           String   @default("Inter")  // 'Inter' | 'Playfair' | 'Cormorant' | etc.
  // ── Copy (i18n por idioma, default es-MX) ───────────
  heroTitle            Json?    // { es: "...", en: "..." }
  heroSubtitle         Json?
  welcomeMessage       Json?
  // ── Policies (consultor configura, guest las ve) ────
  cancellationPolicy   Json?    // versionable, NOM-151 v1.1.x SIGN-DLC
  termsAndConditions   Json?
  childrenPolicy       String?  // free <12, 50% rate <18, etc.
  // ── Display rules ───────────────────────────────────
  showPropertyAddress  Boolean  @default(true)
  showPropertyPhotos   Boolean  @default(true)
  showMap              Boolean  @default(true)
  showReviews          Boolean  @default(false) // v1.1.x con TripAdvisor integration
  // ── Behavior ────────────────────────────────────────
  minLeadTime          Int      @default(0)     // horas mínimas de anticipación
  maxAdvanceBooking    Int      @default(365)   // días máximo de adelanto
  defaultGuestCount    Int      @default(2)
  // ── Tax display (§82 D-CHX-CC PAY-CORE) ─────────────
  // No vive aquí — toma de PropertySettings.taxStrategy. Acá solo
  // disclosure copy override por hotel si quiere customizar.
  taxDisclosureOverride Json?
  // ── Payment policy ──────────────────────────────────
  paymentMode          BookingPaymentMode @default(DEPOSIT_30_PCT)
  // FULL_PREPAY | DEPOSIT_30_PCT | DEPOSIT_50_PCT | PAY_AT_HOTEL | OXXO_VOUCHER_24H
  // ── Active toggle ───────────────────────────────────
  isActive             Boolean  @default(false)
  activatedAt          DateTime?

  property             Property @relation(fields: [propertyId], references: [id])
  // Photos linkadas (multiple por property)
  photos               BookingEnginePhoto[]
  // Photos linkadas per room type
  roomTypePhotos       RoomTypePhoto[]

  @@map("booking_engine_configs")
}

model BookingEnginePhoto {
  id         String   @id @default(uuid())
  configId   String
  url        String   // R2 hosted
  caption    Json?    // { es: "...", en: "..." }
  sortOrder  Int      @default(0)
  config     BookingEngineConfig @relation(fields: [configId], references: [id], onDelete: Cascade)
  @@index([configId, sortOrder])
}

model RoomTypePhoto {
  id           String   @id @default(uuid())
  configId     String
  roomTypeId   String   // Zenix RoomType o Channex roomTypeId? — decidir en kickoff
  url          String
  caption      Json?
  sortOrder    Int      @default(0)
  config       BookingEngineConfig @relation(fields: [configId], references: [id], onDelete: Cascade)
  @@index([configId, roomTypeId, sortOrder])
}
```

### Wizard UX flow (Step 5.5)

```
┌─ Step 5.5 — Booking Engine ───────────────────────────────────┐
│                                                                 │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░  Step 5 of 8                    │
│                                                                 │
│  ┌─ Sub-paso 5.5.1 — Slug & domain ──────────────────────────┐│
│  │  URL pública:  book.zenix.com/[hotel-tulum-boutique]      ││
│  │  ¿Tienes dominio propio? ☐ Conectar book.hotelXX.com (CNAME)││
│  └───────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─ Sub-paso 5.5.2 — Branding ──────────────────────────────┐│
│  │  Logo:           [Upload .png/.svg] (200x60px)            ││
│  │  Color primario: ████ #0e9264  [picker]                   ││
│  │  Color acento:   ████ #0c7e5a  [picker]                   ││
│  │  Fuente:         ▼ Inter (legible, moderna)               ││
│  │                                                            ││
│  │  Preview live →  [iframe with current settings]           ││
│  └───────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─ Sub-paso 5.5.3 — Texto & policies ──────────────────────┐│
│  │  Hero title (es):  "Reserva directo y ahorra hasta 25%"    ││
│  │  Hero subtitle:    "..."                                   ││
│  │  Política cancelación: [textarea con template]             ││
│  │  T&C: [link → ToC versionado SIGN-DLC v1.1.x]              ││
│  └───────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─ Sub-paso 5.5.4 — Photos ────────────────────────────────┐│
│  │  Hotel general (max 8):  [drag-and-drop uploader]         ││
│  │  Por room type:                                            ││
│  │    Suite con vista:  [+ Add 3 photos]                     ││
│  │    Standard doble:   [+ Add 3 photos]                     ││
│  │  Tip: ZaharDev puede contratar fotógrafo profesional ($)  ││
│  └───────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─ Sub-paso 5.5.5 — Payment policy ────────────────────────┐│
│  │  Modo de pago:                                             ││
│  │    ○ Pago completo (FULL_PREPAY)                           ││
│  │    ● Depósito 30% (default boutique LATAM)                 ││
│  │    ○ Depósito 50%                                          ││
│  │    ○ Pago en hotel (PAY_AT_HOTEL)                          ││
│  │  ☑ Aceptar OXXO voucher 24h                                ││
│  │  ☑ Aceptar SPEI                                            ││
│  │  ☑ Aceptar MercadoPago                                     ││
│  └───────────────────────────────────────────────────────────┘│
│                                                                 │
│  [← Atrás]                              [Pre-visualizar →]    │
│                                          [Guardar y continuar] │
└────────────────────────────────────────────────────────────────┘
```

---

## 4. Architecture decision — embedded vs hosted

Tu pregunta directa: ¿la interfaz **embedded en el sitio del cliente** o **hosted en book.zenix.com**?

### Decisión recomendada: HOSTED como default, EMBED como Phase 2 opcional

| Razón | Detalle |
|---|---|
| **Onboarding más rápido** | Hosted = "copia este URL en tu botón". Embed = "el dev del hotel agrega script + configurar dominio + DNS". Hosted = 5 minutos. Embed = 2-3 días con dev. |
| **Cumplimiento PCI** | Stripe Checkout en dominio Zenix = SAQ A (más simple). Stripe Elements embedded en dominio cliente = SAQ A-EP (requiere TLS audit cliente). |
| **i18n + brand consistency** | Hosted: Zenix garantiza UX/UI consistente. Embed: el website del cliente puede romper el widget con su CSS global. |
| **Conversion impact** | Embedded tiene +37% conversion vs redirect (benchmark Triptease). PERO requiere setup técnico que el cliente boutique no tiene. |
| **Defense-in-depth de seguridad** | Hosted = Zenix controla CSP, HSTS, CSRF, rate limit. Embed = los headers del sitio del cliente afectan el widget. |

### Solución: ofrecer AMBOS pero con tiers

```
Tier 1 (MVP, todos los clientes):
  Wizard configura → book.zenix.com/<slug> LIVE
  Cliente solo necesita poner href="https://book.zenix.com/<slug>" en su botón Reservar
  → 100% setup desde el wizard, 0 dev work

Tier 2 (Phase 2, clientes con dev disponible):
  Misma config del wizard sirve como source de configuración
  Cliente agrega <script src="https://embed.zenix.com/<slug>.js"></script>
  Widget aparece embebido en su website
  → +37% conversion para hoteles que tienen dev senior

Tier 3 (Enterprise/cadenas, Phase 3):
  API REST pública con API key
  Cliente construye su propio frontend custom
  → 100% control, requiere dev full-time
```

Tu intuición (hosted + el dev del cliente solo manda datos vía API) es **una mezcla de Tier 1 y Tier 3**. La mayoría de boutique va con Tier 1 puro. Tier 3 se queda para cadenas multi-property que quieren UX unificada propia.

---

## 5. ¿Cabe en este sprint (NOVA-CHANNEX-COMMAND-CENTER)? — NO

**Sprint actual = 20 días-dev, ya 10 días consumidos.** Booking Engine es un sprint de **5-6 semanas** según [BOOKING-ENGINE-plan.md §5 Fase 1](BOOKING-ENGINE-plan.md). Incluirlo dobla el scope del sprint actual.

**Recomendación:** Booking Engine es **el sprint inmediatamente después** del NOVA-CHANNEX-COMMAND-CENTER (Days 11-20 cubren rest del Channex Command). Posicionamiento en roadmap:

```
HOY                                       PILOTO v1.0.0          GA v1.0.0
 │                                              │                      │
 ▼                                              ▼                      ▼
─────────────────────────────────────────────────────────────────────────────
[NOVA-CHANNEX-CC]      [OPS-α]    [QA-α]         [BOOKING-ENGINE Fase 1]
  Days 1-20            10 days    6-8 days       5-6 weeks (25-30 days)
  (in progress)        Sentry+    Playwright     Hosted UI + API + Wizard
                       smoke      E2E            Step 5.5
```

**Booking Engine v1.0.0** entrega **Hosted UI tier 1**. Embed widget + API key tier para v1.1.x DLC.

---

## 6. Cambios al BOOKING-ENGINE-plan.md original

El plan original (566 líneas) cubre bien la arquitectura API + hosted UI + monetization. **Necesita agregar:**

1. **Sub-sección "4.5 Wizard Step 5.5"** con el field-level breakdown del schema `BookingEngineConfig` + UX flow descrito arriba.
2. **Update Sprint 1C** ("Settings UI + Onboarding") para que NO sea settings post-onboarding sino **Step 5.5 del Wizard Zenix Activate** (más estratégico, no requiere cliente self-service).
3. **Update §3 estudio mercado** con la tabla comparativa de "Wizard-driven setup" que está en este doc — refuerza el diferenciador.
4. **Dependencia Wizard**: Booking Engine sprint requiere que Wizard Step 5.5 lo precede o se haga en paralelo. Pre-requisito: schema `BookingEngineConfig` + Wizard step UI antes que la API pública.

Actualizo el plan principal al cerrar el current sprint si das luz verde.

---

## 7. Decisión que necesito de ti

**Confirmas el approach:**

1. ✅ Booking Engine = HOSTED UI tier 1 (default) + embed widget tier 2 (post v1.0.0) + API tier 3 (enterprise)
2. ✅ Configuración del cliente = Wizard Step 5.5 (no self-service dashboard separado)
3. ✅ Roadmap: post-NOVA-CHANNEX-CC + OPS-α + QA-α → BOOKING-ENGINE Fase 1 antes de GA v1.0.0
4. ✅ Diferenciador comercial registrado: wizard-end-to-end vs Cloudbeds/Mews self-service o sales-led

Si OK, lo agrego a CLAUDE.md como decisión §-numerada y actualizo BOOKING-ENGINE-plan.md con el wizard angle. Sin cambios al sprint actual NOVA-CHANNEX-CC.

---

## 8. Tu idea sí se entendió — recap final

**Tu idea**: Consultor configura wizard → BE pre-construido + customizado para el cliente → developer del website solo conecta vía URL/API → guest reserva → reservación llega al PMS.

**Mi traducción técnica**: Tier 1 Hosted UI (`book.zenix.com/<slug>`) **configurado por el wizard** del consultor en Step 5.5, con todos los datos del cliente (branding, copy, photos, policies, payment mode). El dev del website del hotel solo agrega un link/botón. No requiere construir UI custom. **Esto es exactamente lo que Cloudbeds y Mews ofrecen, PERO con el diferenciador de que está integrado al wizard partner-led del consultor — no auto-servicio.**

**Status del plan**: ya existe ([BOOKING-ENGINE-plan.md](BOOKING-ENGINE-plan.md), 566 líneas), tu pregunta agrega el ángulo Wizard Step 5.5 que documento en este doc. Sprint estimado 5-6 semanas, NO cabe en NOVA-CHANNEX-CC actual, se hace después de OPS-α + QA-α y antes de GA v1.0.0.
