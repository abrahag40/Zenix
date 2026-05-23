-- Cert audit C9 fix — virtual card guarantee persistence.
ALTER TABLE "guest_stays" ADD COLUMN "channex_guarantee_meta" JSONB;
