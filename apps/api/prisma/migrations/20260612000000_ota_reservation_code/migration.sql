-- Código de reserva de la OTA (Booking/Expedia/Airbnb) visible al personal.
-- Distinto del channex_booking_id (UUID interno de Channex). Buscable.
ALTER TABLE "guest_stays" ADD COLUMN "ota_reservation_code" TEXT;
ALTER TABLE "reservation_groups" ADD COLUMN "ota_reservation_code" TEXT;
CREATE INDEX "guest_stays_ota_reservation_code_idx" ON "guest_stays"("ota_reservation_code");
