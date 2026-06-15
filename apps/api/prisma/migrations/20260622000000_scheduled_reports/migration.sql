-- Sprint REPORTS-REVAMP P4(a) — reportes programados por email
CREATE TABLE "scheduled_reports" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "report_key" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "send_hour" INTEGER NOT NULL DEFAULT 7,
    "weekday" INTEGER,
    "monthday" INTEGER,
    "range_days" INTEGER NOT NULL DEFAULT 1,
    "recipients" TEXT[],
    "format" TEXT NOT NULL DEFAULT 'xlsx',
    "filters" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_run_date" TEXT,
    "last_run_at" TIMESTAMP(3),
    "last_run_status" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "scheduled_reports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "scheduled_reports_property_id_idx" ON "scheduled_reports"("property_id");
CREATE INDEX "scheduled_reports_active_idx" ON "scheduled_reports"("active");
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
