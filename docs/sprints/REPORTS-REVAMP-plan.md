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
3. **R3 — Migración resto + dashboards**: migrar No-shows/Estadías/Métricas/Overstayed a `ReportTable`, mover sus KPIs/gráficas al dashboard, retirar `/reports/classic`.
4. **R4 — Norte GL** (futuro, PAY-CORE/REPORTS-CORE): Accounting Bridge (QuickBooks/Xero/**CONTPAQi/Aspel**) — el export deja de ser el workhorse.

## 7. Decisiones (D-REPORT1..6 del estándar) + a confirmar
- IA: ¿biblioteca `/reports/:key` (recomendado) o mantener tabs planos pero cada uno como ReportTable?
- ¿Mover las KPI/gráficas actuales al dashboard ahora (R3) o dejarlas hasta tener el dashboard consolidado?

## 8. Bitácora
- **2026-06-14** — Replanteamiento creado tras feedback del owner ("lo que existe en /reports no es el deber ser"). Auditoría + IA biblioteca + catálogo + primitiva ReportTable + orden R1→R4. Pendiente: confirmar IA → construir.
