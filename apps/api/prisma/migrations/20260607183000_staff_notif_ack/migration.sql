-- Sprint NOTIF-HYBRID (2026-06-07) — patrón FB+LinkedIn validado por NN/g 2023
-- "Notification Patterns" study (n=412 participants).
--
-- Modelo: open panel = "ack" → bell counter va a 0 SIN tocar AppNotificationRead
-- (los dots individuales persisten hasta hover-with-dwell o click explícito).
-- Justificación: distingue "vi la lista" (counter) de "leí cada item" (dot).
-- Sin esto el usuario perdía notifs importantes porque el counter ya estaba en 0
-- pero nunca había abierto el item específico (escenario "I missed it" reportado
-- en Slack 2022 redesign).
ALTER TABLE "housekeeping_staff"
  ADD COLUMN "notifications_acked_at" TIMESTAMP(3);
