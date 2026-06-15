# Catálogo de Reportes Zenix — definición completa (todos los reportes, por área y usuario)

> **Fecha:** 2026-06-15 · **Estado:** definición viva · **Rige:** el [Estándar de Reportes](./reporting-standard.md) (reporte = tabla operable + export) + los estudios [pms-reporting-landscape](../research/pms-reporting-landscape.md), [cash-card-accounting-pms-benchmark](../research/cash-card-accounting-pms-benchmark.md) y [report-internationalization-latam](../research/report-internationalization-latam.md).
>
> **Propósito (owner 2026-06-15):** tener **definidos TODOS los reportes** del catálogo objetivo aunque algunos aún estén vacíos — se llenan con data real cuando aterricen PAY-CORE / RATES / CFDI-CORE. Cada reporte declara su **usuario/área**, sus **columnas con justificación** (por qué la industria las usa), su **estado de datos** y su **aplicabilidad por país**. Sin suposiciones: columnas fundamentadas en USALI / Visa CRR / autoridades fiscales / PMS líderes.

## Leyenda de estado de datos
- **🟢 LIVE** — construido y operando con data real.
- **🟡 DASHBOARD** — la data existe pero por decisión se presenta como dashboard glanceable, no tabla.
- **🔴 BLOQUEADO** — definido, vacío hasta que aterrice el módulo del que depende (PAY-CORE / RATES / CFDI-CORE). Se mostrará en la biblioteca como "Próximamente · depende de X".
- **⚪ OPERATIVO** — vive en el calendario/operación en vivo, no como reporte tabular (por diseño).

---

## Área: Finanzas / Caja  ·  usuario: cajero, contador, dueño

| Reporte | Estado | Columnas clave | Justificación (industria) |
|---|---|---|---|
| **Turnos de caja** (Cashier Shift) | 🟢 LIVE | fecha, cajero, fondo, esperado, contado, **over/short**, estado, conciliador | Cashier's Shift Report AHLEI; over/short = control anti-fraude diario; blind drop OPERA |
| **Movimientos** (Transaction Report) | 🟢 LIVE | fecha, folio, huésped, método, divisa, monto, **referencia**, cajero, turno, void | Transaction Report USALI; referencia = evidencia chargeback Visa CRR §5.9.2 |
| **Resumen diario de caja** | 🟢 LIVE | divisa × método × cajero, totales | Daily flash; el dueño revisa la caja; per-divisa SUM-able (D-CASH3) |

## Área: Comercial / Revenue  ·  usuario: gerente, revenue manager

| Reporte | Estado | Columnas clave | Justificación |
|---|---|---|---|
| **Métricas diarias** | 🟢 LIVE | fecha, ocupación, **ADR**, **RevPAR**, hab. vendidas, ingreso, llegadas, salidas, cancel, no-show | Manager's Report USALI; ADR/RevPAR KPIs universales; totales método USALI |
| **No-shows** (auditado) | 🟢 LIVE | marcado, reserva, huésped, canal, cargo, estado cargo, iniciador, razón, marcado por | Revenue mgmt + evidencia chargeback Visa CRR |
| **Pace / Pickup / STLY** | 🟡 DASHBOARD | noche futura, on-the-books, pickup, occ, YoY | `MetricsForwardSnapshot` ya capturado; vista heatmap/serie en dashboard |
| **Producción por canal y segmento** (OTA contribution / channel mix) | 🔴 BLOQUEADO (RATES + metrics enriquecido) | canal, segmento, reservas, noches, ingreso **neto de comisión**, % mix | Decidir mix de canales; requiere `commissionRate`/`marketSegment` |
| **Producción por tarifa** (rate plan) | 🔴 BLOQUEADO (RATES) | rate plan, noches, ingreso, ADR del plan | Requiere `ratePlanId` en el folio |

## Área: Contabilidad / Fiscal  ·  usuario: contador  ·  país-específico

> Estos son los reportes que el contador pide y que dependen de PAY-CORE (folios) y CFDI-CORE (timbrado). **País-específicos**: el catálogo muestra el que corresponde al `FiscalRegime` de la Entidad Legal de la propiedad activa (ver [estudio i18n](../research/report-internationalization-latam.md) §3-§4).

| Reporte | Estado | Columnas clave | Justificación + país |
|---|---|---|---|
| **Facturación fiscal — CFDI 4.0** (MX) | 🔴 BLOQUEADO (CFDI-CORE) | **UUID**, tipo (I/E/P), fecha, RFC emisor/receptor, UsoCFDI, FormaPago, MetodoPago, base, **IVA 16%**, **ISH local** (implocal), total | Libro de facturación para el contador MX; **IVA federal e ISH estatal van SEPARADOS** (Anexo 20 + complemento implocal) ✅ |
| **Facturación fiscal — DIAN** (CO) | 🔴 BLOQUEADO (CFDI-CORE/adapter CO) | **CUFE**, NIT emisor/receptor, fecha, base, IVA 19%, INC, total | Factura electrónica DIAN; discrimina IVA + INC |
| **Facturación fiscal — NFS-e / SPED** (BR) | 🔴 BLOQUEADO (adapter BR / Sovos §93) | nota, fecha, CNPJ, ISS municipal → IBS/CBS (reforma 2026-2033), total | Producido por adapter especializado, no por catálogo curado |
| **Facturación fiscal — Hacienda v4.4** (CR) / **FEL** (GT) / **RVIE** (PE) / **Libro IVA Digital** (AR) | 🔴 BLOQUEADO (adapter por país) | id único (clave/UUID/CAE), ID fiscal, base, IVA/IGV, total | Un reporte por `FiscalRegime`, del `IFiscalAdapter` del país |
| **Guest ledger / folios abiertos** | 🔴 BLOQUEADO (PAY-CORE) | folio, huésped, cargos, pagos, **saldo abierto**, antigüedad | El contador lo pide explícitamente; quién debe qué ahora |
| **Cuentas por cobrar / city ledger** | 🔴 BLOQUEADO (PAY-CORE) | cuenta, factura, fecha, saldo, días, agente | A/R de cuentas a crédito (agencias/empresas) |
| **Impuestos por concepto / departamento** | 🔴 BLOQUEADO (tax engine + CFDI-CORE) | concepto/depto, base, **IVA**, **impuesto turístico** (ISH/IIBB/parafiscal), retenciones | Desglose dinámico parametrizado por `TaxCatalogEntry` (§91-§92); el impuesto turístico cambia por país |

## Área: Operación / Housekeeping  ·  usuario: supervisor HK

| Reporte | Estado | Columnas clave | Justificación |
|---|---|---|---|
| **Desempeño de personal** | 🟡 DASHBOARD (decisión owner 2026-06-15) | staff, tareas, verificadas, tiempo promedio | Datos en `getStaffPerformance`; se presenta como dashboard, no tabla |
| **Llegadas / Salidas / En casa / Estado de habitaciones** | ⚪ OPERATIVO | — | Operación en vivo en el calendario/dashboard, no reporte tabular |

## Nivel: Grupo (multi-propiedad)  ·  usuario: dueño / corporativo

| Reporte | Estado | Columnas clave | Justificación |
|---|---|---|---|
| **Consolidado de grupo** (multi-propiedad, reporting currency) | 🔴 BLOQUEADO (multi-LegalEntity reporting, post-v1.0.x) | propiedad, país, divisa local, ocupación, ADR/RevPAR, ingreso **convertido a divisa de reporte** | **Gerencial, NO contable** (USALI/IAS 21). FX explícito + disclaimer no-fiscal. Nunca consolida el libro fiscal entre divisas (§1 del estudio i18n) |

---

## Reglas de gobierno del catálogo
1. **Reportes país-neutrales** (caja, métricas, no-shows, estadías, saldos) = mismas columnas en todo LATAM; sólo cambia la divisa local (per-divisa SUM-able).
2. **Reportes fiscales** = uno por `FiscalRegime`, producido por el `IFiscalAdapter` del país; el catálogo muestra el del país de la propiedad activa.
3. **Consolidado de grupo** = gerencial, reporting currency con FX explícito, marcado no-fiscal.
4. **No fabricar data**: un reporte 🔴 se muestra como "Próximamente · depende de X" — nunca con datos inventados (evita los "reportes inútiles" que erosionan la confianza).
5. Cada reporte nuevo se agrega aquí ANTES de construirlo, con su usuario, columnas justificadas y dependencia.

## Bitácora
- **2026-06-15** — Catálogo creado: 7 reportes 🟢 LIVE + el resto definidos (🔴 bloqueados por PAY-CORE/RATES/CFDI-CORE, 🟡 dashboard, ⚪ operativos). País-aware vía `FiscalRegime`. Fundamentado en los 3 estudios + investigación de campo LATAM.
