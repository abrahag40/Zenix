---
Audiencia: Equipo de desarrollo Zenix · Product owner · Asesoría comercial
Estado: Plan propuesto — pendiente de aprobación
Branch: sprint/rates-metrics-compset-core (planning solo; implementación en branch posterior)
Última actualización: 2026-05-22
Sprint anterior: BITACORA-UNIFICATION + plan SIGN-DLC (PR #38, merged 2026-05-22)
Disparador: necesidad operativa real del piloto Hotel Monica Tulum — pricing manual sin tarifas dinámicas, sin métricas de performance, sin visibilidad de mercado competitivo. Bloqueante para escalar a más propiedades.
---

# Sprint RATES-METRICS-COMPSET-CORE — Pricing + Dashboard de métricas + Inteligencia de mercado

> **Misión del sprint**: dotar a Zenix de las tres capas que un manager boutique-LATAM necesita para gestionar su revenue: (1) **Rates** flexibles con seasons + day-of-week + plans + restrictions + 1 promo engine; (2) **Métricas** del estado del negocio (ocupación, ADR, RevPAR, pickup, channel mix, OTB) accesibles en dashboard; (3) **Compset** card con análisis de 3-7 competidores manualmente seleccionados + heatmap de demanda + eventos locales LATAM. Adapter pattern abierto al swap MVP→Lighthouse en v1.1.x DLC.

---

## 1. Contexto y motivación

### 1.1 El gap operativo documentado

| Dimensión | Estado v1.0.0 | Pain real |
|---|---|---|
| **Pricing** | Solo `RoomTypeGroup.baseRate` único por grupo. No hay seasons, no day-of-week, no rate plans, no restrictions. | Manager Monica Tulum: "Cabaña vale $130 USD todo el año, ¡eso no tiene sentido!". Fin de semana Año Nuevo perdiendo ~30% de revenue por no poder subir tarifa. |
| **Métricas** | KPIs operativos parciales en DashboardPage (§43). Sin ADR, sin RevPAR, sin forecast, sin pickup, sin channel mix. | "¿Cómo voy esta semana?" requiere correr SQL ad-hoc. |
| **Compset / Market Intel** | Cero visibilidad de competidores. Manager check Booking.com manualmente. | "Subí mi tarifa pero estoy 30% por debajo de Habitas y no lo sabía." |

### 1.2 Decisiones del owner (consolidadas 2026-05-22)

1. **Opción B'** confirmada (rates + metrics-lite + compset card MVP).
2. **Opción C'** (advanced metrics: pace YoY + revenue by room type + LRV engine + export reports) → diferido a v1.0.3 REPORTS-CORE.
3. **Compset MVP**: scraping DIY ahora con arquitectura adapter para swap a Lighthouse en v1.1.x DLC.
4. **Eventos locales**: arquitectura replicable cualquier ubicación (no QR-hardcoded). Seed inicial MX + LATAM. Curator role para mantener.
5. **Demand intelligence con APIs de vuelos**: documentado en sprint aparte ([DEMAND-INTELLIGENCE-plan.md](DEMAND-INTELLIGENCE-plan.md)) — 5-8 semanas dedicadas, va post-v1.0.x.
6. **Compset visibility**: SUPERVISOR + ORG_ADMIN solamente.

### 1.3 Why "rates + metrics + compset" como un solo sprint

Las tres capas comparten:
- Schema overlap (RateSeason consume DailyMetricsSnapshot para reportar precio×ocupación).
- Dashboard real estate (las 3 viven en el mismo dashboard adaptive).
- Mental model del usuario ("¿cuánto cobrar, qué tan bien voy, cómo está el mercado?" es una sola pregunta).

Separar en 3 sprints obligaría a context-switching del dev y duplicaría test setup.

---

## 2. Investigación de mercado — qué hacen los competidores

### 2.1 Benchmark de Rates Management

| PMS | Rate Plans | Seasons | Day-of-week | Restrictions | Bulk update UI |
|---|---|---|---|---|---|
| **Mews** | ✅ multi-plan | ✅ | ✅ | ✅ MLOS/CTA/CTD | ✅ Grid Rate Calendar |
| **Cloudbeds** | ✅ multi-plan | ✅ | ✅ | ✅ MLOS | ✅ |
| **Opera Cloud** | ✅ enterprise | ✅ | ✅ | ✅ full | ✅ |
| **RoomRaccoon** | ✅ básico | ✅ | ⚠️ limitado | ⚠️ solo MLOS | ✅ |
| **Little Hotelier** | ⚠️ 1 plan default | ✅ | ❌ | ❌ | ⚠️ básico |
| **Zenix v1.0.0** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Zenix post-sprint** | ✅ multi-plan + 1 promo | ✅ | ✅ | ✅ MLOS/MaxLOS/CTA/CTD | ✅ Rate Calendar grid |

### 2.2 Benchmark de Métricas Dashboard

Encuesta de uso real (mezclas reviews G2 + Capterra 2023-2024 + NN/g hospitality dashboard study 2022):

Top 5 métricas que los managers boutique reportan revisar **diariamente**:

1. Ocupación hoy % (100% de PMSs lo tienen como #1)
2. Llegadas / Salidas / In-house (100%)
3. ADR / RevPAR (Mews, Cloudbeds, Opera, RR — sí; Little Hotelier — no tiene RevPAR built-in, queja documentada)
4. Forecast ocupación próximos 14 días (Mews + Cloudbeds — sí; Opera y RR — parcial)
5. Saldo pendiente operativo (Zenix ya lo cubre con OverstayedWidget §128)

### 2.3 Benchmark de Compset / Market Intelligence

| PMS | Built-in compset | Data source | Pricing |
|---|---|---|---|
| **Mews "Compset"** | ✅ add-on | OTA Insight partnership | ~$50/property/mes |
| **Cloudbeds Insights** | ✅ tier Pro | Propio + OTA Insight híbrido | Bundled tier Pro |
| **SiteMinder Insights** | ✅ | Propio scraping | Bundled con channel manager |
| **Opera Cloud** | ⚠️ integración externa | OTA Insight, RateGain | Enterprise contract |
| **RoomRaccoon "RaccoonRev"** | ✅ básico | Propio + RateGain | Bundled tier mid |
| **Little Hotelier** | ❌ | — | — (gap conocido) |
| **Zenix post-sprint MVP** | ✅ Card básico | Scraping DIY (Playwright) | Bundled v1.0.x |
| **Zenix v1.1.x DLC** | ✅ Pro | Lighthouse partnership | $50-80/property/mes |

---

## 3. Decisiones no-negociables (candidatas a CLAUDE.md §)

### Bloque RATES

#### D-RATES1: Rate Plan es entidad de primera clase, NO atributo

`RatePlan { code, name, baseStrategy: BAR|FIXED|MULTIPLIER, cancellationPolicy, inclusions[] }`. Cada `StaySegment` referencia exactamente 1 `ratePlanId`. Cambios de plan post-checkin generan `RateAdjustment` (§28 PaymentLog-append-only analog).

#### D-RATES2: Resolución de tarifa con precedence explícita

```
resolvePrice(roomTypeId, date, ratePlanId) =
  1. RateOverride.exactDateMatch (manual override per fecha)
  2. RateSeason.matches(date) × RatePlan.multiplier × DayOfWeekRule
  3. RatePlan.baseRate (fallback)
  4. RoomTypeGroup.baseRate (último fallback)
```

Trazable: `RatePriceComputation` audit log opcional capturando capa que ganó.

#### D-RATES3: Seasons no se solapan en mismo `roomTypeId × ratePlanId`

Constraint en DB + validation pre-save. Si admin intenta overlap, error friendly con sugerencia de fechas alternativas.

#### D-RATES4: Restrictions son additive

`RateRestriction { mlos, maxLos, cta, ctd, validFrom, validTo }`. Aplica a `RatePlan` o a `RoomType`. Si ambas restricciones aplican, gana la más restrictiva (MLOS más alto). Audit log captura cuál ganó.

#### D-RATES5: Promotion engine es opt-in per `RatePlan`

`Promotion { code, discount%, conditions: { minLOS?, advancePurchaseDays?, validFrom, validTo, maxRedemptions? } }`. Aplica al rate base ANTES de impuestos. No descuenta impuestos federales (§82).

#### D-RATES6: Bulk update UI con preview obligatorio

Antes de aplicar cambio a N días, modal con diff side-by-side: "Estás cambiando 47 noches del 15 dic - 31 ene. Tarifa promedio cabaña actual: $130. Nueva: $230. Continuar?". Forcing function NN/g H5.

### Bloque METRICS

#### D-METRICS1: `MetricsDailySnapshot` poblado por NightAuditScheduler

Análogo a §13 `noShowProcessedDate` idempotency. Cada propiedad genera 1 row/día al cierre con: occupancy %, ADR, RevPAR, revenue total, channel mix, cancellations, no-shows, LOS avg, lead time avg. Backfill helper para data antigua.

#### D-METRICS2: Métricas de "hoy" se calculan en tiempo real

Ocupación, llegadas, salidas, in-house, saldo pendiente → query directo a DB en cada render del dashboard. Cache 60s + SSE invalidation en eventos `stay.*`.

#### D-METRICS3: Métricas de "ayer + atrás" salen del snapshot

ADR, RevPAR, channel mix, etc. → query a `MetricsDailySnapshot`. <100ms para queries de 12 meses con índice.

#### D-METRICS4: Forecast 14 días es OTB count + capacidad

`forecastOccupancy(date) = COUNT(GuestStay WHERE checkIn ≤ date < scheduledCheckout) / totalRooms`. Cache 5min + SSE invalidation.

#### D-METRICS5: YoY pace requiere ≥365 días de historia

Guard: si `min(createdAt) > today - 365 days`, mostrar placeholder "Necesita 1 año de historia para esta métrica". No simular con datos sintéticos.

#### D-METRICS6: Dashboard adaptive (§43 aplicado)

3 capas:
- **Glanceable** (siempre visible): 4 big numbers HOY + heatmap 14 días.
- **Operacional** (siempre visible): llegadas/salidas/in-house lists.
- **Estratégico** (colapsable): ADR/RevPAR/pickup/channel mix/LOS/cancellation/no-show rate.

Bloques rotan según hora del día y rol del usuario.

### Bloque COMPSET

#### D-COMPSET1: Adapter pattern para data source

`ICompsetAdapter` con implementaciones `ScraperDiyCompsetAdapter` (MVP) y `LighthouseCompsetAdapter` (v1.1.x). Selección per LegalEntity via `LegalEntity.compsetProvider`. Swap sin cambio de código de runtime.

#### D-COMPSET2: Manager elige compset manual, 3-7 hoteles

No auto-radius en MVP. UI Settings → "Tu compset" → search por nombre hotel (resolve via Google Places API o Booking Affiliate) → pin a la lista. Razón: boutique compite por posicionamiento, no por proximidad.

#### D-COMPSET3: Refresh diario máximo

Cron `0 4 * * *` timezone-local. Scrape ligero (solo los 3-7 hoteles seleccionados, no la ciudad entera). Rate limit < 1 req/min/hotel. Fail-soft: si falla 1 hotel, los demás continúan.

#### D-COMPSET4: Snapshot inmutable per día per competidor

`CompsetSnapshot { propertyId, competitorId, scrapedAt, ratesByDate: Json, ratingSnapshot, source }`. Append-only. Histórico permite análisis trend.

#### D-COMPSET5: Anti-bot mitigation explícita

User-agent declarado `Zenix-Compset-Bot/1.0 (contact: ...)`. Robots.txt respect. Rate limit estricto. No rotating proxies "evasivos" en MVP — riesgo legal mayor que beneficio.

#### D-COMPSET6: Visibility RBAC strict

SUPERVISOR + ORG_ADMIN solamente. RECEPTIONIST + HOUSEKEEPER nunca ven precios de competidores. Sensible para negociaciones internas + acceso staff temporal.

#### D-COMPSET7: Disclaimer permanente en UI

Card siempre muestra "Datos best-effort, refresh diario. Precios públicos. Última actualización: hace Xh." NN/g H1 visibility of system status.

#### D-COMPSET8: Eventos locales replicables per ubicación

`LocalEvent` con scope 4-niveles (countryCode → regionCode → city → lat/lng radius). Seed inicial MX + LATAM (~50-100 eventos). NO hardcoded Quintana Roo. Resolution service findEventsForProperty(propertyId, dateRange) maneja todos los casos.

#### D-COMPSET9: Events Curator rol interno

Análogo Tax Curator (§91). Equipo ZaharDev mantiene catálogo base. Cliente NO edita eventos del catálogo; puede agregar `LocalEventOverride` con `reason` + `approvedById` (analog §92).

#### D-COMPSET10: Phase 2 ingest automático (deferido a v1.1.x DLC)

Eventbrite + Songkick + Ticketmaster APIs. `source=EVENTBRITE | SONGKICK | TICKETMASTER` con `verifiedAt=null` hasta que curator apruebe. MVP solo `source=MANUAL`.

---

## 4. Schema changes (Prisma)

### 4.1 Rates

```prisma
model RatePlan {
  id              String   @id @default(uuid())
  propertyId      String   @map("property_id")
  code            String   // "BAR", "BAR_NONREF", "ADVANCE_15D", "CORP_ACME"
  name            String
  baseStrategy    String   @default("BAR")  // BAR | FIXED | MULTIPLIER
  baseRate        Decimal? @db.Decimal(10, 2)  // si baseStrategy=FIXED
  baseMultiplier  Decimal? @db.Decimal(4, 3)   // si baseStrategy=MULTIPLIER de BAR

  cancellationPolicy String @default("FLEXIBLE")  // FLEXIBLE | NONREF | ADVANCE_PURCHASE
  inclusions      Json?     // [{ code: 'BREAKFAST', label: 'Desayuno incluido', costImpact: 15.00 }]

  isActive        Boolean  @default(true)
  visibleToChannels String[] @default(["ALL"])  // ALL | DIRECT | OTA-codes

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  property        Property         @relation(fields: [propertyId], references: [id])
  seasons         RateSeason[]
  restrictions    RateRestriction[]
  promotions      Promotion[]

  @@unique([propertyId, code])
  @@index([propertyId, isActive])
  @@map("rate_plans")
}

model RateSeason {
  id              String   @id @default(uuid())
  ratePlanId      String   @map("rate_plan_id")
  roomTypeId      String?  @map("room_type_id")  // null = aplica a todos los room types del plan
  name            String   // "Temporada Alta Diciembre"
  startDate       DateTime
  endDate         DateTime

  // Rate override OR multiplier
  overrideRate    Decimal? @db.Decimal(10, 2)
  multiplier      Decimal? @db.Decimal(4, 3)   // sobre baseRate del plan

  createdAt       DateTime @default(now())

  ratePlan        RatePlan @relation(fields: [ratePlanId], references: [id])
  roomType        RoomType? @relation(fields: [roomTypeId], references: [id])

  @@index([ratePlanId, startDate, endDate])
  @@map("rate_seasons")
}

model DayOfWeekRule {
  id              String   @id @default(uuid())
  ratePlanId      String   @map("rate_plan_id")
  dayOfWeek       Int      // 0=Sun, 1=Mon, ..., 6=Sat
  multiplier      Decimal  @db.Decimal(4, 3)

  @@unique([ratePlanId, dayOfWeek])
  @@map("day_of_week_rules")
}

model RateRestriction {
  id              String   @id @default(uuid())
  ratePlanId      String?  @map("rate_plan_id")
  roomTypeId      String?  @map("room_type_id")
  validFrom       DateTime
  validTo         DateTime

  mlos            Int?     // Minimum length of stay
  maxLos          Int?     // Maximum length of stay
  cta             Boolean  @default(false)  // Closed to arrival
  ctd             Boolean  @default(false)  // Closed to departure

  createdAt       DateTime @default(now())

  @@index([ratePlanId, validFrom, validTo])
  @@index([roomTypeId, validFrom, validTo])
  @@map("rate_restrictions")
}

model Promotion {
  id              String   @id @default(uuid())
  propertyId      String   @map("property_id")
  ratePlanId      String?  @map("rate_plan_id")
  code            String   // "EARLYBIRD15"
  name            String
  discountType    String   // PERCENT | FIXED
  discountValue   Decimal  @db.Decimal(10, 2)

  // Conditions
  minLOS          Int?
  advancePurchaseDays Int?
  validFrom       DateTime
  validTo         DateTime
  maxRedemptions  Int?
  currentRedemptions Int @default(0)

  isActive        Boolean  @default(true)

  createdAt       DateTime @default(now())

  ratePlan        RatePlan? @relation(fields: [ratePlanId], references: [id])

  @@unique([propertyId, code])
  @@index([propertyId, isActive])
  @@map("promotions")
}

model RateOverride {
  id              String   @id @default(uuid())
  propertyId      String   @map("property_id")
  roomTypeId      String   @map("room_type_id")
  ratePlanId      String?  @map("rate_plan_id")
  date            DateTime
  overrideRate    Decimal  @db.Decimal(10, 2)
  reason          String?
  createdById     String   @map("created_by_id")
  createdAt       DateTime @default(now())

  @@unique([propertyId, roomTypeId, ratePlanId, date])
  @@index([propertyId, date])
  @@map("rate_overrides")
}
```

### 4.2 Metrics

```prisma
model MetricsDailySnapshot {
  id                  String   @id @default(uuid())
  propertyId          String   @map("property_id")
  date                DateTime // UTC date del día snapshotted (midnight)
  computedAt          DateTime @default(now())

  // Capacity
  totalRoomsAvailable Int      @map("total_rooms_available")
  roomsSold           Int      @map("rooms_sold")
  occupancyPercent    Decimal  @db.Decimal(5, 2) @map("occupancy_percent")

  // Revenue
  roomRevenue         Decimal  @db.Decimal(12, 2) @map("room_revenue")
  baseCurrency        String   @map("base_currency")
  adr                 Decimal  @db.Decimal(10, 2)
  revpar              Decimal  @db.Decimal(10, 2)

  // Performance
  cancellationsCount  Int      @default(0) @map("cancellations_count")
  noShowsCount        Int      @default(0) @map("no_shows_count")
  arrivalsCount       Int      @default(0) @map("arrivals_count")
  departuresCount     Int      @default(0) @map("departures_count")

  // Aggregated stays-this-day stats
  avgLengthOfStay     Decimal? @db.Decimal(4, 2) @map("avg_length_of_stay")
  avgLeadTime         Decimal? @db.Decimal(5, 2) @map("avg_lead_time")

  // Channel mix (snapshot del día)
  channelMix          Json     // { DIRECT: 3, BOOKING: 5, EXPEDIA: 2 }

  // Per room type
  revenueByRoomType   Json?    // { roomTypeId: { rooms: N, revenue: $ } }

  property            Property @relation(fields: [propertyId], references: [id])

  @@unique([propertyId, date])
  @@index([propertyId, date(sort: Desc)])
  @@map("metrics_daily_snapshots")
}
```

### 4.3 Compset + Local Events

```prisma
model Competitor {
  id              String   @id @default(uuid())
  propertyId      String   @map("property_id")   // El hotel cliente que define este competitor
  name            String

  // Resolución externa
  externalId      String?  @map("external_id")    // Booking ID, Expedia ID, Google Place ID
  externalSource  String?  @map("external_source")  // BOOKING | EXPEDIA | GOOGLE_PLACES
  externalUrl     String?  @map("external_url")

  // Geo
  latitude        Float
  longitude       Float
  address         String?

  // Metadata
  starRating      Decimal? @db.Decimal(2, 1) @map("star_rating")
  guestRating     Decimal? @db.Decimal(3, 2) @map("guest_rating")  // 0-10 scale Booking style
  reviewCount     Int?     @map("review_count")
  roomCount       Int?     @map("room_count")

  // Lifecycle
  isActive        Boolean  @default(true)
  addedById       String   @map("added_by_id")
  createdAt       DateTime @default(now())

  property        Property @relation(fields: [propertyId], references: [id])
  snapshots       CompsetSnapshot[]

  @@index([propertyId, isActive])
  @@map("competitors")
}

model CompsetSnapshot {
  id              String   @id @default(uuid())
  competitorId    String   @map("competitor_id")
  propertyId      String   @map("property_id")
  scrapedAt       DateTime @default(now()) @map("scraped_at")
  source          String   @default("SCRAPER_DIY")  // SCRAPER_DIY | LIGHTHOUSE | RATEGAIN

  // Rates by date (snapshot del día)
  ratesByDate     Json     // { "2026-05-25": { lowestRate: 130, currency: "USD", availability: true } }

  // Ratings snapshot
  ratingSnapshot  Json?    // { starRating, guestRating, reviewCount }

  // Audit
  durationMs      Int?     @map("duration_ms")    // tiempo del scrape
  warnings        String[] @default([])           // errores no-fatales

  competitor      Competitor @relation(fields: [competitorId], references: [id])

  @@index([competitorId, scrapedAt(sort: Desc)])
  @@index([propertyId, scrapedAt(sort: Desc)])
  @@map("compset_snapshots")
}

model LocalEvent {
  id              String   @id @default(uuid())
  name            String
  description     String?
  category        String   // FESTIVAL | CONFERENCE | HOLIDAY | SPORTS | CONCERT | RELIGIOUS | NATIONAL_HOLIDAY

  startDate       DateTime
  endDate         DateTime

  // Geo scoping — 4 niveles
  countryCode     String   @map("country_code")    // ISO 3166-1 alpha-2
  regionCode      String?  @map("region_code")     // ISO 3166-2
  city            String?
  latitude        Float?
  longitude       Float?
  radiusKm        Decimal? @db.Decimal(6, 2) @map("radius_km")

  // Demand impact
  demandImpact    String   @default("MEDIUM")  // LOW | MEDIUM | HIGH | EXTREME
  expectedAttendance Int?

  // Source + curation
  source          String   @default("MANUAL")  // MANUAL | EVENTBRITE | SONGKICK | TICKETMASTER
  sourceUrl       String?  @map("source_url")
  sourceExternalId String? @map("source_external_id")
  curatedById     String?  @map("curated_by_id")
  verifiedAt      DateTime? @map("verified_at")

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([countryCode, startDate])
  @@index([regionCode, startDate])
  @@index([city, startDate])
  @@map("local_events")
}

model LocalEventOverride {
  id              String   @id @default(uuid())
  propertyId      String   @map("property_id")
  baseEventId     String?  @map("base_event_id")   // null si es completamente custom
  // Overrides
  customName      String?  @map("custom_name")
  customDemandImpact String? @map("custom_demand_impact")
  disabled        Boolean  @default(false)         // ocultar este evento para esta property

  reason          String                            // obligatorio para audit
  approvedById    String   @map("approved_by_id")
  createdAt       DateTime @default(now())

  baseEvent       LocalEvent? @relation(fields: [baseEventId], references: [id])
  property        Property    @relation(fields: [propertyId], references: [id])

  @@index([propertyId])
  @@map("local_event_overrides")
}

// Modificaciones a modelos existentes:
model LegalEntity {
  // ... campos existentes ...
  compsetProvider String  @default("SCRAPER_DIY") @map("compset_provider")  // SCRAPER_DIY | LIGHTHOUSE | RATEGAIN
  compsetApiKey   String? @map("compset_api_key")
}
```

---

## 5. API endpoints

### 5.1 Rates management

```
GET    /v1/properties/:id/rate-plans                  → list
POST   /v1/properties/:id/rate-plans                  → create
PATCH  /v1/properties/:id/rate-plans/:planId          → update
DELETE /v1/properties/:id/rate-plans/:planId          → soft-delete (isActive=false)

GET    /v1/properties/:id/rate-seasons
POST   /v1/properties/:id/rate-seasons
PATCH  /v1/properties/:id/rate-seasons/:seasonId
DELETE /v1/properties/:id/rate-seasons/:seasonId

GET    /v1/properties/:id/rate-restrictions
POST   /v1/properties/:id/rate-restrictions
PATCH  /v1/properties/:id/rate-restrictions/:restId
DELETE /v1/properties/:id/rate-restrictions/:restId

GET    /v1/properties/:id/promotions
POST   /v1/properties/:id/promotions
PATCH  /v1/properties/:id/promotions/:promoId

POST   /v1/properties/:id/rate-overrides              → single date override
POST   /v1/properties/:id/rate-overrides/bulk         → bulk update (con preview obligatorio)
GET    /v1/properties/:id/rate-calendar?from&to       → grid RoomType × Date

GET    /v1/properties/:id/resolve-price?roomType&date&ratePlan → resolución con audit trail (debug)
```

### 5.2 Metrics

```
GET    /v1/properties/:id/dashboard-metrics            → glanceable + operacional combinados
GET    /v1/properties/:id/forecast-occupancy?days=14   → heatmap data
GET    /v1/properties/:id/metrics/range?from&to        → snapshots range para charts
GET    /v1/properties/:id/metrics/pickup?days=7        → pickup últimos N días
GET    /v1/properties/:id/metrics/channel-mix?from&to  → distribución por canal
GET    /v1/properties/:id/metrics/los-distribution     → distribución LOS últimos 30d
```

### 5.3 Compset + Events

```
GET    /v1/properties/:id/competitors                  → list manager-selected
POST   /v1/properties/:id/competitors                  → add (search + pin)
DELETE /v1/properties/:id/competitors/:cid             → remove
GET    /v1/properties/:id/competitors/search?q=&lat=&lng= → resolve via Google Places / Booking Affiliate

GET    /v1/properties/:id/compset/dashboard            → card data
GET    /v1/properties/:id/compset/heatmap?days=14      → posición percentil per día

GET    /v1/properties/:id/local-events?from&to         → eventos aplicables a esta property en ventana
POST   /v1/properties/:id/local-events/override        → custom override per-property
```

### 5.4 Internal admin (ZaharDev Tax/Events Curator)

```
GET    /v1/admin/local-events?country=&region=&city=
POST   /v1/admin/local-events
PATCH  /v1/admin/local-events/:id
POST   /v1/admin/local-events/:id/verify              → mark verifiedAt
```

---

## 6. Servicios

### 6.1 `RatesService`

```ts
class RatesService {
  resolvePrice(roomTypeId, date, ratePlanId): { rate, audit: ResolutionAudit[] }
  applyPromotion(rate, promoCode, stayContext): { finalRate, appliedPromo }
  validateRestrictions(stay): { allowed, violatedRules[] }
  bulkUpdateOverrides(propertyId, range, newRate, dryRun=false): { affectedDates, preview }
}
```

### 6.2 `MetricsService`

```ts
class MetricsService {
  getDashboardMetrics(propertyId): { glanceable, operational, strategic }
  getForecastOccupancy(propertyId, days): ForecastHeatmap
  getPickupReport(propertyId, lookbackDays): PickupData
  computeDailySnapshot(propertyId, date): MetricsDailySnapshot  // called by NightAuditScheduler
  backfillSnapshots(propertyId, fromDate): { rowsCreated }
}
```

### 6.3 `CompsetService` + Adapter

```ts
interface ICompsetAdapter { ... }

class ScraperDiyCompsetAdapter implements ICompsetAdapter {
  // Playwright pool, rate limiting, user-agent, error handling
}

class LighthouseCompsetAdapter implements ICompsetAdapter {  // v1.1.x DLC
  // OTA Insight Lighthouse REST API
}

class CompsetService {
  getAdapterForProperty(propertyId): ICompsetAdapter  // resuelve via LegalEntity.compsetProvider
  refreshSnapshots(propertyId): Promise<void>          // cron daily
  getDashboardCard(propertyId): CompsetCardData
  searchCompetitor(query, location): HotelSearchResult[]
}
```

### 6.4 `LocalEventsService`

```ts
class LocalEventsService {
  findEventsForProperty(propertyId, dateRange): LocalEvent[]
  // Resolución 4-niveles:
  //   1. Eventos con city match a property.city
  //   2. Eventos con regionCode match a property.region
  //   3. Eventos con countryCode match a property.country (sin regionCode/city)
  //   4. Eventos con lat/lng dentro de radiusKm de property
  // Aplica overrides per-property (disabled, customDemandImpact)

  resolvePropertyLocation(propertyId): { countryCode, regionCode, city, lat, lng }
}
```

---

## 7. UI flows

### 7.1 Settings → Rates Manager

Nueva sección `/settings/rates`:

- **Tab "Rate Plans"** — CRUD list de planes con badges (active/inactive)
- **Tab "Seasons"** — calendar visual con seasons coloreadas + drag-to-resize
- **Tab "Restrictions"** — table editable
- **Tab "Promotions"** — CRUD list
- **Tab "Rate Calendar"** — grid RoomType × Date con bulk-select + bulk-update modal

### 7.2 Dashboard rediseñado

```
┌─────────────────────────────────────────────────────────────┐
│ HOY · Hotel Monica Tulum                                     │
│                                                              │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│ │ Ocup.   │ │Llegadas │ │ Salidas │ │ Saldo   │            │
│ │  78%    │ │   4 ✓2  │ │   3 ✓1  │ │ $2,400  │            │
│ │ 14/18   │ │ pend 2  │ │ pend 2  │ │ pend.   │            │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘            │
│                                                              │
│ FORECAST 14 DÍAS                                             │
│ [Heatmap calendario · cells coloreadas por ocupación]      │
│                                                              │
│ ─────────── ESTA SEMANA ▾ (colapsable) ─────────────────    │
│ ADR: $145  RevPAR: $113  Pickup últimos 7d: 12 nuevas      │
│                                                              │
│ ─────────── COMPSET ▾ (SUPERVISOR+) ──────────────────────  │
│ Tu posición: P75  Mediana: $128  Pulse: 🔥 Alta            │
│ [Heatmap 14 días · posición percentil] [Eventos: Bahidorá] │
│                                                              │
│ ─────────── ESTE MES ▾ ───────────────────────────────────  │
│ Channel mix donut · LOS · Cancellation · No-show           │
│                                                              │
│ OverstayedWidget (existente)                                │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 Settings → Compset

`/settings/compset`:

- Lista de competidores actuales (3-7 max)
- Search bar para agregar nuevos
- Mapa con pins (compset + tu hotel)
- Botón "Sync ahora" para refresh manual (rate-limited)
- Disclaimer permanente

---

## 8. Plan de implementación (~20-23 días-dev)

### Día 1-3 — Schema + Rates backend

- Migration `20260601_add_rates_metrics_compset`
- Modelos RatePlan, RateSeason, DayOfWeekRule, RateRestriction, Promotion, RateOverride
- `RatesService` con `resolvePrice` + tests unit
- Seed: 2 rate plans default (BAR Flexible, BAR Non-Refundable) para piloto

### Día 4-6 — Rate plans/seasons/restrictions UI

- Settings tabs `/settings/rates` con CRUD
- Rate Calendar grid component (RoomType × Date)
- Bulk update modal con preview obligatorio

### Día 7-8 — Metrics schema + backend

- Modelo `MetricsDailySnapshot`
- `MetricsService` con `computeDailySnapshot` + `getDashboardMetrics`
- `NightAuditScheduler` extendido para popular snapshots
- Backfill helper para datos historic

### Día 9-10 — Dashboard rediseño

- Big numbers (4) con SSE invalidation
- Heatmap 14d component
- Sección "Esta semana" colapsable (ADR/RevPAR/Pickup)
- Sección "Este mes" colapsable (Channel mix donut/LOS/Cancellation)

### Día 11-13 — Compset MVP backend

- Modelos Competitor, CompsetSnapshot
- `ICompsetAdapter` interface + `ScraperDiyCompsetAdapter` con Playwright pool
- Cron `0 4 * * *` per timezone-property
- Google Places API integration para search

### Día 14-15 — Compset UI

- Settings tab `/settings/compset` con search + lista + mapa
- Dashboard card compset (SUPERVISOR+ gate)
- Heatmap posición percentil

### Día 16-17 — Local Events architecture

- Modelos LocalEvent, LocalEventOverride
- `LocalEventsService.findEventsForProperty`
- Seed inicial: ~50 eventos MX + ~20 LATAM (CO/PE/CR/AR)
- Admin UI básico para Events Curator (lista + create/edit)
- Events integration con compset card

### Día 18-19 — QA + tests E2E

- Tests integration `RatesService` (precedence rules)
- Tests `MetricsService` (snapshot + dashboard)
- Tests `CompsetService` con adapter mock
- Tests `LocalEventsService` con 4-niveles resolution
- Smoke test fixture Monica Tulum

### Día 20-23 — Polish + Docs

- ADR-0002: Adapter pattern compset (analog ADR-0001 PDF)
- Runbook compset operations (manejo de scrapes failing, anti-bot mitigation)
- CLAUDE.md decisiones D-RATES1..6, D-METRICS1..6, D-COMPSET1..10
- zenix-sales-master.md: Módulo 9 — Rates & Market Intelligence
- Estimación buffer para issues no previstos

**Total: ~20-23 días-dev (1 dev) o ~10-12 días calendar (2 devs paralelos backend/frontend).**

---

## 9. Lo que NO está en este sprint (out-of-scope explícito)

| Feature | Razón | Sprint propuesto |
|---|---|---|
| **Yield management ML / dynamic auto-pricing** | Boutique no lo necesita. Riesgo race-to-bottom. | v2.0 (si demanda enterprise) |
| **Lighthouse partnership integration** | Wholesale contract pending. Adapter pattern ya está listo para el swap. | v1.1.x DLC |
| **Eventbrite/Songkick/Ticketmaster ingest automático** | MVP solo MANUAL events. | v1.1.x DLC |
| **Demand intelligence con flight APIs** | Sprint dedicado 5-8 sem. | Ver [DEMAND-INTELLIGENCE-plan.md](DEMAND-INTELLIGENCE-plan.md) |
| **Pace YoY** | Necesita 12+ meses historia; piloto fresco. | v1.0.3 REPORTS-CORE |
| **Revenue by Room Type drill-down** | Nice-to-have, manager lo consulta mensualmente. | v1.0.3 REPORTS-CORE |
| **Last-Room Value rule engine** | Boutique no lo necesita. | v2.0 |
| **Export reportes CSV/PDF** | Diferido. | v1.0.3 REPORTS-CORE |
| **Auto-radius compset detection** | Manual mejor para boutique. | v1.1.x DLC |
| **Comparativa precios per cancellation policy** | Útil pero out-of-MVP. | v1.1.x DLC |
| **Multi-property compset aggregation** | Para cadenas. | v1.2.x |
| **Push notifications "competitor changed rate"** | Útil pero notif-fatigue risk. | v1.1.x DLC con config opcional |

---

## 10. Riesgos identificados y mitigación

| Riesgo | Prob | Impacto | Mitigación |
|---|---|---|---|
| Booking.com IP-bans Zenix scraper | Alta | Alto | Rate limit < 1/min/hotel + UA declarado + proxies legítimos. Fail-soft. Phase 2 con Lighthouse cuando volumen crezca. |
| Google Places API exceede free tier | Media | Medio | Cache search results 30 días. Limit 100 searches/property/mes. |
| Resolución de precio compleja confunde manager | Media | Alto | UI debug endpoint `resolve-price` con audit trail visible. Documentación con ejemplos. |
| `MetricsDailySnapshot` no captura backfill correctamente | Media | Medio | Backfill helper con --dry-run. Test E2E con BD fresca. |
| Eventos locales no se mantienen actualizados | Alta | Bajo | Events Curator role explícito en ZaharDev. SLA: 1× mensual. Ingest automático en v1.1.x DLC. |
| Bulk update borra accidentalmente todas las tarifas | Baja | Crítico | Preview obligatorio + confirm dialog + UNDO 5min window. |
| Compset card muestra datos desactualizados sin refresh visible | Media | Medio | Timestamp visible + botón "Refresh ahora" rate-limited. |
| Manager interpreta percentil incorrectamente | Media | Bajo | Tooltip explicativo. Documentación inline. |

---

## 11. Definición de "hecho"

- [ ] Migrations aplicadas + rollback documentado
- [ ] 80%+ test coverage en `RatesService`, `MetricsService`, `CompsetService`, `LocalEventsService`
- [ ] E2E passing: crear rate plan + season → resolver precio → check restrictions
- [ ] E2E passing: cron daily snapshot → dashboard renderiza correctamente
- [ ] E2E passing: agregar competidor → cron scrape → card aparece con data
- [ ] E2E passing: evento local match para property en city → aparece en compset card
- [ ] Adapter pattern verificado swap MVP→mock Lighthouse
- [ ] CLAUDE.md decisiones D-RATES1..6, D-METRICS1..6, D-COMPSET1..10 registradas
- [ ] ADR-0002 creado (compset adapter pattern)
- [ ] Runbook compset operations en `docs/zenix-compset-runbook.md`
- [ ] zenix-sales-master.md actualizado con Módulo 9
- [ ] Smoke test con fixture Monica Tulum: crear 2 rate plans + 1 season + 5 competitors + verificar dashboard

---

## 12. Métricas de éxito post-lanzamiento (60 días)

| Métrica | Baseline | Target | Fuente |
|---|---|---|---|
| Adopción de rate plans | 0 hoteles | ≥80% (cliente piloto crea ≥2 planes) | Telemetría |
| Adopción de seasons | 0 | ≥60% crea ≥1 season | Telemetría |
| Dashboard daily active sessions | TBD | +200% vs baseline | Analytics |
| Compset card opened daily | 0 | ≥1× por SUPERVISOR | Analytics |
| Revenue uplift atribuible | Baseline | +5-10% Monica Tulum | Comparación pre/post |
| Time to "configurar rates" | N/A | <30min via wizard | UX test |
| Reducción de queries SQL ad-hoc por owner | TBD | -70% | Logs PgHero |

---

## 13. Pricing comercial (para sales master Módulo 9)

| Tier | Precio | Incluido |
|---|---|---|
| **v1.0.x Foundation** | Bundled todos los planes | Rates + Metrics + Compset MVP (manual scrape DIY) |
| **v1.1.x DLC "Market Intelligence Pro"** | +$50-80/property/mes | Lighthouse partnership + Eventbrite ingest + auto-radius + push notifications |
| **v1.1.x+ DLC "Demand Intelligence Premium"** | +$80-150/property/mes | Flight APIs + ML demand prediction + recommendations engine |

---

## 14. Dependencias

```
v1.0.0 (merged PR #38) ──→ RATES-METRICS-COMPSET-CORE (este sprint)
                                       │
                                       ├──→ v1.0.1 PAY-CORE (depende de Promotion para descuentos)
                                       ├──→ v1.0.3 REPORTS-CORE (consume MetricsDailySnapshot)
                                       └──→ v1.1.x Market Intel Pro DLC (swap adapter)
                                                             │
                                                             └──→ v1.1.x+ DEMAND-INTELLIGENCE
```

---

## Apéndice A — Referencias

### Pricing / Revenue management
- HFTP Hospitality Financial Management Handbook 2023
- Smith Travel Research (STR) Glossary
- Mews Help Center — Rate Manager
- Cloudbeds — Rate Plans documentation
- OTA Insight Lighthouse partner program

### Compset / Market intelligence
- OTA Insight Lighthouse API documentation
- RateGain product overview
- Booking.com Affiliate Partner Program
- Google Places API

### Web scraping legal context
- hiQ Labs v LinkedIn 9th Cir. 2022
- Meta Platforms v Bright Data Cal. N.D. 2024
- robotstxt.org best practices

### Internas Zenix
- [CLAUDE.md §43](../../CLAUDE.md) — Adaptive dashboard principle
- [CLAUDE.md §89](../../CLAUDE.md) — Adapter pattern precedent (IFiscalAdapter)
- [CLAUDE.md §91-§94](../../CLAUDE.md) — Curator role pattern (Tax Catalog → Events Curator)
- [docs/sprints/DEMAND-INTELLIGENCE-plan.md](DEMAND-INTELLIGENCE-plan.md) — Sprint futuro

---

**Fin del plan.** Estimado: 20-23 días-dev (1 dev) o ~10-12 días calendar (2 devs paralelos). Bloqueante para escalar el piloto a clientes con expectativas de pricing dinámico + métricas de revenue. Diferenciador competitivo en LATAM (NOM-151 ya en SIGN-DLC; compset MVP-friendly ya aquí).
