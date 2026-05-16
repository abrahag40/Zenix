-- AlterTable
ALTER TABLE "guest_stays" ADD COLUMN     "anonymized_at" TIMESTAMP(3),
ADD COLUMN     "cancel_initiator" TEXT,
ADD COLUMN     "cancel_metadata" JSONB,
ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancel_reason_code" TEXT,
ADD COLUMN     "cancellation_policy_id" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "cancelled_by_id" TEXT,
ADD COLUMN     "cancelled_from_channel" TEXT,
ADD COLUMN     "requires_fiscal_review" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "guest_stay_logs" (
    "id" TEXT NOT NULL,
    "stay_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_type" TEXT NOT NULL DEFAULT 'USER',
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_stay_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guest_stay_logs_stay_id_occurred_at_idx" ON "guest_stay_logs"("stay_id", "occurred_at");

-- CreateIndex
CREATE INDEX "guest_stay_logs_event_idx" ON "guest_stay_logs"("event");

-- CreateIndex
CREATE INDEX "guest_stays_cancelled_at_idx" ON "guest_stays"("cancelled_at");

-- AddForeignKey
ALTER TABLE "guest_stay_logs" ADD CONSTRAINT "guest_stay_logs_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "guest_stays"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
