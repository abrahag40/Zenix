# MIGRATION-CORE — Plan de trabajo (SCRUM)

> **Módulo comercial:** **Zenix Onboard** — migración de datos desde cualquier PMS (Cloudbeds primero) hacia Zenix.
> **Versión objetivo:** v1.1.x (DLC / servicio de onboarding). No bloquea v1.0.0.
> **Estado:** PLAN — sin implementar. Aprobado por owner 2026-06-13 para formalizar.
> **Origen:** estudio de migración Cloudbeds→Zenix (sesión 2026-06-13). Pregunta del prospecto: "¿puedo migrar todos mis datos de Cloudbeds (años de uso)?".
> **Documentos hermanos:** [zenix-sales-master.md](../zenix-sales-master.md) Módulo 9 · [CLAUDE.md](../../CLAUDE.md) §MIGRATION-CORE.

---

## 0. Resumen ejecutivo (para no perder el hilo)

Construir un **motor de importación genérico + adapters por PMS de origen** (`ISourcePmsAdapter` — patrón Strategy, igual que `IPacAdapter` §89 / `IFiscalAdapter` / `IFxAdapter`), con **`CloudbedsAdapter` como primer adapter**. El consultor sube el export del PMS origen (CSV/XLSX), el sistema **valida y normaliza en staging sin tocar producción**, ejecuta **detección de empalmes (overlaps)** — el requisito explícito del owner: *avisar cuando dos huéspedes caen en la misma fecha + habitación/cama* — muestra un **dry-run/preview** con todo lo que se va a importar y sus conflictos, y solo tras aprobación hace un **load idempotente** que crea `GuestStay`/`StayJourney`/`StaySegment` con `source='MIGRATED'` + trazabilidad al ID de origen + AuditLog.

**No promete "migrar todo":** migra historial de reservas + huéspedes + inventario + contabilidad histórica consultable. **NO migra** (por ley o arquitectura): números de tarjeta (PCI-DSS), conexiones OTA en vivo (se re-conectan vía Channex), ni snapshots diarios de pace/STLY (no reconstruibles retroactivamente — §RATES-METRICS `MetricsDailySnapshot`).

**Doble entrega:** (a) **producto** — módulo en Nova que opera el consultor; (b) **servicio** — migración asistida "white-glove" de ZaharDev (mismo motor por debajo) como argumento de cierre contra "ya tengo años de data en otro PMS".

---

## 1. Product Goal (SCRUM)

> **Permitir que un hotel cambie a Zenix sin perder su historial — migrando reservas, huéspedes e inventario desde su PMS actual en horas, no semanas, con un preview que detecta empalmes y errores antes de tocar datos productivos.**

### Métricas de éxito (Definition of Success del producto)
- Migrar ≥2 años de historial de reservas de un export real de Cloudbeds en **<1 día de trabajo** del consultor (vs. "semanas" o "imposible" percibido).
- **0 empalmes silenciosos**: todo solape habitación/cama+fecha se reporta en el preview antes del load.
- **Load idempotente**: re-ejecutar el mismo job no duplica reservas.
- Migración trazable y auditable (qué archivo, quién, cuántas filas, qué se descartó y por qué).

---

## 2. Roles SCRUM (adaptados a la realidad del proyecto: 1 dev secuencial)

| Rol | Quién |
|---|---|
| **Product Owner** | Owner (ZaharDev) — prioriza backlog, aprueba alcance comercial. |
| **Scrum Master** | Owner / coordinador ZaharDev — remueve bloqueos, vela por ceremonias ligeras. |
| **Development Team** | 1 dev secuencial (asistido). Las ceremonias se adaptan: planning + review por sprint, daily asíncrono, retro al cierre de cada sprint. |
| **Stakeholders** | Consultores Nova (operan el módulo), prospecto piloto (provee export real para validar). |

> **Nota de honestidad metodológica:** con 1 dev, SCRUM se aplica en su espíritu (incrementos verticales, backlog priorizado, Definition of Done estricta, demo por sprint), no en su ceremonia completa (no hay daily standup multi-persona). Los "sprints" abajo son de **1 semana** (~5 días-dev) salvo indicación.

---

## 3. Definition of Ready (DoR) — una historia entra al sprint si…
- Tiene criterios de aceptación verificables.
- Sus dependencias (schema, endpoints, adapter) están listas o son parte del mismo sprint.
- El formato de dato de origen está documentado (para historias del adapter, requiere un export de muestra — real o sintético).

## 4. Definition of Done (DoD) — una historia se cierra si…
- Código + tests (unit del motor puro + integration del endpoint) verdes.
- Typecheck api + web verdes.
- Verificación funcional end-to-end del happy path (principio rector de calidad §1 CLAUDE.md).
- Multi-tenancy respetado (`organizationId` + `propertyId` en cada query, §9).
- Si toca UI: usa primitives canónicos (`DialogActions`, `ConfirmDialog`, `StyledInput`…) — sin UI ad-hoc (§3).
- AuditLog escrito para toda operación que modifica datos productivos.
- Documentado (decisión D-MIG§ + entrada en bitácora del plan).

---

## 5. Arquitectura (referencia para todas las historias)

```
[ Export del PMS origen ]  Cloudbeds CSV/XLSX (Reservations export, Guests, Manager's Report…)
        │ upload (consultor, en Nova)
        ▼
[ MigrationJob ]  estado: DRAFT → PARSING → VALIDATING → PREVIEW_READY → LOADING → COMPLETED | PARTIAL | FAILED
        │
        ▼
[ ISourcePmsAdapter.parse() ]  ← CloudbedsAdapter (1º). Conoce columnas del export y mapea a DTO canónico.
        │
        ▼
[ Staging tables ]  MigrationStagingReservation / MigrationStagingGuest  (raw + mapped, sin tocar producción)
        │
        ▼
[ Normalize ]  fechas→IANA per-property · moneda→ISO 4217 · trim/casefold ciudad · teléfono · dedup huéspedes
        │
        ▼
[ Collision / overlap detector ]  ★ requisito owner ★
   · solape MISMA habitación + rango de fechas (privadas)
   · solape MISMA cama + rango de fechas (dorms / hostal, bed-level)
   · staging-vs-staging  Y  staging-vs-reservas Zenix existentes
   · reusa la lógica de AvailabilityService.check (§35)
        │
        ▼
[ DRY-RUN / Preview ]  "3,412 reservas · 8 empalmes · 12 sin habitación mapeada · 40 huéspedes duplicados"
   · el consultor resuelve cada conflicto (skip / reasignar / aceptar) ANTES del load — NN/g H5
        │
        ▼
[ Load idempotente ]  crea GuestStay + StayJourney + StaySegment(ORIGINAL) · source='MIGRATED'
   · migrationSourceId (id de Cloudbeds) + migrationJobId · UNIQUE evita duplicar en re-run
   · AuditLog 'DATA_MIGRATED'  ·  AvailabilityService valida no-overbook al insertar (§35)
```

### Modelo de datos nuevo (propuesta — D-MIG2)
- **`MigrationJob`** — `id, organizationId, propertyId, sourceSystem ('CLOUDBEDS'|'MEWS'|…), status, fileName, fileHash, uploadedById, counts (Json: parsed/ok/warn/error/loaded), createdAt, completedAt`.
- **`MigrationStagingReservation`** — `jobId, rowIndex, rawJson, mapped (Json), validationStatus ('OK'|'WARN'|'ERROR'), issues (Json[]), resolution ('PENDING'|'SKIP'|'ACCEPT'|'REASSIGN'), targetRoomId?`.
- **`MigrationStagingGuest`** — análogo, con flag de dedup (`mergeIntoGuestId?`).
- **`MigrationConflict`** — `jobId, type ('ROOM_OVERLAP'|'BED_OVERLAP'|'DUP_GUEST'|'NO_ROOM_MATCH'|'UNMAPPED_RATE'|'BAD_DATE'|'NEGATIVE_AMOUNT'), severity ('WARN'|'ERROR'), rowRefs (Json), suggestion (Json), resolvedAt?`.
- **`GuestStay`** (extensión nullable, append-only): `migrationSourceId String?`, `migrationJobId String?`. UNIQUE parcial `(migrationJobId, migrationSourceId)` → idempotencia del re-run.

> Todo en staging es **descartable**: borrar un `MigrationJob` en estado pre-load no deja rastro en producción.

---

## 6. Épicas (Product Backlog de alto nivel)

| Épica | Nombre | Resultado |
|---|---|---|
| **E1** | Foundation & staging | Schema + `MigrationJob` lifecycle + upload + estado. |
| **E2** | CloudbedsAdapter + parsing | Subir export real/sintético → staging mapeado. |
| **E3** | Validación + **detección de empalmes** | Normalización + collision detector (room/bed). ★ |
| **E4** | Dry-run / Preview UI (Nova) | Pantalla de revisión con conflictos + resolución. |
| **E5** | Load idempotente + AuditLog | Crear reservas reales con trazabilidad, sin overbook. |
| **E6** | Servicio asistido + 2º adapter | Runbook white-glove + spike `MewsAdapter` (validar genericidad). |
| **E7** | QA + piloto real | Migración end-to-end con export real del prospecto. |

---

## 7. Sprints (paso a paso, con historias, criterios y entregables)

> Estimación en **story points (SP)** Fibonacci + **días-dev**. Total estimado: **~18-24 días-dev = ~4-5 semanas calendar** (1 dev). DLC, no bloquea v1.0.0.

---

### Sprint 0 — Discovery / Spike (2-3 días-dev)
**Sprint Goal:** entender el formato real de export de Cloudbeds y congelar el modelo de staging + el DTO canónico, sin escribir aún el motor productivo.

| # | Historia (As a… I want… so that…) | Criterios de aceptación | SP |
|---|---|---|---|
| US-0.1 | Como dev, quiero un **export de muestra** (real anonimizado o sintético fiel) de Cloudbeds (Reservations + Guests) para conocer columnas, tipos y casos borde. | Doc `docs/sprints/migration/cloudbeds-export-schema.md` con la lista de columnas por reporte, tipos, ejemplos y campos ambiguos. (Si no hay export real, generar uno sintético basado en la doc oficial Cloudbeds — marcar como `ASSUMED`.) | 3 |
| US-0.2 | Como PO, quiero el **DTO canónico** de migración (Reserva, Huésped, Inventario) definido en `packages/shared` para que todos los adapters mapeen a lo mismo. | `MigrationReservationDto` + `MigrationGuestDto` + enums en shared, con typecheck verde. | 2 |
| US-0.3 | Como dev, quiero el **modelo de staging** (schema Prisma) revisado y migración creada (sin wirear aún). | Migración `*_migration_core` aplicada aislada; `MigrationJob`/`Staging*`/`Conflict` + campos `GuestStay.migration*`. | 3 |

**Entregables Sprint 0:** doc de schema Cloudbeds + DTO canónico en shared + migración de staging aplicada. **Demo:** `prisma studio` mostrando las tablas vacías + el DTO compilando.
**Riesgo abierto:** sin export real, el adapter se construye sobre supuestos → US-7.x lo valida con data real del piloto.

---

### Sprint 1 — E1 Foundation & E2 parsing (5 días-dev)
**Sprint Goal:** un consultor sube un CSV de Cloudbeds en Nova y ve las filas **parseadas y mapeadas** en staging (sin validar aún).

| # | Historia | Criterios de aceptación | SP |
|---|---|---|---|
| US-1.1 | Como consultor, quiero **crear un MigrationJob subiendo un archivo** para arrancar una migración. | `POST /v1/nova/migration/jobs` (multipart o data-URI) crea job `DRAFT`, guarda `fileHash` (idempotencia de re-subida), `NovaActingOrgGuard` + scope. | 3 |
| US-1.2 | Como dev, quiero `CloudbedsAdapter.parse(file)` que convierte el export a `MigrationReservationDto[]` + `MigrationGuestDto[]`. | Parser XLSX/CSV (lib `xlsx`/`papaparse`); tolera columnas faltantes con warning; unit tests con archivo de muestra (≥3 casos: ok, columna faltante, fila corrupta). | 5 |
| US-1.3 | Como consultor, quiero ver **counts del parsing** (filas leídas / mapeadas / ilegibles) tras subir. | Job pasa a `PARSING`→`VALIDATING`; `GET /v1/nova/migration/jobs/:id` retorna counts; filas en `MigrationStagingReservation`. | 3 |
| US-1.4 | Como dev, quiero `ISourcePmsAdapter` + `SourcePmsAdapterRegistry` (Strategy) para que agregar un PMS = 1 clase. | Interface + registry con `get('CLOUDBEDS')`; `CloudbedsAdapter` registrado; throw `NotFoundException` si source no soportado. | 2 |

**Entregables Sprint 1:** endpoint de upload + CloudbedsAdapter parseando a staging + registry. **DoD:** unit tests del parser verdes + typecheck. **Demo:** subir un CSV de muestra y ver N filas en staging vía API.

---

### Sprint 2 — E3 Validación + **detección de empalmes** ★ (5 días-dev)
**Sprint Goal:** el sistema **normaliza** la data y **detecta todos los empalmes y errores** (el requisito del owner), dejando el job en `PREVIEW_READY`.

| # | Historia | Criterios de aceptación | SP |
|---|---|---|---|
| US-2.1 | Como dev, quiero **normalizar** cada fila (fecha→IANA per-property, moneda→ISO 4217, trim ciudad, teléfono, estado de reserva→enum Zenix). | Servicio puro `normalizeReservation()` con unit tests (timezone-safe §12, sin hardcode). Filas inválidas → `validationStatus='ERROR'` + issue. | 3 |
| US-2.2 | Como dev, quiero **mapear cada reserva a una habitación/cama de Zenix** por nombre/tipo. | Match por `room number`/`room type` contra inventario de la property; sin match → conflicto `NO_ROOM_MATCH` (no falla el job). | 3 |
| US-2.3 ★ | Como consultor, quiero que el sistema **avise cuando dos reservas se empalman** en la misma habitación+fechas (privadas) o **misma cama+fechas** (dorms/hostal), tanto entre las filas importadas como contra reservas que ya existan en Zenix. | `CollisionDetector` genera `MigrationConflict` tipo `ROOM_OVERLAP`/`BED_OVERLAP` por cada solape; cubre staging-vs-staging **y** staging-vs-existente; reusa la lógica de overlap de `AvailabilityService` (§35); bed-level para `category=SHARED`. Unit tests: 0 solapes, solape exacto, solape parcial, back-to-back (NO es solape), dorm 2 camas distintas (NO es solape), dorm misma cama (SÍ). | 8 |
| US-2.4 | Como dev, quiero **dedup de huéspedes** (mismo email/teléfono/nombre normalizado → 1 perfil). | Huéspedes duplicados marcados `DUP_GUEST` con sugerencia de merge; configurable umbral. | 3 |
| US-2.5 | Como consultor, quiero que el job quede en `PREVIEW_READY` con un **resumen de conflictos** consultable. | `GET …/jobs/:id/conflicts` retorna conflictos agrupados por tipo con counts. | 2 |

**Entregables Sprint 2:** normalización + room/bed mapping + **CollisionDetector** + dedup. **DoD:** suite de tests del detector verde (el corazón del módulo). **Demo:** subir un export con un empalme deliberado y ver el conflicto `BED_OVERLAP` reportado.

> **★ Detalle del requisito del owner (D-MIG3):** "empalme" = solape de rango de fechas `[checkIn, checkOut)` sobre el **mismo recurso físico** (habitación si privada; cama si dorm). Back-to-back (checkout día X = checkin día X) **NO** es empalme (consistente con la regla de disponibilidad §128). El detector corre **dos veces**: (1) entre las filas del propio import; (2) contra lo que ya existe en la BD de esa property (por si el hotel ya empezó a cargar reservas manualmente). Severity `ERROR` si bloquea (mismo recurso ocupado); el consultor decide resolución en el preview.

---

### Sprint 3 — E4 Dry-run / Preview UI en Nova (5 días-dev)
**Sprint Goal:** el consultor **ve y resuelve** todo en una pantalla antes de cargar nada a producción.

| # | Historia | Criterios de aceptación | SP |
|---|---|---|---|
| US-3.1 | Como consultor, quiero una **pantalla de preview** en `/nova/migration/:jobId` con el resumen (N reservas, N huéspedes, N conflictos por tipo). | Página Nova con StatTiles + tabla; usa primitives canónicos (§3); auto-refresh del estado del job. | 5 |
| US-3.2 | Como consultor, quiero **resolver cada conflicto** (skip la fila / reasignar habitación/cama / aceptar empalme histórico) sin tocar producción. | `PATCH …/staging/:rowId/resolution`; el preview recalcula counts; "aceptar empalme" requiere razón (audit). | 5 |
| US-3.3 | Como consultor, quiero **descartar el job completo** si la data está mal, sin haber tocado producción. | `DELETE …/jobs/:id` (solo pre-load) borra staging en cascada; AuditLog. | 2 |
| US-3.4 | Como consultor, quiero un **gate explícito**: no puedo cargar mientras haya conflictos `ERROR` sin resolver. | Botón "Importar a producción" deshabilitado con conflictos ERROR pendientes; copy informativo (NN/g H9). | 3 |

**Entregables Sprint 3:** UI de preview + resolución + gate. **DoD:** verificación en navegador del flujo subir→preview→resolver. **Demo:** resolver un `ROOM_OVERLAP` reasignando habitación y ver el conflicto desaparecer del preview.

---

### Sprint 4 — E5 Load idempotente + AuditLog (4-5 días-dev)
**Sprint Goal:** convertir el staging aprobado en **reservas reales** en Zenix, sin duplicar y sin generar overbooking.

| # | Historia | Criterios de aceptación | SP |
|---|---|---|---|
| US-4.1 | Como consultor, quiero **disparar el load** y que cree `GuestStay`+`StayJourney`+`StaySegment(ORIGINAL)` por cada reserva aprobada. | `POST …/jobs/:id/load`; crea entidades con `source='MIGRATED'`, `migrationSourceId`, `migrationJobId`; mirror del path canónico (§137). | 5 |
| US-4.2 | Como dev, quiero que el load sea **idempotente**: re-ejecutar no duplica. | UNIQUE `(migrationJobId, migrationSourceId)`; P2002 → skip fila; counts reflejan "ya existentes". | 3 |
| US-4.3 | Como dev, quiero que el load **respete el guard anti-overbook** (§35) al insertar. | Inserción dentro de `$transaction` con `AvailabilityService`; si un empalme se coló sin resolver, falla esa fila → `PARTIAL` + reportada (no rompe el job entero). | 3 |
| US-4.4 | Como auditor, quiero un **registro de la migración**. | AuditLog `DATA_MIGRATED` (actor, jobId, fileHash, counts) + job a `COMPLETED`/`PARTIAL` con desglose. | 2 |
| US-4.5 | Como consultor, quiero un **reporte post-migración** descargable (qué entró, qué se descartó y por qué). | `GET …/jobs/:id/report` (HTML/CSV) con resumen + filas descartadas + razones. | 3 |

**Entregables Sprint 4:** load productivo idempotente + audit + reporte. **DoD:** migración completa de un export de muestra verificada en el calendario de Zenix. **Demo:** cargar y ver las reservas migradas aparecer en el calendario PMS, con `source='MIGRATED'`.

---

### Sprint 5 — E6 Servicio asistido + spike 2º adapter (3-4 días-dev, opcional/posterior)
**Sprint Goal:** empaquetar la migración como **servicio vendible** + probar que el motor es genérico con un segundo PMS.

| # | Historia | Criterios de aceptación | SP |
|---|---|---|---|
| US-5.1 | Como ZaharDev, quiero un **runbook de migración asistida** (white-glove) para ofrecerla como servicio de cierre. | `docs/ops/migration-assisted-runbook.md`: pre-checks, fecha de congelamiento en el PMS origen, parallel-run, import del delta final, sign-off. | 3 |
| US-5.2 | Como dev, quiero un **spike `MewsAdapter`** (parse mínimo) para validar que agregar un PMS no requiere tocar el motor. | `MewsAdapter` registrado que parsea un export de muestra de Mews a `MigrationReservationDto`; confirma que E3-E5 funcionan sin cambios. | 5 |

**Entregables Sprint 5:** runbook de servicio + prueba de genericidad. **Demo:** correr el mismo pipeline con un adapter distinto.

---

### Sprint 6 — E7 QA + Piloto real (incluido en la venta, no estimado aquí)
- Migración end-to-end con un **export real del prospecto** (cuando exista).
- Validación de cutover (congelar Cloudbeds → migrar → reconectar OTAs vía Channex → arrancar en Zenix).
- Acuerdo escrito de alcance (qué migró / qué no — PCI, OTA live, pace/STLY), reusando la práctica de "acuerdo de alcance" del deploy.

---

## 8. Backlog priorizado (orden de valor)

1. **E3/US-2.3 (CollisionDetector)** — el requisito del owner y el diferenciador real; sin esto migrar es peligroso.
2. **E2 (CloudbedsAdapter)** — sin parsing no hay nada.
3. **E1 (staging/job)** — base.
4. **E4 (preview)** — convierte el motor en algo usable por un consultor no-técnico.
5. **E5 (load)** — cierra el ciclo.
6. **E6 (servicio + 2º adapter)** — escala comercial.

---

## 9. Riesgos (register)

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Sin export real, el adapter se construye sobre supuestos | Alta | Medio | Sprint 0 con export sintético marcado `ASSUMED`; US-7 valida con data real del piloto. |
| Formato Cloudbeds cambia entre versiones | Media | Medio | Adapter versionado + tests con archivos de muestra; el parser tolera columnas faltantes. |
| Calidad de data origen (vacíos, inconsistencias) | Alta | Medio | Staging + validación + reporte de descartes; nunca cargar a ciegas. |
| Empalmes reales en data histórica (hoteles SÍ sobre-reservaron) | Media | Medio | El detector los reporta; el consultor puede "aceptar empalme histórico" con razón (no inventamos disponibilidad). |
| Expectativa "se ve igual que Cloudbeds" | Media | Alto (venta) | Acuerdo de alcance + set de expectativas; el copy comercial es honesto. |
| PCI — el cliente pide migrar tarjetas | Baja | Alto | Documentado como límite legal universal; nunca se toca el PAN. |
| Dependencia de Cloudbeds (si se hace API) | — | — | Fase 1 es por archivo (self-service del dueño) → cero dependencia; API solo si el volumen lo justifica. |

---

## 10. Lo que NO está en alcance (explícito)
- Conector API directo a Cloudbeds (Fase posterior, solo si el volumen lo justifica; ver estudio §2 Opción B).
- Migración de datos de tarjeta (PCI — imposible por ley).
- Reconstrucción de `MetricsDailySnapshot` histórico (pace/pickup/STLY arrancan desde la migración).
- Migración de mapeos OTA en vivo (se re-conectan vía Channex; las reservas OTA pasadas sí migran como histórico).

---

## 11. Decisiones (D-MIG) — se §-numeran al cerrar el sprint
- **D-MIG1** — Motor **genérico + adapters** (`ISourcePmsAdapter` Strategy), no script de Cloudbeds. Mismo patrón §89.
- **D-MIG2** — **Staging descartable** antes de tocar producción; load idempotente vía `(migrationJobId, migrationSourceId)` UNIQUE.
- **D-MIG3** — **Detección de empalmes** room-level (privadas) + bed-level (dorms), staging-vs-staging y staging-vs-existente, reusando `AvailabilityService` (§35); back-to-back no es empalme (§128). Requisito explícito del owner.
- **D-MIG4** — **Dry-run/preview obligatorio** con gate de conflictos `ERROR` antes del load (NN/g H5). El consultor resuelve skip/reasignar/aceptar-con-razón.
- **D-MIG5** — **No migrar todo**: alcance honesto (reservas + huéspedes + inventario + contabilidad histórica). PCI/OTA-live/pace fuera por ley o arquitectura — documentado en el acuerdo de alcance.
- **D-MIG6** — Doble entrega: **producto** (módulo Nova) + **servicio** (migración asistida ZaharDev) sobre el mismo motor.

---

## 12. Bitácora
- **2026-06-13** — Plan creado tras estudio de migración Cloudbeds→Zenix (sesión con owner). Aprobado para formalizar como módulo Zenix Onboard (v1.1.x DLC/servicio). Sin export real aún (Sprint 0 usa sintético). Requisito explícito del owner incorporado como D-MIG3 (detección de empalmes huésped/habitación/cama).
