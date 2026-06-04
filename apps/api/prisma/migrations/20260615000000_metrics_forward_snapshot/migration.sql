-- D-METRICS3 forward snapshot (pace/pickup/STLY).
CREATE TABLE "metrics_forward_snapshots" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "as_of_date" TIMESTAMP(3) NOT NULL,
    "stay_date" TIMESTAMP(3) NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_rooms_available" INTEGER NOT NULL,
    "rooms_on_books" INTEGER NOT NULL,
    "occupancy_percent" DECIMAL(5,2) NOT NULL,
    "room_revenue" DECIMAL(12,2) NOT NULL,
    "base_currency" TEXT NOT NULL,
    "adr" DECIMAL(10,2) NOT NULL,
    "revpar" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "metrics_forward_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "metrics_forward_snapshots_property_id_as_of_date_stay_date_key"
  ON "metrics_forward_snapshots"("property_id", "as_of_date", "stay_date");

CREATE INDEX "metrics_forward_snapshots_property_id_stay_date_idx"
  ON "metrics_forward_snapshots"("property_id", "stay_date");

CREATE INDEX "metrics_forward_snapshots_property_id_as_of_date_idx"
  ON "metrics_forward_snapshots"("property_id", "as_of_date");

ALTER TABLE "metrics_forward_snapshots"
  ADD CONSTRAINT "metrics_forward_snapshots_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
