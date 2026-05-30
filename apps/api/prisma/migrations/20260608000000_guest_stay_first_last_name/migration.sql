-- CHECK-IN C1.12 (2026-05-29) — split nombre/apellido del huésped para BI.
-- Backward compat: nullable; reportes legacy siguen leyendo guest_name.
ALTER TABLE "guest_stays"
  ADD COLUMN "guest_first_name" TEXT,
  ADD COLUMN "guest_last_name"  TEXT;

UPDATE "guest_stays"
SET "guest_first_name" = split_part("guest_name", ' ', 1),
    "guest_last_name"  = NULLIF(substring("guest_name" FROM position(' ' IN "guest_name") + 1), '')
WHERE "guest_first_name" IS NULL;
