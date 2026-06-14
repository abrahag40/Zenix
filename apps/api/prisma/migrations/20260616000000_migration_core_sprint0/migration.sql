-- MIGRATION-CORE / Zenix Onboard — Sprint 0 (staging del motor de migración).
-- Plan: docs/sprints/MIGRATION-CORE-plan.md. Solo statements de este cambio
-- (se excluye drift pre-existente de webhook_deliveries del diff).

-- AlterTable: trazabilidad + idempotencia de migración en GuestStay
ALTER TABLE "guest_stays" ADD COLUMN     "migration_job_id" TEXT,
ADD COLUMN     "migration_source_id" TEXT;

-- CreateTable
CREATE TABLE "migration_jobs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "source_system" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "file_name" TEXT,
    "file_hash" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "column_mapping" JSONB,
    "counts" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "migration_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_staging_reservations" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "row_index" INTEGER NOT NULL,
    "raw_json" JSONB NOT NULL,
    "mapped" JSONB,
    "validation_status" TEXT NOT NULL DEFAULT 'OK',
    "issues" JSONB,
    "resolution" TEXT NOT NULL DEFAULT 'PENDING',
    "target_room_id" TEXT,
    "resolution_reason" TEXT,

    CONSTRAINT "migration_staging_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_staging_guests" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "raw_json" JSONB NOT NULL,
    "mapped" JSONB,
    "merge_into_guest_id" TEXT,

    CONSTRAINT "migration_staging_guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_conflicts" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'WARN',
    "row_refs" JSONB NOT NULL,
    "message" TEXT,
    "suggestion" JSONB,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "migration_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "migration_jobs_organization_id_property_id_idx" ON "migration_jobs"("organization_id", "property_id");
CREATE INDEX "migration_jobs_status_idx" ON "migration_jobs"("status");
CREATE INDEX "migration_jobs_property_id_file_hash_idx" ON "migration_jobs"("property_id", "file_hash");
CREATE INDEX "migration_staging_reservations_job_id_idx" ON "migration_staging_reservations"("job_id");
CREATE INDEX "migration_staging_reservations_job_id_validation_status_idx" ON "migration_staging_reservations"("job_id", "validation_status");
CREATE INDEX "migration_staging_guests_job_id_idx" ON "migration_staging_guests"("job_id");
CREATE INDEX "migration_conflicts_job_id_idx" ON "migration_conflicts"("job_id");
CREATE INDEX "migration_conflicts_job_id_type_idx" ON "migration_conflicts"("job_id", "type");
CREATE INDEX "guest_stays_migration_job_id_idx" ON "guest_stays"("migration_job_id");
CREATE UNIQUE INDEX "guest_stays_migration_job_id_migration_source_id_key" ON "guest_stays"("migration_job_id", "migration_source_id");

-- AddForeignKey
ALTER TABLE "guest_stays" ADD CONSTRAINT "guest_stays_migration_job_id_fkey" FOREIGN KEY ("migration_job_id") REFERENCES "migration_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "migration_staging_reservations" ADD CONSTRAINT "migration_staging_reservations_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "migration_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "migration_staging_guests" ADD CONSTRAINT "migration_staging_guests_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "migration_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "migration_conflicts" ADD CONSTRAINT "migration_conflicts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "migration_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
