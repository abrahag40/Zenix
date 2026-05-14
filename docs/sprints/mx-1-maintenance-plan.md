---
Audiencia: Equipo de desarrollo Zenix · Product owner · Stakeholders Mx-1
Estado: Plan de trabajo aprobado para ejecución
Branch: feature/sprint-mx1-maintenance
Última actualización: 2026-05-09
Sprint anterior cerrado: PR #8 (Sprint 9-HK ext + KP-01)
Disparador del sprint: caso real Hotel Monica Tulum (Bongaloo B2 vendido en encerado)
---

# Sprint Mx-1 — Módulo de Mantenimiento (Plan Maestro)

> **Misión del sprint**: construir el módulo definitivo de mantenimiento del PMS Zenix, con auto-bloqueo atómico de inventario al detectar trabajo crítico, audit trail fiscal-grade y bridge nativo Housekeeping ↔ Mantenimiento. Cierra v1.0.0 junto con Sprint 8J.

---

## 1. Contexto y motivación

### El caso disparador (Hotel Monica Tulum, abril 2026)

Mantenimiento inició el encerado de la habitación Bongaloo B2 sin bloquear el inventario en el PMS. La habitación se vendió en Booking.com mientras el piso estaba pegajoso. El hotel asumió la pérdida reubicando al huésped a una habitación superior. El manager declaró textualmente:

> *"No hay una lista de actividades que se esté revisando de lo que la gente está haciendo. Solamente se le dan instrucciones y no hay un seguimiento."*

Este sprint resuelve el problema operativo central que motivó al primer cliente piloto.

### Por qué es no-negociable para v1.0.0

Cualquier feature de housekeeping/PMS pierde credibilidad si una habitación en mantenimiento puede venderse. El módulo de mantenimiento es la columna vertebral de la promesa "PMS que protege tu revenue".

---

## 2. Hallazgos de la investigación de mercado

### 2.1 Tres tiers competitivos identificados

| Tier | Ejemplos | Mantenimiento |
|------|----------|---------------|
| **PMS entry-level** | Cloudbeds, Little Hotelier, Sirvoy, RoomRaccoon, Hostfully, Guesty | Sin módulo nativo. Bloqueo manual OOO/OOS. Integración vía marketplace con CMMS externos. |
| **PMS enterprise** | Opera Cloud, Mews (vía adquisición Flexkeeping 2024) | Módulo completo con tickets, fotos, audit trail. Pricing enterprise. |
| **Sistemas dedicados gold-standard** | Flexkeeping, Breezeway, hotelkit, Quore, ALICE/Actabl, HotSOS, MaintainX | Construidos para work orders. Mobile-first. Foto antes/después. SLA tracking. |

### 2.2 El gap de mercado que Zenix puede capturar

**Ningún competidor documenta públicamente** un trigger automático "ticket CRITICAL → habitación OOO en la misma transacción atómica". Lo más cercano:

- **Opera Cloud**: ofrece un *checkbox manual* "Place room OOO during selected period" al crear el ticket — opt-in, no regla automática.
- **Cloudbeds**: el bloque OOS y el work order son entidades **separadas**; el usuario debe crear ambos. ([Cloudbeds Help Center](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/220747288-Overbooking-types-in-Cloudbeds-PMS) confirma: *"el sistema aún permite a los usuarios crear un bloqueo de habitación o marcar una habitación como out-of-service, lo que puede llevar a un overbooking"*).
- **Mews / Flexkeeping**: no documentado público.

**La decisión D-Mx2 de Zenix (auto-bloqueo síncrono dentro de la transacción) es defendible como ventaja competitiva** — resuelve exactamente el caso Hotel Monica Tulum.

### 2.3 Comparativa de features clave (resumen)

| Feature | Mews | Opera | Cloudbeds | Clock | Quore | Flexkeeping | Breezeway | hotelkit | **Zenix Mx-1** |
|---------|:---:|:----:|:---------:|:-----:|:-----:|:----------:|:---------:|:--------:|:--------------:|
| Módulo nativo | ✅ | ✅ | ⚠️ parcial | ⚠️ | N/A | ✅ | ✅ | ✅ | ✅ |
| **Auto-bloqueo CRITICAL atómico** | ❌ | ❌ (checkbox manual) | ❌ | ❌ | ❌ | ❌ | ⚠️ async | ❌ | **✅ síncrono D-Mx2** |
| Foto antes/después | ✅ | ⚠️ limitado | ❌ nativo | ❌ | ✅ | ✅ | ✅✅ killer | ✅ | ✅ |
| Audit trail completo | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ gap | ✅ NFC | ✅ append-only |
| Mobile parity | ⚠️ | ⚠️ | ❌ | ⚠️ | ⚠️ pesado | ✅ | ⚠️ gap | ✅ | **✅ no compromise** |
| Bridge HK→Mtto nativo | ✅ | ✅ | ❌ | ✅ | ✅ | ✅✅ | ✅ | ✅ | **✅ sourceTaskId** |
| Cumplimiento fiscal LATAM | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅ append-only USALI 12** |
| Pricing per-property hostal | ❌ | ❌ | ❌ | ⚠️ | ❌ (50-room min) | ❌ | ⚠️ | ❌ | **✅ diferenciador** |

### 2.4 Voces de usuarios — top quejas (validan nuestras decisiones)

1. **"La habitación se sigue vendiendo aunque hay mantenimiento crítico"** → resuelto por D-Mx2.
2. **"No hay historial en tareas o unidades para ver quién cambió qué y cuándo"** ([Breezeway en Capterra](https://www.capterra.com/p/186514/Breezeway/reviews/)) → resuelto por D-Mx4 `MaintenanceTicketLog` append-only.
3. **"La app móvil no tiene las mismas capacidades que la plataforma desktop"** ([ALICE en Hotel Tech Report](https://hoteltechreport.com/operations/concierge-software/alice-concierge), Breezeway) → resuelto por mobile parity.
4. **"La integración con Oracle PMS rompe 1-2 veces por semana"** ([ALICE](https://hoteltechreport.com/operations/concierge-software/alice-concierge)) → eliminado por D-Mx6 monolítico.
5. **"Los pedidos viajan por radio/WhatsApp/pizarra, el trabajo puede hacerse pero el registro no existe"** ([oxmaint](https://oxmaint.com/industries/hospitality/hotel-maintenance-work-order-process)) → resuelto por reporte one-tap desde tarea HK con `sourceTaskId`.

### 2.5 Voces de usuarios — top features amadas (validan nuestro alcance)

1. **Foto desde mobile en el momento** ([Snapfix](https://snapfix.com/hotels)) — incorporado.
2. **Comunicación dentro del ticket, no en WhatsApp paralelo** ([MaintainX](https://www.capterra.com/p/179296/GetMaintainx/reviews/)) — `MaintenanceTicketComment` ya en schema.
3. **Escalación automática SLA-based** ([hotelkit 2025](https://hotelkit.net/blog/hotelkit-annual-review-2025/)) — agregamos `MaintenanceEscalationScheduler`.
4. **Estado de habitación auto-actualizado** ([thehotelgm](https://thehotelgm.com/tools/best-hotel-maintenance-software/)) — D-Mx2 + D-Mx3.
5. **Mantenimiento preventivo cíclico por equipo** ([clickmaint](https://www.clickmaint.com/blog/hotel-maintenance-software-solves-pain-points)) — **diferido a Mx-2 / v1.1**, no en este sprint.

### 2.6 Insights LATAM-específicos

- **Pricing per-room con minimums de 50** (Quore, ALICE) excluye al hostal de 20 camas. Zenix gana con flat fee per-property.
- **WhatsApp como canal cultural** entre staff y huéspedes ([MiniHotel PMS](https://selecthub.com/p/hotel-management-software/), [Loggro Colombia](https://loggro.com/blog/articulo/los-10-mejores-softwares-para-alojamientos-y-propiedades-de-colombia/)) — nuestra postura: WhatsApp para huésped (ya implementado en pre-arrival), **comunicación staff↔staff dentro del ticket** (no en WhatsApp paralelo).
- **Time-to-value < 1 hora** es el factor de compra real ([Maintainly](https://maintainly.com/articles/the-best-hotel-maintenance-software-in-2026-what-the-hospitality-industry-actually-needs)). Seed con categorías default → manager opera sin configurar.

---

## 3. Arquitectura — estado actual y dependencias

### 3.1 Schema (✅ completo en `main`)

Verificado en `apps/api/prisma/schema.prisma` líneas 329-374 y 2343-2475:

| Componente | Líneas | Estado |
|------------|--------|--------|
| `enum TicketStatus` (7 estados) | 329-337 | ✅ OPEN → ACKNOWLEDGED → IN_PROGRESS → WAITING_PARTS → RESOLVED → VERIFIED → CLOSED |
| `enum TicketPriority` (4 niveles) | 339-344 | ✅ LOW / MEDIUM / HIGH / CRITICAL |
| `enum TicketCategory` (11 valores) | 346-358 | ✅ PLUMBING, ELECTRICAL, FURNITURE, APPLIANCE, HVAC, STRUCTURAL, COSMETIC, SAFETY, PEST, DEEP_CLEANING, OTHER |
| `enum TicketLogEvent` (14 eventos) | 360-374 | ✅ Incluye REOPENED, COMMENT_ADDED, PHOTO_ADDED, BLOCK_AUTO_* |
| `model MaintenanceTicket` | 2343-2418 | ✅ Con `sourceTaskId`, `guestImpact`, 7 actores |
| `model MaintenanceTicketPhoto` | 2420-2435 | ✅ Con `isAfterPhoto` |
| `model MaintenanceTicketComment` | 2437-2453 | ✅ |
| `model MaintenanceTicketLog` | 2455-2475 | ✅ Append-only (sin `updatedAt`) |
| Bridge `RoomBlock.maintenanceTicketId @unique` | 1517 | ✅ FK del lado RoomBlock (evita ciclo) |
| 7 relaciones cross-model en `Staff` | 651-657 | ✅ |
| Categorías en `AppNotificationCategory` | NotificationCenter | ✅ MAINTENANCE_TICKET_CREATED / _UPDATED / _CRITICAL |

### 3.2 Modelo legacy preservado

`MaintenanceIssue` (línea 824) queda en BD por compatibilidad. **No se usa para flujos nuevos** (D-Mx1). La migración del legacy queda como deuda técnica documentada.

### 3.3 Dependencias verificadas

| Dependencia | Ubicación | Estado |
|-------------|-----------|--------|
| `SmartBlockService.createBlock()` | `apps/api/src/blocks/blocks.service.ts:79` | ✅ Soporta `maintenanceTicketId` y `BlockReason.MAINTENANCE_FAILURE` |
| `SmartBlockService.activateBlock()` | `apps/api/src/blocks/blocks.service.ts:338` | ✅ Crea CleaningTask si aplica |
| `NotificationCenterService.send()` | `apps/api/src/notification-center/notification-center.service.ts:41` | ✅ |
| `PushService.sendToStaff()` | `apps/api/src/notifications/push.service.ts` | ✅ |
| `Staff.department === MAINTENANCE` | `enum Department` schema | ✅ D-Mx5 |
| `TenantContextService` | `apps/api/src/common/tenant-context.service.ts` | ✅ |
| `PmsSseListener` patrón | `apps/api/src/pms/pms-sse.listener.ts` | ✅ Patrón `@OnEvent` |
| `useSSE` hook web | `apps/web/src/hooks/useSSE.ts` | ✅ |
| `react-native-sse` mobile | `apps/mobile/src/api/useSSE.ts` | ✅ |

### 3.4 ⚠️ Dependencia faltante (bloqueante para fotos)

**`POST /v1/uploads`** — endpoint de upload de archivos (FormData multipart) **no existe**.

**Decisión**: implementar como sub-tarea del sprint (módulo `apps/api/src/uploads/`) con storage local en disk (`/var/zenix/uploads`) + URL servida por NestJS estático. S3/Cloudinary queda como upgrade post-v1.0.0 sin cambios en el contrato.

### 3.5 ⚠️ Componente legacy a migrar

`apps/web/src/pages/MaintenancePage.tsx` actual lee `MaintenanceIssue` (legacy). El nuevo `MaintenancePage.tsx` lee `MaintenanceTicket`. Estrategia: **renombrar el archivo legacy a `LegacyMaintenanceIssuesPage.tsx`** y desacoplar de la ruta `/maintenance`. La ruta nueva apunta al nuevo componente.

---

## 4. Decisiones No-Negociables — síntesis y refuerzos

Las 7 decisiones D-Mx1..D-Mx7 ya documentadas en CLAUDE.md §47-§53 se mantienen intactas. Este sprint añade refuerzos basados en investigación:

### Refuerzo R1 — Foto "después" obligatoria para VERIFIED en CRITICAL/HIGH

**Origen**: queja recurrente *"el técnico marcó done pero el problema sigue"* + propaganda Breezeway *"representative photos"* como diferenciador #1.

**Refinamiento de D-Mx7**: la foto `isAfterPhoto: true` es **requerida** para mover `RESOLVED → VERIFIED` cuando `priority IN (CRITICAL, HIGH)`. Backend lanza `BadRequestException` si falta. Para `LOW/MEDIUM` sigue opcional.

**Justificación**: Baymard 2022 — documentación visual reduce disputas en 73%. Forcing function (Norman 1988) en el punto donde el supervisor cierra el ciclo.

### Refuerzo R2 — Auto-asignación reusando `AssignmentService` del Sprint 8H

**Origen**: queja *"tickets que nacen UNASSIGNED y mueren UNASSIGNED"* + D-Mx5 (técnicos son `Staff` con `department=MAINTENANCE`).

**Decisión**: extender `AssignmentService.autoAssign()` (existente) para soportar tickets de mantenimiento. Reglas idénticas a HK: COVERAGE_PRIMARY → COVERAGE_BACKUP → ROUND_ROBIN. Filtrar por `staff.department === MAINTENANCE` y `staff.capabilities` cuando aplique (PLUMBING, ELECTRICAL, etc.).

**Modelo de datos**: `StaffCoverage` ya existe (Sprint 8H). Se documenta que `coverage.staff.department` define a qué se asigna el room — un staff de housekeeping no recibe tickets de mantenimiento aunque cubra el room.

### Refuerzo R3 — Escalación SLA automática (`MaintenanceEscalationScheduler`)

**Origen**: queja *"el ticket se estanca y nadie se entera"* + feature amada de hotelkit 2025.

**Decisión**: nuevo cron `MaintenanceEscalationScheduler` (`*/15 * * * *`, multi-timezone, idempotente). Reglas:

| Trigger | Acción | Tier (D16) |
|---------|--------|------------|
| `priority=CRITICAL` AND `status=OPEN` AND `age > 30 min` | Notif al manager + reasignación auto | **2.5 Elevated** |
| `priority=CRITICAL` AND `status IN (OPEN, ACKNOWLEDGED)` AND `age > 2h` | Notif tier 3 al manager + log `ESCALATED` | **3 Alarm (única excepción HK)** |
| `priority=HIGH` AND `status=OPEN` AND `age > 4h` | Notif al supervisor del area | **2 Notification** |

**Justificación**: este es el único uso legítimo del Tier 3 fuera de evacuación (§56 D16) — un ticket CRITICAL a 2h sin acknowledged es emergencia operacional verificable.

### Refuerzo R4 — Time-to-value < 1 hora con seed default

**Origen**: factor de compra documentado en Maintainly + curva de aprendizaje crítica por turnover 30-70% en mantenimiento hotelero.

**Decisión**: extender `apps/api/prisma/seed.ts` con:
- 11 categorías default por propiedad (ya existen como enum, no requieren config).
- 1 técnico de mantenimiento demo (`m@z.co` ya existe como housekeeper; agregar `t@z.co` con `department=MAINTENANCE`).
- 0 configuración requerida — el manager puede crear tickets desde el primer login.

### Refuerzo R5 — Comunicación dentro del ticket, NO WhatsApp paralelo

**Origen**: feature amada de MaintainX *"conversations on the work order itself, not in a separate Slack thread or WhatsApp group"*.

**Decisión**: UX que disuada explícitamente WhatsApp como canal interno. El `TicketDetailDrawer` muestra el thread de comments como conversación natural (avatar + timestamp + texto + foto inline). Push notifications cuando alguien comenta para que no necesiten salir de la app.

**Mantener**: WhatsApp para huésped (pre-arrival warming, ya implementado §NS-08).

---

## 5. Alcance del sprint — IN / OUT

### IN (debe completarse para cerrar Mx-1)

**Backend:**
- `MaintenanceModule` completo (service + controller + DTOs + tests ≥25)
- 11 endpoints REST documentados en CLAUDE.md
- Integración síncrona con `SmartBlockService` (D-Mx2 / D-Mx3)
- Listener SSE `maintenance:*` (created, updated, resolved, verified, escalated)
- Notificaciones automáticas vía `NotificationCenterService` (D-Mx2 → push tier 2.5 al manager)
- `MaintenanceEscalationScheduler` (Refuerzo R3)
- Auto-asignación reusando `AssignmentService` (Refuerzo R2)
- Módulo `UploadsModule` con `POST /v1/uploads` (storage local v1.0)
- Seed actualizado con técnico demo (Refuerzo R4)
- 25+ unit tests cubriendo el ciclo + bridge crítico + escalación

**Web:**
- `MaintenancePage.tsx` con 2 vistas: lista filtrada + Kanban (5 columnas: OPEN/ACKNOWLEDGED/IN_PROGRESS/WAITING_PARTS/RESOLVED)
- `TicketDetailDrawer.tsx` (panel 480px) con tabs: Detalle / Comentarios / Fotos / Historial
- Badge `🔧 Mtto` en `DailyPlanningGrid` (HK-04 cross-module integration)
- Indicator visual en bloques del calendario PMS para habitaciones bloqueadas por CRITICAL
- Renombrar `MaintenancePage.tsx` legacy → `LegacyMaintenanceIssuesPage.tsx` (deprecated route)

**Mobile:**
- `apps/mobile/app/(app)/maintenance/index.tsx` — Hub para técnicos (`department=MAINTENANCE`)
- Botón "⚠️ Reportar problema" en `task/[id].tsx` (housekeeper detecta durante limpieza) → 3 taps al ticket creado con `sourceTaskId` automático
- Detalle de ticket con acciones: ACKNOWLEDGED, START, REQUEST_PARTS, RESOLVE (foto requerida en CRITICAL/HIGH per Refuerzo R1)
- Upload de foto via Expo ImagePicker → `POST /v1/uploads`
- Mobile parity con web (no "lite version" — Refuerzo de queja #3)

### OUT (queda fuera, documentado para sprints posteriores)

- **Mantenimiento preventivo cíclico** (PM por asset con scheduling) → Mx-2 / v1.1
- **NFC/QR tags por activo** (`MaintenanceAsset` model) → v1.1
- **AI voice assistant** para reportar repairs multilingüe → v1.2
- **Reportes MTTR/MTBF avanzados** (dashboard ejecutivo) → cubierto parcialmente; dashboard completo en v1.0.x
- **Integración con CMMS externos** (Quore, MaintainX como fallback) → no aplica, es lo que reemplazamos
- **Mantenimiento por activo más que por habitación** (caldera, generador, etc.) → v1.1

---

## 6. Plan de ejecución por fases

### Fase 1 — Backend Foundation (días 1-3)

**Entregables:**
1. `apps/api/src/uploads/` módulo nuevo: `POST /v1/uploads` (multer + local disk + URL)
2. `apps/api/src/maintenance/maintenance.module.ts`
3. `apps/api/src/maintenance/maintenance.service.ts` con métodos: `createTicket`, `acknowledgeTicket`, `assignTicket`, `startTicket`, `requestParts`, `resolveTicket`, `verifyTicket`, `closeTicket`, `reopenTicket`, `addComment`, `addPhoto`
4. **D-Mx2 atómico**: `createTicket` con `priority=CRITICAL` invoca `smartBlock.createBlock()` + `activateBlock()` dentro del mismo `prisma.$transaction()`. Si falla el bloqueo, falla el ticket. **Sin fire-and-forget.**
5. **D-Mx3**: `verifyTicket` libera `RoomBlock` asociado dentro de la misma transacción + crea `CleaningTask(PENDING)` para limpieza post-mantenimiento.
6. Listener `MaintenanceSseListener` con eventos: `maintenance:reported`, `maintenance:acknowledged`, `maintenance:assigned`, `maintenance:started`, `maintenance:resolved`, `maintenance:verified`, `maintenance:escalated`.
7. Notificaciones via `NotificationCenterService.send()` en cada transición.
8. Tests unitarios ≥25, cubriendo:
   - Ciclo completo OPEN → CLOSED
   - Auto-bloqueo CRITICAL atómico (con assertion del `RoomBlock` creado)
   - Auto-liberación VERIFIED atómica (con assertion del `RoomBlock` liberado + `CleaningTask` creada)
   - Refuerzo R1: rechazo de VERIFIED sin `isAfterPhoto` para CRITICAL/HIGH
   - Auto-asignación con `Staff.department=MAINTENANCE`
   - Reopen desde VERIFIED (regresión)
   - Edge case: ticket creado sin sourceTaskId (reporte directo desde web)

### Fase 2 — Escalación + Auto-asignación (día 4)

**Entregables:**
1. `MaintenanceEscalationScheduler` (`@Cron('*/15 * * * *')`) multi-timezone, idempotente vía `lastEscalationAt` por ticket
2. Extensión de `AssignmentService.autoAssign()` para tickets (Refuerzo R2)
3. Tests del scheduler (≥6 tests cubriendo los 3 triggers)
4. Seed actualizado: técnico `t@z.co` con `department=MAINTENANCE`, capabilities `[PLUMBING, ELECTRICAL]`, en propiedad Tulum

### Fase 3 — Web UI (días 5-7)

**Entregables:**
1. `apps/web/src/modules/maintenance/api/maintenance.api.ts` (cliente)
2. `apps/web/src/modules/maintenance/hooks/useMaintenanceTickets.ts` + `useMaintenanceTicket.ts`
3. `apps/web/src/pages/MaintenancePage.tsx` con toggle Lista/Kanban (URL `?view=list|kanban`)
4. `apps/web/src/modules/maintenance/components/TicketCard.tsx` (3 zonas: identity / status / footer — pattern KP-01)
5. `apps/web/src/modules/maintenance/components/TicketDetailDrawer.tsx` (480px, 4 tabs)
6. `apps/web/src/modules/maintenance/components/TicketKanbanBoard.tsx` (5 columnas, drag-and-drop con confirmación per §32)
7. Modal de creación de ticket desde web (recepcionista observa problema directo)
8. Badge `🔧 Mtto` integrado en `DailyPlanningGrid` (cross-module)
9. Indicator en `BookingsLayer` para habitaciones bloqueadas por CRITICAL ticket (rayas naranjas + badge "Mtto crítico")
10. Renombrar y desactivar legacy `MaintenancePage.tsx`

### Fase 4 — Mobile (días 8-10)

**Entregables:**
1. `apps/mobile/src/store/maintenance.ts` (Zustand store con offline queue)
2. `apps/mobile/src/api/maintenance.api.ts`
3. `apps/mobile/app/(app)/maintenance/index.tsx` — Hub técnico con tickets asignados
4. `apps/mobile/app/(app)/maintenance/[id].tsx` — Detalle + acciones one-tap
5. Botón "⚠️ Reportar" en `apps/mobile/app/(app)/task/[id].tsx` (housekeeper) → modal 3 taps
6. Foto upload via Expo ImagePicker → `POST /v1/uploads`
7. Push notifications integradas (D-Mx2 + escalación)
8. SSE listener para `maintenance:*` en foreground (D8)

### Fase 5 — Integración E2E + Documentación (día 11)

**Entregables:**
1. Test E2E manual del caso Hotel Monica Tulum:
   - Housekeeper crea ticket CRITICAL desde tarea HK
   - Verificar habitación BLOQUEADA en calendario PMS en <2 segundos
   - Verificar push al manager
   - Manager intenta crear reserva → 409 ConflictException
   - Técnico resuelve con foto "después"
   - Supervisor verifica → habitación liberada + tarea limpieza creada
2. Actualizar `CLAUDE.md`:
   - Marcar §47-§53 D-Mx1..D-Mx7 como ✅ implementados
   - Mover Sprint Mx-1 de "⏳" a "✅" en tabla de v1.0.0 DoD
   - Actualizar bitácora MT-01..MT-12 a estado ✅
3. Actualizar `docs/zenix-sales-master.md` con el módulo de mantenimiento como diferenciador comercial #1
4. Actualizar `MEMORY.md` y `project_maintenance_module.md` con el cierre del sprint
5. PR #9 → review → merge a `main`

---

## 7. API surface (11 endpoints)

Todos bajo `/v1/maintenance/*`, con guards `JwtAuthGuard` + `RolesGuard`:

| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| `POST` | `/v1/maintenance/tickets` | RECEPTIONIST, SUPERVISOR, HOUSEKEEPER | Crear ticket. Si `priority=CRITICAL` → auto-bloquea atómicamente |
| `GET` | `/v1/maintenance/tickets` | TODOS | Lista con filtros: `?status=`, `?priority=`, `?roomId=`, `?assignedToId=`, `?from=&to=` |
| `GET` | `/v1/maintenance/tickets/:id` | TODOS | Detalle con photos, comments, logs |
| `PATCH` | `/v1/maintenance/tickets/:id/acknowledge` | MAINTENANCE | Marca ACKNOWLEDGED |
| `PATCH` | `/v1/maintenance/tickets/:id/assign` | SUPERVISOR | Asignar/reasignar a `staffId` |
| `PATCH` | `/v1/maintenance/tickets/:id/start` | MAINTENANCE | → IN_PROGRESS |
| `PATCH` | `/v1/maintenance/tickets/:id/wait-parts` | MAINTENANCE | → WAITING_PARTS con razón |
| `PATCH` | `/v1/maintenance/tickets/:id/resolve` | MAINTENANCE | → RESOLVED. Foto requerida si CRITICAL/HIGH (R1) |
| `PATCH` | `/v1/maintenance/tickets/:id/verify` | SUPERVISOR | → VERIFIED + libera bloqueo + crea tarea HK |
| `POST` | `/v1/maintenance/tickets/:id/comments` | TODOS | Agregar comentario |
| `POST` | `/v1/maintenance/tickets/:id/photos` | TODOS | Agregar foto (link a `/v1/uploads`) |

Endpoints de soporte:
- `POST /v1/uploads` — multipart, retorna `{ url }`. Storage local `/var/zenix/uploads/{org}/{property}/{yyyy-mm}/{uuid}.{ext}`. Servido estático por NestJS bajo `/uploads/*`.

---

## 8. Métricas de aceptación (Definition of Done — Mx-1)

Cada métrica se verifica en staging antes de merge a `main`:

| Métrica | Objetivo | Cómo se mide |
|---------|----------|--------------|
| Auto-bloqueo CRITICAL | 100% de tickets `priority=CRITICAL` resultan en `room.status=BLOCKED` en <2 segundos | Test E2E + métrica de latencia interna |
| Cero overbooking en mantenimiento | 0 reservas confirmadas en habitaciones con ticket OPEN/IN_PROGRESS critical | Inspección manual sobre 10 intentos en staging |
| Audit trail completo | 100% transiciones de estado generan `MaintenanceTicketLog` con actor + timestamp | Inspección de BD post-flujo |
| Push técnico | <10s desde ticket creado hasta push en device | Cronómetro manual |
| Foto requerida en CRITICAL/HIGH | 100% rechazo si VERIFIED sin `isAfterPhoto` | Test backend |
| Mobile parity | Featureset mobile = featureset web técnico | Checklist manual cara a cara |
| Tests unitarios | ≥25 nuevos en `maintenance.service.spec.ts` | `cd apps/api && npx jest --testPathPattern=maintenance` |
| TypeScript strict | 0 errors en api/web/mobile | `tsc --noEmit` |
| Time-to-value | Manager nuevo crea su primer ticket en <5 minutos sin entrenamiento | UAT con stakeholder Hotel Monica Tulum |
| SSE end-to-end | Evento creado en backend visible en web Kanban en <5 segundos | Inspección con DevTools |

---

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|:-----------:|:-------:|------------|
| Transacción atómica D-Mx2 falla por timeout en SmartBlock | Media | Alto | Test específico de transacción anidada; timeout configurable; rollback explícito |
| Foto upload sin S3 limita escalabilidad | Alta | Medio | Local disk v1.0; documentar swap a S3/Cloudinary post-release sin breaking changes |
| Auto-asignación rota si propiedad no configuró `StaffCoverage` para mantenimiento | Alta | Medio | Fallback a `ROUND_ROBIN` filtrado por `department=MAINTENANCE`; alerta al admin |
| Legacy `MaintenanceIssue` causa confusión | Media | Bajo | Renombrar legacy + redirect ruta + deprecation notice en UI |
| Mobile parity es trabajo extra (3 días) | Alta | Medio | Ya está en plan (Fase 4 = 3 días) |
| Refuerzo R1 (foto obligatoria) genera fricción al técnico | Baja | Bajo | Solo aplica a CRITICAL/HIGH (~30% de casos); UX guía claramente |
| Cron de escalación dispara falsos positivos en propiedades 24/7 cerradas | Baja | Medio | Multi-timezone correcto + ventana operativa configurable post-v1.0 |

---

## 10. Diferenciadores comerciales (para `zenix-sales-master.md`)

> Posicionamiento aprobado por la investigación de mercado:

**"Mews, Opera y HotSOS resuelven mantenimiento hotelero — pero a precio enterprise. Cloudbeds y Little Hotelier no lo resuelven en absoluto. Quore y Flexkeeping son excelentes pero requieren una segunda suscripción. Zenix es el único PMS para hostales y boutique LATAM con módulo de mantenimiento que bloquea automáticamente la habitación al detectar trabajo crítico — en la misma transacción, sin checkbox manual, sin posibilidad de venta paralela en Booking.com."**

**3 puntos de venta:**
1. **Auto-bloqueo atómico CRITICAL** — diferenciador único validado en investigación. Resuelve caso Hotel Monica Tulum.
2. **Mismo PMS, sin segunda suscripción** — competidores requieren PMS + CMMS separados (Cloudbeds + Quore = $200+/mes). Zenix unificado.
3. **Audit trail fiscal-grade USALI 12** — `MaintenanceTicketLog` append-only + foto antes/después + actor en cada cambio. Cumple exigencias de cadenas medianas.

---

## 11. Próximos pasos (orden de ejecución)

1. **Confirmar alcance y refuerzos R1-R5 con product owner** (asíncrono, este documento es la propuesta)
2. **Verificar migración Prisma** ya está en `main` (línea 2343-2475 schema confirmado, falta verificar `prisma/migrations/`)
3. **Comenzar Fase 1** — `UploadsModule` + `MaintenanceModule` skeleton
4. Fase 2-5 en orden secuencial
5. Demo interno antes del merge a `main`

---

## Apéndice A — Fuentes consultadas (selección)

**Documentación oficial PMS:**
- [Mews Housekeeping Software](https://www.mews.com/en/products/housekeeping-software)
- [Oracle OPERA — Out of Order rooms](https://docs.oracle.com/en/industries/hospitality/opera-cloud/25.4/ocsuh/t_housekeeping_out_of_order.htm)
- [Cloudbeds — Overbooking types](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/220747288-Overbooking-types-in-Cloudbeds-PMS)

**Sistemas dedicados:**
- [Flexkeeping Maintenance Suite](https://flexkeeping.com/products/hotel-maintenance-software)
- [Breezeway Property Operations](https://www.breezeway.io/)
- [hotelkit Facility Management](https://hotelkit.net/products/facility-management/)
- [Quore Product](https://www.quore.com/product)
- [Amadeus HotSOS](https://www.amadeus-hospitality.com/service-optimization-software/hotsos/)

**Reviews y opiniones:**
- [Capterra Breezeway](https://www.capterra.com/p/186514/Breezeway/reviews/)
- [Capterra Quore](https://www.capterra.com/p/169445/Quore/reviews/)
- [Capterra MaintainX](https://www.capterra.com/p/179296/GetMaintainx/reviews/)
- [Hotel Tech Report — ALICE/Actabl](https://hoteltechreport.com/operations/concierge-software/alice-concierge)

**Análisis de la industria:**
- [Hotel maintenance work order process — Oxmaint](https://oxmaint.com/industries/hospitality/hotel-maintenance-work-order-process)
- [Best hotel maintenance software 2026 — thehotelgm](https://thehotelgm.com/tools/best-hotel-maintenance-software/)
- [Maintainly — what hospitality actually needs](https://maintainly.com/articles/the-best-hotel-maintenance-software-in-2026-what-the-hospitality-industry-actually-needs)

**Estándares:**
- [ISO 41001:2018 Facility Management](https://www.iso.org/standard/68021.html)
- [USALI 12th Edition — HFTP](https://usali.hftp.org/)
- [SetupMyHotel — Maintenance reason codes](https://setupmyhotel.com/formats/house-keeping/108-room-maintenance-code.html)

---

**Fin del plan maestro Sprint Mx-1.**
