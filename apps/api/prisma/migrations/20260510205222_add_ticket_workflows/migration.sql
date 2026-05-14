/*
  Warnings:

  - The values [CHANNEX] on the enum `CheckoutSource` will be removed. If these variants are still used in the database, this will fail.
  - The `recipient_role` column on the `app_notifications` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `cloudbedsReservationId` on the `checkouts` table. All the data in the column will be lost.
  - You are about to drop the column `cloudbedsRoomId` on the `rooms` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[maintenance_ticket_id]` on the table `room_blocks` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `role` on the `housekeeping_staff` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "CleaningDeferReason" AS ENUM ('DND_PHYSICAL', 'NO_ANSWER', 'GUEST_REQUEST');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('HOUSEKEEPER', 'SUPERVISOR', 'RECEPTIONIST');

-- CreateEnum
CREATE TYPE "StaffLevel" AS ENUM ('LEAD', 'COLLABORATOR');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING_PARTS', 'RESOLVED', 'VERIFIED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('PLUMBING', 'ELECTRICAL', 'FURNITURE', 'APPLIANCE', 'HVAC', 'STRUCTURAL', 'COSMETIC', 'SAFETY', 'PEST', 'DEEP_CLEANING', 'OTHER');

-- CreateEnum
CREATE TYPE "TicketLogEvent" AS ENUM ('CREATED', 'ACKNOWLEDGED', 'ASSIGNED', 'STARTED', 'WAITING_PARTS', 'RESOLVED', 'VERIFIED', 'CLOSED', 'REOPENED', 'COMMENT_ADDED', 'PHOTO_ADDED', 'BLOCK_AUTO_CREATED', 'BLOCK_AUTO_RELEASED');

-- CreateEnum
CREATE TYPE "StayoverFrequency" AS ENUM ('NEVER', 'DAILY', 'EVERY_2_DAYS', 'EVERY_3_DAYS', 'ON_REQUEST', 'GUEST_PREFERENCE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AppNotificationCategory" ADD VALUE 'MAINTENANCE_TICKET_CREATED';
ALTER TYPE "AppNotificationCategory" ADD VALUE 'MAINTENANCE_TICKET_UPDATED';
ALTER TYPE "AppNotificationCategory" ADD VALUE 'MAINTENANCE_TICKET_CRITICAL';
ALTER TYPE "AppNotificationCategory" ADD VALUE 'TASK_VERIFIED_READY';
ALTER TYPE "AppNotificationCategory" ADD VALUE 'LATE_CHECKOUT_PENDING';
ALTER TYPE "AppNotificationCategory" ADD VALUE 'LATE_CHECKOUT_ESCALATED';

-- AlterEnum
BEGIN;
CREATE TYPE "CheckoutSource_new" AS ENUM ('MANUAL', 'SYSTEM');
ALTER TABLE "checkouts" ALTER COLUMN "source" TYPE "CheckoutSource_new" USING ("source"::text::"CheckoutSource_new");
ALTER TYPE "CheckoutSource" RENAME TO "CheckoutSource_old";
ALTER TYPE "CheckoutSource_new" RENAME TO "CheckoutSource";
DROP TYPE "public"."CheckoutSource_old";
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CleaningStatus" ADD VALUE 'DEFERRED';
ALTER TYPE "CleaningStatus" ADD VALUE 'BLOCKED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TaskLogEvent" ADD VALUE 'STAYOVER_CREATED';
ALTER TYPE "TaskLogEvent" ADD VALUE 'DEFERRED';
ALTER TYPE "TaskLogEvent" ADD VALUE 'RETRY_SCHEDULED';
ALTER TYPE "TaskLogEvent" ADD VALUE 'BLOCKED';
ALTER TYPE "TaskLogEvent" ADD VALUE 'LATE_CHECKOUT_RESCHEDULED';
ALTER TYPE "TaskLogEvent" ADD VALUE 'PRIORITY_OVERRIDDEN';
ALTER TYPE "TaskLogEvent" ADD VALUE 'DEEP_CLEAN_FLAGGED';
ALTER TYPE "TaskLogEvent" ADD VALUE 'WALK_IN_CREATED';
ALTER TYPE "TaskLogEvent" ADD VALUE 'HOLD_PLACED';
ALTER TYPE "TaskLogEvent" ADD VALUE 'HOLD_RELEASED';

-- AlterEnum
ALTER TYPE "TaskType" ADD VALUE 'STAYOVER';

-- DropForeignKey
ALTER TABLE "channel_commissions" DROP CONSTRAINT "channel_commissions_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "channel_commissions" DROP CONSTRAINT "channel_commissions_property_id_fkey";

-- DropForeignKey
ALTER TABLE "feature_flag_audit_logs" DROP CONSTRAINT "feature_flag_audit_logs_flag_id_fkey";

-- DropForeignKey
ALTER TABLE "staff_daily_activity" DROP CONSTRAINT "staff_daily_activity_staff_id_fkey";

-- DropForeignKey
ALTER TABLE "staff_personal_records" DROP CONSTRAINT "staff_personal_records_staff_id_fkey";

-- DropForeignKey
ALTER TABLE "staff_streaks" DROP CONSTRAINT "staff_streaks_staff_id_fkey";

-- DropIndex
DROP INDEX "checkouts_cloudbedsReservationId_key";

-- AlterTable
ALTER TABLE "app_notifications" DROP COLUMN "recipient_role",
ADD COLUMN     "recipient_role" "StaffRole";

-- AlterTable
ALTER TABLE "checkouts" DROP COLUMN "cloudbedsReservationId";

-- AlterTable
ALTER TABLE "cleaning_tasks" ADD COLUMN     "deep_clean" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deferred_at" TIMESTAMP(3),
ADD COLUMN     "deferred_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deferred_reason" "CleaningDeferReason",
ADD COLUMN     "held_at" TIMESTAMP(3),
ADD COLUMN     "held_by_id" TEXT,
ADD COLUMN     "hold_reason" TEXT,
ADD COLUMN     "late_checkout_at" TIMESTAMP(3),
ADD COLUMN     "retry_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "guest_stays" ADD COLUMN     "late_checkout_flagged_at" TIMESTAMP(3),
ADD COLUMN     "late_checkout_tier" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "housekeeping_staff" ADD COLUMN     "level" "StaffLevel" NOT NULL DEFAULT 'COLLABORATOR',
ADD COLUMN     "reports_to_id" TEXT,
DROP COLUMN "role",
ADD COLUMN     "role" "StaffRole" NOT NULL;

-- AlterTable
ALTER TABLE "property_settings" ADD COLUMN     "housekeeping_end_hour" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "late_checkout_escalation_minutes" INTEGER NOT NULL DEFAULT 180,
ADD COLUMN     "late_checkout_grace_minutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "late_checkout_processed_date" DATE,
ADD COLUMN     "stayover_frequency" "StayoverFrequency" NOT NULL DEFAULT 'NEVER',
ADD COLUMN     "stayover_hour" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "stayover_processed_date" DATE;

-- AlterTable
ALTER TABLE "room_blocks" ADD COLUMN     "maintenance_ticket_id" TEXT;

-- AlterTable
ALTER TABLE "rooms" DROP COLUMN "cloudbedsRoomId";

-- DropEnum
DROP TYPE "HousekeepingRole";

-- CreateTable
CREATE TABLE "maintenance_tickets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "unit_id" TEXT,
    "category" "TicketCategory" NOT NULL,
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "guest_impact" TEXT,
    "reported_by_id" TEXT NOT NULL,
    "assigned_to_id" TEXT,
    "resolved_by_id" TEXT,
    "verified_by_id" TEXT,
    "estimated_minutes" INTEGER,
    "actual_minutes" INTEGER,
    "acknowledged_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "waiting_parts_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "source_task_id" TEXT,

    CONSTRAINT "maintenance_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_ticket_photos" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "is_after_photo" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_ticket_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_ticket_comments" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_ticket_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_ticket_logs" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "event" "TicketLogEvent" NOT NULL,
    "staff_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_ticket_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_tickets_organization_id_property_id_status_idx" ON "maintenance_tickets"("organization_id", "property_id", "status");

-- CreateIndex
CREATE INDEX "maintenance_tickets_organization_id_property_id_priority_st_idx" ON "maintenance_tickets"("organization_id", "property_id", "priority", "status");

-- CreateIndex
CREATE INDEX "maintenance_tickets_assigned_to_id_status_idx" ON "maintenance_tickets"("assigned_to_id", "status");

-- CreateIndex
CREATE INDEX "maintenance_tickets_room_id_status_idx" ON "maintenance_tickets"("room_id", "status");

-- CreateIndex
CREATE INDEX "maintenance_tickets_category_status_idx" ON "maintenance_tickets"("category", "status");

-- CreateIndex
CREATE INDEX "maintenance_tickets_created_at_idx" ON "maintenance_tickets"("created_at");

-- CreateIndex
CREATE INDEX "maintenance_ticket_photos_ticket_id_idx" ON "maintenance_ticket_photos"("ticket_id");

-- CreateIndex
CREATE INDEX "maintenance_ticket_comments_ticket_id_created_at_idx" ON "maintenance_ticket_comments"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "maintenance_ticket_logs_ticket_id_created_at_idx" ON "maintenance_ticket_logs"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "maintenance_ticket_logs_event_idx" ON "maintenance_ticket_logs"("event");

-- CreateIndex
CREATE INDEX "app_notifications_recipient_role_idx" ON "app_notifications"("recipient_role");

-- CreateIndex
CREATE UNIQUE INDEX "room_blocks_maintenance_ticket_id_key" ON "room_blocks"("maintenance_ticket_id");

-- CreateIndex
CREATE INDEX "room_readiness_task_items_maintenance_ticket_id_idx" ON "room_readiness_task_items"("maintenance_ticket_id");

-- AddForeignKey
ALTER TABLE "housekeeping_staff" ADD CONSTRAINT "housekeeping_staff_reports_to_id_fkey" FOREIGN KEY ("reports_to_id") REFERENCES "housekeeping_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_readiness_task_items" ADD CONSTRAINT "room_readiness_task_items_maintenance_ticket_id_fkey" FOREIGN KEY ("maintenance_ticket_id") REFERENCES "maintenance_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_blocks" ADD CONSTRAINT "room_blocks_maintenance_ticket_id_fkey" FOREIGN KEY ("maintenance_ticket_id") REFERENCES "maintenance_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_commissions" ADD CONSTRAINT "channel_commissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_commissions" ADD CONSTRAINT "channel_commissions_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_streaks" ADD CONSTRAINT "staff_streaks_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "housekeeping_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_personal_records" ADD CONSTRAINT "staff_personal_records_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "housekeeping_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_daily_activity" ADD CONSTRAINT "staff_daily_activity_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "housekeeping_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_audit_logs" ADD CONSTRAINT "feature_flag_audit_logs_flag_id_fkey" FOREIGN KEY ("flag_id") REFERENCES "feature_flags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_reported_by_id_fkey" FOREIGN KEY ("reported_by_id") REFERENCES "housekeeping_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "housekeeping_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "housekeeping_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "housekeeping_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_source_task_id_fkey" FOREIGN KEY ("source_task_id") REFERENCES "cleaning_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_ticket_photos" ADD CONSTRAINT "maintenance_ticket_photos_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "maintenance_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_ticket_photos" ADD CONSTRAINT "maintenance_ticket_photos_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "housekeeping_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_ticket_comments" ADD CONSTRAINT "maintenance_ticket_comments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "maintenance_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_ticket_comments" ADD CONSTRAINT "maintenance_ticket_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "housekeeping_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_ticket_logs" ADD CONSTRAINT "maintenance_ticket_logs_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "maintenance_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_ticket_logs" ADD CONSTRAINT "maintenance_ticket_logs_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "housekeeping_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
