# REPORTS-REVAMP — Replanteamiento de la sección /reports + primitiva ReportTable

> **Fecha:** 2026-06-14 · **Estado:** PROPUESTA (pendiente confirmación del IA) · Owner pidió replantear `/reports` contra el [Estándar de Reportes](../standards/reporting-standard.md) antes de construir. Export objetivo: **.xlsx** (CONTPAQi/QuickBooks-friendly), CSV fallback.

## 1. Auditoría del estado actual (por qué NO es el deber ser)

| Tab actual | Qué es hoy | Veredicto |
|---|---|---|
| Housekeeping | KPI cards + gráfico diario + leaderboard | **Dashboard**, no reporte (sin tabla operable ni export) |
| No-Shows | KPIs + tabla de items | Tabla parcial, **sin export**, sin orden/paginación/totales |
| Estadías | KPIs + tabla + CSV ad-hoc | Lo más cercano, pero CSV-only + inconsistente |
| Caja | Resumen + tabla + modal + CSV | Parcial (modal ≠ reporte) |

**Problema raíz:** se mezclan **dashboards** (insight glanceable: KPIs, gráficas) con **reportes** (tabla operable + export). Cada tab está armado ad-hoc → inconsistencia + ninguno cumple el estándar.

## 2. Principio del replanteamiento

> **Dashboard ≠ Reporte.** El dashboard responde "¿cómo voy?" (glanceable, gráficas). El reporte responde "dame los registros para trabajar/contabilizar" (tabla operable + export).

- **`/dashboard`** = insight (KPIs, ADR/RevPAR, pickup, leaderboard, gráficas). Ahí se quedan/mueven las tarjetas y charts.
- **`/reports`** = **biblioteca de reportes operables** — solo tablas con filtros/orden/totales/paginación/drill/export .xlsx. Patrón "Cloudbeds Insights / report library".

## 3. IA propuesta — Biblioteca de Reportes

`/reports` deja de ser 4 tabs planos y pasa a ser un **catálogo agrupado por área**. Cada reporte abre una vista `ReportTable` completa.

```
/reports                        → catálogo (cards por reporte, agrupados)
/reports/:reportKey             → vista ReportTable (filtros + tabla + totales + export)
```

**Catálogo inicial (cada uno = ReportTable):**

| Área | Reporte | Columnas clave | Rol |
|---|---|---|---|
| **Finanzas / Caja** | Turnos de caja (Cashier Shift) | fecha, cajero, apertura/cierre, fondo, esperado, contado, **over/short**, estado, conciliador | SUPERVISOR |
| | Movimientos / transacciones (PaymentLog) | fecha, folio, huésped, método, divisa, monto, referencia, cajero, turno, void | SUPERVISOR |
| | Resumen diario de caja | divisa × método × cajero, totales | SUPERVISOR |
| **Comercial / Revenue** | No-shows (auditado) | fecha, reserva, huésped, canal, monto, estado cargo, iniciador | SUPERVISOR |
| | Estadías extendidas | huésped, contacto, fechas, origen, noches | SUPERVISOR |
| | Métricas diarias (occ/ADR/RevPAR) | fecha, occ, ADR, RevPAR, cancel, no-show, mix | SUPERVISOR |
| | Saldos vencidos (overstayed) | huésped, hab, salida programada, saldo, horas | SUPERVISOR |
| **Operación / Housekeeping** | Desempeño de personal | staff, tareas, tiempos, verificadas | SUPERVISOR/LEAD |

> Las KPI cards + gráficas de housekeeping/no-shows/estadías **migran al dashboard** (insight), no se pierden.

## 4. Primitiva `ReportTable` (componente canónico, D-REPORT5)

`apps/web/src/components/shared/ReportTable.tsx` — una sola implementación que todos los reportes consumen:
- Props: `columns` (tipadas: key, header, align, format, sortable, total?), `rows`, `loading`, `filters` (slot), `onSort`, `page`/`pageSize`/`total`, `onExport`.
- Render: cabecera de control (título + rango de fechas + filtros aplicados + botón **Exportar .xlsx**), tabla (orden por columna, header fijo, `tabular-nums`, fila de **totales**, paginación), hover + click de fila → `onRowClick` (drill).
- **Export .xlsx server-side**: endpoint por reporte que devuelve el .xlsx (lib `exceljs` en API) con las MISMAS columnas/filtros; CSV fallback. (Hoy solo hay CSV en caja — se reemplaza.)

## 5. Backend — contrato de reporte

Cada reporte expone:
- `GET /v1/reports/<key>?from&to&<filtros>&sort&page&pageSize` → `{ rows, total, totals }` (paginado + totales).
- `GET /v1/reports/<key>/export?<mismos params>&format=xlsx|csv` → archivo.

Reusar lo existente donde aplique (caja ya tiene `cash-reports`; no-shows/estadías/overstayed ya tienen endpoints — se adaptan al contrato paginado + export xlsx).

## 6. Orden de construcción

1. **R1 — Primitiva + export .xlsx — ✅ CERRADO 2026-06-14:** `components/shared/ReportTable.tsx` (orden por columna, totales, paginación, filtros slot, export Excel/CSV, drill) + `common/report-export.ts` (`exceljs` `buildReportXlsx` + `buildReportCsv`, helper reusable). Decisión IA confirmada: **biblioteca `/reports/:reporte`** + dashboards migran en R3.
2. **R2 — Turnos de caja sobre el estándar — ✅ CERRADO 2026-06-14:** endpoint `GET /v1/cash-reports/shifts` (paginado, per-divisa SUM-able, totales, orden) + `/shifts/export` (.xlsx/CSV) · `CashShiftsReportPage` (`/reports/cash-shifts`) con `ReportTable` (filtros fecha/divisa/estado, totales, paginación, export Excel, drill → `ShiftReportDialog`) · `ReportsLibraryPage` (`/reports` catálogo agrupado; clásicos → `/reports/classic`). **Verificado en navegador con datos reales** (preview→API 3001): biblioteca con áreas + badges "clásico"; reporte de turnos con columnas/totales (6,000/3,700/3,700/0.00)/paginación/export; .xlsx válido (PK zip) por HTTP. typecheck api+web + 55/55 cash specs verdes.
   - **R2 restante — ✅ CERRADO 2026-06-14:** reporte **Movimientos** (`/reports/cash-transactions`, Transaction Report USALI: fecha/reserva/huésped/método/monto/referencia/cajero/anulado, filtros divisa+método, totales, export .xlsx/CSV — endpoint `GET /v1/cash-reports/transactions[/export]`) + **folding de acciones del supervisor al drill** (`ShiftReportDialog`: turno OPEN → "Arqueo sorpresa", CLOSED → "Conciliar turno"). Biblioteca actualizada (cards Turnos + Movimientos nuevos; Resumen diario marcado clásico → R3). **Verificado en navegador con datos reales** (20 transacciones, void en rojo, export .xlsx válido; drill del turno OPEN muestra el botón de arqueo). typecheck api+web + 55/55 cash specs. *Pendiente menor:* el Resumen diario como `ReportTable` propio (hoy sigue en `/reports/classic?tab=cash`) — se cierra junto a R3.
3. **R3 — Migración resto + dashboards** (EN CURSO, por lotes — verificado e2e por reporte):
   - ✅ **Resumen diario de caja** (`/reports/cash-summary`).
   - ✅ **No-shows** (`/reports/no-shows`).
   - ✅ **Estadías extendidas** (`/reports/stays`).
   - ✅ **Métricas diarias** (`/reports/metrics`) — P1, 2026-06-15.
   - ✅ **Saldos vencidos / overstayed** (`/reports/overstayed`) — P2, 2026-06-15.
   - ⏳ **Migración de KPIs/gráficas al `/dashboard` + retiro de `/reports/classic`** — **DIFERIDO** (decisión owner 2026-06-15): Housekeeping se queda como **dashboard** (no se convierte en reporte tabular); la migración de gráficas al `/dashboard` + el retiro de `/reports/classic` quedan como ticket aparte con su propio diseño. → ver **§10 Handoff**.
4. **R4 — Norte GL** (futuro, PAY-CORE/REPORTS-CORE): Accounting Bridge (QuickBooks/Xero/**CONTPAQi/Aspel**) — el export deja de ser el workhorse.

## 7. Decisiones (D-REPORT1..6 del estándar) + a confirmar
- IA: ¿biblioteca `/reports/:key` (recomendado) o mantener tabs planos pero cada uno como ReportTable?
- ¿Mover las KPI/gráficas actuales al dashboard ahora (R3) o dejarlas hasta tener el dashboard consolidado?

## 8. Bitácora
- **2026-06-15** — P1 (Métricas diarias) + P2 (Saldos vencidos) cerrados bajo el estándar (ReportTable + report-export), verificados e2e con datos reales. P3 diferido por decisión del owner: Housekeeping se queda como dashboard; migración de KPIs/gráficas al `/dashboard` + retiro de `/reports/classic` = ticket aparte. Commits `2e67a86`, `7d836f6` en `feat/cash-drawer-reports` (sin merge).
- **2026-06-14** — Replanteamiento creado tras feedback del owner ("lo que existe en /reports no es el deber ser"). Auditoría + IA biblioteca + catálogo + primitiva ReportTable + orden R1→R4. Pendiente: confirmar IA → construir.

---

## 10. HANDOFF — estado al cierre de sesión 2026-06-14 (leer al retomar)

**Rama:** `feat/cash-drawer-reports` — **NO mergeada** (regla owner: desarrollar + commit en rama, sin PR/CI hasta que el owner lo pida). Todo lo de abajo está commiteado ahí. Entorno dev del owner (web :5173 / api :3000) intacto.

### ✅ HECHO (verificado e2e: typecheck + tests + navegador con datos reales vía preview→API :3001)

**Módulo de Caja completo (CASH-DRAWER-REPORTS S1–S5b + R1/R2):** turnos (recibir→trabajar→entregar a ciegas→conciliar), arqueo neto multi-divisa, handover gaveta compartida, spot-count supervisor. Backend `apps/api/src/pms/cashier-shift/` (service+controller+`cash-report.controller`+specs 55/55). Frontend `apps/web/src/pms/cashier-shift/`. Migración `20260621000000_cash_drawer_core`.

**Estándar de Reportes + infra reusable:**
- Doc: `docs/standards/reporting-standard.md` (definición: reporte = tabla operable + export, no modal) + estudios `docs/research/cash-card-accounting-pms-benchmark.md` y `pms-reporting-landscape.md`.
- **Primitiva `apps/web/src/components/shared/ReportTable.tsx`** (orden por columna, totales, paginación, filtros slot, export Excel/CSV, drill). ← reusar SIEMPRE.
- **Helper export server `apps/api/src/common/report-export.ts`** (`buildReportXlsx` exceljs + `buildReportCsv`). exceljs ya instalado. ⚠️ usar `import { Workbook } from 'exceljs'` (el default import da undefined).
- **Helper descarga front `apps/web/src/api/download.ts`** (`downloadFile`, Blob + token).
- **Biblioteca `apps/web/src/pages/ReportsLibraryPage.tsx`** en `/reports` (catálogo por área). Vista tabbed previa movida a `/reports/classic`.

**Reportes ya bajo el estándar (rutas + endpoints):**
| Reporte | Ruta web | Endpoint API | Página |
|---|---|---|---|
| Turnos de caja | `/reports/cash-shifts` | `GET /v1/cash-reports/shifts[/export]` | `CashShiftsReportPage` |
| Movimientos | `/reports/cash-transactions` | `GET /v1/cash-reports/transactions[/export]` | `CashTransactionsReportPage` |
| Resumen diario de caja | `/reports/cash-summary` | `GET /v1/cash-reports/cash-summary[/export]` | `CashSummaryReportPage` |
| No-shows | `/reports/no-shows` | `GET /reports/no-shows-table[/export]` | `apps/web/src/reports/NoShowReportPage` |
| Estadías extendidas | `/reports/stays` | `GET /reports/stays-table[/export]` | `apps/web/src/reports/StayReportPage` |

### Estado al cierre 2026-06-15 (P1 + P2 hechos, P3 diferido por decisión owner)

- ✅ **P1 — Métricas diarias** (`/reports/metrics`, endpoint `GET /v1/metrics/report[/export]`, `MetricsReportPage`). Totales agregados USALI (no promedio); per-divisa SUM-able. Verificado e2e. Commit `2e67a86`.
- ✅ **P2 — Saldos vencidos** (`/reports/overstayed`, endpoint `GET /reports/overstayed-table[/export]`, `OverstayedReportPage`). Reusa `AvailabilityService.findOverstayed` (+ campo `currency` aditivo). Per-divisa SUM-able. Verificado e2e (24 vencidos, total USD 140, HOUSEKEEPER 403). Commit `7d836f6`.
- ⏳ **P3 — DIFERIDO (decisión owner 2026-06-15):** Housekeeping se queda como **dashboard** (NO reporte tabular → no se construyó `/reports/staff-performance`). La migración de KPIs/gráficas (overview, daily-trend, leaderboard) al `/dashboard` y el **retiro de `/reports/classic`** quedan como **ticket aparte** con su propio diseño (cambio mayor al dashboard). Hasta entonces `/reports/classic` sigue vivo y la card "Housekeeping clásico" sigue enlazándolo.
- ⏳ **P4 / P5** sin cambios (ver abajo).

### PENDIENTE ESPECÍFICO original (referencia — P1/P2 ya cerrados arriba)

**P1 — Reporte "Métricas diarias" (ADR/RevPAR/ocupación) como tabla exportable. ✅ HECHO 2026-06-15.**
- Backend: módulo `apps/api/src/pms/metrics/` ya tiene `MetricsDailySnapshot` + `MetricsService.getRange(propertyId, orgId, from, to)`. Agregar `getMetricsReport` (reusa getRange → filas {fecha, ocupación, ADR, RevPAR, roomsSold, cancel, noShow, ...} + totales/promedios) + endpoints `GET /v1/metrics/report[/export]` (SUPERVISOR) usando `buildReportXlsx`/`buildReportCsv`. Patrón EXACTO = `buildShiftReportRows`/`getShiftsReport` de cashier-shift.
- Frontend: `apps/web/src/reports/MetricsReportPage.tsx` (mismo molde que `NoShowReportPage`) → ruta `/reports/metrics` en App.tsx + card en `ReportsLibraryPage` (área Comercial/Revenue) reemplazando el placeholder.
- Filtros: rango de fechas. Sin filtro de divisa (las métricas usan `reportCurrency`).

**P2 — Reporte "Saldos vencidos (overstayed)" como tabla exportable. ✅ HECHO 2026-06-15.**
- Backend: `AvailabilityService.findOverstayed(propertyId)` ya devuelve la lista con `outstandingBalance` + `hoursOverdue` (hoy la consume `GET /dashboard-reports/overstayed`). Agregar un report endpoint paginado + export (mismo molde) — puede vivir en `reports.controller` (`GET /reports/overstayed-table[/export]`) llamando a un nuevo `ReportsService.getOverstayedReport` que invoque AvailabilityService o consulte directo.
- Frontend: `OverstayedReportPage` (molde no-show) → `/reports/overstayed` + card NUEVA en la biblioteca (área Comercial; hoy NO existe card de overstayed).
- Columnas: huésped, hab., salida programada, noches vencidas/horas, **saldo pendiente**, divisa.

**P3 — Mover KPIs/gráficas al dashboard + retirar `/reports/classic`.**
- La vista `apps/web/src/pages/ReportsPage.tsx` (tabbed: housekeeping/noshow/stays/cash) sigue viva SOLO en `/reports/classic` y la biblioteca ya NO enlaza a noshow/stays (migrados). Aún enlaza housekeeping (`/reports/classic?tab=housekeeping`) como "clásico".
- Falta: (a) **Housekeeping** — decidir si su desempeño de personal se vuelve reporte tabular (`/reports/staff-performance`, datos en `ReportsService.getStaffPerformance`) o se queda como dashboard; (b) mover las KPI cards + gráficas (overview, daily-trend, leaderboard, no-show KPIs, stays KPIs) al `/dashboard`; (c) cuando no quede nada útil en `/reports/classic`, **eliminar `ReportsPage` + la ruta** y la card "Housekeeping clásico".

**P4 — Diferenciadores deseados (roadmap del `ReportTable`, post-migración) — del estudio `pms-reporting-landscape.md`:**
- (a) **Reportes programados por email** (recurring); (b) **custom column/filter builder**; (c) **integración GL** (CONTPAQi/QuickBooks/Xero) = el norte que reduce el Excel a cero (R4, depende de PAY-CORE).

**P5 — Reportes NUEVOS del catálogo (REPORTS-CORE, dependen de otros sprints):** Guest ledger / folios abiertos (PAY-CORE), Producción/Revenue por canal y segmento (RATES + metrics enriquecido). Ver catálogo en `pms-reporting-landscape.md §1`.

### Cómo retomar rápido
1. `git checkout feat/cash-drawer-reports`.
2. Para verificar en navegador con datos: levantar API en `:3001` (`PORT=3001 npx nest start` en `apps/api`) + preview web apuntando ahí (config `web-preview` con `VITE_API_PROXY=http://localhost:3001` en `.claude/launch.json` — el proxy ya es configurable por env, default :3000). Login `s@z.co`/`123456` (SUPERVISOR).
3. Empezar por **P1 (Métricas)** copiando el molde de `NoShowReportPage` + `reports.service.buildNoShowReportRows`.

### Pendiente menor / honesto
- `cashier-shift.api.ts` tiene su propio `downloadCsv` inline; lo ideal es que use el `download.ts` compartido (duplicación menor, no urgente).
- No-shows/Estadías: el filtro de divisa muestra todas las filas pero el TOTAL suma solo la divisa seleccionada (decisión per-divisa SUM-able, D-CASH3); documentado en el código.
