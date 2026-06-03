-- GROUP-BILLING Fase C (D-GRP-C2) — política de cancelación per-property.

-- CreateTable
CREATE TABLE "cancellation_policies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "free_window_hours" INTEGER NOT NULL DEFAULT 48,
    "tiers" JSONB NOT NULL,
    "refund_mode" TEXT NOT NULL DEFAULT 'PARTIAL',
    "group_override" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cancellation_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cancellation_policies_organization_id_idx" ON "cancellation_policies"("organization_id");
CREATE INDEX "cancellation_policies_property_id_idx" ON "cancellation_policies"("property_id");
CREATE INDEX "cancellation_policies_property_id_is_default_idx" ON "cancellation_policies"("property_id", "is_default");

-- AddForeignKey
ALTER TABLE "cancellation_policies" ADD CONSTRAINT "cancellation_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cancellation_policies" ADD CONSTRAINT "cancellation_policies_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guest_stays" ADD CONSTRAINT "guest_stays_cancellation_policy_id_fkey" FOREIGN KEY ("cancellation_policy_id") REFERENCES "cancellation_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
