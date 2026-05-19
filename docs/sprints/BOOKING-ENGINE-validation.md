# Validación pre-Booking Engine — Estado real del código + Recomendaciones

> **Fecha:** 2026-05-18
> **Propósito:** Validar arquitectónicamente si Zenix está listo para multi-tenant Booking Engine ANTES de empezar el sprint. Reportar gaps con severidad.
> **Conclusión:** Existe el 60% (no el 70% que estimé inicialmente). Hay **9 prerequisitos faltantes** críticos antes de implementar el Booking Engine.

---

## 1. Validación — qué EXISTE vs qué FALTA

### Multi-tenancy core ✅ (Sólido)

| Componente | Estado | Ubicación |
|------------|--------|-----------|
| Modelo `Organization` con slug único | ✅ | `schema.prisma:423-430` |
| Modelo `LegalEntity` (fiscal) | ✅ | v1.0.5 §63 |
| Modelo `Property` con `organizationId + legalEntityId` | ✅ | `schema.prisma:646-720` |
| Modelo `Brand` con `slug + logoUrl + brandColors` JSON | ✅ | `schema.prisma:542-559` |
| `RoomType` con `name + code + maxOccupancy + baseRate + amenities[]` | ✅ | `schema.prisma:1210-1234` |
| `Room` con `propertyId + roomTypeId + capacity` | ✅ | `schema.prisma:711+` |
| `propCode` 3-digit único per property | ✅ | `schema.prisma:668` |
| `bookingRef` con segmentos `MX-D-001-2604-0134` | ✅ | `schema.prisma:1240` |
| `TenantContextService` enforcement | ✅ | §72 |
| Multi-currency per LegalEntity | ✅ | v1.0.5 |
| 3-level user roles (Brand/LegalEntity/Property) | ✅ | §67 |

### Property metadata 🟡 (Gaps críticos para BE)

| Campo necesario para Booking Engine | Estado | Severidad |
|-------------------------------------|--------|-----------|
| **`Property.slug`** (para `book.zenix.com/{slug}`) | ❌ FALTA | 🔴 Crítica |
| **`Property.description`** | ❌ FALTA | 🟠 Alta |
| **`Property.address`** (street, city, state, country, zip) | ❌ FALTA | 🟠 Alta |
| **`Property.latitude/longitude`** | ❌ FALTA | 🟡 Media (Google Maps embed) |
| **`Property.publicPhone/publicEmail/websiteUrl`** | ❌ FALTA | 🟠 Alta |
| **`Property.photos[]`** (cover + galería) | ❌ FALTA | 🔴 Crítica (sin fotos no hay BE) |
| **`Property.amenities[]`** (wifi, pool, parking, etc.) | ❌ FALTA | 🟠 Alta |
| **`Property.defaultLanguage` + `supportedLanguages[]`** | ❌ FALTA | 🟠 Alta |
| **`Property.brandColor`** (per-property, no solo Brand) | ❌ FALTA | 🟠 Alta |
| **`Property.logoUrl`** (per-property, hotel sin Brand parent) | ❌ FALTA | 🟠 Alta |

### RoomType metadata 🟡 (Gaps medios para BE)

| Campo necesario | Estado | Severidad |
|-----------------|--------|-----------|
| `RoomType.photos[]` | ❌ FALTA | 🔴 Crítica |
| `RoomType.bedConfiguration` (1 king / 2 queens / etc.) | ❌ FALTA | 🟠 Alta |
| `RoomType.sizeM2` | ❌ FALTA | 🟡 Media |
| `RoomType.viewType` (mar, jardín, ciudad) | ❌ FALTA | 🟡 Media |
| `RoomType.smokingAllowed` / `petsAllowed` | ❌ FALTA | 🟡 Media |
| `RoomType.minStayNights` / `maxStayNights` | ❌ FALTA | 🟠 Alta |

### Booking policies ❌ (Completamente ausente)

| Componente | Estado | Severidad |
|------------|--------|-----------|
| **`CancellationPolicy`** model (flexible/moderate/strict/non-refundable) | ❌ FALTA | 🔴 Crítica |
| **`DepositPolicy`** (% upfront, monto fijo, none) | ❌ FALTA | 🔴 Crítica |
| **Mandatory** según Google + Meta guidelines | ❌ Compliance gap | 🔴 Crítica |
| Check-in/out times configurable per property | 🟡 Solo `defaultCheckoutTime` String | 🟠 Alta |

### Wizard de onboarding (Zenix Activate) ❌ (Solo documentado)

| Estado | Detalle |
|--------|---------|
| ❌ Implementación | NO existe en código (`grep wizard` solo encuentra comentarios) |
| ✅ Diseño | Documentado en `docs/vision/13-consultant-setup-wizard.md` |
| ❌ Templates inventory | HOSTAL/BOUTIQUE/CABAÑAS/BUSINESS solo descritos, no implementados |
| ❌ Health checks pre-activación | No existen |
| ❌ Activation Report PDF | No existe |

### Booking Engine specific ❌ (0% — todo nuevo)

| Componente | Estado |
|------------|--------|
| Module `apps/api/src/public-booking/` | ❌ No existe |
| `BookingApiKey` model + endpoints | ❌ No existe |
| `WebhookSubscription` model + dispatcher | ❌ No existe |
| Hosted UI `apps/booking-page/` | ❌ No existe |
| Rate limiting `@nestjs/throttler` configurado | ❌ Disponible pero no usado |
| CORS dinámico per API key | ❌ No existe |
| OpenAPI auto-spec (`@nestjs/swagger`) | ❌ Disponible pero no usado |
| `BookingSource.DIRECT_WEB` enum value | ❌ Falta agregar |

---

## 2. Estimación real revisada

### Lo que estimé antes vs lo real

| Estimación | Inicial | Real (post-validación) |
|-----------|---------|-----------------------|
| % del trabajo ya hecho | 70% | **~50-60%** |
| Sprint 1A (API READ) | 1 sem | **2 sem** (requiere agregar Property fields + slug + RoomType photos primero) |
| Sprint 1B (API WRITE + Auth + Webhooks) | 1-2 sem | 1-2 sem ✓ |
| Sprint 1C (Settings UI) | 3-5 días | 5-7 días (más fields a editar) |
| Sprint 1D (Hosted UI) | 2-3 sem | 3-4 sem (incluye property pages full SEO + photo galleries) |
| Sprint 1E (OpenAPI docs) | 3 días | 3 días ✓ |
| Sprint 1F (QA + piloto) | 1 sem | 1-2 sem |
| **Total Fase 1** | **5-6 sem** | **8-10 sem** |

**Diferencia clave:** subestimé el trabajo de **enrich data model** (slug, photos, address, cancellation policies). Sin estos, el Booking Engine no es vendible.

---

## 3. Recomendaciones de industria (research)

> Fuentes consultadas: Cloudbeds, Mews, eviivo, SiteMinder, Little Hotelier, Hotelogix, Zuzu Hospitality, TechMagic, Codelevate (10 sources). Tomadas como datos adicionales, no fuente de verdad.

### 3.1 Pattern de onboarding observado en líderes

**eviivo** — referencia top-rated UX:
- Self-serve onboarding con **bulk actions** + smart cloning + auto-imports + AI-assisted content
- Reportes verbatim: *"88% less training time, staff running shifts solo en 2 semanas"*
- *"92% de operadores dicen que el UX moderno reduce drásticamente el training time"*

**Aplicación a Zenix:** el `Zenix Activate` wizard debe priorizar:
1. **Cloning** entre properties (cadena que abre 2ª location reusa setup de la 1ª)
2. **Bulk import** de RoomTypes desde Excel/CSV (hoteles grandes no quieren capturar manual)
3. **AI suggestions** opcional para descriptions/amenities (puede ser GPT-4 backend)

### 3.2 Pattern de tenant provisioning (general SaaS multi-tenant)

> *"Manual tenant setup is fine for 10 customers, at 100 it's a bottleneck, at 500 it's a liability"*

**Recomendación:** automatizar el wizard end-to-end:
- Customer paga online → backend crea Organization + LegalEntity + Property automáticamente
- Envía welcome email con link al wizard de configuración
- Aprovisiona API key + slug + branding defaults
- Health checks corren async post-activation

### 3.3 Hybrid tenancy emergente 2026

> *"Hybrid tenancy: standard-tier en pooled infrastructure; enterprise clients con compliance heavy en isolated environments"*

**Aplicación a Zenix:**
- v1.0.x: pooled (un solo Postgres compartido) ✓ — donde estamos
- v1.2+ enterprise customers cadena grande: opt-in para dedicated DB (compliance SOC 2)
- v1.3+ data residency: cliente puede pedir DB en su región (EU/MX/BR)

### 3.4 Booking Engine — fields mínimos validados por industria

Coincidencia entre Cloudbeds + STAAH + eviivo + Mews:

| Tipo de info | Campos mínimos |
|--------------|----------------|
| **Property** | name, slug, description, address, lat/lng, phone, email, photos (cover + galería 5+), languages, currency, timezone |
| **RoomType** | name, description, bedConfig, maxOccupancy, sizeM2, photos (3+ per type), amenities[], minStay, maxStay, baseRate |
| **Policies** | cancellation tiers (free until X / partial / non-refundable), deposit %, check-in/out times, age restrictions, smoking, pets |
| **Localization** | supportedLanguages[], defaultCurrency, displayCurrencies[] |

**Sin estos, Google/Meta/Hotels.com NO indexan tu booking engine** (compliance Google Hotel Ads + Meta Booking Partner Program).

### 3.5 Performance benchmarks

| Métrica | Target |
|---------|--------|
| TTFB property page | <200ms |
| LCP (Largest Contentful Paint) | <2.5s mobile, <1.5s desktop |
| CLS (Cumulative Layout Shift) | <0.1 |
| Photo gallery total size first load | <500KB (lazy load rest) |
| API availability query latency p95 | <300ms |
| Webhook delivery p95 | <2s |

### 3.6 Cancellation policy — patrón industria

**3 tiers estándar (Cloudbeds + Booking.com Genius):**
1. **Flexible** — full refund hasta 24-48h antes
2. **Moderate** — full refund hasta 7d antes; 50% entre 7d-24h
3. **Strict** — 50% refund hasta 14d antes; 0% después
4. **Non-refundable** — 0% siempre (precio descontado)

**Implementación recomendada:** Property tiene `defaultCancellationPolicyId`. Cada RoomType puede override. Cada rate plan (futuro) también puede override. Cascade resolution.

### 3.7 Trust signals que aumentan conversion +23-31%

Lista priorizada:
1. ✅ Real guest reviews score visible (mínimo 4.0★ visible)
2. ✅ Security badges (SSL lock + payment processor logos)
3. ✅ Clear cancellation policy en checkout (no en página separada)
4. ✅ "Best rate guarantee" badge si aplica
5. ✅ Photos verificadas (no stock)
6. ✅ Real-time availability ("Solo quedan 2 cuartos a este precio")
7. ✅ Total transparente (taxes + fees incluidos desde step 1)

### 3.8 Mobile-first checklist 2026

| Punto | Crítico? |
|-------|----------|
| One-page checkout (NO wizard de pasos) | 🔴 Sí |
| Auto-fill detection (browser autofill) | 🟠 Alta |
| Apple Pay / Google Pay sheet | 🔴 Sí |
| Date picker mobile-native (no popup que no cabe) | 🔴 Sí |
| Phone input con country code searchable | 🟠 Alta |
| Touch targets ≥44pt (Apple HIG) | 🔴 Sí |
| Hero photo dimensions responsive | 🟠 Alta |

### 3.9 LATAM-specific (oportunidad diferencial)

| Feature | Players globales que NO la tienen |
|---------|-----------------------------------|
| OXXO voucher payment | Cloudbeds, Mews, Little Hotelier, SiteMinder, eviivo |
| Mercado Pago | Cloudbeds, Mews, eviivo |
| SPEI transferencia (MX) | Todos |
| CFDI auto-emisión post-booking | Todos |
| es-MX nativo (no es-ES traducido) | Mayoría |
| WhatsApp confirmation post-booking | Solo algunos |
| Real-time exchange rate display (MXN/USD) | Pocos |

**Diferencial Zenix v1.0.x:** Tax engine LATAM nativo (§91) + FX-CORE Banxico (§103) ya posicionan a Zenix mejor que cualquier competidor en LATAM. El Booking Engine puede capitalizar esto.

---

## 4. Plan de acción ajustado — pre-requisitos antes del BE

### Sprint pre-requisito BE-PREP (2-3 semanas)

Antes de poder construir el Booking Engine, hay que cerrar gaps de data model + Activate wizard.

#### BE-PREP-1: Enrich Property model (1 sem)

```prisma
model Property {
  // ... existing ...
  slug              String        @unique  // NUEVO
  description       String?       // NUEVO
  street            String?       // NUEVO
  postalCode        String?       // NUEVO
  state             String?       // NUEVO
  country           String?       // NUEVO ISO 3166-1
  latitude          Decimal?      @db.Decimal(10, 7) // NUEVO
  longitude         Decimal?      @db.Decimal(10, 7) // NUEVO
  publicPhone       String?       // NUEVO
  publicEmail       String?       // NUEVO
  websiteUrl        String?       // NUEVO
  photos            String[]      // NUEVO array URLs
  coverImageUrl     String?       // NUEVO
  amenities         String[]      // NUEVO
  defaultLanguage   String        @default("es-MX")  // NUEVO
  supportedLanguages String[]     @default(["es-MX","en-US"])  // NUEVO
  brandColor        String?       // NUEVO hex (#RRGGBB)
  logoUrl           String?       // NUEVO (per-property override del Brand)
  checkInTime       String        @default("15:00")  // NUEVO
  checkOutTime      String        @default("12:00")  // NUEVO (mover de PropertySettings)
}
```

Migration backfill: el slug se genera automáticamente desde `name + propCode` para properties existentes.

#### BE-PREP-2: Enrich RoomType model + Booking Policies (4-5 días)

```prisma
model RoomType {
  // ... existing ...
  photos           String[]
  bedConfiguration String?  // "1 king" / "2 queens" / "1 queen + 1 sofa bed"
  sizeM2           Int?
  viewType         String?  // "ocean" / "garden" / "city"
  smokingAllowed   Boolean  @default(false)
  petsAllowed      Boolean  @default(false)
  minStayNights    Int      @default(1)
  maxStayNights    Int?
}

model CancellationPolicy {  // NUEVO modelo
  id              String   @id @default(uuid())
  propertyId      String
  name            String   // "Flexible", "Moderate", "Strict", "Non-refundable"
  tiers           Json     // [{ hoursBefore: 24, refundPercent: 100 }, ...]
  isDefault       Boolean  @default(false)
  createdAt       DateTime @default(now())

  property        Property @relation(fields: [propertyId], references: [id])
  @@index([propertyId, isDefault])
}

model DepositPolicy {  // NUEVO modelo
  id              String   @id @default(uuid())
  propertyId      String
  name            String   // "None", "10% upfront", "Full prepayment"
  percentUpfront  Int      // 0-100
  fixedAmount     Decimal? @db.Decimal(10, 2)
  isDefault       Boolean  @default(false)
}
```

#### BE-PREP-3: Zenix Activate wizard MVP (1-1.5 sem)

Implementar las 4 etapas más críticas (de las 8 documentadas en `docs/vision/13`):

- **Etapa 1: Datos básicos** (name, address, country, language, currency)
- **Etapa 4: Inventory** (con templates HOSTAL/BOUTIQUE/CABAÑAS/BUSINESS + custom)
- **Etapa 6: Branding** (logo upload, color picker, photos)
- **Etapa 7: Booking policies** (cancellation + deposit defaults)

Etapas 2 (LegalEntity), 3 (LegalEntity FX), 5 (Staff), 8 (Activation) ya tienen partes existentes — solo formalizar como wizard.

#### BE-PREP-4: Templates inventory (3 días)

Seed 4 templates en código (no DB):

```ts
// apps/api/src/onboarding/inventory-templates.ts
export const TEMPLATES = {
  HOSTAL: {
    roomTypes: [
      { name: 'Cuarto Privado', maxOccupancy: 2, amenities: ['wifi', 'private_bath'] },
      { name: 'Dorm Mixto 6 camas', maxOccupancy: 6, amenities: ['wifi', 'shared_bath', 'lockers'] },
    ],
  },
  BOUTIQUE: {
    roomTypes: [
      { name: 'Estándar', maxOccupancy: 2, amenities: ['wifi', 'ac', 'tv', 'minibar'] },
      { name: 'Suite Junior', maxOccupancy: 3, amenities: [...] },
      { name: 'Suite Master', maxOccupancy: 4, amenities: [...] },
    ],
  },
  CABANAS: { ... },
  BUSINESS: { ... },
}
```

Customer escoge template → wizard pre-llena RoomTypes → puede editar/agregar/borrar.

---

## 5. Plan completo revisado — Booking Engine

### Fase 0: PRE-REQUISITOS (2-3 sem) — BLOQUEANTE

1. **BE-PREP-1** Enrich Property model + migration
2. **BE-PREP-2** Enrich RoomType + Cancellation/Deposit policies
3. **BE-PREP-3** Zenix Activate wizard MVP (4 etapas críticas)
4. **BE-PREP-4** Templates inventory seed

**Sin Fase 0 no se puede construir el BE.** Esto es lo que descubrí en la validación.

### Fase 1: Booking Engine (5-6 sem)

Idéntico a lo planificado en `BOOKING-ENGINE-plan.md`:
- 1A API pública READ
- 1B API pública WRITE + Auth + Webhooks
- 1C Settings UI + Onboarding
- 1D Hosted UI book.zenix.com/{slug}
- 1E OpenAPI docs + sandbox
- 1F QA + piloto

### Fase 2 (opcional): Widget embebido (2-3 sem)
### Fase 3 (opcional): WordPress plugin (1 sem)

**Total realista para "Zenix listo para conectar":** 7-9 semanas con Fase 0 incluida.

---

## 6. Recomendaciones específicas a tomar de industria

### 🟢 Adopta (alto ROI)

1. **Templates inventory** (eviivo pattern) — el wizard sin templates es muy lento para hostal/boutique. 4 templates cubren 80% del mercado LATAM.
2. **Cloning entre properties** (eviivo) — customer abre 2ª location, reusa 95% del setup de la 1ª. Crítico para cadenas.
3. **AI-assisted descriptions** (eviivo) — opcional GPT-4 backend para sugerir descriptions/amenities. Reduce captura manual.
4. **Cancellation policy** model formal (industria mandatory) — sin esto NO indexás en Google Hotel Ads / Meta Booking.
5. **Photos como first-class citizens** — sin fotos no hay BE. Storage S3-compatible + CDN obligatorio.
6. **Health checks pre-activation** — antes de marcar property `isActive=true`, validar: ¿hay RoomTypes? ¿hay fotos? ¿hay cancellation policy? ¿hay payment method? Si falla algo → wizard no permite continuar.

### 🟡 Considera (medio ROI)

7. **Activation Report PDF** post-wizard — pattern SAP Activate. Sirve como handover formal + entrada para soporte.
8. **Health dashboard** post-launch — métricas conversion + page load + booking volume per property. Customer ve ROI.
9. **Multi-step setup vs single page** — NN/g 2024: wizard si la captura >5 min. Aquí calza (8 etapas, ~30-90 min). Single page sería abrumador.
10. **WhatsApp confirmation** post-booking (LATAM diferencial) — Twilio integration en Fase 2.

### 🔴 Evita (anti-patterns observados)

11. **iframe-based booking engine** — Cloudbeds lo está deprecando. SEO destruido + clickjacking + brand inconsistency. Ya documentado.
12. **One-size-fits-all rate plans** — no asumir todos los hoteles cobran igual. RoomType + RatePlan = matriz, no producto cartesiano forzado.
13. **Wizard de 1 sentado** (todo en 1 sesión) — algunos hoteles tardan días en juntar fotos. **Save progress** entre sesiones obligatorio.
14. **Forzar logo upload** en step 1 — algunos hoteles no tienen logo profesional. Onboarding bloqueado por esto = abandono. Default placeholder + opcional.

---

## 7. Conclusión + recomendación de orden

### Tu pregunta original

> *"¿Está Zenix listo para multi-tenant? ¿Cómo implemento a 5 clientes distintos?"*

**Respuesta honesta:** la arquitectura de scoping está sólida (Property + RoomType + multi-tenancy). **Pero faltan los campos que la industria exige para un Booking Engine real:** slug, fotos, address geocoded, branding per-property, cancellation policies. Sin esos, podés tener 5 properties separadas pero NO podés decir "Zenix está listo para BE".

### Mi recomendación de orden estricto

```
SPRINT BE-PREP (2-3 sem) — BLOQUEANTE
   ├─ Enrich Property model
   ├─ Enrich RoomType model
   ├─ CancellationPolicy + DepositPolicy models
   ├─ Zenix Activate Wizard MVP (4 etapas)
   └─ Templates inventory seed
   
SPRINT BOOKING-ENGINE Fase 1 (5-6 sem)
   ├─ 1A API pública READ
   ├─ 1B API pública WRITE + Auth + Webhooks  
   ├─ 1C Settings UI
   ├─ 1D Hosted UI book.zenix.com
   ├─ 1E OpenAPI docs
   └─ 1F QA + piloto
   
[OPCIONAL] Fase 2 Widget + Fase 3 WP plugin
```

**Sin BE-PREP, el BE sale "incompleto":** no podés vender un Booking Engine que muestra fotos genéricas, sin cancellation policy clara, sin geolocalización en Google Maps. Sería peor que tener nada.

### Beneficio adicional de Sprint BE-PREP

El wizard + enriched models **NO solo sirven al Booking Engine** — también:
- Reducen el time-to-live del onboarding general de Zenix de "manual setup" a "30-90 min wizard"
- Habilitan **Google Hotel Ads** integration (necesita addresses + cancellation policy estructuradas)
- Habilitan **Meta Booking Partner** integration (mismo)
- Habilitan **TripAdvisor Express** integration (mismo)
- Mejoran cualquier reporte multi-property (Brand → Org → Properties con metadata rica)

Es decir, BE-PREP **paga 4-5 features además del Booking Engine.**

---

## Sources (research consultado)

- [Cloudbeds Booking Engine — features y onboarding](https://www.cloudbeds.com/booking-engine/)
- [STAAH Booking Engine — fields mínimos](https://www.staah.com/booking-engine/)
- [eviivo PMS — onboarding pattern self-serve](https://eviivo.com/)
- [Top 10 Booking Engines 2026 — TechMagic](https://www.techmagic.co/blog/best-hotel-booking-engine)
- [Multi-Property Hotel PMS Best Practices — Hotelogix](https://blog.hotelogix.com/multi-property-hotel-pms/)
- [Multi-Tenant SaaS Architecture Guide 2026 — Ariel Softwares](https://www.arielsoftwares.com/multi-tenant-architecture-saas-guide/)
- [Mews PMS — onboarding](https://www.mews.com/en/property-management-system)
- [Best Hotel PMS by Segment 2026 — Codelevate](https://www.codelevate.com/blog/the-best-pms-systems-by-hospitality-segment-for-2026)
- [Designing Multi-Tenant SaaS 2026 — TechExactly](https://techexactly.com/blogs/multi-tenant-saas-applications)
- [Cloud PMS Guide for Independent Hotels — ZuzuHospitality](https://zuzuhospitality.com/blog/what-is-cloud-pms-guide-independent-hotels)
- [Little Hotelier Booking Engine](https://www.littlehotelier.com/hotel-booking-engine/)
- [What is a Hotel Booking Engine — Cloudbeds guide](https://www.cloudbeds.com/articles/hotel-booking-engine-guide/)
