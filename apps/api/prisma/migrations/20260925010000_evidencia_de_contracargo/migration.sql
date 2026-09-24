-- Las dos piezas de evidencia que a Zenix le faltaban para defender un cobro.
--
-- Zenix YA guarda casi todo lo que Stripe pide como evidencia convincente:
-- nombre, correo, TIPO y NÚMERO de identificación del huésped, check-in y
-- check-out reales, y quién los confirmó. Faltaban dos:
--
--   · `purchase_ip` — la IP desde la que se reservó. Stripe la pide como
--     `customer_purchase_ip`: demuestra que la compra salió de un dispositivo
--     real, no de una tarjeta robada usada a ciegas.
--
--   · `checkin_signature_url` — 🔴 LA PIEZA QUE GANA EL CASO DEL «FRAUDE
--     AMISTOSO»: el huésped se hospeda, todo bien, y al volver disputa
--     diciendo que no reconoce el cargo. Contra eso Stripe pide literalmente
--     «la firma del titular de la tarjeta» y «los detalles de la
--     identificación presentada». La identificación ya estaba; la firma no.
--
-- Las tres son NULLABLE: las estancias que ya existen no tienen nada de esto y
-- no pueden quedar bloqueadas. Lo que no haya, el expediente lo declarará como
-- faltante en vez de fingir que lo tiene.
ALTER TABLE "guest_stays"
  ADD COLUMN "purchase_ip"           TEXT,
  ADD COLUMN "checkin_signature_url" TEXT,
  ADD COLUMN "checkin_signed_at"     TIMESTAMP(3);
