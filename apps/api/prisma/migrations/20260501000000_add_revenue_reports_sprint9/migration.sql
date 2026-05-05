-- Sprint 9 — Revenue reports + channel commissions
-- See docs/revenue-data-mapping.md for context.

-- 1) PropertySettings: weekly target + report currency
ALTER TABLE "property_settings"
  ADD COLUMN IF NOT EXISTS "weekly_revenue_target" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "report_currency"       TEXT NOT NULL DEFAULT 'MXN';

-- 2) ChannelCommission table
CREATE TABLE IF NOT EXISTS "channel_commissions" (
  "id"               TEXT NOT NULL,
  "organization_id"  TEXT,
  "property_id"      TEXT NOT NULL,
  "source"           TEXT NOT NULL,
  "rate_percent"     DECIMAL(5,2) NOT NULL,
  "effective_from"   DATE NOT NULL,
  "effective_until"  DATE,
  "notes"            TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "channel_commissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "channel_commissions_property_id_source_effective_from_idx"
  ON "channel_commissions" ("property_id", "source", "effective_from");

ALTER TABLE "channel_commissions"
  ADD CONSTRAINT "channel_commissions_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "channel_commissions"
  ADD CONSTRAINT "channel_commissions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
