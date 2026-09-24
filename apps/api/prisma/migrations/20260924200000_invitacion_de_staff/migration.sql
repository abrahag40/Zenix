-- Invitación de acceso para el personal del hotel.
--
-- 🔴 El porqué, en una línea: hasta hoy dar de alta al gerente de un hotel
-- obligaba a inventarle una contraseña y hacérsela llegar. Con esto pone la
-- suya y nadie más la conoce nunca.
--
-- 🔴 La tabla se llama `housekeeping_staff`, no `Staff`. El modelo lleva
-- `@@map("housekeeping_staff")` desde el principio y yo escribí el nombre del
-- MODELO. Prisma no lo traduce en el SQL a mano: falló en el CI con
-- «relation "Staff" does not exist», que es el mensaje correcto y aun así
-- cuesta leerlo porque el nombre existe — en el esquema, no en la base.
--
-- Las tres columnas son NULLABLE a propósito: el personal que ya existe no
-- tiene invitación pendiente y no debe quedar bloqueado por esta migración.
ALTER TABLE "housekeeping_staff"
  ADD COLUMN "setup_token_hash"        TEXT,
  ADD COLUMN "setup_token_expires_at"  TIMESTAMP(3),
  ADD COLUMN "setup_token_consumed_at" TIMESTAMP(3);

-- UNIQUE sobre el hash: dos invitaciones no pueden compartir token, y el
-- índice es además por lo que se busca al canjear.
CREATE UNIQUE INDEX "housekeeping_staff_setup_token_hash_key" ON "housekeeping_staff"("setup_token_hash");
