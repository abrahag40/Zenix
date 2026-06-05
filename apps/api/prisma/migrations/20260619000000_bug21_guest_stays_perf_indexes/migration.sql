-- Sprint testing BUG #21 — guest_stays SEQ SCAN en queries críticas.
-- Calendar timeline + Dashboard overstayed widget hacían SEQ SCAN sobre toda
-- la tabla guest_stays porque no había índice compuesto sobre (propertyId, *).
--
-- Las queries existentes Mews/Cloudbeds pattern: filtrar por propertyId +
-- rangos sobre checkinAt o scheduledCheckout. A 78 rows seq scan = 0.16 ms;
-- proyección a 100k stays ≈ 200 ms p95. Bloqueante de escala v1.0.5+
-- cuando cliente histórico llegue al cuarto año de operación.
--
-- 2 índices:
--   1. (propertyId, checkinAt) — calendar timeline range queries
--   2. (propertyId, scheduledCheckout, actualCheckout) — overstayed widget
--      (Dashboard + reports/overstayed). Postgres usa el índice también
--      para WHERE scheduledCheckout < X AND actualCheckout IS NULL porque
--      actualCheckout=NULL es una condición trivialmente indexable.

CREATE INDEX IF NOT EXISTS "guest_stays_property_id_checkin_at_idx"
  ON "guest_stays"("property_id", "checkin_at");

CREATE INDEX IF NOT EXISTS "guest_stays_property_id_scheduled_checkout_actual_checkout_idx"
  ON "guest_stays"("property_id", "scheduled_checkout", "actual_checkout");
