/*
  Warnings:

  - You are about to drop the `Bed` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `BedDiscrepancy` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Checkout` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CleaningNote` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CleaningTask` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `HousekeepingStaff` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MaintenanceIssue` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PmsConfig` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Property` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PropertySettings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PushToken` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Room` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TaskLog` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "OrgPlan" AS ENUM ('STARTER', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('OWNER', 'MANAGER', 'RECEPTIONIST', 'HOUSEKEEPER', 'TECHNICIAN', 'AUDITOR');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('HOTEL', 'HOSTAL', 'BOUTIQUE', 'GLAMPING', 'ECO_LODGE', 'VACATION_RENTAL');

-- DropForeignKey
ALTER TABLE "Bed" DROP CONSTRAINT "Bed_roomId_fkey";

-- DropForeignKey
ALTER TABLE "BedDiscrepancy" DROP CONSTRAINT "BedDiscrepancy_bedId_fkey";

-- DropForeignKey
ALTER TABLE "BedDiscrepancy" DROP CONSTRAINT "BedDiscrepancy_reportedById_fkey";

-- DropForeignKey
ALTER TABLE "BedDiscrepancy" DROP CONSTRAINT "BedDiscrepancy_resolvedById_fkey";

-- DropForeignKey
ALTER TABLE "Checkout" DROP CONSTRAINT "Checkout_enteredById_fkey";

-- DropForeignKey
ALTER TABLE "Checkout" DROP CONSTRAINT "Checkout_roomId_fkey";

-- DropForeignKey
ALTER TABLE "CleaningNote" DROP CONSTRAINT "CleaningNote_staffId_fkey";

-- DropForeignKey
ALTER TABLE "CleaningNote" DROP CONSTRAINT "CleaningNote_taskId_fkey";

-- DropForeignKey
ALTER TABLE "CleaningTask" DROP CONSTRAINT "CleaningTask_assignedToId_fkey";

-- DropForeignKey
ALTER TABLE "CleaningTask" DROP CONSTRAINT "CleaningTask_bedId_fkey";

-- DropForeignKey
ALTER TABLE "CleaningTask" DROP CONSTRAINT "CleaningTask_checkoutId_fkey";

-- DropForeignKey
ALTER TABLE "CleaningTask" DROP CONSTRAINT "CleaningTask_verifiedById_fkey";

-- DropForeignKey
ALTER TABLE "HousekeepingStaff" DROP CONSTRAINT "HousekeepingStaff_propertyId_fkey";

-- DropForeignKey
ALTER TABLE "MaintenanceIssue" DROP CONSTRAINT "MaintenanceIssue_reportedById_fkey";

-- DropForeignKey
ALTER TABLE "MaintenanceIssue" DROP CONSTRAINT "MaintenanceIssue_taskId_fkey";

-- DropForeignKey
ALTER TABLE "PmsConfig" DROP CONSTRAINT "PmsConfig_propertyId_fkey";

-- DropForeignKey
ALTER TABLE "PropertySettings" DROP CONSTRAINT "PropertySettings_propertyId_fkey";

-- DropForeignKey
ALTER TABLE "PushToken" DROP CONSTRAINT "PushToken_staffId_fkey";

-- DropForeignKey
ALTER TABLE "Room" DROP CONSTRAINT "Room_propertyId_fkey";

-- DropForeignKey
ALTER TABLE "TaskLog" DROP CONSTRAINT "TaskLog_staffId_fkey";

-- DropForeignKey
ALTER TABLE "TaskLog" DROP CONSTRAINT "TaskLog_taskId_fkey";

-- DropTable
DROP TABLE "Bed";

-- DropTable
DROP TABLE "BedDiscrepancy";

-- DropTable
DROP TABLE "Checkout";

-- DropTable
DROP TABLE "CleaningNote";

-- DropTable
DROP TABLE "CleaningTask";

-- DropTable
DROP TABLE "HousekeepingStaff";

-- DropTable
DROP TABLE "MaintenanceIssue";

-- DropTable
DROP TABLE "PmsConfig";

-- DropTable
DROP TABLE "Property";

-- DropTable
DROP TABLE "PropertySettings";

-- DropTable
DROP TABLE "PushToken";

-- DropTable
DROP TABLE "Room";

-- DropTable
DROP TABLE "TaskLog";

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "OrgPlan" NOT NULL DEFAULT 'STARTER',
    "country_code" TEXT NOT NULL DEFAULT 'MX',
    "timezone" TEXT NOT NULL DEFAULT 'America/Cancun',
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_property_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "role" "SystemRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_property_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "name" TEXT NOT NULL,
    "type" "PropertyType" NOT NULL DEFAULT 'HOTEL',
    "tax_id" TEXT,
    "checkin_time" TEXT NOT NULL DEFAULT '15:00',
    "checkout_time" TEXT NOT NULL DEFAULT '12:00',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "propertyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "floor" INTEGER,
    "type" "RoomType" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "cloudbedsRoomId" TEXT,
    "deleted_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beds" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "label" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "status" "BedStatus" NOT NULL DEFAULT 'AVAILABLE',
    "deleted_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "housekeeping_staff" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "user_id" TEXT,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "HousekeepingRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "capabilities" "Capability"[],
    "deleted_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "housekeeping_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkouts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "roomId" TEXT NOT NULL,
    "guestName" TEXT,
    "actualCheckoutAt" TIMESTAMP(3) NOT NULL,
    "source" "CheckoutSource" NOT NULL,
    "cloudbedsReservationId" TEXT,
    "isEarlyCheckout" BOOLEAN NOT NULL DEFAULT false,
    "hasSameDayCheckIn" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "enteredById" TEXT,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "created_by_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cleaning_tasks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "bedId" TEXT NOT NULL,
    "checkoutId" TEXT,
    "assignedToId" TEXT,
    "status" "CleaningStatus" NOT NULL DEFAULT 'PENDING',
    "taskType" "TaskType" NOT NULL DEFAULT 'CLEANING',
    "requiredCapability" "Capability" NOT NULL DEFAULT 'CLEANING',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "hasSameDayCheckIn" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cleaning_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "taskId" TEXT NOT NULL,
    "staffId" TEXT,
    "event" "TaskLogEvent" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cleaning_notes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "taskId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cleaning_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_issues" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "taskId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "category" "MaintenanceCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "photoUrl" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_tokens" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "staffId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_configs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "propertyId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CLOUDBEDS',
    "apiKey" TEXT NOT NULL,
    "webhookSecret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pms_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_settings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "propertyId" TEXT NOT NULL,
    "defaultCheckoutTime" TEXT NOT NULL DEFAULT '11:00',
    "timezone" TEXT NOT NULL DEFAULT 'America/Cancun',
    "pmsMode" TEXT NOT NULL DEFAULT 'STANDALONE',
    "deleted_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bed_discrepancies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "bedId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "type" "DiscrepancyType" NOT NULL,
    "status" "DiscrepancyStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "resolution" TEXT,
    "created_by_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "bed_discrepancies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");

-- CreateIndex
CREATE INDEX "user_property_roles_user_id_idx" ON "user_property_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_property_roles_property_id_idx" ON "user_property_roles"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_property_roles_user_id_property_id_role_key" ON "user_property_roles"("user_id", "property_id", "role");

-- CreateIndex
CREATE INDEX "properties_organization_id_idx" ON "properties"("organization_id");

-- CreateIndex
CREATE INDEX "rooms_organization_id_idx" ON "rooms"("organization_id");

-- CreateIndex
CREATE INDEX "rooms_organization_id_propertyId_idx" ON "rooms"("organization_id", "propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_propertyId_number_key" ON "rooms"("propertyId", "number");

-- CreateIndex
CREATE INDEX "beds_organization_id_idx" ON "beds"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "housekeeping_staff_email_key" ON "housekeeping_staff"("email");

-- CreateIndex
CREATE INDEX "housekeeping_staff_organization_id_idx" ON "housekeeping_staff"("organization_id");

-- CreateIndex
CREATE INDEX "housekeeping_staff_organization_id_propertyId_idx" ON "housekeeping_staff"("organization_id", "propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "checkouts_cloudbedsReservationId_key" ON "checkouts"("cloudbedsReservationId");

-- CreateIndex
CREATE INDEX "checkouts_organization_id_idx" ON "checkouts"("organization_id");

-- CreateIndex
CREATE INDEX "cleaning_tasks_organization_id_idx" ON "cleaning_tasks"("organization_id");

-- CreateIndex
CREATE INDEX "cleaning_tasks_status_idx" ON "cleaning_tasks"("status");

-- CreateIndex
CREATE INDEX "cleaning_tasks_assignedToId_status_idx" ON "cleaning_tasks"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "cleaning_tasks_bedId_idx" ON "cleaning_tasks"("bedId");

-- CreateIndex
CREATE INDEX "cleaning_tasks_checkoutId_idx" ON "cleaning_tasks"("checkoutId");

-- CreateIndex
CREATE INDEX "task_logs_organization_id_idx" ON "task_logs"("organization_id");

-- CreateIndex
CREATE INDEX "task_logs_taskId_idx" ON "task_logs"("taskId");

-- CreateIndex
CREATE INDEX "cleaning_notes_organization_id_idx" ON "cleaning_notes"("organization_id");

-- CreateIndex
CREATE INDEX "maintenance_issues_organization_id_idx" ON "maintenance_issues"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens"("token");

-- CreateIndex
CREATE INDEX "push_tokens_organization_id_idx" ON "push_tokens"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "pms_configs_propertyId_key" ON "pms_configs"("propertyId");

-- CreateIndex
CREATE INDEX "pms_configs_organization_id_idx" ON "pms_configs"("organization_id");

-- CreateIndex
CREATE INDEX "pms_configs_organization_id_propertyId_idx" ON "pms_configs"("organization_id", "propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "property_settings_propertyId_key" ON "property_settings"("propertyId");

-- CreateIndex
CREATE INDEX "property_settings_organization_id_idx" ON "property_settings"("organization_id");

-- CreateIndex
CREATE INDEX "property_settings_organization_id_propertyId_idx" ON "property_settings"("organization_id", "propertyId");

-- CreateIndex
CREATE INDEX "bed_discrepancies_organization_id_idx" ON "bed_discrepancies"("organization_id");

-- CreateIndex
CREATE INDEX "bed_discrepancies_bedId_idx" ON "bed_discrepancies"("bedId");

-- CreateIndex
CREATE INDEX "bed_discrepancies_status_idx" ON "bed_discrepancies"("status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_property_roles" ADD CONSTRAINT "user_property_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_property_roles" ADD CONSTRAINT "user_property_roles_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beds" ADD CONSTRAINT "beds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beds" ADD CONSTRAINT "beds_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_staff" ADD CONSTRAINT "housekeeping_staff_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_staff" ADD CONSTRAINT "housekeeping_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_staff" ADD CONSTRAINT "housekeeping_staff_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "housekeeping_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleaning_tasks" ADD CONSTRAINT "cleaning_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleaning_tasks" ADD CONSTRAINT "cleaning_tasks_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "beds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleaning_tasks" ADD CONSTRAINT "cleaning_tasks_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "checkouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleaning_tasks" ADD CONSTRAINT "cleaning_tasks_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "housekeeping_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleaning_tasks" ADD CONSTRAINT "cleaning_tasks_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "housekeeping_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "cleaning_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "housekeeping_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleaning_notes" ADD CONSTRAINT "cleaning_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleaning_notes" ADD CONSTRAINT "cleaning_notes_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "cleaning_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleaning_notes" ADD CONSTRAINT "cleaning_notes_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "housekeeping_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_issues" ADD CONSTRAINT "maintenance_issues_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_issues" ADD CONSTRAINT "maintenance_issues_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "cleaning_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_issues" ADD CONSTRAINT "maintenance_issues_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "housekeeping_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "housekeeping_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_configs" ADD CONSTRAINT "pms_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_configs" ADD CONSTRAINT "pms_configs_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_settings" ADD CONSTRAINT "property_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_settings" ADD CONSTRAINT "property_settings_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_discrepancies" ADD CONSTRAINT "bed_discrepancies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_discrepancies" ADD CONSTRAINT "bed_discrepancies_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "beds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_discrepancies" ADD CONSTRAINT "bed_discrepancies_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "housekeeping_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_discrepancies" ADD CONSTRAINT "bed_discrepancies_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "housekeeping_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
