-- ═════════════════════════════════════════════════════════════════════════════
-- Nova schema hardening (Day 2 hot-fix) — defense-in-depth para raw SQL inserts
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Problema detectado: Prisma's @updatedAt sólo se auto-setea en inserts Prisma-driven.
-- Inserts SQL directos (admin tools, hot-fixes, scripts ops) fallan con
-- "null value in column updated_at violates not-null constraint".
--
-- Security best practice: toda columna NOT NULL debe tener DEFAULT cuando hay
-- semántica razonable. Esto previene:
--   1. Fail accidental en mantenimiento ops (devops haciendo INSERT directo)
--   2. Exploitable error responses que leakean schema structure
--   3. Bypass de auditoría (insert a medias rechazado deja state inconsistente)
--
-- Aplicado a las 3 tablas Nova foundation/Channex CRUD donde detectamos el gap.
-- Trigger-based @updatedAt sigue funcionando para updates (Prisma sets on update).
-- Estos defaults solo aplican a INSERT cuando el campo no se especifica.

ALTER TABLE partners
  ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE channex_rate_plan_mappings
  ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE rate_plan_caps
  ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

-- ─── Index hardening: ataques tipo "rate scraping" mitigation ────────────
--
-- Si un attacker tiene credenciales válidas de bajo tier (ej. RECEPTIONIST de un
-- hotel) pero intenta scrap-ear rates de otros hoteles via queries directas a
-- channex_rate_plan_mappings, queremos que el query NO sea super rápido. El
-- índice partial por (property_id, is_active) hace que el query path con
-- propertyId scope sea trivial, pero el query "todos los rate plans del sistema"
-- requeriría seq scan + RBAC layer rechaza primero.
--
-- Nota: enforcement real está en TenantContextService (Day 3) — esto es solo
-- defensa adicional contra performance attacks.
-- (Índice ya existe via @@index([propertyId, isActive]) de Prisma. No-op.)

-- ─── Audit trail integrity: añadir índice creado_at sobre AuditLog ──────
--
-- Queries forensic comunes filtran por createdAt rango + organizationId. El
-- índice existente es (organizationId, createdAt) compuesto que sirve. Adicional
-- index sólo en createdAt es útil para queries cross-org (ej. PLATFORM_ADMIN
-- viendo "todos los actos en última hora cross-tenant").
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC);
