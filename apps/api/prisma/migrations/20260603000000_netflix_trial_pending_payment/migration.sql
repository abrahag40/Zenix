-- Migration: Netflix-style trial — capture payment method UPFRONT before subscription creation
--
-- Rationale: pre-existing flow created Stripe Subscription incomplete + 1d forced trial
-- WITHOUT payment method. Customer entered trial-mode but could forget to add card
-- in Customer Portal → churn at trial end. Netflix/Spotify pattern: validate card
-- ($0 SetupIntent) BEFORE trial starts. Trial begins post-card capture.
--
-- Schema changes:
--   1. Subscription.status now accepts 'pending_payment_method' (no enum migration
--      needed — status is `String` not enum per schema.prisma line 3587)
--   2. New nullable columns to persist wizard config until webhook fires:
--      - pending_coupon_id    — Stripe Coupon to attach when Sub finally created
--      - pending_trial_days   — trial days to use when Sub finally created
--      - setup_intent_id      — Stripe SetupIntent ID for audit (post-success)
--      - card_captured_at     — timestamp when payment method attached

ALTER TABLE "subscriptions" ADD COLUMN "pending_coupon_id" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "pending_trial_days" INTEGER;
ALTER TABLE "subscriptions" ADD COLUMN "setup_intent_id" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "card_captured_at" TIMESTAMP(3);

-- Index para webhook handler lookup por stripeCustomerId + status
CREATE INDEX "idx_subscriptions_customer_status"
  ON "subscriptions" ("stripe_customer_id", "status");
