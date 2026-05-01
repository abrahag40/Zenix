-- ============================================================================
-- Sprint 8H — Housekeeping Scheduling Foundation
-- ============================================================================
-- Adds infrastructure for shift management, room coverage, auto-assignment,
-- carryover, clock-in/out (USALI compliance), and supervisor-managed staff
-- preferences. See plan vamos-a-comenzar-a-federated-kitten.md and CLAUDE.md
-- §35-§46 (D1-D12) for design rationale.
--
-- This migration is purely additive. No data is removed.
-- ============================================================================

-- CreateEnum: tipos para cancelación de tareas y extensiones (D12)
CREATE TYPE "CleaningCancelReason" AS ENUM (
  'EXTENSION_NO_CLEANING',
  'EXTENSION_WITH_CLEANING',
  'GUEST_NEVER_CHECKED_IN',
  'RECEPTIONIST_MANUAL',
  'STAFF_ABSENCE_CLEANUP',
  'DUPLICATE'
);

CREATE TYPE "ExtensionFlag" AS ENUM ('WITH_CLEANING', 'WITHOUT_CLEANING');

-- CreateEnum: política de carryover (default REASSIGN_TO_TODAY_SHIFT)
CREATE TYPE "CarryoverPolicy" AS ENUM (
  'REASSIGN_TO_TODAY_SHIFT',
  'KEEP_ORIGINAL_ASSIGNEE',
  'ALWAYS_UNASSIGNED'
);

-- CreateEnum: tipos de excepciones de turno (vacación, día libre, turno extra)
CREATE TYPE "ShiftExceptionType" AS ENUM ('OFF', 'EXTRA', 'MODIFIED');

-- CreateEnum: origen de un clock-in/out (USALI)
CREATE TYPE "ClockSource" AS ENUM ('MOBILE', 'WEB', 'MANUAL_SUPERVISOR');

-- CreateEnum: nivel de gamificación (D9 — gestionado por supervisor)
CREATE TYPE "GamificationLevel" AS ENUM ('OFF', 'SUBTLE', 'STANDARD');

-- AlterEnum: nuevos eventos para TaskLogEvent (audit trail extendido)
ALTER TYPE "TaskLogEvent" ADD VALUE IF NOT EXISTS 'AUTO_ASSIGNED';
ALTER TYPE "TaskLogEvent" ADD VALUE IF NOT EXISTS 'CARRYOVER';
ALTER TYPE "TaskLogEvent" ADD VALUE IF NOT EXISTS 'REASSIGNED';
ALTER TYPE "TaskLogEvent" ADD VALUE IF NOT EXISTS 'CLOCKED_BY_STAFF';

-- AlterTable: nuevos campos en cleaning_tasks (scheduling, carryover, cancelación, extensión)
ALTER TABLE "cleaning_tasks"
  ADD COLUMN "scheduled_for" DATE,
  ADD COLUMN "carryover_from_date" DATE,
  ADD COLUMN "carryover_from_task_id" TEXT,
  ADD COLUMN "auto_assignment_rule" TEXT,
  ADD COLUMN "cancelled_reason" "CleaningCancelReason",
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "extension_flag" "ExtensionFlag";

-- AlterTable: nuevos campos en property_settings (cron 7am, política carryover, toggles)
ALTER TABLE "property_settings"
  ADD COLUMN "morning_roster_hour" INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN "morning_roster_date" DATE,
  ADD COLUMN "carryover_policy" "CarryoverPolicy" NOT NULL DEFAULT 'REASSIGN_TO_TODAY_SHIFT',
  ADD COLUMN "auto_assignment_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "shift_clocking_required" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: turnos semanales recurrentes
CREATE TABLE "staff_shifts" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT,
  "property_id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "day_of_week" INTEGER NOT NULL,
  "start_time" TEXT NOT NULL,
  "end_time" TEXT NOT NULL,
  "effective_from" DATE NOT NULL,
  "effective_until" DATE,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: excepciones puntuales (incluye AUSENCIAS marcadas con type=OFF)
CREATE TABLE "staff_shift_exceptions" (
  "id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "type" "ShiftExceptionType" NOT NULL,
  "start_time" TEXT,
  "end_time" TEXT,
  "reason" TEXT,
  "approved_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_shift_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: cobertura staff↔room (primary/backup)
CREATE TABLE "staff_coverages" (
  "id" TEXT NOT NULL,
  "property_id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "room_id" TEXT NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT true,
  "weight" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_coverages_pkey" PRIMARY KEY ("id")
);

-- CreateTable: clock-in/out (USALI auditability)
CREATE TABLE "staff_shift_clocks" (
  "id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "property_id" TEXT NOT NULL,
  "clock_in_at" TIMESTAMP(3) NOT NULL,
  "clock_out_at" TIMESTAMP(3),
  "source" "ClockSource" NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_shift_clocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable: preferencias del staff (gamificación, idioma, audio/haptic)
-- D9: gamification_level solo lo escribe el SUPERVISOR
CREATE TABLE "staff_preferences" (
  "id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "gamification_level" "GamificationLevel" NOT NULL DEFAULT 'STANDARD',
  "language" TEXT NOT NULL DEFAULT 'es-MX',
  "haptic_enabled" BOOLEAN NOT NULL DEFAULT true,
  "sound_enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable: audit log append-only de cambios a StaffPreferences
CREATE TABLE "staff_preference_logs" (
  "id" TEXT NOT NULL,
  "preferences_id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "old_value" TEXT,
  "new_value" TEXT NOT NULL,
  "changed_by_id" TEXT NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_preference_logs_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- cleaning_tasks: nuevos índices para queries de scheduling y filtrado
CREATE INDEX "cleaning_tasks_scheduled_for_status_idx" ON "cleaning_tasks"("scheduled_for", "status");
CREATE INDEX "cleaning_tasks_carryover_from_date_idx" ON "cleaning_tasks"("carryover_from_date");
CREATE INDEX "cleaning_tasks_cancelled_reason_idx" ON "cleaning_tasks"("cancelled_reason");

-- staff_shifts
CREATE INDEX "staff_shifts_organization_id_idx" ON "staff_shifts"("organization_id");
CREATE INDEX "staff_shifts_property_id_day_of_week_active_idx" ON "staff_shifts"("property_id", "day_of_week", "active");
CREATE INDEX "staff_shifts_staff_id_active_idx" ON "staff_shifts"("staff_id", "active");

-- staff_shift_exceptions
CREATE INDEX "staff_shift_exceptions_date_idx" ON "staff_shift_exceptions"("date");
CREATE UNIQUE INDEX "staff_shift_exceptions_staff_id_date_key" ON "staff_shift_exceptions"("staff_id", "date");

-- staff_coverages
CREATE INDEX "staff_coverages_property_id_room_id_idx" ON "staff_coverages"("property_id", "room_id");
CREATE INDEX "staff_coverages_room_id_is_primary_idx" ON "staff_coverages"("room_id", "is_primary");
CREATE UNIQUE INDEX "staff_coverages_staff_id_room_id_is_primary_key" ON "staff_coverages"("staff_id", "room_id", "is_primary");

-- staff_shift_clocks
CREATE INDEX "staff_shift_clocks_staff_id_clock_in_at_idx" ON "staff_shift_clocks"("staff_id", "clock_in_at");
CREATE INDEX "staff_shift_clocks_property_id_clock_in_at_idx" ON "staff_shift_clocks"("property_id", "clock_in_at");

-- staff_preferences
CREATE UNIQUE INDEX "staff_preferences_staff_id_key" ON "staff_preferences"("staff_id");

-- staff_preference_logs
CREATE INDEX "staff_preference_logs_staff_id_created_at_idx" ON "staff_preference_logs"("staff_id", "created_at");

-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================

-- cleaning_tasks: self-relation para audit chain de carryover
ALTER TABLE "cleaning_tasks"
  ADD CONSTRAINT "cleaning_tasks_carryover_from_task_id_fkey"
    FOREIGN KEY ("carryover_from_task_id") REFERENCES "cleaning_tasks"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- staff_shifts
ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "housekeeping_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- staff_shift_exceptions
ALTER TABLE "staff_shift_exceptions" ADD CONSTRAINT "staff_shift_exceptions_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "housekeeping_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_shift_exceptions" ADD CONSTRAINT "staff_shift_exceptions_approved_by_id_fkey"
  FOREIGN KEY ("approved_by_id") REFERENCES "housekeeping_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- staff_coverages
ALTER TABLE "staff_coverages" ADD CONSTRAINT "staff_coverages_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_coverages" ADD CONSTRAINT "staff_coverages_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "housekeeping_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_coverages" ADD CONSTRAINT "staff_coverages_room_id_fkey"
  FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- staff_shift_clocks
ALTER TABLE "staff_shift_clocks" ADD CONSTRAINT "staff_shift_clocks_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "housekeeping_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_shift_clocks" ADD CONSTRAINT "staff_shift_clocks_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- staff_preferences
ALTER TABLE "staff_preferences" ADD CONSTRAINT "staff_preferences_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "housekeeping_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- staff_preference_logs
ALTER TABLE "staff_preference_logs" ADD CONSTRAINT "staff_preference_logs_preferences_id_fkey"
  FOREIGN KEY ("preferences_id") REFERENCES "staff_preferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_preference_logs" ADD CONSTRAINT "staff_preference_logs_changed_by_id_fkey"
  FOREIGN KEY ("changed_by_id") REFERENCES "housekeeping_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
