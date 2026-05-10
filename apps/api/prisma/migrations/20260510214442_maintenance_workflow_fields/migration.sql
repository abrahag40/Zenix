-- CreateEnum
CREATE TYPE "RecurrenceScope" AS ENUM ('PER_ROOM', 'PER_ASSET', 'PER_PROPERTY', 'COMMON_AREAS');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AppNotificationCategory" ADD VALUE 'MAINTENANCE_TICKET_NEEDS_APPROVAL';
ALTER TYPE "AppNotificationCategory" ADD VALUE 'MAINTENANCE_TICKET_ASSIGNED';
ALTER TYPE "AppNotificationCategory" ADD VALUE 'MAINTENANCE_TICKET_RESOLVED';
ALTER TYPE "AppNotificationCategory" ADD VALUE 'MAINTENANCE_TICKET_VERIFIED';
ALTER TYPE "AppNotificationCategory" ADD VALUE 'MAINTENANCE_TICKET_QUEUED';
ALTER TYPE "AppNotificationCategory" ADD VALUE 'MAINTENANCE_SLA_BREACH';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TicketLogEvent" ADD VALUE 'AUTO_ASSIGNED';
ALTER TYPE "TicketLogEvent" ADD VALUE 'CLAIMED';
ALTER TYPE "TicketLogEvent" ADD VALUE 'QUEUED';
ALTER TYPE "TicketLogEvent" ADD VALUE 'APPROVED';
ALTER TYPE "TicketLogEvent" ADD VALUE 'REJECTED';
ALTER TYPE "TicketLogEvent" ADD VALUE 'SLA_BREACH';

-- DropForeignKey
ALTER TABLE "maintenance_tickets" DROP CONSTRAINT "maintenance_tickets_room_id_fkey";

-- AlterTable
ALTER TABLE "maintenance_tickets" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by_id" TEXT,
ADD COLUMN     "asset_tag" TEXT,
ADD COLUMN     "recurrence_template_id" TEXT,
ADD COLUMN     "rejected_reason" TEXT,
ADD COLUMN     "requires_approval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sla_breach_at" TIMESTAMP(3),
ALTER COLUMN "room_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "property_settings" ADD COLUMN     "maintenance_auto_assign_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "maintenance_recurrence_templates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "TicketCategory" NOT NULL,
    "default_priority" "TicketPriority" NOT NULL DEFAULT 'LOW',
    "interval_days" INTEGER NOT NULL,
    "scope" "RecurrenceScope" NOT NULL DEFAULT 'PER_ROOM',
    "default_asset_tag" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_recurrence_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_recurrence_templates_organization_id_is_active_idx" ON "maintenance_recurrence_templates"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "maintenance_tickets_organization_id_property_id_requires_ap_idx" ON "maintenance_tickets"("organization_id", "property_id", "requires_approval", "status");

-- CreateIndex
CREATE INDEX "maintenance_tickets_asset_tag_idx" ON "maintenance_tickets"("asset_tag");

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "housekeeping_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_recurrence_template_id_fkey" FOREIGN KEY ("recurrence_template_id") REFERENCES "maintenance_recurrence_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_recurrence_templates" ADD CONSTRAINT "maintenance_recurrence_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
