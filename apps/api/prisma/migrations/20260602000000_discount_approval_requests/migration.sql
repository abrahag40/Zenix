-- ═════════════════════════════════════════════════════════════════════════════
-- Sprint BILLING-CORE Day 4 — DiscountApprovalRequest
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Cuando un consultor solicita un descuento que excede su cap per tier
-- (§D-BILL-3 owner-approved 2026-05-26), se crea una row pending hasta
-- que un PARTNER_ADMIN+ apruebe o rechace.
--
-- Estados del workflow:
--   PENDING  → request abierta esperando review
--   APPROVED → reviewer aprobó, resulting_discount_id apunta al
--              SubscriptionDiscount creado por el approval
--   REJECTED → reviewer rechazó con rejection_reason
--   EXPIRED  → nadie reviewó dentro del expires_at window
--
-- Default expires_at = +7 días desde creación (cron cleanup futuro
-- marcará como EXPIRED y notificará al solicitante).
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE "discount_approval_requests" (
  "id"                   TEXT NOT NULL,
  "requested_by_id"      TEXT NOT NULL,
  "requested_by_role"    TEXT NOT NULL,
  "organization_id"      TEXT NOT NULL,
  "subscription_id"      TEXT,
  "percent_off"          INTEGER NOT NULL,
  "duration"             TEXT NOT NULL,
  "duration_in_months"   INTEGER,
  "reason"               TEXT NOT NULL,
  "status"               TEXT NOT NULL DEFAULT 'PENDING',
  "reviewed_by_id"       TEXT,
  "reviewed_at"          TIMESTAMP(3),
  "rejection_reason"     TEXT,
  "resulting_discount_id" TEXT,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "discount_approval_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "discount_approval_requests_organization_id_idx" ON "discount_approval_requests"("organization_id");
CREATE INDEX "discount_approval_requests_status_idx" ON "discount_approval_requests"("status");
CREATE INDEX "discount_approval_requests_requested_by_id_idx" ON "discount_approval_requests"("requested_by_id");
CREATE INDEX "discount_approval_requests_status_expires_at_idx" ON "discount_approval_requests"("status", "expires_at");

COMMENT ON TABLE "discount_approval_requests" IS
  'Approval workflow per discount que excede el cap del partner tier (§D-BILL-3). PENDING→APPROVED/REJECTED/EXPIRED.';
