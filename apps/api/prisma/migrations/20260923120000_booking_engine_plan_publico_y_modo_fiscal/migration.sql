-- C2 — el puerto público deja de publicar la BAR y publica la tarifa resuelta.
--
-- Dos columnas, las dos anulables, porque las dos responden preguntas que HOY
-- se están contestando por omisión:
--
-- 1. `public_rate_plan_id` — QUÉ PLAN es el que ve el sitio web.
--    Existe `rate_plans.visible_to_channels`, pero se escribe y NUNCA se lee:
--    no hay convención. Sin una respuesta explícita, elegir plan cuando hay
--    varios es adivinar, y adivinar el plan es publicar un precio equivocado
--    en silencio. Si queda en NULL el puerto aplica una regla determinista y
--    DECLARA en la respuesta qué usó (`priceSource`).
--
-- 2. `rates_include_taxes` — si la tarifa cargada es NETA o ya trae impuestos.
--    El PMS asume hoy tarifa inclusiva. Es una suposición razonable y sin
--    escribir: dos hoteles la contestan distinto, y equivocarla mueve el precio
--    publicado un 21% en Quintana Roo (IVA 16% + ISH 5%). Se hace explícita y
--    configurable por propiedad, con el default igual al comportamiento actual
--    para no cambiarle el precio a nadie por desplegar esto.
ALTER TABLE "booking_engine_config"
  ADD COLUMN "public_rate_plan_id" TEXT,
  ADD COLUMN "rates_include_taxes" BOOLEAN NOT NULL DEFAULT true;

-- Sin FK a rate_plans a propósito: un plan borrado no debe tumbar la
-- configuración del motor público. El puerto valida la referencia al leerla y
-- degrada a la regla determinista si el plan ya no existe.
COMMENT ON COLUMN "booking_engine_config"."public_rate_plan_id" IS
  'Plan de tarifa que publica el sitio. NULL = el puerto elige con regla determinista y lo declara en priceSource.';
COMMENT ON COLUMN "booking_engine_config"."rates_include_taxes" IS
  'true = la tarifa cargada YA incluye impuestos (modo INCLUSIVE). false = es neta y los impuestos se suman.';
