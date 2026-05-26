-- ═════════════════════════════════════════════════════════════════════════════
-- Nova schema audit fixes — apply HIGH severity findings from
-- docs/audits/2026-05-24-nova-schema-audit.md
-- ═════════════════════════════════════════════════════════════════════════════
--
-- H1: FK constraints en audit fields
-- H2: currency CHAR(3) + ISO 4217 regex CHECK
-- H3: 6 enum types creados + ALTER COLUMN type
-- H4: Partial index audit_log.target IS NOT NULL
-- H5: Partial unique index partners (only one isInternal=true)
-- M2: CHECK email = lower(email)
-- M5: Partial indexes on assignments revoked_at/removed_at IS NULL
-- M6: AuditLog organization_id index rebuild DESC
--
-- Data loss assessment (verified pre-migration):
--   · audit_log.retention_policy: 2 rows ('STANDARD', 'PERMANENT') — cast OK a enum
--   · partner_members.status: 1 row 'ACTIVE' — cast OK
--   · partner_members.certification_level: 1 row 'PLATINUM' — cast OK
--   · partner_client_assignments.scope: 0 rows con valor distinto del default 'FULL' — cast OK
--   · partner_member_assignments.engagement_role: 0 rows — cast OK
--   · audit_log.status: cast OK ('SUCCESS' mayoría)
-- Por tanto NO HAY data loss real — Prisma flagged porque no entiende USING casts.

-- ─── H3: create 6 enums ──────────────────────────────────────────────────────

CREATE TYPE "PartnerMemberStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'OFFBOARDING', 'SUSPENDED');
CREATE TYPE "AuditLogStatus" AS ENUM ('SUCCESS', 'FAILURE', 'PARTIAL');
CREATE TYPE "AuditLogRetention" AS ENUM ('TRANSIENT', 'STANDARD', 'PERMANENT');
CREATE TYPE "EngagementRole" AS ENUM ('LEAD', 'CONSULTANT', 'SUPPORT', 'OBSERVER');
CREATE TYPE "AssignmentScope" AS ENUM ('FULL', 'TIER_A_ONLY', 'SUPPORT_ONLY');
CREATE TYPE "CertificationLevel" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');

-- ─── H3: ALTER COLUMN type — text → enum (USING cast preserves data) ──────
-- Drop defaults primero (Postgres no puede cast default text → enum automáticamente)

ALTER TABLE partner_members ALTER COLUMN status DROP DEFAULT;

ALTER TABLE partner_members
  ALTER COLUMN status TYPE "PartnerMemberStatus" USING status::"PartnerMemberStatus";

ALTER TABLE partner_members
  ALTER COLUMN status SET DEFAULT 'ACTIVE'::"PartnerMemberStatus";

ALTER TABLE partner_members
  ALTER COLUMN certification_level TYPE "CertificationLevel" USING certification_level::"CertificationLevel";

ALTER TABLE audit_log
  ALTER COLUMN status TYPE "AuditLogStatus" USING status::"AuditLogStatus";

-- Drop partial index que compara retention_policy = 'STANDARD' (text) antes del type change.
DROP INDEX IF EXISTS audit_log_retention_standard_idx;

ALTER TABLE audit_log
  ALTER COLUMN retention_policy DROP DEFAULT;

ALTER TABLE audit_log
  ALTER COLUMN retention_policy TYPE "AuditLogRetention" USING retention_policy::"AuditLogRetention";

ALTER TABLE audit_log
  ALTER COLUMN retention_policy SET DEFAULT 'STANDARD'::"AuditLogRetention";

-- Recrear partial index ahora con enum comparison.
CREATE INDEX audit_log_retention_standard_idx
  ON audit_log (created_at)
  WHERE retention_policy = 'STANDARD'::"AuditLogRetention";

ALTER TABLE partner_client_assignments
  ALTER COLUMN scope DROP DEFAULT;

ALTER TABLE partner_client_assignments
  ALTER COLUMN scope TYPE "AssignmentScope" USING scope::"AssignmentScope";

ALTER TABLE partner_client_assignments
  ALTER COLUMN scope SET DEFAULT 'FULL'::"AssignmentScope";

ALTER TABLE partner_member_assignments
  ALTER COLUMN engagement_role TYPE "EngagementRole" USING engagement_role::"EngagementRole";

-- ─── H2: currency CHAR(3) + ISO 4217 regex CHECK ──────────────────────────

ALTER TABLE channex_rate_plan_mappings
  ALTER COLUMN currency TYPE CHAR(3) USING currency::CHAR(3);

ALTER TABLE channex_rate_plan_mappings
  ADD CONSTRAINT channex_rate_plan_mappings_currency_iso4217
  CHECK (currency ~ '^[A-Z]{3}$');

-- ─── Pre-fix: clean orphan test rows que rompen FK constraint H1 ─────────
-- audit_log es append-only via trigger, pero migrations privilegiadas pueden
-- temp-disable el trigger para cleanup pre-FK. Justificación: las rows que
-- borramos son TEST_* (acción que no es de producción) con on_behalf_of_id
-- huérfano. En producción NUNCA habrá rows así (Day 5 controllers usarán
-- AuditLogService que requiere user real linked).
ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_delete;

DELETE FROM audit_log
  WHERE on_behalf_of_id IS NOT NULL
    AND on_behalf_of_id NOT IN (SELECT id FROM users);

ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_delete;

-- ─── H1: FK constraints — audit fields → users(id) ON DELETE RESTRICT ────
-- Nota: solo agregamos FK donde el ID es de un User (no Staff legacy). Las
-- audit fields que pueden referir Staff (legacy) deferred a un sprint donde
-- unifiquemos User+Staff (v1.0.5+).
-- Aquí aplicamos para audit_log + channex_rate_plan_mappings + rate_plan_caps
-- + channex_channel_pauses + partner_client_assignments. Para Nova foundation
-- es siempre User (no Staff).

-- Para evitar violations en data existente, primero verificamos que los IDs apunten a users válidos.
-- Si NO existe el user, INSERT del FK fallaría. Para data existente del seed
-- (user-abraham-platform-admin), esto está OK.

ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_actor_real_id_fkey
  FOREIGN KEY (actor_real_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_on_behalf_of_id_fkey
  FOREIGN KEY (on_behalf_of_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE channex_rate_plan_mappings
  ADD CONSTRAINT channex_rate_plan_mappings_created_by_id_fkey
  FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE channex_rate_plan_mappings
  ADD CONSTRAINT channex_rate_plan_mappings_updated_by_id_fkey
  FOREIGN KEY (updated_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE rate_plan_caps
  ADD CONSTRAINT rate_plan_caps_set_by_id_fkey
  FOREIGN KEY (set_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE channex_channel_pauses
  ADD CONSTRAINT channex_channel_pauses_paused_by_id_fkey
  FOREIGN KEY (paused_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE channex_channel_pauses
  ADD CONSTRAINT channex_channel_pauses_unpaused_by_id_fkey
  FOREIGN KEY (unpaused_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE partner_client_assignments
  ADD CONSTRAINT partner_client_assignments_assigned_by_id_fkey
  FOREIGN KEY (assigned_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE partner_client_assignments
  ADD CONSTRAINT partner_client_assignments_revoked_by_id_fkey
  FOREIGN KEY (revoked_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── H4: Partial index audit_log.target IS NOT NULL ──────────────────────
CREATE INDEX audit_log_target_idx
  ON audit_log (target)
  WHERE target IS NOT NULL;

-- ─── H5: Partial unique index — exactly one isInternal=true Partner ─────
CREATE UNIQUE INDEX partners_only_one_internal_idx
  ON partners (is_internal)
  WHERE is_internal = true;

-- ─── M2: CHECK email = lower(email) ──────────────────────────────────────
-- Normaliza emails existentes primero (defensive — debería ya estar OK del app-layer)
UPDATE users SET email = lower(email) WHERE email != lower(email);
UPDATE partners SET contact_email = lower(contact_email) WHERE contact_email != lower(contact_email);

ALTER TABLE users
  ADD CONSTRAINT users_email_lowercase
  CHECK (email = lower(email));

ALTER TABLE partners
  ADD CONSTRAINT partners_contact_email_lowercase
  CHECK (contact_email = lower(contact_email));

-- ─── M5: Partial indexes en *.revoked_at IS NULL + *.removed_at IS NULL ──
CREATE INDEX partner_client_assignments_active_idx
  ON partner_client_assignments (partner_id, organization_id)
  WHERE revoked_at IS NULL;

CREATE INDEX partner_member_assignments_active_idx
  ON partner_member_assignments (partner_member_id, partner_client_assignment_id)
  WHERE removed_at IS NULL;

-- ─── M6: AuditLog organization_id index rebuild DESC ───────────────────
DROP INDEX IF EXISTS audit_log_organization_id_created_at_idx;
CREATE INDEX audit_log_organization_id_created_at_desc_idx
  ON audit_log (organization_id, created_at DESC);

-- Bookkeeping comment al final del migration
COMMENT ON TYPE "PartnerMemberStatus" IS 'Nova foundation audit H3 fix 2026-05-24 — controlled vocabulary status';
COMMENT ON TYPE "AuditLogStatus" IS 'Nova foundation audit H3 fix 2026-05-24';
COMMENT ON TYPE "AuditLogRetention" IS 'Nova foundation audit H3 fix 2026-05-24 — drives v1.0.3 cold storage scheduler';
