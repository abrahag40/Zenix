-- 🔴 La huella sellaba la URL de la firma, no la firma.
--
-- Encontrado atacando la propia implementacion: sustituir el PNG al que apunta
-- `firma_url` no cambia la huella, asi que `verificar()` decia «integra» con
-- una firma distinta dentro. Un hotel deshonesto —o cualquiera con acceso al
-- almacen— podia cambiar la firma despues de sellada.
--
-- `firma_hash` guarda el SHA-256 de los BYTES de la imagen. Cambiar el PNG
-- rompe la verificacion. Y de paso permite detectar la MISMA firma en dos
-- cartas distintas, que es el otro fraude obvio: copiar el garabato de un
-- huesped a la estancia de otro.
--
-- NULLABLE porque las cartas anteriores no lo tienen; `verificar()` las
-- declara «sin sello de imagen» en vez de fingir que estan bien.
ALTER TABLE "registration_records" ADD COLUMN "firma_hash" TEXT;

-- Indice para encontrar firmas repetidas. No es UNIQUE: dos estancias del
-- MISMO huesped pueden tener firmas casi identicas y bloquearlo seria un falso
-- positivo caro en recepcion. Se detecta y se avisa, no se impide.
CREATE INDEX "registration_records_firma_hash_idx" ON "registration_records"("firma_hash");
