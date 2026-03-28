-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'CHECKING_OUT', 'CLEANING', 'INSPECTION', 'MAINTENANCE', 'OUT_OF_SERVICE');

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "pms_room_type_id" TEXT,
ADD COLUMN     "room_status" "RoomStatus" NOT NULL DEFAULT 'AVAILABLE';

-- CreateTable
CREATE TABLE "pms_room_types" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "base_rate" DOUBLE PRECISION,
    "max_occupancy" INTEGER NOT NULL DEFAULT 2,
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_room_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_status_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "from_status" "RoomStatus" NOT NULL,
    "to_status" "RoomStatus" NOT NULL,
    "changed_by_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_status_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pms_room_types_organization_id_idx" ON "pms_room_types"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "pms_room_types_organization_id_code_key" ON "pms_room_types"("organization_id", "code");

-- CreateIndex
CREATE INDEX "room_status_logs_organization_id_idx" ON "room_status_logs"("organization_id");

-- CreateIndex
CREATE INDEX "room_status_logs_room_id_created_at_idx" ON "room_status_logs"("room_id", "created_at");

-- CreateIndex
CREATE INDEX "rooms_room_status_idx" ON "rooms"("room_status");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_pms_room_type_id_fkey" FOREIGN KEY ("pms_room_type_id") REFERENCES "pms_room_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_room_types" ADD CONSTRAINT "pms_room_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_status_logs" ADD CONSTRAINT "room_status_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_status_logs" ADD CONSTRAINT "room_status_logs_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
