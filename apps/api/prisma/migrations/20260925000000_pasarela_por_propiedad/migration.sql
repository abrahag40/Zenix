-- Qué pasarela cobra en cada propiedad, y con qué comisión.
--
-- 🔴 `payment_gateway` lleva DEFAULT 'stripe' y NOT NULL: Stripe es la
-- prioridad de Zenix y el valor de todo hotel nuevo. La columna existe para el
-- hotel que pide otra cosa, no para obligar a elegir en el alta.
--
-- Los otros dos son NULLABLE a propósito: un hotel que cobra a la cuenta de
-- ZaharDev —el modelo de hoy— no tiene cuenta conectada ni comisión, y no debe
-- quedar bloqueado por esta migración.
ALTER TABLE "booking_engine_config"
  ADD COLUMN "payment_gateway"             TEXT NOT NULL DEFAULT 'stripe',
  ADD COLUMN "stripe_connected_account_id" TEXT,
  ADD COLUMN "platform_fee_bps"            INTEGER;

-- La comisión en PUNTOS BASE, entera. Cota superior de 10 000 = 100 %: una
-- comisión mayor que el importe no es una comisión, es un error de tecleo, y
-- el sitio para detenerlo es la base y no sólo el código.
ALTER TABLE "booking_engine_config"
  ADD CONSTRAINT "booking_engine_config_platform_fee_bps_check"
  CHECK ("platform_fee_bps" IS NULL OR ("platform_fee_bps" >= 0 AND "platform_fee_bps" <= 10000));
