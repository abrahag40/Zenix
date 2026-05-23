-- ═══════════════════════════════════════════════════════════════════════
-- DLC Subscription Model 2026-05-21
-- Genérico para Learning + futuros DLCs (Booking Engine, POS, etc.)
-- Doc: docs/zenix-learning/14-dlc-architecture.md
-- ═══════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "DLCCode" AS ENUM ('LEARNING_CORE', 'LEARNING_PRO', 'LEARNING_GIFT', 'BOOKING_ENGINE', 'POS', 'PROCURE', 'STAY_ACCESS', 'PEOPLE', 'BOOKS');

-- CreateEnum
CREATE TYPE "DLCStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'GRACE_PERIOD', 'ARCHIVED', 'PURGED');

-- CreateEnum
CREATE TYPE "DLCBillingMode" AS ENUM ('ONE_TIME_GIFT', 'FLAT_MONTHLY', 'PER_STAFF_ACTIVE', 'PER_TRANSACTION');

-- CreateTable
CREATE TABLE "tenant_dlcs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "dlc_code" "DLCCode" NOT NULL,
    "status" "DLCStatus" NOT NULL DEFAULT 'ACTIVE',
    "billing_mode" "DLCBillingMode" NOT NULL,
    "price_per_unit" DECIMAL(10,2),
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suspended_at" TIMESTAMP(3),
    "grace_period_ends_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "reactivated_at" TIMESTAMP(3),
    "activated_by_id" TEXT,
    "cancellation_reason" TEXT,
    "suspension_reason" TEXT,
    "stripe_subscription_id" TEXT,
    "stripe_subscription_item_id" TEXT,
    "stripe_customer_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_dlcs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_dlc_logs" (
    "id" TEXT NOT NULL,
    "tenant_dlc_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "metadata" JSONB,
    "actor_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_dlc_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_dlcs_organization_id_status_idx" ON "tenant_dlcs"("organization_id", "status");

-- CreateIndex
CREATE INDEX "tenant_dlcs_status_grace_period_ends_at_idx" ON "tenant_dlcs"("status", "grace_period_ends_at");

-- CreateIndex
CREATE INDEX "tenant_dlcs_dlc_code_status_idx" ON "tenant_dlcs"("dlc_code", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_dlcs_organization_id_dlc_code_key" ON "tenant_dlcs"("organization_id", "dlc_code");

-- CreateIndex
CREATE INDEX "tenant_dlc_logs_tenant_dlc_id_occurred_at_idx" ON "tenant_dlc_logs"("tenant_dlc_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "tenant_dlcs" ADD CONSTRAINT "tenant_dlcs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_dlcs" ADD CONSTRAINT "tenant_dlcs_activated_by_id_fkey" FOREIGN KEY ("activated_by_id") REFERENCES "housekeeping_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_dlc_logs" ADD CONSTRAINT "tenant_dlc_logs_tenant_dlc_id_fkey" FOREIGN KEY ("tenant_dlc_id") REFERENCES "tenant_dlcs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_dlc_logs" ADD CONSTRAINT "tenant_dlc_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "housekeeping_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

