-- AlterTable
ALTER TABLE "stay_segments" ADD COLUMN     "move_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "move_confirmed_by_id" TEXT;

-- CreateIndex
CREATE INDEX "stay_segments_move_confirmed_at_idx" ON "stay_segments"("move_confirmed_at");
