# Sprint BE-PREP — Pre-requisitos para Booking Engine

> **Status:** Plan formal · Ready para arrancar implementación
> **Duración:** 2-3 semanas (1 dev focused)
> **Bloqueante de:** Sprint BOOKING-ENGINE Fase 1
> **Beneficio adicional:** habilita Google Hotel Ads, Meta Booking, TripAdvisor Express, email templates, reportes multi-property, SEO público

---

## 1. Objetivo

Enriquecer el modelo de datos de Zenix para que cada **Property** tenga el "perfil completo" requerido por:
- Booking Engine propio (Sprint siguiente)
- Google Hotel Ads + Meta Booking Partner (compliance obligatoria)
- Emails transaccionales con branding
- Páginas públicas SEO-friendly

Hoy Zenix opera puertas adentro perfectamente. Este sprint le agrega la **cara pública** estructurada.

---

## 2. Scope — 4 sub-sprints

| Sub-sprint | Duración | Entregable |
|-----------|----------|-----------|
| **BE-PREP-1** | 1 sem | Schema migrations: Property + RoomType enrichment |
| **BE-PREP-2** | 4-5 días | CancellationPolicy + DepositPolicy models |
| **BE-PREP-3** | 1-1.5 sem | Zenix Activate Wizard MVP (4 etapas críticas) |
| **BE-PREP-4** | 3 días | Templates inventory seed + cloning entre properties |

**Total: 2-3 semanas focused work**

---

## 3. BE-PREP-1 — Schema enrichment (1 sem)

### 3.1 Property model — nuevos campos

```prisma
model Property {
  // ... existing fields ...

  // ── Identidad pública ─────────────────────────────────────────────────
  /// URL slug único — usado en book.zenix.com/{slug}.
  /// Auto-generado desde name + propCode: "hotel-tulum-001".
  /// Validador: lowercase, alphanumeric + hyphens, 3-60 chars.
  slug              String        @unique @map("slug")

  description       String?       @map("description")

  // ── Dirección estructurada (Google Hotel Ads / Meta requirement) ──────
  street            String?       @map("street")
  postalCode        String?       @map("postal_code")
  stateRegion       String?       @map("state_region")  // estado/provincia
  // ISO 3166-1 alpha-2 country code (MX, US, BR, CO, etc.)
  countryCode       String?       @map("country_code") @db.Char(2)
  /// Latitude para Google Maps embed. Precisión 7 decimales (~1cm).
  latitude          Decimal?      @db.Decimal(10, 7) @map("latitude")
  longitude         Decimal?      @db.Decimal(10, 7) @map("longitude")

  // ── Contacto público ──────────────────────────────────────────────────
  publicPhone       String?       @map("public_phone")
  publicEmail       String?       @map("public_email")
  websiteUrl        String?       @map("website_url")

  // ── Media (S3-compatible URLs) ───────────────────────────────────────
  /// Cover image — primera foto del hero. URL absoluta.
  coverImageUrl     String?       @map("cover_image_url")
  /// Galería de fotos del hotel. Mínimo 5 recomendadas para BE.
  photos            String[]      @map("photos")

  // ── Amenities a nivel propiedad ───────────────────────────────────────
  /// Lista normalizada de amenities. Catálogo en `lib/amenities-catalog.ts`.
  /// Ejemplos: 'wifi_free', 'pool_outdoor', 'parking_free', 'breakfast_included',
  /// 'bar', 'restaurant', 'gym', 'pet_friendly', 'beach_access'.
  amenities         String[]      @map("amenities")

  // ── Localización + branding per-property ──────────────────────────────
  defaultLanguage   String        @default("es-MX") @map("default_language")
  supportedLanguages String[]     @default(["es-MX","en-US"]) @map("supported_languages")
  /// Color hex de marca (#RRGGBB). Override per-property del Brand parent.
  brandColor        String?       @map("brand_color")
  /// Logo URL (S3). Override per-property del Brand parent. Permite que
  /// properties dentro del mismo Brand tengan logos diferentes (raro pero
  /// posible para colecciones boutique).
  logoUrl           String?       @map("logo_url")

  // ── Times (move from PropertySettings.defaultCheckoutTime) ────────────
  checkInTime       String        @default("15:00") @map("check_in_time")
  checkOutTime      String        @default("12:00") @map("check_out_time")
}
```

### 3.2 RoomType model — nuevos campos

```prisma
model RoomType {
  // ... existing fields ...

  photos           String[]  @map("photos")
  /// Texto libre: "1 cama king", "2 camas queen", "1 queen + 1 sofa cama"
  bedConfiguration String?   @map("bed_configuration")
  sizeM2           Int?      @map("size_m2")
  /// "ocean", "garden", "city", "courtyard", "mountain"
  viewType         String?   @map("view_type")
  smokingAllowed   Boolean   @default(false) @map("smoking_allowed")
  petsAllowed      Boolean   @default(false) @map("pets_allowed")
  /// Mínimo de noches reservables. Default 1 (sin restricción).
  minStayNights    Int       @default(1) @map("min_stay_nights")
  /// Máximo de noches reservables. NULL = sin máximo.
  maxStayNights    Int?      @map("max_stay_nights")
}
```

### 3.3 Migration script

```sql
-- 20260520000000_be_prep_property_enrichment/migration.sql

ALTER TABLE properties
  ADD COLUMN slug VARCHAR(60) UNIQUE,
  ADD COLUMN description TEXT,
  ADD COLUMN street VARCHAR(255),
  ADD COLUMN postal_code VARCHAR(20),
  ADD COLUMN state_region VARCHAR(100),
  ADD COLUMN country_code CHAR(2),
  ADD COLUMN latitude DECIMAL(10, 7),
  ADD COLUMN longitude DECIMAL(10, 7),
  ADD COLUMN public_phone VARCHAR(30),
  ADD COLUMN public_email VARCHAR(255),
  ADD COLUMN website_url VARCHAR(500),
  ADD COLUMN cover_image_url VARCHAR(500),
  ADD COLUMN photos TEXT[],
  ADD COLUMN amenities TEXT[],
  ADD COLUMN default_language VARCHAR(10) DEFAULT 'es-MX',
  ADD COLUMN supported_languages TEXT[] DEFAULT ARRAY['es-MX','en-US'],
  ADD COLUMN brand_color VARCHAR(7),
  ADD COLUMN logo_url VARCHAR(500),
  ADD COLUMN check_in_time VARCHAR(5) DEFAULT '15:00',
  ADD COLUMN check_out_time VARCHAR(5) DEFAULT '12:00';

-- Backfill slug desde name + propCode para properties existentes
UPDATE properties
SET slug = LOWER(REGEXP_REPLACE(name || '-' || COALESCE(prop_code, SUBSTRING(id, 1, 4)), '[^a-zA-Z0-9-]', '-', 'g'))
WHERE slug IS NULL;

-- Después del backfill, hacer slug NOT NULL
ALTER TABLE properties ALTER COLUMN slug SET NOT NULL;

CREATE INDEX idx_properties_country_code ON properties(country_code);
CREATE INDEX idx_properties_default_language ON properties(default_language);

-- RoomType enrichment
ALTER TABLE room_types
  ADD COLUMN photos TEXT[],
  ADD COLUMN bed_configuration VARCHAR(255),
  ADD COLUMN size_m2 INT,
  ADD COLUMN view_type VARCHAR(50),
  ADD COLUMN smoking_allowed BOOLEAN DEFAULT FALSE,
  ADD COLUMN pets_allowed BOOLEAN DEFAULT FALSE,
  ADD COLUMN min_stay_nights INT DEFAULT 1,
  ADD COLUMN max_stay_nights INT;
```

### 3.4 Validators (NestJS DTOs)

```ts
// apps/api/src/properties/dto/update-property.dto.ts
import { IsOptional, IsString, IsUrl, IsArray, ArrayMaxSize, Matches, IsNumber, Min, Max } from 'class-validator'

export class UpdatePropertyDto {
  @IsOptional()
  @Matches(/^[a-z0-9-]{3,60}$/, { message: 'Slug debe ser lowercase alfanumérico con hyphens, 3-60 chars' })
  slug?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @Matches(/^[A-Z]{2}$/, { message: 'countryCode debe ser ISO 3166-1 alpha-2 (ej. MX, US, BR)' })
  countryCode?: string

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUrl({}, { each: true })
  photos?: string[]

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'brandColor debe ser hex #RRGGBB' })
  brandColor?: string

  // ... etc
}
```

### 3.5 Endpoint nuevo

```ts
// apps/api/src/properties/properties.controller.ts
@Patch(':id/public-profile')
@Roles(SystemRole.SUPERVISOR)
updatePublicProfile(
  @Param('id') id: string,
  @Body() dto: UpdatePropertyDto,
  @CurrentUser() actor: JwtPayload,
) {
  return this.service.updatePublicProfile(id, dto, actor.sub)
}
```

Audit log obligatorio — branding/policies son cambios visibles públicamente.

---

## 4. BE-PREP-2 — Cancellation + Deposit policies (4-5 días)

### 4.1 Nuevos modelos

```prisma
model CancellationPolicy {
  id              String   @id @default(uuid())
  organizationId  String   @map("organization_id")
  propertyId      String   @map("property_id")
  /// Nombre descriptivo mostrado al guest: "Flexible", "Moderado", "Estricto"
  name            String
  /// Slug interno: 'flexible', 'moderate', 'strict', 'non_refundable'
  code            String
  description     String?
  /// Reglas en cascada, evaluadas desde la más cercana al checkin hacia atrás.
  /// Estructura: [{ hoursBeforeCheckin: 24, refundPercent: 100 }, ...]
  /// Si guest cancela X horas antes, recibe Y% refund.
  /// Compatible con Google Hotel Ads policy spec.
  tiers           Json
  /// Política por defecto del property (1 sola puede tener este flag).
  isDefault       Boolean  @default(false) @map("is_default")
  isActive        Boolean  @default(true) @map("is_active")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  organization    Organization @relation(fields: [organizationId], references: [id])
  property        Property     @relation(fields: [propertyId], references: [id])

  @@unique([propertyId, code])
  @@index([propertyId, isDefault])
  @@map("cancellation_policies")
}

model DepositPolicy {
  id              String   @id @default(uuid())
  organizationId  String   @map("organization_id")
  propertyId      String   @map("property_id")
  name            String
  code            String
  /// 0-100. Si > 0, se cobra al momento de reservar.
  percentUpfront  Int      @default(0) @map("percent_upfront")
  /// Override del percent — cobra monto fijo (raro pero existe en hostal Europe).
  fixedAmount     Decimal? @map("fixed_amount") @db.Decimal(10, 2)
  /// Para depósitos refundables (deposit hold vs deposit charge real)
  refundable      Boolean  @default(true)
  isDefault       Boolean  @default(false) @map("is_default")
  isActive        Boolean  @default(true) @map("is_active")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  organization    Organization @relation(fields: [organizationId], references: [id])
  property        Property     @relation(fields: [propertyId], references: [id])

  @@unique([propertyId, code])
  @@index([propertyId, isDefault])
  @@map("deposit_policies")
}
```

### 4.2 Seed templates de políticas (4 universales)

```ts
// apps/api/src/onboarding/policy-templates.ts
export const CANCELLATION_TEMPLATES = [
  {
    code: 'flexible',
    name: 'Flexible',
    description: 'Reembolso 100% hasta 24h antes del check-in',
    tiers: [
      { hoursBeforeCheckin: 24, refundPercent: 100 },
      { hoursBeforeCheckin: 0,  refundPercent: 0   },
    ],
  },
  {
    code: 'moderate',
    name: 'Moderada',
    description: 'Reembolso 100% hasta 7 días antes, 50% entre 7d y 24h, 0% después',
    tiers: [
      { hoursBeforeCheckin: 168, refundPercent: 100 },
      { hoursBeforeCheckin: 24,  refundPercent: 50  },
      { hoursBeforeCheckin: 0,   refundPercent: 0   },
    ],
  },
  {
    code: 'strict',
    name: 'Estricta',
    description: 'Reembolso 50% hasta 14 días antes, 0% después',
    tiers: [
      { hoursBeforeCheckin: 336, refundPercent: 50 },
      { hoursBeforeCheckin: 0,   refundPercent: 0  },
    ],
  },
  {
    code: 'non_refundable',
    name: 'No reembolsable',
    description: 'Sin reembolso — precio descontado',
    tiers: [
      { hoursBeforeCheckin: 0, refundPercent: 0 },
    ],
  },
]

export const DEPOSIT_TEMPLATES = [
  { code: 'none',          name: 'Sin depósito',         percentUpfront: 0,   refundable: true  },
  { code: 'partial_25',    name: 'Depósito 25%',         percentUpfront: 25,  refundable: true  },
  { code: 'partial_50',    name: 'Depósito 50%',         percentUpfront: 50,  refundable: true  },
  { code: 'full_prepay',   name: 'Pago completo upfront', percentUpfront: 100, refundable: true  },
  { code: 'guarantee_hold', name: 'Garantía con tarjeta (no cobro)', percentUpfront: 0, refundable: true },
]
```

Al activar property, wizard pre-llena las 4 cancel templates + 5 deposit templates. Customer escoge cuáles activar / marca default.

### 4.3 Service

```ts
// apps/api/src/policies/policies.service.ts
@Injectable()
export class PoliciesService {
  async createDefaultPolicies(propertyId: string, organizationId: string) {
    // Crea las 4 cancellation templates + 5 deposit templates para el property
    // Marca 'moderate' + 'partial_25' como defaults (industria standard)
  }

  async setDefaultCancellation(propertyId: string, policyId: string, actorId: string) {
    // Quita isDefault de todas + pone en la nueva. Atomic transaction.
  }

  async resolveForBooking(propertyId: string, roomTypeId?: string, ratePlanId?: string) {
    // Cascade: ratePlan > roomType > property default
    // (ratePlan + roomType policies en v1.2+)
  }
}
```

---

## 5. BE-PREP-3 — Zenix Activate Wizard MVP (1-1.5 sem)

### 5.1 4 etapas críticas (de las 8 documentadas en `docs/vision/13`)

#### Etapa 1: Datos básicos (existente, formalizar)

Fields:
- Property name
- Slug (auto-suggested editable)
- Description
- Address completa (street + city + state + countryCode + postal)
- Lat/long (auto-geocode desde address via Google Geocoding API o Mapbox)
- Public phone + email + website URL
- Timezone (default según countryCode)
- Default language + supported languages
- PropertyType (HOSTEL / HOTEL / BOUTIQUE / CABAÑAS / VACATION_RENTAL)

#### Etapa 4: Inventory (con templates)

Customer escoge template HOSTAL/BOUTIQUE/CABAÑAS/BUSINESS o "Custom".

Template auto-llena RoomTypes con:
- Nombres comunes ("Cuarto Privado", "Dorm Mixto 6 camas", "Suite Junior", etc.)
- maxOccupancy típica
- amenities baseline
- bedConfiguration sugerida

Customer puede editar inline, agregar más, borrar.

Después define Rooms (cuántos, números, piso, qué RoomType cada uno).

#### Etapa 6: Branding

- Logo upload (S3 via signed URL, max 2MB, png/jpg/svg)
- Color picker (default emerald-600 si no escoge)
- Cover image upload (max 5MB)
- Gallery upload (5-15 photos, drag-drop reordering)
- Auto-resize a thumbnails server-side via Sharp

#### Etapa 7: Booking policies

- Wizard pre-crea las 4 cancel templates + 5 deposit templates
- Customer marca cuáles ofrecer (default todas)
- Customer marca cuál es default (sugerido: Moderada + Depósito 25%)
- Custom: customer puede agregar policy custom inline

### 5.2 UX patterns

- **Save progress** — cada etapa se autoguarda en `PropertyOnboardingProgress` model
- **Skip optional** — solo Etapa 1 es obligatoria, resto skippable
- **Resume anytime** — wizard URL `/admin/onboarding?step=4` retoma donde quedó
- **Health checks** al final — antes de activar property, valida:
  - ¿Tiene al menos 1 RoomType?
  - ¿Tiene al menos 1 Room?
  - ¿Tiene cover image?
  - ¿Tiene >=3 photos en gallery?
  - ¿Tiene default cancellation policy?
  - ¿Tiene default deposit policy?
  - Si falla algo → wizard muestra warnings pero permite continuar con confirmación

### 5.3 Implementación frontend

```
apps/web/src/pages/OnboardingPage.tsx
├── StepProgress.tsx (sidebar con 4 etapas + checks)
├── steps/
│   ├── Step1BasicInfo.tsx
│   ├── Step4Inventory.tsx
│   │   ├── TemplatePicker.tsx
│   │   └── RoomTypeEditor.tsx
│   ├── Step6Branding.tsx
│   │   ├── LogoUploader.tsx
│   │   ├── ColorPicker.tsx
│   │   └── PhotoGalleryUploader.tsx
│   └── Step7Policies.tsx
│       └── PolicyTemplateSelector.tsx
└── HealthCheckSummary.tsx
```

State management: React Query + localStorage backup para resilience offline (recepcionista puede tardar días en juntar fotos).

---

## 6. BE-PREP-4 — Templates + Cloning (3 días)

### 6.1 4 templates de inventory

```ts
// apps/api/src/onboarding/inventory-templates.ts
export const INVENTORY_TEMPLATES: InventoryTemplate[] = [
  {
    code: 'HOSTAL',
    name: 'Hostal',
    description: 'Hostales urbanos con privados y dormitorios compartidos',
    roomTypes: [
      {
        name: 'Cuarto Privado',
        code: 'PVT_2',
        maxOccupancy: 2,
        bedConfiguration: '1 cama queen',
        amenities: ['wifi_free', 'private_bath', 'fan'],
        baseRate: 45.00,
      },
      {
        name: 'Dorm Mixto 6 camas',
        code: 'DORM_M_6',
        maxOccupancy: 6,
        bedConfiguration: '3 literas (6 camas individuales)',
        amenities: ['wifi_free', 'shared_bath', 'lockers', 'reading_light'],
        baseRate: 18.00,  // por cama
      },
      {
        name: 'Dorm Mujeres 4 camas',
        code: 'DORM_F_4',
        maxOccupancy: 4,
        bedConfiguration: '2 literas (4 camas individuales)',
        amenities: ['wifi_free', 'shared_bath_women_only', 'lockers'],
        baseRate: 22.00,
      },
    ],
    propertyAmenities: ['wifi_free', 'common_kitchen', 'lounge', '24h_reception'],
    defaultCheckIn: '14:00',
    defaultCheckOut: '11:00',
  },

  {
    code: 'BOUTIQUE',
    name: 'Hotel Boutique',
    description: 'Hoteles boutique 10-50 cuartos con servicio personalizado',
    roomTypes: [
      {
        name: 'Estándar',
        code: 'STD',
        maxOccupancy: 2,
        bedConfiguration: '1 cama king o 2 camas queen',
        amenities: ['wifi_free', 'ac', 'tv', 'minibar', 'safe', 'hairdryer'],
        baseRate: 120.00,
      },
      {
        name: 'Suite Junior',
        code: 'SUITE_JR',
        maxOccupancy: 3,
        bedConfiguration: '1 king + 1 sofa cama',
        sizeM2: 40,
        amenities: ['wifi_free', 'ac', 'tv', 'minibar', 'safe', 'balcony', 'coffee_maker'],
        baseRate: 220.00,
      },
      {
        name: 'Suite Master',
        code: 'SUITE_M',
        maxOccupancy: 4,
        bedConfiguration: '1 king + 2 individuales',
        sizeM2: 65,
        amenities: ['wifi_free', 'ac', 'tv', 'minibar', 'safe', 'balcony', 'jacuzzi', 'living_room'],
        baseRate: 450.00,
      },
    ],
    propertyAmenities: ['wifi_free', 'pool_outdoor', 'breakfast_included', 'concierge', 'spa', 'restaurant', 'bar'],
    defaultCheckIn: '15:00',
    defaultCheckOut: '12:00',
  },

  {
    code: 'CABANAS',
    name: 'Cabañas / Eco-lodge',
    description: 'Propiedades con cabañas independientes, target eco-tourism',
    roomTypes: [
      {
        name: 'Cabaña Estándar',
        code: 'CAB_STD',
        maxOccupancy: 2,
        bedConfiguration: '1 cama queen',
        sizeM2: 30,
        amenities: ['wifi_free', 'fan', 'private_bath', 'porch'],
        baseRate: 180.00,
      },
      {
        name: 'Cabaña Familiar',
        code: 'CAB_FAM',
        maxOccupancy: 4,
        bedConfiguration: '1 king + 2 individuales',
        sizeM2: 50,
        amenities: ['wifi_free', 'fan', 'private_bath', 'porch', 'kitchenette'],
        baseRate: 280.00,
      },
    ],
    propertyAmenities: ['wifi_partial', 'pool_natural', 'restaurant', 'tours', 'parking_free'],
    defaultCheckIn: '15:00',
    defaultCheckOut: '11:00',
  },

  {
    code: 'BUSINESS',
    name: 'Hotel Business',
    description: 'Hoteles corporativos urbanos 30-150 cuartos',
    roomTypes: [
      { name: 'Single Standard', code: 'SGL_STD', maxOccupancy: 1, bedConfiguration: '1 cama matrimonial', amenities: ['wifi_free', 'ac', 'tv', 'desk', 'safe', 'iron'], baseRate: 90.00 },
      { name: 'Double Standard', code: 'DBL_STD', maxOccupancy: 2, bedConfiguration: '1 king o 2 queens', amenities: ['wifi_free', 'ac', 'tv', 'desk', 'safe', 'iron'], baseRate: 110.00 },
      { name: 'Twin Standard', code: 'TWN_STD', maxOccupancy: 2, bedConfiguration: '2 camas individuales', amenities: ['wifi_free', 'ac', 'tv', 'desk', 'safe', 'iron'], baseRate: 110.00 },
      { name: 'Executive Suite', code: 'EXEC_SUITE', maxOccupancy: 2, bedConfiguration: '1 king + sala', sizeM2: 45, amenities: ['wifi_free', 'ac', 'tv', 'desk', 'safe', 'iron', 'minibar', 'coffee_maker', 'living_room'], baseRate: 250.00 },
    ],
    propertyAmenities: ['wifi_free', 'gym', 'business_center', 'breakfast_included', 'parking_paid', 'restaurant', 'meeting_rooms'],
    defaultCheckIn: '15:00',
    defaultCheckOut: '12:00',
  },
]
```

### 6.2 Cloning between properties

```ts
// apps/api/src/properties/properties.service.ts
async cloneProperty(sourcePropertyId: string, newPropertyData: { name, slug }, actorId: string) {
  // Clona TODA la config:
  //  - RoomTypes (mismo nombre + code, ratea reseteados)
  //  - Amenities
  //  - Cancellation + Deposit policies
  //  - Branding (logo, color)
  //  - Settings de operación
  // NO clona:
  //  - GuestStays / reservas
  //  - Staff (cada property tiene su equipo)
  //  - Photos (deben ser per-property)
}
```

Endpoint: `POST /v1/properties/:id/clone` con `{ newName, newSlug }`.

UX: en wizard Etapa 1, si org tiene >1 property, mostrar opción "Clonar config de [property existente]" como atajo.

### 6.3 Amenities catalog

```ts
// apps/api/src/shared/amenities-catalog.ts
// Catálogo normalizado de amenities — alineado con Google Hotel Ads + Booking.com taxonomy
export const AMENITIES_CATALOG = {
  // Conectividad
  wifi_free: { label: { es: 'Wi-Fi gratis', en: 'Free Wi-Fi' }, icon: 'wifi' },
  wifi_paid: { label: { es: 'Wi-Fi de pago', en: 'Paid Wi-Fi' }, icon: 'wifi' },

  // Estacionamiento
  parking_free: { label: { es: 'Estacionamiento gratis', en: 'Free parking' }, icon: 'parking' },
  parking_paid: { label: { es: 'Estacionamiento de pago', en: 'Paid parking' }, icon: 'parking' },
  parking_valet: { label: { es: 'Valet parking', en: 'Valet parking' }, icon: 'parking' },

  // Recreación
  pool_outdoor: { label: { es: 'Alberca exterior', en: 'Outdoor pool' }, icon: 'pool' },
  pool_indoor: { label: { es: 'Alberca cubierta', en: 'Indoor pool' }, icon: 'pool' },
  spa: { label: { es: 'Spa', en: 'Spa' }, icon: 'spa' },
  gym: { label: { es: 'Gimnasio', en: 'Gym' }, icon: 'gym' },
  beach_access: { label: { es: 'Acceso a playa', en: 'Beach access' }, icon: 'beach' },

  // Servicios
  breakfast_included: { label: { es: 'Desayuno incluido', en: 'Breakfast included' }, icon: 'restaurant' },
  restaurant: { label: { es: 'Restaurante', en: 'Restaurant' }, icon: 'restaurant' },
  bar: { label: { es: 'Bar', en: 'Bar' }, icon: 'bar' },
  room_service: { label: { es: 'Room service', en: 'Room service' }, icon: 'room_service' },
  concierge: { label: { es: 'Concierge', en: 'Concierge' }, icon: 'concierge' },

  // Familias / mascotas
  family_friendly: { label: { es: 'Familias', en: 'Family-friendly' }, icon: 'family' },
  pet_friendly: { label: { es: 'Mascotas', en: 'Pet-friendly' }, icon: 'pet' },
  kids_club: { label: { es: 'Club infantil', en: 'Kids club' }, icon: 'kids' },

  // Accesibilidad
  accessibility_wheelchair: { label: { es: 'Accesible silla de ruedas', en: 'Wheelchair accessible' }, icon: 'accessibility' },
  accessibility_elevator: { label: { es: 'Elevador', en: 'Elevator' }, icon: 'elevator' },

  // ... 30-50 más cubriendo Google Hotel Ads spec
}
```

---

## 7. Migración de datos existentes

### Seed update — properties existentes

```ts
// apps/api/prisma/seed.ts — extend existing seed
async function seedPropertyEnrichment() {
  await prisma.property.update({
    where: { id: 'prop-hotel-tulum-001' },
    data: {
      slug: 'hotel-tulum',
      description: 'Hotel boutique frente al mar Caribe en Tulum, México. 15 habitaciones con vista privilegiada.',
      street: 'Carretera Tulum-Boca Paila Km 7',
      postalCode: '77780',
      stateRegion: 'Quintana Roo',
      countryCode: 'MX',
      latitude: 20.1581,
      longitude: -87.4584,
      publicPhone: '+52 984 871 2000',
      publicEmail: 'reservas@hotelmonica.mx',
      websiteUrl: 'https://hotelmonica.mx',
      coverImageUrl: 'https://cdn.zenix.com/seed/tulum-hero.jpg',
      photos: [
        'https://cdn.zenix.com/seed/tulum-1.jpg',
        'https://cdn.zenix.com/seed/tulum-2.jpg',
        // ... 8 more
      ],
      amenities: ['wifi_free', 'pool_outdoor', 'beach_access', 'restaurant', 'breakfast_included'],
      brandColor: '#0E7C7B',
      logoUrl: 'https://cdn.zenix.com/seed/tulum-logo.svg',
    },
  })

  // Idem para Cancún property
}
```

### Health checks post-deploy

```sql
-- ¿Hay properties activas sin slug?
SELECT id, name FROM properties WHERE is_active = TRUE AND slug IS NULL;

-- ¿Hay properties sin cover image?
SELECT id, name FROM properties WHERE is_active = TRUE AND cover_image_url IS NULL;

-- ¿Hay properties sin cancellation policy default?
SELECT p.id, p.name FROM properties p
LEFT JOIN cancellation_policies cp ON cp.property_id = p.id AND cp.is_default = TRUE
WHERE p.is_active = TRUE AND cp.id IS NULL;
```

Si query devuelve >0 → property está activa pero incomplete → no funcionará en Booking Engine.

---

## 8. Test coverage

### Unit tests

- `properties.service.spec.ts`:
  - `updatePublicProfile` valida slug uniqueness
  - `cloneProperty` clona correcto + skip campos correctos
  - Slug regex acepta `hotel-tulum`, rechaza `Hotel Tulum!`
- `policies.service.spec.ts`:
  - `createDefaultPolicies` crea 9 policies (4 cancel + 5 deposit)
  - `setDefaultCancellation` atomic (no deja >1 default)
  - `resolveForBooking` cascade roomType > property

### Integration tests

- Endpoint `PATCH /properties/:id/public-profile`:
  - 200 con datos válidos
  - 400 con slug inválido
  - 409 con slug duplicado en otra property
  - 403 si actor sin SUPERVISOR role
- Endpoint `POST /properties/:id/clone`:
  - Clona policies + roomtypes + branding
  - NO clona stays / staff
  - Slug nuevo único

### Frontend tests

- Wizard E2E (Playwright o similar):
  - Completar las 4 etapas sin errores
  - Save & resume entre etapas
  - Health check final marca property como activable
  - Health check con fields faltantes warns pero permite skip

---

## 9. Riesgos + mitigaciones

| # | Riesgo | Probabilidad | Mitigación |
|---|--------|--------------|------------|
| R1 | Slug collision con properties existentes en cliente prod | 🟡 | Backfill verifica + agrega suffix numérico si conflict |
| R2 | Lat/long auto-geocode falla para ubicaciones rurales | 🟠 | Permitir input manual + Google Maps embed con pin draggable |
| R3 | Photo storage costos (S3 + CDN) | 🟡 | Sharp resize server-side a 5 sizes (thumb/sm/md/lg/orig) → CDN compression Brotli |
| R4 | Wizard tarda demasiado → abandono | 🟠 | Save progress + skip optional + resume |
| R5 | Logo upload sin validation → ataques SSRF | 🔴 | Signed S3 URLs solo (no fetch from URL backend-side) |
| R6 | Cancellation policy compleja (Brazil legal mínimo 7d) | 🟡 | Templates pre-built + override custom |
| R7 | Hoteles sin fotos profesionales | 🟠 | Placeholder default + AI image generation opcional (v1.1+) |

---

## 10. Definition of Done

Sprint BE-PREP cerrado cuando:

- [ ] Schema migration aplicada en seed + verified en `npx prisma migrate dev`
- [ ] Property model + RoomType model con todos los nuevos campos
- [ ] CancellationPolicy + DepositPolicy models + seed templates
- [ ] Endpoint `PATCH /properties/:id/public-profile` funcional + audit log
- [ ] Endpoint `POST /properties/:id/clone` funcional
- [ ] Wizard MVP 4 etapas frontend funcional con save+resume
- [ ] Amenities catalog seeded
- [ ] 4 inventory templates seeded (HOSTAL/BOUTIQUE/CABAÑAS/BUSINESS)
- [ ] Health checks pre-activation implementados
- [ ] Seed actualizado para properties existentes (Tulum + Cancún)
- [ ] Tests unit + integration verdes
- [ ] CLAUDE.md actualizada con §128 documentando el sprint
- [ ] Docs `docs/vision/13` marcadas como "Implemented MVP"

---

## 11. Habilita estos features post-BE-PREP

| Feature | Sprint | Dependency en BE-PREP |
|---------|--------|----------------------|
| Booking Engine Fase 1 | Próximo (5-6 sem) | 100% — bloqueante |
| Google Hotel Ads integration | v1.2+ (3-4 sem) | 100% — schema spec compatible |
| Meta Booking Partner | v1.3+ (3-4 sem) | 100% |
| TripAdvisor Express | v1.3+ (3-4 sem) | 100% |
| Email templates con branding | v1.0.4 (1 sem) | 80% — usa branding + photos |
| Reportes multi-property con metadata | v1.0.3 REPORTS | 50% — usa names + addresses |
| Public property pages SEO | Fase 1D del BE | 100% |
| WhatsApp confirmation con foto | v1.1 marketing | 50% — usa photos |
| Property comparison page (cadenas) | v1.4 chain features | 100% |

**ROI total:** 2-3 semanas de trabajo habilita **9 features** del roadmap.

---

## 12. Schedule sugerido (granular)

| Semana | Días | Tareas |
|--------|------|--------|
| **W1** | Día 1-2 | Schema migration Property + RoomType. Validators. |
|  | Día 3 | Seed update properties existentes. Migration tests. |
|  | Día 4-5 | Endpoint update public-profile + audit + tests |
| **W2** | Día 1-2 | Cancellation + Deposit policy models + seed templates |
|  | Día 3 | Endpoints policies CRUD + tests |
|  | Día 4-5 | Inventory templates + amenities catalog + cloning service |
| **W3** | Día 1-3 | Wizard frontend Step 1 + Step 4 (BasicInfo + Inventory) |
|  | Día 4-5 | Wizard Step 6 + Step 7 (Branding + Policies) |
|  | Día 6-7 | Health checks + activation flow + E2E tests + docs |

Total: **15 working days = 3 semanas calendar**.

---

## Sources (research consultado)

- [Cloudbeds onboarding patterns](https://www.cloudbeds.com/property-management-system/)
- [eviivo self-serve onboarding](https://eviivo.com/)
- [Multi-tenant SaaS provisioning patterns 2026](https://techexactly.com/blogs/multi-tenant-saas-applications)
- [Google Hotel Ads property data spec](https://developers.google.com/hotels)
- [Meta Booking Partner integration docs](https://developers.facebook.com/docs/marketing-api/business-asset-management)
- [STAAH booking engine fields mínimos](https://www.staah.com/booking-engine/)
- Internal: `docs/vision/13-consultant-setup-wizard.md` (diseño documentado del wizard)
- Internal: `CLAUDE.md` §63-§80 (multi-tenant architecture decisions)
