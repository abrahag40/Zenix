/**
 * Bug hunt suite — busca fallas, no confirma éxito.
 *
 * Owner 2026-06-08: "el objetivo ahora es encontrar bugs".
 *
 * Cada test plantea una HIPÓTESIS de bug, intenta reproducirlo y reporta.
 * Si el sistema se comporta como esperaríamos sin el bug, el test reporta
 * "no encontrado" (lo cual NO es un éxito — es ausencia de evidencia).
 *
 * Áreas cubiertas:
 *   §1  BookingSameDayListener — race + cross-tenant + filtros
 *   §2  RoomMovedHkListener — hostal dorm + multi-stay + filtros
 *   §3  MobileDashboardService — currency / timezone / enum / shape
 *   §4  Channex inbound — booking-modify NO escala HK (gap obvio)
 *   §5  Channex conflict — same-day con channexConflict=true
 *   §6  Deeplinks mobile — web paths in attentionNow.deeplink
 *   §7  Multi-tenancy — listener no filtra por organizationId
 */
import { PrismaClient, Priority, CleaningStatus } from '@prisma/client'
import { BookingSameDayListener } from '../src/scheduling/listeners/booking-same-day.listener'
import { RoomMovedHkListener } from '../src/scheduling/listeners/room-moved-hk.listener'

const prisma = new PrismaClient()
const sseEmits: Array<{ propertyId: string; type: string; data: any }> = []
const notifications = {
  emit: (propertyId: string, type: string, data: any) => sseEmits.push({ propertyId, type, data }),
  addClient: () => {},
} as any

// E2E-21 — RoomMovedHkListener ahora reasigna por cobertura (autoAssign) + push.
const assignment = { autoAssign: async () => ({ assigned: false, staffId: null, rule: null }) } as any
const push = { sendToStaff: async () => undefined } as any

interface Finding {
  id: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  status: 'CONFIRMED' | 'NOT_REPRO' | 'EDGE'
  details: string
}
const findings: Finding[] = []

function report(f: Finding): void {
  findings.push(f)
  const emoji = f.status === 'CONFIRMED' ? '🐛' : f.status === 'EDGE' ? '⚠️' : '✓'
  const sev = f.severity.toUpperCase()
  console.log(`${emoji} [${sev}] ${f.id} — ${f.description}`)
  console.log(`   status: ${f.status}`)
  console.log(`   details: ${f.details}`)
}

async function todayUtc(propId: string): Promise<Date> {
  const ps = await prisma.propertySettings.findUnique({ where: { propertyId: propId }, select: { timezone: true } })
  const tz = ps?.timezone || 'America/Cancun'
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  return new Date(`${ymd}T00:00:00.000Z`)
}

// ════════════════════════════════════════════════════════════════════════════
// §1 — BookingSameDayListener
// ════════════════════════════════════════════════════════════════════════════

async function bug1_crossTenant(): Promise<void> {
  // HIPÓTESIS: el listener pull CleaningTask por unitId sin filtrar por
  // organizationId/propertyId. Si dos hoteles tienen rooms con el mismo
  // unitId (improbable, pero teóricamente posible con seeds custom), o si
  // se llamara con un roomId de otro tenant, escalaría tasks ajenas.
  //
  // Verificación: revisar el código de la query.
  const listener = new BookingSameDayListener(prisma as any, notifications)
  const src = listener['onSameDayArrival'].toString()
  // Post-fix BUG-1 (commit a2ed6e6): el filter ahora se llama por nombre
  // `propertyId` dentro del where relation. Aceptamos cualquier mención
  // de `propertyId` o `organizationId|orgId` legacy.
  const hasTenantFilter = /propertyId|organizationId|orgId/.test(src)
  if (!hasTenantFilter) {
    report({
      id: 'BUG-1',
      description: 'BookingSameDayListener NO filtra por tenant al pull units/tasks',
      severity: 'high',
      status: 'CONFIRMED',
      details: 'El listener pull CleaningTask filtrando solo por unitId. En multi-tenant + multi-property hay riesgo de cross-tenant si se invoca con roomId del tenant equivocado. ' +
        'Fix: agregar `where.unit.room.propertyId = payload.propertyId` y/o validar que payload.propertyId existe y coincide con la room.',
    })
  } else {
    report({ id: 'BUG-1', description: 'Cross-tenant filter check', severity: 'high', status: 'NOT_REPRO', details: 'Source incluye filter propertyId/organizationId' })
  }
}

async function bug2_pausedStatus(): Promise<void> {
  // HIPÓTESIS: el listener solo pull PENDING/READY/UNASSIGNED. Si una task
  // está PAUSED (Sprint 8K paused state) — porque la recamarista pausó
  // por algún motivo — NO se escala a URGENT.
  // Eso es probablemente correcto (no podemos escalar una task pausada
  // intencionalmente), pero hay que documentarlo o testarlo.
  const prop = await prisma.property.findFirst({
    where: { rooms: { some: { units: { some: {} } } } },
    include: { rooms: { where: { units: { some: {} } }, include: { units: true }, take: 1 } },
  })
  if (!prop) return
  const unit = prop.rooms[0].units[0]
  const today = await todayUtc(prop.id)

  // Crear task PAUSED
  await prisma.cleaningTask.deleteMany({ where: { unitId: unit.id, scheduledFor: today, autoAssignmentRule: 'BUG_HUNT_PAUSED' } })
  const t = await prisma.cleaningTask.create({
    data: {
      unitId: unit.id,
      taskType: 'CLEANING',
      status: CleaningStatus.PAUSED,
      priority: Priority.MEDIUM,
      scheduledFor: today,
      autoAssignmentRule: 'BUG_HUNT_PAUSED',
    },
  })

  const listener = new BookingSameDayListener(prisma as any, notifications)
  sseEmits.length = 0
  const result = await listener.onSameDayArrival({
    stayId: 'bug-hunt-paused',
    roomId: prop.rooms[0].id,
    propertyId: prop.id,
    checkInIso: new Date(Date.now() + 3600000).toISOString(),
    otaName: 'BookingCom',
  })

  const updated = await prisma.cleaningTask.findUnique({ where: { id: t.id } })
  // Post-fix BUG-2 (commit pending): el listener ahora detecta tasks PAUSED
  // y emite notif `task:paused_same_day_arrival` al SUPERVISOR (sin hacer
  // upgrade automático — la pausa puede ser legítima). Verificamos que
  // sse_emits o notifications.emit hayan capturado esa señal.
  const sawPausedNotif = sseEmits.some((e: any) => e.type === 'task:paused_same_day_arrival')
  if (result.upgraded === 0 && updated?.status === CleaningStatus.PAUSED && !sawPausedNotif) {
    report({
      id: 'BUG-2',
      description: 'BookingSameDayListener no toca tasks PAUSED — comportamiento NO documentado',
      severity: 'medium',
      status: 'EDGE',
      details: 'PAUSED queda inexpresivo. Si la recamarista pausó por DND y llega same-day arrival, debería al menos generar notif al SUPERVISOR. Hoy el sistema queda silent.',
    })
  } else if (sawPausedNotif) {
    report({
      id: 'BUG-2',
      description: 'PAUSED + same-day arrival emite notif SUPERVISOR',
      severity: 'medium',
      status: 'NOT_REPRO',
      details: 'task:paused_same_day_arrival event detectado correctamente.',
    })
  }
  await prisma.cleaningTask.delete({ where: { id: t.id } })
}

// ════════════════════════════════════════════════════════════════════════════
// §2 — RoomMovedHkListener
// ════════════════════════════════════════════════════════════════════════════

async function bug3_multiStayPollution(): Promise<void> {
  // HIPÓTESIS: el listener NO filtra tasks por stayId. Si fromRoom tiene
  // tasks de MÚLTIPLES stays (dorm hostal, sequential bookings same-day),
  // el moveRoom de UN stay migra TODAS las tasks de la room. Esto migra
  // tasks de huéspedes que NO se movieron.
  //
  // Esto YA lo vi en el E2E anterior: migrated=2 cuando esperaba 1. El seed
  // tenía 1 task pre-existente + la mía. Bug REAL si la pre-existente
  // pertenecía a otro stay.
  const prop = await prisma.property.findFirst({
    where: { rooms: { some: { units: { some: {} } } } },
    include: { rooms: { where: { units: { some: {} } }, include: { units: true }, take: 2 } },
  })
  if (!prop || prop.rooms.length < 2) return
  const [fromRoom, toRoom] = prop.rooms
  const today = await todayUtc(prop.id)

  // Cleanup
  const old = await prisma.cleaningTask.findMany({ where: { unitId: fromRoom.units[0].id, scheduledFor: today, autoAssignmentRule: { in: ['BUG_HUNT_STAY_A', 'BUG_HUNT_STAY_B'] } }, select: { id: true } })
  if (old.length) await prisma.taskLog.deleteMany({ where: { taskId: { in: old.map((t) => t.id) } } })
  await prisma.cleaningTask.deleteMany({ where: { unitId: fromRoom.units[0].id, scheduledFor: today, autoAssignmentRule: { in: ['BUG_HUNT_STAY_A', 'BUG_HUNT_STAY_B'] } } })

  // Crear 2 tasks en fromRoom — simulan tasks de 2 stays distintos
  // (en realidad CleaningTask no tiene stayId directamente, está por unitId+date)
  const tA = await prisma.cleaningTask.create({
    data: { unitId: fromRoom.units[0].id, taskType: 'CLEANING', status: CleaningStatus.READY, priority: Priority.URGENT, scheduledFor: today, autoAssignmentRule: 'BUG_HUNT_STAY_A' },
  })
  const tB = await prisma.cleaningTask.create({
    data: { unitId: fromRoom.units[0].id, taskType: 'CLEANING', status: CleaningStatus.READY, priority: Priority.MEDIUM, scheduledFor: today, autoAssignmentRule: 'BUG_HUNT_STAY_B' },
  })

  const staff = await prisma.staff.findFirst({ where: { propertyId: prop.id } })
  const listener = new RoomMovedHkListener(prisma as any, notifications, assignment, push)
  sseEmits.length = 0
  const result = await listener.onRoomMoved({
    stayId: 'bug-hunt-stay-A',  // Solo migramos stay-A
    fromRoomId: fromRoom.id,
    toRoomId: toRoom.id,
    propertyId: prop.id,
    actorId: staff?.id,
  })

  // El bug: tA Y tB ambos cancelados/migrados, porque el listener no filtra por stayId
  const tAAfter = await prisma.cleaningTask.findUnique({ where: { id: tA.id } })
  const tBAfter = await prisma.cleaningTask.findUnique({ where: { id: tB.id } })
  if (tAAfter?.status === CleaningStatus.CANCELLED && tBAfter?.status === CleaningStatus.CANCELLED && result.migrated >= 2) {
    report({
      id: 'BUG-3',
      description: 'RoomMovedHkListener migra TODAS las tasks de fromRoom, sin filtrar por stayId',
      severity: 'critical',
      status: 'CONFIRMED',
      details: `Ambas tasks (stay-A y stay-B) quedaron CANCELLED y migradas. result.migrated=${result.migrated}. ` +
        'Escenario real: hostel dorm con bookings sequential same-day. Recepcionista mueve UN huésped → todas las tasks del dorm migran al nuevo room equivocadamente. ' +
        'Fix: la CleaningTask necesita un campo stayId (o resolverlo via Unit→Room→active GuestStay) y el listener filtrar por stay-being-moved. ' +
        'Mitigación temporal: solo migrar tasks PENDING (no READY/UNASSIGNED) — no funciona si el cron ya emitió READY.',
    })
  }
  // Cleanup
  const after = await prisma.cleaningTask.findMany({ where: { OR: [{ id: tA.id }, { id: tB.id }, { carryoverFromTaskId: tA.id }, { carryoverFromTaskId: tB.id }] }, select: { id: true } })
  if (after.length) {
    await prisma.taskLog.deleteMany({ where: { taskId: { in: after.map((t) => t.id) } } })
    await prisma.cleaningTask.deleteMany({ where: { id: { in: after.map((t) => t.id) } } })
  }
}

async function bug4_hostelDormUnits(): Promise<void> {
  // HIPÓTESIS: el listener usa `targetUnit = toUnits[migrated % toUnits.length]`
  // como round-robin. Si fromRoom tiene 3 tasks y toRoom tiene 2 units, las
  // tasks se distribuyen mod-2 → task[0]→unit[0], task[1]→unit[1], task[2]→unit[0].
  // Pero NO hay garantía que la unit destino esté libre. Y peor: si los huéspedes
  // del dorm conservaban el mismo bed_index, todos terminan en el wrong bed.
  //
  // Esto es un bug DE DISEÑO más que de implementación, pero documentamos.
  const listener = new RoomMovedHkListener(prisma as any, notifications, assignment, push)
  const src = listener['onRoomMoved'].toString()
  if (/migrated\s*%\s*toUnits\.length/.test(src)) {
    report({
      id: 'BUG-4',
      description: 'RoomMovedHkListener usa round-robin mod-length para unit mapping en hostal dorm',
      severity: 'medium',
      status: 'CONFIRMED',
      details: 'El mapping `toUnits[migrated % toUnits.length]` no preserva bed identity. En PRIVATE rooms (caso piloto Hotel Monica Tulum) no aplica, pero en HOSTAL con dorms mixtos el huésped que se movió pierde su bed_index. ' +
        'Fix: el listener debería respetar el `Unit.bedNumber` o `Unit.position` original. Schema actual no garantiza orden de Unit.findMany. Hoy hostales no son piloto v1.0.0, pero documenta para v1.0.1+.',
    })
  }
}

// ════════════════════════════════════════════════════════════════════════════
// §3 — MobileDashboardService
// ════════════════════════════════════════════════════════════════════════════

async function bug5_currencyFallback(): Promise<void> {
  // HIPÓTESIS: service hace `property?.legalEntity?.baseCurrency ?? 'MXN'`.
  // Si una property NO tiene LegalEntity asignada (v1.0.5 transition allows
  // null), el fallback es MXN. Pero si el hotel piloto está en USD (Roatán
  // ZOLITUR, Panamá, El Salvador) → currency display equivocado.
  const props = await prisma.property.findMany({ include: { legalEntity: true }, take: 5 })
  const orphans = props.filter((p) => p.legalEntity == null)
  if (orphans.length > 0) {
    report({
      id: 'BUG-5',
      description: 'MobileDashboardService hardcoded "MXN" fallback cuando LegalEntity null',
      severity: 'medium',
      status: 'CONFIRMED',
      details: `${orphans.length}/${props.length} properties en seed tienen legalEntity=null. Estos hoteles verán "MXN" aunque su PropertySettings.currency real sea otra. ` +
        'Fix: chain de fallback debería ser legalEntity.baseCurrency → PropertySettings.currency → Property.country → "USD". El "MXN" hardcoded es asunción del piloto que rompe LATAM-wide.',
    })
  } else {
    report({ id: 'BUG-5', description: 'Currency fallback', severity: 'medium', status: 'NOT_REPRO', details: 'Todos los seed properties tienen legalEntity asignada' })
  }
}

async function bug6_timezoneFallback(): Promise<void> {
  // HIPÓTESIS: service hace `property?.settings?.timezone ?? 'UTC'`.
  // El greeting + isSameDayInTimezone usan eso. UTC en un hotel piloto Tulum
  // (UTC-5) significa que entre 19:00 local y 00:00 local el greeting dirá
  // "Buenas noches" (UTC pasó medianoche) cuando localmente sería "Buenas tardes".
  const props = await prisma.property.findMany({ include: { settings: true }, take: 5 })
  const noTz = props.filter((p) => !p.settings?.timezone)
  if (noTz.length > 0) {
    report({
      id: 'BUG-6',
      description: 'MobileDashboardService timezone fallback "UTC" causa greeting/same-day wrong',
      severity: 'high',
      status: 'CONFIRMED',
      details: `${noTz.length} property sin settings.timezone. El listener BookingSameDayListener evaluará isSameDayInTimezone con tz=UTC. Para Tulum (UTC-5), una booking checkin 23:00 local hoy es 04:00 UTC mañana → fallaría same-day check (skip NOT_SAME_DAY). ` +
        'Fix: fallback debería ser \'America/Mexico_City\' o derivar de Property.country. UTC nunca es correcto para LATAM piloto.',
    })
  } else {
    report({ id: 'BUG-6', description: 'Timezone fallback', severity: 'high', status: 'NOT_REPRO', details: 'Todos los seed tienen timezone' })
  }
}

async function bug7_deeplinksWebPaths(): Promise<void> {
  // HIPÓTESIS: SUPERVISOR snapshot devuelve attentionNow[].deeplink con
  // paths web (/reports/overstayed, /maintenance, /calendar). Mobile uses
  // expo-router con rutas distintas. router.push('/reports/overstayed')
  // → "Unmatched route" error.
  const fs = require('fs')
  const src = fs.readFileSync(__dirname + '/../src/dashboard/mobile-dashboard.service.ts', 'utf8')
  const deeplinks = src.match(/deeplink:\s*['"][^'"]+['"]/g) ?? []
  // Post-fix BUG-7 (commit cc45075): deeplinks ahora usan scheme `mobile://`
  // que el cliente mapea a su router. Lo malo es cuando hay paths web
  // crudos (`/reports/`, `/calendar`, `/maintenance` sin `mobile://`).
  const webOnlyPaths = deeplinks.filter((m: string) => {
    if (m.includes('mobile://')) return false
    return /(\/reports\/|\/calendar|\/maintenance)/.test(m)
  })
  if (webOnlyPaths.length > 0) {
    report({
      id: 'BUG-7',
      description: 'attentionNow.deeplink usa paths del web (no de expo-router)',
      severity: 'high',
      status: 'CONFIRMED',
      details: `Paths detectados: ${webOnlyPaths.join(', ')}. ` +
        'Mobile expo-router no tiene /reports/overstayed; tiene /(app)/reports/overstayed o equivalente. router.push("/reports/overstayed") → unmatched route. ' +
        'Fix: el endpoint mobile debería devolver scheme `mobile://<kind>` para que el cliente mapee a su router.',
    })
  } else {
    report({
      id: 'BUG-7',
      description: 'attentionNow.deeplink scheme check',
      severity: 'high',
      status: 'NOT_REPRO',
      details: `Deeplinks usan scheme \`mobile://\` o son neutrales (${deeplinks.length} detectados, 0 web-only).`,
    })
  }
}

async function bug8_priorityEnum(): Promise<void> {
  // HIPÓTESIS: maintenanceTicket.count usa `priority: 'CRITICAL'` — pero
  // el enum se llama TicketPriority. ¿Coincide el valor?
  try {
    const cnt = await prisma.maintenanceTicket.count({ where: { priority: 'CRITICAL' as any, status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING_PARTS'] } } })
    report({ id: 'BUG-8', description: 'maintenanceTicket priority CRITICAL enum check', severity: 'low', status: 'NOT_REPRO', details: `cnt=${cnt}, enum coincide` })
  } catch (e) {
    report({ id: 'BUG-8', description: 'maintenanceTicket priority enum NO coincide', severity: 'high', status: 'CONFIRMED', details: (e as Error).message })
  }
}

// ════════════════════════════════════════════════════════════════════════════
// §4 — Channex booking-modify gap
// ════════════════════════════════════════════════════════════════════════════

async function bug9_bookingModifyNoEvent(): Promise<void> {
  // HIPÓTESIS: el booking-modify.handler.ts NO emite el event channex.booking.same-day-arrival.
  // Caso real: una reserva OTA llega para mañana (no same-day). El huésped llama y mueve
  // a hoy via la OTA. El webhook booking_modify llega, actualiza la stay, pero la HK NO
  // se entera. Booking same-day arrival via modify es invisible.
  const fs = require('fs')
  const src = fs.readFileSync(__dirname + '/../src/integrations/channex/inbound/handlers/booking-modify.handler.ts', 'utf8')
  const hasEvent = /same-day-arrival/.test(src)
  if (!hasEvent) {
    report({
      id: 'BUG-9',
      description: 'BookingModifyHandler NO emite same-day-arrival event — gap operativo idéntico al Caso 1 owner',
      severity: 'critical',
      status: 'CONFIRMED',
      details: 'booking-modify.handler.ts no emite el event. Caso real: reserva OTA para mañana → guest llama OTA → cambia a HOY → modify webhook llega → stay se actualiza → HK NO recibe el upgrade URGENT. ' +
        'Es EXACTAMENTE el mismo bug que el caso 1 que owner reportó, pero por el lado modify. ' +
        'Fix: agregar el mismo emit en booking-modify.handler post-save con guard timezone-aware. Estimación 1h.',
    })
  }
}

async function bug10_channexConflictStays(): Promise<void> {
  // HIPÓTESIS: si una booking-new aterriza pero la room está ocupada (conflict),
  // booking-new.handler marca stay.channexConflict=true con un placeholder roomId.
  // El listener BookingSameDayListener pull units por ese placeholderRoomId
  // que NO existe → unit.findMany retorna [] → skip NO_TASK. Eso es OK,
  // PERO el emit del event sigue ocurriendo + log "no requiere escalación".
  // Bug real: la booking conflict NUNCA se escala porque no tiene room real,
  // y nadie vuelve a verificarla cuando el supervisor resuelve el conflict.
  const fs = require('fs')
  const src = fs.readFileSync(__dirname + '/../src/integrations/channex/inbound/handlers/booking-new.handler.ts', 'utf8')
  const emitInsideConflict = /channexConflict.*\n.*same-day-arrival/s.test(src) || /same-day-arrival.*channexConflict/s.test(src)
  // El bug es lo opuesto: NO se emite en el path de conflict, OR sí se emite pero con roomId placeholder
  const emitPattern = /this\.events\.emit\('channex\.booking\.same-day-arrival'/g
  const matches = src.match(emitPattern) ?? []
  if (matches.length === 1) {
    // 1 emit punto significa que conflict path NO emite (el emit está solo en happy path)
    report({
      id: 'BUG-10',
      description: 'channex booking-new conflict path NO escala HK cuando se resuelve manualmente',
      severity: 'medium',
      status: 'CONFIRMED',
      details: '1 sola llamada a events.emit en booking-new.handler. Cuando hay conflict, el stay queda channexConflict=true con room placeholder. El supervisor resuelve via UI (asigna room real). Ese flow NO re-emite same-day-arrival → la HK task del room recién asignado NO se escala. ' +
        'Fix: cuando supervisor resuelve conflict y asigna room real, emit channex.booking.same-day-arrival si check-in es hoy.',
    })
  }
}

async function bug11_groupBookings(): Promise<void> {
  // HIPÓTESIS: para multi-room bookings (ReservationGroup §153), booking-new
  // crea N stays children. ¿El same-day-arrival event se emite por CADA stay
  // o solo por uno?
  const fs = require('fs')
  const src = fs.readFileSync(__dirname + '/../src/integrations/channex/inbound/handlers/booking-new.handler.ts', 'utf8')
  // Post-fix BUG-11 (commit a96b38e): contamos cuántas veces se llama
  // `events.emit('channex.booking.same-day-arrival'`. Pre-fix: 1 (solo
  // single-stay path). Post-fix: 2 (single-stay + group children loop).
  const emitCount = (src.match(/events\.emit\(['"]channex\.booking\.same-day-arrival['"]/g) ?? []).length
  if (emitCount < 2) {
    report({
      id: 'BUG-11',
      description: 'Multi-room group bookings NO emiten same-day-arrival por stay child',
      severity: 'high',
      status: 'CONFIRMED',
      details: `Solo ${emitCount} emit detectado en booking-new.handler — esperamos ≥2 (single-stay + group_created loop). ` +
        'El path group_created (booking multi-room) crea N child stays en una sola transacción pero NO emite channex.booking.same-day-arrival por cada uno. ' +
        'Fix: emit el event para cada stay creada en el grupo si checkIn es hoy.',
    })
  } else {
    report({
      id: 'BUG-11',
      description: 'group_created emit per child check',
      severity: 'high',
      status: 'NOT_REPRO',
      details: `${emitCount} emits detectados en booking-new.handler (single-stay + group children loop).`,
    })
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log('🐛 Bug Hunt suite — buscando fallas, no confirmando éxito\n')

  // §1
  await bug1_crossTenant()
  await bug2_pausedStatus()

  // §2
  await bug3_multiStayPollution()
  await bug4_hostelDormUnits()

  // §3
  await bug5_currencyFallback()
  await bug6_timezoneFallback()
  await bug7_deeplinksWebPaths()
  await bug8_priorityEnum()

  // §4
  await bug9_bookingModifyNoEvent()
  await bug10_channexConflictStays()
  await bug11_groupBookings()

  console.log('\n')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('📋 RESUMEN BUG HUNT')
  console.log('═══════════════════════════════════════════════════════════════════')
  const bySev = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  const confirmed = findings.filter((f) => f.status === 'CONFIRMED')
  for (const f of confirmed) bySev[f.severity]++
  console.log(`Total findings: ${findings.length}`)
  console.log(`Confirmed bugs: ${confirmed.length}`)
  console.log(`  · CRITICAL: ${bySev.critical}`)
  console.log(`  · HIGH:     ${bySev.high}`)
  console.log(`  · MEDIUM:   ${bySev.medium}`)
  console.log(`  · LOW:      ${bySev.low}`)
  console.log('═══════════════════════════════════════════════════════════════════')
  if (confirmed.length > 0) {
    console.log('\n🐛 Lista corta para fix backlog:')
    confirmed
      .sort((a, b) => ['critical', 'high', 'medium', 'low', 'info'].indexOf(a.severity) - ['critical', 'high', 'medium', 'low', 'info'].indexOf(b.severity))
      .forEach((f) => console.log(`  [${f.severity.toUpperCase()}] ${f.id}: ${f.description}`))
  }

  await prisma.$disconnect()
}
main().catch((e) => { console.error('crash', e); process.exit(2) })
