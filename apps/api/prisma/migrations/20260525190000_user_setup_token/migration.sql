-- ═════════════════════════════════════════════════════════════════════════════
-- Sprint NOVA-CHANNEX-COMMAND-CENTER Day 17 — Wizard Zenix Activate setup token
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Adds 3 columns to `users` for the Org Owner activation flow (§174 D-NOVA-16):
--
--   setup_token_hash         — SHA256 hash of the raw token (raw NEVER persists)
--   setup_token_expires_at   — 72h TTL from creation
--   setup_token_consumed_at  — set on first use; future requests with same
--                              hash return 410 Gone (single-use guarantee)
--
-- Single-use design:
--   1. WizardActivationService.activate() generates raw token (32 bytes hex),
--      writes hash + expiresAt + isActive=false on the Org Owner User.
--   2. Org Owner clicks link → GET /v1/auth/setup/:rawToken
--      Server hashes :rawToken, finds matching User where consumedAt IS NULL
--      AND expiresAt > now. Returns metadata.
--   3. Org Owner submits password → POST /v1/auth/setup/:rawToken { password }
--      Server validates again, sets passwordHash + isActive=true + consumedAt=now.
--      Re-uses of the same token → 410 Gone.
--
-- Index strategy:
--   · UNIQUE constraint on setup_token_hash → O(1) lookup + collision safety.
--   · NULL values explicitly allowed (most users never go through setup flow).
--
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "setup_token_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "setup_token_expires_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "setup_token_consumed_at" TIMESTAMP(3);

-- UNIQUE constraint sobre el hash. PostgreSQL permite NULLs múltiples en UNIQUE
-- por default — perfecto para esta columna (la mayoría de users tienen NULL).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'users_setup_token_hash_key'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_setup_token_hash_key" UNIQUE ("setup_token_hash");
  END IF;
END $$;

-- Comentarios documentales (Postgres lo soporta nativo)
COMMENT ON COLUMN "users"."setup_token_hash" IS
  'SHA256 hash of raw setup token (Day 17 §174 D-NOVA-16). Raw token never persists.';
COMMENT ON COLUMN "users"."setup_token_expires_at" IS
  '72h TTL from token creation. After this, GET/POST /v1/auth/setup/:token returns 410.';
COMMENT ON COLUMN "users"."setup_token_consumed_at" IS
  'Single-use marker. Set on successful activation. Future requests with same hash → 410 Gone.';
