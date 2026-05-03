-- Sprint 9 — Reports research recommendations.
-- Cross-research: Mews/Cloudbeds engineering blogs + STR + USALI 12th
-- + reviews G2/Capterra. Ver docs/zenix-reports-research.md para el
-- estudio completo.

-- 1. Lead time pre-computado en GuestStay (cheap field, big payoff for pace)
ALTER TABLE "guest_stays" ADD COLUMN "booking_lead_days" INTEGER;

-- Backfill para registros existentes — diferencia en días entre creación
-- y check-in. Stays históricos tendrán este valor poblado retroactivamente.
UPDATE "guest_stays"
   SET "booking_lead_days" = GREATEST(0, EXTRACT(DAY FROM ("checkin_at" - "created_at"))::INTEGER)
 WHERE "booking_lead_days" IS NULL;

-- 2. DailyPropertyMetrics — Manager Report snapshot (Occ/ADR/RevPAR)
CREATE TABLE "daily_property_metrics" (
  "id"                 TEXT          NOT NULL,
  "property_id"        TEXT          NOT NULL,
  "date"               DATE          NOT NULL,
  "rooms_available"    INTEGER       NOT NULL,
  "rooms_sold"         INTEGER       NOT NULL,
  "rooms_ooo"          INTEGER       NOT NULL,
  "room_revenue"       DECIMAL(12,2) NOT NULL,
  "total_revenue"      DECIMAL(12,2) NOT NULL,
  "adr"                DECIMAL(10,2) NOT NULL,
  "occupancy"          DECIMAL(5,4)  NOT NULL,
  "revpar"             DECIMAL(10,2) NOT NULL,
  "arrival_count"      INTEGER       NOT NULL DEFAULT 0,
  "departure_count"    INTEGER       NOT NULL DEFAULT 0,
  "no_show_count"      INTEGER       NOT NULL DEFAULT 0,
  "cancellation_count" INTEGER       NOT NULL DEFAULT 0,
  "walk_in_count"      INTEGER       NOT NULL DEFAULT 0,
  "currency"           TEXT          NOT NULL DEFAULT 'MXN',
  "computed_at"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_property_metrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_property_metrics_property_id_date_key"
  ON "daily_property_metrics"("property_id", "date");
CREATE INDEX "daily_property_metrics_property_id_date_idx"
  ON "daily_property_metrics"("property_id", "date");

ALTER TABLE "daily_property_metrics"
  ADD CONSTRAINT "daily_property_metrics_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. ChannelProductionDaily — channel mix report (#9 most-used)
CREATE TABLE "channel_production_daily" (
  "id"             TEXT          NOT NULL,
  "property_id"    TEXT          NOT NULL,
  "date"           DATE          NOT NULL,
  "source"         TEXT          NOT NULL,
  "bookings"       INTEGER       NOT NULL DEFAULT 0,
  "cancellations"  INTEGER       NOT NULL DEFAULT 0,
  "no_shows"       INTEGER       NOT NULL DEFAULT 0,
  "net_revenue"    DECIMAL(12,2) NOT NULL DEFAULT 0,
  "commission"     DECIMAL(12,2) NOT NULL DEFAULT 0,
  "avg_lead_days"  INTEGER,
  "currency"       TEXT          NOT NULL DEFAULT 'MXN',
  "computed_at"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "channel_production_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channel_production_daily_property_id_date_source_key"
  ON "channel_production_daily"("property_id", "date", "source");
CREATE INDEX "channel_production_daily_property_id_date_idx"
  ON "channel_production_daily"("property_id", "date");
CREATE INDEX "channel_production_daily_source_date_idx"
  ON "channel_production_daily"("source", "date");

ALTER TABLE "channel_production_daily"
  ADD CONSTRAINT "channel_production_daily_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
