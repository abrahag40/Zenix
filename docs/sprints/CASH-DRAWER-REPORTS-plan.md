# CASH-DRAWER-REPORTS — Arqueo + Caja + Reportes (plan SCRUM)

> **Estado:** PLAN (2026-06-14). Rama `feat/cash-drawer-reports` (off `main`). **NO mergear** hasta autorización del owner (regla 2026-06-14: desarrollar + commit en rama, sin PR/CI hasta que el owner lo pida).
>
> **Qué es:** la tajada **operativa de caja** que el piloto necesita YA. `v0.1.0` está vivo en modo *pago en recepción* — recepción cobra efectivo, pero **no hay cierre de turno ni arqueo**. Este bloque entrega: (1) **Caja/Turnos** (`CashierShift`), (2) **Arqueo** (cuadre esperado-vs-físico multi-divisa con variance), (3) **Reportes de caja** (Cashier Shift Report per-divisa + resumen diario + export CSV).
>
> **Qué NO es (queda en PAY-CORE / REPORTS-CORE completos):** cobro online Stripe/Conekta, `PaymentFxLock` realizedGainLoss contra payout reports, `GuestCredit`, los 12 reportes USALI formales, cold-storage partition >365d. Este bloque carva el sub-módulo §85 (Cash Drawer) + el sub-reporte "Cashier Shift Report per-divisa" de REPORTS-CORE.

---

## 1. Por qué ahora (justificación)

- **Gap operativo real del piloto:** sin arqueo, el hotel cobra efectivo a ciegas — al cerrar turno nadie sabe si la caja cuadra. Es el agujero #1 de un PMS en producción que ya recibe dinero. (AHLEI *Front Office* — el Cashier's Shift Report es el control diario universal de hotelería.)
- **Riesgo de fraude/error sin control:** efectivo sin reconciliación per-turno = pérdida no detectable + cero evidencia ante disputa interna. El cuadre con variance + razón + supervisor es el control estándar.
- **El esquema ya está decidido** (§85 + borrador PAY-CORE `CashierShift`/`CashMovement`) y el `PaymentLog` ya trae `shiftDate`, `collectedById` + índice `[org, property, shiftDate]`. Bajo riesgo de construcción.
- **Habilita reportes financieros básicos** que el contador del hotel pide día 1 (cuánto entró, por método, por divisa, por cajero).

---

## 2. Decisiones de diseño (D-CASH1..N) — se §-numeran en CLAUDE.md al cerrar

- **D-CASH1 — Reuso del esquema §85 ya decidido.** `CashierShift` + `CashMovement` + `CashierShiftStatus` (OPEN/CLOSED/RECONCILED/DISPUTED) + `CashMovementType` (PAID_IN/PAID_OUT/CHANGE_GIVEN/FX_CONVERSION/CORRECTION/OPENING_FLOAT) tal como el borrador `PAY-CORE-prisma-migration-draft.md`. NO redefinir.
- **D-CASH2 — Turno = por cajero (`Staff`), no por estación física.** `CashierShift.staffId`. Patrón AHLEI Cashier's Shift Report (el reporte es responsabilidad personal del cajero). Un cajero = a lo más 1 shift OPEN por property a la vez (guard).
- **D-CASH3 — Multi-divisa reconcilia per-divisa, nunca agregado (§85).** `openingFloat`/`expectedClose`/`actualClose`/`variance` son `Json { MXN, USD, EUR }`. Aritmética con `Decimal` (§14). Nunca sumar divisas distintas.
- **D-CASH4 — Enforcement gradual del "CASH requiere turno abierto".** Nuevo `PropertySettings.cashShiftRequired Boolean @default(false)`. Con la bandera **off** (estado del piloto vivo HOY) el cobro en efectivo sigue funcionando exactamente igual (cero regresión). Con la bandera **on**, `registerPayment(method=CASH)` sin shift OPEN → `ConflictException` (§85). El hotel la activa cuando su staff esté entrenado. *Honestidad: NO flippeamos el comportamiento de un producto vivo sin opt-in.*
- **D-CASH5 — Conteo a ciegas (blind drop) por DEFAULT** (ajuste R1 del estudio). El cajero ingresa el conteo físico per-divisa SIN ver el esperado. Validado como estándar anti-fraude por OPERA (`BLIND_CASH_DROP_YN`) + SOP de industria. Configurable a "conteo abierto" per-property (`cashBlindCount @default(true)`), pero arranca en ciego.
- **D-CASH6 — `variance > cashVarianceThreshold` exige `varianceReason` + reconciliación SUPERVISOR; el over/short NO se le revela al cajero al cerrar — se revela al SUPERVISOR / en el reporte de cierre** (ajuste R3, patrón OPERA: el over/short aparece solo en el Cashier Summary del night audit, no en la pantalla del cajero). Threshold per-property (`cashVarianceThreshold @default(50)` MXN, configurable). Dentro de tolerancia → RECONCILED. Fuera → CLOSED hasta que SUPERVISOR concilie (DISPUTED si se rechaza). §85 + §38.
- **D-CASH7 — El Shift Report agrega TODOS los métodos; solo CASH se reconcilia físicamente.** El reporte del turno muestra CASH + CARD_TERMINAL + BANK_TRANSFER + OTA_PREPAID + COMP por divisa (el cajero "tocó" todas las transacciones), pero la variance física aplica solo a CASH (las demás no viven en la gaveta). AHLEI: el shift report cubre todos los tender types; el drop/arqueo es solo efectivo.
- **D-CASH8 — `PaymentLog` y `CashMovement` append-only (§28).** Una corrección de caja es un `CashMovement type=CORRECTION`, nunca un UPDATE/DELETE. El void de payment ya existe (`voidsLogId`).
- **D-CASH9 — `shiftDate` timezone-safe (§12, §PAY-8).** Ya existe `shiftDateForTimezone()` en `guest-stays.service.ts` — el shift hereda el día hotelero local de la property, no `now` UTC.
- **D-CASH10 — RBAC del reporte:** SUPERVISOR ve todo; cada cajero ve su propio shift (`actor.sub === staffId`) — patrón §50 (métricas individuales privadas, no leaderboard). El rol cliente `FINANCE_AUDITOR` read-only del borrador PAY-CORE se **difiere** (usar SUPERVISOR en v1; el rol se añade en PAY-CORE completo).
- **D-CASH11 — Reuso de `CashSummaryDto`** (ya existe en `packages/shared/src/types.ts`) como base del resumen diario; se extiende con desglose per-divisa + per-método (hoy es per-collector).
- **D-CASH12 — Auto-close alert, no auto-close silencioso.** `cashShiftAutoCloseHours @default(24)`: si un shift queda OPEN > N horas, scheduler levanta `AppNotification` al SUPERVISOR (no cierra solo — cerrar un turno sin conteo físico falsearía el arqueo). Diferible a S6 si aprieta el tiempo.
- **D-CASH13 — Conteo obligatorio SOLO en fronteras naturales del turno; el arqueo "spot" es herramienta opcional y de solo lectura del SUPERVISOR** (Opción C, decisión owner 2026-06-14). El recepcionista cuenta efectivo únicamente al **recibir**, **entregar** y **cerrar** su turno — nunca hay un conteo forzado a mitad de operación. El arqueo sorpresa NO se le empuja al cajero en ninguna forma (ni modal ni notificación): lo hace el SUPERVISOR desde SU sesión como una vista read-only que muestra el esperado per-divisa del turno activo y, si quiere, registra el conteo físico que él mismo realizó (con testigo) → genera un `SPOT_COUNT` con su variance **sin cerrar el turno y sin tocar la pantalla del recepcionista**. La recepción nunca se detiene. (Apple HIG: no interrumpir tareas en progreso; NN/g H3 control del usuario.)
- **D-CASH14 — Handover de turno con cadena + doble firma (el corazón de la responsabilidad per-recepcionista).** Validado como estándar (Cloudbeds: "el saldo de cierre = saldo de apertura del siguiente turno"; AHLEI/imprest: firmar el banco al recibir + testigo al entregar). Cada turno encadena: `actualClose` del turno saliente → `openingFloat` del entrante. Campos nuevos en `CashierShift`: `openingSource` (HANDOVER | SAFE | FRESH_BANK), `handoverFromShiftId`, `openingAcceptedById` (el entrante **cuenta y acepta** el fondo recibido — aquí transfiere la responsabilidad), `closingWitnessId` (testigo del drop, opcional configurable). Flujo "recibir → mover → entregar/cerrar": (1) RECIBIR = abrir contando + aceptar el fondo (firma) → responsabilidad del entrante; (2) durante el turno = `CashMovement` (pagos efectivo in, cambios out, paid-outs, refunds); (3) ENTREGAR/FINALIZAR = contar → esperado = `openingFloat + Σ(CASH in) − Σ(cambios/paid-outs/refunds)` per-divisa → variance → o se entrega al siguiente (que lo acepta como su apertura) o se hace drop al safe. **Todo el turno es un Cashier Shift Report individual = el registro de responsabilidad del recepcionista.**
- **D-CASH15 — Modelo de fondo = banco personal (imprest) por DEFAULT.** `PropertySettings.cashBankModel` (PERSONAL_IMPREST | CARRIED_BALANCE | SHARED) @default(PERSONAL_IMPREST). Una gaveta/banco por usuario = máxima responsabilidad individual (AHLEI + recomendación explícita de Cloudbeds "one cash drawer per user"). SHARED (gaveta compartida traspasada) se soporta pero se documenta su menor accountability. El piloto arranca PERSONAL_IMPREST: cada recepcionista responde por su propio efectivo.

---

## 3. Definition of Done (DoD)

Una historia se cierra si: typecheck api+web+shared verde · tests unit del cálculo de arqueo verdes (corazón del módulo) · verificación e2e del happy path (abrir turno → cobrar → cerrar con conteo → variance correcta → reporte) · reusa primitives canónicos (DialogActions/ConfirmDialog/PaymentFields, §123/§117/§D-GRP-D1) · cero regresión con `cashShiftRequired=false`.

---

## 4. Épicas

| # | Épica | Resumen |
|---|---|---|
| **E1** | Schema + Shift lifecycle + **handover** | Modelos + migración + abrir(recibir+aceptar)/cerrar(entregar)/getCurrent/list + **cadena de handover** (`handoverFromShiftId`/`openingAcceptedById`) + modelo de banco (D-CASH15) + link `PaymentLog.cashierShiftId` + guard gradual |
| **E2** | Arqueo (reconciliation) + **spot count** | Cálculo esperado per-divisa×método desde PaymentLog+CashMovement + conteo ciego + variance + reason + supervisor + over/short oculto al cajero (R3) + **spot count del supervisor read-only sin cerrar turno (D-CASH13)** |
| **E3** | Cash movements | PAID_OUT / CHANGE_GIVEN / CORRECTION / FX_CONVERSION (paid-outs y fondo de cambio) |
| **E4** | Reportes de caja | **Cashier Shift Report individual** per-divisa/método/cajero + resumen diario + **email/print de cierre + filtros "solo sobrantes/faltantes" (R6)** + **export CSV/Excel (R7)** |
| **E5** | Frontend recepción | Recibir/entregar turno (modal conteo multi-divisa ciego) + badge de turno activo + dialog de movimiento + **handover (aceptar fondo del turno anterior)** |
| **E6** | Frontend reportes + settings | Tab "Caja" en `/reports` + **vista spot-count del supervisor** + tab "Caja" en Settings (requerido, threshold, divisas, blind, modelo de banco) |
| **E7** | QA e2e + polish | Cuadre cuadra / no-cuadra / multi-divisa / sin-turno · **handover encadenado** · spot count · auto-close alert · CSV |

---

## 5. Sprints (1 dev, incrementos verticales de ~1 semana)

### Sprint 1 — E1 Schema + Shift lifecycle + handover (backend) — ✅ CERRADO 2026-06-14 (rama `feat/cash-drawer-reports`, NO mergeado)

> **✅ Entregado:** schema (`CashierShift` + `CashMovement` + enums `CashierShiftStatus`/`CashMovementType` + `PaymentLog.cashierShiftId` nullable + 5 columnas `PropertySettings.cash*`) con IDs escalares (sin relaciones formales, §66/§204) + migración aditiva `20260621000000_cash_drawer_core` **aplicada** a la BD dev (objetos verificados). Enums/DTOs en `packages/shared` (`CashierShiftStatus`/`CashMovementType`/`CashBankModel`/`CashOpeningSource` + `CashierShiftDto`/`CashMovementDto`/`CashByCurrency`) + build de shared. Módulo `apps/api/src/pms/cashier-shift/` (`CashierShiftService` con `openShift`/`getCurrentShift`/`listShifts`/`resolveShiftForCashPayment` + controller `/v1/cashier-shifts` POST/GET current/GET list + DTOs) registrado en `app.module.ts`. Link en `registerPayment` (single + group) vía `@Optional() CashierShiftService` (cero regresión con la bandera apagada; `ConflictException` cuando `cashShiftRequired` está activo). Handover encadenado con validación de fondo recibido = cierre saliente (D-CASH14). **Verificación:** typecheck API verde · `cashier-shift.service.spec` 15/15 · guest-stays 175/175 (sin regresión) · migración aplicada + objetos confirmados · grafo de DI resuelve en arranque (`CashierShiftModule`/controller mapeados, app boota). **No verificado e2e por HTTP** (el puerto 3000 lo ocupa el dev server del owner; la lógica está cubierta por unit tests + el smoke de DI).
> **Pendiente Sprint 2:** cerrar/entregar turno + arqueo (esperado per-divisa, conteo ciego, variance, over/short oculto al cajero) + spot-count supervisor + cash movements + wire de los sitios de pago restantes (confirmCheckin + create anticipo) al turno.
- Migración: `CashierShift` (+ `openingSource`, `handoverFromShiftId`, `openingAcceptedById`, `closingWitnessId`) + `CashMovement` + enums + `PaymentLog.cashierShiftId` (nullable) + `PropertySettings.{cashShiftRequired, cashVarianceThreshold, cashShiftAutoCloseHours, cashBlindCount, cashBankModel}`. Aplicada **aislada** (excluir drift previo, patrón de los sprints de migración).
- `CashierShiftService`: `openShift(propertyId, staffId, openingFloat, {source, handoverFromShiftId, acceptedById})` (guard: 1 OPEN por cajero; si `source=HANDOVER`, valida que el `actualClose` del turno saliente = `openingFloat` aceptado) · `getCurrentShift(staffId)` · `listShifts(propertyId, range)`.
- `CashierShiftModule` registrado en `app.module.ts`.
- Link en `registerPayment`: cuando `method=CASH` → adjunta `cashierShiftId` del turno OPEN del cajero; si `cashShiftRequired && !openShift` → `ConflictException`. Guard detrás de la bandera (cero regresión off).
- DTOs class-validator. Tests del servicio (open guard, current, link, **cadena de handover**).
- **Demo:** recepcionista A abre turno con fondo → cobra CASH → entrega; recepcionista B abre aceptando el fondo de A (handover encadenado) → el PaymentLog queda ligado al shift correcto.

### Sprint 2 — E2 Arqueo + spot count + E3 Cash movements (backend) — ✅ CERRADO 2026-06-14 (rama `feat/cash-drawer-reports`, NO mergeado)

> **✅ Entregado:** función PURA `computeShiftReconciliation` (esperado per-divisa = fondo + Σ pagos CASH + Σ movimientos firmados; variance; tolerancia por divisa, D-CASH3/6) + spec exhaustivo. Servicio: `closeShift` (conteo a ciegas; dentro de tolerancia → RECONCILED, fuera → CLOSED; **R3: el over/short NO se devuelve al cajero**, solo al supervisor) · `reconcileShift` (SUPERVISOR, RECONCILED|DISPUTED + razón ≥5) · `addCashMovement` (append-only; signo derivado del tipo, PAID_OUT/CHANGE_GIVEN negativos, CORRECTION/FX_CONVERSION con `direction`; OPENING_FLOAT/SPOT_COUNT bloqueados) · `getSpotCount`/`recordSpotCount` (SUPERVISOR, read-only + auditoría SPOT_COUNT por divisa, **sin cerrar el turno**, D-CASH13) · sanitizador blind en `getCurrentShift`/`listShifts` (oculta expected/variance/razón al no-supervisor). Endpoints `/v1/cashier-shifts/:id/{close,reconcile,movements,spot-count}` (reconcile + spot-count SUPERVISOR-only). Enlazados los sitios de pago restantes al turno: anticipo de `create()` + loop de `confirmCheckin`. **Verificación:** typecheck API verde · `cash-reconciliation.spec` 10/10 + `cashier-shift.service.spec` 32/32 · guest-stays 175/175 sin regresión · DI boota + las 9 rutas mapeadas. **No verificado e2e por HTTP** (puerto 3000 ocupado por el dev server del owner).
> **Limitación honesta (TODO S3/S5):** el VOID de un pago en efectivo NO se liga al turno (no introduje lógica de reversa de caja a medias). Con la bandera activa, anular un pago CASH mid-turno produciría un falso faltante en el arqueo. Se resuelve al cablear voids al turno activo en un sub-paso antes de habilitar `cashShiftRequired` en producción (S5).
- `closeShift(shiftId, actualClose: Json, actor)`: computa `expectedClose` per-divisa = openingFloat + Σ(PaymentLog CASH) + Σ(CashMovement) ; `variance = actual − expected` per-divisa ; si `abs > threshold` → exige `varianceReason` + status CLOSED (pendiente supervisor) ; si dentro → RECONCILED. **El over/short NO se devuelve al cajero** (blind/R3): el response al cajero confirma "turno cerrado"; la variance va al SUPERVISOR / reporte.
- `getSpotCount(shiftId, actor SUPERVISOR)` (read-only): esperado per-divisa del turno activo SIN cerrarlo. `recordSpotCount(shiftId, countedJson, witnessId, actor SUPERVISOR)`: registra un `SPOT_COUNT` con variance, **sin cerrar el turno** (D-CASH13). No emite nada a la pantalla del cajero.
- `reconcileShift(shiftId, actor SUPERVISOR, decision)`: RECONCILED o DISPUTED + `reconciledById/At`.
- `addCashMovement(shiftId, type, currency, amount, notes)` append-only (PAID_OUT, CHANGE_GIVEN, CORRECTION, FX_CONVERSION).
- **Cálculo de arqueo como función pura testeable** (`computeShiftReconciliation`) — patrón `computeCancellationOutcome`/`resolveNightlyRate`. Tests exhaustivos (cuadra / sobra / falta / multi-divisa / con paid-out / con corrección / spot count sin cerrar).
- **Demo:** cerrar turno con conteo corto → variance negativa exacta + bloqueo por threshold + el cajero NO ve el over/short; el supervisor sí lo ve en su vista.

### Sprint 3 — E4 Reportes de caja (backend) — ✅ CERRADO 2026-06-14 (rama `feat/cash-drawer-reports`, NO mergeado)

> **✅ Entregado:** `getShiftReport` (Cashier Shift Report individual: apertura + origen/handover + aceptado-por + testigo, pagos por método×divisa, movimientos, y bloque de reconciliación —esperado/contado/variance/razón/conciliador/spot-counts— **omitido para el cajero**, R3) · `getCashSummary` (diario, SUPERVISOR: por divisa×método + por colector + turnos del día con variance + filtros `overShort`/`overages`/`shortages`). Resolución de nombres de staff por manual join (§204). Export CSV puro (`cash-report-csv.ts`: `shiftReportToCsv`/`cashSummaryToCsv`, RFC 4180, sectioned USALI-friendly). Controller dedicado **`CashReportController` en `/v1/cash-reports`** (`shift/:id`, `shift/:id/csv`, `cash-summary`, `cash-summary/csv`; las de summary SUPERVISOR-only). DTOs `CashierShiftReportDto`/`CashDailySummaryDto`/`StaffRef` en `shared`. **Nota:** la ruta quedó en `/v1/cash-reports` (controller cohesivo en el módulo de caja) en vez de `/v1/reports/...` para no acoplar con el `ReportsController` legacy (`@Controller('reports')`). **Verificación:** typecheck API verde · `cash-report-csv.spec` 4/4 + `cash-reconciliation` 10/10 + `cashier-shift.service.spec` 36/36 (incluye reportes) · DI boota + las 4 rutas mapeadas. **No verificado e2e por HTTP** (puerto 3000 ocupado).
> **Movido a S5 (necesita config + UI):** email/print del cierre (Drawer Closure Summary) — requiere un setting de destinatarios + la UI de Settings; se entrega con el tab de Caja. El `print` es `window.print()` del frontend (S5).
- `GET /v1/reports/cashier-shift/:shiftId` — el **Cashier Shift Report individual** (responsabilidad del recepcionista): apertura + de quién la recibió, movimientos, pagos por método×divisa, esperado, contado, variance, spot counts, conciliador. Imprimible.
- `GET /v1/reports/cash-summary?date=&propertyId=` — resumen diario per-divisa×método×cajero (extiende `CashSummaryDto`) + **filtros `overShortOnly`/`shortagesOnly`/`overagesOnly` (R6)**.
- **Email/print de cierre** (Drawer Closure Summary a destinatarios configurados, patrón Cloudbeds — R6) — reusa Resend.
- **Export CSV/Excel** de ambos (USALI-friendly, R7). RBAC §50/D-CASH10.
- Tests. **Demo:** reporte individual de un turno cerrado con variance + filtro "solo faltantes" + CSV descargable + email de cierre.

### Sprint 4 — E5 Frontend recepción — ✅ CERRADO 2026-06-14 (rama `feat/cash-drawer-reports`, NO mergeado)

> **✅ Entregado:** `cashier-shift.api.ts` (current/open/close/addMovement; propertyId derivado del JWT) + `useCashierShift.ts` (`useCurrentShift`/`useOpenShift`/`useCloseShift`/`useAddCashMovement`, React Query + toast, `retry:false` para el null). `CashDialogShell` (Radix primitives §116, DRY). `CurrencyAmountRows` (editor multi-divisa per-divisa, add/remove dinámico + `fixed` para el cierre). `OpenShiftDialog` (fondo inicial FRESH_BANK) + `CloseShiftDialog` (conteo **a ciegas** — sin esperado) + `CashMovementDialog` (tipo/divisa/monto/dirección/nota). `ShiftBadge` (gate RECEPTIONIST/SUPERVISOR; sin turno → "Abrir caja", con turno → panel con fondo + acciones), montado en `TimelineTopBar` junto a `NotificationBell`. **Verificación:** typecheck web verde + **smoke de render en navegador** (API propia en :3001 para el flujo de datos; preview web en :5199): badge renderiza en el TopBar del calendario, `OpenShiftDialog` abre con filas MXN/USD, "Agregar divisa" añade fila (re-render OK), botones Cancelar/Abrir turno; consola sin errores de mis componentes (solo 404 esperado por el proxy del preview → API 3000 sin rutas, y un 403 channex pre-existente). **Flujo de datos verificado e2e por HTTP** contra la API propia: login recepción → abrir turno → movimiento PAID_OUT (−300) → cerrar contando 1700 → **respuesta al cajero sin over/short (R3)** → reporte del supervisor con variance 0 + nombre resuelto → resumen del día.
> **Diferido:** el HANDOVER-accept UI (mostrar el cierre del turno anterior para contar+aceptar) necesita el endpoint "último turno cerrado de la propiedad" (cross-cajero) — se entrega en S5 junto al tab de Caja.
- Badge "Turno: abierto · $X en caja" en el header del PMS cuando hay shift OPEN del usuario.
- `OpenShiftDialog` (recibir turno: si hay handover, **muestra el fondo del turno anterior para contar y aceptar**; si no, fondo fresco per-divisa) + `CloseShiftDialog` (conteo **ciego** per-divisa → al confirmar el cajero ve solo "turno cerrado", NO el over/short) + `CashMovementDialog` (paid-out/cambio). Reusa `DialogActions`/`ConfirmDialog`/patrón `PaymentFields`.
- Hook `useCashierShift`. **Demo en navegador:** A recibe fondo → cobra → entrega → B acepta el fondo de A → cuadre encadenado.

### Sprint 5 — re-orientado: HANDOVER + reportes admin + settings (decisión owner 2026-06-14: modelo **gaveta compartida con traspaso**)

> El owner confirmó que los hoteles objetivo usan **gaveta compartida**: el cajero que entra RECIBE la caja del que sale, la cuenta y la ACEPTA. Eso convierte el handover-accept en la pieza CENTRAL del módulo (no diferida). "Definición de FUNCIONAL" = pasar un día con dos turnos que se traspasan + el administrador concilia y exporta. Orden de entrega:
> - **S5a (HANDOVER + correctitud) — ✅ CERRADO 2026-06-14:** endpoint `GET /v1/cashier-shifts/pending-handover` (último turno no-OPEN de la propiedad aún no traspasado; cross-cajero) + `OpenShiftDialog` handover-aware (recibe → cuenta → acepta; backend valida contado = declarado, D-CASH14; mismatch → 409) + fix arqueo NETO con void (el cálculo dejó de filtrar `isVoid` → la entrada negativa del void resta del esperado) + void de CASH ligado al turno ACTIVO del cajero. **Verificado e2e por HTTP con 2 cajeros**: A cierra 2000 → B ve "Carlos López declaró 2000" → B acepta con 1900 → 409 → B acepta con 2000 → turno HANDOVER con `openingAcceptedById`=B → pendiente consumido. Tests: cashier-shift 40/40 (handover + arqueo neto) + cash suite 55/55 · guest-stays edit/void 19/19 · typecheck api+web verdes. **Pendiente (cosmético):** captura en navegador del modo handover del diálogo (el preview proxynea a la API 3000 sin rutas; el contrato exacto que envía la UI sí está verificado por HTTP).
> - **S5b (reportes admin + settings):** tab "Caja" en `/reports` (turnos + shift report + filtros sobrante/faltante + CSV + print) + vista spot-count del supervisor + tab "Caja" en Ajustes (`cashShiftRequired`/umbral/blind/divisas/`cashBankModel` default SHARED) + email de cierre (R6, si hay config de destinatarios).

#### Sprint 5 (legacy heading) — E6 Frontend reportes + settings + spot count del supervisor
- Tab nuevo "Caja" en `ReportsPage` (lista de turnos + detalle del shift report individual + filtros sobrante/faltante + botón CSV). Patrón de tabs existente (`?tab=`).
- **Vista spot-count del SUPERVISOR** (D-CASH13): desde su sesión abre cualquier turno OPEN → ve el esperado per-divisa → registra su conteo físico (con testigo) sin cerrar el turno. NO toca la pantalla del recepcionista.
- Tab nuevo "Caja" en `SettingsPage` (`/settings/cash`): `cashShiftRequired` toggle + `cashVarianceThreshold` + divisas activas + `cashShiftAutoCloseHours` + `cashBlindCount` + `cashBankModel`. SUPERVISOR-only. Reusa framework de tabs de settings.
- **Demo en navegador:** supervisor hace un spot-count de un turno activo sin interrumpir a recepción; activa `cashShiftRequired`; ve el reporte filtrado.

### Sprint 6 — E7 QA e2e + polish
- Auto-close alert scheduler (`@Cron`, multi-tz, idempotente — patrón night audit §12). Diferible.
- Pase e2e en navegador de los 4 caminos (cuadra / no-cuadra / multi-divisa / sin-turno con flag on).
- Sales master: módulo "Arqueo de caja" con diferenciador (multi-divisa per-turno + blind count + variance auditada — pocos PMS boutique LATAM lo traen nativo).

---

## 6. Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Flippear enforcement rompe el cobro del piloto vivo | Media | Alto | `cashShiftRequired=false` por default; opt-in explícito (D-CASH4) |
| Drift de migración en BD dev (visto en sprints previos) | Alta | Bajo | Aplicar migración aislada (`db execute` + `migrate resolve`), patrón ya usado |
| Multi-divisa mal sumada | Media | Alto | Cálculo como función pura + tests exhaustivos per-divisa (D-CASH3, S2 DoD) |
| Editar enums de `packages/shared` y olvidar `npm run build` shared antes del e2e | Media | Medio | Lección documentada (memoria) — build shared antes del runtime |

---

## 7. Backlog priorizado (orden de valor)

1. **E2 (arqueo)** — el corazón; sin cuadre el módulo no tiene sentido.
2. **E1 (shift lifecycle)** — base.
3. **E4 (Cashier Shift Report)** — lo que el contador pide día 1.
4. **E5 (UI recepción)** — lo hace usable.
5. **E3 (cash movements)** — completa el realismo (paid-outs).
6. **E6 (settings + reporte UI)** — control + visibilidad.
7. **E7 (QA + auto-close)** — robustez.

---

## 8. Bitácora

- **2026-06-14** — Plan creado. Carva el sub-módulo Cash Drawer (§85) de PAY-CORE + el Cashier Shift Report de REPORTS-CORE. Esquema reusado del borrador `PAY-CORE-prisma-migration-draft.md`.
- **2026-06-14 (PM)** — Integrado el estudio de benchmark ([cash-card-accounting-pms-benchmark.md](../research/cash-card-accounting-pms-benchmark.md)) + cuestionamiento del owner. Ajustes: D-CASH5 blind drop por default (R1); D-CASH6 over/short oculto al cajero, revelado al supervisor (R3); **D-CASH13 (Opción C) conteo obligatorio solo en fronteras del turno; spot count = herramienta opcional de solo lectura del supervisor, sin interrumpir a recepción**; **D-CASH14 handover de turno con cadena + doble firma** (el hueco que el owner detectó — recibir/aceptar → mover → entregar); **D-CASH15 banco personal imprest por default**; E4 con email/print de cierre + filtros sobrante/faltante + export CSV/Excel (R6/R7). Pendiente: green-light del owner para arrancar Sprint 1 (migración de esquema sobre producto vivo).
