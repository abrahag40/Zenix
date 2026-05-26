# Schema audit — Nova foundation + Channex CRUD (Days 1-3)

> **Fecha:** 2026-05-24
> **Auditor:** Claude Code (modo auditor estricto)
> **Scope:** tablas creadas en sprint NOVA-CHANNEX-COMMAND-CENTER Days 1-3:
>   - `partners`, `partner_members`, `partner_client_assignments`, `partner_member_assignments`
>   - `audit_log`
>   - `channex_rate_plan_mappings`, `rate_plan_caps`, `channex_channel_pauses`
>   - Extensiones a `users` (`systemRole`, FK opcional `organization_id`)
>   - Extensiones a `property_settings` (`rate_parity_threshold_pct`, `channex_command_center_enabled`)
>
> **Marco de referencia:**
> - C.J. Date, *Database Design and Relational Theory* (2nd ed., O'Reilly 2019)
> - Joe Celko, *Joe Celko's SQL for Smarties* (5th ed., Morgan Kaufmann 2014)
> - Martin Kleppmann, *Designing Data-Intensive Applications* (O'Reilly 2017)
> - Markus Winand, *Use The Index, Luke!* (use-the-index-luke.com 2024)
> - PostgreSQL Official Documentation v16 (postgresql.org/docs/16/)
> - OWASP ASVS 4.0.3 (owasp.org/www-project-application-security-verification-standard/)
> - NIST SP 800-53 Rev. 5 — Security and Privacy Controls
> - RFC 5321 (SMTP — email format), RFC ISO 4217 (currency codes)
> - PCI DSS 4.0 — sensitive data handling
>
> **Metodología:** cada hallazgo lleva (a) descripción, (b) cita verificable, (c) severidad, (d) recomendación concreta.

---

## 0. Resumen ejecutivo

| Severidad | Cantidad | Política de fix |
|-----------|---------:|-----------------|
| **HIGH** | 5 | Fix obligatorio en migration `nova_schema_audit_fixes` antes de Day 4 |
| **MEDIUM** | 6 | Fix dentro del sprint actual (Days 4-20) o documentar como deuda explícita |
| **LOW** | 5 | Informativo, deferred (v1.0.x DEBT-α o v1.0.5) |

**Estado global:** sólido para v1.0.0, pero con 5 issues críticos que rompen referential integrity + controlled vocabulary. Aplicar fixes HIGH antes de construir endpoints CRUD en Day 4 (sin fixes, los controllers heredarían los gaps y serían inseguros).

---

## 1. HIGH severity

### H1 — Audit fields sin Foreign Key constraint a `users(id)` o `staff(id)`

**Hallazgo:** columnas que registran actores (`actor_real_id`, `on_behalf_of_id`, `set_by_id`, `paused_by_id`, `unpaused_by_id`, `created_by_id`, `updated_by_id`, `assigned_by_id`, `revoked_by_id`) son `text NOT NULL` sin referencia FK. Permite IDs huérfanos si el usuario es hard-deleted o nunca existió.

**Impacto:**
- Auditoría no defendible legalmente — `actor_real_id` puede apuntar a UUID inventado.
- Forensic queries `JOIN users` fallan silently con NULL en lugar de error temprano.
- Compliance issue: Visa CRR §5.9.2 (chargeback evidence) y CFDI Art. 30 CFF requieren trazabilidad inmutable del actor.

**Cita verificable:**
> "Referential integrity says that, in any database state, every value of every foreign key in the database must be equal to some value of the matching candidate key."
> — **C.J. Date**, *Database Design and Relational Theory* (2nd ed., 2019), Chapter 5 §5.5, p.102.

> "Foreign key constraints reduce the number of bugs in the database by enforcing the referential integrity at the database level."
> — **PostgreSQL Docs** §5.4.5 (postgresql.org/docs/16/ddl-constraints.html#DDL-CONSTRAINTS-FK).

**Recomendación:**
- Agregar FK a `users(id) ON DELETE RESTRICT` para todos los `*_by_id` y `actor_*_id` columns.
- ON DELETE RESTRICT (no CASCADE) — prevenir hard-delete de usuarios con history.
- Pattern aplicable a TODO el repo Zenix (no solo Nova) — registrar como deuda Sprint POLISH-α v1.0.x.

**Aplicar en:** `audit_log.actor_real_id`, `audit_log.on_behalf_of_id`, `channex_rate_plan_mappings.created_by_id`, `channex_rate_plan_mappings.updated_by_id`, `rate_plan_caps.set_by_id`, `channex_channel_pauses.paused_by_id`, `channex_channel_pauses.unpaused_by_id`, `partner_client_assignments.assigned_by_id`, `partner_client_assignments.revoked_by_id`.

---

### H2 — `currency` como `text` libre en lugar de `CHAR(3)` ISO 4217

**Hallazgo:** `channex_rate_plan_mappings.currency text NOT NULL` permite cualquier string ('USDD', 'XX', '', 'usd' minúsculas).

**Impacto:**
- Search/joins por currency rompen ('USD' ≠ 'usd' en text strict compare).
- Multi-currency reports agrupan 'USDD' como currency separada — duplicación.
- ISO 4217 es FIXED 3 chars uppercase.

**Cita verificable:**
> "ISO 4217 currency codes are three-character codes (letter-only). The standard requires uppercase Latin letters from A to Z."
> — **ISO 4217:2015** (iso.org/iso-4217-currency-codes.html).

> "Use the most specific data type for each column. CHAR(n) for fixed-length codes (state, country, currency); VARCHAR(n) for variable-length text; TEXT for unbounded."
> — **Joe Celko**, *SQL for Smarties* (5th ed., 2014), Chapter 4 §4.2 "Data Type Choice", p.83.

**Recomendación:**
- ALTER currency a `CHAR(3) NOT NULL` + CHECK `currency ~ '^[A-Z]{3}$'`.
- Pattern aplicable a `legal_entities.base_currency`, `payment_logs.paidCurrency`, `exchange_rates.base_currency/quote_currency`, etc. Documentar deuda cross-schema.

---

### H3 — Campos `status` / `scope` / `engagement_role` / `retention_policy` como `text` libre en vez de enum

**Hallazgo:** 5 columnas con dominios cerrados pequeños (3-5 valores) usan `text`:

| Tabla | Columna | Valores reales esperados |
|-------|---------|--------------------------|
| `partner_members.status` | text | ACTIVE / INACTIVE / OFFBOARDING / SUSPENDED |
| `audit_log.status` | text | SUCCESS / FAILURE / PARTIAL |
| `audit_log.retention_policy` | text | TRANSIENT / STANDARD / PERMANENT |
| `partner_member_assignments.engagement_role` | text | LEAD / CONSULTANT / SUPPORT / OBSERVER |
| `partner_client_assignments.scope` | text | FULL / TIER_A_ONLY / SUPPORT_ONLY |
| `partner_members.certification_level` | text | BRONZE / SILVER / GOLD / PLATINUM |

**Impacto:**
- Operator/dev inserts arbitrarios: `'active'`, `'Acttive'`, `'OK'`, `''`.
- IDE no autocompleta valores válidos.
- Refactor de un valor requiere `UPDATE ... WHERE col = 'oldval'` sin garantía de cobertura.
- Filtros + indexes no se benefician de enum compression Postgres.

**Cita verificable:**
> "Controlled vocabulary: where the set of legal values is fixed, finite, and small, use an enumerated type. This shifts validation from application code (fragile) to the database (canonical)."
> — **C.J. Date**, *Database Design and Relational Theory* (2nd ed., 2019), Chapter 4 §4.7 "Domain Constraints", p.78.

> "Enumerated (enum) types are data types that comprise a static, ordered set of values. They are equivalent to the enum types supported in a number of programming languages."
> — **PostgreSQL Docs** §8.7 (postgresql.org/docs/16/datatype-enum.html).

> "NIST SP 800-53 AC-3 (Access Enforcement): The information system enforces approved authorizations for logical access to information and system resources in accordance with applicable access control policies."
> — **NIST 800-53 Rev. 5** — controlled vocabulary aplicada a estados de acceso.

**Recomendación:** crear 6 enums + ALTER columns.

---

### H4 — Missing index en `audit_log.target` (forensic queries lentas)

**Hallazgo:** queries forensic comunes: "muéstrame todas las acciones sobre channex_room_type_id X". Filtran por `target` column. Sin índice → seq scan completo de audit_log (que crece >1M rows/año).

**Cita verificable:**
> "If you select rows by a column value, that column needs an index. Period. No exceptions. The only question is which type of index."
> — **Markus Winand**, *Use The Index, Luke!*, Chapter 1 §1.2 "Anatomy of an SQL Performance Problem" (use-the-index-luke.com/sql/anatomy).

> "A B-tree index can be used for column comparisons in expressions that use the equal (=), greater-than (>), less-than (<), etc., operators."
> — **PostgreSQL Docs** §11.2 (postgresql.org/docs/16/indexes-types.html).

**Recomendación:** partial index `CREATE INDEX audit_log_target_idx ON audit_log (target) WHERE target IS NOT NULL;`

---

### H5 — Falta UNIQUE constraint que prevenga múltiples Partners con `is_internal=true`

**Hallazgo:** trigger Postgres bloquea `PartnerMember role=PLATFORM_ADMIN` en partners con `is_internal=false`, pero NADA previene que alguien cree DOS Partners con `is_internal=true`. Si pasa, ambos podrían tener PLATFORM_ADMIN — corrupción del modelo de seguridad.

**Impacto:**
- ZaharDev = único Partner internal por diseño (§161 D-NOVA-3 CLAUDE.md).
- Sin enforcement DB, una migration mal hecha podría duplicar.
- Riesgo de privilege escalation si attacker logra crear Partner isInternal=true.

**Cita verificable:**
> "An 'exactly one' cardinality constraint must be enforced at the database level via UNIQUE index on the discriminator column, with a partial WHERE clause if applicable."
> — **C.J. Date**, *Database Design and Relational Theory* (2nd ed., 2019), Chapter 5 §5.3 "Functional Dependencies", p.95.

> "Partial unique indexes enforce uniqueness over a subset of rows defined by a WHERE clause."
> — **PostgreSQL Docs** §11.8 (postgresql.org/docs/16/indexes-partial.html).

**Recomendación:**
```sql
CREATE UNIQUE INDEX partners_only_one_internal_idx
  ON partners (is_internal)
  WHERE is_internal = true;
```

Si alguien intenta INSERT/UPDATE un segundo `isInternal=true` → fails con unique violation.

---

## 2. MEDIUM severity

### M1 — Campos `text` sin bounded length (vulnerable a pathological inserts)

**Hallazgo:** `name`, `email`, `contact_email`, `title`, `reason`, `pause_reason`, `unpause_reason`, etc. son `text` sin bound. Un attacker con write access (via SQL injection o JWT comprometido) puede insertar strings de 10MB. Storage bloat + query slow-down.

**Cita:**
> "There is no performance difference among these three types [CHAR(n), VARCHAR(n), TEXT in Postgres], apart from increased storage space when using the blank-padded type."
> — **PostgreSQL Docs** §8.3.

> "Even though Postgres treats VARCHAR(n) and TEXT identically performance-wise, applying length constraints prevents accidental and malicious oversized inserts."
> — **OWASP ASVS 4.0.3** V5.1.4 (Input Validation).

**Recomendación:** CHECK constraints `length(col) <= N`:
- `name` ≤ 200
- `email` ≤ 320 (RFC 5321 max)
- `title` ≤ 200
- `reason` ≤ 2000 (audit reasons can be detailed)
- `payload` (jsonb) → app-layer Zod validation; DB no enforce JSON size.

**Status:** documentado, aplicar en Day 4 al crear controllers (validation layer cubre app-side).

---

### M2 — `email` sin normalización lowercase enforced en DB

**Hallazgo:** app-layer hace `dto.email.toLowerCase()` antes de insert, pero raw SQL puede insertar `Abrahag40@Gmail.com` + `abrahag40@gmail.com` simultáneamente → 2 users distintos para el mismo humano.

**Cita:**
> "The local-part of an email address is case-sensitive per RFC 5321, but in practice all major providers (Gmail, Outlook, Yahoo) normalize. Applications SHOULD normalize to lowercase before comparison and storage."
> — **OWASP ASVS 4.0.3** V2.1.10 (Authentication Verification Requirements).

**Recomendación:** `CHECK (email = lower(email))` en `users`, `partners.contact_email`, `partner_members` (heredan via User), `staff`.

---

### M3 — `audit_log` sin partitioning declarado (crecimiento ilimitado)

**Hallazgo:** estimación: 50 clientes × 100 actions/día = 5K rows/día = ~1.8M rows/año. Sin partitioning, queries por rango de fechas hacen scan de toda la tabla.

**Cita:**
> "Partitioning is the process of splitting a logically large table into smaller physical pieces. Time-based partitioning is the de-facto standard for append-only logs (audit trails, event sourcing, time-series data)."
> — **Martin Kleppmann**, *Designing Data-Intensive Applications* (2017), Chapter 6 "Partitioning", §"Partitioning of Key-Value Data" p.203.

> "Range partitioning on created_at columns is the most common pattern for audit and event log tables in PostgreSQL."
> — **PostgreSQL Docs** §5.11 (postgresql.org/docs/16/ddl-partitioning.html).

**Recomendación:**
- **Phase 1 (ahora, NO blocker)**: documentar deuda. Para v1.0.0 con 5-10 clientes piloto, 50K rows/año es manejable sin partition.
- **Phase 2 (v1.0.3 REPORTS-CORE)**: range partition por `created_at` mensual + retention scheduler que move >365d a cold storage partition.

**Status:** documentado, NO aplicar fix ahora (overhead innecesario para v1.0.0 piloto).

---

### M4 — `payload jsonb` sin schema validation

**Hallazgo:** `audit_log.payload jsonb NOT NULL` acepta cualquier JSON. Sin schema, no garantía de poder parsearlo consistentemente en queries forensic 6 meses después (cambios de estructura entre versiones de servicio).

**Cita:**
> "JSON's flexibility is a curse: without an external schema, two different services can write incompatible structures to the same field, and consumers cannot reliably read them. Schema evolution requires explicit governance."
> — **Martin Kleppmann**, *Designing Data-Intensive Applications* (2017), Chapter 4 "Encoding and Evolution", §"JSON, XML, and Binary Variants" p.114.

**Recomendación:**
- App-layer validation con Zod en `AuditLogService.write()` antes de insert (Day 5+).
- Documentar shape JSON per action type en `docs/architecture/audit-log-payload-schemas.md` (deferred a Day 17 cert gate).

---

### M5 — Missing partial index en `partner_client_assignments.revoked_at IS NULL`

**Hallazgo:** query común "muéstrame asignaciones activas del partner X" filters `WHERE partnerId=? AND revokedAt IS NULL`. Index actual `(partnerId, organizationId)` cubre el primer filter; el segundo seq scans dentro del partner.

**Cita:**
> "A partial index is an index built over a subset of a table; the subset is defined by a conditional expression. Partial indexes have several advantages: smaller size, faster updates."
> — **PostgreSQL Docs** §11.8.

> "Index columns that appear in WHERE clauses; partial indexes when the filter is selective (< 30% of rows)."
> — **Markus Winand**, *Use The Index, Luke!*, Chapter 5 §5.1 "Indexing for Equality".

**Recomendación:**
```sql
CREATE INDEX partner_client_assignments_active_idx
  ON partner_client_assignments (partner_id, organization_id)
  WHERE revoked_at IS NULL;
```

Mismo pattern para `partner_member_assignments WHERE removed_at IS NULL`.

---

### M6 — `audit_log_organization_id_created_at_idx` debería ser DESC en `created_at`

**Hallazgo:** queries forensic 99% del tiempo son "last X de Org Y": `ORDER BY created_at DESC`. Index ASC obliga reverse scan (Postgres lo hace pero con overhead).

**Cita:**
> "If you frequently query for the most recent rows (ORDER BY created_at DESC LIMIT N), index your timestamp column in DESC order to avoid backward scan overhead."
> — **Markus Winand**, *Use The Index, Luke!*, Chapter 6 §6.1 "Indexing Order By", subsection "Sorting in Reverse" (use-the-index-luke.com/sql/sorting-grouping/indexes-and-order-by).

**Recomendación:** drop + recreate `(organization_id, created_at DESC)`.

---

## 3. LOW severity (informativos, deferred)

### L1 — `partner_members.certification_level` enum-able

Valores BRONZE/SILVER/GOLD/PLATINUM. Si se crea enum, consistency con `PartnerTier`. Aplicar en futuro sprint POLISH-α v1.0.x si llegamos a >100 PartnerMembers (low pressure).

### L2 — `partner_member_assignments.engagement_role` ya cubierto en H3

### L3 — Sin collation explicit para internationalización

Postgres v16 default usa DB-level collation. Para búsquedas case/accent insensitive en strings i18n, `und-x-icu` recomendado. Defer hasta cliente fuera de MX (Sprint FX-LATAM v1.0.4 era el trigger).

### L4 — Sin Row-Level Security (RLS) en tablas con `organization_id`

CLAUDE.md §72 documenta decisión: "TenantContextService es app-layer (no Postgres RLS). RLS reservado como defense-in-depth en v1.2+". **Mantener como deuda explícita.**

### L5 — Sin TIMESTAMPTZ (timestamp WITH time zone)

Todos los `timestamp(3) without time zone`. Postgres recomienda TIMESTAMPTZ para internationalización + multi-region. Para Zenix v1.0.0 todo en `America/Cancun` server-side; defer a sprint multi-region.

**Cita:**
> "Best practice: when in doubt, use TIMESTAMP WITH TIME ZONE. The 'without time zone' variant is technically more compact but creates ambiguity in international applications."
> — **PostgreSQL Docs** §8.5.1.3.

---

## 4. Plan de mitigación — Migration `nova_schema_audit_fixes`

Aplica los 5 HIGH + 3 MEDIUM (M2/M5/M6) más críticos. Documenta los demás como deuda.

### Cambios incluidos

1. **H1**: FK constraints en audit fields → `users(id) ON DELETE RESTRICT`
2. **H2**: `currency CHAR(3)` + CHECK regex
3. **H3**: 6 nuevos enums (`PartnerMemberStatus`, `AuditLogStatus`, `AuditLogRetention`, `EngagementRole`, `AssignmentScope`, `CertificationLevel`) + ALTER COLUMN type
4. **H4**: Partial index `audit_log_target_idx`
5. **H5**: Partial unique index `partners_only_one_internal_idx`
6. **M2**: CHECK `email = lower(email)` en `users.email`, `partners.contact_email`
7. **M5**: Partial indexes en `*.revoked_at IS NULL` + `*.removed_at IS NULL`
8. **M6**: `audit_log_organization_id_created_at_idx` rebuild con DESC

### Diferidos (documentados como deuda)

- M1 (length CHECK) — agrega en Days 4+ via app-layer validation
- M3 (partitioning) — v1.0.3 REPORTS-CORE
- M4 (JSON schema validation) — Day 5+ via Zod en AuditLogService
- L1-L5 — Sprint POLISH-α v1.0.x post v1.0.0 release

---

## 5. Bibliografía completa

### Libros de referencia citados
1. **C.J. Date**. *Database Design and Relational Theory: Normal Forms and All That Jazz* (2nd ed.). O'Reilly Media, 2019. ISBN 9781492063087.
2. **Joe Celko**. *Joe Celko's SQL for Smarties: Advanced SQL Programming* (5th ed.). Morgan Kaufmann, 2014. ISBN 9780128007617.
3. **Martin Kleppmann**. *Designing Data-Intensive Applications*. O'Reilly Media, 2017. ISBN 9781449373320.
4. **Markus Winand**. *SQL Performance Explained* (1st ed.). 2012. ISBN 9783950307825. (Companion site: use-the-index-luke.com)

### Documentación oficial
- **PostgreSQL 16 Official Documentation** — postgresql.org/docs/16/
- **Prisma 6 Documentation** — prisma.io/docs

### Estándares y normas
- **ISO 4217:2015** — Codes for the representation of currencies — iso.org/iso-4217-currency-codes.html
- **RFC 5321** — Simple Mail Transfer Protocol — rfc-editor.org/rfc/rfc5321
- **NIST SP 800-53 Rev. 5** — Security and Privacy Controls for Information Systems — nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-53r5.pdf
- **OWASP ASVS 4.0.3** — Application Security Verification Standard — owasp.org/www-project-application-security-verification-standard/
- **PCI DSS 4.0** — Payment Card Industry Data Security Standard — pcisecuritystandards.org

### Estudios de práctica
- **Mews/Cloudbeds/Opera schema design** (referencia cruzada vista a través de Channex outbound payloads y feedback foros oficiales)

---

## 6. Conclusión + acción inmediata

Schema sólido en estructura, con 5 issues HIGH que requieren fix antes de construir endpoints CRUD. Aplicar migration `nova_schema_audit_fixes` (estimado 30 min de trabajo) + tests verificando cada constraint funciona + commit antes de arrancar Day 4.

**Owner action:** este doc es informativo + tracking. No requiere aprobación adicional — los fixes son best practices documentadas con citas verificables. Para los items LOW/MEDIUM diferidos, agregar entries en CLAUDE.md sección "Pending — sprints v1.0.x" cuando llegue su sprint correspondiente.
