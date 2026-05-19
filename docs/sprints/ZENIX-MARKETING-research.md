# Zenix Marketing — Estudio profesional y arquitectura propuesta

> **Tipo:** Research + plan estratégico (no implementación)
> **Fecha:** 2026-05-18
> **Pregunta original:** ¿Es posible conectar Zenix con Google Ads, Meta, Mailchimp, y centralizar mensajería de OTAs estilo "Channex pero para marketing/conversación"?
> **Conclusión preview:** **Sí en todo. Pero la estrategia ganadora NO es replicar el mercado saturado de unified inbox + AI chatbot — es ser el ORQUESTADOR de un ecosistema de integraciones con valor diferencial LATAM.**

---

## 1. Resumen ejecutivo

El mercado de marketing tech para hoteles está fragmentado en **5 categorías** que tu intuición captó:

| Categoría | Players líderes | Pattern |
|-----------|----------------|---------|
| **Ad management** (Google + Meta) | Google Hotel Ads API + Meta Marketing API | APIs abiertas, requiere developer access |
| **Email campaigns** | Mailchimp, Klaviyo, Revinate, GuestRevu, Cendyn | APIs standard + algunos hospitality-specific |
| **Transactional messaging** | SendGrid, Postmark, Resend, Twilio (SMS/WhatsApp) | APIs muy maduras |
| **Unified guest inbox** (AI chatbot multi-channel) | HiJiffy, Akia, Duve, Conduit, Aeve AI, Visito | **Mercado saturado, AI playground hot** |
| **Direct booking optimization** | Triptease, Hotelchamp, Lighthouse | Specialized layer, no replicable solo |

**La pregunta estratégica para Zenix NO es "construir un Mailchimp interno"** — es decidir qué **construir nativamente** vs **integrar via marketplace plugin** vs **white-label/partner**.

### Mi recomendación de alto nivel (justificada en sección 5)

| Capa | Estrategia | Justificación |
|------|-----------|---------------|
| **Capa 1 — Nativo Zenix (incluido)** | Email transaccional + WhatsApp pre-arrival warming + UTM tracking + promo codes | Diferencial LATAM + lock-in operativo |
| **Capa 2 — Integraciones (marketplace)** | Mailchimp, Klaviyo, Google Ads, Meta Ads, HiJiffy, Revinate como plugins | Customer self-service, sin reinventar la rueda |
| **Capa 3 — Zenix Marketing Pro (DLC premium)** | Auto-campaigns driven por occupancy + competitor rates + ROI attribution | Diferencial verdadero, monetización adicional |

---

## 2. ¿Qué se puede hacer técnicamente? — APIs por plataforma

### 2.1 Google Ads + Google Hotel Ads

**¿Es posible conectarse?** Sí, pero con fricción.

**Lo que se puede hacer programáticamente:**
- Crear/actualizar campaigns, ad groups, listing groups
- Manejar budgets + bids automatizados
- Performance reporting + analytics
- Optimization rules dinámicos (subir bid si ocupación <50%)

**Lo que NO se puede vía API:**
- Crear hotel feeds + pricing data → debe ir vía **Hotel Center** (UI manual o partner)
- Esto es como Channex — Google requiere "Hotel Center" como intermediario para rates/availability

**Requisitos para usar la API:**
1. Cuenta Google Ads MCC (Manager) para Zenix
2. **Developer Token** (Google approval process, weeks)
3. **Hotel Center access** (allowlisted only — contact Google Hotel partnerships team)
4. OAuth 2.0 cada hotel customer autoriza acceso a su cuenta
5. Account ID linking + feed setup manual primero

**Patrón industria:** PMS conecta como **third-party integration partner** de Google Hotel Ads. Cloudbeds, Mews tienen esto. Zenix puede aplicar para ser partner — proceso ~3-6 meses con Google.

**Alternativa para arrancar sin partnership formal:**
- Zenix push del *property feed* a Google Hotel Center via API (Hotel Center API)
- Hotel customer maneja sus campañas en Google Ads UI (no Zenix UI)
- Zenix recibe data de performance via Google Ads API (read-only)
- Esto es el patrón que **Cloudbeds tier base** ofrece — feed + read-only reporting

### 2.2 Meta (Facebook + Instagram) Marketing API

**¿Es posible?** Sí, más abierto que Google.

**Lo que se puede hacer:**
- Crear campaigns + ad sets + ads programáticamente (3-tier hierarchy)
- Hotel Ads format específico (Meta Hotel Ads — dynamic ads con catalog)
- Audience targeting (lookalikes, custom audiences)
- Conversion tracking + Pixel + Conversion API integration
- A/B testing automated
- Lead generation campaigns

**Hot novedad 2026:**
- **29 abril 2026:** Meta abrió el ecosystem a **third-party AI assistants** (Meta Ads AI Connectors open beta)
- **Q1 2026:** legacy Advantage Shopping deprecated, migrate to **Advantage+** (auto-optimization)

**Requisitos:**
1. Meta Developer App (gratis crear)
2. **Marketing API access level** (Standard → Advanced via review process)
3. **Business Verification** del hotel customer (puede tomar semanas)
4. OAuth 2.0 per customer
5. Meta Business Manager linked

**Más fácil que Google Hotel Ads** — Meta lleva años con API abierta. Zenix puede arrancar Meta integration antes que Google.

### 2.3 Email — Mailchimp + alternativas

**Mailchimp:**
- API REST estable, well-documented
- OAuth 2.0 + API keys
- Sync de contactos GuestStay → audiences
- Trigger campaigns desde Zenix events
- Reports back to Zenix
- **Costo:** Mailchimp cobra por contacts (~$13-300/mes según volumen)

**Klaviyo:**
- Más caro pero superior para e-commerce/hotel
- Mejor analytics + segmentation
- Predictive AI nativo

**Revinate:**
- Hospitality-specific CRM + email
- Caro ($400+ USD/mes)
- Built-in para hotel campaigns típicas (post-stay review, win-back)

**SendGrid / Postmark / Resend:**
- Para email TRANSACCIONAL (confirmaciones, pre-arrival)
- Costo bajo (~$15-50/mes hasta 50k emails)
- API muy simple

**Recomendación Zenix:**
- **Transaccional (nativo):** Resend (más barato + dev-friendly) o SendGrid
- **Campaigns (integración):** Mailchimp + Klaviyo como plugins marketplace (customer decide cuál usar)

### 2.4 Unified inbox + AI chatbot — mercado SATURADO

**Players activos 2026:**

| Player | Diferencial | Cobertura canales | Pricing |
|--------|-------------|------------------|---------|
| **HiJiffy** | AI 85% automation, 2,500+ hotels 60 países | Website chat, Messenger, Instagram, WhatsApp, Telegram, SMS, email | $$$ Enterprise |
| **Akia** | Workflow automation strong, timeline unificado per guest | SMS, Airbnb, Booking.com, email | $$$ Mid-market |
| **Duve** | Pre-arrival check-in + post-stay | App + WhatsApp + email | $$ |
| **Conduit** | Voice + SMS + WhatsApp + everything + AI | All-in + voice calls | $$$$ |
| **Visito** | WhatsApp-first | WhatsApp primary | $$ |
| **Aeve AI** | Premium brand positioning | All channels | $$$$ |
| **Canary** | Comprehensive guest mgmt | Multi-channel | $$$ |

**Channels que importan en hotelería:**
- Booking.com Messages (vía Channex inbound)
- Airbnb Messages (vía Channex o direct)
- WhatsApp Business API (Twilio o Meta direct)
- Email (Resend/SendGrid)
- SMS (Twilio)
- Instagram DM + Messenger (Meta Graph API)
- Website chat (custom widget)
- Voice calls (Twilio Voice, opcional)

**Realidad para Zenix:**
Construir **otro unified inbox** = entrar a mercado donde HiJiffy ya tiene 2,500 hotels. **Mala apuesta** — barrera de entrada AI + investment marketing brutal.

**Mejor estrategia:** Integrar 1-2 players como **plugins marketplace** (HiJiffy o Akia) y dejar que el customer elija. Zenix se queda con el control de datos del guest (de dónde viene, qué prefiere, etc) y Akia/HiJiffy resuelve el AI conversacional.

### 2.5 Channex como referencia (modelo análogo)

Tu pregunta: *"así como Channex es el medio de comunicación entre todas las OTA"* — exacto patrón aplicable a marketing:

| Channex (lo que ya tenemos) | Marketing equivalent |
|------------------------------|---------------------|
| Connector universal a OTAs | **Akia o HiJiffy** = connector universal a messaging channels |
| Push inventario + pull bookings | Push catalog + pull leads/inquiries |
| 50+ OTAs en un solo plug | 10+ channels en un solo plug |
| Channex paga, Zenix integra | Zenix integra como plug-in marketplace |

**Resultado:** Zenix NO compite con Channex en OTAs, ni con HiJiffy en messaging — **se integra con ambos** y se queda con el valor de **orquestación + datos del guest**.

---

## 3. ¿Cómo lo hacen los competidores hoy?

### Cloudbeds — Pro Marketplace pattern

Cloudbeds NO construye marketing tools nativos. Tienen un **marketplace de 300+ apps**:
- Mailchimp, Klaviyo (email)
- HiJiffy, Duve (guest messaging)
- Revinate (CRM)
- Triptease, Hotelchamp (direct booking opt)
- Google Hotel Ads (vía Hotel Center connector)

Cloudbeds cobra **fee de marketplace** (~10-20% del precio del plugin) y customer paga al plugin directamente. Cero código propio mantener, gran ecosystem.

### Mews — Marketplace similar

Mismo pattern. Mews Marketplace tiene 500+ apps. Es su gran ventaja vs competidores cerrados.

### SiteMinder — partners pero sin marketplace formal

SiteMinder tiene "Demand Plus" (sponsored placement en su distribution) + GuestJoy (CRM owned). Modelo más cerrado, menor flexibilidad.

### Opera Cloud — integraciones enterprise vía API

Oracle te conecta con Salesforce Marketing Cloud + Adobe + lo que sea. Pero **caro y lento** (consultor 3-6 meses por integration).

### Lighthouse (ex OTA Insight)

Es un OVERLAY sobre PMS — no es PMS. Hace revenue management + competitor pricing intelligence. Useful como integration tier 2 plugin.

---

## 4. Arquitectura propuesta — Zenix Marketing en 3 capas

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  CAPA 3 — ZENIX MARKETING PRO (DLC premium, monetización)            │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  • Auto-campaigns driven por occupancy + competitor pricing  │  │
│  │  • Email sequences pre-built (post-stay review, win-back)    │  │
│  │  • ROI attribution unificada (Zenix + OTAs + direct)         │  │
│  │  • Predictive AI tarifaria (en cuándo cobrar más)            │  │
│  │  • Featured marketplace spots en book.zenix.com              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  CAPA 2 — INTEGRACIONES MARKETPLACE (plug-ins, customer self-serve) │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  EMAIL CAMPAIGNS:  Mailchimp · Klaviyo · Revinate            │  │
│  │  AD MGMT:          Google Hotel Ads · Meta Hotel Ads         │  │
│  │  GUEST MESSAGING:  HiJiffy · Akia · Duve · Visito            │  │
│  │  REVENUE MGMT:     Lighthouse · Triptease · Hotelchamp       │  │
│  │  REVIEW MGMT:      Trustyou · ReviewPro · GuestRevu          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  CAPA 1 — NATIVO ZENIX (incluido en PMS — diferencial)              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  • Email transaccional (confirmation, pre-arrival, post-stay)│  │
│  │  • WhatsApp pre-arrival warming (ya en roadmap §LATAM diff)  │  │
│  │  • UTM tracking automático per booking                       │  │
│  │  • Promo codes engine simple                                 │  │
│  │  • Guest CRM básico (history, preferences, frequency)        │  │
│  │  • Booking confirmation con branding + fotos del hotel       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└────────────────────────────────────────────────────────────────────┘
```

### Capa 1 — Native (incluida en PMS)

**Justificación:** sin estas features básicas el PMS se siente "incompleto" hoy. **Pattern industria:** todo PMS las incluye.

**Email transaccional (Resend integration):**
- Confirmation booking con fotos del hotel + booking ref + cancellation policy
- Pre-arrival 48h antes con tips + check-in time
- Post-stay 24h después: gracias + link review

**WhatsApp pre-arrival warming:**
- Ya está como diferencial LATAM en roadmap
- 20:00 local hora: cron detecta `ARRIVING` sin actualCheckin → envía WA "¿necesitas algo? llegaste OK?"
- Twilio WhatsApp API o WhatsApp Business API direct

**UTM tracking + attribution:**
- Cada booking lleva `referralSource + utmCampaign + utmSource + utmMedium`
- Cookie 30d para multi-touch
- Reports "qué campaña trajo qué bookings"

**Promo codes engine simple:**
- Generar códigos: SUMMER2026, INSTAGRAM10, EMPLOYEE20
- Reglas: % discount o monto fijo, ventana fechas, usos máximos, room types permitidos
- Validation en booking engine + audit log

**Guest CRM básico:**
- Historial bookings del mismo email/phone/document
- Tags simples: "VIP", "Returning", "First time"
- Preferences: floor preference, pillow type, bed configuration

### Capa 2 — Marketplace integrations (plug-ins opcionales)

**Justificación:** customer elige según preferencia/presupuesto. Zenix cobra fee del 10-20% del plugin (modelo Cloudbeds Marketplace).

**Email campaigns (Mailchimp + Klaviyo):**
- OAuth 2.0 connection setup en 5 min
- Auto-sync de contactos: GuestStay → Mailchimp audiences
- Tags automáticos: "checked_in_2024", "boutique_segment", "couple_traveler"
- Trigger campaigns desde events Zenix: "first_stay_completed", "loyalty_threshold_reached"
- Reports back en Zenix dashboard (open rate, CTR, conversion)

**Google Hotel Ads (vía Hotel Center connector):**
- Zenix push del property feed: rates + availability + amenities
- Customer maneja campaigns en Google Ads UI propio
- Zenix lee performance via Google Ads API → dashboard unificado
- Esto requiere **Google Partner certification** (3-6 meses)

**Meta Hotel Ads:**
- Catalog sync (rooms + photos + descriptions + prices)
- Conversion API integration (server-side pixel)
- Campaigns gestionadas en Meta Business Manager
- Performance back to Zenix

**Guest messaging (HiJiffy o Akia primary):**
- 1 sola integración profunda en lugar de muchas mediocres
- Sync de stay events → trigger automation HiJiffy/Akia
- Sync de conversations → Zenix tiene contexto histórico
- Customer paga directo al plugin (~$200-500 USD/mes según size)

**Revenue management (Lighthouse plugin):**
- Competitor pricing intelligence
- Auto-pricing suggestions
- Customer paga Lighthouse, Zenix recibe los rate recommendations + aplica

### Capa 3 — Zenix Marketing Pro (premium DLC)

**Justificación:** diferencial real Zenix. Monetización adicional para customers premium.

**Auto-campaigns driven by occupancy:**
- Cron diario lee `ocupacy% próximos 30 días`
- Si <60% → trigger campaign: "Last-minute deal $X for next week"
- Lanza email + Meta ad + WhatsApp blast a previous guests
- Conoce el rate floor del hotel + competitor rates → ajusta automático

**Email sequences pre-built:**
- "Post-stay review request" (24h, 72h, 7d cascade)
- "Win-back" (a guests que no han vuelto en 12 meses)
- "Birthday discount" (1 semana antes del cumpleaños del guest)
- "Loyalty upgrade" (después de 3 stays)
- Customer activa cada sequence con toggle, no escribe el email

**ROI attribution unificada:**
- Single dashboard: Direct + OTAs + Zenix Marketplace + Email + Ads
- Per-channel breakdown: bookings + revenue + commission paid + ROI
- Multi-touch attribution con cookie 30d
- Compara "Si todo hubiera sido Booking.com (25%), habrías pagado $X"

**Predictive AI tarifaria:**
- ML model entrenado con históricos del hotel + competitor data + eventos locales (conciertos, ferias)
- Recomienda precio óptimo dinámico
- Heuristic v1.1 (sin ML pesado) — keyword en CLAUDE.md roadmap §1.1.1

**Featured marketplace spots:**
- $200-500 USD/mes per property para posición top en `book.zenix.com`
- Sponsored email featured en Zenix newsletter mensual

---

## 5. ¿Por qué esta estrategia tier-based gana? (justificación)

### Tabla comparativa de estrategias

| Estrategia | Pros | Cons | Veredicto |
|-----------|------|------|-----------|
| **BUILD ALL native** (replicar HiJiffy + Mailchimp + Lighthouse) | Control total, lock-in | $$$M en desarrollo + AI/ML team, 3-5 años | ❌ Suicidio comercial |
| **INTEGRATE ALL via marketplace** (Cloudbeds way) | Cero código mantener, ecosystem amplio | Cero diferencial, depende de terceros | ⚠️ Bueno pero no único |
| **HYBRID 3-tier** (Zenix proposed) | Diferencial nativo LATAM + marketplace + Pro DLC | Más complejo, requiere orquestación | ✅ **Sweet spot** |

### Por qué 3-tier es óptimo para Zenix

1. **Capa 1 (nativo)** te da features básicas que TODO PMS necesita + diferencial WhatsApp LATAM. Sin esto, Zenix se siente incompleto.

2. **Capa 2 (marketplace)** te conecta al ecosystem maduro. Customer elige Mailchimp si ya usa Mailchimp (no fricción de migrar). Cloudbeds/Mews lo hacen igual.

3. **Capa 3 (Pro DLC)** es **donde Zenix se monetiza diferenciado**. Auto-campaigns + ROI unified + predictive AI son features que **NADIE tiene bien resuelto** en LATAM target.

### Diferencial vs Cloudbeds

| Aspecto | Cloudbeds | Zenix proposed |
|---------|-----------|----------------|
| Marketing tools nativos | ❌ Solo marketplace | ✅ Capa 1 nativa + WhatsApp LATAM |
| Marketplace integraciones | ✅ 300+ apps | ✅ Menos pero curado (top 20) |
| Pro DLC con auto-campaigns | ❌ | ✅ Capa 3 monetización |
| ROI unified attribution | ⚠️ Parcial | ✅ Cross-channel total |
| LATAM-specific (WhatsApp, MercadoPago) | ❌ | ✅ |

---

## 6. Caso de uso — hotel boutique 30 cuartos LATAM

### Setup tier-based (ejemplo realista)

**Activación inicial (1 día):**
- Activate wizard configura Capa 1 nativa automático
- Connect Mailchimp con su API key existente (5 min)
- Connect Meta Business Manager (10 min) — empieza con campaigns simples
- Skip Google Hotel Ads (requiere partnership process, deferir)
- Skip HiJiffy (decide después si necesita AI chatbot)

**Operación tier 1 (días 1-30):**
- Cada booking dispara email confirmation + pre-arrival + post-stay (Resend)
- WhatsApp pre-arrival warming a guests ARRIVING (Twilio)
- Promo code SUMMER2026 generado para campaign Instagram (manual del hotel)
- Booking dashboard muestra: "10 bookings este mes vía direct, 5 vía Booking, 3 vía promo SUMMER2026"

**Mes 2 — adopta Capa 2 marketplace:**
- Conecta Klaviyo para campaigns más sofisticadas (cambió desde Mailchimp)
- Activa Meta Hotel Ads catalog → campaigns automáticas Meta dynamic ads
- Sigue sin Google (proceso parnership en curso)

**Mes 6 — opt-in Zenix Marketing Pro:**
- Activa auto-campaigns occupancy-based: weekend con <60% → auto-lanza email blast a guests previos con discount 15%
- Activa post-stay review sequence
- Compra featured spot en book.zenix.com marketplace ($300/mes)

**Resultado año 1:**
- 60% del marketing automático sin intervención del hotel
- 35% más direct bookings vs año anterior
- Tiempo del hotel en marketing: 2-3 horas/mes (vs 10-15 horas)

---

## 7. Monetización del módulo

### Modelo de revenue Zenix Marketing

| Layer | Revenue stream Zenix | Margen estimado |
|-------|---------------------|-----------------|
| **Capa 1 nativa** | Incluido en SaaS PMS — sin revenue directo | Costo del email service (Resend $0.001/email) repassed |
| **Capa 2 marketplace** | 10-20% fee del precio del plugin (Cloudbeds pattern) | ~$20-100 USD/mes por hotel activo |
| **Capa 3 Pro DLC** | $99-299 USD/mes addon per property | ~50% margen tras costos AI/ML |
| **Featured spots** | $200-500 USD/mes per property | ~85% margen (revenue puro) |
| **Marketplace bookings commission** | 3-5% del booking value (sprint COMMISSION-MODEL ya planificado) | Variable |

### Por hotel boutique 30 cuartos típico

**Año 1:**
- SaaS PMS base: $400/mes × 12 = $4,800
- Marketplace fee (asume Mailchimp + Klaviyo + HiJiffy): $50/mes × 12 = $600
- Pro DLC (mes 6+): $149/mes × 6 = $894
- Featured spot (mes 8+): $300/mes × 4 = $1,200
- Commission marketplace (50% bookings @ 3%): ~$5,000

**Total Zenix revenue/hotel/año: $12,494**
Vs Cloudbeds standalone $3,000-4,000/año.
Vs Mews standalone $4,800-6,000/año.

**Margen Zenix por hotel:** ~$8,000/año tras costos infrastructure + plugin marketplace fees.

---

## 8. Riesgos + compliance

| # | Riesgo | Probabilidad | Mitigación |
|---|--------|--------------|------------|
| R1 | Google Hotel Ads partnership process lento (3-6 meses) | 🟠 Alta | Empezar Meta primero (más rápido) + Google parallel; defer plugin a fase 2 |
| R2 | Mailchimp/Klaviyo cobran al hotel directamente — no Zenix | 🟢 Baja | Marketplace fee no del plugin → Zenix cobra al hotel por la integración nativa |
| R3 | GDPR + LFPDPPP — guest consent para marketing emails | 🔴 Crítica | Implementar consent management UI + email opt-out + audit |
| R4 | CAN-SPAM Act (US) — un-subscribe link mandatory | 🔴 Crítica | Footer auto-gen en todos los emails marketing |
| R5 | WhatsApp Business API approval lento | 🟠 Media | Twilio acelera (template approval ~48h) |
| R6 | Meta deprecation de APIs (Q1 2026 ya pasó) | 🟡 Baja | Auto-migrate to Advantage+ + monitor changelog |
| R7 | Customer overload — demasiadas opciones marketplace | 🟠 Media | "Curated" marketplace: top 20 plugins solamente, no 300 |
| R8 | HiJiffy/Akia ya cubrieron Latam y son barrera | 🟠 Media | NO competir; integrar como plugin estratégico |
| R9 | AI ML team requirement para Capa 3 | 🟠 Media | v1.1.1 heurística sin ML (CLAUDE.md ya plan) — postpone ML real a v1.4.x |

### Compliance crítico

**GDPR (Europa) + LFPDPPP (México):**
- Opt-in explícito al booking → checkbox "Acepto recibir comunicaciones de marketing"
- Opt-out un-click en cada email
- Right to be forgotten → endpoint API + UI
- Data Processing Agreement (DPA) con cada plugin marketplace (legal review)

**CAN-SPAM Act (US):**
- Footer con dirección física obligatorio
- Un-subscribe que funciona en 10 días max
- Sender identification clara

**WhatsApp Business Policy:**
- Solo mensajes template-approved fuera de la ventana 24h post-conversation
- Templates require Meta approval (48h)
- No spam — quota strict per business

---

## 9. Plan de implementación por fases

### Pre-requisitos (bloqueantes)

- **BE-PREP** completo (sin photos/descriptions del property, no hay marketing data) — ya planeado
- **Booking Engine Fase 1** completo (UTM tracking + attribution infrastructure)
- **COMMISSION-MODEL** completo (Stripe Connect para split payments)

### Fase 1 — Capa 1 nativa (4-5 semanas)

**MKT-1.1 Email transaccional (1.5 sem)**
- Integrar Resend o SendGrid
- Templates HTML responsive con branding per property
- 3 templates iniciales: confirmation, pre-arrival 48h, post-stay 24h
- i18n templates (es-MX, en-US, pt-BR, fr-FR)
- Unsubscribe link auto-generado
- Audit log de envíos

**MKT-1.2 WhatsApp pre-arrival warming (1 sem)**
- Twilio WhatsApp API setup (Meta direct sería ideal pero approval lento)
- Templates "pre-arrival check" approval Meta
- Cron 20:00 local detecta ARRIVING sin actualCheckin → envía
- Audit log + opt-out support

**MKT-1.3 UTM tracking + attribution (3-4 días)**
- Booking Engine captures UTM al cargar página
- Cookie 30d
- `referralSource` field en GuestStay (already in COMMISSION-MODEL plan)
- Multi-touch reporting

**MKT-1.4 Promo codes engine (4-5 días)**
- `PromoCode` model: code, discountType, discountValue, validFrom, validTo, maxUses, roomTypeIds[]
- Validation en booking engine
- Admin UI para crear/listar/desactivar
- Reports: uso por código

**MKT-1.5 Guest CRM básico (4-5 días)**
- Search guest por email/phone/document → ver historial bookings
- Tags assignables: VIP, Returning, First time, Group
- Preferences free-text field
- View: lifetime value, last stay, frequency

### Fase 2 — Capa 2 marketplace (3-4 semanas)

**MKT-2.1 Plugin framework (1 sem)**
- `MarketingPlugin` model + activation flow
- OAuth 2.0 generic + API key generic patterns
- Settings UI tab "Marketplace"
- Plugin manifest schema (name, logo, description, pricing, capabilities)

**MKT-2.2 Mailchimp integration (4-5 días)**
- OAuth setup
- Audience sync: GuestStay events → Mailchimp lists
- Tag mapping automático
- Event triggers (first_booking, stay_completed, vip_threshold)

**MKT-2.3 Meta Hotel Ads (5-6 días)**
- Meta App + Business Manager setup
- Catalog sync (RoomTypes → Meta catalog)
- Conversion API server-side pixel
- Performance reading via Marketing API
- Settings UI per property

**MKT-2.4 Guest messaging plugin (HiJiffy primary) (5-6 días)**
- Partnership con HiJiffy (negotiation)
- Webhook integration (Zenix → HiJiffy stay events)
- Customer activa con su HiJiffy account existente
- Conversation context viewable en BookingDetailSheet

### Fase 3 — Capa 3 Zenix Marketing Pro (6-8 semanas, opcional)

**MKT-3.1 Auto-campaigns occupancy-based (2 sem)**
**MKT-3.2 Email sequences pre-built (1.5 sem)**
**MKT-3.3 ROI attribution unificada dashboard (1.5 sem)**
**MKT-3.4 Predictive heuristic pricing (1 sem)**
**MKT-3.5 QA + piloto (1 sem)**

### Fase 4 — Google Hotel Ads integration (en paralelo a Fase 2-3)

- Aplicar a Google Partnership program (3-6 meses de espera)
- Property feed sync to Hotel Center vía API
- Read-only performance reporting
- Customer maneja campaigns en Google Ads UI

**Total Fase 1+2 (mínimo viable):** **7-9 semanas**
**Total Fase 1+2+3:** **13-17 semanas**

---

## 10. Decisiones pendientes antes de arrancar

| # | Decisión | Quién decide |
|---|----------|--------------|
| 1 | ¿Apostar a Capa 1 nativa + Capa 2 marketplace, o priorizar Capa 3 Pro DLC primero? | Negocio |
| 2 | Resend vs SendGrid vs Postmark para transaccional | Técnica (Resend recommendation) |
| 3 | Mailchimp + Klaviyo + Revinate, ¿cuáles plugins primero? | Producto (top 3 sugeridos) |
| 4 | HiJiffy vs Akia vs Duve como primary messaging plugin | Estratégica + comercial (depende de partnership terms) |
| 5 | ¿Aplicar a Google Hotel Ads Partnership ahora o post-launch? | Estratégica (sugerencia: aplicar AHORA, proceso largo) |
| 6 | ¿Modelo de pricing Pro DLC fijo $149 vs tiered $99/$199/$299? | Negocio |
| 7 | ¿WhatsApp Business API direct (Meta) vs Twilio? | Técnica (Twilio recommendation por speed) |
| 8 | Open marketplace público de developers (3rd party apps) o curado Zenix only? | Estratégica |

---

## 11. ROI y métricas de éxito

### Para Zenix (negocio)

| Métrica | Target mes 6 | Target año 1 |
|---------|--------------|---------------|
| % hoteles que activan Capa 1 nativa | 100% (auto) | 100% |
| % hoteles que activan ≥1 plugin Capa 2 | 40% | 70% |
| % hoteles que activan Pro DLC | 10% | 25% |
| Revenue Capa 2 marketplace fees | $200/hotel/mes | $50/hotel/mes (mature) |
| Revenue Pro DLC | $0 inicial | $149/hotel activo |
| ROI per hotel total (vs base $400 SaaS) | +30% | +60% |

### Para el hotel (cliente)

| Métrica | Target |
|---------|--------|
| Tiempo del hotel en marketing operations | <3 horas/mes (vs 10-15h hoy) |
| Direct booking rate | 30-50% (vs 20% baseline) |
| Email open rate | 25-30% |
| WhatsApp pre-arrival response rate | 40-60% |
| ROI marketing spend (Capa 3 Pro) | 5x-10x |

---

## 12. Posicionamiento comercial

> **"Zenix Marketing — todo lo que tu hotel necesita para conseguir más reservas directas, en un solo lugar. Email confirmaciones bonitas incluidas. WhatsApp pre-arrival nativo (diferencial LATAM). Plug-and-play con Mailchimp, Meta Ads, Google Hotel Ads, HiJiffy. Y si quieres, activa Zenix Pro para que tus campañas se lancen solas según ocupación. Cero contratar agencia. Pagas solo lo que usas."**

Pitch por tier:

**Capa 1 (incluido):**
> "Tu PMS Zenix ya envía emails de confirmación con fotos del hotel, WhatsApp pre-arrival a tus huéspedes 12h antes de llegar, y te dice de qué campaña vino cada booking. Sin pagar nada extra."

**Capa 2 (marketplace):**
> "Si ya usas Mailchimp, conéctalo en 5 minutos. Si prefieres Klaviyo, también. ¿Tienes presupuesto Meta Ads? Activamos catalog sync para que tus cuartos aparezcan en Instagram y Facebook con disponibilidad real-time."

**Capa 3 (Pro DLC):**
> "¿Tu ocupación del próximo finde está al 50%? Zenix Pro lanza solo un email blast con descuento 15% a tus huéspedes anteriores. ¿Cumple años un huésped fiel? Zenix le manda un mensaje + código. Tú duermes, Zenix vende."

---

## 13. Sources (research consultado)

- [Google Hotel Ads API documentation](https://developers.google.com/google-ads/api/docs/hotel-ads/overview)
- [Google Ads API third-party integration guide](https://developers.google.com/ad-manager/api/third-parties)
- [Hotel campaigns Google Ads — official help](https://support.google.com/google-ads/answer/9238461)
- [Meta Marketing API documentation](https://developers.facebook.com/documentation/ads-commerce/marketing-api)
- [Meta Marketing API 2026 changes](https://developers.facebook.com/documentation/ads-commerce/marketing-api/out-of-cycle-changes/occ-2026)
- [Meta Ads AI Connectors open beta April 2026](https://pasqualepillitteri.it/en/news/1707/official-meta-ads-mcp-claude-29-tools-2026)
- [HiJiffy — #1 Hotel Chatbot 2026](https://www.hijiffy.com/hotel-chatbot)
- [Akia Unified Inbox platform](https://www.akia.com/platform/unified-inbox)
- [7 Best AI Guest Communication Platforms 2026 — Conduit](https://conduit.ai/blog/7-best-ai-guest-communication-platforms-for-hotels-in-2026-tested-ranked)
- [HiJiffy reviews Hotel Tech Report](https://hoteltechreport.com/guest-experience/guest-messaging-platforms/hijiffy)
- [Mailchimp Marketing API](https://mailchimp.com/developer/marketing/)
- [Klaviyo API reference](https://developers.klaviyo.com/en/reference/api_overview)
- [Resend transactional email API](https://resend.com/docs)
- [Twilio WhatsApp Business API](https://www.twilio.com/docs/whatsapp)
- Internal: [docs/sprints/BOOKING-ENGINE-plan.md](BOOKING-ENGINE-plan.md) — UTM tracking + attribution
- Internal: [docs/sprints/COMMISSION-MODEL-plan.md](COMMISSION-MODEL-plan.md) — Stripe Connect + marketplace
- Internal: [docs/vision/14-payment-currency-tax-architecture.md](../vision/14-payment-currency-tax-architecture.md) — payment foundations
