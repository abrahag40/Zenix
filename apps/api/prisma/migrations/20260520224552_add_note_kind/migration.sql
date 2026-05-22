-- AlterTable
ALTER TABLE "guest_stay_notes" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'CHAT';

-- CreateIndex
CREATE INDEX "guest_stay_notes_stay_id_kind_idx" ON "guest_stay_notes"("stay_id", "kind");
