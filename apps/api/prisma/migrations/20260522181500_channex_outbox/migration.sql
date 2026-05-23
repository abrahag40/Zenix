-- Sprint CHANNEX-INBOUND — Day 2 outbox queue (D-CHX10)
-- Transactional outbox: webhook controller persiste log + outbox(PENDING)
-- en misma tx; el scheduler procesa rows ready (status IN (PENDING,FAILED)
-- AND next_attempt_at <= now()) con FOR UPDATE SKIP LOCKED.

-- CreateEnum
CREATE TYPE "ChannexOutboxStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER');

-- CreateTable
CREATE TABLE "channex_outbox" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "channex_booking_id" TEXT,
    "channex_revision_id" TEXT,
    "webhook_log_id" TEXT,
    "status" "ChannexOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_by" TEXT,
    "locked_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channex_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channex_outbox_status_next_attempt_at_idx" ON "channex_outbox"("status", "next_attempt_at");
CREATE INDEX "channex_outbox_property_id_status_idx" ON "channex_outbox"("property_id", "status");
CREATE INDEX "channex_outbox_channex_booking_id_idx" ON "channex_outbox"("channex_booking_id");
