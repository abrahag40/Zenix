-- AlterEnum
ALTER TYPE "TicketLogEvent" ADD VALUE 'PHOTO_DELETED';

-- AlterTable
ALTER TABLE "maintenance_ticket_photos" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT;

-- CreateIndex
CREATE INDEX "maintenance_ticket_photos_ticket_id_deleted_at_idx" ON "maintenance_ticket_photos"("ticket_id", "deleted_at");
