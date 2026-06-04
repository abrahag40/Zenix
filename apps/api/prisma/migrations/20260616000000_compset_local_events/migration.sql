-- RATES-METRICS-COMPSET Fase 3 (D-COMPSET1..10). Schema completo Compset + LocalEvent.

-- LegalEntity.compsetProvider + compsetApiKey
ALTER TABLE "legal_entities"
  ADD COLUMN "compset_provider" TEXT NOT NULL DEFAULT 'SCRAPER_DIY',
  ADD COLUMN "compset_api_key" TEXT;

-- Competitor
CREATE TABLE "competitors" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "external_id" TEXT,
    "external_source" TEXT,
    "external_url" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "address" TEXT,
    "star_rating" DECIMAL(2,1),
    "guest_rating" DECIMAL(3,2),
    "review_count" INTEGER,
    "room_count" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "added_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "competitors_property_id_is_active_idx" ON "competitors"("property_id", "is_active");
ALTER TABLE "competitors"
  ADD CONSTRAINT "competitors_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CompsetSnapshot (append-only)
CREATE TABLE "compset_snapshots" (
    "id" TEXT NOT NULL,
    "competitor_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'SCRAPER_DIY',
    "rates_by_date" JSONB NOT NULL,
    "rating_snapshot" JSONB,
    "duration_ms" INTEGER,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    CONSTRAINT "compset_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "compset_snapshots_competitor_id_scraped_at_idx"
  ON "compset_snapshots"("competitor_id", "scraped_at" DESC);
CREATE INDEX "compset_snapshots_property_id_scraped_at_idx"
  ON "compset_snapshots"("property_id", "scraped_at" DESC);
ALTER TABLE "compset_snapshots"
  ADD CONSTRAINT "compset_snapshots_competitor_id_fkey"
  FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- LocalEvent
CREATE TABLE "local_events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "country_code" TEXT NOT NULL,
    "region_code" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "radius_km" DECIMAL(6,2),
    "demand_impact" TEXT NOT NULL DEFAULT 'MEDIUM',
    "expected_attendance" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "source_url" TEXT,
    "source_external_id" TEXT,
    "curated_by_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "local_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "local_events_country_code_start_date_idx" ON "local_events"("country_code", "start_date");
CREATE INDEX "local_events_region_code_start_date_idx" ON "local_events"("region_code", "start_date");
CREATE INDEX "local_events_city_start_date_idx" ON "local_events"("city", "start_date");

-- LocalEventOverride
CREATE TABLE "local_event_overrides" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "base_event_id" TEXT,
    "custom_name" TEXT,
    "custom_demand_impact" TEXT,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "approved_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "local_event_overrides_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "local_event_overrides_property_id_idx" ON "local_event_overrides"("property_id");
ALTER TABLE "local_event_overrides"
  ADD CONSTRAINT "local_event_overrides_base_event_id_fkey"
  FOREIGN KEY ("base_event_id") REFERENCES "local_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "local_event_overrides"
  ADD CONSTRAINT "local_event_overrides_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
