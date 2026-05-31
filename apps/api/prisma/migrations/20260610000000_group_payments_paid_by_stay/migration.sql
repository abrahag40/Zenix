-- GROUP-PAYMENTS Fase A (D-GRP-A1) — atribución de pago a otra stay del grupo.

-- AlterTable
ALTER TABLE "payment_logs" ADD COLUMN     "paid_by_stay_id" TEXT,
ADD COLUMN     "transaction_group_id" TEXT;

-- CreateIndex
CREATE INDEX "payment_logs_paid_by_stay_id_idx" ON "payment_logs"("paid_by_stay_id");

-- CreateIndex
CREATE INDEX "payment_logs_transaction_group_id_idx" ON "payment_logs"("transaction_group_id");

-- AddForeignKey
ALTER TABLE "payment_logs" ADD CONSTRAINT "payment_logs_paid_by_stay_id_fkey" FOREIGN KEY ("paid_by_stay_id") REFERENCES "guest_stays"("id") ON DELETE SET NULL ON UPDATE CASCADE;
