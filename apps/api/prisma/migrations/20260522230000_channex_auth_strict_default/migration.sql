-- Cert audit A4 fix — cerrar fail-open de ChannexAuthGuard.
-- Default TRUE en producción; sandbox/dev pueden setear false para onboarding.

ALTER TABLE "property_settings"
  ADD COLUMN "channex_webhook_secret_required" BOOLEAN NOT NULL DEFAULT true;
