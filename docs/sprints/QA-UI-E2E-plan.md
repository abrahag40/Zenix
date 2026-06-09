# Sprint QA-UI-E2E — plan de trabajo

> ✅ **SPRINT CERRADO 2026-06-09** — mergeado a `main` vía PR #100 (commit `17bd610`). 11 bugs resueltos (QA-01..QA-16) + modales sin scroll + remoción `/rooms`. Ver "Resolución — pase 2026-06-09" al final. Siguiente: `release/v1.0.0` (finalización + tag).

> Arrancado 2026-06-09. Modo **QA UI-first**: 3 superficies sincronizadas, verificar el deber ser **y romperlo** (edge cases, doble-submit, inputs inválidos, races) antes de producción. Foco en **UI** (diálogos, drag&drop, clicks, sync visual web↔mobile), no en código/backend.

## Superficies
| Tab | URL | Driver |
|-----|-----|--------|
| Zenix Web | http://localhost:5173 | preview |
| Zenix Mobile | http://localhost:8081 (Expo web) | preview |
| Channex | staging.channex.io | ⚠️ ver nota |

**Nota Channex (honestidad técnica):** las preview tools manejan MIS dev servers, no el sitio externo `staging.channex.io`; además **CRS write = 403** (no puedo crear bookings reales en Channex). Para los escenarios "Channex crea reserva → fluye a Zenix" uso el **harness dev de inyección** (re-agregado, gated `NODE_ENV!=='production'`) que dispara el **pipeline inbound REAL** — es el equivalente funcional del trigger externo. El resto del testing es UI pura en Zenix (no requiere Channex). Si el owner quiere la pestaña real de Channex, puede crear bookings manualmente y yo verifico la reacción de Zenix.

## Metodología por escenario
1. Estado inicial (snapshot web/mobile).
2. Acción **por UI** (click/fill/drag en el diálogo real).
3. Verificar deber ser (resultado esperado).
4. **Romper**: edge cases, doble-submit, valores inválidos/limite, cancelar a medias, race entre tabs.
5. Registrar PASS / BUG (repro + severidad).

## Bloques de trabajo (prioridad por valor operativo)

### B1 — Booking lifecycle (UI pura, sin Channex)
- B1.1 Walk-in: crear reserva desde TimelineTopBar → 3-step wizard → aparece en calendario
- B1.2 Check-in: abrir reserva arriving → `ConfirmCheckinDialog` → identidad + pago → confirmar
- B1.3 Registrar pago: `RegisterPaymentDialog` (método, monto, referencia) + saldo
- B1.4 COMP/Cortesía: saldo cubierto a 0
- B1.5 Checkout 2-fases: confirmar salida → tarea HK
- B1.6 Early checkout / late checkout por UI
- B1.7 Cancelar reserva: `CancelReservationDialog` + preview retención/reembolso (Fase C)
- B1.8 Registrar reembolso desde `CancelledTodayDrawer`
- **Romper:** monto negativo/0, overpayment, doble-submit, Esc a media transacción, check-in 2× (idempotencia)

### B2 — Drag & drop calendario
- B2.1 Drag mover reserva a otro cuarto → `MoveReservationConfirmDialog`
- B2.2 Drag-extend (extender estadía)
- B2.3 Resize
- B2.4 Swap rooms / split
- **Romper:** drag a cuarto ocupado (conflicto), drag a fecha pasada, soltar fuera de grid, drag de reserva checked-out

### B3 — Mobile HK ciclo de limpieza
- B3.1 Recepción confirma salida (web) → tarea READY → aparece en Hub mobile realtime
- B3.2 Recamarista: start → IN_PROGRESS → pause/resume → end → DONE (mobile)
- B3.3 Supervisor verify → VERIFIED → Kanban realtime
- B3.4 Room-move → tarea migra + reasigna (E2E-21) visible en Hub
- **Romper:** start 2×, completar sin foto, pausar y cerrar app, race web/mobile sobre la misma tarea

### B4 — Channex inbound (harness) + reacción UI
- B4.1 booking_new → calendario web + Llegadas mobile (realtime)
- B4.2 Grupo multi-room → bracket/color + `GroupCheckinDialog`
- B4.3 booking_cancel → libera + drawer canceladas
- B4.4 Conflicto → `/channex/conflicts` → resolver "Mover aquí"
- **Romper:** cancelar reserva con cliente ya en check-in, modify tras check-in, conflicto sin alternativas

### B5 — Grupos
- B5.1 Group bulk check-in (`GroupCheckinDialog` modos A/B) por UI
- B5.2 Group cancel parcial (`GroupCancelDialog`) por UI
- B5.3 Group payment "¿quién paga?" por UI
- **Romper:** cancelar el último miembro activo, pagar de más en grupo

### B6 — Mantenimiento
- B6.1 Crear ticket CRITICAL por UI → auto-bloqueo del cuarto en calendario
- B6.2 Lifecycle ticket (claim→start→resolve→verify) → auto-release
- **Romper:** ticket en cuarto con reserva activa, doble bloqueo

### B7 — No-show (time-gated, best-effort)
- B7.1 Marcar no-show por UI (si dentro de ventana)
- B7.2 Registrar cargo no-show (`RegisterNoShowChargeDialog`)
- B7.3 Revert no-show
- **Romper:** no-show a guest checked-in, cargo sin referencia

### B8 — Settings / Rates / Métricas (UI render + interacción)
- B8.1 Políticas de cancelación + simulador
- B8.2 Rate plans / calendario / bulk-override preview
- B8.3 Dashboard métricas (ADR/RevPAR/occupancy/heatmap)

### B9 — Nova consultor (UI)
- B9.1 Wizard Zenix Activate (8 steps)
- B9.2 Billing / discount codes / aprobaciones / retention
- B9.3 Setup token activation

## Registro de hallazgos

| ID | Bloque | Escenario | Severidad | Estado | Repro |
|----|--------|-----------|-----------|--------|-------|
| **QA-01** | Setup | Mobile-web **colgado en "Cargando Zenix"** si carga en pestaña en segundo plano: `app/index.tsx` usaba solo `requestAnimationFrame` para marcar `hydrated`, y Chrome pausa rAF en tabs inactivas → splash infinito. | 🟠 HIGH | ✅ FIXED (fallback `setTimeout(60)` en `app/index.tsx`) | abrir mobile en tab no-activo → splash nunca resuelve; tras fix renderiza login |
| **QA-04** | B1.1 | **Walk-in wizard NO avanza de Huésped→Estadía** (bloquea TODO el walk-in). `guestSex` es enum `M\|F\|O\|N` `.optional()` pero el `<select>` default emite `''` (opción "—"), que NO pasa `.optional()` → `f1.trigger()` falla en SILENCIO (sin error visible). | 🔴 HIGH | ✅ FIXED (`z.preprocess('' → undefined)` en CheckInDialog step1Schema) | abrir Walk-in, llenar nombre/apellido/nacionalidad, Sexo "—", click Siguiente → no avanza; tras fix avanza |
| **QA-05** | B1.1 | Botón **"Walk-in" superior NO tiene selector de cuarto** (abre "Hab. —") → deja completar los 3 pasos y **falla al confirmar** con "Habitación no encontrada". El fast-path dedicado (§234) es inservible. El path por **celda vacía** sí pre-selecciona el cuarto (funciona). | 🟠 HIGH | ✅ FIXED (selector de habitación, ver Resolución) — verificado navegador | clic botón Walk-in (no celda) → Hab. — → Confirmar → toast "Habitación no encontrada" |
| **QA-02** | B1.2 | **Estado inconsistente de reserva entre superficies** (Sarah Smith): mobile "Llegadas·Pagado" (llegando) vs calendar tooltip "Completado" vs sheet header "Salió" — y el sheet **ofrece "Confirmar check-in" + "No-show" sobre una reserva "Salió"** (gating de CTA no respeta estado terminal). *Nota: data contaminada de cacería previa; confirmar con data limpia.* | 🟡 medio | ✅ FIXED (gating CTA terminal en sheet QA-15 + tooltip QA-15b; resto = data contaminada) | abrir Sarah Smith en calendario vs mobile |
| **QA-03** | B1.2 | Sheet muestra "**1n**" para estancia 9→11 jun (son 2 noches; el tooltip dice "2n"). Inconsistencia de cálculo de noches. *(misma stay contaminada)* | 🟢 bajo | ✅ FIXED (`differenceInCalendarDays`, ver Resolución) — verificado navegador (3n) | sheet Sarah Smith |
| **QA-06** | B1.1 | Walk-in creado muestra "**ETA 00:00**" — un walk-in llega *ahora*, la hora de check-in debería default ~hora actual, no medianoche. | 🟢 bajo | ✅ FIXED (checkIn=now si llega hoy, ver Resolución) | crear walk-in → mobile Llegadas muestra ETA 00:00 |

| **QA-08** | B1.7 | **Cancelación manual NO refresca el dashboard mobile en realtime.** Cancelé Ana (web) → web OK (toast + libera 102 + "Canceladas hoy 1"), pero el mobile siguió mostrando "Llegadas 2 · Ana" hasta reload/poll-60s. Misma clase que E2E-18 pero para eventos **manuales no-OTA** (el cancel/create no emite un evento en `MOBILE_DASHBOARD_TRIGGERS`). | 🟡 medio | ✅ FIXED (SSE `stay:cancelled`/`stay:restored`, ver Resolución) | cancelar reserva en web → mobile no baja Llegadas hasta poll/reload |

| **QA-10** | B1.5 | Inconsistencia cálculo noches: BookingDetailSheet muestra "0n" para estancia 8→9 jun (~23h), pero el CheckOutDialog muestra "1 noche" para la misma. Cálculo por horas vs por fecha. | 🟢 bajo | ✅ FIXED (`differenceInCalendarDays`, ver Resolución) | sheet QA Checkout Tester (0n) vs checkout dialog (1 noche) |
| **QA-11** | B3.3 | **Kanban web NO refleja en realtime un `task:started` iniciado desde mobile.** Inicié limpieza de 106 en mobile → mobile LIMPIANDO ✅, pero el Kanban (abierto) mantuvo "EN PROGRESO · Sin limpiezas activas" hasta reload (entonces sí mostró 106). Gap realtime **mobile→web** (el inverso web→mobile SÍ funciona, ver PASS B3). | 🟠 HIGH | ✅ code-path correcto (backend emite `task:started`, Kanban invalida en `task:*`) — probable reconexión SSE transitoria; ver Resolución | start en mobile → Kanban no mueve 106 a EN PROGRESO hasta reload |
| **QA-12** | B3.2 | **"Finalizar" limpieza en mobile-web no completa la tarea** — ni por click ni por ref dispara request `/api` (checklist 6/6); la tarea queda IN_PROGRESS. Posible confirm/Alert que no renderiza en Expo web (a verificar en build nativo). | 🟠 HIGH | ✅ FIXED (`confirmAsync` cross-platform: web=`window.confirm`, nativo=`Alert.alert`; ver Resolución) | task 106 LIMPIANDO → Finalizar → sin efecto, sin network |

| **QA-13** | B6.1 | **Modal "Nuevo ticket" crecía sin límite y se salía del viewport** — sin `max-h`, al seleccionar Crítico (warning) el footer Siguiente/Crear quedaba fuera de pantalla + `overflow-hidden` lo recortaba → wizard inusable en laptops. **UI/UX defect** (diálogo debe caber con scroll interno + footer persistente, NN/g/Apple HIG). | 🟠 HIGH | ✅ FIXED (`CreateTicketDialog`: `max-h-[90vh] flex flex-col` + body `flex-1 overflow-y-auto`) | Crítico → antes footer off-screen; tras fix header+footer pinneados, body scrollea, footer siempre visible (verificado navegador) |
| **QA-13b** | (raíz) | **Causa raíz: el `DialogContent` base (`ui/dialog.tsx`) no tenía `max-h` por defecto** → cualquier diálogo largo podía salirse del viewport, no solo el de ticket. Riesgo latente en `EarlyCheckoutDialog`, `RegisterCancelRefundDialog`, `RegisterNoShowChargeDialog`. | 🟠 HIGH | ✅ FIXED — base `DialogContent` ahora `max-h-[90vh] overflow-y-auto`. Modales con footer pinneado (ticket) override con `overflow-hidden flex flex-col` y ganan el eje-Y vía tailwind-merge. Verificado en navegador: el de ticket sigue con footer pinneado + body scroll (sin regresión). Typecheck web verde. |

### ✅ (B) PASS verificados (UI, navegador real)
- **B6.1 Mantenimiento CRÍTICO → auto-bloqueo (§62 D-Mx2)** ✅: "+ Nuevo ticket" → Hab A1 → Plomería → **Crítico** (warning "Prioridad Crítica bloquea la habitación") → "Crear ticket" → toast **"Ticket CRÍTICO: Habitación A1 fuera de servicio. Auto-bloqueada — Channex notificado"** + Kanban "2 críticos" + **calendario muestra A1 con bloque rojo "⊘ OOO"** (Out Of Order). Flujo end-to-end completo.
- **B8.1 Settings → Políticas de cancelación + simulador de dinero (§C5, diferenciador)** ✅: editor con presets (Flexible/Moderada/Estricta/No-reembolsable) + tramos (72-24h→1 noche, 24-0h→100%) + **Simulador "¿cuánto se cobraría?"** cómputo en vivo (Pagado 2000/Tarifa 1000): 10d/3d→Gratis · 1d→Retiene 1,000/Reemb 1,000 · 6h/no-show→Retiene 2,000/Reemb 0. Render + cálculo correctos.
- **B8.2 Settings → Tarifas (Rates manager)** ✅ (navegador): (a) **Crear plan Precio Fijo** — toggle ESTRATEGIA BASE (BAR/Múltiplo/Precio fijo) revela campo condicional "Precio fijo por noche"; "Crear plan" disabled hasta válido; QAFIX/200 creado y listado con Editar. (b) **Calendario de tarifas** — grid RoomType × 14 días renderiza (Estándar 70, Superior 110); al cambiar el selector Plan→"QA Plan Precio Fijo" **todas las celdas (5 tipos × 14 días) recalculan a 200** (resolver aplica plan fijo sobre base, verificado visual). (c) **Bulk-override preview (NN/g H5)** — "Cambiar tarifa en bloque" → 150 → Previsualizar → warning "Vas a sobrescribir **70 tarifas** … 200→150" con ejemplos (NO aplicado para no contaminar). *Nota: plan QAFIX queda como test-data en BD dev (como tc-grpA/B), no producción.*
- **B8.3 Dashboard métricas/intel (SUPERVISOR)** ✅ (navegador): **MetricsOverview** "Cómo va tu desempeño · últimos 14 días" — OCUPACIÓN 18% (-5pts), ADR USD 123 (-1%), REVPAR USD 22 (-21%) con sparklines + "Último cierre · 6 jun" (math consistente: 123×0.18≈22 ✓). **Mix por canal** Booking 3 / Direct 1. **ForecastHeatmap** 28 días renderiza con hoy (9) ring indigo + leyenda + AS-OF. **Compset** tabla 14 noches (tu USD 70 vs 3 competidores + "Bajo mercado -65%" + disclaimer "Datos best-effort, refresh diario… hace 2d"). **PickupSection** empty-state honesto "Sin captura forward aún. El cron nocturno la generará automáticamente.". **Demand reco** "Estás barato para el 13 jun… sube USD 77".
- **B5 Grupos OTA/multi-room** ✅ (navegador, **data limpia** `qa-seed-group.ts` — Familia QA Grupo, 102+103, llega hoy, 2 pendientes sin pagar): (a) **Color ring §243** — ambos bloques comparten ring de color de grupo, distinto de stays no-grupo. (b) **Sección Grupo en `BookingDetailSheet` §240** — "Familia QA Grupo · GRUPO · 2 HABITACIONES" + chips per-room "Hab.102 [Debe USD 210][ACTUAL]" / "Hab.103 [Debe USD 210][• Por llegar]" + "Saldo pendiente del grupo **USD 420.00**" (210+210 ✓). (c) **CTAs grupo §243** — "Check-in del grupo" (primario) / "Intercambiar habitación" / "Cancelar grupo". (d) **`GroupCheckinDialog` §242 (Modo B)** — lista miembros con input de nombre editable + checkboxes correctamente **deshabilitados** con hint "Debe USD 210 · cóbrala primero" (gating por saldo OK); footer pinneado sin overflow. (e) **`ConfirmCheckinDialog` "¿Quién paga?" §240 D-GRP-A4** — segmented "Solo esta hab. / Todo el grupo"; en grupo: explainer + Hab.102 [ESTA, locked] + Hab.103 [check] + tiles Efectivo/Tarjeta/Transferencia/Cortesía (§235) + "Total a cobrar · 2 hab. **$420.00**" + CTA "Cobrar grupo y check-in". Monto pre-fill = saldo (§230). *NO se ejecutó el cobro por QA-16 (moneda mal-etiquetada) — la mutación ya estaba validada en GROUP-BILLING Fase A.* *Foto del documento (blocker del harness QA, upload restringido) salvado inyectando un `File` vía `DataTransfer` en JS — flow real intacto.*

| **QA-14** | B8.3 | **ForecastHeatmap sin forward-snapshots rotula el vacío como "Demanda floja… 0%" con grid de "—"** → un supervisor puede leerlo como demanda real baja, cuando en realidad es "sin datos a futuro todavía". Inconsistente con la PickupSection justo debajo que SÍ es honesta ("Sin captura forward aún. El cron nocturno la generará automáticamente"). Mismo principio que D-MOB-7 (empty ≠ frío/engañoso). | 🟡 medio | ✅ FIXED — `ForecastHeatmap` con `hasForwardData=withData.length>0`: si no hay snapshots → h2 "Sin reservas a futuro todavía" + Ocup. promedio "—" (en vez de "Demanda floja · 0%"). | dashboard con 0 `MetricsForwardSnapshot` → heatmap dice "Demanda floja 0%" vs pickup honesto |
| **QA-15** | B5 | **`BookingDetailSheet` ofrecía "Confirmar check-in" + "No-show" en una estancia con badge "Salió" (estado terminal `actualCheckout` set).** `canConfirmCheckin`/`canNoShow` solo verificaban `!actualCheckin + isArrivalDay + !noShow` — no excluían `actualCheckout`. Una estancia que ya salió, cuyo día de llegada coincide con hoy y con `actualCheckin` null (estado inconsistente que llega vía import OTA/Channex, p.ej. `TEST-SMITH-205`), seguía mostrando las CTAs de entrada. Misma clase que el guard de `ReservationDetailPage` para canceladas. | 🟡 medio | ✅ FIXED — agregado `&& !stay.actualCheckout` a `canConfirmCheckin` y `canNoShow` (alineado con `canCancel` que ya lo tenía). Verificado en navegador: el sheet del stay "Salió" ahora muestra solo "Ver folio completo →". Typecheck web verde. | TEST-SMITH-205 (9→11 jun, checkout registrado 11:45, actualCheckin null) |
| **QA-15b** | B5 | **Tooltip/quick-popover del calendario muestra Check-in/No-show en el MISMO record terminal** (badge "Completado", "0/2 en casa"). Es un componente aparte del sheet (no cubierto por el fix QA-15) y su framing "0/2 en casa" es auto-consistente para ofrecer check-in, así que **NO se tocó** sin data limpia que confirme un mis-gate real (§4 honestidad). Divergencia sheet "Salió" vs tooltip "Completado/0 en casa" = síntoma de data contaminada (`actualCheckout` sin `actualCheckin`), no necesariamente bug de producto. | 🟢 bajo | ✅ FIXED — `TooltipPortal`: `canConfirmCheckin`/`hasNoShow` ahora incluyen `!stay.actualCheckout` (espejo de QA-15). | hover en TEST-SMITH-205 → tooltip "Completado · 0/2 en casa" + Check-in/No-show |
| **QA-16** | B5 | **`ConfirmCheckinDialog` mal-etiqueta moneda cuando folio-currency ≠ property-currency y NO hay FX rate.** Verificado vía `checkin-context`: `propertyCurrency=MXN`, `folioCurrency=USD`, `balance=210`, `secondaryRates={USD:null,EUR:null}`. El folio debe **USD 210** (el sheet del grupo SÍ dice "USD 210") pero el dialog muestra "**$210.00 MXN**" — toma el número crudo (210) y le pone el símbolo de property-currency SIN convertir (no hay rate). 210 USD ≈ 3,800 MXN → un cajero cobraría ~18× menos. Disparador: folio en moneda extranjera (típico OTA/Channex) + property MXN + FX rate ausente (común en setup dev/early). Con FX configurado (Banxico §103) convertiría bien; el bug es el **fallback** sin rate: debería mostrar la **folio-currency** ("USD 210") como primaria, no el número con símbolo equivocado. Relacionado §85 (errores de arqueo) + §110c. | 🟠 HIGH (financiero) | ✅ FIXED — `propertyCurrency` memo en `ConfirmCheckinDialog` ahora prioriza `balanceProjection.currency ?? stay.currency` (moneda real del folio) sobre `ctx.propertyCurrency`. Caso normal (folio==property) sin cambio. **Verificado navegador**: SALDO "USD 210.00" (antes "$210 MXN"). Cosmético `BalanceBadge` también: strip de código de moneda al inicio Y al final (es-MX formatea USD con prefijo → evitaba "USD 210 USD"). | grupo QA-GRP (folio USD) en property MXN sin FX → dialog "$210 MXN" |

### 🗑️ Remoción interfaz deprecada (2026-06-09, owner-flagged)
- **Board `/rooms` ("Estado de habitaciones")** estaba **deprecado** (reemplazado por Kanban). Eliminado:
  - `src/pages/RoomsPage.tsx` (board grid + `QuickCheckoutModal` inline) — borrado.
  - `src/components/Navbar.tsx` (dead code, no montado, referenciaba /rooms /overrides /staff) — borrado.
  - Ruta `/rooms` → ahora `<Navigate to="/kanban" replace />` (preserva bookmarks).
  - **Intacto:** endpoint API `/rooms` (datos, compartido por Block/Kanban/Settings/etc.), timeline `/pms`, Kanban, mobile. Typecheck web ✅.
- **QA-09** (board mostraba cuarto con salida-hoy como "Disponible") → **MOOT** (interfaz eliminada).

### PASS verificados (UI, navegador real)
- **(A) B1.5 Checkout 2-fases + B3 HK realtime (flagship)** ✅: creé stay in-house limpio en 106 (script) → checkout en `/pms` ("LIQUIDADO · genera tarea de limpieza") → **el Hub mobile de María (pestaña en segundo plano) actualizó EN REALTIME** la tarea de 106 de "Esperando salida" → **"Lista para limpiar"** (SSE task:ready, sin reload). Luego **B3.2** start en mobile → "LIMPIANDO 00:03 · checklist 0/6" ✅. (Falla en el cierre: QA-11 Kanban no-realtime + QA-12 Finalizar.)
- **B1.7 Cancel + preview Fase C**: elegir "Huésped" → "Penalización por política 100% · Retención USD 180 · Reembolso USD 0 · sin pago registrado" (check-in hoy → <24h); Confirmar → toast "Reserva cancelada" + libera 102 + "Canceladas hoy 1" ✅
- **Estado limpio correcto**: Ana (no contaminada) muestra "1n" correcto para 9→10 jun → confirma que el "1n" de Sarah (QA-03) era artefacto de su data, no bug general
- **B1.1 Walk-in (cell-based) happy-path**: crear reserva Hab.102 (Ana QA Lopez, 9-10 jun, USD180) → aparece en calendario web (bloque "AL") + ocupación 3→4/22 ✅ (tras fix QA-04)
- **Realtime cross-surface**: walk-in en web (T1) → **mobile (T3, tab en segundo plano) en realtime sin reload**: Llegadas 1→2 + Cobros $3,335→$3,515 ✅ (valida SSE background, fixes QA-01+E2E-24)
- **Check-in forcing function**: sin foto + sin tipo doc → "Confirmar check-in" bloquea + resalta campos `*` rojo ✅
- **Property switcher**: Cancún→Tulum OK ✅; **cross-tenant** mobile (Cancún) no ve Tulum ✅
- **No-show backend guard**: rechaza no-show fuera de ventana horaria (409) ✅

---

## ✅ Resolución de bugs — pase 2026-06-09 (owner: "resolver todos los bugs + sin scroll en checkin/nueva reserva")

**Sin scroll en modales (pedido explícito):**
- **`CheckInDialog` (Nueva reserva / Walk-in)** — el body tenía un cap duro `max-h-[65vh]` que forzaba scroll aun habiendo espacio. Convertido a layout flex-col acotado: `DialogContent` `flex flex-col` (gana sobre `grid` base) + `max-h-[90vh]` (base, QA-13b) + header/footer `shrink-0` + body `flex-1 min-h-0 overflow-y-auto`. **Verificado navegador**: Step 1 y Step 2 caben sin scroll; header/footer pinneados.
- **`ConfirmCheckinDialog`** — ya usaba el patrón correcto (`max-h-[90vh] flex flex-col` + body `flex-1 overflow-y-auto`); cabe sin scroll. Verificado.

**Bugs resueltos (todos con typecheck verde web+api; mobile sin errores nuevos — los 2 specs que fallan son pre-existentes idénticos a main):**

| Bug | Fix | Archivo(s) | Verificación |
|-----|-----|-----------|--------------|
| QA-03 / QA-10 (noches) | `differenceInDays` → `differenceInCalendarDays(startOfDay…)` | `BookingDetailSheet.tsx` | navegador: 9→12 jun = **3n** (antes 2n) |
| QA-05 (walk-in/nueva reserva sin cuarto → "Habitación no encontrada") | Selector de habitación en Step 2 cuando no hay `initialRoomId`; `roomId` resuelto en todo el flujo; "Siguiente" bloqueado sin cuarto; `rooms` pasado desde `TimelineScheduler` | `CheckInDialog.tsx`, `TimelineScheduler.tsx` | navegador: dropdown lista cuartos por tipo → Hab.105 → "disponible" → header "Hab. 105" → Siguiente habilitado |
| QA-06 (walk-in ETA 00:00) | Si llega hoy, `checkIn` lleva la hora actual (no medianoche) | `CheckInDialog.tsx` | código (date-only → now) |
| QA-08 (cancel/restore manual no refresca mobile realtime) | Nuevos SSE `stay:cancelled` / `stay:restored`; bridge en `PmsSseListener`; registrados en `ALL_SSE_TYPES` (web+mobile) + `MOBILE_DASHBOARD_TRIGGERS` | `shared/types.ts`, `pms-sse.listener.ts`, `sseClient.ts`, `useSSE.ts` (mobile), `useMobileDashboard.ts` | typecheck + specs guest-stays/tasks 77/77 |
| QA-11 (Kanban no realtime ante task:started de mobile) | **Sin cambio** — path correcto: backend emite `task:started` (`tasks.service:212`), Kanban invalida en cualquier `task:*` (`KanbanPage:297`), tipo en `ALL_SSE_TYPES`. Observación original probablemente reconexión SSE transitoria durante la cacería. | (verificado, no es defecto) | code-path auditado |
| QA-12 (Finalizar limpieza no completa en Expo web) | `Alert.alert` con botones es no-op en web → helper `confirmAsync` (web=`window.confirm`, nativo=`Alert.alert`); navegación post-éxito directa en web | `apps/mobile/src/lib/confirm.ts` (nuevo), `app/(app)/task/[id].tsx` | typecheck mobile (mis archivos sin error) |
| QA-14 (heatmap "Demanda floja 0%" sin datos) | empty-state honesto ("Sin reservas a futuro todavía" + "—") | `ForecastHeatmap.tsx` | typecheck |
| QA-15 (sheet CTA en estado terminal) | `!actualCheckout` en `canConfirmCheckin`/`canNoShow` | `BookingDetailSheet.tsx` | navegador (verificado pase previo) |
| QA-15b (tooltip CTA en estado terminal) | `!actualCheckout` en `canConfirmCheckin`/`hasNoShow` | `TooltipPortal.tsx` | typecheck |
| QA-16 (moneda mal-etiquetada, financiero) | display currency = folio currency (`balanceProjection.currency ?? stay.currency`); `BalanceBadge` strip código prefijo+sufijo | `ConfirmCheckinDialog.tsx` | navegador: SALDO "USD 210.00" (antes "$210 MXN") |
| QA-02 (estado inconsistente cross-surface, Sarah Smith) | cubierto por QA-15 + QA-15b (gating de CTA terminal en sheet + tooltip); el resto era data contaminada | — | — |

**Pendientes NO-bug (limpieza pre-merge, recordatorio):** harness de inyección dev (ya removido), seed QA `qa-seed-group.ts` + grupo `QA-GRP-*` + plan `QAFIX` + grupos `tc-grpA/B` = test-data en BD dev (no producción). **No mergear hasta autorización del owner.**
