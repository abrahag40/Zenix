-- BOOKING-ENGINE B2 (2026-06-11) — API key pública + idempotencia de reservas.
CREATE TABLE "booking_api_keys" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'live',
    "key_id" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "allowed_origins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_api_keys_key_id_key" ON "booking_api_keys"("key_id");
CREATE INDEX "idx_booking_api_key_property" ON "booking_api_keys"("property_id");

ALTER TABLE "booking_api_keys"
  ADD CONSTRAINT "booking_api_keys_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "booking_idempotency_records" (
    "id" TEXT NOT NULL,
    "api_key_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_json" JSONB NOT NULL,
    "status_code" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uniq_booking_idempotency"
  ON "booking_idempotency_records"("api_key_id", "idempotency_key");
