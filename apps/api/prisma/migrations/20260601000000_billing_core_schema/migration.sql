-- ═════════════════════════════════════════════════════════════════════════════
-- Sprint BILLING-CORE (v1.1.0) — Schema base
-- ═════════════════════════════════════════════════════════════════════════════
--
-- 8 tablas nuevas para soportar el cobro recurrente de la suscripción Zenix:
--   1. subscriptions                  — mirror local de Stripe Subscriptions
--   2. subscription_discounts         — historial de descuentos aplicados
--   3. subscription_events            — audit append-only lifecycle + webhook dedup
--   4. invoices                       — mirror local de Stripe Invoices
--   5. retention_save_offers          — tracking de save offer ladder outcomes
--   6. consultor_discount_templates   — "mis códigos favoritos" del consultor
--   7. billing_pricing_config         — pricing tiers modificables por PLATFORM_ADMIN
--   8. billing_partner_tier_caps      — cap % discount per partner tier
--   9. terms_and_conditions_versions  — T&C versionado
--  10. terms_acceptances              — registro de aceptación per Org × Version
--
-- Decisiones D-BILL-1..10 en docs/sprints/BILLING-CORE-plan.md §1.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. subscriptions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "subscriptions" (
  "id"                     TEXT NOT NULL,
  "organization_id"        TEXT NOT NULL,
  "stripe_customer_id"     TEXT NOT NULL,
  "stripe_subscription_id" TEXT NOT NULL,
  "plan_tier"              TEXT NOT NULL,
  "status"                 TEXT NOT NULL,
  "billing_cycle"          TEXT NOT NULL DEFAULT 'monthly',
  "annual_discount_pct"    INTEGER,
  "current_period_start"   TIMESTAMP(3) NOT NULL,
  "current_period_end"     TIMESTAMP(3) NOT NULL,
  "cancel_at_period_end"   BOOLEAN NOT NULL DEFAULT false,
  "cancelled_at"           TIMESTAMP(3),
  "cancellation_reason"    TEXT,
  "paused_at"              TIMESTAMP(3),
  "paused_until"           TIMESTAMP(3),
  "trial_started_at"       TIMESTAMP(3),
  "trial_ends_at"          TIMESTAMP(3),
  "trial_negotiated_by"    TEXT,
  "base_monthly_amount"    DECIMAL(65,30) NOT NULL,
  "currency"               TEXT NOT NULL DEFAULT 'MXN',
  "property_count"         INTEGER NOT NULL,
  "next_renewal_date"      TIMESTAMP(3) NOT NULL,
  "auto_renew"             BOOLEAN NOT NULL DEFAULT true,
  "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"             TIMESTAMP(3) NOT NULL,

  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriptions_organization_id_key" ON "subscriptions"("organization_id");
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");
CREATE INDEX "subscriptions_next_renewal_date_idx" ON "subscriptions"("next_renewal_date");

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. subscription_discounts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "subscription_discounts" (
  "id"                       TEXT NOT NULL,
  "subscription_id"          TEXT NOT NULL,
  "stripe_coupon_id"         TEXT NOT NULL,
  "stripe_promotion_code_id" TEXT,
  "promotion_code"           TEXT NOT NULL,
  "percent_off"              INTEGER,
  "amount_off"               DECIMAL(65,30),
  "duration"                 TEXT NOT NULL,
  "duration_in_months"       INTEGER,
  "generated_by_id"          TEXT NOT NULL,
  "generated_by_role"        TEXT NOT NULL,
  "reason"                   TEXT NOT NULL,
  "approved_by_id"           TEXT,
  "approved_at"              TIMESTAMP(3),
  "applied_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at"               TIMESTAMP(3),

  CONSTRAINT "subscription_discounts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscription_discounts_subscription_id_idx" ON "subscription_discounts"("subscription_id");
CREATE INDEX "subscription_discounts_generated_by_id_idx" ON "subscription_discounts"("generated_by_id");

ALTER TABLE "subscription_discounts"
  ADD CONSTRAINT "subscription_discounts_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. subscription_events (append-only audit + webhook dedup)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "subscription_events" (
  "id"               TEXT NOT NULL,
  "subscription_id"  TEXT NOT NULL,
  "type"             TEXT NOT NULL,
  "payload"          JSONB NOT NULL,
  "stripe_event_id"  TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscription_events_stripe_event_id_key" ON "subscription_events"("stripe_event_id");
CREATE INDEX "subscription_events_subscription_id_type_idx" ON "subscription_events"("subscription_id", "type");

ALTER TABLE "subscription_events"
  ADD CONSTRAINT "subscription_events_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Append-only trigger — prevents UPDATE/DELETE (consistent con AuditLog universal)
CREATE OR REPLACE FUNCTION prevent_subscription_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'subscription_events es append-only; UPDATE/DELETE bloqueado';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscription_events_no_update
  BEFORE UPDATE ON "subscription_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_subscription_event_mutation();

CREATE TRIGGER subscription_events_no_delete
  BEFORE DELETE ON "subscription_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_subscription_event_mutation();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. invoices
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "invoices" (
  "id"                  TEXT NOT NULL,
  "subscription_id"     TEXT NOT NULL,
  "organization_id"     TEXT NOT NULL,
  "stripe_invoice_id"   TEXT NOT NULL,
  "number"              TEXT NOT NULL,
  "status"              TEXT NOT NULL,
  "total"               DECIMAL(65,30) NOT NULL,
  "subtotal"            DECIMAL(65,30) NOT NULL,
  "discount"            DECIMAL(65,30) NOT NULL DEFAULT 0,
  "tax"                 DECIMAL(65,30) NOT NULL DEFAULT 0,
  "currency"            TEXT NOT NULL,
  "period_start"        TIMESTAMP(3) NOT NULL,
  "period_end"          TIMESTAMP(3) NOT NULL,
  "paid_at"             TIMESTAMP(3),
  "due_at"              TIMESTAMP(3) NOT NULL,
  "hosted_invoice_url"  TEXT,
  "invoice_pdf_url"     TEXT,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoices_stripe_invoice_id_key" ON "invoices"("stripe_invoice_id");
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");
CREATE INDEX "invoices_organization_id_idx" ON "invoices"("organization_id");
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. retention_save_offers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "retention_save_offers" (
  "id"                   TEXT NOT NULL,
  "subscription_id"      TEXT NOT NULL,
  "cancellation_reason"  TEXT NOT NULL,
  "offer_shown"          JSONB NOT NULL,
  "outcome"              TEXT NOT NULL,
  "accepted_at"          TIMESTAMP(3),
  "rejected_at"          TIMESTAMP(3),
  "applied_discount_id"  TEXT,
  "applied_pause_until"  TIMESTAMP(3),
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "retention_save_offers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "retention_save_offers_subscription_id_idx" ON "retention_save_offers"("subscription_id");
CREATE INDEX "retention_save_offers_cancellation_reason_idx" ON "retention_save_offers"("cancellation_reason");

ALTER TABLE "retention_save_offers"
  ADD CONSTRAINT "retention_save_offers_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. consultor_discount_templates ("mis códigos favoritos")
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "consultor_discount_templates" (
  "id"                  TEXT NOT NULL,
  "consultor_id"        TEXT NOT NULL,
  "name"                TEXT NOT NULL,
  "percent_off"         INTEGER NOT NULL,
  "duration"            TEXT NOT NULL,
  "duration_in_months"  INTEGER,
  "is_favorite"         BOOLEAN NOT NULL DEFAULT false,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "consultor_discount_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "consultor_discount_templates_consultor_id_idx" ON "consultor_discount_templates"("consultor_id");

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. billing_pricing_config (modifiable por PLATFORM_ADMIN)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "billing_pricing_config" (
  "id"                  TEXT NOT NULL,
  "tier"                TEXT NOT NULL,
  "display_name"        TEXT NOT NULL,
  "monthly_amount_mxn"  DECIMAL(65,30) NOT NULL,
  "monthly_amount_usd"  DECIMAL(65,30) NOT NULL,
  "features"            JSONB NOT NULL,
  "is_active"           BOOLEAN NOT NULL DEFAULT true,
  "stripe_product_id"   TEXT,
  "stripe_price_id_mxn" TEXT,
  "stripe_price_id_usd" TEXT,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  "updated_by_id"       TEXT,

  CONSTRAINT "billing_pricing_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_pricing_config_tier_key" ON "billing_pricing_config"("tier");

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. billing_partner_tier_caps
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "billing_partner_tier_caps" (
  "tier"                 TEXT NOT NULL,
  "max_discount_pct"     INTEGER NOT NULL,
  "max_duration_months"  INTEGER,
  "requires_approval"    BOOLEAN NOT NULL DEFAULT false,
  "updated_at"           TIMESTAMP(3) NOT NULL,
  "updated_by_id"        TEXT,

  CONSTRAINT "billing_partner_tier_caps_pkey" PRIMARY KEY ("tier")
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. terms_and_conditions_versions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "terms_and_conditions_versions" (
  "id"                  TEXT NOT NULL,
  "version"             TEXT NOT NULL,
  "effective_from"      TIMESTAMP(3) NOT NULL,
  "content_markdown"    TEXT NOT NULL,
  "content_html"        TEXT,
  "pdf_storage_url"     TEXT,
  "sha256_hash"         TEXT NOT NULL,
  "language"            TEXT NOT NULL DEFAULT 'es',
  "is_current"          BOOLEAN NOT NULL DEFAULT false,
  "created_by"          TEXT NOT NULL,
  "legal_reviewed_by"   TEXT,
  "legal_reviewed_at"   TIMESTAMP(3),
  "changelog"           TEXT,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "terms_and_conditions_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "terms_and_conditions_versions_version_key" ON "terms_and_conditions_versions"("version");
CREATE UNIQUE INDEX "terms_and_conditions_versions_sha256_hash_key" ON "terms_and_conditions_versions"("sha256_hash");
CREATE INDEX "terms_and_conditions_versions_language_is_current_idx" ON "terms_and_conditions_versions"("language", "is_current");

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. terms_acceptances
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "terms_acceptances" (
  "id"                  TEXT NOT NULL,
  "organization_id"     TEXT NOT NULL,
  "terms_version_id"    TEXT NOT NULL,
  "accepted_by_user_id" TEXT NOT NULL,
  "accepted_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip_address"          TEXT,
  "user_agent"          TEXT,
  "acceptance_context"  TEXT NOT NULL,

  CONSTRAINT "terms_acceptances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "terms_acceptances_organization_id_terms_version_id_key" ON "terms_acceptances"("organization_id", "terms_version_id");
CREATE INDEX "terms_acceptances_organization_id_idx" ON "terms_acceptances"("organization_id");
CREATE INDEX "terms_acceptances_terms_version_id_idx" ON "terms_acceptances"("terms_version_id");

ALTER TABLE "terms_acceptances"
  ADD CONSTRAINT "terms_acceptances_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "terms_acceptances"
  ADD CONSTRAINT "terms_acceptances_terms_version_id_fkey"
  FOREIGN KEY ("terms_version_id") REFERENCES "terms_and_conditions_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed inicial — partner tier caps (basado en decisión owner 2026-05-26)
-- Owner aprobó: AUTHORIZED 15% / SILVER 25% / GOLD 35% / PLATINUM 50%
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "billing_partner_tier_caps" ("tier", "max_discount_pct", "max_duration_months", "requires_approval", "updated_at")
VALUES
  ('AUTHORIZED', 15, 3,  false, CURRENT_TIMESTAMP),
  ('SILVER',     25, 6,  false, CURRENT_TIMESTAMP),
  ('GOLD',       35, 12, false, CURRENT_TIMESTAMP),
  ('PLATINUM',   50, NULL, false, CURRENT_TIMESTAMP);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed inicial — pricing config (basado en propuesta vision/15 + 16)
-- Stripe Product + Price IDs se completan al ejecutar seed-stripe-products.ts
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "billing_pricing_config" ("id", "tier", "display_name", "monthly_amount_mxn", "monthly_amount_usd", "features", "is_active", "updated_at")
VALUES
  (
    gen_random_uuid()::TEXT,
    'STARTER',
    'Plan Starter',
    1200,
    60,
    '{"properties": 1, "otas": 1, "support": "email", "features": ["pms", "housekeeping", "no_shows", "basic_reports"]}'::jsonb,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid()::TEXT,
    'PRO',
    'Plan Pro',
    2400,
    120,
    '{"properties": "unlimited", "otas": "unlimited", "support": "chat", "features": ["pms", "housekeeping", "no_shows", "multi_ota", "messaging", "sign_dlc", "rate_intelligence", "reports_advanced"]}'::jsonb,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid()::TEXT,
    'ENTERPRISE',
    'Plan Enterprise',
    4800,
    240,
    '{"properties": "unlimited", "otas": "unlimited", "support": "csm_dedicated", "features": ["all_pro", "market_intel", "demand_intel", "csm_dedicated", "sla_99_95"]}'::jsonb,
    true,
    CURRENT_TIMESTAMP
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- COMMENTS para documentación inline
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE "subscriptions" IS
  'Mirror local de Stripe Subscriptions. 1:1 con Organization. Stripe es source of truth — esta tabla se actualiza via webhook handlers.';
COMMENT ON TABLE "subscription_events" IS
  'Append-only audit trail del lifecycle de Subscription. Trigger PostgreSQL bloquea UPDATE/DELETE. Stripe webhook events se persisten aquí con dedup por stripe_event_id UNIQUE.';
COMMENT ON TABLE "subscription_discounts" IS
  'Historial completo de descuentos otorgados al cliente. Audit trail con reason + generated_by_id obligatorios (cumple §D-BILL-10).';
COMMENT ON TABLE "terms_and_conditions_versions" IS
  'T&C versionado. Borrador v0.9 vigente para pre-piloto; v1.0 final tras validación abogado mercantil mexicano senior.';
COMMENT ON TABLE "terms_acceptances" IS
  'Registro inmutable de aceptación del cliente por versión de T&C. Incluye IP + user_agent + context (WIZARD_ACTIVATION | TC_UPDATE | MANUAL_OWNER | PILOT_DOCUSIGN) para auditoría legal.';
COMMENT ON TABLE "billing_pricing_config" IS
  'Pricing tiers modificable por PLATFORM_ADMIN sin requerir deploy (§D-BILL-EXT pricing-admin). Existing subscriptions tienen Stripe Price snapshot inmutable (grandfather pricing).';
COMMENT ON TABLE "billing_partner_tier_caps" IS
  'Cap máximo discount % per partner tier. Aprobado owner 2026-05-26: AUTHORIZED 15% / SILVER 25% / GOLD 35% / PLATINUM 50% / PLATFORM ∞.';
