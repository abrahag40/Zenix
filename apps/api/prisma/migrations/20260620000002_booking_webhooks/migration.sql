-- BOOKING-ENGINE B3 (2026-06-11) — webhooks outbound (subscription + delivery).
CREATE TABLE "webhook_subscriptions" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "last_delivery_at" TIMESTAMP(3),
    "disabled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_webhook_sub_property" ON "webhook_subscriptions"("property_id");

ALTER TABLE "webhook_subscriptions"
  ADD CONSTRAINT "webhook_subscriptions_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "last_error" TEXT,
    "status_code" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_webhook_delivery_retry" ON "webhook_deliveries"("status", "next_attempt_at");
CREATE INDEX "idx_webhook_delivery_sub" ON "webhook_deliveries"("subscription_id");

ALTER TABLE "webhook_deliveries"
  ADD CONSTRAINT "webhook_deliveries_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "webhook_subscriptions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
