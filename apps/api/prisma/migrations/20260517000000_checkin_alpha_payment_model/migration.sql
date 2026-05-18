-- Sprint CHECK-IN-α §106 — add PaymentModel enum + GuestStay.paymentModel column
-- Default HOTEL_COLLECT preserva el comportamiento actual (todos los guards activos).

-- CreateEnum
CREATE TYPE "PaymentModel" AS ENUM ('HOTEL_COLLECT', 'OTA_COLLECT', 'HYBRID_DEPOSIT');

-- AlterTable
ALTER TABLE "guest_stays" ADD COLUMN "payment_model" "PaymentModel" NOT NULL DEFAULT 'HOTEL_COLLECT';
