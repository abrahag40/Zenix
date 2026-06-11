-- Sprint AUTO-CHECKIN (2026-06-11) — pre-arrival identity capture.
-- Token raw NUNCA persiste (solo SHA256, anti-IDOR §179). Campos append-only
-- al patrón de GuestStay; carga del huésped OPCIONAL.
ALTER TABLE "guest_stays" ADD COLUMN "precheckin_token_hash" TEXT;
ALTER TABLE "guest_stays" ADD COLUMN "precheckin_token_expires_at" TIMESTAMP(3);
ALTER TABLE "guest_stays" ADD COLUMN "precheckin_sent_at" TIMESTAMP(3);
ALTER TABLE "guest_stays" ADD COLUMN "precheckin_submitted_at" TIMESTAMP(3);
ALTER TABLE "guest_stays" ADD COLUMN "guest_verified_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX "guest_stays_precheckin_token_hash_key" ON "guest_stays"("precheckin_token_hash");
