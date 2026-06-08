# Changelog Zenix PMS

Sigue [Keep a Changelog](https://keepachangelog.com/) y [SemVer](https://semver.org/).

## [mobile-dashboard-v1] — 2026-06-08

### Added — Sprint MOBILE-DASHBOARD (Etapas A + B + C)

**Real-time HK ↔ Channex Sync (Etapa A, PR #97)**

- `BookingSameDayListener` (`apps/api/src/scheduling/listeners/booking-same-day.listener.ts`) — escala `CleaningTask` PENDING/READY a URGENT + `hasSameDayCheckIn=true` cuando llega booking OTA same-day vía Channex post-cron `morning-roster`. Emite SSE `task:upgraded`. 6/6 tests verde.
- `RoomMovedHkListener` (`apps/api/src/scheduling/listeners/room-moved-hk.listener.ts`) — migra atomicly HK tasks de `fromRoom` → `toRoom` cuando recepción cambia habitación. Cancela antigua (`RECEPTIONIST_MANUAL`), crea nueva con `carryoverFromTaskId`. Skip + warn defensivo si IN_PROGRESS. Emite SSE `task:moved`. 6/6 tests verde.
- `EventEmitter2` inyectado en `BookingNewHandler` con emit `channex.booking.same-day-arrival` post-save.
- 2 nuevos SSE types en `@zenix/shared`: `'task:upgraded'` + `'task:moved'`.

**Mobile Dashboard role-aware (Etapa B, PR #98)**

- Backend endpoint `GET /v1/dashboard/mobile` con projection role-specific (SUPERVISOR/RECEPTIONIST/HOUSEKEEPER→403). Payload optimizado ~3-5KB vs ~15-20KB web. Currency desde `LegalEntity.baseCurrency`. Time-aware greeting per `Property.settings.timezone`.
- `DashboardScreenV2.tsx` (`apps/mobile/src/features/dashboard/mobile-v2/`) — pantalla unificada con dispatch por `response.role`. Pull-to-refresh + last-sync footer + SSE auto-refetch en 11 eventos.
- `OccupancyDonut3` — donut 3-state con SVG nativo (Ocupadas verde / Llegadas ámbar / Bloqueadas rojo). Vacías = track gris implícito + número aislado en leyenda. Centro: `N° ocupadas / total`. Pattern Apple Fitness rings.
- `Hero` — greeting time-aware + role chip + property card.
- `BigNumberCard` — KPI hero estilo Stripe con trend arrow + caption.
- `AttentionList` — "Atender ahora" con empty state "🌱 Día limpio" (no `—` frío).
- `MovementsList` — RECEPTIONIST tabs Llegadas/Salidas (sin Walk-in tab per D-MOB-1).
- `useMobileDashboard` hook — poll 60s + SSE triggers incluyendo `task:upgraded`/`task:moved` de Etapa A.
- Router por rol en `apps/mobile/app/(app)/index.tsx`: SUPERVISOR/RECEPTIONIST → DashboardScreenV2; HOUSEKEEPER + otros → DashboardScreenLegacy (preservado).
- 6/6 tests jest-expo verde con `react-test-renderer` (patrón existente).
- `@types/react-test-renderer` agregado como devDep.
- `CHANGELOG.md` (este archivo) inicializado.
- `docs/sprints/MOBILE-DASHBOARD-plan.md` plan ejecutado.
- 11 decisiones formales en CLAUDE.md §235-§245 (D-HK-CHX1..3 + D-MOB-1, 3, 6, 7, bg, router, pull-to-refresh, tests).
- Sales master actualizado con Módulo Mobile Dashboard + Real-time HK ↔ Channex como diferenciador único LATAM.

### Fixed (audit visual 4 screenshots owner 2026-06-08)

- Donut ocupación inconsistente (mostraba "9%" con `Ocupadas=0`) — backend computa correctamente desde `actualCheckin not null`.
- Card "Tu día — tareas activas" con `—` frío como empty state — reemplazado por illustration explícita.
- "104 — Bloqueo automático por ticket..." truncado — `numberOfLines={2}` + body completo.
- Sin pull-to-refresh — `RefreshControl` integrado universal.
- Sin indicador de última sincronización — footer "Última actualización · hace X min".
- Tipo de cambio card vacío permanente — fuera del payload mobile.
- Semántica de color del donut invertida (verde grande = vacías) — corregido a 3-state accionable.
- Mezcla cross-role en el dashboard único — split en 3 layouts role-aware.

### Closed PRs

- **#96** — Sesión Command Center web + InsightsFeed real algorithm + notifications hybrid FB+LinkedIn + dev infra (kill-orphans + vite proxy rate-limited) + plan mobile dashboard
- **#97** — Etapa A: real-time HK ↔ Channex sync listeners
- **#98** — Etapa B §B1-§B6: backend role-aware endpoint + mobile screens + tests + docs

---

## Versionado

Las versiones anteriores no estaban documentadas en CHANGELOG (mantenidas en git history + CLAUDE.md decisiones §-numeradas + headers de sprints en `docs/sprints/`). Este archivo arranca con `mobile-dashboard-v1` como primer tag formalizado del módulo mobile.
