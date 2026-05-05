-- FeatureFlag + FeatureFlagAuditLog
-- Toggles persistentes server-side para testing y rollouts graduales.
-- Audit log es append-only: cumple §11 (registros inmutables).

CREATE TABLE "feature_flags" (
  "id"            TEXT        NOT NULL,
  "key"           TEXT        NOT NULL,
  "enabled"       BOOLEAN     NOT NULL DEFAULT false,
  "property_id"   TEXT,
  "config"        JSONB,
  "description"   TEXT,
  "updated_by_id" TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");
CREATE INDEX "feature_flags_key_idx"        ON "feature_flags"("key");
CREATE INDEX "feature_flags_property_id_idx" ON "feature_flags"("property_id");

ALTER TABLE "feature_flags"
  ADD CONSTRAINT "feature_flags_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "feature_flags"
  ADD CONSTRAINT "feature_flags_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "housekeeping_staff"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "feature_flag_audit_logs" (
  "id"             TEXT        NOT NULL,
  "flag_id"        TEXT        NOT NULL,
  "flag_key"       TEXT        NOT NULL,
  "action"         TEXT        NOT NULL,
  "previous_value" JSONB,
  "new_value"      JSONB,
  "actor_id"       TEXT,
  "actor_role"     TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feature_flag_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "feature_flag_audit_logs_flag_key_created_at_idx"
  ON "feature_flag_audit_logs"("flag_key", "created_at");
CREATE INDEX "feature_flag_audit_logs_actor_id_idx"
  ON "feature_flag_audit_logs"("actor_id");

ALTER TABLE "feature_flag_audit_logs"
  ADD CONSTRAINT "feature_flag_audit_logs_flag_id_fkey"
  FOREIGN KEY ("flag_id") REFERENCES "feature_flags"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feature_flag_audit_logs"
  ADD CONSTRAINT "feature_flag_audit_logs_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "housekeeping_staff"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
