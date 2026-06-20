-- CHANNEX-CERT-RESTRICTIONS (2026-06-20) — additive only, no data loss.
-- Cierra el gap de certificación PMS Channex: push de restricciones
-- (min_stay / stop_sell / CTA / CTD / max_stay) por rate plan específico.

-- Test 6: stop_sell por rate plan en un rango.
ALTER TABLE "rate_restrictions" ADD COLUMN "stop_sell" BOOLEAN NOT NULL DEFAULT false;

-- Recolección de evidencia: task id devuelto por Channex en el último push OK.
ALTER TABLE "channex_outbound_queue" ADD COLUMN "last_task_id" TEXT;

-- Enlace preciso (roomType × ratePlan local) → channex rate_plan_id.
CREATE TABLE "channex_rate_plan_links" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "room_type_id" TEXT NOT NULL,
    "rate_plan_id" TEXT NOT NULL,
    "channex_rate_plan_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "channex_rate_plan_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channex_rate_plan_links_channex_rate_plan_id_key" ON "channex_rate_plan_links"("channex_rate_plan_id");
CREATE UNIQUE INDEX "channex_rate_plan_links_room_type_id_rate_plan_id_key" ON "channex_rate_plan_links"("room_type_id", "rate_plan_id");
CREATE INDEX "channex_rate_plan_links_property_id_idx" ON "channex_rate_plan_links"("property_id");
