# CASH-ARQUEO-REPORTS-CORE — Caja, arqueo diario y reportes contables (PLAN)

> **Estado:** **PLAN — no implementado.** Redactado 2026-06-14 a petición del owner
> ("falta el tema de la caja y arqueo diario así como los reportes contables, que
> son los reportes que más importan en el sistema"). **Decisión: se hace Plan-primero**
> (opción 1) — es módulo **fiscal-grade**, el owner exige visión a largo plazo, no parches.
>
> **No confundir** con el "reporte de migración" (MIGRATION-CORE) ni con los reportes
> operacionales ya en prod (housekeeping/no-shows/estadías). Aquí: **dinero** — caja,
> arqueo de turno, y los reportes que usan las áreas administrativas/contables.
>
> Territorio: **PAY-CORE (v1.0.1, §81-§88)** para la caja + **REPORTS-CORE (v1.0.3)** para
> los reportes contables. Este plan los une en el subset de **mayor valor** que el owner pidió.

---

## 1. Por qué importa (y por qué es delicado)

El arqueo de caja es el control #1 de un hotel: cuadrar **lo que entró** (efectivo, transferencias, TPV, OTA collect) contra **lo que el sistema dice que debió entrar**, por turno y por divisa. Sin esto:

- La recepción no puede cerrar turno con confianza → faltantes/sobrantes invisibles.
- Contabilidad no tiene fuente de verdad de ingresos por método/divisa/centro.
- Auditoría fiscal (CFDI, USALI) y evidencia de chargeback quedan incompletas.

Es delicado porque el **dinero es append-only e inmutable** (§28 PaymentLog ya lo es) y los errores de arqueo erosionan la confianza del cliente de inmediato. Por eso plan-primero.

**Fundamentos (a verificar/citar al ejecutar):** USALI 12 ed. (HFTP/AHLA — esquema de revenue + Foreign Exchange Gain/Loss), AHLEI *Front Office Cashier's Shift Report*, ISAHC (auditoría de caja), Visa/Mastercard Core Rules §5.9.2 (evidencia).

---

## 2. Qué YA existe (no reinventar)

- **`PaymentLog` append-only** (§28) — método (`CASH|CARD_TERMINAL|BANK_TRANSFER|OTA_VIRTUAL_CARD|COMP`), `amount`, `currency`, `reference`, `shiftDate`, `collectedById`, void = línea negativa. **Base del arqueo ya está.**
- **`shiftDateForTimezone()`** — fecha de turno tz-safe (ya usada en checkout/create).
- **No-show charging** (§195-§199) — outcomes administrativos con método/referencia.
- **Group payments** (§238-§242) — `paidByStayId` + `transactionGroupId` para arqueo correcto.
- **Métricas revenue** (`/v1/metrics`) — occ/ADR/RevPAR/channelMix (operacional, NO contable).
- **FX-CORE** (§103) — `ExchangeRate` Banxico + `PropertyFxRate`; base para reconciliar divisas.
- **Diseño ya escrito §85** — `CashierShift.{openingFloat, expectedClose, actualClose, variance}` Json per-divisa, `shiftId` obligatorio en CASH PaymentLog, variance>umbral requiere `varianceReason`+`reconciledById` SUPERVISOR.

**Gap real:** §85 está **diseñado pero no implementado** — no hay modelo `CashierShift`, ni `shiftId` en PaymentLog, ni UI de apertura/cierre de caja, ni los reportes contables.

---

## 3. Alcance honesto (qué entra / qué NO)

**Entra:**
- Cash drawer + apertura/cierre de turno + **arqueo diario multi-divisa** con variance + razón.
- Vínculo `PaymentLog.shiftId` (todo cobro en efectivo cae en un turno abierto).
- **Reportes contables núcleo** (los de mayor uso administrativo — ver §5).
- Export CSV de cada reporte.

**NO entra (diferido, con razón):**
- **CFDI/timbrado** (CFDI I/E/REP) → v1.0.2 CFDI-CORE (motor fiscal aparte, §89).
- **Multi-currency `PaymentFxLock` realizado** (gain/loss al payout Stripe/Conekta) → v1.0.1 PAY-CORE §81 (depende de procesador de pagos en vivo).
- **Los 12 reportes USALI formales completos** + cold-storage partition → REPORTS-CORE full.
- **GuestCredit liabilities** como pasivo contable → depende de §86 (PAY-CORE).
- Enriquecimiento `ratePlanId`/`commissionRate`/`marketSegment` → depende de RATES/PAY-CORE.

---

## 4. Decisiones de diseño (propuestas — D-CASH / D-RPT, se §-numeran al cerrar)

- **D-CASH-1 — `CashierShift` por (property, cajero, turno)**, no global. Estados `OPEN → CLOSED → RECONCILED`. `openingFloat`/`expectedClose`/`actualClose`/`variance` son **Json per-divisa** (`{MXN, USD, EUR}`) — nunca un agregado (§85). No se cierra un turno con otro abierto del mismo cajero.
- **D-CASH-2 — Todo `PaymentLog` con `method=CASH` requiere `shiftId` de un turno OPEN** (ConflictException si no hay). Métodos no-efectivo (TPV/transferencia/OTA) **no** requieren turno pero se etiquetan con el turno activo para el reporte. (§85.)
- **D-CASH-3 — Variance > umbral configurable per-property exige `varianceReason` + `reconciledById` SUPERVISOR** antes de pasar a `RECONCILED`. Append-only: el arqueo cerrado no se edita, se corrige con un ajuste nuevo (patrón §28).
- **D-CASH-4 — Devolución/cambio en otra divisa = dos `CashMovement` con mismo `transactionGroupId`** (§85). El arqueo reconcilia per-divisa, no convertido.
- **D-CASH-5 — `CashMovement` para entradas/salidas que NO son cobro de folio** (fondo de caja, retiro a bóveda, gasto menor con comprobante) — el arqueo necesita el universo completo de movimientos, no solo PaymentLogs.
- **D-RPT-1 — Reportes son SUPERVISOR+ (PII financiera)**; HOUSEKEEPER 403 (patrón §50, §128). RECEPTIONIST ve su propio arqueo de turno; el consolidado es SUPERVISOR.
- **D-RPT-2 — Todo reporte tiene export CSV** desde el día 1 (contabilidad vive en Excel). Formato estable + headers documentados.
- **D-RPT-3 — Cifras desde `PaymentLog`/`CashierShift`/`GuestStay` reales, nunca recalculadas a ojo.** Cada reporte declara su fórmula (USALI) + el filtro de fecha (día hotelero tz-safe, no `createdAt`).
- **D-RPT-4 — Reportes contables NO dependen de CFDI.** Operan sobre ingresos registrados; el timbrado es una capa posterior (v1.0.2). Así el cliente tiene control contable interno aunque aún no facture electrónicamente.

---

## 5. Reportes contables núcleo (orden por valor administrativo)

| # | Reporte | Qué responde | Fuente |
|---|---|---|---|
| 1 | **Arqueo de turno (Cashier Shift Report)** | ¿Cuadró la caja de este cajero/turno? Esperado vs real per divisa + variance + razón. | `CashierShift` + `PaymentLog(CASH)` + `CashMovement` |
| 2 | **Ingresos del día por método y divisa** | ¿Cuánto entró hoy en efectivo/TPV/transferencia/OTA, por moneda? | `PaymentLog` agrupado |
| 3 | **Cuentas por cobrar / saldos abiertos (City Ledger)** | ¿Qué huéspedes/folios deben y cuánto? (incluye overstayed §128) | `GuestStay` balances |
| 4 | **Resumen de impuestos (operacional)** | Base gravable + impuestos por tipo (IVA/ISH/DSA) acumulados — pre-CFDI. | `GuestStay`/`TaxApplicationLog` (cuando exista) |
| 5 | **No-show / cancelaciones con cargo** | Ingreso retenido vs reembolsado, por iniciador/canal. | `GuestStay` (§195-§199, Fase C) |
| 6 | **Revenue diario (resumen contable)** | Room revenue + otros, por centro/segmento (lo que haya hoy). | `PaymentLog` + `MetricsDailySnapshot` |

Reportes 1-3 + 5 son construibles **hoy** (data ya existe). 4 y 6 se enriquecen cuando aterricen TAX/RATES.

---

## 6. Desglose en sprints (estimación inicial, 1 dev)

| Sprint | Alcance | Días-dev |
|---|---|---|
| **CASH-1** | Schema `CashierShift` + `CashMovement` + `PaymentLog.shiftId` + migración. Servicio open/close/reconcile + guards (D-CASH-1..5). Tests puros del cálculo de variance. | 3-4 |
| **CASH-2** | Wiring: CASH PaymentLog exige `shiftId`; UI recepción de apertura/cierre/arqueo (multi-divisa, variance + razón). Verificación e2e del happy path. | 3-4 |
| **RPT-1** | Reportes 1-3 (arqueo, ingresos día, AR/saldos) + export CSV + RBAC. UI en `/reports`. | 4-5 |
| **RPT-2** | Reportes 5-6 (+4 si TAX listo) + consolidados + filtros de rango. | 3-4 |
| **QA** | Arqueo end-to-end con varios cajeros/divisas + revisión contable de fórmulas. | 2-3 |

**Total estimado:** ~15-20 días-dev (~3-4 sem calendar). **Bloqueante v1.0.1** para operación contable real del piloto.

---

## 7. Dependencias y riesgos

| Dependencia / Riesgo | Nota |
|---|---|
| `PaymentLog` append-only | ✅ ya cumple (§28). |
| Día hotelero tz-safe | ✅ `shiftDateForTimezone` existe; reusar (no `createdAt`). |
| FX para consolidados multi-divisa | Reconciliar **per-divisa** (no convertir) en el arqueo; conversión solo informativa con `ExchangeRate` (§103). |
| CFDI/timbrado | **Fuera de alcance** — no bloquea el control contable interno (D-RPT-4). |
| Migración de PaymentLogs existentes sin `shiftId` | `shiftId` nullable + backfill: los históricos quedan sin turno (reporte los marca "pre-arqueo"). |
| Aislar de prod | Migraciones aisladas (excluir drift `webhook_deliveries`, patrón MIGRATION-CORE). |

---

## 8. Próximo paso al retomar

1. Confirmar con el owner el **umbral de variance** y las **divisas activas** del piloto (MXN + ¿USD?).
2. Arrancar **CASH-1** (schema + servicio + tests del cálculo de variance, sin UI).
3. Verificar fórmulas con la referencia AHLEI/USALI antes de exponer cifras al cliente.
