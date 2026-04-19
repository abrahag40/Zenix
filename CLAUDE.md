# CLAUDE.md — Housekeeping Management System

> Guía para retomar el proyecto desde cero. Lee esto antes de tocar código.
> Última actualización: 2026-03-22 (Sesión 4 — Etapa 1 consolidada + roadmap Etapa 2).

---

## Project Overview

Sistema de gestión de housekeeping para hostales/hoteles con dormitorios compartidos y habitaciones privadas. Reemplaza el proceso en papel: el recepcionista planifica las salidas del día, confirma cuando el huésped sale físicamente, y housekeeping recibe notificaciones push para limpiar.

**Ventajas competitivas vs PMS del mercado (Mews, Opera Cloud, Cloudbeds, Clock PMS+):**
- **Gestión per-bed** — tarea por cama, no por habitación. Solo Mews lo ofrece parcialmente.
- **Checkout de 2 fases** — planificación AM + confirmación física. Ningún competidor lo tiene.
- **Offline mobile con cola de sync** — ningún PMS soporta operación offline.
- **SSE en tiempo real** — al nivel de los PMS premium (Mews, Opera, Clock PMS+).

---

## Flujo Operativo Central (Etapa 1 — COMPLETO)

### Diagrama de secuencia completo

```
07:00  FASE 1 — Planificación matutina
       ┌──────────────────────────────────────────────────────────────────────┐
       │ Recepcionista abre DailyPlanningPage (tab "Planificación del Día")  │
       │ → GET /planning/daily?date=2026-03-22                               │
       │ → Servidor: room.findMany() con cleaningTasks filtradas por         │
       │   checkout.actualCheckoutAt (NO createdAt — inmune a timezone)      │
       │ → Respuesta: DailyPlanningGrid { sharedRooms[], privateRooms[] }    │
       │                                                                      │
       │ Click en celda → cycleState(): EMPTY → CHECKOUT → EMPTY             │
       │   Guard: cell.taskId && !cell.cancelled → bloquea si tarea activa   │
       │   Guard: planningIsDone → bloquea post-confirmación                 │
       │   Override se guarda en useState<Map<CellKey, Override>>            │
       │                                                                      │
       │ Botón "Confirmar Planificación"                                      │
       │ → POST /checkouts/batch { items: [{ bedId, hasSameDayCheckIn }] }   │
       │ → Servidor (por cada room agrupado):                                │
       │     1. tx.checkout.create({ roomId, actualCheckoutAt })             │
       │     2. tx.cleaningTask.create({ bedId, status: PENDING,             │
       │        hasSameDayCheckIn: per-bed (NO room-level) })                │
       │     3. tx.taskLog.create({ event: CREATED })                        │
       │     4. bed.status NO cambia (huésped aún está)                      │
       │ → SSE: task:planned { checkoutId, roomId }                          │
       │ → Frontend: await refetchQueries() → setActiveTab('realtime')       │
       └──────────────────────────────────────────────────────────────────────┘

11:00  FASE 2 — Confirmación de salida física
       ┌──────────────────────────────────────────────────────────────────────┐
       │ Recepcionista en tab "Estado en Tiempo Real"                        │
       │ → Cama muestra chip "Pendiente de salida" con acción               │
       │   "Toca cuando salga →"                                             │
       │ → Click abre DepartureModal → confirma                             │
       │                                                                      │
       │ → POST /checkouts/:id/depart { bedId }                              │
       │ → Servidor:                                                          │
       │     1. Filtra tarea PENDING para ese bedId específico                │
       │     2. tx.cleaningTask.update({ status: READY/UNASSIGNED })         │
       │     3. tx.bed.update({ status: DIRTY })                             │
       │     4. tx.taskLog.create({ event: READY })                          │
       │     5. pushService.send() → Expo Push a camarera asignada           │
       │ → SSE: task:ready { taskId, bedId }                                 │
       │ → Frontend: chip cambia a "Lista para limpiar"                      │
       └──────────────────────────────────────────────────────────────────────┘

11:30  FASE 2.5 — Reversión de salida (error recovery)
       ┌──────────────────────────────────────────────────────────────────────┐
       │ Si el recepcionista confirmó por error (huésped aún no salió):      │
       │ → Chip "Lista para limpiar" muestra "↩ Revertir salida"            │
       │ → Click abre UndoModal (amber) → confirma                          │
       │                                                                      │
       │ → POST /checkouts/:id/undo-depart { bedId }                         │
       │ → Servidor:                                                          │
       │     1. Busca tareas READY/UNASSIGNED del checkout (filtro bedId)     │
       │     2. Solo reversible si NO hay tareas IN_PROGRESS                  │
       │     3. tx.cleaningTask.update({ status: PENDING })                  │
       │     4. tx.bed.update({ status: OCCUPIED })                          │
       │     5. tx.taskLog.create({ event: REOPENED })                       │
       │     6. Push: "↩️ Salida revertida" al housekeeper asignado          │
       │ → SSE: task:planned { checkoutId }                                  │
       │ → Frontend: chip vuelve a "Pendiente de salida"                     │
       └──────────────────────────────────────────────────────────────────────┘

       CANCELACIÓN — Per-bed desde Tiempo Real
       ┌──────────────────────────────────────────────────────────────────────┐
       │ Chip "Pendiente de salida" muestra "Cancelar checkout"              │
       │ → Click abre CancelModal (gris/rojo) → confirma                    │
       │                                                                      │
       │ → PATCH /checkouts/:id/cancel { bedId }                              │
       │ → Servidor:                                                          │
       │     Con bedId: cancela SOLO la tarea de esa cama                     │
       │       → task.status = CANCELLED, bed.status = OCCUPIED              │
       │       → checkout.cancelled NO se marca (otras camas siguen)          │
       │     Sin bedId: cancela TODAS las tareas del checkout                 │
       │       → checkout.cancelled = true                                   │
       │     Tareas IN_PROGRESS: NO cancela, alerta al supervisor            │
       │ → SSE: task:cancelled { checkoutId }                                │
       └──────────────────────────────────────────────────────────────────────┘

12:00  FASE 3 — Ciclo de limpieza (mobile)
       ┌──────────────────────────────────────────────────────────────────────┐
       │ Camarera recibe push → abre app mobile                              │
       │ → GET /tasks?assignedToId=me → lista de tareas READY               │
       │                                                                      │
       │ → POST /tasks/:id/start → IN_PROGRESS, SSE: task:started           │
       │ → POST /tasks/:id/pause → PAUSED (puede pausar para otra tarea)    │
       │ → POST /tasks/:id/resume → IN_PROGRESS                             │
       │ → POST /tasks/:id/end → DONE, SSE: task:done                       │
       │                                                                      │
       │ Supervisor en KanbanPage (web):                                      │
       │ → POST /tasks/:id/verify → VERIFIED, SSE: task:verified            │
       └──────────────────────────────────────────────────────────────────────┘
```

### Máquina de estados de CleaningTask

```
                           ┌─────────────────────────────────────────┐
                           │           CANCELLED                      │
                           │  (cancelCheckout / undoDeparture fail)   │
                           └─────────────────────────────────────────┘
                                    ▲           ▲
                                    │           │
PENDING ──(confirmDeparture)──→ UNASSIGNED ──(assign)──→ READY
   │                               │                       │
   │ (undoDeparture) ◄─────────────┘                       │
   │ (undoDeparture) ◄─────────────────────────────────────┘
   │
   └──(cancelCheckout)──→ CANCELLED

READY ──(start)──→ IN_PROGRESS ──(end)──→ DONE ──(verify)──→ VERIFIED
                        │      ▲
                        └──────┘
                     (pause)  (resume)
                      PAUSED
```

---

## Tech Stack

### Monorepo (Turborepo)
| App | Framework | Puerto |
|-----|-----------|--------|
| `apps/api` | NestJS 10 + Prisma + PostgreSQL | 3000 |
| `apps/web` | React 18 + Vite + Tailwind CSS | 5173 |
| `apps/mobile` | Expo (React Native) + Expo Router | — |
| `packages/shared` | TypeScript types + enums compartidos | — |

### API
- **NestJS** con `@nestjs/jwt`, `@nestjs/event-emitter`, `class-validator`
- **Prisma ORM** con PostgreSQL (migraciones explícitas en `prisma/migrations/`)
- **SSE** (Server-Sent Events) para actualizaciones en tiempo real al dashboard
- **Push notifications** via Expo Push API (`PushService`)
- **Jest** + `ts-jest` para unit tests

### Web
- **React Query** (`@tanstack/react-query`) — toda la sincronización de estado de servidor
- **React Router v6** con `useSearchParams` para estado de navegación
- **Zustand** para auth store (`src/store/auth.ts`)
- **Tailwind CSS** — diseño, sin librería de componentes
- **react-hot-toast** para feedback de acciones

### Mobile
- **Expo Router** para navegación (file-based, similar a Next.js)
- **Zustand** para `useTaskStore` y `useAuthStore`
- **Expo Notifications** para recibir push tokens y mostrar alertas
- **SyncManager** (`src/syncManager.ts`) — cola offline para operaciones fallidas

### Shared (`packages/shared`)
- `src/enums.ts` — todos los enums (`CleaningStatus`, `HousekeepingRole`, etc.)
- `src/types.ts` — todas las interfaces DTO y tipos de SSE

---

## Architecture Decisions

### 1. Ciclo de dos fases (NO activar limpieza antes del checkout físico)
**Problema:** Si se crean tareas READY al planificar a las 7 am, housekeeping llega a limpiar camas OCUPADAS.
**Decisión:** Separación explícita:
- **Fase 1** (`batchCheckout`): Crea `CleaningTask(PENDING)`. El huésped AÚN está en la cama. Sin push. Sin `bed.status → DIRTY`.
- **Fase 2** (`confirmDeparture`): El huésped entrega la llave físicamente. ENTONCES: `PENDING → READY/UNASSIGNED`, `bed → DIRTY`, push a camarera.
- **Fase 2.5** (`undoDeparture`): Error recovery. Revierte `READY/UNASSIGNED → PENDING`, `bed → OCCUPIED`. Solo si no hay tareas IN_PROGRESS.

### 2. Un checkout por habitación, tareas por cama
**Decisión:** Un `Checkout` corresponde a UNA habitación pero genera N `CleaningTask` (una por cama). En dormitorios compartidos, Cama 1 y Cama 2 comparten el mismo `checkoutId` pero tienen tareas independientes.
**Consecuencia crítica:** `confirmDeparture` debe recibir `bedId` para activar SOLO la cama específica. Sin `bedId`, activa todas las camas del checkout (útil para habitaciones privadas con 1 sola cama).

### 3. `hasSameDayCheckIn` per-task (NO per-checkout)
**Problema:** `hasSameDayCheckIn` almacenado a nivel `Checkout` (room-level OR) causaba que TODAS las camas del dorm mostraran badge "🔴 Hoy entra" cuando solo una fue marcada.
**Decisión:** Campo `hasSameDayCheckIn Boolean @default(false)` en `CleaningTask`. `batchCheckout` lo guarda por cama individual: `hasSameDayCheckIn: itemMap.get(bed.id)?.hasSameDayCheckIn ?? false`. `getDailyGrid` lee `task?.hasSameDayCheckIn` (no `task?.checkout?.hasSameDayCheckIn`).
**Migración:** `20260322202309_add_has_same_day_check_in_to_task`.

### 4. Servidor como fuente de verdad — no `useState` para estado confirmado
**Problema:** `useState(confirmed)` muere cuando el componente se desmonta (navegar a otra página y volver resetea el estado).
**Decisión:** `planningIsDone` se DERIVA del servidor:
```typescript
const planningIsDone =
  allBeds.some((b) => !!b.taskId && !b.cancelled) ||  // tareas en BD
  localStorage.getItem('planning-no-checkout-confirmed') === TODAY  // edge case: 0 salidas
```

### 5. `getState()` — precedencia override vs servidor
**Problema:** Después de cancelar todas las tareas desde Realtime, el `overrides` Map mantenía estados `CHECKOUT` de la sesión anterior → las celdas aparecían como "Checkout hoy" en vez de "Disponible" al volver a la pestaña de planificación.
**Decisión:** Regla de precedencia en `getState()`:
```typescript
function getState(roomId, bedId, cell): PlanningCellState {
  // Tarea activa en servidor → servidor manda (ignorar overrides stale)
  if (cell.taskId && !cell.cancelled) return inferState(cell)
  // Sin tarea activa → override local (planificación en curso) o inferir de server
  return overrides.get(cellKey(roomId, bedId))?.state ?? inferState(cell)
}
```
**Guards de edición:** `cycleState()` y `toggleUrgente()` usan `cell.taskId && !cell.cancelled` (no solo `cell.taskId`), permitiendo re-planificar camas con tareas canceladas.

### 6. URL search params para estado de tab (no useState)
**Decisión:**
```typescript
const activeTab = (searchParams.get('tab') as 'planning' | 'realtime') ?? 'planning'
```
URL: `/planning?tab=realtime` — persiste entre navegaciones y recargas.

### 7. `await qc.refetchQueries()` vs `invalidateQueries()` — race condition crítica
**Problema:** `invalidateQueries()` retorna `void` inmediatamente (fire-and-forget). Si se hace `setActiveTab('realtime')` justo después, la pestaña abre con datos VIEJOS.
**Decisión:** Usar `await qc.refetchQueries(...)` que retorna una Promise que solo resuelve cuando los datos frescos llegan. ENTONCES cambiar de tab.

### 8. `getDailyGrid` — filtro por `checkout.actualCheckoutAt` (NO `createdAt`)
**Problema:** `createdAt` usa `new Date()` del servidor. En timezones negativos (UTC-5), después de las 7pm local, `createdAt` ya cae en el día siguiente UTC → las tareas recién creadas no aparecen en el grid.
**Decisión:**
```typescript
// ANTES (roto en UTC-5 después de 7pm):
cleaningTasks: { where: { createdAt: { gte: dayStart, lte: dayEnd } } }

// AHORA (inmune a timezone — usa la fecha lógica del checkout):
cleaningTasks: { where: { checkout: { actualCheckoutAt: { gte: dayStart, lte: dayEnd } } } }
```
Las fechas del rango siguen siendo UTC explícitas:
```typescript
const dayStart = new Date(`${date}T00:00:00.000Z`)
const dayEnd   = new Date(`${date}T23:59:59.999Z`)
```

### 9. No Redux ni Zustand para estado de servidor
**Decisión:** React Query maneja TODO el estado de servidor. Zustand solo para auth (token JWT, user).

### 10. `TaskLog.staffId` nullable
**Problema:** Eventos del sistema (cancelaciones automáticas, REOPENED) no tienen staff asociado.
**Decisión:** `staffId String?` en schema Prisma.

### 11. Prioridad URGENT per-bed, propagada por habitación
**Decisión:** Si CUALQUIER cama en una habitación tiene `hasSameDayCheckIn: true`, TODAS las tareas de esa habitación reciben prioridad `URGENT` (la habitación completa necesita estar lista). Pero el badge visual "🔴 Hoy entra" solo aparece en la cama específica marcada (gracias a `hasSameDayCheckIn` per-task).

### 12. Cancelación per-bed vs per-checkout
**Decisión:** `cancelCheckout(checkoutId, bedId?)`:
- **Con `bedId`**: Cancela solo la tarea de esa cama. `checkout.cancelled` NO se marca (el checkout sigue para las demás camas del dorm).
- **Sin `bedId`**: Cancela todas las tareas. `checkout.cancelled = true`.
- **Tareas IN_PROGRESS**: NO se cancelan automáticamente. Se emite alerta al supervisor.

### 13. UX — texto mínimo, optimizar para uso diario
**Decisión (basada en NNGroup, Tufte, Krug, Apple HIG):** La interfaz se optimiza para la 100ª sesión, no la 1ª. Sin leyendas permanentes, sin hints persistentes, sin banners instructivos. Los chips de cama son auto-explicativos por color y acción inline. El banner post-confirmación es de 1 línea.

---

## Project Structure

```
housekeeping3/
├── apps/
│   ├── api/                          NestJS REST API
│   │   ├── prisma/
│   │   │   ├── schema.prisma         Modelos Prisma (fuente de verdad del DB)
│   │   │   ├── seed.ts               Datos de prueba (1 propiedad, 3 rooms, 4 staff)
│   │   │   └── migrations/           Migraciones históricas (NO modificar manualmente)
│   │   └── src/
│   │       ├── auth/                 JWT auth (login, guard, estrategia)
│   │       ├── checkouts/            ★ Módulo central — ver sección Módulos
│   │       │   ├── checkouts.service.ts      Lógica de negocio (2 fases + undo + cancel per-bed)
│   │       │   ├── checkouts.service.spec.ts 30 unit tests
│   │       │   ├── checkouts.controller.ts   7 endpoints
│   │       │   └── dto/                      BatchCheckoutDto, CreateCheckoutDto, CancelCheckoutDto
│   │       ├── tasks/                Estado de tareas de housekeeping
│   │       │   ├── tasks.service.ts          start/end/pause/verify/assign
│   │       │   └── tasks.service.spec.ts     19 unit tests
│   │       ├── notifications/        SSE + Push
│   │       │   ├── notifications.service.ts  EventEmitter → SSE stream por propertyId
│   │       │   └── push.service.ts           Expo Push API
│   │       ├── discrepancies/        Reportes de discrepancias cama-estado
│   │       ├── staff/                CRUD de housekeepers/supervisores/recepcionistas
│   │       ├── rooms/                CRUD de habitaciones
│   │       ├── beds/                 CRUD de camas
│   │       ├── reports/              Métricas del día
│   │       ├── settings/             PropertySettings (timezone, checkout time)
│   │       ├── integrations/
│   │       │   └── cloudbeds/        Webhook handler (idempotente)
│   │       ├── common/
│   │       │   ├── decorators/       @CurrentUser, @Roles, @Public
│   │       │   ├── guards/           JwtAuthGuard, RolesGuard
│   │       │   └── filters/          HttpExceptionFilter (formato de errores uniforme)
│   │       └── prisma/               PrismaService (singleton global)
│   │
│   ├── web/                          React SPA (dashboard recepción + supervisores)
│   │   └── src/
│   │       ├── pages/
│   │       │   ├── DailyPlanningPage.tsx  ★ Pantalla principal — ver sección Módulos
│   │       │   ├── KanbanPage.tsx         Vista supervisor (esqueleto)
│   │       │   ├── CheckoutsPage.tsx      Historial de checkouts
│   │       │   ├── DiscrepanciesPage.tsx  Lista de discrepancias abiertas
│   │       │   ├── ReportsPage.tsx        Métricas del día
│   │       │   └── LoginPage.tsx
│   │       ├── components/
│   │       │   ├── Sidebar.tsx        Navegación desktop + mobile drawer
│   │       │   └── Navbar.tsx
│   │       ├── hooks/
│   │       │   └── useSSE.ts          EventSource con reconexión y cleanup automático
│   │       ├── api/
│   │       │   └── client.ts          Wrapper fetch con JWT, error handling, TypeScript
│   │       └── store/
│   │           └── auth.ts            Zustand — token JWT + datos del usuario
│   │
│   └── mobile/                       Expo app para housekeepers
│       ├── app/
│       │   ├── (auth)/login.tsx       Login con credenciales
│       │   └── (app)/
│       │       ├── rooms.tsx          Lista de tareas asignadas (pantalla principal)
│       │       └── task/[id].tsx      Detalle de tarea + notas + mantenimiento
│       └── src/
│           ├── store/
│           │   ├── auth.ts            Zustand — sesión persistida
│           │   └── tasks.ts           Zustand — lista de tareas con fetch
│           ├── syncManager.ts         Cola offline para ops fallidas
│           └── notifications.ts      Registro de push token con API
│
└── packages/
    └── shared/
        └── src/
            ├── enums.ts              Todos los enums del dominio
            └── types.ts              DTOs, DailyPlanningGrid, SseEvent, etc.
```

---

## Modules Implemented

### ✅ CheckoutsService — COMPLETO

**Responsabilidad:** Toda la lógica de checkout. Punto de entrada único para flujos manual y automático.

**Métodos:**

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `batchCheckout` | `POST /checkouts/batch` | Fase 1: planificación matutina. Crea tasks PENDING con `hasSameDayCheckIn` per-bed |
| `confirmDeparture` | `POST /checkouts/:id/depart` | Fase 2: checkout físico. bedId-específico. PENDING→READY, push, SSE |
| `undoDeparture` | `POST /checkouts/:id/undo-depart` | Fase 2.5: revierte READY→PENDING. Solo pre-limpieza |
| `cancelCheckout` | `PATCH /checkouts/:id/cancel` | Extensión de estadía. Soporta bedId para cancel per-bed |
| `processCheckout` | `POST /checkouts` | Checkout individual ad-hoc (idempotente por cloudbedsReservationId) |
| `getDailyGrid` | `GET /planning/daily` | Grid del día. Filtra por checkout.actualCheckoutAt (inmune a tz) |
| `findByProperty` | `GET /checkouts` | Historial de checkouts |

**Tests:** 30 unit tests en `checkouts.service.spec.ts` — 30/30 PASS.

**Casos edge cubiertos:**
- Idempotencia por `cloudbedsReservationId` (webhooks duplicados)
- `confirmDeparture` con y sin `bedId` (dorm vs privada)
- Idempotencia de `confirmDeparture` (→ `{ alreadyDeparted: true }`)
- `cancelCheckout` con y sin `bedId` (per-bed vs full checkout)
- `cancelCheckout` con tareas `IN_PROGRESS` → alerta supervisor, NO cancela automáticamente
- `cancelCheckout` también cancela tareas `PENDING` (extensión antes de Fase 2)
- Per-bed cancel: no marca `checkout.cancelled = true` (el resto del checkout sigue)
- `getDailyGrid` filtra por `checkout.actualCheckoutAt` (no `createdAt`) — timezone-safe
- `getDailyGrid` incluye tareas CANCELLED (el frontend las muestra como EMPTY editables)

---

### ✅ DailyPlanningPage.tsx — COMPLETO

**Responsabilidad:** Pantalla de operaciones del recepcionista. Dos pestañas en una URL.

**Tab 1: "Planificación del Día"**
- Grid tipo pizarra. Cada celda = una cama.
- Click cicla: `EMPTY → CHECKOUT → EMPTY` (urgente via botón secundario)
- Botón "Confirmar Planificación" → `POST /checkouts/batch`
- Banner 1-línea `✅ Planificación confirmada — solo lectura` post-confirmación
- Celdas con tareas activas se bloquean. Celdas con tareas CANCELLED son editables.

**Tab 2: "Estado en Tiempo Real"**
- Muestra el progreso de las salidas confirmadas
- Tab deshabilitada hasta que se confirme la planificación
- **Dormitorios:** RoomAccordion expandible con RealtimeBedChip por cama activa
- **Habitaciones Privadas:** Grid responsivo (`grid-cols-2 sm:3 md:4`) sin accordion (1 cama = directo)
- Acciones por estado del chip:
  - `PENDING_DEPARTURE`: "Toca cuando salga →" + "Cancelar checkout"
  - `READY_TO_CLEAN`: "Esperando housekeeper" + "↩ Revertir salida"
  - `CLEANING` / `CLEAN`: Solo lectura

**Componentes internos (todos en el mismo archivo):**
- `PlanningTable` — tabla de rooms/camas con override local
- `PlanningRow` — fila de una habitación (dorm o privada)
- `RealtimeSection` — grid de tiempo real por habitación
- `RealtimeBedChip` — chip de cama con máquina de estados visual y acciones inline
- `DepartureModal` — confirmación de salida física (Fase 2)
- `CancelModal` — confirmación de cancelación per-bed (gris/rojo)
- `UndoModal` — confirmación de reversión de salida (amber)
- `DiscrepancyBanner` — alerta de discrepancias abiertas

**Lógica de estado clave:**
```typescript
// planningIsDone se deriva del servidor — NUNCA de useState
const planningIsDone =
  allBeds.some((b) => !!b.taskId && !b.cancelled) ||
  localStorage.getItem('planning-no-checkout-confirmed') === TODAY

// getState: servidor manda si hay tarea activa; override si no
function getState(roomId, bedId, cell) {
  if (cell.taskId && !cell.cancelled) return inferState(cell)
  return overrides.get(cellKey(roomId, bedId))?.state ?? inferState(cell)
}

// cycleState/toggleUrgente: cell.taskId && !cell.cancelled (no solo cell.taskId)
// Permite re-planificar camas con tareas canceladas

// Tab via URL — persiste entre navegaciones
const activeTab = searchParams.get('tab') ?? 'planning'
```

---

### ✅ TasksService — COMPLETO

**Responsabilidad:** Ciclo de vida de una `CleaningTask` una vez activada.

**Tests:** 19 unit tests en `tasks.service.spec.ts` — 19/19 PASS.

---

### ✅ NotificationsService (SSE) — COMPLETO

**Responsabilidad:** Stream SSE por `propertyId`. El dashboard web se suscribe en `GET /api/events`.

**Eventos SSE implementados:**
| Evento | Cuándo se emite |
|--------|----------------|
| `task:planned` | Después de `batchCheckout` o `undoDeparture` exitoso |
| `task:ready` | Después de `confirmDeparture` exitoso |
| `task:started` | Housekeeper inicia limpieza |
| `task:done` | Housekeeper termina limpieza |
| `task:unassigned` | Tarea queda sin asignar |
| `task:cancelled` | Checkout cancelado (full o per-bed) |
| `maintenance:reported` | Issue de mantenimiento reportado |
| `discrepancy:reported` | Discrepancia de cama reportada |

**Autenticación SSE:** Token JWT via query param (`/api/events?token=...`) porque `EventSource` no soporta headers custom.

---

### ✅ Mobile App — PARCIAL

**Lo que existe:**
- Login screen funcional
- `rooms.tsx` — lista de tareas asignadas al usuario logueado
- `task/[id].tsx` — detalle de tarea con botones start/pause/end
- `syncManager.ts` — cola offline (operaciones se guardan si no hay red)
- Push token registration

**Lo que falta:**
- UI para reportar discrepancias desde mobile
- UI para agregar notas de limpieza
- UI para reportar issues de mantenimiento con foto
- Offline mode completo (sync al reconectar)
- Tests

---

## Module Relationships & Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FLUJO DE DATOS PRINCIPAL                            │
│                                                                             │
│  Web (DailyPlanningPage)                                                    │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │ GET /planning/daily ──────────────────→ CheckoutsService         │        │
│  │   filtro: checkout.actualCheckoutAt     (rooms × beds × tasks)  │        │
│  │                                                                  │        │
│  │ POST /checkouts/batch ────────────────→ CheckoutsService         │        │
│  │   { items[{bedId, hasSameDayCheckIn}] } crea Task(PENDING)/cama │        │
│  │                                         hasSameDayCheckIn per-bed│        │
│  │                                         emite SSE task:planned  │        │
│  │                                                                  │        │
│  │ POST /checkouts/:id/depart ───────────→ CheckoutsService         │        │
│  │   { bedId }           confirmDeparture() activa Task(READY)      │        │
│  │                                         bed → DIRTY, push, SSE  │        │
│  │                                                                  │        │
│  │ POST /checkouts/:id/undo-depart ──────→ CheckoutsService         │        │
│  │   { bedId }           undoDeparture()   READY → PENDING          │        │
│  │                                         bed → OCCUPIED, push    │        │
│  │                                                                  │        │
│  │ PATCH /checkouts/:id/cancel ──────────→ CheckoutsService         │        │
│  │   { bedId? }          cancelCheckout()  per-bed o full cancel    │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                             │
│  SSE stream ──────────────────────────────→ useSSE() → invalidateQueries   │
│  (GET /events?token=...)                     actualiza DailyPlanningGrid    │
│                                                                             │
│  Mobile (RoomsScreen)                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │ GET /tasks ──────────────────────────→ TasksService.findMine()  │        │
│  │ POST /tasks/:id/start ────────────────→ TasksService.startTask()│        │
│  │ POST /tasks/:id/end ──────────────────→ TasksService.endTask()  │        │
│  │                                         emite SSE task:done    │        │
│  └─────────────────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘

Relaciones Prisma clave:
  Property → Room[] → Bed[] → CleaningTask[] → TaskLog[]
  Checkout → CleaningTask[] (un checkout, N tareas)
  CleaningTask.hasSameDayCheckIn (per-bed, no per-checkout)
  HousekeepingStaff → CleaningTask[] (assignedTo) | verifiedTasks | taskLogs
```

---

## Patterns & Conventions

### API (NestJS)
```typescript
// Decoradores siempre en este orden:
@Get(':id')
@Roles(HousekeepingRole.SUPERVISOR)
async findOne(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {}

// Servicios: toda la lógica de negocio aquí, controllers son thin wrappers
// DTOs: validados con class-validator en dto/ subdirectorio
// Errores: throw NotFoundException | ConflictException | ForbiddenException
// Logs: this.logger.debug/log/warn/error (Logger de NestJS, no console.log)
```

### Web (React)
```typescript
// Queries: siempre con queryKey tipado y opciones explícitas
const { data } = useQuery<DailyPlanningGrid>({
  queryKey: ['daily-grid', TODAY],
  queryFn: () => api.get(`/planning/daily?date=${TODAY}`),
  staleTime: 2 * 60 * 1000,
})

// Mutations: onSuccess async cuando hay refetch crítico
const mutation = useMutation({
  mutationFn: (dto) => api.post('/checkouts/batch', dto),
  onSuccess: async () => {
    await qc.refetchQueries({ queryKey: ['daily-grid', TODAY] })  // AWAIT — no invalidate
    setActiveTab('realtime')
  },
})

// Estado de navegación → URL params (no useState)
// Estado local efímero → useState (overrides de celdas antes de confirmar)
// Estado de servidor → React Query (NUNCA duplicar en useState)
// Auth → Zustand (token JWT)
```

### Shared Types
- Todos los enums están en `packages/shared/src/enums.ts`
- Todos los DTOs y tipos de respuesta en `packages/shared/src/types.ts`
- **NUNCA** redefinir un tipo en `apps/web` o `apps/api` si ya existe en shared
- `SseEventType` union — agregar aquí cuando se añade un nuevo evento SSE

### Tests
```typescript
// Patrón AAA con comentarios explícitos
it('descripción en español — qué debe hacer', async () => {
  // Arrange — setup del escenario
  // Act — llamada al método bajo test
  // Assert — verificación
})

// Builders de datos: makeRoom(), makeCheckout(), makeCheckoutInput()
// Mocks: prismaMock con $transaction que ejecuta callback directamente
// Limpiar mocks: jest.clearAllMocks() en beforeEach
```

---

## Pending Tasks (Etapa 1 — operativo actual)

### Alta prioridad (bloquean flujo operativo)

**1. KanbanPage — vista supervisor de tareas**
- Columnas: `UNASSIGNED → READY → IN_PROGRESS → PAUSED → DONE → VERIFIED`
- Cards con: room/bed, housekeeper asignado, tiempo transcurrido, prioridad
- Filtros por piso, housekeeper, estado
- Asignación manual: `<select>` de staff en cards UNASSIGNED
- Sin esto, el supervisor opera ciego

**2. Mobile — screens pendientes**
- `DiscrepancyReportScreen` — formulario tipo/descripción + foto opcional
- `NoteScreen` — agregar nota de limpieza a una tarea
- `MaintenanceIssueScreen` — reportar problema de mantenimiento con foto

### Media prioridad

**3. DiscrepanciesPage web — flujo de resolución**
- `PATCH /discrepancies/:id/resolve` (endpoint existe, UI no)

**4. WebSocket/SSE para mobile**
- La mobile usa polling. Debería usar push para actualizaciones en tiempo real.

### Baja prioridad

**5. Tests E2E con Supertest**

**6. CI/CD pipeline**

**7. CloudBeds webhook handler con verificación HMAC**

---

## Roadmap — Etapa 2 (Propuestas de Estudio de Mercado)

Propuestas priorizadas basadas en análisis competitivo de Mews, Opera Cloud, Cloudbeds, Clock PMS+, Guesty, Flexkeeping y Optii. Cada propuesta incluye el diseño técnico de implementación.

### 🔴 Alta Prioridad — Table-stakes de la industria

---

#### P1. Tareas de limpieza stayover (estadías largas)

**Problema operativo:** El sistema solo genera tareas por checkout. Los housekeepers dedican ~60% del día limpiando habitaciones OCUPADAS (stayovers). Sin esto, el sistema cubre menos de la mitad de la operación real.

**Referencia:** Opera, Cloudbeds (rules), Clock PMS+, Guesty, Hostaway — todos generan tareas stayover automáticamente.

**Diseño técnico:**

1. **Schema Prisma — nueva config y tipo de tarea:**
```prisma
// En PropertySettings (ya existe):
model PropertySettings {
  // ... campos existentes ...
  stayoverFrequency   StayoverFrequency @default(DAILY)
  stayoverStartTime   String            @default("09:00")  // hora local para generar tareas
}

// Nuevo enum:
enum StayoverFrequency {
  DAILY           // limpieza diaria para todas las camas ocupadas
  EVERY_2_DAYS    // día sí, día no (basado en checkInDate)
  ON_REQUEST      // solo si el huésped lo solicita (ver P7)
}

// En CleaningTask — TaskType ya existe:
enum TaskType {
  CLEANING    // checkout cleaning (actual)
  STAYOVER    // mid-stay cleaning (nuevo)
  TURNDOWN    // futuro: servicio de noche
  INSPECTION  // futuro: inspección sin limpieza
}
```

2. **Nuevo servicio `StayoverService`:**
```
apps/api/src/stayover/
├── stayover.service.ts       Lógica de generación de tareas stayover
├── stayover.scheduler.ts     Cron job que ejecuta diariamente
└── stayover.module.ts
```

- **Cron job** (`@Cron('0 9 * * *')` configurable por property): Cada mañana, para cada `Bed` con `status: OCCUPIED` que NO tenga un checkout planificado para hoy:
  - Verificar frecuencia: si `EVERY_2_DAYS`, calcular `(today - checkInDate) % 2 === 0`
  - Si `ON_REQUEST`, saltar (se genera solo manualmente o desde preferencia del huésped)
  - Crear `CleaningTask({ bedId, taskType: STAYOVER, status: UNASSIGNED, priority: LOW })`
  - Stayovers NO pasan por el checkout de 2 fases — se crean directamente como UNASSIGNED
  - Prioridad: `LOW` por defecto (checkouts tienen `MEDIUM`/`URGENT`)

3. **getDailyGrid update:** Incluir tareas `STAYOVER` en la respuesta. El frontend las muestra con un color/badge diferenciado (ej: azul "🔵 Limpieza de estadía") en el tab de Tiempo Real.

4. **KanbanPage:** Las tareas stayover aparecen en la columna UNASSIGNED con badge visual `STAYOVER`. El supervisor las asigna junto con las de checkout.

5. **Mobile:** La lista de tareas del housekeeper muestra stayovers con indicador visual diferente. El flujo start→end es idéntico.

---

#### P2. Checklists de limpieza por tipo de habitación

**Problema operativo:** No hay estandarización de qué debe limpiarse en cada tipo de habitación. Calidad inconsistente. El supervisor no puede verificar qué pasos se completaron.

**Referencia:** Opera (checklists por room type), Clock PMS+ (checklists configurables), Breezeway (checklists con foto por item), Flexkeeping.

**Diseño técnico:**

1. **Schema Prisma:**
```prisma
model CleaningChecklist {
  id          String   @id @default(uuid())
  propertyId  String
  roomType    RoomType                    // SHARED, PRIVATE, SUITE, etc.
  taskType    TaskType @default(CLEANING) // checklist distinto para STAYOVER vs CHECKOUT
  name        String                      // "Checkout — Dormitorio", "Stayover — Suite"
  items       CleaningChecklistItem[]
  property    Property @relation(fields: [propertyId], references: [id])
  createdAt   DateTime @default(now())

  @@unique([propertyId, roomType, taskType])
}

model CleaningChecklistItem {
  id            String   @id @default(uuid())
  checklistId   String
  label         String                    // "Cambiar sábanas", "Limpiar baño", "Reponer amenities"
  sortOrder     Int
  requiresPhoto Boolean  @default(false)  // para items críticos: "foto del baño terminado"
  checklist     CleaningChecklist @relation(fields: [checklistId], references: [id])
}

model ChecklistResponse {
  id        String   @id @default(uuid())
  taskId    String
  itemId    String
  completed Boolean  @default(false)
  photoUrl  String?                       // si requiresPhoto: URL de la foto subida
  completedAt DateTime?
  task      CleaningTask @relation(fields: [taskId], references: [id])
  item      CleaningChecklistItem @relation(fields: [itemId], references: [id])

  @@unique([taskId, itemId])
}
```

2. **API — nuevo módulo `checklists/`:**
```
apps/api/src/checklists/
├── checklists.service.ts       CRUD de templates + respuestas
├── checklists.controller.ts    GET /checklists/:roomType, POST /tasks/:id/checklist
└── dto/
```

- `GET /checklists?roomType=SHARED&taskType=CLEANING` → devuelve el template aplicable
- `POST /tasks/:id/checklist` → `{ items: [{ itemId, completed, photoUrl? }] }` — guarda respuestas
- `endTask()` en TasksService: **validar** que todos los items `required` estén completados antes de permitir `DONE`

3. **Mobile UI:**
- Pantalla de tarea `task/[id].tsx`: entre los botones "Iniciar" y "Finalizar", mostrar la lista de checklist items como checkboxes
- Items con `requiresPhoto: true` muestran un botón de cámara (Expo ImagePicker)
- El botón "Finalizar" se habilita solo cuando todos los items obligatorios están marcados
- Diseño: lista vertical con checkmarks, agrupada por categoría si hay muchos items

4. **Web — Supervisor:**
- KanbanPage: card de tarea muestra progreso del checklist: "4/7 items ✓"
- Al verificar (DONE→VERIFIED), el supervisor puede ver las fotos adjuntas

5. **Web — Settings:**
- Página de configuración para crear/editar checklists por room type
- Drag-and-drop para reordenar items (sortOrder)

---

#### P3. Auto-asignación de tareas

**Problema operativo:** Todas las tareas quedan `UNASSIGNED` y alguien debe asignar manualmente cada una. Con 20+ camas/día, esto es un bottleneck. `assignTask` existe en `TasksService` pero no hay lógica de distribución.

**Referencia:** Opera (sección-based con créditos), Guesty (round-robin), Clock PMS+ (secciones por piso).

**Diseño técnico — 3 estrategias progresivas:**

1. **Estrategia 1: Por sección (MVP recomendado)**

```prisma
model StaffSection {
  id        String   @id @default(uuid())
  staffId   String
  roomId    String                        // habitación asignada a este housekeeper
  staff     HousekeepingStaff @relation(fields: [staffId], references: [id])
  room      Room @relation(fields: [roomId], references: [id])

  @@unique([staffId, roomId])
}
```

- Configuración en web: drag-and-drop de habitaciones a housekeepers (o multi-select)
- `batchCheckout` auto-asigna: al crear cada tarea, buscar `StaffSection` donde `roomId = task.bed.roomId` → `assignedToId = section.staffId`
- Si no hay sección configurada → queda UNASSIGNED (fallback manual)
- UI: página "Personal → Secciones" para configurar asignaciones fijas

2. **Estrategia 2: Round-robin**

- Sin configuración. Al crear tareas, distribuir equitativamente entre housekeepers con `role: HOUSEKEEPER` y `isActive: true`
- Algoritmo: `SELECT staffId, COUNT(tasks today) FROM ... GROUP BY staffId ORDER BY count ASC LIMIT 1`
- Menos control pero zero-config

3. **Estrategia 3: Por créditos (avanzado, inspirado en Opera)**

```prisma
model RoomType {
  // añadir:
  cleaningCredits  Float @default(1.0)    // Dorm cama = 0.5, Suite = 2.0, Estándar = 1.0
}
```

- Cada housekeeper tiene un target de créditos por turno (ej: 12 créditos)
- El algoritmo balancea la carga total por créditos, no por cantidad de tareas
- Requiere UI de configuración de créditos por room type + target por staff

**Recomendación:** Implementar Estrategia 1 (secciones) primero. Es la más intuitiva para propiedades pequeñas-medianas y cubre el 80% de los casos. Round-robin como fallback si no hay secciones configuradas.

---

#### P4. KanbanPage — vista supervisor de tareas

**Problema operativo:** Sin esta pantalla, el supervisor no puede ver qué camareras están haciendo qué. Actualmente existe como esqueleto placeholder.

**Referencia:** Mews (grid por piso), Opera Cloud (housekeeping board), Clock PMS+ (grid + floor plan).

**Diseño técnico:**

1. **API:**
- `GET /tasks?date=YYYY-MM-DD&propertyId=X` → todas las tareas del día con bed, room, assignedTo, logs
- `PUT /tasks/:id/assign` → ya existe
- `POST /tasks/:id/verify` → ya existe

2. **Web — KanbanPage.tsx:**

```
┌─ UNASSIGNED ─┐ ┌── READY ────┐ ┌─ IN_PROGRESS ┐ ┌── DONE ─────┐ ┌─ VERIFIED ──┐
│              │ │             │ │              │ │             │ │             │
│ ┌──────────┐ │ │ ┌─────────┐│ │ ┌──────────┐ │ │ ┌─────────┐│ │ ┌─────────┐│
│ │ Dorm1    │ │ │ │ 101     ││ │ │ Dorm1    │ │ │ │ 102     ││ │ │ Dorm2   ││
│ │ Cama 2   │ │ │ │ Cama 1  ││ │ │ Cama 3   │ │ │ │ Cama 1  ││ │ │ Cama 1  ││
│ │ CHECKOUT │ │ │ │ María G ││ │ │ Ana P    │ │ │ │ María G ││ │ │ Ana P   ││
│ │ ───────  │ │ │ │ 🔴 URG  ││ │ │ 12min ⏱  │ │ │ │ 22min   ││ │ │ ✓ Sup.  ││
│ │ [Asignar]│ │ │ └─────────┘│ │ └──────────┘ │ │ └─────────┘│ │ └─────────┘│
│ └──────────┘ │ │             │ │              │ │             │ │             │
└──────────────┘ └─────────────┘ └──────────────┘ └─────────────┘ └─────────────┘

Filtros: [Piso ▾] [Housekeeper ▾] [Tipo ▾]     Resumen: 2 pendientes · 1 limpiando · 1 lista
```

- **Card data:** room number, bed label, task type badge (CHECKOUT/STAYOVER), housekeeper name, priority indicator, elapsed time (derivado de TaskLog timestamps)
- **Acciones:** Cards UNASSIGNED tienen `<select>` de staff. Cards DONE tienen botón "Verificar".
- **Actualización:** SSE events invalidan el query → React Query refresca automáticamente
- **Responsive:** En mobile, las columnas se convierten en tabs o acordeones

---

### 🟡 Media Prioridad — Diferenciadores premium

---

#### P5. Métricas de rendimiento

**Problema operativo:** No hay datos para evaluar eficiencia del equipo ni para planificar turnos. El supervisor no sabe qué housekeeper es más rápido, ni cuánto tarda en promedio cada tipo de habitación.

**Referencia:** Opera (performance analytics nativo), Optii (AI-driven insights adquirido por Amadeus), Flexkeeping (dashboards de productividad).

**Diseño técnico:**

1. **Fuente de datos:** `TaskLog` ya almacena timestamps por evento (CREATED, READY, STARTED, DONE, VERIFIED). El tiempo de limpieza se calcula: `TaskLog(DONE).createdAt - TaskLog(STARTED).createdAt`.

2. **API — endpoint `GET /reports/performance`:**
```typescript
// Parámetros: ?from=2026-03-01&to=2026-03-22&propertyId=X
// Respuesta:
{
  summary: {
    totalTasks: 142,
    avgCleaningMinutes: 18.3,
    avgByRoomType: { SHARED: 12.1, PRIVATE: 24.7 },
    avgByTaskType: { CLEANING: 22.4, STAYOVER: 14.1 },
  },
  byStaff: [
    { staffId, name, tasksCompleted: 47, avgMinutes: 16.8, fastest: 8, slowest: 34 },
    ...
  ],
  byDay: [
    { date: '2026-03-22', tasks: 12, avgMinutes: 17.2 },
    ...
  ]
}
```

3. **Web — ReportsPage.tsx:**
- Gráfica de barras: tareas completadas por día (últimos 7/30 días)
- Tabla comparativa de staff: avg time, total tasks, fastest/slowest
- Gráfica de tendencia: avg cleaning time por semana (para detectar mejoras o degradación)
- Filtros: rango de fechas, room type, task type

4. **Dependencia:** Requiere que `TaskLog` tenga datos reales de producción. Los datos de seed son insuficientes para métricas significativas.

---

#### P6. Preferencias de limpieza del huésped

**Problema operativo:** Post-COVID, las cadenas hoteleras (Marriott, Hilton, IHG) migraron a limpieza opt-in. Las propiedades necesitan respetar la preferencia del huésped para reducir costos laborales y comunicar sostenibilidad.

**Referencia:** Actabl/Alice (guest preferences), Intelity (QR-based preferences), estándar en cadenas hoteleras desde 2022.

**Diseño técnico:**

1. **Schema Prisma:**
```prisma
enum CleaningPreference {
  DAILY           // limpieza cada día (default actual)
  EVERY_2_DAYS    // cada 2 días
  CHECKOUT_ONLY   // solo al checkout (opt-out de stayover)
  ON_REQUEST      // solo cuando lo pida
}

// Opción A — en la reserva (si hay integración PMS):
model Reservation {
  bedId               String
  guestName           String
  checkInDate         DateTime
  expectedCheckout    DateTime
  cleaningPreference  CleaningPreference @default(DAILY)
  // ...
}

// Opción B — standalone (sin integración PMS):
model GuestPreference {
  id        String   @id @default(uuid())
  bedId     String
  date      DateTime
  preference CleaningPreference
  source    String   // 'QR', 'RECEPTION', 'APP'
  bed       Bed @relation(fields: [bedId], references: [id])
}
```

2. **Flujo de captura:**
- **QR en habitación:** El huésped escanea un QR que abre una página web simple (no requiere app). Selecciona su preferencia. Se guarda en `GuestPreference`.
- **Recepción al check-in:** El recepcionista pregunta y registra.
- **API:** `POST /preferences { bedId, preference, source }`

3. **Integración con StayoverService (P1):**
- El cron job de stayover consulta `GuestPreference` antes de generar la tarea:
  - `CHECKOUT_ONLY` → no genera stayover
  - `EVERY_2_DAYS` → genera solo en días pares desde check-in
  - `ON_REQUEST` → no genera automáticamente (solo manual)
  - `DAILY` → genera normalmente

4. **Visualización:**
- DailyPlanningGrid: badge "🌿 Opt-out" en camas con preferencia != DAILY
- KanbanPage: la tarea no aparece si el huésped optó out

---

#### P7. Reportes de mantenimiento desde el móvil — Integración con módulo de Mantenimiento

**Contexto arquitectónico:** El módulo de Housekeeping es un engrane dentro del PMS completo. Se comunica **monolíticamente** con el módulo de Mantenimiento. El módulo de Mantenimiento es un sistema de tickets completo para levantar, gestionar y dar seguimiento a tareas de mantenimiento.

**Problema operativo:** Los housekeepers son los "ojos" del hotel — entran a cada habitación diariamente. Detectan problemas (grifos rotos, manchas, focos fundidos) pero no tienen un canal estructurado para reportarlos. Los reportes se pierden en notas de papel o mensajes de WhatsApp.

**Referencia:** Flexkeeping (operaciones unificadas cross-departamento), hotelkit (red social interna + tareas), Opera (work orders integrados), Actabl (maintenance routing).

**Diseño técnico:**

1. **Schema Prisma — Sistema de tickets de mantenimiento:**

```prisma
// ── Módulo de Mantenimiento (tickets) ──────────────────────────

enum TicketStatus {
  OPEN              // recién creado
  ACKNOWLEDGED      // mantenimiento lo vio
  IN_PROGRESS       // trabajando en ello
  WAITING_PARTS     // esperando material/proveedor
  RESOLVED          // trabajo completado
  VERIFIED          // supervisor confirmó la resolución
  CLOSED            // archivado
}

enum TicketPriority {
  LOW               // cosmético, no urgente
  MEDIUM            // funcional pero no bloquea la habitación
  HIGH              // afecta la experiencia del huésped
  CRITICAL          // habitación inhabitable (sin agua, sin luz, etc.)
}

enum TicketCategory {
  PLUMBING          // fontanería
  ELECTRICAL        // eléctrico
  FURNITURE         // mobiliario roto/dañado
  APPLIANCE         // electrodomésticos
  HVAC              // climatización
  STRUCTURAL        // paredes, techo, piso
  COSMETIC          // pintura, manchas, estética
  SAFETY            // seguridad (cerraduras, detectores)
  OTHER
}

model MaintenanceTicket {
  id              String          @id @default(uuid())
  propertyId      String
  roomId          String
  bedId           String?                        // null si aplica a toda la habitación
  category        TicketCategory
  priority        TicketPriority  @default(MEDIUM)
  status          TicketStatus    @default(OPEN)
  title           String                          // "Grifo gotea en baño"
  description     String?                         // detalle libre
  reportedById    String                          // housekeeper que lo detectó
  assignedToId    String?                         // técnico de mantenimiento asignado
  resolvedById    String?                         // quien lo resolvió
  verifiedById    String?                         // supervisor que verificó

  estimatedMinutes Int?                           // estimación del trabajo
  actualMinutes    Int?                           // tiempo real registrado

  // Timestamps del ciclo de vida
  acknowledgedAt   DateTime?
  startedAt        DateTime?
  resolvedAt       DateTime?
  verifiedAt       DateTime?
  closedAt         DateTime?
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt

  // Relaciones
  property     Property          @relation(fields: [propertyId], references: [id])
  room         Room              @relation(fields: [roomId], references: [id])
  bed          Bed?              @relation(fields: [bedId], references: [id])
  reportedBy   HousekeepingStaff @relation("TicketsReported", fields: [reportedById], references: [id])
  assignedTo   HousekeepingStaff? @relation("TicketsAssigned", fields: [assignedToId], references: [id])
  resolvedBy   HousekeepingStaff? @relation("TicketsResolved", fields: [resolvedById], references: [id])
  verifiedBy   HousekeepingStaff? @relation("TicketsVerified", fields: [verifiedById], references: [id])
  photos       TicketPhoto[]
  comments     TicketComment[]
  logs         TicketLog[]

  // Vínculo con housekeeping (el ticket fue reportado durante esta tarea)
  sourceTaskId String?
  sourceTask   CleaningTask? @relation(fields: [sourceTaskId], references: [id])

  @@index([propertyId, status])
  @@index([assignedToId, status])
}

model TicketPhoto {
  id        String   @id @default(uuid())
  ticketId  String
  url       String                              // S3/Cloudinary URL
  caption   String?
  uploadedById String
  createdAt DateTime @default(now())
  ticket    MaintenanceTicket @relation(fields: [ticketId], references: [id])
}

model TicketComment {
  id        String   @id @default(uuid())
  ticketId  String
  authorId  String
  content   String
  createdAt DateTime @default(now())
  ticket    MaintenanceTicket @relation(fields: [ticketId], references: [id])
  author    HousekeepingStaff @relation(fields: [authorId], references: [id])
}

model TicketLog {
  id        String   @id @default(uuid())
  ticketId  String
  event     String                              // 'CREATED', 'ACKNOWLEDGED', 'ASSIGNED', 'STARTED', 'RESOLVED', etc.
  staffId   String?
  metadata  Json?                               // datos extra del evento
  createdAt DateTime @default(now())
  ticket    MaintenanceTicket @relation(fields: [ticketId], references: [id])
}
```

2. **API — módulo `maintenance/`:**
```
apps/api/src/maintenance/
├── maintenance.service.ts       Lógica CRUD + máquina de estados del ticket
├── maintenance.controller.ts    Endpoints REST
├── dto/
│   ├── create-ticket.dto.ts     { roomId, bedId?, category, priority, title, description }
│   └── update-ticket.dto.ts     { status, assignedToId?, comment? }
└── maintenance.module.ts
```

**Endpoints:**

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST /maintenance/tickets` | Crear ticket (desde mobile durante limpieza) |
| `GET /maintenance/tickets` | Lista con filtros (status, priority, room, assigned) |
| `GET /maintenance/tickets/:id` | Detalle con fotos, comments, logs |
| `PATCH /maintenance/tickets/:id` | Cambiar status, asignar técnico |
| `POST /maintenance/tickets/:id/comments` | Agregar comentario |
| `POST /maintenance/tickets/:id/photos` | Subir foto (antes/después de reparación) |

**Máquina de estados del ticket:**
```
OPEN → ACKNOWLEDGED → IN_PROGRESS → RESOLVED → VERIFIED → CLOSED
                    ↘ WAITING_PARTS → IN_PROGRESS
```

3. **Mobile — flujo de reporte rápido desde tarea de limpieza:**
- En `task/[id].tsx`, botón "⚠️ Reportar problema"
- Abre pantalla rápida: categoría (select), foto (cámara), nota breve
- `POST /maintenance/tickets` con `sourceTaskId` para vincular con la tarea de limpieza
- La foto se sube a S3/Cloudinary vía `POST /uploads` (nuevo endpoint para archivos)
- Notificación push al supervisor de mantenimiento
- SSE: `maintenance:ticket:created`

4. **Web — página de Mantenimiento (nuevo):**
- **Vista lista/tabla:** Todos los tickets filtrados por status, prioridad, habitación
- **Vista Kanban:** Columnas por TicketStatus (similar a KanbanPage de housekeeping)
- **Detalle de ticket:** Timeline de eventos (logs), fotos antes/después, comments, asignación
- **Dashboard de métricas:** Tickets abiertos, tiempo promedio de resolución, backlog por categoría

5. **Comunicación monolítica Housekeeping ↔ Mantenimiento:**
- `MaintenanceTicket.sourceTaskId` vincula el ticket con la tarea de limpieza que lo originó
- Si un ticket `CRITICAL` está abierto para una habitación, `getDailyGrid` lo muestra como badge "🔧 Mtto pendiente" en la celda — el recepcionista sabe que esa habitación NO está disponible
- Al resolver un ticket, si hay una `CleaningTask` pendiente para esa habitación, se notifica al housekeeper que la habitación ya es accesible
- **No es microservicio:** ambos módulos comparten la misma base de datos, el mismo NestJS, los mismos guards de auth. La separación es a nivel de módulos NestJS (import/export), no de servicios independientes.

---

### 🟢 Baja Prioridad — Innovación y futuro

---

#### P8. IA para optimización de rutas y secuencia de limpieza

**Problema operativo:** Los housekeepers limpian habitaciones en orden aleatorio o por proximidad intuitiva. Con datos históricos suficientes, un algoritmo puede generar la secuencia óptima que minimiza tiempo muerto entre habitaciones y prioriza correctamente las urgencias.

**Referencia:** Optii Solutions (adquirido por Amadeus, 2022) — reportan 15-20% de ganancia en eficiencia. El core es un algoritmo que considera: tiempo de limpieza histórico por room type, disposición física del edificio, hora de checkout predicha, y hora de llegada del próximo huésped.

**Diseño técnico (alto nivel — requiere volumen de datos para ser viable):**

1. **Prerequisitos:**
   - P1 (Stayover) y P3 (Auto-asignación) implementados
   - Al menos 30 días de datos reales de `TaskLog` (timestamps start/end por room type y housekeeper)
   - Modelo de proximidad entre habitaciones (floor + ala + distancia, o simplemente floor grouping)

2. **Fase 1 — Heurística simple (sin ML):**
   - Ordenar tareas asignadas a cada housekeeper por: (a) prioridad URGENT primero, (b) mismo piso juntas, (c) checkouts antes de stayovers
   - Implementable como un `sortTasks()` en `StaffSection` que reordena la cola del housekeeper
   - Mobile muestra las tareas en el orden optimizado

3. **Fase 2 — Modelo predictivo (con datos):**
   - Entrenar un modelo simple (regresión lineal o gradient boosting) que predice `cleaningMinutes` basado en: `roomType`, `taskType`, `staffId`, `dayOfWeek`, `isCheckout`, `bedCount`
   - Usar las predicciones para calcular la secuencia que minimiza el makespan total (tiempo desde primera tarea hasta última)
   - Algoritmo: variante de Traveling Salesman con pesos temporales + restricciones de prioridad

4. **Infraestructura:**
   - Fase 1: puro TypeScript en el backend, sin dependencias externas
   - Fase 2: Python microservice para ML (scikit-learn / XGBoost), comunicación via HTTP interno. O usar un servicio cloud (AWS SageMaker, Google Vertex) para no mantener infra ML

5. **Criterio de activación:** Solo activar cuando haya ≥500 tareas históricas completadas con timestamps válidos. Antes de eso, la heurística simple es suficiente.

---

## Known Issues & Edge Cases

### Resueltos en Sesión 3-4

| Issue | Causa | Fix |
|-------|-------|-----|
| `confirmDeparture` activaba todas las camas | checkout agrupa N camas; sin `bedId`, activa todas | `body.bedId` al endpoint; filtrar `t.bedId === bedId` |
| "Sin planificación confirmada" post-confirm | `invalidateQueries()` es void; tab cambia antes de datos frescos | `await qc.refetchQueries()` antes de tab-switch |
| `taskId: null` en zonas UTC-5 | `createdAt` cruza medianoche UTC | Filtrar por `checkout.actualCheckoutAt` (no `createdAt`) |
| `TaskLog.staffId` FK violation | `staffId: 'system'` no existe | `staffId String?` nullable |
| Estado perdido al navegar | `useState(confirmed)` muere al desmontarse | `planningIsDone` derivado del servidor |
| Seed cascade delete FK error | `bed.deleteMany()` bloqueado por FK | Orden de delete explícito |
| "🔴 Hoy entra" en TODAS las camas del dorm | `hasSameDayCheckIn` guardado a nivel checkout (room OR) | Campo per-task en `CleaningTask` |
| Celdas no editables post-cancel | `getState()` priorizaba override sobre servidor | `cell.taskId && !cell.cancelled` como guard |
| Celdas bloqueadas con tareas CANCELLED | `cycleState` bloqueaba en `cell.taskId` sin verificar cancelled | Guard: `cell.taskId && !cell.cancelled` |

### Pendientes / Conocidos

**Edge case: planificación sin ninguna salida**
`POST /checkouts/batch` con `items: []` no crea nada → `planningIsDone = false`.
Fix: `localStorage.setItem('planning-no-checkout-confirmed', TODAY)`. Funciona pero no se sincroniza entre dispositivos.

**`batchCheckout` no es idempotente**
Doble clic → dos juegos de tareas PENDING. Frontend previene con `isPending`, no hay guard backend.

**Mobile sin tests**
No hay ningún test en `apps/mobile`.

**`CleaningTask.bedId` NOT NULL — deuda técnica para hoteles con múltiples camas por cuarto**
El modelo fue diseñado hostel-first: `CleaningTask` siempre se vincula a una cama (`bedId`), nunca directamente a una habitación. Para un hostal esto es correcto (cada cama = unidad vendible independiente). Para un hotel con habitación doble/twin (2 camas, 1 unidad vendible), el bloqueo de habitación via `SmartBlock` genera hoy **2 tareas MAINTENANCE separadas** cuando debería generar 1 tarea a nivel de habitación.

El comportamiento actual es **funcionalmente correcto para el caso más común** (hotel con 1 cama por habitación privada), pero semánticamente incorrecto para dobles/twin.

Refactor requerido cuando se amplíe a hoteles con habitaciones multi-cama:
1. `prisma/schema.prisma` — hacer `CleaningTask.bedId` opcional (`String?`) y añadir `roomId String?` (XOR: exactamente uno presente)
2. `blocks.service.ts` `activateBlock()` — si `room.type === PRIVATE` → crear 1 tarea con `roomId`; si `room.type === SHARED` → N tareas con `bedId` (comportamiento actual)
3. `TasksService`, `CleaningTaskDto`, `KanbanPage`, `mobile/task/[id].tsx` — renderizar `roomId` cuando `bedId` sea null
4. Migración Prisma segura: no hay datos de producción con `taskType = MAINTENANCE` aún

Evidencia en código: `TODO(hotel-room-granularity)` en `blocks.service.ts` y `schema.prisma`.

---

## Commands

### Setup inicial
```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cd apps/api
npx prisma migrate dev
npx ts-node -r tsconfig-paths/register prisma/seed.ts
```

### Desarrollo
```bash
# API
cd apps/api && npx nest start --watch
# Web
cd apps/web && npx vite
# Mobile
cd apps/mobile && npx expo start
```

### Tests
```bash
cd apps/api && npx jest
npx jest --testPathPattern="checkouts.service.spec" --verbose
cd apps/api && npx tsc --noEmit
cd apps/web && npx tsc --noEmit
```

### Base de datos
```bash
cd apps/api && npx ts-node -r tsconfig-paths/register prisma/seed.ts  # reset
npx prisma migrate dev --name nombre_de_la_migracion
npx prisma studio
```

### Credenciales de seed
| Email | Password | Rol |
|-------|----------|-----|
| `reception@demo.com` | `reception123` | RECEPTIONIST |
| `supervisor@demo.com` | `supervisor123` | SUPERVISOR |
| `hk1@demo.com` | `hk123` | HOUSEKEEPER |
| `hk2@demo.com` | `hk123` | HOUSEKEEPER |

---

## Non-Negotiable Decisions

> Las siguientes decisiones fueron tomadas deliberadamente y NO deben revertirse sin discusión:

1. **Dos fases de checkout** — `batchCheckout` crea PENDING (sin notificar); `confirmDeparture` activa (notifica). Jamás activar limpieza antes de confirmación física.

2. **`confirmDeparture` debe recibir `bedId`** — sin él, en dorms se activan todas las camas del checkout.

3. **`await qc.refetchQueries()`** (no `invalidateQueries`) antes de cualquier navegación que dependa de datos frescos.

4. **`getDailyGrid` filtra por `checkout.actualCheckoutAt`** — nunca por `createdAt` (timezone-safe).

5. **`planningIsDone` derivado del servidor** — nunca de `useState`. Source of truth: `allBeds.some(b => !!b.taskId && !b.cancelled)`.

6. **Tab state en URL params** — `useSearchParams`, nunca `useState`.

7. **`hasSameDayCheckIn` per-task** — nunca per-checkout. Cada cama tiene su propio flag.

8. **`getState()` precedencia:** tarea activa (no cancelada) en servidor → override local → inferir de servidor.

9. **Cancel per-bed:** con `bedId` no marca `checkout.cancelled = true`. Sin `bedId` sí.

10. **Módulo de Mantenimiento monolítico** — comparte BD, NestJS y auth con Housekeeping. No es microservicio. Separación a nivel de módulos NestJS.
