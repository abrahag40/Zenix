-- Sprint Mx-1 — Maintenance Module Workflow Delta
--
-- Adds:
--   1. New enum values to TicketLogEvent (APPROVED, REJECTED, CLAIMED, AUTO_ASSIGNED, QUEUED, SLA_BREACH)
--   2. New RecurrenceScope enum
--   3. Workflow fields on MaintenanceTicket (requiresApproval, approvedById, approvedAt,
--      rejectedReason, recurrenceTemplateId, slaBreachAt, assetTag) + make roomId nullable
--   4. New MaintenanceRecurrenceTemplate model
--   5. PropertySettings.maintenanceAutoAssignEnabled

-- 1. Extend TicketLogEvent enum
ALTER TYPE "TicketLogEvent" ADD VALUE IF NOT EXISTS 'AUTO_ASSIGNED';
ALTER TYPE "TicketLogEvent" ADD VALUE IF NOT EXISTS 'CLAIMED';
ALTER TYPE "TicketLogEvent" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "TicketLogEvent" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "TicketLogEvent" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "TicketLogEvent" ADD VALUE IF NOT EXISTS 'SLA_BREACH';

-- 1b. Extend AppNotificationCategory enum (Flujo B + SLA + Cola)
ALTER TYPE "AppNotificationCategory" ADD VALUE IF NOT EXISTS 'MAINTENANCE_TICKET_NEEDS_APPROVAL';
ALTER TYPE "AppNotificationCategory" ADD VALUE IF NOT EXISTS 'MAINTENANCE_TICKET_ASSIGNED';
ALTER TYPE "AppNotificationCategory" ADD VALUE IF NOT EXISTS 'MAINTENANCE_TICKET_RESOLVED';
ALTER TYPE "AppNotificationCategory" ADD VALUE IF NOT EXISTS 'MAINTENANCE_TICKET_VERIFIED';
ALTER TYPE "AppNotificationCategory" ADD VALUE IF NOT EXISTS 'MAINTENANCE_TICKET_QUEUED';
ALTER TYPE "AppNotificationCategory" ADD VALUE IF NOT EXISTS 'MAINTENANCE_SLA_BREACH';

-- 2. Create RecurrenceScope enum
CREATE TYPE "RecurrenceScope" AS ENUM ('PER_ROOM', 'PER_ASSET', 'PER_PROPERTY', 'COMMON_AREAS');

-- 3. Workflow fields on maintenance_tickets
ALTER TABLE "maintenance_tickets"
  ADD COLUMN "asset_tag" TEXT,
  ADD COLUMN "requires_approval" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "approved_by_id" TEXT,
  ADD COLUMN "approved_at" TIMESTAMP(3),
  ADD COLUMN "rejected_reason" TEXT,
  ADD COLUMN "recurrence_template_id" TEXT,
  ADD COLUMN "sla_breach_at" TIMESTAMP(3);

-- Make roomId nullable (was NOT NULL)
ALTER TABLE "maintenance_tickets" ALTER COLUMN "room_id" DROP NOT NULL;

-- 4. MaintenanceRecurrenceTemplate
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

CREATE INDEX "maintenance_recurrence_templates_organization_id_is_active_idx"
  ON "maintenance_recurrence_templates"("organization_id", "is_active");

ALTER TABLE "maintenance_recurrence_templates"
  ADD CONSTRAINT "maintenance_recurrence_templates_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. FKs from maintenance_tickets to new fields
ALTER TABLE "maintenance_tickets"
  ADD CONSTRAINT "maintenance_tickets_approved_by_id_fkey"
  FOREIGN KEY ("approved_by_id") REFERENCES "housekeeping_staff"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "maintenance_tickets"
  ADD CONSTRAINT "maintenance_tickets_recurrence_template_id_fkey"
  FOREIGN KEY ("recurrence_template_id") REFERENCES "maintenance_recurrence_templates"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Indexes
CREATE INDEX "maintenance_tickets_organization_id_property_id_requires_approval_status_idx"
  ON "maintenance_tickets"("organization_id", "property_id", "requires_approval", "status");

CREATE INDEX "maintenance_tickets_asset_tag_idx"
  ON "maintenance_tickets"("asset_tag");

-- 7. PropertySettings.maintenanceAutoAssignEnabled
ALTER TABLE "property_settings"
  ADD COLUMN "maintenance_auto_assign_enabled" BOOLEAN NOT NULL DEFAULT false;
