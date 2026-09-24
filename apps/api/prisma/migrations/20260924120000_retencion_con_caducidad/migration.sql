-- Retención con caducidad: la pieza que hace seguro cobrar desde el sitio web.
--
-- ── EL PROBLEMA ────────────────────────────────────────────────────────────
-- Para cobrar hay que decidir el orden, y sin retención sólo hay dos, los dos
-- malos:
--   · Cobrar y luego crear  → el huésped paga y su habitación ya no está.
--   · Crear y luego cobrar  → un carrito abandonado retiene la habitación
--                              para siempre.
-- La salida estándar es la tercera: crear en estado RETENIDO, que ocupa
-- inventario de verdad, con caducidad, y confirmar cuando el pago avisa.
--
-- ── POR QUÉ NO UNA TABLA NUEVA ─────────────────────────────────────────────
-- 🔴 La opción obvia —`inventory_holds`, tabla aparte— se DESCARTÓ, y el
-- motivo es el que acabamos de aprender a la mala:
--
-- La restricción `stay_segments_sin_solape` cubre ya los segmentos ACTIVE y
-- PENDING. Es lo que hace la sobreventa IMPOSIBLE en vez de improbable. Una
-- tabla paralela quedaría FUERA de esa restricción, y volvería a haber una
-- segunda fuente de ocupación que cada consulta nueva tiene que recordar —
-- exactamente la forma del defecto que corregimos en el evento de inventario.
--
-- Una retención es un segmento PENDING. No hace falta inventar nada: ya ocupa
-- inventario en `AvailabilityService.check` y ya está protegida por la
-- restricción de exclusión. Lo único que le faltaba era **cuándo caduca**.
--
-- ── LO QUE ESTA MIGRACIÓN AÑADE ────────────────────────────────────────────
-- Un solo campo, y el índice que el liberador necesita para no escanear la
-- tabla entera cada minuto.

ALTER TABLE "guest_stays"
  ADD COLUMN IF NOT EXISTS "hold_expires_at" TIMESTAMP(3);

COMMENT ON COLUMN "guest_stays"."hold_expires_at" IS
  'Si no es NULL, la reserva RETIENE inventario y caduca en esta fecha. Se pone a NULL al confirmarse el pago: una reserva firme no caduca. La caducidad la fija el MEDIO DE PAGO (ver politica-de-retencion.ts), no la propiedad.';

-- Índice PARCIAL: el liberador sólo pregunta por retenciones vivas, que son un
-- puñado en cualquier momento. Un índice completo sobre la columna indexaría
-- sobre todo NULLs —las reservas firmes, que son la inmensa mayoría— y
-- ocuparía espacio para no responder nada.
CREATE INDEX IF NOT EXISTS "idx_guest_stays_retenciones_vivas"
  ON "guest_stays" ("hold_expires_at")
  WHERE "hold_expires_at" IS NOT NULL AND "cancelled_at" IS NULL;
