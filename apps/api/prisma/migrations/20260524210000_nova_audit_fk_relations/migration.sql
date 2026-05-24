-- ═════════════════════════════════════════════════════════════════════════════
-- Nova audit — FK relations to users(id) ON DELETE RESTRICT
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Migration que documenta las FK constraints declaradas via Prisma @relation
-- en schema.prisma. Sirve para reproducibilidad: cualquier `prisma migrate reset`
-- recrea las FKs sin depender de `db push`.
--
-- Audit H1 fix 2026-05-24:
--   · Toda columna *_by_id que apunta a un User debe tener FK ON DELETE RESTRICT
--   · NEVER permitir hard-delete de usuarios con audit history
--   · Compliance Visa CRR §5.9.2 + CFDI Art. 30 CFF + GDPR Art. 17.3.b
--
-- Defense-in-depth: TenantContextService (app-layer) también rechaza acciones
-- desde tier ORG_STAFF sobre audit fields, pero el FK provee guarantee final.

-- Si las FKs ya existen (caso post-db-push), los ADD CONSTRAINT son no-op via IF NOT EXISTS.
-- Postgres no soporta IF NOT EXISTS en ALTER TABLE ADD CONSTRAINT directamente,
-- usamos DO block.

DO $$
BEGIN
  -- audit_log
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_actor_real_id_fkey') THEN
    ALTER TABLE audit_log
      ADD CONSTRAINT audit_log_actor_real_id_fkey
      FOREIGN KEY (actor_real_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_on_behalf_of_id_fkey') THEN
    ALTER TABLE audit_log
      ADD CONSTRAINT audit_log_on_behalf_of_id_fkey
      FOREIGN KEY (on_behalf_of_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- channex_rate_plan_mappings
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'channex_rate_plan_mappings_created_by_id_fkey') THEN
    ALTER TABLE channex_rate_plan_mappings
      ADD CONSTRAINT channex_rate_plan_mappings_created_by_id_fkey
      FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'channex_rate_plan_mappings_updated_by_id_fkey') THEN
    ALTER TABLE channex_rate_plan_mappings
      ADD CONSTRAINT channex_rate_plan_mappings_updated_by_id_fkey
      FOREIGN KEY (updated_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- rate_plan_caps
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rate_plan_caps_set_by_id_fkey') THEN
    ALTER TABLE rate_plan_caps
      ADD CONSTRAINT rate_plan_caps_set_by_id_fkey
      FOREIGN KEY (set_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- channex_channel_pauses
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'channex_channel_pauses_paused_by_id_fkey') THEN
    ALTER TABLE channex_channel_pauses
      ADD CONSTRAINT channex_channel_pauses_paused_by_id_fkey
      FOREIGN KEY (paused_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'channex_channel_pauses_unpaused_by_id_fkey') THEN
    ALTER TABLE channex_channel_pauses
      ADD CONSTRAINT channex_channel_pauses_unpaused_by_id_fkey
      FOREIGN KEY (unpaused_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- partner_client_assignments
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_client_assignments_assigned_by_id_fkey') THEN
    ALTER TABLE partner_client_assignments
      ADD CONSTRAINT partner_client_assignments_assigned_by_id_fkey
      FOREIGN KEY (assigned_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_client_assignments_revoked_by_id_fkey') THEN
    ALTER TABLE partner_client_assignments
      ADD CONSTRAINT partner_client_assignments_revoked_by_id_fkey
      FOREIGN KEY (revoked_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── DEFAULT CURRENT_TIMESTAMP en updated_at (idempotente, safe to re-run) ──
ALTER TABLE partners ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE channex_rate_plan_mappings ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE rate_plan_caps ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
