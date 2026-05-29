-- Sprint POST-NETFLIX-TRIAL (2026-05-29) — no-show admin charge tracking.
--
-- Recepción cobra el no-show fuera de Zenix (efectivo en mostrador,
-- OTA virtual card vía Booking Genius/Expedia Collect, transferencia,
-- manual card terminal POS) y registra el outcome aquí vía
-- POST /v1/guest-stays/:id/register-noshow-charge.
--
-- NO usa Stripe — Stripe en Zenix solo se usa para:
--   (1) cobrar al hotel su mensualidad Zenix (subscription billing)
--   (2) booking engine público (cobro de reserva direct)
--
-- 5 columnas append-only que congelan el outcome del cobro manual.

ALTER TABLE "guest_stays"
  ADD COLUMN "no_show_charge_method"    TEXT,
  ADD COLUMN "no_show_charge_reference" TEXT,
  ADD COLUMN "no_show_charge_at"        TIMESTAMP(3),
  ADD COLUMN "no_show_charge_by_id"     TEXT,
  ADD COLUMN "no_show_charge_reason"    TEXT;

COMMENT ON COLUMN "guest_stays"."no_show_charge_method"    IS 'cash | transfer | ota_card | manual_card | ota_collect | other';
COMMENT ON COLUMN "guest_stays"."no_show_charge_reference" IS 'POS approval ID, transfer ID, OTA case ID, etc.';
COMMENT ON COLUMN "guest_stays"."no_show_charge_at"        IS 'Timestamp del registro del outcome del cobro';
COMMENT ON COLUMN "guest_stays"."no_show_charge_by_id"     IS 'Recepcionista/supervisor que registró el outcome';
COMMENT ON COLUMN "guest_stays"."no_show_charge_reason"    IS 'Obligatorio si status=WAIVED (audit trail)';
