-- ============================================================
-- Migration: add_pms_rooms_core
-- Renames, restructures, and adds PMS core room entities
-- ============================================================

-- 1. Rename enum RoomType → RoomCategory
ALTER TYPE "RoomType" RENAME TO "RoomCategory";

-- 2. Rename rooms.type → rooms.category (column rename, same enum)
ALTER TABLE "rooms" RENAME COLUMN "type" TO "category";

-- 3. Add notes column to rooms
ALTER TABLE "rooms" ADD COLUMN "notes" TEXT;

-- 4. Rename rooms.pms_room_type_id → rooms.room_type_id
--    Drop old FK and index first
ALTER TABLE "rooms" DROP CONSTRAINT IF EXISTS "rooms_pms_room_type_id_fkey";
ALTER TABLE "rooms" RENAME COLUMN "pms_room_type_id" TO "room_type_id";

-- 5. Drop old pms_room_types table and recreate as room_types
--    (Must drop FKs referencing pms_room_types first — already done in step 4)
DROP INDEX IF EXISTS "pms_room_types_organization_id_idx";
DROP INDEX IF EXISTS "pms_room_types_organization_id_code_key";
ALTER TABLE "pms_room_types" DROP CONSTRAINT IF EXISTS "pms_room_types_organization_id_fkey";
DROP TABLE "pms_room_types";

-- CreateTable: room_types (replaces pms_room_types with new schema)
CREATE TABLE "room_types" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "max_occupancy" INTEGER NOT NULL,
    "base_rate" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "amenities" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "room_types_property_id_code_key" ON "room_types"("property_id", "code");
CREATE INDEX "room_types_organization_id_idx" ON "room_types"("organization_id");
CREATE INDEX "room_types_organization_id_property_id_idx" ON "room_types"("organization_id", "property_id");

-- AddForeignKey: room_types → organizations
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: room_types → properties
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Clear room_type_id FKs (data pointed to old pms_room_types rows which were dropped)
UPDATE "rooms" SET "room_type_id" = NULL WHERE "room_type_id" IS NOT NULL;

-- AddForeignKey: rooms.room_type_id → room_types
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Update RoomStatusLog: add property_id, make changed_by_id NOT NULL
--    First update any NULL changed_by_id values (set to 'system' placeholder)
UPDATE "room_status_logs" SET "changed_by_id" = 'system' WHERE "changed_by_id" IS NULL;

ALTER TABLE "room_status_logs" ADD COLUMN "property_id" TEXT;
-- Backfill property_id from the room's propertyId
UPDATE "room_status_logs" rsl SET "property_id" = r."propertyId" FROM "rooms" r WHERE rsl."room_id" = r.id;
ALTER TABLE "room_status_logs" ALTER COLUMN "property_id" SET NOT NULL;
ALTER TABLE "room_status_logs" ALTER COLUMN "changed_by_id" SET NOT NULL;

-- Drop old compound index and create separate ones
DROP INDEX IF EXISTS "room_status_logs_room_id_created_at_idx";
CREATE INDEX "room_status_logs_room_id_idx" ON "room_status_logs"("room_id");
CREATE INDEX "room_status_logs_created_at_idx" ON "room_status_logs"("created_at");

-- 7. CreateEnum: PaymentStatus
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'CREDIT', 'OVERDUE');

-- 8. CreateTable: guest_stays
CREATE TABLE "guest_stays" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "guest_name" TEXT NOT NULL,
    "guest_email" TEXT,
    "guest_phone" TEXT,
    "document_type" TEXT,
    "document_number" TEXT,
    "nationality" TEXT,
    "pax_count" INTEGER NOT NULL DEFAULT 1,
    "checkin_at" TIMESTAMP(3) NOT NULL,
    "scheduled_checkout" TIMESTAMP(3) NOT NULL,
    "actual_checkout" TIMESTAMP(3),
    "rate_per_night" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "total_amount" DECIMAL(10,2) NOT NULL,
    "amount_paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "source" TEXT,
    "notes" TEXT,
    "checked_in_by_id" TEXT NOT NULL,
    "checked_out_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_stays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guest_stays_organization_id_idx" ON "guest_stays"("organization_id");
CREATE INDEX "guest_stays_organization_id_property_id_idx" ON "guest_stays"("organization_id", "property_id");
CREATE INDEX "guest_stays_room_id_idx" ON "guest_stays"("room_id");
CREATE INDEX "guest_stays_payment_status_idx" ON "guest_stays"("payment_status");

-- AddForeignKey: guest_stays → organizations
ALTER TABLE "guest_stays" ADD CONSTRAINT "guest_stays_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: guest_stays → rooms
ALTER TABLE "guest_stays" ADD CONSTRAINT "guest_stays_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
