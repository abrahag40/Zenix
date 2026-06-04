-- Property geo canónico (Fase 3 RATES-METRICS-COMPSET chunk 2)
ALTER TABLE "properties"
  ADD COLUMN "region_code" TEXT,
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION;

-- Backfill mínimo del seed Tulum para que LocalEvents tests funcionen
UPDATE "properties"
  SET "region_code" = 'MX-ROO', "latitude" = 20.2114, "longitude" = -87.4654
  WHERE "city" = 'Tulum';
