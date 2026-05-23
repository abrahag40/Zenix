-- Sprint CHANNEX-INBOUND — Day 1 schema + skeleton
-- Adds inbound webhook fields to GuestStay + PropertySettings,
-- creates ChannexWebhookLog append-only audit table.

-- AlterTable: GuestStay — Channex inbound idempotency + conflict tracking
ALTER TABLE "guest_stays" ADD COLUMN "channex_booking_id" TEXT;
ALTER TABLE "guest_stays" ADD COLUMN "channex_revision" INTEGER;
ALTER TABLE "guest_stays" ADD COLUMN "channex_conflict" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "guest_stays" ADD COLUMN "channex_last_sync_at" TIMESTAMP(3);
ALTER TABLE "guest_stays" ADD COLUMN "channex_ota_name" TEXT;

-- CreateIndex: unique idempotency key (D-CHX2)
CREATE UNIQUE INDEX "guest_stays_channex_booking_id_key" ON "guest_stays"("channex_booking_id");
CREATE INDEX "guest_stays_channex_conflict_idx" ON "guest_stays"("channex_conflict");

-- AlterTable: PropertySettings — per-property HMAC secret + pull toggle
ALTER TABLE "property_settings" ADD COLUMN "channex_webhook_secret" TEXT;
ALTER TABLE "property_settings" ADD COLUMN "channex_pull_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "property_settings" ADD COLUMN "channex_pull_last_run_at" TIMESTAMP(3);

-- CreateTable: ChannexWebhookLog — append-only fiscal-grade audit (D-CHX4)
CREATE TABLE "channex_webhook_logs" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "channex_booking_id" TEXT,
    "channex_revision" INTEGER,
    "payload" JSONB NOT NULL,
    "signature_valid" BOOLEAN NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "result" TEXT,
    "error_message" TEXT,
    "resulting_stay_id" TEXT,

    CONSTRAINT "channex_webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channex_webhook_logs_property_id_received_at_idx" ON "channex_webhook_logs"("property_id", "received_at");
CREATE INDEX "channex_webhook_logs_channex_booking_id_idx" ON "channex_webhook_logs"("channex_booking_id");
CREATE INDEX "channex_webhook_logs_event_type_idx" ON "channex_webhook_logs"("event_type");

-- AddForeignKey
ALTER TABLE "channex_webhook_logs" ADD CONSTRAINT "channex_webhook_logs_resulting_stay_id_fkey" FOREIGN KEY ("resulting_stay_id") REFERENCES "guest_stays"("id") ON DELETE SET NULL ON UPDATE CASCADE;
