-- Sprint CHECK-IN-α — foto del documento al check-in (data URI base64).
-- Visa CRR 13.1/13.7 chargeback evidence — demuestra presentación física del huésped.
-- TEXT (no VARCHAR) por tamaño potencial (~500KB-2MB base64). Migración a S3
-- en v1.0.3 IMG (deuda MAINT-11 documentada).

-- AlterTable
ALTER TABLE "guest_stays" ADD COLUMN "document_photo_url" TEXT;
