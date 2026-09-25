-- El codigo que el recepcionista teclea en la tableta.
--
-- Seis caracteres de un alfabeto sin `0 O 1 I L U` —los que se confunden
-- leyendo de una pantalla— con el ultimo como caracter de control.
--
-- 🔴 UNICO POR PROPIEDAD, no globalmente. Dos hoteles pueden compartir codigo
-- sin estorbarse porque la busqueda va acotada a la propiedad de quien
-- pregunta, y esa acotacion es ademas lo que impide leer reservas de otro
-- hotel probando codigos.
--
-- NULLABLE: las estancias anteriores no lo tienen. El indice unico ignora los
-- NULL en Postgres, asi que mil estancias viejas sin codigo no colisionan
-- entre si — que es exactamente lo que hace falta.
ALTER TABLE "guest_stays" ADD COLUMN "short_code" TEXT;

CREATE UNIQUE INDEX "guest_stays_property_id_short_code_key"
  ON "guest_stays"("property_id", "short_code");
