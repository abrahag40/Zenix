# Sprint CHECK-IN-α — Plan formal

> **Status:** Propuesta lista para implementación · **Autor del research:** sesión 2026-05-16 · **Sprint estimado:** 2-3 días de UX/UI + 1 día de hardening backend (OTA detection + idempotency)
>
> **Precede:** `CANCEL-ARCHIVE` (PR #32 cerrado) — reusa `useModalDismiss`, patrón de spacing 8pt, modal-vs-drawer learnings.
> **Bloqueante de:** release `v1.0.0` (item "CHECK-IN modal redesign" listado en CLAUDE.md como "Recomendado, 1-2 días").
> **Sigue antes:** `CHANNEX-INBOUND` (decidido en sesión 2026-05-16) — pero comparte ningún archivo, pueden ir en paralelo si hay capacity.

---

## 0. Resumen ejecutivo

El módulo de check-in de Zenix tiene **backend sólido (todos los guards Sprint 8E ya están wired en `guest-stays.service.ts:1872-2054`)** pero **frontend desfasado del estándar boutique-PMS 2026**. La auditoría comparativa de 6 PMS (Mews, Cloudbeds, Opera Cloud, Little Hotelier, RoomRaccoon, Clock PMS+) revela que **5 de 6 tratan check-in como una transición de estado de 1-2 clicks**, no como un wizard. Solo Opera (legacy enterprise) usa wizard de 7-12+ clicks — y es el más odiado en reviews (Jorge C., Capterra 2025: *"you have to process 5000 clicks more than in V5"*).

Zenix hoy está más cerca de Opera (4-step wizard de 8+ clicks) que de la cohorte boutique. Este sprint **colapsa el wizard a un single-screen con progressive disclosure**, manteniendo el cumplimiento fiscal LATAM (CFDI requiere ID, USALI requiere evidencia de pago, Visa 13.1/13.7 requiere registro de auth code).

**Decisión de diseño nuclear:** *single-screen con secciones colapsables ordenadas por urgencia, no wizard de pasos*. Citación: NN/g "Wizards: definition and design recommendations" (2024) — wizards son apropiados solo para tareas de >20min ejecutadas <1×/semana. Check-in es <2min ejecutado >20×/día → wizard es anti-patrón aquí.

**Métrica objetivo:** **2-3 clicks** "lista de arribos → checked-in" en happy path (paridad Cloudbeds + Clock PMS+, los líderes en velocidad). Tiempo objetivo p50 = 35 segundos por check-in (vs ~90 segundos del wizard actual).

---

## 1. Research base — qué hace cada competidor

### 1.1 Matriz comparativa de procesos

| PMS | Clicks happy-path | Patrón UI | Wizard? | Paga gate? | OTA auto-skip? | Walk-in consolidado? |
|-----|-------------------|-----------|---------|------------|-----------------|------------------------|
| **Cloudbeds** | **2** | Side drawer + dual CTA | No | No | Sí (no hay gate) | Sí (toggle "auto check-in on save") |
| **Clock PMS+** | **2** | Detail page + botón top | No | No | Sí | Sí (drag-create + Check In) |
| **Little Hotelier** | **3** | Status dropdown bottom-right | No | No | Sí | Sí (mismo screen) |
| **RoomRaccoon** | **3-4** | Color-coded calendar + botón | No | Visual flag, no hard | Sí (deposit negativo) | Sí (source = walk-in) |
| **Mews** | **3-4** | Timeline + split-screen panel | Light (no stepper) | Staff judgment | Manual | Parallel "New booking" en Timeline |
| **Opera Cloud** | **7-12+** | Full-page accordion wizard | **Heavy** (5-10 panels) | **Hard gate** | Pre-fill, no skip | **Separado** ("Create Walk-In Reservation") |
| **Zenix actual** | **6-8** (4 pasos × 2 botones promedio) | Modal `max-w-lg` (~512px) + stepper numérico | **Heavy** (4 pasos) | **Hard gate** | Manual (método OTA_PREPAID) | Dialog separado (`CheckInDialog` vs `ConfirmCheckinDialog`) |

**Conclusión:** Zenix está alineado con Opera (el más lento + más odiado) en lugar de con la cohorte boutique. Hay que corregir.

### 1.2 Lo que la gente AMA (verbatim, top 5)

> **"Check in online, Check in the lobby, in the room everywhere."**
> — Michael B., GM, Capterra 2017 (sobre Mews)

> **"the housekeeping application of real time clean rooms is my personal favourite as its not only made our checkin faster"**
> — Gregory N., Sales Manager, Capterra 2016 (Mews)

> **"The payment gateway is perfect and the team do not waste time anymore entering charges in the CC device."**
> — Verified Reviewer, Capterra 2018 (Mews)

> **"Cloudbeds is super flexible and easy to access from anywhere, wasy to checkinn guests"**
> — Front Desk Supervisor, 25-49 room boutique, Hotel Tech Report

> Cloudbeds *"feels like a Property Management System for today's age"* — patrón "accessibility + intuitive" repetido en múltiples reviews HTR.

**Patrón nuclear:** velocidad + auto-charge + housekeeping visible + mobile-first.

### 1.3 Lo que la gente ODIA (verbatim, top 10 universales)

1. **Demasiados clicks** — "Opera: 5000 clicks more than V5" (Jorge C., Capterra 2025); Mews: "5 different windows until you gather all the data" (Jorge C., 2025); Mews aggregated: *"the system overcomplicates basic tasks, requiring multiple clicks and separate pages"* (G2 aggregate)
2. **Carga lenta en el momento del check-in** — Opera "3-5 minutes to log in every morning" (Juan A., 2020); Cloudbeds "2-3 mins to load a page" (Trustpilot); Little Hotelier "have to reload after doing only 3 things" (Kerry K., 2025)
3. **OTA virtual card bugs** — Mews charges personal card instead of VCC, *"daily manual checks and cancellation of incorrect payment rules"* (community thread)
4. **Split charges no soportado** — **780 votos abierto desde 2018 en Mews community**, marked Pending; *"This issue has been dragging on for so long; they obviously aren't able to develop it"* — Leif Penning, abril 2026
5. **Group check-in disperso** — Cloudbeds: *"scattered and inaccurate allocations"*; Little Hotelier: dificultad con split reservations
6. **ID scanning roto** — Mews kiosk passport scan no funciona desde Oct 2023 (community thread con 5+ usuarios reportando)
7. **Walk-in flow undefined** — Mews community: *"currently it can only be assumed that same-day reservations are walk-ins"*
8. **Billing separado del checkout** — Mews: *"separate screen for closing the bill and check out"* (Danny V.); 174 votos por "Go back to old Billing"
9. **2FA en frente del huésped** — Opera *"horrible — waiting 2 minutes for a code while a guest stands at the desk"*
10. **System downtime** — RoomRaccoon: *"half the time the system is down and it's impossible to check in guests"* (Trustpilot)

### 1.4 Mews feature requests con vote count (priorización implícita del mercado)

| Feature | Votos | Status | Implicación para Zenix |
|---------|-------|--------|-------------------------|
| Split charges on bill | **780** | Pending 8 años | v1.0.1 PAY-CORE — diferenciador real |
| Create bookings from timeline | 479 | Released | ✅ Zenix ya lo tiene |
| Expand room status options | 253 | Open 5+ años | ✅ Zenix tiene 6 estados granulares |
| Mews ID Scanner in Navigator | 97 | On roadmap | v1.1+ |
| Pre-arrival email template | 89 | Released | Tenemos pre-arrival WhatsApp en Sprint 8 |
| TETRIS blank space | 76 | Released | v1.1+ (low priority) |
| Companions → reservation owners | 38 | Released | v1.1+ Guest CRM |

---

## 2. Estado actual de Zenix — gaps detectados

### 2.1 Frontend

| ID | Gap | Archivo:línea | Severidad |
|----|-----|----------------|-----------|
| FE-1 | Modal `max-w-lg` (~512px) demasiado angosto para 4-step wizard con grids | `ConfirmCheckinDialog.tsx:572` | 🔴 Alto |
| FE-2 | Wizard de 4 pasos contradice patrón boutique-PMS (1-2 clicks) | `ConfirmCheckinDialog.tsx:61-66` | 🔴 Alto |
| FE-3 | `useModalDismiss` hook NO aplicado (estándar post §98) | Ambos dialogs | 🟠 Alto |
| FE-4 | Spacing inconsistente (`gap-1.5/2/3` mezclado) — no 8pt baseline | Ambos dialogs | 🟠 Medio |
| FE-5 | OTA prepaid NO se auto-detecta — usuario debe seleccionar método manualmente | `ConfirmCheckinDialog.tsx:159` | 🔴 Alto |
| FE-6 | `documentNumber` sin máscara visual en el input | `ConfirmCheckinDialog.tsx:290` | 🟡 Medio (GDPR) |
| FE-7 | Sin feedback de idempotency — error genérico si `actualCheckin !== null` | UI gen | 🟡 Medio |
| FE-8 | `CheckInDialog.tsx` (899 LOC) y `ConfirmCheckinDialog` son archivos paralelos sin shared components | Ambos | 🟡 Medio (mantenibilidad) |
| FE-9 | Sin auto-charge para CARD_TERMINAL (es captura de referencia, no charge real) | Step 3 pago | 🔵 Bajo (v1.0.1 PAY-CORE) |

### 2.2 Backend — verificación (todo OK)

| Guard | Status | Línea |
|-------|--------|-------|
| Idempotency (`actualCheckin !== null` → ConflictException) | ✅ | `:1893` |
| No-show no permite check-in (`noShowAt !== null`) | ✅ | `:1898` |
| Fecha futura (`checkinLocal > todayLocal`) | ✅ | `:1906` |
| Documento verificado | ✅ | `:1911` |
| `reference` requerido para CARD_TERMINAL/BANK_TRANSFER | ✅ | `:1918-1924` |
| Aprobación requerida para COMP + $0 | ✅ | `:1925-1932` |
| Balance unpaid → `BadRequestException` con código `BALANCE_UNPAID` | ✅ | `:1943-1949` |
| PaymentLog append-only USALI (sin `@updatedAt`) | ✅ | schema `:1957-1971` |
| `documentNumber` enmascarado en audit log (`***XXXX`) | ✅ | `:2016` |
| `keyType` capturado (default PHYSICAL) | ✅ | `:1994` |
| SSE post-tx + notif center | ✅ | `:2029-2050` |

**Conclusión backend:** no requiere rework, solo extender con OTA detection (§87 paymentModel).

---

## 3. Decisión de diseño: el "proceso definitivo"

### 3.1 Principios rectores aplicados

| Principio | Cita | Aplicación al check-in |
|-----------|------|-------------------------|
| Hick's Law (1952) | Less options = faster decision | Reducir a 1 botón visible al inicio (`Confirmar check-in`) |
| Fitts's Law (1954) | Target size + distance | CTA principal mín. 44pt + fija bottom-right |
| Sweller 1988 (Cognitive Load) | Max 7 elementos simultáneos | Single screen con secciones colapsables (no 4 pasos forzados) |
| NN/g H1+H5 (Visibility + Error prevention) | Reservation context siempre visible | Header sticky con guest/room/dates/balance |
| Apple HIG 2024 | Sheets > Dialogs para flujos cortos | Migrar a `max-w-3xl` centered sheet |
| Norman 1988 (Action Cycle) | Goal → execution → feedback | Cada acción tiene preview de outcome antes de commit |
| **Industria boutique-PMS** | 5/6 PMS = single state transition | Eliminar wizard, single-screen |
| **CFDI 4.0 Art. 29-A + USALI 12 ed.** | Evidencia inmutable de pago + ID | Mantener guards backend (no rebajar) |
| **Visa CRR 13.1/13.7** | Auth code + timestamp en chargeback | Mantener `reference` requirement (no rebajar) |

### 3.2 Anatomía del single-screen "Confirmar check-in"

```
┌───────────────────────────────────────────────────────────────────┐
│  ✱ Header sticky                                                  │
│  María González · Cabaña Selva 3 · 14-17 nov · 3 noches · 2 pax  │
│  USD 450 · Saldo: USD 0 ✓ liquidado por Booking.com               │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  📋 IDENTIDAD                                          [Verificar]│
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Tipo: [Pasaporte ▾]   Número: [_________] (••••1234 al log) │ │
│  │ □ Documento verificado físicamente                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  💳 PAGO                                          ✓ OTA prepagado │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Pagado vía Booking.com — sin acción requerida                │ │
│  │ ▸ Ver detalles del pago                                      │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  📝 NOTAS DE LLEGADA (opcional)                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ [Llegó tarde, equipaje en consigna...]                       │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  🔑 ENTREGA DE LLAVE                                              │
│  (•) Llave física   ( ) Tarjeta   ( ) Móvil/QR                   │
│                                                                   │
├───────────────────────────────────────────────────────────────────┤
│  Cancelar                                  ⏎  Confirmar check-in │
└───────────────────────────────────────────────────────────────────┘
```

**Comportamiento adaptativo:**

| Caso | Comportamiento |
|------|----------------|
| **OTA prepaid detected** (paymentModel=OTA_COLLECT) | Sección "Pago" colapsada con badge verde "Pagado vía [OTA]". CTA enabled. |
| **Direct booking, balance pendiente** | Sección "Pago" expandida con form de pago activo. CTA disabled hasta saldo cubierto o COMP. |
| **Direct booking, balance liquidado (depósito previo)** | Sección "Pago" colapsada con badge "Liquidado ✓". CTA enabled. |
| **Sin documento previo** | Sección "Identidad" expandida primero con foco automático en select de tipo. |
| **Documento ya capturado en reserva** | Sección "Identidad" colapsada, mostrando "Pasaporte ••••1234 (de la reserva)" + checkbox "Verificado físicamente". |
| **Document scan habilitado (v1.1+)** | Botón "Escanear documento" disponible en sección Identidad. Hoy disabled con badge "Próximamente". |

**Tecla Enter** = `Confirmar check-in` siempre que CTA esté enabled. **Tecla Esc** = `useModalDismiss` con confirm si dirty.

### 3.3 Walk-in vs confirmación — ¿dos dialogs o uno?

**Análisis:** Cloudbeds y Little Hotelier consolidan walk-in en el create-flow con un toggle "auto check-in on save". Opera y Mews los separan. Zenix hoy tiene dos archivos paralelos (`CheckInDialog.tsx` 899 LOC vs `ConfirmCheckinDialog.tsx`).

**Decisión:** **mantener dos dialogs pero compartir componentes** (`CheckinFormBody`, `IdentitySection`, `PaymentSection`, `KeySection`). El walk-in dialog tiene step de "Crear reserva" arriba; lo demás es idéntico. Esto evita un archivo monolítico y permite que el walk-in se beneficie del mismo rediseño.

**Riesgo evaluado:** acoplar ambos dialogs en un solo monolito (~1500+ LOC) hace mantenimiento más difícil y violaría DRY (NN/g H4 Consistency). Compartir componentes preserva DRY sin acoplamiento.

### 3.4 OTA-collect detection (§87 anticipado)

**Hoy:** método de pago `OTA_PREPAID` es selección manual del recepcionista en step 3. Frecuentemente olvidado → error "saldo pendiente" injustificado.

**Plan:** agregar `GuestStay.paymentModel: HOTEL_COLLECT | OTA_COLLECT | HYBRID_DEPOSIT` (decisión §87 v1.0.1 PAY-CORE adelantada parcial, igual que adelantamos FX-CORE en PR #32).

- **OTA_COLLECT**: detectado al ingestar reserva desde Channex (flag `payment_collect=ota` o por canal source ∈ {`booking`, `expedia`, `hotels_com`, `agoda` con paid_status=PAID}).
- **HOTEL_COLLECT**: walk-in, direct booking, OTA con cobro en hotel (Despegar, algunos casos Airbnb).
- **HYBRID_DEPOSIT**: depósito recibido + saldo en hotel.

**Backend change:** `confirmCheckin` lee `paymentModel`; si `OTA_COLLECT` no requiere `payments[]`, marca folio como "paid via OTA virtual card / pending reconciliation". Sin breaking change — flag default `HOTEL_COLLECT`.

**Frontend change:** Sección "Pago" se renderiza colapsada si `paymentModel === 'OTA_COLLECT'` con badge "Pagado vía [source]".

**Channex integration:** se cierra en el sprint `CHANNEX-INBOUND` (próximo). Para este sprint, basta con que el campo exista en schema + lo escriba el webhook handler stub + el frontend respete el flag.

---

## 4. Implementación — plan day-by-day

### Día 1 (backend hardening + schema)

**Tareas:**
1. **Migration** `add_payment_model_to_guest_stay`:
   ```prisma
   enum PaymentModel { HOTEL_COLLECT OTA_COLLECT HYBRID_DEPOSIT }
   model GuestStay {
     ...
     paymentModel PaymentModel @default(HOTEL_COLLECT)
   }
   ```
2. **Update `confirmCheckin`** en `guest-stays.service.ts`:
   - Leer `paymentModel`.
   - Si `OTA_COLLECT`: skip guard 5 (BALANCE_UNPAID), marcar `paymentStatus = 'PAID'`, no exigir `payments[]`.
   - Si `HYBRID_DEPOSIT`: balance = totalCharges − depositReceived (lógica existente).
3. **Endpoint nuevo** `GET /v1/guest-stays/:id/checkin-context` que devuelve:
   ```ts
   {
     stay: { ... },
     paymentModel: PaymentModel,
     balanceProjection: { totalAmount, amountPaid, balance, currency },
     canCheckIn: { ok: boolean, reasons?: string[] },
     identityCaptured: boolean,
   }
   ```
   — single endpoint que precarga TODO lo que la UI necesita en un round-trip (vs 3 calls hoy).
4. **Tests backend:**
   - `confirmCheckin` con `paymentModel=OTA_COLLECT` ignora guard balance.
   - `confirmCheckin` idempotente lanza error con código machine-readable `CHECKIN_ALREADY_CONFIRMED`.
   - Channex webhook stub (placeholder) escribe `paymentModel` correctamente.

**Deliverable:** migration + service updates + 6+ tests verdes + endpoint nuevo.

### Día 2 (componentes compartidos + rediseño UI)

**Tareas:**
1. **Extraer componentes shared** a `apps/web/src/modules/rooms/components/dialogs/checkin/`:
   - `CheckinHeader.tsx` — sticky con guest/room/dates/balance
   - `IdentitySection.tsx` — collapsible
   - `PaymentSection.tsx` — collapsible, modes (`ota-prepaid` / `direct-paid` / `direct-pending`)
   - `KeySection.tsx` — radio group
   - `ArrivalNotesSection.tsx`
   - `useCheckinForm.ts` — hook con form state + validation + submit
2. **Rediseño `ConfirmCheckinDialog.tsx`:**
   - `max-w-3xl` (768px) — antes `max-w-lg`.
   - Eliminar `StepIndicator` + lógica de `Step`.
   - Single scroll con secciones colapsables.
   - `useModalDismiss` hook aplicado.
   - 8pt grid pixel-perfect (referencia: `CancelReservationDialog`).
   - Documento con máscara visual `••••1234` mientras se tipea (mostrar últimos 4, ocultar el resto).
   - Idempotency feedback: si endpoint devuelve `CHECKIN_ALREADY_CONFIRMED` → toast informativo + auto-close + refetch.
3. **Rediseño `CheckInDialog.tsx` (walk-in):**
   - Mismo `max-w-3xl`.
   - Step 0 = "Crear reserva" (datos de guest + dates + room + rate).
   - Step 1 = mismo body que ConfirmCheckin (reusa componentes shared).
   - Submit unificado: crea + checkea-in en misma transacción backend.

**Deliverable:** 2 dialogs rediseñados + 5 componentes compartidos + hook + pixel-perfect spacing.

### Día 3 (QA + animaciones + polish + tests)

**Tareas:**
1. **Animaciones** según `CLAUDE.md §curves` (`--ease-spring` entrada 360ms, `--ease-sharp-out` salida 220ms).
2. **Accessibility audit:** keyboard navigation Tab order, Esc behavior, focus management when sections expand/collapse, ARIA labels.
3. **Tests frontend** (Jest + Testing Library):
   - Happy path OTA_COLLECT: 2 clicks (open + confirm).
   - Direct booking balance pendiente: pago manual y confirm.
   - Idempotency: open dialog post-checkin → muestra info, no error genérico.
   - useModalDismiss dirty-state confirm.
4. **Smoke test manual** Preview API + browser:
   - Reserva Booking.com prepaid → check-in en 2 clicks.
   - Walk-in cash → reserva creada + check-in en 4-5 clicks total.
   - Reserva direct con saldo → step de pago obligatorio.
5. **Update CLAUDE.md** §Sprint 8E con nuevas decisiones (§105+).
6. **Update `docs/zenix-sales-master.md`** Módulo 1 con sección "Check-in 2-click para OTA prepaid".

**Deliverable:** sprint completo + ≥10 tests + docs actualizados.

### Día 4 (buffer, opcional)

- Refactor `CheckInDialog.tsx` legacy si tiene complejidades no anticipadas.
- Tests de tenant isolation (asegurar `confirmCheckin` respeta `organizationId`).
- Decidir si migrar `CheckinContext` endpoint a tRPC o seguir REST (probablemente REST por consistencia con resto del API).

---

## 5. Riesgos detectados + contrapropuestas

### Riesgo R1 — Reducir wizard a single-screen rompe expectativas de recepcionistas entrenados en Opera

**Contexto:** muchos recepcionistas LATAM vienen de Opera/SiteMinder y esperan wizard de pasos. Cambiar a single-screen puede confundirlos.

**Mitigación:** mantener secciones visualmente separadas con headers fuertes (Identidad / Pago / Llave). Es single-screen físicamente pero estructuralmente conserva las 3 áreas mentales del wizard. Onboarding doc explícito sobre el cambio.

**Contrapropuesta evaluada y descartada:** mantener wizard de 2 pasos (Identidad+Pago como uno solo, Confirmar como el segundo). Descartada porque Cloudbeds/Clock/RR/LH/Mews (5/6 = mercado) van con single-screen y las reviews HTR muestran que es lo que la gente prefiere ("intuitive", "wasy to checkinn").

### Riesgo R2 — OTA detection vía Channex no está listo hasta sprint CHANNEX-INBOUND

**Contexto:** el flag `paymentModel` que diferencia OTA_COLLECT de HOTEL_COLLECT depende del webhook real, que llega en sprint próximo.

**Mitigación:** schema + flag default HOTEL_COLLECT + endpoint listo. Hasta CHANNEX-INBOUND, recepcionista puede setear manualmente desde el BookingDetailSheet ("Esta reserva ya fue cobrada por la OTA"). Heurística temporal: si `source ∈ {booking, expedia, hotels_com, agoda}` AND `amountPaid >= totalAmount * 0.95` → asumir OTA_COLLECT y mostrar badge "auto-detectado, confirmar".

**Contrapropuesta evaluada:** esperar a CHANNEX-INBOUND para iniciar este sprint. Descartada — son sprints independientes y el rediseño UI no depende del flag real, solo del campo.

### Riesgo R3 — Modal centered vs Sheet bottom — Apple HIG vs Material Design 3

**Contexto:** Apple HIG dice "Sheets para flujos cortos, Dialogs para confirmaciones". Material Design 3 prefiere "Bottom sheets para action-heavy flows".

**Análisis:** check-in es action-heavy (form input) pero el usuario es desktop-first (recepción siempre tiene monitor). Bottom sheets en desktop son mejores para mobile-up patterns; en desktop terminan teniendo espacio horizontal desperdiciado (mismo problema que tuvimos con `CancelledTodayDrawer` en PR #32).

**Decisión:** **centered modal `max-w-3xl`**, consistente con `CancelReservationDialog` post PR #32. Mobile (v1.1+) podrá adoptar bottom sheet en su propia capa.

### Riesgo R4 — Auto-mascarado del documentNumber complica edición

**Contexto:** mostrar `••••1234` mientras el usuario tipea puede confundir (¿está editando o no?).

**Mitigación:** patrón Stripe Elements — input plain mientras tiene foco, máscara al perder foco. Audit log siempre enmascara (ya está). Toast tooltip al primer foco: "Por seguridad, este número se enmascara al guardar".

**Contrapropuesta evaluada:** input password-style `type=password`. Descartada — recepción necesita verificar visualmente que coincide con documento físico.

### Riesgo R5 — Idempotency error con `CHECKIN_ALREADY_CONFIRMED` requiere refactor del client API

**Contexto:** hoy el frontend recibe error genérico cuando reabre un dialog post-checkin. Para mostrar feedback informativo, necesitamos un código machine-readable.

**Mitigación:** backend ya tiene `code: 'BALANCE_UNPAID'` (line 1945). Replicar patrón: backend devuelve `code: 'CHECKIN_ALREADY_CONFIRMED'`, frontend lo detecta en `onError` y muestra toast informativo + auto-close. Cero breaking change para otros consumers.

### Riesgo R6 — Compartir componentes entre `CheckInDialog` y `ConfirmCheckinDialog` puede acoplar concerns no relacionados

**Contexto:** walk-in es create + checkin; confirmation es solo state transition. Forzar shared components puede generar prop drilling y conditional rendering.

**Mitigación:** los componentes shared son **leaf** (formularios independientes) sin estado de orquestación. La orquestación vive en cada dialog padre. Si en review encontramos que un componente necesita >3 props condicionales, lo bifurcamos.

**Contrapropuesta evaluada:** monolito `<CheckinDialog mode="walkin" | "confirm">`. Descartada por violación SRP — un dialog que hace dos cosas es harder to test.

### Riesgo R7 — Performance del endpoint `/checkin-context` puede degradarse con muchos joins

**Contexto:** consolida 3-4 queries actuales en una. Si la query agrega `paymentLogs` + `room.property.settings` + `stayJourney` puede ser O(N) sobre joins anidados.

**Mitigación:** select explícito (no `include: { all: true }`), `paymentLogs` filtrado por `isVoid=false`, `take: 50` máx. Index Postgres en `(stayId, isVoid, createdAt DESC)`. Profile con `EXPLAIN ANALYZE` antes de release. P95 target = <120ms.

---

## 6. Acceptance criteria

### Funcionales

- [ ] Reserva Booking.com prepaid se check-in en ≤2 clicks (lista de arribos → checked-in).
- [ ] Walk-in cash se completa (crear + check-in) en ≤5 clicks.
- [ ] Reserva direct con saldo pendiente NO puede confirmarse sin pago o COMP aprobado.
- [ ] Reserva COMP con $0 muestra UI de aprobación explícita (código + razón).
- [ ] Reserva ya checked-in muestra toast informativo (no error genérico) al reabrir dialog.
- [ ] `paymentModel` se persiste en BD y se respeta en `confirmCheckin`.
- [ ] Backend devuelve códigos machine-readable: `BALANCE_UNPAID`, `CHECKIN_ALREADY_CONFIRMED`, `NOSHOW_LOCKED`, `FUTURE_CHECKIN`.

### UX

- [ ] Modal `max-w-3xl` centered, pixel-perfect 8pt grid (igualar referencia `CancelReservationDialog`).
- [ ] `useModalDismiss` hook aplicado: Esc + backdrop click + dirty-state confirm.
- [ ] Animaciones canónicas Zenix (`--ease-spring` 360ms entrada, `--ease-sharp-out` 220ms salida).
- [ ] `motion-reduce:duration-0` en elementos animados.
- [ ] Focus inicial en primera sección no completada.
- [ ] Tab order coherente. Enter = confirm cuando CTA enabled.

### Seguridad / cumplimiento

- [ ] `documentNumber` enmascarado en UI al perder foco. Audit log siempre `***XXXX`.
- [ ] Guard `organizationId + propertyId` activo en endpoint `/checkin-context` (PropertyScopeGuard ya lo hace global, validar que aplica).
- [ ] Todos los guards Sprint 8E preservados.

### Performance

- [ ] Endpoint `/checkin-context` p95 < 120ms.
- [ ] Time-to-confirm (TTFB → checked-in state visible) p50 < 35 segundos en flow OTA prepaid.
- [ ] Bundle size del dialog rediseñado ≤ tamaño actual (~46KB combined).

### Testing

- [ ] ≥6 tests backend para `confirmCheckin` (idempotency + paymentModel + balance edge cases).
- [ ] ≥10 tests frontend (Jest + Testing Library).
- [ ] Smoke test manual con 3 escenarios (OTA prepaid, walk-in cash, direct booking balance pendiente).
- [ ] Audit accessibility con `axe-core` — 0 violations críticas.

---

## 7. Decisiones a registrar en CLAUDE.md (post-sprint)

A agregar como `§105-§110` después del cierre del sprint:

- **§105** — Check-in es single-screen con secciones colapsables, no wizard. Justificación: NN/g 2024 wizards solo para tareas >20min, check-in es <2min ejecutado >20×/día. Industria boutique 5/6 PMS confirma.
- **§106** — `GuestStay.paymentModel` driver de OTA-collect detection. Default `HOTEL_COLLECT`. Si `OTA_COLLECT`, `confirmCheckin` skip guard BALANCE_UNPAID y marca folio "paid via OTA virtual card / pending reconciliation".
- **§107** — Endpoint `/v1/guest-stays/:id/checkin-context` consolida data necesaria para single round-trip. Pattern Cloudbeds "action drawer" — frontend recibe todo lo que necesita en una llamada.
- **§108** — Componentes shared `CheckinHeader / IdentitySection / PaymentSection / KeySection / ArrivalNotesSection` viven en `dialogs/checkin/`. Walk-in y confirmation reusan los mismos leaf components, orquestación en dialog padre.
- **§109** — `documentNumber` enmascarado al perder foco (`••••XXXX`), plain con foco. Audit log siempre `***XXXX`. Pattern Stripe Elements + GDPR best practice.
- **§110** — Backend devuelve códigos machine-readable en `confirmCheckin` errors: `CHECKIN_ALREADY_CONFIRMED`, `BALANCE_UNPAID` (ya), `NOSHOW_LOCKED`, `FUTURE_CHECKIN`. Frontend muestra feedback informativo específico (NN/g H9).

---

## 8. Out-of-scope (deferred)

- **OCR de documento (camera capture)** — v1.1+ con servicio externo. Hoy: input manual + checkbox "verificado".
- **Stripe/Conekta charge real** — v1.0.1 PAY-CORE. Hoy: `CARD_TERMINAL` captura referencia POS.
- **Group check-in** — v1.1.2 Group reservations. Hoy: cada stay se confirma individualmente.
- **Online check-in / kiosk** — v1.5 Guest app. Hoy: solo recepción front-desk.
- **Mobile check-in (tablet)** — post v1.1.0. Hoy: 0 pantallas mobile.
- **Multi-guest companions** — v1.1.4 Guest CRM. Hoy: solo guest principal.

---

## 9. Citaciones (todas verificables)

### Research procesos UI

- [Mews — Check in a reservation](https://help.mews.com/s/article/check-in-a-reservation)
- [Mews — State Booking Module](https://mewssystems.freshdesk.com/support/solutions/articles/31000129878-state-booking-module)
- [Mews — Improved check-in form (2025)](https://community.mews.com/mews-updates-38/we-ve-improved-the-check-in-form-thanks-to-your-feedback-2116)
- [Cloudbeds — Check-in and check-out guests](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/221677468-Check-in-and-check-out-guests-in-Cloudbeds-PMS)
- [Cloudbeds — Daily Operations Guide](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/40771665486363)
- [Oracle Opera Cloud — Checking In Reservations](https://docs.oracle.com/en/industries/hospitality/opera-cloud/24.4/ocsuh/t_checking_in_reservations.htm)
- [Oracle Opera — Create Walk In Reservation](https://docs.oracle.com/cd/F18689_01/doc.193/f38312/t_arrivals_creating_a_walk_in_res.htm)
- [Little Hotelier — Change reservation status](https://helpcentre.littlehotelier.com/en/articles/8674163-change-the-status-of-a-reservation)
- [Little Hotelier — Guest Registration](https://www.littlehotelier.com/blog/running-your-property/guest-registration/)
- [RoomRaccoon — Reservation Dashboard](https://contact.roomraccoon.com/en/support/solutions/articles/150000016107-roomraccoon-reservation-dashboard)
- [RoomRaccoon — Calendar Color Codes](https://contact.roomraccoon.com/en/support/solutions/articles/150000012451-roomraccoons-calendar-colour-codes-explained)
- [Clock PMS — How to check in a booking](https://support.clock-software.com/en/support/solutions/articles/9000217560)
- [Clock PMS — Online Check-In](https://support.clock-software.com/en/support/solutions/articles/9000212575)

### Research sentimiento usuarios

- [Mews Product Ideas — Split charges (780 votes, 2018)](https://feedback.mews.com/forums/918232-property-operations-pms/suggestions/36659347-split-charges-on-bill)
- [Mews Product Ideas — Go back to old Billing (174 votes)](https://feedback.mews.com/forums/918232-mews-operations-pms/suggestions/42034579-old-billing-screen)
- [Mews Community — Passport scanning broken (Nov 2023)](https://community.mews.com/community-library-94/passport-scanning-is-not-possible-637)
- [Mews Community — VCC autocharge bug](https://community.mews.com/mews-payments-84/automatic-charging-of-virtual-credit-cards-for-prepaid-reservations-1827)
- [OPERA Cloud Reviews — Capterra](https://www.capterra.com/p/266207/OPERA-Cloud-Property-Management/reviews/)
- [Cloudbeds Reviews — Hotel Tech Report](https://hoteltechreport.com/operations/property-management-systems/cloudbeds-myfrontdesk)
- [Little Hotelier — Capterra Reviews](https://www.capterra.com/p/144307/Little-Hotelier/reviews/)
- [RoomRaccoon — Trustpilot Reviews](https://www.trustpilot.com/review/www.roomraccoon.com)

### Estándares de diseño

- [Nielsen Norman Group — Wizards Definition](https://www.nngroup.com/articles/wizards/)
- [NN/g — 10 Usability Heuristics (rev 2020)](https://www.nngroup.com/articles/ten-usability-heuristics/)
- [Apple HIG 2024 — Sheets vs Modals](https://developer.apple.com/design/human-interface-guidelines/sheets)
- [WCAG 2.1 AA](https://www.w3.org/WAI/WCAG21/quickref/)

### Cumplimiento

- [Visa Dispute Management Guidelines (junio 2024)](https://usa.visa.com/content/dam/VCOM/global/support-legal/documents/merchants-dispute-management-guidelines.pdf) — Reason Code 13.1/13.7
- [SAT México — CFDI 4.0 Anexo 20](https://www.sat.gob.mx/cs/Satellite?blobcol=urldata&blobkey=id&blobtable=MungoBlobs)
- [USALI 12th Edition (HFTP/AHLA)](https://www.hftp.org/i/usali_12th_edition) — mandatory 2026-01-01

---

## 10. Quick-start para nueva sesión

Para retomar este sprint en una sesión limpia:

1. Leer este archivo + `CLAUDE.md` (atención a §95-§104 Cancel-Archive + §Sprint 8E).
2. `git checkout main && git pull && git checkout -b sprint/checkin-alpha`.
3. Empezar por Día 1 (backend) → migration + service updates + endpoint nuevo.
4. Validar tests verdes antes de tocar frontend.
5. Día 2 frontend con componentes shared.
6. Día 3 polish + tests + docs.
7. PR final con checklist completa de Acceptance Criteria.

**Archivos de referencia para copiar patrones:**
- Spacing 8pt + dismissal hook: `apps/web/src/modules/rooms/components/dialogs/CancelReservationDialog.tsx`
- Modal estándar Apple HIG: `apps/web/src/modules/rooms/hooks/useModalDismiss.ts`
- Backend service idempotency: `apps/api/src/pms/guest-stays/guest-stays.service.ts:1872-2054` (modelo a preservar)
- Test pattern para service: `apps/api/src/pms/guest-stays/guest-stays.service.spec.ts` (si existe; si no, crear)

---

**Fin del plan. Listo para iniciar en sesión nueva.**
