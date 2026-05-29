-- Sprint PAC-CLIENT-WARNING (2026-05-29) — PAC visibility cliente-facing.
--
-- Hoy si el consultor skipea el health-check PAC en wizard Step 8, el cliente
-- queda activado pero NO sabe que su CFDI no funciona. Lo descubre cuando
-- intenta facturar el primer huésped en el counter — anti-pattern.
--
-- 3 columnas en legal_entities exponen el estado al cliente vía:
--   · Banner sticky en /dashboard (web app cliente)
--   · Tooltip explicativo en botón "Generar CFDI" del folio
--   · AppNotification permanente al ORG_OWNER al activar
--
-- Default 'PENDING' aplica a TODAS las legal entities existentes — fail-safe:
-- mejor mostrar warning falso (consultor lo limpia con 1 click después) que
-- ocultar problema real. Sprint posterior REPORTS-CORE moverá auditoría
-- agregada a vista materializada.

ALTER TABLE "legal_entities"
  ADD COLUMN "pac_status" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "pac_status_updated_at" TIMESTAMP(3),
  ADD COLUMN "pac_status_reason" TEXT;

CREATE INDEX "legal_entities_pac_status_idx" ON "legal_entities"("pac_status");

COMMENT ON COLUMN "legal_entities"."pac_status"
  IS 'CONFIGURED | PENDING | FAILED | NOT_REQUIRED — visible al cliente vía banner sticky';
COMMENT ON COLUMN "legal_entities"."pac_status_updated_at"
  IS 'Última transición de estado (health-check OK / skip / fallo)';
COMMENT ON COLUMN "legal_entities"."pac_status_reason"
  IS 'Razón si PENDING/FAILED (p.ej "Skipped en wizard por consultor"). Mostrada en página /settings/legal-entities/:id/pac-setup';
