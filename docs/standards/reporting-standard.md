# Estándar Zenix de Reportes (system-wide)

> **Fecha:** 2026-06-14 · **Estado:** PROPUESTA (pendiente endorsement del owner) · **Alcance:** TODOS los módulos con reportería (caja, no-shows, estadías, métricas, overstayed, housekeeping, y futuros REPORTS-CORE / PAY-CORE / CFDI).
>
> **Por qué existe:** feedback del owner 2026-06-14 — *"un simple modal que muestra información es imposible considerarlo como un reporte serio… el sistema debería reducir al máximo cualquier operación de información que necesite el personal administrativo… de lo contrario el sistema solo serviría como adorno."* Este documento define qué ES un reporte en Zenix y el "deber ser" que lo justifica con data.
>
> **📁 Documentos hermanos (consultar para reportería):**
> - **[report-catalog.md](./report-catalog.md)** — catálogo COMPLETO: todos los reportes definidos (área, usuario, columnas + justificación, estado de datos, país). Consultar ANTES de construir un reporte.
> - **[../research/report-internationalization-latam.md](../research/report-internationalization-latam.md)** — internacionalización de reportes LATAM + dueño multi-país (BR/MX).
> - **[../research/pms-reporting-landscape.md](../research/pms-reporting-landscape.md)** + **[../research/cash-card-accounting-pms-benchmark.md](../research/cash-card-accounting-pms-benchmark.md)** — estudios base (ama/odia/desea + benchmark caja/contabilidad).
> - **[../sprints/REPORTS-REVAMP-plan.md](../sprints/REPORTS-REVAMP-plan.md) §10** — handoff + runbook de continuación (cómo activar reportes bloqueados, fast-follows).

---

## 1. Definición — qué ES y qué NO ES un "Reporte"

**Un Reporte Zenix es una superficie TABULAR operable**, no un resumen de lectura.

| ES un reporte | NO es un reporte |
|---|---|
| Tabla con **columnas = los campos que el área administrativa necesita** | Un modal con unas cuantas cifras |
| **Filtrable** (rango de fechas + dimensiones) y **ordenable por columna** | Una vista fija sin filtros ni orden |
| Con **totales/subtotales** y **paginación** | Una lista corta sin agregados |
| **Drill-down** a detalle (fila → transacción) | Un dato sin trazabilidad |
| **Descargable** a Excel/CSV como *handoff* contable | Un PDF/print decorativo |
| Permite **operar la tarea diaria DENTRO del sistema** (visualizar, conciliar, accionar) | Obliga a exportar para poder trabajar |

**Regla dura:** si para hacer su trabajo diario el personal administrativo tiene que exportar a Excel y manipularlo a mano, el reporte FALLÓ. El export es el puente al sistema contable externo, no la herramienta de trabajo.

---

## 2. El "deber ser" (justificado con data)

**Jerarquía de madurez de un reporte** — de menos a más valor para administración:

1. **Lectura** (modal/resumen) — lo mínimo. *No cuenta como reporte.*
2. **Tabla operable** (filtros + orden + totales + paginación + drill) — el piso de un reporte serio. ← **estándar mínimo Zenix**
3. **Export Excel/CSV** — handoff contable. Presente, pero NO el workhorse.
4. **Integración GL directa** (QuickBooks / Xero / CONTPAQi) — el norte: el sistema **postea** a contabilidad sin re-captura manual. ← **deber ser final**

**Evidencia:**
- **Cloudbeds Insights** entrega una colección de reportes pre-construidos exportables, **y** una integración directa a QuickBooks/Xero que *"removes the need to manually calculate and input data into your accounting platform"* — el objetivo declarado de la competencia líder es **eliminar la re-captura manual**, no facilitar el Excel. ([Cloudbeds QuickBooks](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/14005016969883-Quickbooks-Everything-You-Need-to-Know) · [Cloudbeds export reports](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/6979595895451-How-to-export-reports))
- **USALI / night audit pack**: el área administrativa NO trabaja con "un dato", trabaja con un **set de reportes tabulares** estándar — Manager Report (occ/ADR/RevPAR/revenue), Transaction Report (postings/pagos/voids/refunds), **Cashier Report (arqueo over/short)**, Revenue/Tax por departamento. *"PMS integration ensures real-time data flows directly into accounting without manual intervention."* ([Cloudbeds night reports](https://www.cloudbeds.com/articles/6-reports-your-hotel-should-run-every-night/) · [mycloud reports](https://www.mycloudhospitality.com/blog/the-most-important-reports-to-run-on-hotel-property))
- **UX de tablas empresariales** (consenso Baymard + práctica enterprise): filtros visibles con overview de lo aplicado, **orden y filtro desde el encabezado de columna**, **paginación** (no infinite-scroll/"load more"), **header fijo + 1ª columna fija** en scroll horizontal, **columna de totales visible**, hover/selección de fila, densidad ajustable. Eso es la anatomía mínima de una tabla usable. ([Baymard](https://baymard.com/blog/current-state-product-list-and-filtering) · [Pencil&Paper enterprise tables](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables) · [Stéphanie Walter](https://stephaniewalter.design/blog/essential-resources-design-complex-data-tables/))

**Conclusión:** el deber ser es **maximizar lo que el admin resuelve DENTRO del sistema** (tabla operable) y **minimizar el Excel** llevándolo, a mediano plazo, a **integración contable directa**. El CSV/Excel es el puente mientras la integración GL aterriza.

---

## 3. Anatomía canónica de un Reporte Zenix (el spec)

Todo reporte (en `/reports` o donde viva) cumple esta estructura:

**A. Cabecera de control**
- Título + descripción de una línea.
- **Rango de fechas** (presets Hoy / 7d / Mes / rango custom).
- **Filtros por dimensión** del dominio (p. ej. caja: cajero, estado, método, divisa; no-shows: canal; etc.) con chips de "filtros aplicados".
- Botón **Exportar** → Excel (.xlsx preferido por contabilidad; CSV fallback).
- (Futuro) **Programar envío** por email + **vistas guardadas**.

**B. Tabla**
- **Columnas = los campos contables del dominio** (no un subconjunto cosmético).
- **Orden por encabezado** de columna (asc/desc).
- **Totales/subtotales** (fila de totales por divisa/categoría) visibles.
- **Paginación** (no infinite-scroll) con conteo de registros.
- Header fijo; 1ª columna fija en scroll horizontal; números `tabular-nums`, alineados a la derecha.
- Hover de fila; densidad cómoda.

**C. Drill-down**
- Fila → detalle de la transacción (sheet/modal) **sin perder el contexto de la tabla**.

**D. Export = handoff, no workhorse**
- El .xlsx/CSV refleja exactamente la tabla filtrada (mismas columnas, mismos filtros).
- **Meta de reducción de Excel:** cada reporte declara qué tarea administrativa resuelve in-app para NO requerir manipular el export. Si no resuelve ninguna, se rediseña.

**E. Roles (RBAC)**
- Datos financieros = SUPERVISOR/administración; el operador ve lo suyo (p. ej. §50, §D-CASH10). El export respeta el mismo scope.

---

## 4. El norte: reducir Excel vía integración contable (deber ser final)

El export es el puente. El destino es **postear a contabilidad sin re-captura**:
- **v1.0.3 REPORTS-CORE / PAY-CORE:** mapear cada línea (revenue por departamento, impuestos, pagos por método, arqueo) a cuentas GL.
- **Integración:** QuickBooks Online + Xero (mercado intl.) y **CONTPAQi / Aspel** (México, prioritario para LATAM) — un *Accounting Bridge* que sincroniza el daily sales/taxes/payments, como Cloudbeds↔QuickBooks.
- **Mientras tanto:** export .xlsx con el layout que el contador pega/importa, minimizando su manipulación.

Cada vez que un reporte se construya, la pregunta de aceptación es: *"¿esto le evita al administrador abrir Excel para su tarea diaria?"* Si la respuesta es no, falta tabla operable o falta integración.

---

## 5. Impacto system-wide (qué debe cumplir el estándar)

| Superficie | Estado vs estándar | Acción |
|---|---|---|
| **Caja (este módulo)** | Modal + tabla básica → **no cumple** | Re-armar como reporte tabular: columnas completas (turno, cajero, apertura/cierre, fondo, esperado, contado, **over/short**, conciliador, método×divisa), filtros, totales, export **.xlsx**, drill al detalle |
| `/reports` no-shows / estadías | Tablas parciales | Auditar contra el estándar (orden, totales, paginación, export xlsx) |
| Métricas (ADR/RevPAR/pickup) | Dashboards (ok como dashboard) | Agregar un reporte tabular exportable detrás del dashboard |
| Overstayed / dashboard-reports | Widgets | Reporte tabular exportable cuando crezca el volumen |
| **REPORTS-CORE (v1.0.3)** | Por construir | Nace cumpliendo el estándar + Accounting Bridge |

---

## 6. Componente canónico a construir (para no reinventar por módulo)

Crear `components/shared/ReportTable` (o equivalente): tabla genérica con columnas tipadas, orden, paginación, fila de totales, slot de filtros en cabecera y **export .xlsx/CSV server-side**. Todos los reportes lo consumen → consistencia (§3 coherencia sistémica) + un solo lugar para mejorar (densidad, vistas guardadas, scheduled email). El export .xlsx requiere una lib server-side (p. ej. `exceljs`) — hoy solo tenemos CSV.

---

## 7. Decisiones a §-numerar al adoptar (D-REPORT1..N)

- **D-REPORT1** — "Reporte" = tabla operable (filtros+orden+totales+paginación+drill) + export. Un modal de lectura NO es un reporte.
- **D-REPORT2** — Export es handoff; la tarea diaria se resuelve in-app. Meta: minimizar Excel.
- **D-REPORT3** — Norte: integración GL (QuickBooks/Xero/CONTPAQi) — el export es puente.
- **D-REPORT4** — `.xlsx` es el formato preferido de export (contabilidad); CSV fallback.
- **D-REPORT5** — Primitiva `ReportTable` compartida; prohibido reportería ad-hoc por módulo.
- **D-REPORT6** — RBAC financiero (SUPERVISOR/admin) + scope en datos y export.

---

## 8. Bitácora
- **2026-06-14** — Estándar propuesto tras feedback del owner. Justificado con Cloudbeds Insights/QuickBooks, USALI night-audit pack, y UX de tablas empresariales (Baymard et al.). Pendiente: endorsement → aplicar al módulo de caja (modal → ReportTable) → gobernar REPORTS-CORE.
