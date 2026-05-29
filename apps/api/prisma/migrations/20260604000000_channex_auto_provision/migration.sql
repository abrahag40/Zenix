-- Migration: CHANNEX-AUTO-PROVISION Day 2 — schema changes for wizard provisioning
--
-- Adds the persistence layer needed by ChannexProvisionService.provisionFromWizard()
-- to push Property + RoomTypes + RatePlans + Channels to Channex at wizard activation
-- time. Multi-tenant Fase 1 = Modelo D adaptado (master API key + Groups per Org).
--
-- Migration path para Fase 2 (Channex Partner Program): cliente puede contratar su
-- propia API key per LegalEntity. Si LegalEntity.channexApiKey != null, ChannexGateway
-- usa esa key en lugar del master. Zero breaking change.
--
-- Channels (OTA connections) son entity de primera clase con encryption AES-256-GCM
-- de credentials del cliente — KEK en .env, NUNCA en logs/AuditLog.

-- ── Organization: Channex Group (multi-tenant Fase 1) ──────────────────
ALTER TABLE "organizations" ADD COLUMN "channex_group_id" TEXT;
COMMENT ON COLUMN "organizations"."channex_group_id" IS
  'Multi-tenant Fase 1 — Channex Group ID que aísla las properties del cliente. Master API key sigue siendo ZaharDev.';

-- ── LegalEntity: BYO API key (Fase 2/3 migration path) ─────────────────
ALTER TABLE "legal_entities" ADD COLUMN "channex_api_key" TEXT;
COMMENT ON COLUMN "legal_entities"."channex_api_key" IS
  'Fase 2/3 only — si set, ChannexGateway usa esta API key en lugar del master. Null = Fase 1 (master + Group). Cifrar at-rest en v1.0.1+.';

-- ── PropertySettings: provisioning state machine ───────────────────────
ALTER TABLE "property_settings" ADD COLUMN "channex_provisioning_status" TEXT;
COMMENT ON COLUMN "property_settings"."channex_provisioning_status" IS
  'pending | in_progress | completed | partial | failed — set por ChannexProvisionService outside-tx';
ALTER TABLE "property_settings" ADD COLUMN "channex_provisioning_error" TEXT;
ALTER TABLE "property_settings" ADD COLUMN "channex_last_provisioned_at" TIMESTAMP(3);

-- ── Channels (OTA connections) — new model ─────────────────────────────
CREATE TABLE "channels" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "property_id" TEXT NOT NULL,
  "channex_channel_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'inactive',
  "settings_encrypted" TEXT,
  "last_synced_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "channels_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id")
);
CREATE UNIQUE INDEX "channels_channex_channel_id_key" ON "channels" ("channex_channel_id");
CREATE INDEX "idx_channels_property" ON "channels" ("property_id");
CREATE INDEX "idx_channels_status" ON "channels" ("status");

COMMENT ON TABLE "channels" IS
  'OTA channel connections per Property. settings_encrypted = AES-256-GCM ciphertext de credentials del cliente (Booking hotel_id+user+pass, Expedia eqc_id+user+pass, Airbnb listing_id). KEK en .env CHANNEX_CREDENTIALS_KEK. Status: inactive | pending_credentials | connected | requires_oauth | error.';
