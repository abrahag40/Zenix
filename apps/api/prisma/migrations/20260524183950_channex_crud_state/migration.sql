-- AlterTable
ALTER TABLE "property_settings" ADD COLUMN     "channex_command_center_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rate_parity_threshold_pct" DOUBLE PRECISION NOT NULL DEFAULT 5.0;

-- CreateTable
CREATE TABLE "channex_rate_plan_mappings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "channex_rate_plan_id" TEXT NOT NULL,
    "channex_room_type_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "sell_mode" TEXT NOT NULL,
    "rate_mode" TEXT NOT NULL DEFAULT 'manual',
    "default_rate" DECIMAL(10,2) NOT NULL,
    "default_occupancy" INTEGER NOT NULL DEFAULT 2,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "channex_rate_plan_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_plan_caps" (
    "id" TEXT NOT NULL,
    "channex_mapping_id" TEXT NOT NULL,
    "rate_cap_min" DECIMAL(10,2),
    "rate_cap_max" DECIMAL(10,2),
    "reason" TEXT,
    "set_by_id" TEXT NOT NULL,
    "set_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_plan_caps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channex_channel_pauses" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "channex_channel_id" TEXT NOT NULL,
    "channel_name" TEXT NOT NULL,
    "paused_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paused_by_id" TEXT NOT NULL,
    "pause_reason" TEXT,
    "pre_state" JSONB,
    "unpaused_at" TIMESTAMP(3),
    "unpaused_by_id" TEXT,
    "unpause_reason" TEXT,

    CONSTRAINT "channex_channel_pauses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channex_rate_plan_mappings_channex_rate_plan_id_key" ON "channex_rate_plan_mappings"("channex_rate_plan_id");

-- CreateIndex
CREATE INDEX "channex_rate_plan_mappings_property_id_is_active_idx" ON "channex_rate_plan_mappings"("property_id", "is_active");

-- CreateIndex
CREATE INDEX "channex_rate_plan_mappings_channex_room_type_id_idx" ON "channex_rate_plan_mappings"("channex_room_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "rate_plan_caps_channex_mapping_id_key" ON "rate_plan_caps"("channex_mapping_id");

-- CreateIndex
CREATE INDEX "rate_plan_caps_set_by_id_idx" ON "rate_plan_caps"("set_by_id");

-- CreateIndex
CREATE INDEX "channex_channel_pauses_property_id_paused_at_idx" ON "channex_channel_pauses"("property_id", "paused_at");

-- CreateIndex
CREATE INDEX "channex_channel_pauses_channex_channel_id_idx" ON "channex_channel_pauses"("channex_channel_id");

-- AddForeignKey
ALTER TABLE "channex_rate_plan_mappings" ADD CONSTRAINT "channex_rate_plan_mappings_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_plan_caps" ADD CONSTRAINT "rate_plan_caps_channex_mapping_id_fkey" FOREIGN KEY ("channex_mapping_id") REFERENCES "channex_rate_plan_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channex_channel_pauses" ADD CONSTRAINT "channex_channel_pauses_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═════════════════════════════════════════════════════════════════════════════
-- Channex Command Center Day 2 — Postgres-level guards
-- ═════════════════════════════════════════════════════════════════════════════

-- §"D-CHX-CC-9": rate cap floor ≤ ceiling enforcement.
-- Si solo uno está set (floor only o ceiling only) el guard se cumple trivial.
ALTER TABLE rate_plan_caps
  ADD CONSTRAINT rate_plan_caps_min_lte_max
  CHECK (
    rate_cap_min IS NULL
    OR rate_cap_max IS NULL
    OR rate_cap_min <= rate_cap_max
  );

-- Default rate del rate plan no puede ser negativo (Channex API lo rechaza
-- pero defendemos en DB para evitar inconsistencia si el operator bypassa via SQL).
ALTER TABLE channex_rate_plan_mappings
  ADD CONSTRAINT channex_rate_plan_mappings_default_rate_nonneg
  CHECK (default_rate >= 0);

-- Cap min/max no negativos
ALTER TABLE rate_plan_caps
  ADD CONSTRAINT rate_plan_caps_nonneg
  CHECK (
    (rate_cap_min IS NULL OR rate_cap_min >= 0)
    AND (rate_cap_max IS NULL OR rate_cap_max >= 0)
  );

-- §"D-CHX-CC-7": unpaused_at debe ser ≥ paused_at (sin paradoja temporal)
ALTER TABLE channex_channel_pauses
  ADD CONSTRAINT channex_channel_pauses_unpause_after_pause
  CHECK (
    unpaused_at IS NULL OR unpaused_at >= paused_at
  );

-- Rate parity threshold debe ser 0-100% (porcentaje)
ALTER TABLE property_settings
  ADD CONSTRAINT property_settings_rate_parity_threshold_valid
  CHECK (rate_parity_threshold_pct >= 0 AND rate_parity_threshold_pct <= 100);
