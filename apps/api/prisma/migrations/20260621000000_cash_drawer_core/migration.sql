-- CASH-DRAWER-REPORTS Sprint 1 (2026-06-14) — Caja / Arqueo por turno de cajero (§85, D-CASH1..15).
-- Migración ADITIVA: 2 tablas nuevas + 1 columna nullable en payment_logs + 5 columnas en
-- property_settings (con default → cero impacto en filas existentes). Sin FK constraints
-- (IDs escalares, §66/§204). cash_shift_required default FALSE → cero regresión en el cobro vivo.

-- CreateEnum
CREATE TYPE "CashierShiftStatus" AS ENUM ('OPEN', 'CLOSED', 'RECONCILED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('OPENING_FLOAT', 'PAID_IN', 'PAID_OUT', 'CHANGE_GIVEN', 'FX_CONVERSION', 'CORRECTION', 'SPOT_COUNT');

-- CreateTable
CREATE TABLE "cashier_shifts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "status" "CashierShiftStatus" NOT NULL DEFAULT 'OPEN',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "opening_source" TEXT NOT NULL DEFAULT 'FRESH_BANK',
    "handover_from_shift_id" TEXT,
    "opening_accepted_by_id" TEXT,
    "closing_witness_id" TEXT,
    "opening_float" JSONB NOT NULL,
    "expected_close" JSONB,
    "actual_close" JSONB,
    "variance" JSONB,
    "variance_reason" TEXT,
    "reconciled_by_id" TEXT,
    "reconciled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cashier_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_log_id" TEXT,
    "transaction_group_id" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cashier_shifts_property_id_status_idx" ON "cashier_shifts"("property_id", "status");
CREATE INDEX "cashier_shifts_property_id_staff_id_opened_at_idx" ON "cashier_shifts"("property_id", "staff_id", "opened_at");
CREATE INDEX "cashier_shifts_organization_id_property_id_idx" ON "cashier_shifts"("organization_id", "property_id");

-- CreateIndex
CREATE INDEX "cash_movements_shift_id_created_at_idx" ON "cash_movements"("shift_id", "created_at");
CREATE INDEX "cash_movements_transaction_group_id_idx" ON "cash_movements"("transaction_group_id");

-- AlterTable payment_logs — link al turno de caja (nullable, aditivo)
ALTER TABLE "payment_logs" ADD COLUMN "cashier_shift_id" TEXT;
CREATE INDEX "payment_logs_cashier_shift_id_idx" ON "payment_logs"("cashier_shift_id");

-- AlterTable property_settings — política de caja (defaults → cero impacto en filas existentes)
ALTER TABLE "property_settings"
    ADD COLUMN "cash_shift_required" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "cash_blind_count" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "cash_variance_threshold" DECIMAL(8,2) NOT NULL DEFAULT 50,
    ADD COLUMN "cash_shift_auto_close_hours" INTEGER NOT NULL DEFAULT 24,
    ADD COLUMN "cash_bank_model" TEXT NOT NULL DEFAULT 'PERSONAL_IMPREST';
