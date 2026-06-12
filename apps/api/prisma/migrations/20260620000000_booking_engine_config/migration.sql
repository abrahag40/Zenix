-- BOOKING-ENGINE B0 (2026-06-11) — "Zenix Booking" direct booking engine.
-- Config 1:1 con Property que habilita book.zenix.com/{slug} + API pública.
-- Opción B: paymentPolicy default PAY_AT_HOTEL (prepago se enchufa post-PAY-CORE).
CREATE TABLE "booking_engine_config" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "payment_policy" TEXT NOT NULL DEFAULT 'PAY_AT_HOTEL',
    "hold_ttl_minutes" INTEGER NOT NULL DEFAULT 1440,
    "logo_url" TEXT,
    "primary_color" TEXT,
    "accent_color" TEXT,
    "font_family" TEXT,
    "hero_title" TEXT,
    "hero_subtitle" TEXT,
    "terms_url" TEXT,
    "cancellation_policy_id" TEXT,
    "default_language" TEXT NOT NULL DEFAULT 'es-MX',
    "display_currency" TEXT,
    "marketplace_listing_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "booking_engine_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_engine_config_property_id_key"
  ON "booking_engine_config"("property_id");

CREATE UNIQUE INDEX "booking_engine_config_slug_key"
  ON "booking_engine_config"("slug");

CREATE INDEX "idx_booking_engine_config_slug"
  ON "booking_engine_config"("slug");

ALTER TABLE "booking_engine_config"
  ADD CONSTRAINT "booking_engine_config_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
