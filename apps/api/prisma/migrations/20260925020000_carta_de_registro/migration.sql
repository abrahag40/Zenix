-- La carta de registro firmada: el sustituto digital del papel en la caja.
--
-- 🔴 Sustituye lo que el hotel hace hoy: imprimir el comprobante, escribirle
-- sus datos a mano, hacerlo firmar y guardarlo en una caja. Funciona —esa
-- firma es lo que gana el contracargo— pero no escala, se pierde, y encontrar
-- el papel de hace ocho meses cuando quedan siete dias para responder es una
-- loteria.
--
-- Vale lo mismo ante la ley mexicana: el Codigo de Comercio art. 89 define la
-- firma electronica como los datos asociados a un mensaje de datos que
-- identifican al firmante y demuestran que aprueba la informacion, y el 89 bis
-- prohibe negarle validez a algo por estar en formato digital.
--
-- `documento` guarda el CONTENIDO COMPLETO, no una plantilla y unos campos: si
-- se guardara la plantilla, cambiarla cambiaria lo que parece que se firmo.
--
-- `huella` es SHA-256 del documento canonicalizado mas la firma. La constancia
-- NOM-151 (serial, fecha, PSC) es opcional y de pago; sin ella el documento
-- sigue valiendo, con ella la fecha deja de ser discutible.
CREATE TABLE "registration_records" (
  "id"                TEXT NOT NULL,
  "property_id"       TEXT NOT NULL,
  "guest_stay_id"     TEXT NOT NULL,
  "documento"         JSONB NOT NULL,
  "huella"            TEXT NOT NULL,
  "firma_url"         TEXT,
  "firmado_en"        TIMESTAMP(3) NOT NULL,
  "testigo_staff_id"  TEXT,
  "otp_verificado"    BOOLEAN NOT NULL DEFAULT false,
  "otp_canal"         TEXT,
  "otp_verificado_en" TIMESTAMP(3),
  "ip"                TEXT,
  "user_agent"        TEXT,
  "nom151_serial"     TEXT,
  "nom151_en"         TIMESTAMP(3),
  "nom151_psc"        TEXT,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "registration_records_pkey" PRIMARY KEY ("id")
);

-- UNIQUE por estancia: una estancia, una carta. Dos cartas para la misma
-- estancia serian dos versiones de lo que el huesped firmo, y en una disputa
-- eso no se puede explicar.
CREATE UNIQUE INDEX "registration_records_guest_stay_id_key" ON "registration_records"("guest_stay_id");
CREATE INDEX "registration_records_property_id_created_at_idx" ON "registration_records"("property_id", "created_at");

ALTER TABLE "registration_records"
  ADD CONSTRAINT "registration_records_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 🔴 ON DELETE CASCADE hacia la estancia y NO SET NULL: la carta sin su
-- estancia no prueba nada, y conservarla seria guardar datos personales de un
-- huesped cuyo expediente ya se elimino.
ALTER TABLE "registration_records"
  ADD CONSTRAINT "registration_records_guest_stay_id_fkey"
  FOREIGN KEY ("guest_stay_id") REFERENCES "guest_stays"("id") ON DELETE CASCADE ON UPDATE CASCADE;
