/*
  Warnings:

  - You are about to drop the column `bedId` on the `cleaning_tasks` table. All the data in the column will be lost.
  - You are about to drop the column `bed_id` on the `room_blocks` table. All the data in the column will be lost.
  - You are about to drop the `bed_discrepancies` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `beds` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `unitId` to the `cleaning_tasks` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'DIRTY', 'CLEANING', 'BLOCKED');

-- DropForeignKey
ALTER TABLE "bed_discrepancies" DROP CONSTRAINT "bed_discrepancies_bedId_fkey";

-- DropForeignKey
ALTER TABLE "bed_discrepancies" DROP CONSTRAINT "bed_discrepancies_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "bed_discrepancies" DROP CONSTRAINT "bed_discrepancies_reportedById_fkey";

-- DropForeignKey
ALTER TABLE "bed_discrepancies" DROP CONSTRAINT "bed_discrepancies_resolvedById_fkey";

-- DropForeignKey
ALTER TABLE "beds" DROP CONSTRAINT "beds_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "beds" DROP CONSTRAINT "beds_roomId_fkey";

-- DropForeignKey
ALTER TABLE "cleaning_tasks" DROP CONSTRAINT "cleaning_tasks_bedId_fkey";

-- DropForeignKey
ALTER TABLE "room_blocks" DROP CONSTRAINT "room_blocks_bed_id_fkey";

-- DropIndex
DROP INDEX "cleaning_tasks_bedId_idx";

-- DropIndex
DROP INDEX "room_blocks_bed_id_status_idx";

-- AlterTable
ALTER TABLE "cleaning_tasks" DROP COLUMN "bedId",
ADD COLUMN     "unitId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "room_blocks" DROP COLUMN "bed_id",
ADD COLUMN     "unit_id" TEXT;

-- DropTable
DROP TABLE "bed_discrepancies";

-- DropTable
DROP TABLE "beds";

-- DropEnum
DROP TYPE "BedStatus";

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "label" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "status" "UnitStatus" NOT NULL DEFAULT 'AVAILABLE',
    "deleted_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_discrepancies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "unitId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "type" "DiscrepancyType" NOT NULL,
    "status" "DiscrepancyStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "resolution" TEXT,
    "created_by_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "unit_discrepancies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "units_organization_id_idx" ON "units"("organization_id");

-- CreateIndex
CREATE INDEX "unit_discrepancies_organization_id_idx" ON "unit_discrepancies"("organization_id");

-- CreateIndex
CREATE INDEX "unit_discrepancies_unitId_idx" ON "unit_discrepancies"("unitId");

-- CreateIndex
CREATE INDEX "unit_discrepancies_status_idx" ON "unit_discrepancies"("status");

-- CreateIndex
CREATE INDEX "cleaning_tasks_unitId_idx" ON "cleaning_tasks"("unitId");

-- CreateIndex
CREATE INDEX "room_blocks_unit_id_status_idx" ON "room_blocks"("unit_id", "status");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleaning_tasks" ADD CONSTRAINT "cleaning_tasks_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_discrepancies" ADD CONSTRAINT "unit_discrepancies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_discrepancies" ADD CONSTRAINT "unit_discrepancies_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_discrepancies" ADD CONSTRAINT "unit_discrepancies_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "housekeeping_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_discrepancies" ADD CONSTRAINT "unit_discrepancies_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "housekeeping_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_blocks" ADD CONSTRAINT "room_blocks_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
