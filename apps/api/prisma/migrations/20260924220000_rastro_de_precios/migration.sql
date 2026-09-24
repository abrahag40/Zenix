-- Quién cambió el precio de un tipo de habitación, de cuánto a cuánto y cuándo.
--
-- 🔴 EXISTE PORQUE `audit_log` NO PODÍA REGISTRARLO. Su `actor_real_id` es
-- clave foránea a `users` —la identidad de organización— y quien cambia un
-- precio a diario es personal de propiedad (`housekeeping_staff`). La
-- escritura fallaba siempre, y como el servicio de auditoría se traga sus
-- errores a propósito, fallaba EN SILENCIO: cero filas y ninguna queja.
--
-- `staff_id` es NULLABLE con ON DELETE SET NULL: dar de baja a un empleado no
-- puede borrar el historial de precios del hotel. Se pierde quién, se conserva
-- qué y cuándo — que es lo que hace falta cuando un huésped reclama una tarifa
-- de hace tres meses.
CREATE TABLE "rate_change_logs" (
  "id"           TEXT NOT NULL,
  "property_id"  TEXT NOT NULL,
  "room_type_id" TEXT NOT NULL,
  "staff_id"     TEXT,
  "before_cents" INTEGER NOT NULL,
  "after_cents"  INTEGER NOT NULL,
  "currency"     TEXT NOT NULL,
  "source"       TEXT NOT NULL,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rate_change_logs_pkey" PRIMARY KEY ("id")
);

-- Los dos índices son por cómo se consulta: «qué ha cambiado en este hotel» y
-- «qué le ha pasado a ESTE tipo», las dos veces en orden cronológico.
CREATE INDEX "rate_change_logs_property_id_created_at_idx" ON "rate_change_logs"("property_id", "created_at");
CREATE INDEX "rate_change_logs_room_type_id_created_at_idx" ON "rate_change_logs"("room_type_id", "created_at");

ALTER TABLE "rate_change_logs"
  ADD CONSTRAINT "rate_change_logs_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rate_change_logs"
  ADD CONSTRAINT "rate_change_logs_room_type_id_fkey"
  FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rate_change_logs"
  ADD CONSTRAINT "rate_change_logs_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "housekeeping_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
