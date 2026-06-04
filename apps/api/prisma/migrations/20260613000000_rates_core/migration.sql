-- DropForeignKey
ALTER TABLE "channels" DROP CONSTRAINT "channels_property_id_fkey";

-- DropForeignKey
ALTER TABLE "retention_save_offers" DROP CONSTRAINT "retention_save_offers_subscription_id_fkey";

-- DropForeignKey
ALTER TABLE "subscription_discounts" DROP CONSTRAINT "subscription_discounts_subscription_id_fkey";

-- DropForeignKey
ALTER TABLE "subscription_events" DROP CONSTRAINT "subscription_events_subscription_id_fkey";

-- DropIndex
DROP INDEX "audit_log_created_at_idx";

-- DropIndex
DROP INDEX "audit_log_organization_id_created_at_desc_idx";

-- DropIndex
DROP INDEX "legal_entities_pac_status_idx";

-- AlterTable
ALTER TABLE "channels" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "consultor_discount_templates" DROP COLUMN "percent_off",
ADD COLUMN     "percentOff" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "rate_plans" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseStrategy" TEXT NOT NULL DEFAULT 'BAR',
    "baseRate" DECIMAL(10,2),
    "baseMultiplier" DECIMAL(4,3),
    "cancellation_policy" TEXT NOT NULL DEFAULT 'FLEXIBLE',
    "inclusions" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "visible_to_channels" TEXT[] DEFAULT ARRAY['ALL']::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_seasons" (
    "id" TEXT NOT NULL,
    "rate_plan_id" TEXT NOT NULL,
    "room_type_id" TEXT,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "override_rate" DECIMAL(10,2),
    "multiplier" DECIMAL(4,3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_of_week_rules" (
    "id" TEXT NOT NULL,
    "rate_plan_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "multiplier" DECIMAL(4,3) NOT NULL,

    CONSTRAINT "day_of_week_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_restrictions" (
    "id" TEXT NOT NULL,
    "rate_plan_id" TEXT,
    "room_type_id" TEXT,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3) NOT NULL,
    "mlos" INTEGER,
    "max_los" INTEGER,
    "cta" BOOLEAN NOT NULL DEFAULT false,
    "ctd" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_restrictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "rate_plan_id" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discount_type" TEXT NOT NULL,
    "discount_value" DECIMAL(10,2) NOT NULL,
    "min_los" INTEGER,
    "advance_purchase_days" INTEGER,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3) NOT NULL,
    "max_redemptions" INTEGER,
    "current_redemptions" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_overrides" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "room_type_id" TEXT NOT NULL,
    "rate_plan_id" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "override_rate" DECIMAL(10,2) NOT NULL,
    "reason" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rate_plans_property_id_is_active_idx" ON "rate_plans"("property_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "rate_plans_property_id_code_key" ON "rate_plans"("property_id", "code");

-- CreateIndex
CREATE INDEX "rate_seasons_rate_plan_id_start_date_end_date_idx" ON "rate_seasons"("rate_plan_id", "start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "day_of_week_rules_rate_plan_id_day_of_week_key" ON "day_of_week_rules"("rate_plan_id", "day_of_week");

-- CreateIndex
CREATE INDEX "rate_restrictions_rate_plan_id_valid_from_valid_to_idx" ON "rate_restrictions"("rate_plan_id", "valid_from", "valid_to");

-- CreateIndex
CREATE INDEX "rate_restrictions_room_type_id_valid_from_valid_to_idx" ON "rate_restrictions"("room_type_id", "valid_from", "valid_to");

-- CreateIndex
CREATE INDEX "promotions_property_id_is_active_idx" ON "promotions"("property_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_property_id_code_key" ON "promotions"("property_id", "code");

-- CreateIndex
CREATE INDEX "rate_overrides_property_id_date_idx" ON "rate_overrides"("property_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "rate_overrides_property_id_room_type_id_rate_plan_id_date_key" ON "rate_overrides"("property_id", "room_type_id", "rate_plan_id", "date");

-- CreateIndex
CREATE INDEX "audit_log_organization_id_created_at_idx" ON "audit_log"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_discounts" ADD CONSTRAINT "subscription_discounts_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_save_offers" ADD CONSTRAINT "retention_save_offers_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_seasons" ADD CONSTRAINT "rate_seasons_rate_plan_id_fkey" FOREIGN KEY ("rate_plan_id") REFERENCES "rate_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_seasons" ADD CONSTRAINT "rate_seasons_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_of_week_rules" ADD CONSTRAINT "day_of_week_rules_rate_plan_id_fkey" FOREIGN KEY ("rate_plan_id") REFERENCES "rate_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_restrictions" ADD CONSTRAINT "rate_restrictions_rate_plan_id_fkey" FOREIGN KEY ("rate_plan_id") REFERENCES "rate_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_rate_plan_id_fkey" FOREIGN KEY ("rate_plan_id") REFERENCES "rate_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_overrides" ADD CONSTRAINT "rate_overrides_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

