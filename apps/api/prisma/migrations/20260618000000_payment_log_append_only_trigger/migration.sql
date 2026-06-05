-- BUG #10 fix 2026-06-04 — PaymentLog append-only enforcement at DB level.
--
-- CLAUDE.md §28 declara PaymentLog como append-only (USALI 12 ed + chargeback
-- evidence Visa CRR §5.9.2). Hasta hoy SOLO se enforce a nivel servicio:
-- `void()` crea entrada NEGATIVA en vez de update. Pero un sysadmin con
-- conexión directa a la BD podía mutar/borrar — defense-in-depth roto.
--
-- Pattern idéntico a §165 D-NOVA-7 AuditLog (trigger Postgres bloqueante).
-- Las mutations legítimas (void = crear entrada negativa con `voids_log_id`,
-- registrar reembolso = crear nuevo log) NO requieren UPDATE/DELETE — siempre
-- son INSERTs nuevos. Por lo tanto el trigger no rompe ningún flujo legítimo.

CREATE OR REPLACE FUNCTION payment_log_append_only_guard()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'payment_logs es append-only — operación % no permitida (USALI §28)', TG_OP
    USING HINT = 'Para corregir un pago, crea PaymentLog nuevo con voidsLogId apuntando al original (void = entrada negativa). PaymentLog jamás se UPDATE/DELETE — Visa CRR §5.9.2 chargeback evidence depende de esta inmutabilidad.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_logs_block_update
  BEFORE UPDATE ON payment_logs
  FOR EACH ROW
  EXECUTE FUNCTION payment_log_append_only_guard();

CREATE TRIGGER payment_logs_block_delete
  BEFORE DELETE ON payment_logs
  FOR EACH ROW
  EXECUTE FUNCTION payment_log_append_only_guard();
