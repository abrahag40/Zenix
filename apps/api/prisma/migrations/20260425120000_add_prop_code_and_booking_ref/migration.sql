-- AlterTable: add prop_code to properties (nullable first for safe migration)
ALTER TABLE "properties" ADD COLUMN "prop_code" TEXT;

-- AlterTable: add booking_ref to guest_stays (nullable first for safe migration)
ALTER TABLE "guest_stays" ADD COLUMN "booking_ref" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "properties_prop_code_key" ON "properties"("prop_code");

-- CreateIndex
CREATE UNIQUE INDEX "guest_stays_booking_ref_key" ON "guest_stays"("booking_ref");

-- Remove CLOUDBEDS from CheckoutSource enum (no longer used)
ALTER TYPE "CheckoutSource" RENAME TO "CheckoutSource_old";
CREATE TYPE "CheckoutSource" AS ENUM ('MANUAL', 'CHANNEX', 'SYSTEM');
ALTER TABLE "checkouts" ALTER COLUMN "source" TYPE "CheckoutSource" USING "source"::text::"CheckoutSource";
DROP TYPE "CheckoutSource_old";
