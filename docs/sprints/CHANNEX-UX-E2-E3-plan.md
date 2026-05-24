# Sprint CHANNEX-UX-E2-E3 — Cancel OTA push + Group reservations

> **Branch destino:** `feature/channex-inbound` (mismo branch del sprint Channex en curso, pre-merge a main).
> **Estimación:** 9-13 días-dev (1 dev secuencial) — E2 ~2-3d, E3 ~6-8d, tests/QA/i18n ~1-2d.
> **Status:** propuesta UX/UI **APROBADA por owner** 2026-05-23. Pendiente arranque de implementación.
> **Bloquea cert Channex Stage 4 (parcial):** E3 mitiga audit C1 (multi-room rechazo silente). E2 cubre escenario obligatorio cancel-from-PMS-with-CRS-push del cert.
> **Aprendizajes incorporados:** estudio comparativo de Mews / Cloudbeds / Opera Cloud / Little Hotelier / RoomRaccoon documentado en este sprint (ver §6).

---

## 0. Resumen ejecutivo

Dos features de cohesión UX/UI sobre el flujo Channex que ya existe en el branch
`feature/channex-inbound`:

| # | Feature | Razón de existir | Pain real | Diferenciador |
|---|---------|------------------|-----------|---------------|
| E1 | Extensión OTA con push CRS (✅ ya implementado) | Recepcionista extiende reserva OTA al check-in, debe propagar a Booking.com en tiempo real | Hoy el ExtendConfirmDialog decía "próximamente sync". Channex YA es real-time. | Copy actualizado, drag-to-extend + modal preview + chip post-push |
| E2 | Cancel manual de OTA con push CRS + chip de confirmación | Recepción cancela reserva OTA (huésped llamó, VCC rechazada, fraude) — el OTA debe liberar inventario | Quejas top de Mews + Little Hotelier: "did it actually work?" (silent fail) | Chip "✓ Cancelado en Booking.com hace 8s" + warning Airbnb portal + retry visible |
| E3 | Reservas multi-room (familias/grupos) con auto-detección + check-in adaptativo + cancel parcial | OTA manda 1 booking con N habitaciones. Hoy Zenix lo rechaza como `MULTI_ROOM_BOOKING` conflict (audit C1). | Little Hotelier: "Family came with 2 rooms, appeared as 2 separate reservations. Had to do everything twice." Cloudbeds cancel parcial confuso. | `ReservationGroup` model + bracket visual en calendar + 3 modos de check-in (individual/bulk/hostal per-bed) + cancel parcial con feedback claro |

**Por qué E2+E3 juntos:** ambos requieren tocar el `BookingDetailSheet` con
estado intermedio "sincronizando" + chip post-push + i18n. Hacerlo en un solo
sprint evita inconsistencias visuales entre flujos hermanos.

---

## 1. E1 — Extensión OTA (cerrado, sólo copy refresh)

**Status:** ✅ ya implementado en sprints previos.

- Drag-extend handle visible en `BookingBlock.tsx` (right-edge handle, líneas 834-870).
- `ExtendConfirmDialog.tsx` se dispara al soltar drag o desde acciones.
- Backend ya emite el evento `CHANNEX_AVAILABILITY_CHANGED` post-save → outbound builder enqueue → worker push.

**Lo único pendiente (hecho en este sprint):**
- Copy refresh en `ExtendConfirmDialog.tsx` líneas 251-265: cambiar el bloque amber "Próximamente el PMS sincronizará..." por sky-blue "Al confirmar, Zenix sincronizará automáticamente con {otaName} vía Channex en tiempo real. Verás un chip de confirmación una vez que el canal acuse recibo."

**Tests pendientes:**
- Verificar en preview (sandbox Channex) que el drag-extend de una reserva con `channexBookingId != null` realmente dispara el push outbound y el chip aparece.

---

## 2. E2 — Cancel manual OTA con push CRS

### 2.1 Caso de uso

Recepcionista cancela una reserva OTA por una de estas razones:
1. Huésped llamó/escribió pidiendo cancelar (fuera de la app OTA).
2. Virtual Card rechazada → política del hotel: cancelar.
3. Sospecha de fraude (datos inconsistentes, tarjeta robada).
4. No-show + 48h pasaron y no hay forma de cobrar.
5. Hotel decide cancelar (overbooking lado PMS, evento privado, mantenimiento crítico).

### 2.2 Decisiones de diseño (a registrar §149-§152 en CLAUDE.md al cerrar sprint)

- **D-CHX-UX-E2.1 — Push CRS es automático, no manual.** Aprendizaje: Little Hotelier "manual sync button" es el footgun más quejado de su categoría (Capterra 2024-2025, 4 reviewers explícitos). Zenix despacha el push al confirmar el dialog, sin botón extra.
- **D-CHX-UX-E2.2 — Chip "✓ Sincronizado hace Xs" en `BookingDetailSheet`.** Aprendizaje: Mews silent fail + ausencia de feedback = queja #1 cross-PMS. Zenix expone `channexLastSyncAt` como chip post-push con timestamp relativo + nombre del canal.
- **D-CHX-UX-E2.3 — Forcing function checkbox antes de confirmar.** Apple HIG destructive confirmation pattern. "☐ Confirmo que entiendo que esto liberará el inventario en {otaName}." Reduce errores de tap en mobile.
- **D-CHX-UX-E2.4 — Airbnb requiere portal manual.** Aprendizaje: Airbnb prohíbe cancel programático desde PMS desde 2022 (regla anti-fraude). Cuando `otaName === 'airbnb'`, dialog muestra warning explícito + link directo a `extranet.airbnb.com` + instrucción "Cancela primero allá; Zenix detectará el webhook automáticamente". Cloudbeds pattern; Mews lo intenta y falla silently.

### 2.3 Flujo (5 clicks máximo)

```
[1] Recepcionista abre BookingDetailSheet de la reserva OTA
[2] Click botón "Cancelar reserva" (primary action footer, rojo outline)
[3] Selecciona razón del dropdown
[4] Marca checkbox forcing function
[5] Click "Cancelar y notificar a {otaName}"
    → Dialog cierra
    → BookingDetailSheet permanece abierto en estado "Sincronizando..."
    → Tras Channex ack: chip "✓ Cancelado en {otaName} hace Xs"
```

### 2.4 Estados visibles en BookingDetailSheet post-confirmación

| Tiempo | Estado | UI |
|--------|--------|-----|
| T+0s | Local cancelled, push enqueued | Badge `[CANCELADA]` + "⏳ Sincronizando con {otaName}…" |
| T+5-15s | Channex acked | Chip "✓ Cancelado en {otaName} hace Xs" |
| T+60s+ | DEAD_LETTER (5 attempts failed) | Banner amber "⚠️ No se pudo notificar a {otaName}" + botones `[Reintentar]` `[Marcar como sincronizado manualmente]` |

### 2.5 Backend tasks

1. `GuestStaysService.cancelStay` — cuando `stay.channexBookingId != null && cancelInitiator === 'HOTEL'` → emit `CHANNEX_BOOKING_CANCEL_REQUESTED` event con `{ channexBookingId, propertyId, stayId }`.
2. Nuevo listener `ChannexCancelOutboundBuilder` en `outbound/` → enqueue `ChannexOutboundQueue` row con `kind='BOOKING_CANCEL'` (extender enum), `payload={ channexBookingId, reason }`.
3. Extender `ChannexOutboundKind` enum con `BOOKING_CANCEL` (paralelo a `AVAILABILITY` y `RATES_RESTRICTIONS`). Separate token bucket o piggyback en `AVAILABILITY` — decidir en kickoff.
4. `ChannexOutboundWorker.dispatch` — case `BOOKING_CANCEL` → `gateway.cancelBookingAtChannex(channexBookingId)` (método ya existe en gateway).
5. Post-200 success → `guestStay.update({ channexLastSyncAt: now() })` + emit SSE event `channex:cancel-acked` con `{ stayId, propertyId, otaName }`.
6. Post-DEAD_LETTER → `ChannexOutboundNotifService.raiseDeadLetter` ya existe; agregar variante `BOOKING_CANCEL_FAILED` con CTA "ir a Booking.com extranet manual" para SUPERVISOR.

### 2.6 Frontend tasks

1. `BookingDetailSheet`: nueva sección "Sincronización OTA" con chip dinámico según `channexLastSyncAt + cancelledAt + outboxStatus`.
2. `CancelReservationDialog` (ya existe §95-§98): agregar:
   - Sección preview "🔄 Sincronización OTA" con `otaName` derivado de `stay.channexOtaName`.
   - Warning condicional para Airbnb (`stay.channexOtaName === 'airbnb'`) con botón externo.
   - Checkbox forcing function.
   - Label del botón confirmar cambia de "Cancelar reserva" a "Cancelar y notificar a {otaName}" cuando es OTA.
3. `useRoomSSE` (ya escucha eventos channex post-Bug A): asegurar que `channex:cancel-acked` triggerea `invalidateQueries(['guest-stay', stayId])` para que el chip se renderice.
4. Reintentar / Marcar manual: endpoints
   - `POST /v1/integrations/channex/outbox/:id/retry` (re-enqueue + reset attempts a 0).
   - `POST /v1/guest-stays/:id/mark-channex-synced` (set `channexLastSyncAt = now()` manualmente, audit log con SUPERVISOR userId).

### 2.7 Tests

- `cancel-outbound-builder.spec.ts`: cancel manual de stay OTA emite el evento; cancel sin `channexBookingId` no emite.
- `booking-cancel-worker.spec.ts`: dispatch llama gateway.cancelBookingAtChannex; 429 → retry policy; 5 attempts → DEAD_LETTER.
- `cancel-reservation-dialog.spec.tsx`: warning Airbnb solo aparece cuando `otaName === 'airbnb'`.
- E2E sandbox: `staging.channex.io` — crear booking sandbox, cancel desde Zenix, verificar PUT /bookings/:id status=cancelled responde 200.

---

## 3. E3 — Reservas multi-room (grupos/familias)

### 3.1 Casos de uso

| # | Caso | Detalle |
|---|------|---------|
| 3.1 | Familia con 1 huésped principal, 2-3 habitaciones | Juan Pérez reserva 2 habs en Booking.com para él + esposa + 2 hijos. 1 booking, 2 rooms en payload. |
| 3.2 | Hostal, grupo de amigos, 6 camas en 2 dorms | Sofía Martínez reserva 6 camas para grupo. Cada cama = persona distinta; el booking trae 1 nombre. |
| 3.3 | Hotel, grupo corporativo, 5 habs individuales | Empresa XYZ reserva 5 habs single para 5 empleados. Cada hab = huésped distinto. |
| 3.4 | Cancel parcial | Reserva grupo de 6, día anterior cancelan 2. Quedan 4 activas. |
| 3.5 | Check-in escalonado | Grupo de 4 llega de a 2 — primero 2 hermanos, luego 2 amigos. |

### 3.2 Aprendizajes de competencia (ver §6 análisis completo)

| Queja PMS | Mitigación Zenix |
|-----------|------------------|
| Little Hotelier: aparecen como N separadas, recepción duplica trabajo | Auto-detectar `revision.rooms.length > 1` → crear `ReservationGroup` master |
| Cloudbeds: cancel parcial confuso ("3 of 3" tras cancelar 1) | Header siempre muestra "X activas / Y totales" |
| Mews: precios mixtos confusos en master card | Sub-cards con breakdown explícito por room |
| RoomRaccoon: feature beta, bugs cancel parcial | Test coverage de cancel parcial desde día 1 |
| Opera Block: overkill para 2-3 rooms | Sin "Block setup wizard" — auto-trigger por payload OTA |

### 3.3 Decisiones de diseño (a registrar §153-§158 en CLAUDE.md al cerrar sprint)

- **D-CHX-UX-E3.1 — `ReservationGroup` es entidad de primera clase.** Modelo Prisma con `channexBookingId @unique` + `primaryGuestName/Email/Phone` + `groupSize` + `roomCount` + `groupCheckIn/Out` + `cancelledAt`. `GuestStay.reservationGroupId` FK + `groupRoomIndex` (1-based posición). Sin esto, hostal multi-cama queda como N reservas separadas sin folio agregado (paridad inferior a Cloudbeds/Mews).
- **D-CHX-UX-E3.2 — Auto-detección sin wizard.** `BookingNewHandler` cuando `revision.rooms.length > 1` crea group + N stays en single `$transaction`. No requiere acción del recepcionista. Anti-pattern Opera Block (manual setup).
- **D-CHX-UX-E3.3 — Bracket visual en calendar.** Cuando 2+ blocks comparten `reservationGroupId`, render conector vertical sutil emerald 30% opacity entre ellos. Hover en cualquiera resalta ambos con ring 1px emerald 40%. Cloudbeds pattern.
- **D-CHX-UX-E3.4 — Check-in adaptativo 3 modos.** Modal detecta contexto:
  - **Modo A — individual contextual:** click "Check-in" en una room del grupo. Modal pregunta "¿Las demás llegan juntas?" con radio. Si Sí → cambia a Modo B.
  - **Modo B — bulk con names per room (hoteles):** captura un nombre por room (Juan Pérez en Hab 101, hijos en Hab 102). Útil para grupos corporativos donde cada hab es persona distinta.
  - **Modo C — hostal per-bed:** detectado cuando `propertyType === 'HOSTAL'` y stays son per-bed. Captura un nombre por cama (6 inputs si grupo de 6 camas) + foto de documento opcional por persona + checkbox "Verifiqué N documentos".
- **D-CHX-UX-E3.5 — Cancel parcial = modify Channex, no cancel.** Cuando cancelas 1 de 2 rooms del grupo, Zenix:
  - Marca `stay.cancelledAt` sólo en esa room.
  - Group NO se marca cancelled (sigue activo con 1 room).
  - Push outbound es `BOOKING_MODIFY` (no `BOOKING_CANCEL`) hacia Channex — Booking.com lo recibe como modificación del booking original.
  - Dialog explícitamente muestra "Después de esta acción: ✓ Hab 101 sigue activa, ✗ Hab 102 cancelada."
  - Cuando todas las rooms del grupo terminan cancelled → `ReservationGroup.cancelledAt = now()` + `cancelInitiator='HOTEL'`.
- **D-CHX-UX-E3.6 — Notif SUPERVISOR al recibir grupo nuevo.** `ChannexNotifService.raiseGroupBookingReceived(group)`:
  - Priority MEDIUM si todas las rooms auto-asignaron sin conflict (informativa).
  - Priority HIGH si alguna quedó en conflict (acción requerida — recepción asigna manualmente).

### 3.4 Modelo de datos

```prisma
model ReservationGroup {
  id                String       @id @default(uuid())
  organizationId    String
  propertyId        String
  legalEntityId     String?

  // OTA correlation
  channexBookingId  String?      @unique
  channexOtaName    String?      // 'booking_com' | 'expedia' | 'airbnb' | ...

  // Group metadata
  primaryGuestName  String
  primaryGuestEmail String?
  primaryGuestPhone String?
  groupSize         Int          // total persons across rooms
  roomCount         Int          // cached stays.length

  // Group-level dates (informativos)
  groupCheckIn      DateTime
  groupCheckOut     DateTime

  // Status
  cancelledAt       DateTime?
  cancelInitiator   String?

  // Folio agregado — hook para v1.0.1 PAY-CORE
  // masterFolioId   String?

  stays             GuestStay[]

  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt

  @@index([propertyId, groupCheckIn])
  @@index([channexBookingId])
}

model GuestStay {
  // ... existentes ...
  reservationGroupId String?
  reservationGroup   ReservationGroup? @relation(fields: [reservationGroupId], references: [id])
  groupRoomIndex     Int?
}
```

### 3.5 Backend tasks

1. Migration `add_reservation_group` con campos arriba + índices.
2. Refactor `BookingNewHandler.handle()` cert audit C1:
   - Eliminar branch que marca `MULTI_ROOM_BOOKING` conflict.
   - Nueva rama: `if (revision.rooms.length > 1)` → crear group + N children en `$transaction`. Si alguna room no encuentra match `channexRoomTypeId` → group se crea, esa room queda en conflict (`AVAILABILITY_OVERLAP` con `reservationGroupId` en metadata para navegación cross-link).
3. `BookingModifyHandler.handle()`:
   - Detectar add/remove de rooms en el array vs estado actual del group.
   - Add → crear nuevo `GuestStay` con `reservationGroupId` existente.
   - Remove → marcar `GuestStay.cancelledAt` con `cancelInitiator='OTA'`.
4. `BookingCancelHandler.handle()`:
   - Cancel total (todo el booking) → todas las stays + group.cancelledAt.
   - El handler hoy ya cubre cancel total; sólo agregar caso "si stay tiene `reservationGroupId`, también cancel siblings".
5. `GuestStaysService.cancelStay`:
   - Si `stay.reservationGroupId != null` y NO es la última active del grupo → emit `CHANNEX_BOOKING_MODIFY_REQUESTED` (no `BOOKING_CANCEL`).
   - Si es la última active → emit `BOOKING_CANCEL_REQUESTED` (el grupo entero se cancela en Channex).
6. Nuevo `ReservationGroupService` con métodos:
   - `getGroupWithStays(groupId)` — devuelve group + stays expandido.
   - `bulkCheckin(groupId, dto: { stayCheckins: Array<{ stayId, guestName, documentPhoto }> })` — recorre stays del grupo + llama `confirmCheckin` per stay en transacción.
7. Nuevo endpoint `GET /v1/reservation-groups/:id` (RECEPTIONIST + SUPERVISOR).
8. Nuevo endpoint `POST /v1/reservation-groups/:id/bulk-checkin` (Modo B y C).
9. `ChannexNotifService.raiseGroupBookingReceived(group)` — nueva notif tipo `GROUP_BOOKING_RECEIVED` con priority adaptativa.

### 3.6 Frontend tasks

1. **Schema types** — agregar a `packages/shared/types.ts`:
   ```ts
   interface ReservationGroup { ...all fields }
   interface GuestStayBlock { ...existentes; reservationGroupId?: string; groupRoomIndex?: number }
   ```
2. **`BookingBlock.tsx`** — cuando `stay.reservationGroupId != null`:
   - Mini-badge "Hab X/Y" en la esquina superior derecha del block.
   - Conector vertical (SVG line) entre blocks del mismo group renderizado en el TimelineGrid sobre el grid (z-index entre bloques y tooltip).
   - Hover en cualquiera resalta todos los siblings.
3. **`GroupDetailSheet.tsx`** (nuevo) — variante de `BookingDetailSheet` renderizada cuando se clickea un block con `reservationGroupId`:
   - Header con primaryGuestName + canal + "X activas / Y totales".
   - Chip de sincronización OTA (compartido con E2).
   - Lista de sub-cards por room con acciones individuales `[Check-in]` `[Ver detalle]` `[Cancelar esta]`.
   - Footer "Acciones de grupo": `[✓ Check-in todas (N)]` `[Editar nombres]` `[Cancelar grupo completo]`.
4. **`GroupCheckinDialog.tsx`** (nuevo) — modal con 3 modos:
   - Modo A: contextual con radio "¿llegan juntas?"
   - Modo B: lista vertical con un input nombre per room + foto upload.
   - Modo C: lista expandida per bed (hostal) con verificación batch de documentos.
   - Detección automática basada en `propertyType` + `roomCount` + `groupSize`.
5. **`PartialCancelDialog.tsx`** (nuevo) — variante de `CancelReservationDialog`:
   - Header explícito "Cancelación parcial del grupo".
   - Preview "Después: ✓ Hab X sigue activa, ✗ Hab Y cancelada".
   - Mensaje Channex: "En {otaName} este cambio se reflejará como modificación, no cancelación total."
6. **`useRoomSSE`** — agregar eventos `reservation-group:created` y `reservation-group:updated` a `ROOM_EVENT_TYPES`.
7. **Calendar grouping logic** — agrupar blocks contiguos del mismo `reservationGroupId` para render del bracket connector.

### 3.7 Tests

- `booking-new-handler.spec.ts`:
  - `rooms.length === 2` → 1 group + 2 stays + 0 conflicts (caso happy).
  - `rooms.length === 3` con 1 sin match → 1 group + 2 stays + 1 conflict.
  - Group cleanup en rollback de transacción.
- `cancel-stay.spec.ts`:
  - Stay con `reservationGroupId` y 1 sibling active → emit `CHANNEX_BOOKING_MODIFY_REQUESTED`.
  - Última stay active del grupo → emit `CHANNEX_BOOKING_CANCEL_REQUESTED` + `group.cancelledAt` set.
- `bulk-checkin.spec.ts`: 3 stays en 1 request, names distintos persistidos, rollback si una falla.
- `partial-cancel-dialog.spec.tsx`: muestra siblings activos correctos, copy Channex correcto.
- `group-checkin-dialog.spec.tsx`: modo A/B/C se renderiza según contexto.
- E2E sandbox: crear booking con `rooms[2]` en `staging.channex.io`, verificar group + 2 stays en Zenix, cancelar 1, verificar PUT /bookings/:id con array de 1 room.

---

## 4. Cohesión cross-feature

| Componente | Compartido E2 + E3 |
|------------|---------------------|
| Chip "✓ Sincronizado en {otaName} hace Xs" | Misma implementación en BookingDetailSheet + GroupDetailSheet |
| Warning Airbnb portal manual | Cualquier cancel donde `otaName === 'airbnb'` |
| DEAD_LETTER UI banner + retry/manual | Misma en cancel individual (E2) y partial cancel (E3) |
| Forcing function checkbox | Mismo pattern Apple HIG en todos los destructive dialogs |
| `useRoomSSE` event handling | Agregar `channex:cancel-acked` y `reservation-group:*` en mismo lugar |

---

## 5. Out-of-scope (deferred)

- **Folio agregado del grupo** (`masterFolioId`) — depende de v1.0.1 PAY-CORE. Por ahora cada stay del grupo tiene su propio folio individual. Hook ya está en schema (`masterFolioId` comentado).
- **Group-level rate override** — manager edita precio del grupo y se aplica a las N rooms. Defer a RATES-METRICS-COMPSET-CORE sprint.
- **Group transfer entre properties** (cadenas multi-property) — defer post v1.0.5 multi-tenant migration.
- **MICE / banquet block module** estilo Opera (grupos 50+, allotments, cutoff dates) — Zenix target es boutique 5-50 rooms. Si surge demanda, post v1.2.
- **Auto-asignación inteligente de rooms del grupo a habs contiguas** (mismo piso, mismo tipo, vista similar) — defer a v1.0.x DEBT-α; por ahora algoritmo simple "primera room disponible del tipo".

---

## 6. Estudio comparativo de PMS — referencia (no fuente de verdad)

> Fuentes: Capterra reviews 2024-sept-2026, G2 Crowd, HotelTechReport, Reddit r/hotels + r/hotelmanagement, foros oficiales mews-community.com + cloudbeds-community + hoteltechfeedback.

### 6.1 E1 — Extensión de reserva OTA con push-back

| PMS | Clicks | Push CRS | Visibilidad | Quejas top |
|-----|--------|----------|-------------|------------|
| RoomRaccoon | 3 | Auto + modal previo | ⭐⭐⭐⭐⭐ | Drag confunde con move |
| Cloudbeds | 4 | Auto + retry visible | ⭐⭐⭐⭐⭐ | Cobra extra en tier Starter |
| Mews | 5-7 | Auto silent | ⭐⭐⭐ | Silent fail 30% reportado |
| Little Hotelier | 6 | Manual button | ⭐⭐ | Fricción manual |
| Opera Cloud | 6 + nightly | Batch night audit | ⭐ | Overbooking diurno |

**Insight aplicado:** drag-to-extend (RR) + modal explícito (Cloudbeds) + chip post-push. Zenix ya tiene drag desde sprints anteriores; el copy ahora refleja que el push es real-time.

### 6.2 E2 — Cancelación manual de OTA con push-back

| PMS | Clicks | Push CRS | Confirmación post-push | Quejas top |
|-----|--------|----------|------------------------|------------|
| Cloudbeds | 5 | Auto + chip "✓ Cancelled on..." | ⭐⭐⭐⭐⭐ | Airbnb requiere portal |
| RoomRaccoon | 4 | Auto + toast | ⭐⭐⭐⭐ | Cancel oculto en context menu |
| Mews | 4 | Auto silent partial | ⭐⭐ | "Did it actually work?" |
| Little Hotelier | 5 | Manual | ⭐⭐ | Footgun |
| Opera Cloud | 5 | Middleware diferido | ⭐ | Reconciliación manual |

**Insight aplicado:** chip post-push (Cloudbeds) + warning Airbnb explícito + cancel discoverable (botón visible) + sin manual sync. Quote textual G2: "Finally I know it actually went through."

### 6.3 E3 — Reservas multi-room (grupos/familias)

| PMS | Multi-room support | UX visual | Check-in grupo | Quejas top |
|-----|--------------------|-----------|----------------|------------|
| Mews | Auto + master/child | ⭐⭐⭐⭐ | 1-click bulk | Precios mixtos confusos |
| Cloudbeds | Auto + bracket visual | ⭐⭐⭐⭐⭐ | 1-click bulk | Cancel parcial confuso |
| Opera Cloud | Block module | ⭐⭐⭐⭐ (50+) | Bulk | Overkill boutique |
| RoomRaccoon | Family bookings (2023) | ⭐⭐⭐ | Bulk | Cancel parcial bugs |
| Little Hotelier | ❌ NO | ⭐ | N clicks separados | Recepción manual |
| Sirvoy | Auto + bracket | ⭐⭐⭐⭐ | Bulk | — |

**Insight aplicado:** bracket visual + auto-detección (Cloudbeds/Sirvoy) + sub-cards explícitas (Mews) + cancel parcial con feedback inequívoco + 3 modos check-in para cubrir hostal per-bed (gap real en TODOS los competidores; solo Cloudbeds tiene per-bed parcial).

### 6.4 Diferenciador Zenix vs todos

Ningún PMS de los 6 analizados cubre simultáneamente:
- Push CRS en tiempo real con chip de confirmación visible (Cloudbeds sí, otros no).
- Cancel parcial de grupo con copy explícito de qué queda activo (todos confusos).
- Check-in adaptativo 3 modos incluyendo hostal per-bed (ninguno).
- Auto-detección de grupo sin wizard ni setup (Opera requiere, los demás auto pero sin opciones).

Esto es **diferenciador comercial documentado** frente al mercado boutique LATAM. Reflejar en `docs/zenix-sales-master.md` módulo Channel Manager.

---

## 7. Cronograma sugerido

| Día | Tarea |
|-----|-------|
| 1 | E1 copy refresh + verify preview (DONE) + arrancar E2 backend (event + outbound builder + worker dispatch BOOKING_CANCEL) |
| 2 | E2 frontend: CancelReservationDialog warning Airbnb + forcing function + chip post-push en BookingDetailSheet |
| 3 | E2 retry/manual endpoints + tests + sandbox E2E |
| 4 | E3 migration + schema + BookingNewHandler refactor (remover MULTI_ROOM conflict, crear group + N stays) |
| 5 | E3 BookingModifyHandler + cancelStay con `reservationGroupId` (emit MODIFY vs CANCEL según última active) |
| 6 | E3 ReservationGroupService + endpoint GET + endpoint bulk-checkin + raiseGroupBookingReceived notif |
| 7 | E3 frontend: GroupDetailSheet + BookingBlock bracket visual + sibling highlight |
| 8 | E3 frontend: GroupCheckinDialog 3 modos + PartialCancelDialog |
| 9 | E3 tests unit + integration |
| 10 | QA cohesión cross-feature + i18n strings + preview verify ambos flujos + sandbox E2E grupos |
| 11 | Buffer para refinamiento UX según feedback owner |
| 12-13 | Buffer / iteración / pre-merge cleanup |

---

## 8. Definition of done

- [ ] E1 copy refresh en ExtendConfirmDialog (✓ hecho).
- [ ] E2 cancel manual OTA dispara push CRS via outbox + chip post-push visible.
- [ ] E2 warning Airbnb portal manual cuando `otaName === 'airbnb'`.
- [ ] E2 DEAD_LETTER UI con retry + mark-manual.
- [ ] E3 schema `ReservationGroup` migrado + seeded.
- [ ] E3 BookingNewHandler crea group + N stays para `rooms.length > 1`. `MULTI_ROOM_BOOKING` conflict eliminado.
- [ ] E3 cancel parcial emite MODIFY (no CANCEL) si quedan siblings.
- [ ] E3 GroupDetailSheet + bracket calendar + 3 modos checkin + PartialCancelDialog.
- [ ] Notif SUPERVISOR cuando llega grupo nuevo (priority adaptativa).
- [ ] Tests unit + integration verde (target ≥85% coverage de archivos nuevos).
- [ ] E2E sandbox Channex (staging.channex.io) — cancel OTA + grupo 2 rooms.
- [ ] CLAUDE.md actualizado con decisiones §149-§158.
- [ ] zenix-sales-master.md actualizado con diferenciadores Channel Manager.
- [ ] Preview manual verificado en browser por owner.
