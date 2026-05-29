-- Migration: remove out-of-scope Stripe card-on-file fields from GuestStay
--
-- Sprint POST-NETFLIX-TRIAL audit (2026-05-29). El no-show charging via Stripe
-- (Sprint Mx-1) fue eliminado porque está fuera del scope productivo Zenix:
--
-- Visión confirmada para Stripe:
--   1. Cobro al dueño del hotel — suscripción SaaS Zenix (Netflix-trial flow)
--   2. Booking Engine futuro — huésped paga reserva online + se genera GuestStay
--
-- No se usa Stripe en check-in del huésped. El tracking interno del no-show
-- (noShowChargeStatus, noShowFeeAmount, noShowFeeCurrency) se mantiene para
-- registro manual del cobro por recepción (efectivo, OTA pre-paid, etc.).

-- Drop columnas Stripe card-on-file de guest_stays
ALTER TABLE "guest_stays" DROP COLUMN IF EXISTS "stripe_customer_id";
ALTER TABLE "guest_stays" DROP COLUMN IF EXISTS "stripe_payment_method_id";
ALTER TABLE "guest_stays" DROP COLUMN IF EXISTS "stripe_payment_intent_id";
