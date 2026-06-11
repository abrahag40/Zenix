-- Sprint AUTO-CHECKIN Fase 1b — marcador de idempotencia del recordatorio 24h.
ALTER TABLE "guest_stays" ADD COLUMN "precheckin_reminder_sent_at" TIMESTAMP(3);
