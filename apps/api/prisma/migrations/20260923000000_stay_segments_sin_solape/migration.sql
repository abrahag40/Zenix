-- Hace IMPOSIBLE la sobreventa, en vez de improbable.
--
-- ── POR QUÉ ────────────────────────────────────────────────────────────────
-- Hasta hoy la única defensa contra vender dos veces la misma habitación era
-- un advisory lock en el código, y la auditoría del 2026-09-22 encontró que
-- el motor público tomaba una clave de OTRA familia que recepción y que las
-- OTAs (`booking:<propertyId>` contra `walk-in:<roomId>`), así que la web y el
-- mostrador NO se serializaban entre sí. Se demostró insertando el solape.
--
-- Un lock protege mientras el código esté bien. Una restricción protege
-- aunque alguien escriba un quinto flujo y se olvide del lock. Eso es la
-- diferencia entre «no sobrevendemos» y «no se puede sobrevender».
--
-- ── POR QUÉ POR FECHA Y NO POR HORA ────────────────────────────────────────
-- 🔴 La primera versión de esta restricción usaba `tsrange` sobre los
-- timestamps, y estaba MAL. Medido sobre la base de desarrollo: la tabla
-- mezcla cuatro convenciones horarias —05:00→05:00 (18 filas), 12:00→12:00
-- (7), 15:00→12:00 (6) y 05:00→17:00 (2)— y con rango por hora una ROTACIÓN
-- NORMAL se marca como solape: salida a las 12:00 contra entrada a las 05:00
-- del mismo día. Con `tsrange` había 1 violación en 33 filas y la migración
-- habría fallado; con `daterange` hay CERO.
--
-- El motivo de fondo es de dominio, no de tipos: **el inventario hotelero se
-- vende por NOCHE, no por hora**. Dos estadías pueden compartir el día de
-- rotación y no comparten ninguna noche.
--
-- ── POR QUÉ SEMIABIERTO `[)` ───────────────────────────────────────────────
-- La noche de salida NO se vende. `[check_in, check_out)` deja libre el día
-- de salida para el siguiente huésped, que es exactamente la rotación normal.
--
-- ── POR QUÉ PARCIAL ────────────────────────────────────────────────────────
-- Sólo ocupan inventario los estados ACTIVE y PENDING — es el mismo criterio
-- que usa AvailabilityService. CANCELLED y COMPLETED no deben bloquear nada.
--
-- ── COMPROBADO ANTES DE ESCRIBIR ESTO ──────────────────────────────────────
-- Sobre una base desechable, siete casos: rotación el mismo día ACEPTA;
-- solape parcial, contención y envoltura RECHAZAN; cancelada, completada y
-- otra habitación ACEPTAN. Y sobre la base de desarrollo real: 0 violaciones.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "stay_segments"
  ADD CONSTRAINT "stay_segments_sin_solape"
  EXCLUDE USING gist (
    "room_id" WITH =,
    daterange("check_in"::date, "check_out"::date, '[)') WITH &&
  )
  WHERE ("status" IN ('ACTIVE', 'PENDING'));
