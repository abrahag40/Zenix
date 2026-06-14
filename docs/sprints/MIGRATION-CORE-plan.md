# MIGRATION-CORE — Plan de trabajo (SCRUM)

> **Módulo comercial:** **Zenix Onboard** — migración de datos desde cualquier PMS (Cloudbeds primero) hacia Zenix.
> **Versión objetivo:** v1.1.x (DLC / servicio de onboarding). No bloquea v1.0.0.
> **Estado:** **Sprints 0-2 CERRADOS** (2026-06-13/14). S0: DTO + schema staging + migración + export sintético. S1: módulo NestJS + `GenericCsvAdapter`/`CloudbedsAdapter` + parser CSV + endpoints upload/parse/mapping. S2: normalize + room-matcher + **CollisionDetector ★** (empalmes room/bed) + dedup → job a `PREVIEW_READY` + endpoint `/conflicts`. Sprints 3-6 pendientes. **Próximo: Sprint 3 (Preview UI en Nova).**
> **Origen:** estudio de migración Cloudbeds→Zenix (sesión 2026-06-13). Pregunta del prospecto: "¿puedo migrar todos mis datos de Cloudbeds (años de uso)?".
> **Documentos hermanos:** [zenix-sales-master.md](../zenix-sales-master.md) Módulo 9 · [CLAUDE.md](../../CLAUDE.md) §MIGRATION-CORE · **[migration/pms-export-landscape.md](migration/pms-export-landscape.md)** (estudio verificado de qué exporta cada PMS — fundamenta la estrategia de adapters).

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
[ ISourcePmsAdapter.parse() ]  ← GenericCsvAdapter (motor base, D-MIG7) + adapters pre-mapeados
   · GenericCsvAdapter: wizard de mapeo manual de columnas → cubre CUALQUIER PMS / Excel casero
   · CloudbedsAdapter / SirvoyAdapter / …: pre-mapean los orígenes comunes sobre el motor genérico
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

### Estrategia de adapters (fundamentada en el estudio [pms-export-landscape.md](migration/pms-export-landscape.md))

El estudio verificó que **casi todo PMS exporta reservas/huéspedes a CSV/Excel self-service** y que la **plantilla de import de la industria es casi idéntica** (1 fila/reserva: confirmación + huésped + llegada/salida + habitación + tarifa). De ahí la decisión clave:

- **D-MIG7 — `GenericCsvAdapter` con wizard de mapeo es el motor base.** Cubre **cualquier** origen (PMS sin adapter dedicado, o un Excel casero) porque el consultor mapea "esta columna = fecha de llegada". **Esto es lo que elimina la objeción "¿puedo migrar?" para todos.** Los adapters dedicados son **pre-mapeos** que aceleran los orígenes comunes — no motores separados.

| Tier de dificultad | Orígenes | Estrategia |
|---|---|---|
| **Trivial (Fase 1)** | Excel/Sheets, **Cloudbeds**, Sirvoy, WebRezPro, ResNexus | Plantilla/headers públicos → adapter = pre-mapeo sobre el motor genérico. |
| **Fácil con muestra** | RoomRaccoon, Little Hotelier, Hotelogix, Clock PMS+ | CSV claro; requiere 1 export de muestra para fijar columnas. |
| **Medio** | Mews | Reservation report → Excel (self-service) o Export API. Empezar por Excel. |
| **LATAM con muestra** | Zavia, NewHotel | Export a Excel; doc pública escasa → adapter sample-driven (campos en español). |
| **Enterprise / servicio** | OPERA Cloud | OHIP API + migración partner-assisted. No es el prospecto típico; va por servicio asistido (E6). |

> **Orden de construcción de adapters:** `GenericCsvAdapter` (motor) → `CloudbedsAdapter` (1er pre-mapeo, prospecto actual) → el resto bajo demanda cuando aparezca un prospecto de ese PMS (cada uno = 1 clase + tests con su export de muestra).

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

### Sprint 0 — Discovery / Spike (2-3 días-dev) — ✅ CERRADO 2026-06-13
**Sprint Goal:** entender el formato real de export de Cloudbeds y congelar el modelo de staging + el DTO canónico, sin escribir aún el motor productivo.

> **✅ Entregado (rama `feat/migration-sprint0`):**
> - **US-0.1** — Export sintético [samples/cloudbeds-sample.csv](migration/samples/cloudbeds-sample.csv) (15 filas con 10 casos borde deliberados: empalme room, dorm 2 camas, fecha inválida, monto negativo, huésped duplicado, acentos, `DD/MM/YYYY`, habitación vacía) + doc de schema [migration/cloudbeds-export-schema.md](migration/cloudbeds-export-schema.md) con el mapeo Cloudbeds→canónico + pre-mapeo del adapter. **Marcado `ASSUMED`** (sin export real — se reemplaza con trial Cloudbeds / archivo del piloto).
> - **US-0.2** — DTO canónico en `packages/shared`: `MigrationReservationDto`, `MigrationGuestDto`, `MigrationColumnMapping`, `MigrationParseResult` (types.ts) + enums `MigrationSource` (13 PMS incl. `GENERIC_CSV`), `MigrationJobStatus`, `MigrationRowStatus`, `MigrationConflictType` (incl. `ROOM_OVERLAP`/`BED_OVERLAP` ★), `MigrationConflictSeverity`, `MigrationResolution` (enums.ts). Shared compila limpio.
> - **US-0.3** — Schema Prisma: modelos `MigrationJob`, `MigrationStagingReservation`, `MigrationStagingGuest`, `MigrationConflict` + campos `GuestStay.migrationSourceId`/`migrationJobId` + UNIQUE `(migrationJobId, migrationSourceId)` + índices. `organizationId/propertyId/uploadedById` escalares denormalizados (§66) — sin tocar Organization/Property. Status/enums como String (filosofía espiral §95). Migración `20260616000000_migration_core_sprint0` **aplicada aislada** (excluido el drift de `webhook_deliveries` del diff) + cliente regenerado. Tablas verificadas vacías. Typecheck api + shared verdes.

| # | Historia (As a… I want… so that…) | Criterios de aceptación | SP |
|---|---|---|---|
| US-0.1 | Como dev, quiero un **export de muestra** (real anonimizado o sintético fiel) de Cloudbeds (Reservations + Guests) para conocer columnas, tipos y casos borde. | Doc `docs/sprints/migration/cloudbeds-export-schema.md` con la lista de columnas por reporte, tipos, ejemplos y campos ambiguos. (Si no hay export real, generar uno sintético basado en la doc oficial Cloudbeds — marcar como `ASSUMED`.) | 3 |
| US-0.2 | Como PO, quiero el **DTO canónico** de migración (Reserva, Huésped, Inventario) definido en `packages/shared` para que todos los adapters mapeen a lo mismo. | `MigrationReservationDto` + `MigrationGuestDto` + enums en shared, con typecheck verde. | 2 |
| US-0.3 | Como dev, quiero el **modelo de staging** (schema Prisma) revisado y migración creada (sin wirear aún). | Migración `*_migration_core` aplicada aislada; `MigrationJob`/`Staging*`/`Conflict` + campos `GuestStay.migration*`. | 3 |

**Entregables Sprint 0:** doc de schema Cloudbeds + DTO canónico en shared + migración de staging aplicada. **Demo:** `prisma studio` mostrando las tablas vacías + el DTO compilando.
**Riesgo abierto:** sin export real, el adapter se construye sobre supuestos → US-7.x lo valida con data real del piloto.

**Desglose técnico (pasos de dev):**
1. Generar export sintético de Cloudbeds (CSV) con ~50 reservas fieles a la doc oficial: columnas confirmation/guest/checkin/checkout/room/rate/source/status + 5 casos borde (acento en nombre, fecha en `DD/MM/YYYY` vs `YYYY-MM-DD`, monto negativo, fila sin habitación, huésped duplicado). Marcar el archivo como `ASSUMED` en su header.
2. Definir en `packages/shared/src/types.ts`: `MigrationReservationDto` (sourceId, guestName/first/last, email, phone, checkIn, checkOut, roomLabel, roomTypeLabel, ratePerNight, currency, totalAmount, status, sourceChannel, raw) + `MigrationGuestDto` + enums `MigrationSource`, `MigrationRowStatus`, `MigrationConflictType`, `MigrationConflictSeverity`.
3. Escribir `apps/api/prisma/schema.prisma`: modelos `MigrationJob`, `MigrationStagingReservation`, `MigrationStagingGuest`, `MigrationConflict` + campos `GuestStay.migrationSourceId`/`migrationJobId` + UNIQUE `(migrationJobId, migrationSourceId)` + relaciones inversas en `Property`/`Organization`.
4. `npx prisma migrate dev --name migration_core` (aplicar aislada; verificar con `prisma studio`). `npx prisma generate`.
5. Typecheck shared + api verdes.

---

### Sprint 1 — E1 Foundation & E2 parsing (5 días-dev)
**Sprint Goal:** un consultor sube un CSV de Cloudbeds en Nova y ve las filas **parseadas y mapeadas** en staging (sin validar aún).

| # | Historia | Criterios de aceptación | SP |
|---|---|---|---|
| US-1.1 | Como consultor, quiero **crear un MigrationJob subiendo un archivo** para arrancar una migración. | `POST /v1/nova/migration/jobs` (multipart o data-URI) crea job `DRAFT`, guarda `fileHash` (idempotencia de re-subida), `NovaActingOrgGuard` + scope. | 3 |
| US-1.2 | Como dev, quiero `ISourcePmsAdapter` + `SourcePmsAdapterRegistry` (Strategy) para que agregar un PMS = 1 clase. | Interface `{ id, parse(file) → {reservations,guests}, columnHints }` + registry con `get(source)`; throw `NotFoundException` si source no soportado. | 2 |
| US-1.3 ★ | Como dev, quiero un **`GenericCsvAdapter` con mapeo de columnas** (D-MIG7) que parsea CUALQUIER CSV/XLSX y deja que el consultor diga qué columna es cada campo canónico. | Parser XLSX/CSV (`xlsx`/`papaparse`); detecta headers; expone columnas crudas + un mapeo `{campoCanónico → headerOrigen}` editable; aplica el mapeo → `MigrationReservationDto[]`. Unit tests: CSV limpio, headers en español, columna faltante, fila corrupta. | 5 |
| US-1.4 | Como dev, quiero `CloudbedsAdapter` como **pre-mapeo** sobre el motor genérico (columnas de Cloudbeds ya resueltas). | `CloudbedsAdapter` provee el `columnHints` de Cloudbeds → el consultor no mapea a mano; reusa el parser del genérico; unit tests con el export sintético del Sprint 0. | 3 |
| US-1.5 | Como consultor, quiero ver **counts del parsing** (filas leídas / mapeadas / ilegibles) tras subir. | Job `PARSING`→`VALIDATING`; `GET /v1/nova/migration/jobs/:id` retorna counts; filas en `MigrationStagingReservation`. | 3 |

**Entregables Sprint 1:** endpoint de upload + `GenericCsvAdapter` (motor) + `CloudbedsAdapter` (pre-mapeo) + registry, parseando a staging. **DoD:** unit tests del parser verdes + typecheck. **Demo:** subir un CSV genérico, mapear columnas y ver N filas en staging; subir un export Cloudbeds y ver que se mapea solo.

> **✅ CERRADO 2026-06-14 (rama `feat/migration-sprint1`).** Entregado:
> - Módulo NestJS `apps/api/src/migration/` (bounded context): `MigrationModule` + `MigrationController` (Nova-scoped: `NovaTiersGuard`+`NovaActingOrgGuard`, IDOR check property/job ↔ acting org) + `MigrationService`. Registrado en `app.module.ts`.
> - **Parser CSV propio sin dependencias** (`adapters/csv-parser.ts`, subset RFC 4180: comillas, comas/saltos dentro de comillas, `""` escapado, BOM). XLSX diferido (necesita lib `xlsx`; mientras, "Guardar como CSV" cubre todo origen).
> - `ISourcePmsAdapter` + `SourcePmsAdapterRegistry` (Strategy §89). `GenericCsvAdapter` (D-MIG7, `defaultMapping=null` → wizard) + `CloudbedsAdapter` (pre-mapeo del schema doc). `reservation-mapper.ts` puro: aplica mapping → DTO, parsea fecha (DD/MM/YYYY default LATAM + ISO + valida imposibles), deriva `guestName`/`amountPaid`, dedup ligero de huéspedes.
> - Endpoints: `GET /v1/nova/migration/sources`, `POST /v1/nova/properties/:propertyId/migration/jobs` (upload base64 + parse + auto-map si dedicado), `GET /v1/nova/properties/:propertyId/migration/jobs`, `GET /v1/nova/migration/jobs/:jobId`, `POST /v1/nova/migration/jobs/:jobId/mapping`. **Idempotencia por `(propertyId, fileHash)`** (re-subir = mismo job).
> - **Tests:** 15/15 unit (`migration-parsing.spec.ts`: parser, parseSourceDate, mapRows, pipeline Cloudbeds). Typecheck api+shared+web verdes. **Verificación e2e contra BD dev:** subir `cloudbeds-sample.csv` → 15 filas en staging mapeadas (CB-100001→María Hernández→2026-02-01), status VALIDATING, idempotencia OK, cleanup en cascada OK.
> - **Pendiente Sprint 2:** la validación profunda (normalize timezone/ISO) + detección de empalmes + dedup real dejan el job en `PREVIEW_READY` (hoy queda en `VALIDATING` tras el mapeo, sin correr aún el CollisionDetector).

**Desglose técnico (pasos de dev):**
1. Nuevo módulo NestJS `apps/api/src/migration/` (bounded context, §Evans). `MigrationController` (Nova-scoped, `NovaActingOrgGuard`) + `MigrationService`.
2. `MigrationController.createJob`: recibe archivo (data-URI base64 como Maintenance MAINT-11, o multipart), valida tamaño (límite ~10MB), calcula `fileHash` (sha256) → si ya existe job con ese hash + property, retorna el existente (idempotencia de re-subida). Crea `MigrationJob` `DRAFT`.
3. `migration/adapters/source-pms-adapter.interface.ts` + `source-pms-adapter.registry.ts` (DI auto-discovery, mismo patrón que `PacAdapterRegistry` §181).
4. `migration/adapters/generic-csv.adapter.ts`: usa `papaparse`/`xlsx` para leer headers + filas; método `detectColumns()` → lista de headers crudos; método `applyMapping(rows, mapping)` → `MigrationReservationDto[]`. Tolerante: columna faltante = warning, no throw.
5. `migration/adapters/cloudbeds.adapter.ts`: define `columnHints` (mapeo Cloudbeds→canónico, del doc Sprint 0); delega el parseo al genérico.
6. `MigrationService.parse(jobId, mapping?)`: corre el adapter, persiste filas en `MigrationStagingReservation`/`Guest`, actualiza `counts`, job → `VALIDATING`.
7. Unit tests por adapter con los archivos de muestra. Typecheck api verde.

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

> **✅ CERRADO 2026-06-14 (rama `feat/migration-sprint2`).** Entregado:
> - **`collision/collision-detector.ts`** (★ D-MIG3, PURO): `detectCollisions(claims, existing)` con predicado half-open de AvailabilityService (§35); 2 pasadas (staging-vs-staging + staging-vs-existente); `ROOM_OVERLAP`/`BED_OVERLAP` según recurso; back-to-back NO es empalme (§128). El recurso = etiqueta del origen normalizada (distingue camas) para dorms, o `room:<id>` para privadas emparejadas.
> - **`validation/normalize-reservation.ts`** (PURO): valida fecha (BAD_DATE/MISSING_DATES = ERROR), monto negativo (WARN), mapea estado origen→canónico Zenix, aplica moneda base de la LegalEntity, deriva `occupies` (cancelada/no-show no ocupan).
> - **`validation/room-matcher.ts`** (PURO): empareja por número exacto / prefijo de dorm; `shared` por `Room.category=SHARED`; sin match → `NO_ROOM_MATCH`.
> - **`validation/guest-dedup.ts`** (PURO): agrupa por email>teléfono>nombre → `DUP_GUEST`.
> - **`MigrationService.validate(jobId)`**: orquesta todo, persiste `MigrationConflict` (idempotente: borra previos), actualiza `validationStatus`/`issues` por fila, job → `PREVIEW_READY` con counts {ok,warn,error,overlaps,conflicts}. Se corre automático tras el mapeo. + endpoint `GET /v1/nova/migration/jobs/:id/conflicts` (agrupado por tipo).
> - **Tests:** 37/37 (22 nuevos Sprint 2 incl. los casos DoD del detector: 0/exacto/parcial/contención/back-to-back/dorm-2-camas/dorm-misma-cama/disjuntos/staging-vs-existente/triple). Typecheck api+shared+web verdes. **Verificación e2e contra BD dev** con el sample (empalmes deliberados): status `PREVIEW_READY`, conflictos detectados exactos — ROOM_OVERLAP:1 (hab 103) · BAD_DATE:1 · NEGATIVE_AMOUNT:1 · DUP_GUEST:1 · NO_ROOM_MATCH:4. Cleanup en cascada OK.
> - **Pendiente Sprint 3:** UI de preview en Nova (resolver conflictos: skip/reasignar/aceptar) + gate de ERRORes antes del load.

> **★ Detalle del requisito del owner (D-MIG3):** "empalme" = solape de rango de fechas `[checkIn, checkOut)` sobre el **mismo recurso físico** (habitación si privada; cama si dorm). Back-to-back (checkout día X = checkin día X) **NO** es empalme (consistente con la regla de disponibilidad §128). El detector corre **dos veces**: (1) entre las filas del propio import; (2) contra lo que ya existe en la BD de esa property (por si el hotel ya empezó a cargar reservas manualmente). Severity `ERROR` si bloquea (mismo recurso ocupado); el consultor decide resolución en el preview.

**Desglose técnico (pasos de dev):**
1. `migration/normalize/normalize-reservation.ts` (función pura): fecha → `Date` UTC normalizada con timezone IANA de la property (helper existente, §12, sin hardcode); soporta `DD/MM/YYYY`, `YYYY-MM-DD`, `MM/DD/YYYY` con heurística + columna de formato configurable; moneda → ISO 4217 (default = `LegalEntity.baseCurrency`); `status` origen → enum Zenix (`ARRIVING/IN_HOUSE/CHECKED_OUT/NO_SHOW/CANCELLED`); trim/casefold de ciudad y nombre; teléfono normalizado. Fila inválida (fecha imposible, checkout≤checkin, monto negativo) → `validationStatus='ERROR'` + issue tipado.
2. `migration/mapping/room-matcher.ts`: matchea `roomLabel`/`roomTypeLabel` del DTO contra `Room.number` / `RoomType.name`/`code` de la property (case-insensitive, fuzzy ligero). Sin match → `MigrationConflict('NO_ROOM_MATCH')`. Para dorms, resuelve a `bedId` si el origen trae cama; si no, asigna a una cama del tipo.
3. `migration/collision/collision-detector.ts` (función pura, **el núcleo**): recibe el set de reservas staging (ya mapeadas a roomId/bedId + rango) + las reservas Zenix existentes de la property; computa solapes por recurso. Algoritmo: agrupar por `recursoId` (roomId privadas / bedId dorms), ordenar por checkIn, detectar solape `a.checkOut > b.checkIn && b.checkOut > a.checkIn`. Reusa el predicado de overlap de `AvailabilityService` (§35) — extraerlo a un helper compartido si hace falta. Genera `MigrationConflict('ROOM_OVERLAP'|'BED_OVERLAP')` con `rowRefs` de ambas reservas.
4. Correr el detector en **dos pasadas**: staging-vs-staging y staging-vs-`GuestStay` existente (query con el cutoff de zombies §128 para no chocar contra reservas ya salidas).
5. `migration/dedup/guest-dedup.ts`: agrupa huéspedes por email > teléfono normalizado > nombre normalizado; marca `DUP_GUEST` + `mergeIntoGuestId`.
6. `MigrationService.validate(jobId)`: orquesta normalize → room-match → collision → dedup; persiste `MigrationConflict[]`; job → `PREVIEW_READY`. `GET …/jobs/:id/conflicts` agrupa por tipo.
7. **Tests exhaustivos del CollisionDetector** (DoD del sprint): 0 solapes · solape exacto · solape parcial · contención (una dentro de otra) · back-to-back (NO) · dorm 2 camas distintas (NO) · dorm misma cama (SÍ) · staging-vs-existente · reserva cancelada/no-show no genera empalme.

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

**Desglose técnico (pasos de dev):**
1. Ruta Nova `/nova/migration` (lista de jobs) + `/nova/migration/:jobId` (detalle/preview). Entrada en el sidebar de Nova.
2. `NovaMigrationPage`: wizard de 3 pasos — (a) subir archivo + elegir origen (Cloudbeds / Genérico); (b) **si genérico**, UI de mapeo de columnas (dropdown por campo canónico ↔ header del archivo) con preview de 5 filas; (c) preview de validación.
3. Preview: `StatTiles` (reservas OK / WARN / ERROR · huéspedes · conflictos por tipo) + tabla virtualizada de conflictos. Reusa primitives canónicos (`DialogActions`, `ConfirmDialog`, `StyledSelect` §3). Auto-refresh del estado del job (React Query poll mientras `VALIDATING`).
4. Resolución por fila/conflicto: `PATCH …/staging/:rowId/resolution` con `{action: 'SKIP'|'REASSIGN'|'ACCEPT', targetRoomId?, reason?}`. "ACCEPT" de un empalme exige `reason` (textarea) → audit. El backend recalcula counts y devuelve el nuevo resumen.
5. Acción **descartar job** (`DELETE …/jobs/:id`, solo pre-load) con `ConfirmDialog` destructivo; borra staging en cascada + AuditLog.
6. **Gate**: botón "Importar a producción" `disabled` mientras `conflicts.filter(ERROR && !resolved).length > 0`; tooltip explicando qué falta (NN/g H9).
7. Hooks `useMigrationJob`/`useMigrationConflicts`/`useResolveRow` + `migrationApi` en `apps/web`. Typecheck web verde + verificación en navegador.

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

**Desglose técnico (pasos de dev):**
1. `MigrationService.load(jobId, actor)`: itera las filas `resolution != 'SKIP'` y `validationStatus != 'ERROR'`. Job → `LOADING`.
2. Por fila, dentro de `$transaction` (con el guard anti-overbook §35 + advisory lock por property como en `guest-stays.create`): crear `GuestStay` (`source='MIGRATED'`, `migrationSourceId`, `migrationJobId`, `bookingRef` generado con SRC `'M'`) + `StayJourney` + `StaySegment(reason='ORIGINAL')` — mirror del path canónico §137. Huéspedes dedupeados se reusan/crean.
3. **Idempotencia:** UNIQUE `(migrationJobId, migrationSourceId)`; capturar `P2002` → contar como "ya existente", no abortar. Re-ejecutar el load del mismo job no duplica.
4. **Tolerancia a fallo por fila:** si una fila falla (p. ej. un empalme no resuelto que se coló), capturar el error, marcar la fila `ERROR`, continuar; al final job → `COMPLETED` (todo ok) o `PARTIAL` (con filas fallidas reportadas). Nunca dejar el job a medias sin estado.
4. AuditLog `DATA_MIGRATED` (actorRealId, jobId, fileHash, counts loaded/skipped/failed) — append-only.
5. `GET …/jobs/:id/report` (HTML imprimible + CSV): resumen + lista de filas cargadas + lista de descartadas con su razón. Patrón del Activation Report (§183, sin Puppeteer).
6. Emitir SSE `booking:created` por cada reserva migrada para que el calendario de recepción se refresque (§124), o un evento `migration:completed` que invalide las queries del calendario.
7. **Verificación e2e:** correr el flujo completo (subir export sintético → preview → resolver → load) y confirmar en el calendario PMS que las reservas aparecen con su `bookingRef` `M-…` y que un segundo load no duplica.

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
- **D-MIG7** — **`GenericCsvAdapter` + wizard de mapeo de columnas es el motor base** (fundamentado en [pms-export-landscape.md](migration/pms-export-landscape.md): la plantilla de export es casi universal entre PMS). Cubre **cualquier** origen — PMS sin adapter dedicado o Excel casero — y es lo que elimina la objeción "¿puedo migrar?" para todos. Los adapters dedicados (Cloudbeds, Sirvoy…) son **pre-mapeos** sobre ese motor, no motores separados.

---

## 12. Bitácora
- **2026-06-13** (PM) — Estudio "PMS Export Landscape" verificado (12 PMS + Excel) → [migration/pms-export-landscape.md](migration/pms-export-landscape.md). Hallazgo: export CSV/XLSX self-service es casi universal + plantilla de import casi idéntica entre PMS. Incorporado al plan como **D-MIG7** (adapter genérico + wizard de mapeo como motor base), matriz de dificultad de adapters, y **desglose técnico paso-a-paso por sprint** (0-4). El workflow automático de deep-research falló por rate-limit; el estudio se hizo con búsqueda manual sobre help-centers/developer-portals oficiales.
- **2026-06-13** (AM) — Plan creado tras estudio de migración Cloudbeds→Zenix (sesión con owner). Aprobado para formalizar como módulo Zenix Onboard (v1.1.x DLC/servicio). Sin export real aún (Sprint 0 usa sintético). Requisito explícito del owner incorporado como D-MIG3 (detección de empalmes huésped/habitación/cama).
