-- Sprint 8I: add Department enum for shared chrome + role-aware module pattern.
-- See ARCHITECTURE.md AD-011 + CLAUDE.md.

-- CreateEnum
CREATE TYPE "Department" AS ENUM (
  'HOUSEKEEPING',
  'MAINTENANCE',
  'LAUNDRY',
  'PUBLIC_AREAS',
  'GARDENING',
  'RECEPTION'
);

-- AlterTable: add column with default for existing staff rows
ALTER TABLE "housekeeping_staff"
  ADD COLUMN "department" "Department" NOT NULL DEFAULT 'HOUSEKEEPING';

-- Backfill: derive department from role for sensible defaults on existing rows.
-- HOUSEKEEPER → HOUSEKEEPING (already default)
-- RECEPTIONIST → RECEPTION
-- SUPERVISOR → keep HOUSEKEEPING (manager of HK by default in seed)
UPDATE "housekeeping_staff" SET "department" = 'RECEPTION' WHERE "role" = 'RECEPTIONIST';
