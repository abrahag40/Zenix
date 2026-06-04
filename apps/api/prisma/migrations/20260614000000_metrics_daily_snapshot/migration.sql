-- CreateTable
CREATE TABLE "metrics_daily_snapshots" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_rooms_available" INTEGER NOT NULL,
    "rooms_sold" INTEGER NOT NULL,
    "occupancy_percent" DECIMAL(5,2) NOT NULL,
    "room_revenue" DECIMAL(12,2) NOT NULL,
    "base_currency" TEXT NOT NULL,
    "adr" DECIMAL(10,2) NOT NULL,
    "revpar" DECIMAL(10,2) NOT NULL,
    "cancellations_count" INTEGER NOT NULL DEFAULT 0,
    "no_shows_count" INTEGER NOT NULL DEFAULT 0,
    "arrivals_count" INTEGER NOT NULL DEFAULT 0,
    "departures_count" INTEGER NOT NULL DEFAULT 0,
    "avg_length_of_stay" DECIMAL(4,2),
    "avg_lead_time" DECIMAL(5,2),
    "channel_mix" JSONB NOT NULL,
    "revenue_by_room_type" JSONB,

    CONSTRAINT "metrics_daily_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metrics_daily_snapshots_property_id_date_idx" ON "metrics_daily_snapshots"("property_id", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "metrics_daily_snapshots_property_id_date_key" ON "metrics_daily_snapshots"("property_id", "date");

-- AddForeignKey
ALTER TABLE "metrics_daily_snapshots" ADD CONSTRAINT "metrics_daily_snapshots_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

