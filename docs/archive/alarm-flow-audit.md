# Audit del flujo de alarma — recepción → recamarista asignada

> Verificación de que la alarma operativa solo dispara para la recamarista
> que tiene asignada esa habitación en la plantilla del sistema, y que
> esa plantilla (StaffShift + StaffCoverage) es la fuente de verdad.

---

## Conclusión ejecutiva

✅ **La fuente de verdad es correcta**: `StaffShift` (turnos semanales) +
`StaffCoverage` (qué habitaciones cubre cada staff) consultadas por
`AssignmentService.decide()` con las 3 reglas D-en orden:
**COVERAGE_PRIMARY → COVERAGE_BACKUP → ROUND_ROBIN**. CLAUDE.md §38-39.

✅ **El happy-path** (tarea pre-asignada en el roster matutino + confirmación
de salida posterior) funciona correctamente — la alarma llega solo a la
recamarista asignada.

⚠️ **Gap detectado** en un sub-camino: cuando una tarea arriba a
`confirmDeparture` aún `UNASSIGNED` y la auto-asignación post-departure
es la que la lleva a READY, **el evento `task:ready` NO se vuelve a
emitir**. Solo se emite `task:auto-assigned`. La alarma móvil escucha
únicamente `task:ready` → en ese sub-camino la recamarista NO recibe
la alarma.

🔧 **Fix aplicado en este reporte** (commit posterior): AssignmentService,
al transicionar UNASSIGNED→READY, emite también `task:ready` + push
notification al staff recién asignado.

---

## 1) Diagrama de flujo completo

```
                            ┌─────────────────────────────────┐
                            │  PLANTILLA DEL SISTEMA           │
                            │  (Settings web, fuente de verdad)│
                            │                                  │
                            │  • StaffShift                    │
                            │    dayOfWeek 0-6, startTime,     │
                            │    endTime, effectiveFrom/Until │
                            │                                  │
                            │  • StaffCoverage                 │
                            │    roomId ↔ staffId              │
                            │    isPrimary (1 titular)         │
                            │    weight (suplencias)           │
                            └─────────────────────────────────┘
                                        │
                                        │ leídas por
                                        ▼
                       ┌──────────────────────────────────────┐
                       │  AvailabilityQueryService            │
                       │  .getStaffOnShiftToday(propertyId, t)│
                       │  Multi-tz: usa Intl.DateTimeFormat   │
                       │  con PropertySettings.timezone.      │
                       └──────────────────────────────────────┘
                                        │
                                        │ alimenta
                                        ▼
                       ┌──────────────────────────────────────┐
                       │  AssignmentService.decide()          │
                       │  3 reglas D10 en orden:              │
                       │    1. COVERAGE_PRIMARY               │
                       │    2. COVERAGE_BACKUP                │
                       │    3. ROUND_ROBIN (tiebreak por      │
                       │       menor carga del día)           │
                       │  Filtros previos:                    │
                       │    • role=HOUSEKEEPER                │
                       │    • capability requerida (CLEANING) │
                       │    • on-shift hoy (no ausente)       │
                       └──────────────────────────────────────┘

  ── Camino A — Happy path (pre-asignada al planificar AM) ─────────

  07:00 │  MorningRosterScheduler cron
        │    • crea CleaningTask (PENDING)
        │    • llama autoAssign() ─────► task.assignedToId = "maría"
        │    • estado: PENDING
        │
  09:30 │  Recepción: confirmDeparture (huésped salió)
        │    • CheckoutsService transición PENDING → READY
        │    • status quedó READY directo (ya tenía assignedToId)
        │    • NO entra a tasksToReevaluate
        │    • dispatchNotifications:
        │       ├─ push.sendToStaff("maría", "Hab. 203 lista") ✓
        │       └─ SSE notifications.emit('task:ready',
        │             { taskId, roomNumber, assignedToId: "maría" })
        │
  09:30 │  Mobile (María):
        │    • IncomingTaskAlarmHost recibe SSE
        │    • Filter: assignedToId === currentUser.id ✓
        │    • Filter: role === 'HOUSEKEEPER' ✓
        │    • Vibración persistente + overlay full-screen
        │
        │  Mobile (Pedro/Luis/Carlos):
        │    • Reciben el mismo SSE (canal por property)
        │    • Filter: assignedToId !== Pedro.id → NO TRIGGER ✓
        │    • Su Hub se refresca pero sin alarma ✓


  ── Camino B — Tarea UNASSIGNED al confirmar (cron 7am sin staff) ─

  07:00 │  Cron: NO había staff disponible (todos en falta)
        │    • crea CleaningTask (PENDING, assignedToId=null)
        │
  09:30 │  Recepción: confirmDeparture
        │    • $transaction: status PENDING → UNASSIGNED
        │      (porque no había assignedToId previo)
        │    • tasksToReevaluate.push(taskId)
        │
        │  Post-tx (fire-and-forget):
        │    • assignment.autoAssign(taskId)
        │      ├─ decide() ahora SÍ encuentra a Pedro on-shift
        │      ├─ tx update task.assignedToId = "pedro"
        │      ├─                  task.status = READY
        │      └─ SSE notifications.emit('task:auto-assigned', {...})
        │
        │  ⚠️ AQUÍ ESTÁ EL GAP DETECTADO:
        │  AssignmentService NO emite 'task:ready' (solo
        │  'task:auto-assigned'). Mobile alarm host escucha SOLO
        │  'task:ready' → Pedro NO recibe alarma física en su mobile.
        │
        │  Mientras tanto:
        │    • dispatchNotifications corrió en paralelo
        │    • Vio readyTasks=[] (la tarea aún era UNASSIGNED al fetch)
        │    • Vio unassignedTasks=[task] → emitió 'task:unassigned'
        │      al supervisor (web KanbanPage), pero NADA al mobile
        │      del staff


  ── Camino C — confirmDeparture per-bed manual con bedId ──────────

  Igual que A si la tarea de esa cama ya estaba pre-asignada.
  Igual que B con el gap si quedó UNASSIGNED.
```

---

## 2) Estado actual — qué está bien

### A. Configuración como fuente de verdad — correcta

`AssignmentService.decide()` (líneas 138-205) consulta:

| Fuente | Uso |
|--------|-----|
| `StaffShift` | "¿Quién está en turno hoy?" — vía `availability.getStaffOnShiftToday()` |
| `StaffShiftException` | OFF/EXTRA/MODIFIED tienen precedencia sobre StaffShift |
| `StaffCoverage` | "¿De quién es esta habitación?" — primary + weight |
| `HousekeepingStaff.capabilities` | Filtro de capability requerida |
| `HousekeepingStaff.role` | Solo HOUSEKEEPER, no SUPERVISOR/RECEPTIONIST |

### B. Filtro mobile correcto

`IncomingTaskAlarmHost`:
```ts
if (!d.assignedToId || d.assignedToId !== user.id) return
if (user.role !== 'HOUSEKEEPER') return
```

Doble filtro:
- **Por staff específico**: si la tarea es de María, solo el mobile de María vibra
- **Por rol**: recepcionistas/supervisores no reciben alarma física

### C. Canal SSE scoped por property

`NotificationsService.emit(propertyId, ...)` solo envía el evento a clientes
que se conectaron con un JWT de esa propiedad. Staff de otra propiedad
nunca recibe eventos cruzados (multi-tenant safety).

### D. Push (notificación del sistema operativo) correcto

`dispatchNotifications()` agrupa por `assignedToId` y envía push solo a
ese staff via `push.sendToStaff(assignedToId, ...)`. No spam-broadcasting.

---

## 3) Gap detectado — sub-camino UNASSIGNED→READY post-departure

### Síntoma

Cuando la tarea llega UNASSIGNED a `confirmDeparture` y la
auto-asignación post-departure (line 665) la transiciona a READY:

- ✅ `task.assignedToId` se actualiza correctamente
- ✅ `task.status` pasa a READY
- ✅ Web recibe `task:auto-assigned` (KanbanPage actualizada)
- ❌ **Mobile NO recibe alarma** — falta el evento `task:ready` post-asignación
- ❌ **Push notification NO sale** — `dispatchNotifications` ya corrió antes con el task aún UNASSIGNED

### Causa raíz

`AssignmentService.autoAssign()` en `apps/api/src/assignment/assignment.service.ts`
líneas 99-126:
- Hace el update tx ✓
- Emite `task:auto-assigned` ✓
- **NO emite `task:ready`**
- **NO llama `push.sendToStaff()`**

---

## 4) Fix propuesto (a aplicar en commit siguiente)

En `AssignmentService.autoAssign()`, cuando la transición es
`UNASSIGNED → READY` (no `PENDING → PENDING-pre-assigned`):

```ts
// After tx commits — emit task:ready + push
if (priorStatus === 'UNASSIGNED' && nextStatus === 'READY') {
  this.notifications.emit(propertyId, 'task:ready', {
    taskId,
    unitId: task.unitId,
    roomId: task.unit.roomId,
    roomNumber: task.unit.room.number,
    priority: task.priority,
    assignedToId: decision.staffId,
    hasSameDayCheckIn: task.hasSameDayCheckIn,
    carryoverFromDate: task.carryoverFromDate?.toISOString() ?? null,
  })
  void this.push.sendToStaff(
    decision.staffId,
    task.hasSameDayCheckIn ? '🔴 Limpieza urgente' : '🛏️ Lista para limpiar',
    `Hab. ${task.unit.room.number} — Lista para limpiar`,
    { type: 'task:ready', taskIds: [taskId] },
  )
}
```

Efecto:
- Mobile alarm host recibe el `task:ready` con `assignedToId` correcto
- La recamarista recién asignada vibra como en el camino A
- Push notification del sistema operativo llega
- Web sigue recibiendo `task:auto-assigned` para audit trail (no se quita)

---

## 5) Casos edge confirmados

| Caso | Comportamiento esperado | Comportamiento actual |
|------|-------------------------|------------------------|
| María on-shift, primary de Hab. 203 | Solo María recibe alarma | ✅ |
| María off-shift, Pedro backup → toma 203 | Solo Pedro recibe alarma | ✅ |
| Nadie on-shift con coverage → ROUND_ROBIN | Quien gane el tiebreak recibe alarma | ✅ |
| Tarea UNASSIGNED al cron, asigna ahora a Pedro | Pedro recibe alarma | ❌ → fix arriba |
| Tarea cancelada (CANCELLED) | Nadie vibra | ✅ |
| Tarea verificada (VERIFIED) | Nadie vibra | ✅ |
| Recepcionista en mobile (no HOUSEKEEPER) | NO recibe alarma | ✅ filtro de rol |
| Mismo evento llega a 5 mobiles, solo 1 asignado | Solo 1 vibra, los otros refresh silencioso | ✅ |
| Staff de otra propiedad | No recibe el evento (canal scoped) | ✅ |

---

## 6) Validaciones operativas

Para garantizar que la plantilla del sistema sigue siendo la fuente de
verdad y la alarma sigue funcionando correctamente cuando la
configuración cambia:

1. **Cambio de StaffShift** (admin pone a María off los lunes):
   - Lunes en `confirmDeparture`: `availability.getStaffOnShiftToday`
     ya excluye a María → autoAssign cae en backup → alarma llega al
     backup, no a María ✓

2. **Cambio de StaffCoverage** (admin reasigna Hab. 203 de María a Pedro):
   - Próxima `confirmDeparture` en 203: `decide()` ve a Pedro como
     primary → asigna a Pedro → alarma a Pedro ✓

3. **StaffShiftException OFF para hoy** (María avisó vacaciones imprevistas):
   - `availability.getStaffOnShiftToday` aplica precedencia de
     exceptions → María excluida del eligible set → fallback automático ✓

4. **Reasignación manual desde recepción** (override):
   - Manual via `tasks.assignTask(taskId, { staffId })` (Sprint 8H)
   - Hoy NO emite `task:ready` (similar gap) — Sprint 9 polish

---

## 7) Recomendaciones de mejora (futuras)

| Idea | Prioridad | Comentario |
|------|-----------|------------|
| Tests E2E del camino UNASSIGNED→READY | Alta | Para no regresar el bug |
| Tests del IncomingTaskAlarmHost (filtros) | Alta | Mock SSE event + verify alarm fires only for matching user |
| Confirmar acknowledge en backend (audit) | Media | `POST /v1/tasks/:id/ack-alarm` para registrar quién y cuándo silenció. Útil para reportes de respuesta |
| Snooze (5 min) en lugar de ack inmediato | Baja | Si la HK está limpiando otra hab. ahora, "snooze 5 min" mantiene contexto |
| Repeat después de N min sin ack | Baja | Anti-olvido — si no acknowledged en 3 min, vuelve a vibrar |
| Sound asset configurable per-property | Media | Hoteles con marca propia |

---

## Referencias

- CLAUDE.md §38 (D4 — auto-asignación determinística)
- CLAUDE.md §39 (D5 — cobertura es soft, no hard)
- CLAUDE.md §44 (D10 — toda tarea creada por flow PMS pasa por autoAssign)
- `docs/research-housekeeping-hub.md` §1.3 SDT autonomy
- `apps/api/src/assignment/assignment.service.ts` — implementation
- `apps/api/src/checkouts/checkouts.service.ts` líneas 609-680 — confirmDeparture
- `apps/mobile/src/features/housekeeping/alarm/IncomingTaskAlarmHost.tsx` — filtro mobile
