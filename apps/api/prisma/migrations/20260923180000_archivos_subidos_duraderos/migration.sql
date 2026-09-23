-- M9 — las fotos del pre-check-in dejan de vivir sólo en un disco efímero.
--
-- 🔴 EL DEFECTO: `uploads.service.ts` escribe en `{cwd}/uploads/...` y el
-- comentario del propio archivo lo dice: «Por qué disco local (no S3 todavía)».
-- En un despliegue con contenedor, ese disco se va con el contenedor. La foto
-- del documento de identidad de un huésped desaparece SIN ERROR, sin registro
-- y sin que nadie se entere hasta que alguien la busca.
--
-- No es un fallo cosmético: es PÉRDIDA DE DATOS PERSONALES, silenciosa y
-- garantizada. Y son datos que la LFPDPPP obliga a poder acreditar.
--
-- ── POR QUÉ EN LA BASE Y NO EN S3 ──────────────────────────────────────────
-- S3 o R2 es el destino correcto a medio plazo, y el propio código ya lo tiene
-- planeado. Pero exige credenciales nuevas, un proveedor nuevo y una superficie
-- de fallo nueva — tres cosas que no se meten a una semana de encender un
-- piloto.
--
-- La base de datos ya está respaldada, ya es duradera y ya es donde vive el
-- resto del dato personal del huésped. Una foto recomprimida a 1920px ronda
-- los 300 KB; el volumen de un hotel en un año cabe de sobra.
--
-- El disco se queda como CACHÉ: se sirve rápido desde ahí y, cuando falta
-- —justo después de un despliegue—, se repone desde aquí. La caché puede
-- desaparecer sin consecuencias; ésa es la diferencia entre una caché y un
-- almacén, y es la que no existía.
CREATE TABLE "uploaded_files" (
  "id"              TEXT PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "scope"           TEXT NOT NULL,
  "filename"        TEXT NOT NULL,
  "mime_type"       TEXT NOT NULL DEFAULT 'image/jpeg',
  "size_bytes"      INTEGER NOT NULL,
  "width"           INTEGER,
  "height"          INTEGER,
  "bytes"           BYTEA NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- La ruta pública es la identidad del archivo: por ella se sirve y por ella se
-- borra. Única, para que reponer la caché no pueda elegir entre dos filas.
CREATE UNIQUE INDEX "uploaded_files_ruta"
  ON "uploaded_files" ("organization_id", "scope", "filename");

-- El barrido de retención borra por antigüedad.
CREATE INDEX "uploaded_files_created_at" ON "uploaded_files" ("created_at");

COMMENT ON COLUMN "uploaded_files"."bytes" IS
  'El archivo. La base es el almacén; el disco es sólo caché y puede perderse.';
