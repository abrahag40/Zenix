-- CHECK-IN C2 (2026-05-29) — ReservationGroup para reservas OTA multi-room.
-- Decisiones §153-§154 CLAUDE.md. Backward compat: reservation_group_id es
-- nullable en guest_stays; stays single existentes no se tocan.

CREATE TABLE "reservation_groups" (
  "id"                  TEXT NOT NULL,
  "organization_id"     TEXT NOT NULL,
  "property_id"         TEXT NOT NULL,
  "channex_booking_id"  TEXT,
  "channex_ota_name"    TEXT,
  "primary_guest_name"  TEXT NOT NULL,
  "primary_guest_email" TEXT,
  "primary_guest_phone" TEXT,
  "group_size"          INTEGER NOT NULL,
  "room_count"          INTEGER NOT NULL,
  "group_check_in"      TIMESTAMP(3) NOT NULL,
  "group_check_out"     TIMESTAMP(3) NOT NULL,
  "cancelled_at"        TIMESTAMP(3),
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "reservation_groups_pkey" PRIMARY KEY ("id")
);

-- channexBookingId UNIQUE — idempotency natural (webhook replay no duplica).
CREATE UNIQUE INDEX "reservation_groups_channex_booking_id_key"
  ON "reservation_groups"("channex_booking_id");

CREATE INDEX "reservation_groups_organization_id_idx"
  ON "reservation_groups"("organization_id");

CREATE INDEX "reservation_groups_organization_id_property_id_idx"
  ON "reservation_groups"("organization_id", "property_id");

CREATE INDEX "reservation_groups_channex_booking_id_idx"
  ON "reservation_groups"("channex_booking_id");

CREATE INDEX "reservation_groups_cancelled_at_idx"
  ON "reservation_groups"("cancelled_at");

-- FKs a Organization y Property.
ALTER TABLE "reservation_groups"
  ADD CONSTRAINT "reservation_groups_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservation_groups"
  ADD CONSTRAINT "reservation_groups_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- GuestStay: agregar FK al ReservationGroup + posición (1-based).
ALTER TABLE "guest_stays"
  ADD COLUMN "reservation_group_id" TEXT,
  ADD COLUMN "group_room_index"     INTEGER;

CREATE INDEX "guest_stays_reservation_group_id_idx"
  ON "guest_stays"("reservation_group_id");

-- onDelete: SetNull — si se elimina un group (caso edge admin), las stays
-- sobreviven pero pierden la asociación grupal. NUNCA debería pasar en prod
-- (groups solo se "soft-cancel" via cancelledAt), pero defensa adicional.
ALTER TABLE "guest_stays"
  ADD CONSTRAINT "guest_stays_reservation_group_id_fkey"
  FOREIGN KEY ("reservation_group_id") REFERENCES "reservation_groups"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
