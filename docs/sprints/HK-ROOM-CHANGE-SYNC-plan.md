# Sprint HK-ROOM-CHANGE-SYNC — plan v1.0.0

> **Origen**: caso real recepción 2026-05-25 — "Llegó un huésped, le entregué
> la habitación, era la incorrecta, tuve que cambiar de cuarto. Las recamaristas
> ya tenían X programado para limpiar via cron. ¿Ven la data vieja en mobile?
> ¿Reciben notif del cambio?"
>
> **Status**: análisis arquitectural + sprint plan. Estimación 2-3 días-dev.
> **Decisión owner**: INCLUIR en v1.0.0 GA (caso operativo crítico).
>
> **Referencias**: CLAUDE.md §1, §33, §44-§55, §124, §125, §126.

---

## 1. El caso de uso exacto

```
07:00  MorningRosterScheduler (cron, §45) corre.
       Detecta GuestStay scheduled_checkin=today con room_id=R-101.
       Crea CleaningTask(PENDING) para R-101 con priority=URGENT
       hasSameDayCheckIn=true.
       Asigna automáticamente a Recamarista María (auto-assign §47).
       SSE 'task:planned' enviado.

09:30  María abre mobile app. Ve "R-101 — URGENT — guest llega 15:00".
       Comienza limpieza, marca IN_PROGRESS 10:00, DONE 10:35, VERIFIED 11:00.

12:00  Recepción confirmDeparture batch + activa tasks para checkouts AM.

14:50  Guest Carlos llega, asignado a R-101. Recepcionista hace check-in.

14:55  ⚠️  Recepcionista nota — Carlos pidió rooftop, R-101 es planta baja.
       Le ofrece R-205 (rooftop) que también está LIBRE+VERIFIED. Carlos acepta.

       → Recepción debe ejecutar "Mover habitación" en el calendar.

15:00  ❓ Estado actual del sistema:
        - Carlos.actualCheckin=14:50, roomId=R-101 (cambia a R-205)
        - R-101: ¿qué pasa con su estado?
        - R-205: ¿queda como occupied?
        - CleaningTask R-101 está VERIFIED — pero R-101 fue ocupado 5min,
          tiene maletas brevemente, sábanas tocadas → NECESITA RE-LIMPIEZA
        - María ya cerró su día. Mobile push?
```

---

## 2. Qué cubre la infra HOY (§125, §126, §33)

| Trigger | Comportamiento actual | Cubre el caso |
|---|---|---|
| `extendNewRoom` (DTO con reason=EXTENSION_NEW_ROOM o ROOM_MOVE) | Crea CleaningTask PENDING en el día del move para room origen (§125) | NO — `scheduledFor` es `activeSegment.checkOut`, no `today` |
| `executeMidStayRoomMove` (effectiveDate ≤ today) | Mismo pattern §125 — task PENDING para origen en `effectiveDate` | PARCIAL — funciona para mid-stay multi-noches, no testado para same-day mistake |
| MorningRosterScheduler upgrade-in-place (§125) | Promueve PENDING priority=MEDIUM → URGENT si nuevo arrival detected via segment | NO se ejecuta mid-day (cron es 7am) |
| SSE `task:planned` / `task:ready` | Push real-time a recamarista | ✅ Funcional pero solo si su mobile foreground |
| AppNotification persistencia (§99-§101) | Self-suppress + auto-mark-as-read | ✅ Si emitido por task creation |
| Push notification (Expo) | Background notif al móvil | ✅ Si emitted |

**Gap 1**: el caso "same-day check-in error mover habitación" NO es ni
`extendNewRoom` ni `executeMidStayRoomMove` legítimo — es **corrección de
error** de asignación. No tiene endpoint dedicado.

**Gap 2**: cuando se ejecuta el move, **R-101 que ya tenía task VERIFIED
no recibe automatically nueva task PENDING**. La logic actual asume "origen
necesita cleaning" pero solo crea task si la condición se cumple (no
revisita state).

**Gap 3**: la recamarista María tiene task R-101 marked como VERIFIED. Si
recepción genera task PENDING nueva para R-101 mismo día, ¿se asigna a
María de nuevo? ¿O AssignmentService.autoAssign decide? (§53 dice toda
task pasa por autoAssign).

**Gap 4**: notif a María. Si está fuera de su turno (cerró 14:00) — el
push debe llegar pero NO debe interpretarse como "vuelve a trabajar".
Política operativa decision: ¿se asigna a María overtime? ¿next-shift?
¿guardia rotativa?

---

## 3. Diseño propuesto

### 3.1 Endpoint backend nuevo

```typescript
// POST /v1/guest-stays/:stayId/correct-room-assignment
//
// Diferente de extendNewRoom + executeMidStayRoomMove porque NO es
// extensión legítima — es CORRECTION de error de asignación con
// efecto inmediato (post-checkin same-day).
//
// Backend service:
//   - Validate: stay.actualCheckin != null (post-check-in)
//   - Validate: stay.actualCheckout == null (no checked-out)
//   - Validate: same-day (stay.actualCheckin.date == today)
//   - Atomically:
//     1. Update guest_stays SET room_id = newRoomId
//     2. Update stay_segments SET room_id = newRoomId (active segment)
//     3. Crear CleaningTask(PENDING, URGENT) para oldRoomId
//        - priority URGENT porque puede haber otro arrival mismo día
//        - reason='ROOM_REASSIGNMENT_CORRECTION'
//     4. Si existía task PENDING/READY para newRoomId (porque era para
//        un futuro arrival hoy), no cancelar — ese arrival sigue
//        ocupando newRoomId via current stay (mismo stay redirigido)
//     5. Re-evaluar autoAssign de la nueva task
//     6. Emit SSE event 'task:reassignment' al recamarista actual + al
//        nuevo asignado (si distintos)
//     7. AppNotification ROOM_REASSIGNMENT_HOUSEKEEPER al asignado
//     8. AuditLog GUEST_STAY_ROOM_CORRECTION con actor + reason
```

### 3.2 Frontend mobile — sincronización

Mobile app de housekeeper recibe SSE `task:reassignment`:
- Si task del recamarista actual → invalidate query + toast "Tu día tiene
  cambios — limpia nueva R-101 URGENT" + sound alert
- Si NO es su task ya (re-asignada a otro) → toast info "Tu task de R-101
  fue re-asignada a Pedro — descansa"

Background (mobile cerrado): push notification.

### 3.3 Decision matrix per scenario

| Scenario | Old task state | Action |
|---|---|---|
| Guest A en R-101, mistake, mover a R-205 (R-205 vacant + clean) | R-101: VERIFIED → crear nueva PENDING URGENT; R-205: AVAILABLE → no action | Mover guest. R-101 needs re-clean. R-205 already clean. |
| Guest A en R-101, mistake, R-205 también necesita limpieza | R-101: VERIFIED; R-205: PENDING/READY | Mover guest. R-101 needs re-clean. R-205 ya tenía task — escalar prioridad URGENT (Carlos llegando ya). |
| Guest A en R-101, mistake, R-205 OCUPADA | N/A | AvailabilityService rejects move. UI muestra error. |
| Guest A en R-101 IN_PROGRESS limpieza, recepción quiere mover a R-205 | R-101 task IN_PROGRESS | Bloquear move OR notif "limpieza en progreso, espera". Decisión §54 D11 (IN_PROGRESS es inmutable). |

### 3.4 Política operativa (decisión owner needed)

Cuando el recamarista que tenía la task original ya cerró su turno:

| Opción | Pros | Contras |
|---|---|---|
| **A.** Auto-asignar al next-shift recamarista que esté en turno | Continuidad operativa | Puede no haber otro recamarista (turno único) |
| **B.** Push overtime al original housekeeper con consent UI ("¿Aceptas overtime?") | Pago justo, no overload silente | Lento si housekeeper no responde rápido |
| **C.** Notif al SUPERVISOR para que decida manualmente | Decisión humana de calidad | Bottleneck supervisor |
| **D.** Híbrido: A first, fallback to C si no hay shift activo | Best of both | Más LOC |

Recomendación: **D** — auto-asign next-shift active, si no hay → notif SUPERVISOR
ACTION_REQUIRED.

---

## 4. Schema additions

### CleaningTask — agregar reason enum value

```prisma
// Existing
enum CleaningCancelReason {
  GUEST_CANCELLED
  ROOM_BLOCK
  // ...
}

// Agregar a TaskLogEvent
enum TaskLogEvent {
  // ... existing
  ROOM_REASSIGNMENT_CORRECTION  // §177 D-HK-ROOM-CHANGE
}
```

### GuestStayLog — agregar action

```prisma
enum StayLogAction {
  // ... existing
  ROOM_REASSIGNMENT_CORRECTION  // post-checkin error correction
}
```

### Notification type — agregar

```prisma
enum AppNotificationType {
  // ...
  ROOM_REASSIGNMENT_HOUSEKEEPER  // sent to housekeeper when their task moved
}
```

---

## 5. Estimación + scope v1.0.0

**Sprint HK-ROOM-CHANGE-SYNC** (2-3 días-dev secuencial):

| Day | Foco |
|---|---|
| 1 | Backend endpoint POST /correct-room-assignment + service + audit + tests |
| 2 | SSE event wiring + AppNotification trigger + push notif Expo |
| 3 | Mobile UI: receive event + toast + sound + invalidate; refactor pre-existing assignment service |

**Estimado**: 2-3 días-dev secuencial. Incluir antes de QA-α (Day 20+1 en
roadmap actual).

---

## 6. Edge cases documentados

1. **Move durante limpieza IN_PROGRESS**: §54 D11 dice IN_PROGRESS es inmutable.
   Recepción NO puede mover. Error friendly al recepcionista.

2. **Move sin nueva room limpia**: si R-205 no está clean (DIRTY status),
   recepción tiene 2 opciones via dialog:
   - Esperar (R-205 será limpiada — task URGENT auto-created)
   - Asignar a otra R-XXX que sí esté clean

3. **Move durante checkout 2-phase**: si guest ya está en confirmDeparture
   batch, no aplica (no hay guest activo). El "move" es checkout normal.

4. **Move con OTA-collect payment**: el folio sigue siendo el mismo stayId.
   Mover room NO afecta payment. CFDI E no required (no es cancelación).

5. **Cascada bedId en HOSTAL**: si la new room es dorm con per-bed,
   reseteamos bedId asignado + se hace re-pick por recepción.

---

## 7. Diferenciador comercial

**Cloudbeds**: el room change post-check-in dispara cleaning task pero NO
notifica al housekeeper actual via push. Mobile housekeeper ve el cambio
hasta el próximo refresh manual.

**Mews**: tiene "room move" feature pero no distingue corrección de error
vs mid-stay legítimo. Cleaning task se crea pero no escala priority.

**Little Hotelier / RoomRaccoon**: room change cierra el booking actual
y abre uno nuevo (workflow tipo "cancel + re-create") — pierde audit
trail continuo del stay.

**Zenix v1.0.0 (post este sprint)**: room correction como first-class
operation con:
- Endpoint dedicado (no es extension ni cancel)
- Re-asign automático con next-shift fallback
- Push real-time + SSE foreground
- Audit log preserva continuidad stay (mismo stayId)
- Toast info al housekeeper original "Tu task fue re-asignada — descansa"

Ningún competidor LATAM tiene esto end-to-end.

---

## 8. Decisión a registrar (CLAUDE.md al ejecutar sprint)

> **§177 D-HK-ROOM-CHANGE**: room change post-checkin same-day = operación
> dedicada `correctRoomAssignment(stayId, newRoomId, reason)`. Crea
> CleaningTask URGENT para oldRoom + re-asigna autoAssign con fallback
> SUPERVISOR notification si no hay housekeeper next-shift. SSE
> `task:reassignment` + push Expo + AuditLog ROOM_REASSIGNMENT_CORRECTION
> append-only.

---

## 9. Acciones pendientes (no para sprint actual)

1. Confirmar decisión política operativa (§3.4 opciones A/B/C/D) con
   owner antes de implementar.
2. UI mockup para la "Mover habitación" dialog en BookingDetailSheet —
   detectar same-day post-checkin → flow correction (no extension).
3. Mobile housekeeper UX para el toast + sound al recibir reassignment
   notif.

**No bloquea ningún sprint actual** — se ejecuta cuando se priorice
post-Day 20.
