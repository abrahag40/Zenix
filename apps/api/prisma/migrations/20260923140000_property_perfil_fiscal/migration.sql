-- Perfil fiscal de la propiedad. Tres columnas, y ninguna inventa nada.
--
-- El ESTADO ya existe: `properties.region_code` está documentado como ISO
-- 3166-2 ("MX-ROO"). No se duplica.
--
-- Lo que faltaba:
--
-- `tax_municipality` — el municipio DECIDE el estímulo de IVA en región
--   fronteriza. Othón P. Blanco está en Quintana Roo y tiene IVA 8%; Tulum, en
--   el mismo estado, tiene 16%. Sin municipio, la tasa federal es una
--   suposición.
--
-- `tax_opt_ins` — regímenes que la propiedad DECLARA tener dados de alta. El
--   estímulo fronterizo exige aviso ante el SAT: no lo da la geografía, lo da
--   el contribuyente. Dos hoteles de la misma calle pueden diferir, y eso no
--   es un error de datos.
--
-- `lodging_kind` — hotel (art. 4 fr. I de la ley de QR) o casa/villa particular
--   (fr. V). En Quintana Roo son 5% y 6%. El default 'HOTEL' es lo que Zenix
--   administra hoy y replica el comportamiento actual.
ALTER TABLE "properties"
  ADD COLUMN "tax_municipality" TEXT,
  ADD COLUMN "tax_opt_ins" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "lodging_kind" TEXT NOT NULL DEFAULT 'HOTEL';

COMMENT ON COLUMN "properties"."tax_municipality" IS
  'Municipio (nombre INEGI). Decide el estímulo de IVA en región fronteriza.';
COMMENT ON COLUMN "properties"."tax_opt_ins" IS
  'Regímenes fiscales declarados, p.ej. IVA_REGION_FRONTERIZA_SUR. Requieren aviso ante la autoridad.';
COMMENT ON COLUMN "properties"."lodging_kind" IS
  'HOTEL | PRIVATE_RENTAL. Determina la tasa estatal de hospedaje.';
