/**
 * E2E test suite — Casos 1 & 2 de owner verificados contra DB real.
 *
 * Caso 1: simula que `BookingSameDayListener` se dispara directamente con un
 * payload válido + verifica que un `CleaningTask` PENDING/READY del room
 * resulta escalado a URGENT + `hasSameDayCheckIn=true` + TaskLog creado.
 *
 * Caso 2: simula que `RoomMovedHkListener` se dispara con fromRoom→toRoom +
 * verifica que la task antigua quedó CANCELLED y se creó task nueva en
 * toRoom con `carryoverFromTaskId` apuntando a la antigua.
 *
 * Ejecutar: `cd apps/api && npx ts-node -r tsconfig-paths/register --transpile-only scripts/e2e-hk-realtime.ts`
 */
import { PrismaClient, Priority, CleaningStatus, CleaningCancelReason } from '@prisma/client'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { BookingSameDayListener } from '../src/scheduling/listeners/booking-same-day.listener'
import { RoomMovedHkListener } from '../src/scheduling/listeners/room-moved-hk.listener'

const prisma = new PrismaClient()
const events = new EventEmitter2()

// Mock NotificationsService — captura SSE emits para verificación.
const sseEmits: Array<{ propertyId: string; type: string; data: unknown }> = []
const notifications = {
  emit: (propertyId: string, type: string, data: unknown) => {
    sseEmits.push({ propertyId, type, data })
  },
  addClient: () => {},
} as any

// E2E-21 — RoomMovedHkListener ahora reasigna por cobertura (autoAssign) + push.
const assignment = { autoAssign: async () => ({ assigned: false, staffId: null, rule: null }) } as any
const push = { sendToStaff: async () => undefined } as any

let passed = 0
let total = 0
function check(name: string, cond: boolean, detail = ''): void {
  total++
  if (cond) {
    passed++
    console.log(`  ✅ ${name}` + (detail ? ` — ${detail}` : ''))
  } else {
    console.log(`  ❌ ${name} — ${detail || 'falló'}`)
  }
}

async function caso1(): Promise<void> {
  console.log('\n📦 Caso 1 — BookingSameDayListener escala task a URGENT')

  // Setup: encontrar property + room + crear CleaningTask PENDING para hoy
  const prop = await prisma.property.findFirst({
    where: { rooms: { some: { units: { some: {} } } } },
    include: {
      settings: true,
      rooms: { where: { units: { some: {} } }, include: { units: true }, take: 1 },
    },
  })
  if (!prop || prop.rooms.length === 0 || prop.rooms[0].units.length === 0) {
    console.log('  ⏭  skip — sin seed adecuado')
    return
  }
  const room = prop.rooms[0]
  const unit = room.units[0]
  const tz = prop.settings?.timezone || 'America/Cancun'
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const todayUtc = new Date(`${today}T00:00:00.000Z`)

  // Limpiar tasks viejas del test (logs primero por FK)
  const oldTasks = await prisma.cleaningTask.findMany({ where: { unitId: unit.id, scheduledFor: todayUtc, autoAssignmentRule: 'E2E_TEST_CASO_1' }, select: { id: true } })
  if (oldTasks.length) await prisma.taskLog.deleteMany({ where: { taskId: { in: oldTasks.map((t) => t.id) } } })
  await prisma.cleaningTask.deleteMany({ where: { unitId: unit.id, scheduledFor: todayUtc, autoAssignmentRule: 'E2E_TEST_CASO_1' } })

  // Crear task PENDING limpia para hoy
  const taskOriginal = await prisma.cleaningTask.create({
    data: {
      unitId: unit.id,
      taskType: 'CLEANING',
      status: CleaningStatus.PENDING,
      priority: Priority.MEDIUM,
      scheduledFor: todayUtc,
      autoAssignmentRule: 'E2E_TEST_CASO_1',
    },
  })

  // Disparar listener
  const listener = new BookingSameDayListener(prisma as any, notifications)
  sseEmits.length = 0
  const checkInIso = new Date(Date.now() + 4 * 3600000).toISOString() // hoy +4h
  const result = await listener.onSameDayArrival({
    stayId: 'e2e-stay-1',
    roomId: room.id,
    propertyId: prop.id,
    checkInIso,
    otaName: 'BookingCom',
  })

  check('listener retornó upgraded:1', result.upgraded === 1, JSON.stringify(result))

  // Verificar que la task se actualizó
  const taskUpdated = await prisma.cleaningTask.findUnique({ where: { id: taskOriginal.id } })
  check('priority === URGENT', taskUpdated?.priority === Priority.URGENT, `priority=${taskUpdated?.priority}`)
  check('hasSameDayCheckIn === true', taskUpdated?.hasSameDayCheckIn === true, `hasSameDayCheckIn=${taskUpdated?.hasSameDayCheckIn}`)

  // Verificar TaskLog
  const logs = await prisma.taskLog.findMany({ where: { taskId: taskOriginal.id } })
  const upgradeLog = logs.find((l) => l.event === 'PRIORITY_OVERRIDDEN')
  check('TaskLog PRIORITY_OVERRIDDEN creado', !!upgradeLog, `note: ${upgradeLog?.note?.slice(0, 60)}`)

  // Verificar SSE emit
  const upgradedEmit = sseEmits.find((e) => e.type === 'task:upgraded')
  check('SSE task:upgraded emitido', !!upgradedEmit, `${JSON.stringify(upgradedEmit?.data).slice(0, 80)}`)

  // Cleanup
  await prisma.taskLog.deleteMany({ where: { taskId: taskOriginal.id } })
  await prisma.cleaningTask.delete({ where: { id: taskOriginal.id } })
}

async function caso2(): Promise<void> {
  console.log('\n🔄 Caso 2 — RoomMovedHkListener migra task fromRoom → toRoom')

  // Setup: encontrar 2 rooms del mismo property con units
  const prop = await prisma.property.findFirst({
    where: { rooms: { some: { units: { some: {} } } } },
    include: {
      settings: true,
      rooms: { where: { units: { some: {} } }, include: { units: true }, take: 2 },
    },
  })
  if (!prop || prop.rooms.length < 2) {
    console.log('  ⏭  skip — necesita 2 rooms con units')
    return
  }
  const [fromRoom, toRoom] = prop.rooms
  if (fromRoom.units.length === 0 || toRoom.units.length === 0) {
    console.log('  ⏭  skip — units faltantes')
    return
  }
  const fromUnit = fromRoom.units[0]
  const toUnit = toRoom.units[0]
  const tz = prop.settings?.timezone || 'America/Cancun'
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const todayUtc = new Date(`${today}T00:00:00.000Z`)

  // Limpiar (logs primero por FK)
  const oldTasks2 = await prisma.cleaningTask.findMany({ where: { OR: [{ unitId: fromUnit.id }, { unitId: toUnit.id }], scheduledFor: todayUtc, autoAssignmentRule: 'E2E_TEST_CASO_2' }, select: { id: true } })
  if (oldTasks2.length) await prisma.taskLog.deleteMany({ where: { taskId: { in: oldTasks2.map((t) => t.id) } } })
  await prisma.cleaningTask.deleteMany({ where: { OR: [{ unitId: fromUnit.id }, { unitId: toUnit.id }], scheduledFor: todayUtc, autoAssignmentRule: 'E2E_TEST_CASO_2' } })

  // Crear task PENDING en fromRoom
  const oldTask = await prisma.cleaningTask.create({
    data: {
      unitId: fromUnit.id,
      taskType: 'CLEANING',
      status: CleaningStatus.READY,
      priority: Priority.URGENT,
      hasSameDayCheckIn: true,
      scheduledFor: todayUtc,
      autoAssignmentRule: 'E2E_TEST_CASO_2',
    },
  })

  // Disparar listener
  const listener = new RoomMovedHkListener(prisma as any, notifications, assignment, push)
  sseEmits.length = 0
  // Encontrar un staff válido para el actor (FK en taskLog)
  const realStaff = await prisma.staff.findFirst({ where: { propertyId: prop.id } })
  const result = await listener.onRoomMoved({
    stayId: 'e2e-stay-2',
    fromRoomId: fromRoom.id,
    toRoomId: toRoom.id,
    propertyId: prop.id,
    actorId: realStaff?.id,
  })

  // El listener migra TODAS las tasks PENDING/READY de la fromRoom (no solo
  // la de este stay). El seed puede tener tasks pre-existentes del cron.
  check('listener retornó migrated≥1 conflicts:0', result.migrated >= 1 && result.conflicts === 0, JSON.stringify(result))

  // Verificar antigua cancelada
  const oldUpdated = await prisma.cleaningTask.findUnique({ where: { id: oldTask.id } })
  check('antigua CANCELLED', oldUpdated?.status === CleaningStatus.CANCELLED, `status=${oldUpdated?.status}`)
  check('cancelledReason RECEPTIONIST_MANUAL', oldUpdated?.cancelledReason === CleaningCancelReason.RECEPTIONIST_MANUAL, `reason=${oldUpdated?.cancelledReason}`)

  // Verificar nueva creada en toRoom con carryoverFromTaskId
  const newTask = await prisma.cleaningTask.findFirst({
    where: { unitId: toUnit.id, scheduledFor: todayUtc, carryoverFromTaskId: oldTask.id },
  })
  check('nueva task creada en toRoom', !!newTask, `id=${newTask?.id}`)
  check('preserva priority URGENT', newTask?.priority === Priority.URGENT, `priority=${newTask?.priority}`)
  check('preserva hasSameDayCheckIn=true', newTask?.hasSameDayCheckIn === true, `flag=${newTask?.hasSameDayCheckIn}`)
  check('status nueva = READY (preservado de antigua)', newTask?.status === CleaningStatus.READY, `status=${newTask?.status}`)

  // Verificar SSE emit
  const movedEmit = sseEmits.find((e) => e.type === 'task:moved')
  check('SSE task:moved emitido', !!movedEmit, `${JSON.stringify(movedEmit?.data).slice(0, 100)}`)

  // Cleanup
  if (newTask) {
    await prisma.taskLog.deleteMany({ where: { taskId: newTask.id } })
    await prisma.cleaningTask.delete({ where: { id: newTask.id } })
  }
  await prisma.taskLog.deleteMany({ where: { taskId: oldTask.id } })
  await prisma.cleaningTask.delete({ where: { id: oldTask.id } })
}

async function caso3(): Promise<void> {
  console.log('\n🛡  Caso 3 — RoomMovedHkListener skip + warn cuando IN_PROGRESS (defensive §54 D11)')

  const prop = await prisma.property.findFirst({
    where: { rooms: { some: { units: { some: {} } } } },
    include: {
      settings: true,
      rooms: { where: { units: { some: {} } }, include: { units: true }, take: 2 },
    },
  })
  if (!prop || prop.rooms.length < 2 || prop.rooms[0].units.length === 0) {
    console.log('  ⏭  skip — seed insuficiente')
    return
  }
  const [fromRoom, toRoom] = prop.rooms
  const fromUnit = fromRoom.units[0]
  const tz = prop.settings?.timezone || 'America/Cancun'
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const todayUtc = new Date(`${today}T00:00:00.000Z`)

  const oldTasks3 = await prisma.cleaningTask.findMany({ where: { unitId: fromUnit.id, scheduledFor: todayUtc, autoAssignmentRule: 'E2E_TEST_CASO_3' }, select: { id: true } })
  if (oldTasks3.length) await prisma.taskLog.deleteMany({ where: { taskId: { in: oldTasks3.map((t) => t.id) } } })
  await prisma.cleaningTask.deleteMany({ where: { unitId: fromUnit.id, scheduledFor: todayUtc, autoAssignmentRule: 'E2E_TEST_CASO_3' } })

  const inProgressTask = await prisma.cleaningTask.create({
    data: {
      unitId: fromUnit.id,
      taskType: 'CLEANING',
      status: CleaningStatus.IN_PROGRESS,
      priority: Priority.URGENT,
      hasSameDayCheckIn: true,
      scheduledFor: todayUtc,
      autoAssignmentRule: 'E2E_TEST_CASO_3',
    },
  })

  const listener = new RoomMovedHkListener(prisma as any, notifications, assignment, push)
  sseEmits.length = 0
  const result = await listener.onRoomMoved({
    stayId: 'e2e-stay-3',
    fromRoomId: fromRoom.id,
    toRoomId: toRoom.id,
    propertyId: prop.id,
  })

  check('migrated:0 conflicts:1', result.migrated === 0 && result.conflicts === 1, JSON.stringify(result))

  // Task NO debe haber sido tocada
  const stillInProgress = await prisma.cleaningTask.findUnique({ where: { id: inProgressTask.id } })
  check('task IN_PROGRESS NO se tocó', stillInProgress?.status === CleaningStatus.IN_PROGRESS, `status=${stillInProgress?.status}`)

  // SSE NO debe haberse emitido
  check('SSE task:moved NO se emitió', sseEmits.length === 0, `emits=${sseEmits.length}`)

  await prisma.cleaningTask.delete({ where: { id: inProgressTask.id } })
}

async function main(): Promise<void> {
  console.log('🚀 E2E HK Realtime — Casos 1 & 2 contra BD real\n')
  try {
    await caso1()
    await caso2()
    await caso3()
  } catch (e) {
    console.error('\n💥 Error fatal:', e)
    await prisma.$disconnect()
    process.exit(2)
  }
  console.log(`\n📊 Resumen: ${passed}/${total} aserciones verde`)
  await prisma.$disconnect()
  process.exit(passed === total ? 0 : 1)
}
main()
