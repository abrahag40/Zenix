-- Sprint CHANNEX-OUTBOUND-CERT — Day 1
-- Outbox queue para PMS → Channex push (separa AVAILABILITY vs RATES_RESTRICTIONS)
-- + full-sync idempotency fields en PropertySettings.

-- CreateEnum: outbound kind (estructuralmente separa los 2 endpoints Channex)
CREATE TYPE "ChannexOutboundKind" AS ENUM ('AVAILABILITY', 'RATES_RESTRICTIONS');

-- CreateEnum: outbound status (mismo state machine que ChannexOutbox inbound)
CREATE TYPE "ChannexOutboundStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER');

-- CreateTable: outbound queue
CREATE TABLE "channex_outbound_queue" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "kind" "ChannexOutboundKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "ChannexOutboundStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "processed_at" TIMESTAMP(3),
    "payload_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channex_outbound_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channex_outbound_queue_status_priority_next_attempt_at_idx" ON "channex_outbound_queue"("status", "priority", "next_attempt_at");
CREATE INDEX "channex_outbound_queue_property_id_status_idx" ON "channex_outbound_queue"("property_id", "status");
CREATE INDEX "channex_outbound_queue_payload_hash_idx" ON "channex_outbound_queue"("payload_hash");

-- AlterTable: PropertySettings — full-sync window + idempotency
ALTER TABLE "property_settings" ADD COLUMN "channex_last_full_sync_at" TIMESTAMP(3);
ALTER TABLE "property_settings" ADD COLUMN "channex_full_sync_window_start" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "property_settings" ADD COLUMN "channex_full_sync_window_end" INTEGER NOT NULL DEFAULT 5;
