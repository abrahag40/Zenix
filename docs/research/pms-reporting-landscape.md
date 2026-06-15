# Estudio — Reportería en un PMS: qué se demanda + amado/odiado/deseado (lente "reporte operable")

> **Fecha:** 2026-06-14 · **Para:** gobernar todos los reportes de Zenix bajo el [Estándar de Reportes](../standards/reporting-standard.md) (reporte = tabla operable + export, no modal). Este estudio re-hace el "ama/odia/desea" con el **nuevo enfoque de reporte** y mapea el **catálogo completo de reportes que un PMS debe tener**.
>
> **Marcado:** ✅ verificado fuente · 🟡 secundario · ⚠️ inferencia.

## 1. Catálogo de reportes que un PMS debe ofrecer (verificado)

Fuentes: Hotelogix "Must-have PMS reports", mycloud "Most important reports", InnSight/roomMaster (125+ reports), Cloudbeds night-audit pack. Agrupado por área administrativa:

| Área | Reportes esperados |
|---|---|
| **Operación diaria** | Llegadas (arrivals), Salidas (departures/check-out list), En casa (in-house), Estado de housekeeping (room status), Reservas del día |
| **Finanzas / Caja** | Night audit / Manager flash report, **Cashier / Transaction report** (postings, pagos, voids, refunds), **Arqueo (over/short)**, Guest ledger / folios abiertos, Impuestos por departamento, Cuentas por cobrar (city ledger) |
| **Revenue / Comercial** | Ocupación, **ADR / RevPAR**, Revenue por segmento/canal, **OTA contribution / channel mix**, Pickup / pace, Forecast vs actual, **No-shows / cancelaciones**, Producción por tarifa |
| **Huésped / CRM** | Estadías extendidas, Huéspedes recurrentes, Datos de contacto (campañas), Saldos vencidos (overstayed) |
| **Operación HK / Staff** | Productividad de housekeeping (room-wise / staff-wise), Tareas por turno |

**Conclusión:** un PMS serio se mide por la **amplitud y operabilidad** de su set de reportes (roomMaster pregona 125+). Zenix no necesita 125, pero sí cubrir las áreas anteriores con **tablas operables exportables**, no dashboards de lectura.

## 2. Lo que el usuario administrativo AMA / ODIA / DESEA — de la REPORTERÍA (con data)

### 💚 AMA
1. **Reportes fáciles de encontrar y entender** (HotelKey: "reports are easy to find and understand"). 🟡 → biblioteca clara por área.
2. **Cobertura amplia** ("many reports and statistics" — Mini Hotel PMS). 🟡 → catálogo completo (§1).
3. **Daily flash report** + **exports contables** listos (roomMaster). ✅
4. **Trial balance bloqueado por fecha** con revenue/pagos/impuestos separados (Mews — del estudio previo). 🟡

### 💔 ODIA
1. **Reportería rígida / poco personalizable** ("settings and reports could be more customizable", "reporting is less advanced" — Clock PMS; "Reports could be better" — Hotelizer). 🟡 → filtros + columnas + export que cubran sin pedir cambios al proveedor.
2. **Reportes que obligan a exportar y manipular Excel a mano** (del estudio previo: el flanco de Mews). 🟡
3. **Falta de reportes** ("could benefit from adding more reports"). 🟡

### ✨ DESEA
1. **Reportes programados por email** (recurring scheduled reports — patrón QuickBooks Custom Report Builder; roomMaster scheduled). ✅🟡 → roadmap del `ReportTable` (slot ya previsto).
2. **Custom report builder** (elegir columnas/filtros). 🟡 → versión futura del estándar.
3. **Integración contable que postea solo** ("financial data flows automatically from a PMS that acts as a single source of truth"; "daily revenue journals posting mapped to accounting accounts, run financial reports directly from the platform"). ✅ → **el norte (GL)** del estándar (CONTPAQi/QuickBooks/Xero).

## 3. Implicación para Zenix (re-confirma el estándar)

- La definición "reporte = tabla operable + export" es **exactamente** lo que el mercado pide; lo que ODIAN es justo lo opuesto (rigidez, lectura, Excel manual). El estándar Zenix ataca el dolor de frente.
- **Amplitud importa**: el catálogo §1 es la hoja de ruta de reportes de Zenix (REPORTS-CORE). Lo ya construido (Caja: Turnos/Movimientos/Resumen + No-shows) cubre el bloque Finanzas+parte Revenue.
- **Diferenciadores deseados y aún no resueltos** (roadmap del `ReportTable`): (a) **reportes programados por email**, (b) **custom column/filter builder**, (c) **integración GL** (el norte). Documentados como evolución de la primitiva.

## 4. Prioridad recomendada de reportes pendientes (orden de valor admin)

1. **Estadías extendidas** (CRM/retención) — en curso.
2. **Métricas diarias** (ADR/RevPAR/ocupación) como tabla exportable detrás del dashboard — revenue.
3. **Saldos vencidos (overstayed)** — cobranza.
4. **Guest ledger / folios abiertos** (NUEVO, no existe) — el contador lo pide; depende de PAY-CORE para folios completos.
5. **Producción/Revenue por canal y segmento** (NUEVO) — depende de RATES + metrics enriquecido.
6. Housekeeping productividad (operación) — ya hay datos en `/reports/classic`.

## 5. Bibliografía
- [Hotelogix — Must-have PMS reports](https://blog.hotelogix.com/must-have-reports-in-hotel-software/) · [mycloud — Most important reports](https://www.mycloudhospitality.com/blog/the-most-important-reports-to-run-on-hotel-property) · [InnSight PMS reporting](https://www.innsight.com/pms-reporting)
- [Cloudbeds — night audit reports](https://www.cloudbeds.com/articles/6-reports-your-hotel-should-run-every-night/) · [Cloudbeds — hotel accounting software](https://www.cloudbeds.com/articles/hotel-accounting-software/)
- [QuickBooks — scheduled custom reports](https://quickbooks.intuit.com/learn-support/en-us/help-article/email-reports/set-schedule-email-information-memorized-report/L0pQ4ifGJ_US_en_US) · [WebRezPro accounting export](https://webrezpro.com/accounting-software/) · [DataPlus — hospitality-specific vs QuickBooks](https://dphs.com/hotel-accounting-hospitality-specific-software-vs-quickbooks/)
- Reviews: [Clock PMS (Capterra)](https://www.capterra.com/p/132161/Clock-PMS/reviews/) · [HotelKey (Capterra)](https://www.capterra.com/p/198632/HotelKey-PMS/reviews/) · [Hotelizer (Capterra)](https://www.capterra.com/p/251146/Hotelizer-PMS/reviews/)
- Complementa el estudio previo [cash-card-accounting-pms-benchmark.md](./cash-card-accounting-pms-benchmark.md).

## 6. Bitácora
- **2026-06-14** — Estudio de reportería con el enfoque "tabla operable". Confirma el Estándar de Reportes + define el catálogo objetivo + prioriza pendientes. Diferenciadores deseados (scheduled email, custom builder, GL) como roadmap del `ReportTable`/REPORTS-CORE.
