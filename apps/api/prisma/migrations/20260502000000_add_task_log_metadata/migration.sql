-- Sprint 8K — Persistencia del checklist de limpieza para reportes.
--
-- Añade columna metadata JSONB al TaskLog. Caso principal:
--   evento COMPLETED → metadata = { checklist: [{ id, label, completed }] }
--
-- Queryable desde reports con operadores JSONB:
--   SELECT staff_id, COUNT(*) FROM task_logs
--   WHERE event = 'COMPLETED'
--     AND metadata @> '{"checklist": [{"id": "bathroom", "completed": false}]}'
--
-- Esto permite detectar pasos repetidamente saltados por housekeeper /
-- por habitación / por turno — input directo para coaching y QA.

ALTER TABLE "task_logs" ADD COLUMN "metadata" JSONB;
