-- CreateEnum
CREATE TYPE "PartnerTier" AS ENUM ('AUTHORIZED', 'SILVER', 'GOLD', 'PLATINUM');

-- CreateEnum
CREATE TYPE "PartnerMemberRole" AS ENUM ('PARTNER_ADMIN', 'LEAD_CONSULTANT', 'SOLUTION_CONSULTANT', 'SUPPORT_L1', 'SUPPORT_L2', 'SUPPORT_L3', 'SALES_REP', 'TRAINEE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SystemRole" ADD VALUE 'PLATFORM_ADMIN';
ALTER TYPE "SystemRole" ADD VALUE 'PARTNER_ADMIN';
ALTER TYPE "SystemRole" ADD VALUE 'PARTNER_MEMBER';
ALTER TYPE "SystemRole" ADD VALUE 'ORG_OWNER';

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_organization_id_fkey";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "system_role" "SystemRole" NOT NULL DEFAULT 'OWNER',
ALTER COLUMN "organization_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" "PartnerTier" NOT NULL DEFAULT 'AUTHORIZED',
    "country_code" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT,
    "license_valid_until" TIMESTAMP(3) NOT NULL,
    "parent_partner_id" TEXT,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_members" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "PartnerMemberRole" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "certified_at" TIMESTAMP(3),
    "certification_level" TEXT,

    CONSTRAINT "partner_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_client_assignments" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'FULL',
    "assigned_by_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_id" TEXT,

    CONSTRAINT "partner_client_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_member_assignments" (
    "id" TEXT NOT NULL,
    "partner_client_assignment_id" TEXT NOT NULL,
    "partner_member_id" TEXT NOT NULL,
    "engagement_role" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "partner_member_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "actor_real_id" TEXT NOT NULL,
    "actor_real_role" "SystemRole" NOT NULL,
    "on_behalf_of_id" TEXT,
    "on_behalf_of_role" "SystemRole",
    "action" TEXT NOT NULL,
    "target" TEXT,
    "payload" JSONB NOT NULL,
    "channex_response" JSONB,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "error_message" TEXT,
    "retention_policy" TEXT NOT NULL DEFAULT 'STANDARD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partners_tier_idx" ON "partners"("tier");

-- CreateIndex
CREATE INDEX "partners_is_internal_idx" ON "partners"("is_internal");

-- CreateIndex
CREATE INDEX "partners_parent_partner_id_idx" ON "partners"("parent_partner_id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_members_user_id_key" ON "partner_members"("user_id");

-- CreateIndex
CREATE INDEX "partner_members_partner_id_role_idx" ON "partner_members"("partner_id", "role");

-- CreateIndex
CREATE INDEX "partner_members_status_idx" ON "partner_members"("status");

-- CreateIndex
CREATE INDEX "partner_client_assignments_organization_id_idx" ON "partner_client_assignments"("organization_id");

-- CreateIndex
CREATE INDEX "partner_client_assignments_assigned_at_idx" ON "partner_client_assignments"("assigned_at");

-- CreateIndex
CREATE UNIQUE INDEX "partner_client_assignments_partner_id_organization_id_key" ON "partner_client_assignments"("partner_id", "organization_id");

-- CreateIndex
CREATE INDEX "partner_member_assignments_partner_member_id_idx" ON "partner_member_assignments"("partner_member_id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_member_assignments_partner_client_assignment_id_par_key" ON "partner_member_assignments"("partner_client_assignment_id", "partner_member_id");

-- CreateIndex
CREATE INDEX "audit_log_organization_id_created_at_idx" ON "audit_log"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_actor_real_id_created_at_idx" ON "audit_log"("actor_real_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_on_behalf_of_id_idx" ON "audit_log"("on_behalf_of_id");

-- CreateIndex
CREATE INDEX "audit_log_action_idx" ON "audit_log"("action");

-- CreateIndex
CREATE INDEX "audit_log_retention_policy_created_at_idx" ON "audit_log"("retention_policy", "created_at");

-- CreateIndex
CREATE INDEX "users_system_role_idx" ON "users"("system_role");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_parent_partner_id_fkey" FOREIGN KEY ("parent_partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_members" ADD CONSTRAINT "partner_members_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_members" ADD CONSTRAINT "partner_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_client_assignments" ADD CONSTRAINT "partner_client_assignments_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_client_assignments" ADD CONSTRAINT "partner_client_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_member_assignments" ADD CONSTRAINT "partner_member_assignments_partner_client_assignment_id_fkey" FOREIGN KEY ("partner_client_assignment_id") REFERENCES "partner_client_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_member_assignments" ADD CONSTRAINT "partner_member_assignments_partner_member_id_fkey" FOREIGN KEY ("partner_member_id") REFERENCES "partner_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═════════════════════════════════════════════════════════════════════════════
-- Nova foundation — Postgres-level guards (Sprint NOVA-CHANNEX-COMMAND-CENTER)
-- ═════════════════════════════════════════════════════════════════════════════

-- §165 D-NOVA-7: AuditLog append-only — trigger bloquea UPDATE y DELETE.
-- Compliance Visa CRR §5.9.2 + CFDI Art. 30 CFF + GDPR Art. 17.3.b.
CREATE OR REPLACE FUNCTION audit_log_append_only_guard() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log es append-only — operación % no permitida (Nova D-NOVA-7)', TG_OP
    USING HINT = 'Para retention/expiry, mover a cold storage partition via REPORTS-CORE scheduler. Para anonimización GDPR, usar UPDATE solo en columnas payload con función dedicada.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only_guard();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only_guard();

-- §165 D-NOVA-7: `reason` REQUIRED cuando hay impersonation (on_behalf_of_id != null).
-- SAP S/4HANA pattern: toda acción "on behalf of" debe justificarse para audit.
ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_reason_required_on_impersonation
  CHECK (
    (on_behalf_of_id IS NULL AND on_behalf_of_role IS NULL)
    OR (on_behalf_of_id IS NOT NULL AND reason IS NOT NULL AND length(trim(reason)) > 0)
  );

-- §161 D-NOVA-3: PLATFORM_ADMIN solo permitido en Partners con is_internal=true.
-- ZaharDev es el único Partner con is_internal=true. Cualquier intento de crear
-- un PartnerMember con role=PLATFORM_ADMIN en un Partner externo falla.
-- NOTA: enforcement final en app-layer (TenantContextService) — este trigger
-- es defense-in-depth a nivel DB para evitar bypass via SQL directo.
CREATE OR REPLACE FUNCTION partner_member_platform_admin_guard() RETURNS TRIGGER AS $$
DECLARE
  partner_is_internal BOOLEAN;
  user_system_role TEXT;
BEGIN
  -- Solo verificamos si el usuario asociado tiene systemRole = PLATFORM_ADMIN
  SELECT system_role INTO user_system_role FROM users WHERE id = NEW.user_id;

  IF user_system_role = 'PLATFORM_ADMIN' THEN
    SELECT is_internal INTO partner_is_internal FROM partners WHERE id = NEW.partner_id;
    IF NOT partner_is_internal THEN
      RAISE EXCEPTION 'PLATFORM_ADMIN solo permitido en Partner con is_internal=true (Nova D-NOVA-3)'
        USING HINT = 'Solo ZaharDev (isInternal=true) puede tener members PLATFORM_ADMIN.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER partner_member_platform_admin_check
  BEFORE INSERT OR UPDATE ON partner_members
  FOR EACH ROW EXECUTE FUNCTION partner_member_platform_admin_guard();

-- §164 D-NOVA-6: Sub-partners solo permitidos para PLATINUM tier.
-- Si parent_partner_id NOT NULL, el parent debe ser tier PLATINUM.
CREATE OR REPLACE FUNCTION partner_subpartner_platinum_guard() RETURNS TRIGGER AS $$
DECLARE
  parent_tier TEXT;
BEGIN
  IF NEW.parent_partner_id IS NOT NULL THEN
    SELECT tier::text INTO parent_tier FROM partners WHERE id = NEW.parent_partner_id;
    IF parent_tier IS NULL THEN
      RAISE EXCEPTION 'Parent partner % no existe', NEW.parent_partner_id;
    END IF;
    IF parent_tier != 'PLATINUM' THEN
      RAISE EXCEPTION 'Sub-partners solo permitidos para Partner tier PLATINUM (Nova D-NOVA-6) — parent es %', parent_tier
        USING HINT = 'Eleva el parent a PLATINUM o quita parent_partner_id (Partner independiente).';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER partner_subpartner_check
  BEFORE INSERT OR UPDATE ON partners
  FOR EACH ROW EXECUTE FUNCTION partner_subpartner_platinum_guard();

-- §167 D-NOVA-9: índice parcial para queries fast del scheduler cold-storage
-- que va a mover entries STANDARD >365d a partition. PERMANENT nunca se mueve.
CREATE INDEX audit_log_retention_standard_idx
  ON audit_log (created_at)
  WHERE retention_policy = 'STANDARD';
