-- Sprint 8I-J — Hub Recamarista gamificación (privacy-respecting)
-- See docs/research-housekeeping-hub.md.

-- 1) StaffStreak
CREATE TABLE IF NOT EXISTS "staff_streaks" (
  "id"                TEXT NOT NULL,
  "staff_id"          TEXT NOT NULL,
  "current_days"      INTEGER NOT NULL DEFAULT 0,
  "longest_days"      INTEGER NOT NULL DEFAULT 0,
  "last_work_date"    DATE,
  "freezes_used"      INTEGER NOT NULL DEFAULT 0,
  "freezes_total"     INTEGER NOT NULL DEFAULT 2,
  "freezes_reset_at"  DATE,
  "updated_at"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_streaks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "staff_streaks_staff_id_key" ON "staff_streaks" ("staff_id");
ALTER TABLE "staff_streaks"
  ADD CONSTRAINT "staff_streaks_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "housekeeping_staff"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- 2) StaffPersonalRecord
CREATE TABLE IF NOT EXISTS "staff_personal_records" (
  "id"             TEXT NOT NULL,
  "staff_id"       TEXT NOT NULL,
  "room_category"  TEXT NOT NULL,
  "best_minutes"   INTEGER NOT NULL,
  "achieved_at"    TIMESTAMP(3) NOT NULL,
  "task_id"        TEXT NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_personal_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "staff_personal_records_staff_id_room_category_key"
  ON "staff_personal_records" ("staff_id", "room_category");
ALTER TABLE "staff_personal_records"
  ADD CONSTRAINT "staff_personal_records_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "housekeeping_staff"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- 3) StaffDailyActivity
CREATE TABLE IF NOT EXISTS "staff_daily_activity" (
  "id"                       TEXT NOT NULL,
  "staff_id"                 TEXT NOT NULL,
  "date"                     DATE NOT NULL,
  "tasks_completed"          INTEGER NOT NULL DEFAULT 0,
  "tasks_verified"           INTEGER NOT NULL DEFAULT 0,
  "total_cleaning_minutes"   INTEGER NOT NULL DEFAULT 0,
  "rings_completed"          BOOLEAN NOT NULL DEFAULT false,
  "tasks_target"             INTEGER NOT NULL DEFAULT 0,
  "minutes_target"           INTEGER NOT NULL DEFAULT 0,
  "verified_target"          INTEGER NOT NULL DEFAULT 0,
  "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"               TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_daily_activity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "staff_daily_activity_staff_id_date_key"
  ON "staff_daily_activity" ("staff_id", "date");
CREATE INDEX IF NOT EXISTS "staff_daily_activity_staff_id_date_idx"
  ON "staff_daily_activity" ("staff_id", "date");
ALTER TABLE "staff_daily_activity"
  ADD CONSTRAINT "staff_daily_activity_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "housekeeping_staff"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
