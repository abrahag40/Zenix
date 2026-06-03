-- GROUP-BILLING Fase C C2 — outcome de cancelación (retención/reembolso) append-only.

ALTER TABLE "guest_stays"
  ADD COLUMN "cancel_retention_amount" DECIMAL(10,2),
  ADD COLUMN "cancel_refund_amount"    DECIMAL(10,2),
  ADD COLUMN "cancel_refund_status"    TEXT,
  ADD COLUMN "cancel_refund_method"    TEXT,
  ADD COLUMN "cancel_refund_reference" TEXT,
  ADD COLUMN "cancel_refund_at"        TIMESTAMP(3),
  ADD COLUMN "cancel_refund_by_id"     TEXT,
  ADD COLUMN "cancel_refund_reason"    TEXT;
