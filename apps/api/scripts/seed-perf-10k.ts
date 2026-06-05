/**
 * seed-perf-10k.ts — Volume seed para PERF-1 stress + EXPLAIN validation.
 *
 * Crea ~10k GuestStays distribuidos en los últimos 18 meses bajo
 * Hotel Tulum, con prefijo identificable (`source='perf-seed'`) para
 * cleanup posterior con `delete-perf-seed.ts`.
 *
 * NO contamina seed productivo:
 *   - `source='perf-seed'` único marker
 *   - `bookingRef` con prefijo `PERF-`
 *   - cleanup en 1 query: DELETE FROM guest_stays WHERE source='perf-seed'
 *
 * Volume targets:
 *   - 8500 stays históricas COMPLETED (actual_checkout != null)
 *   - 1000 stays canceladas
 *   - 300 stays no-show
 *   - 200 stays activas (in-house o llegadas próximas)
 *
 * Distribución temporal: weighted hacia los últimos 6 meses (modela
 * tráfico hotel real — historia decreciente hacia atrás).
 *
 * Usage:
 *   pnpm tsx scripts/seed-perf-10k.ts        # ejecuta el seed
 *   pnpm tsx scripts/seed-perf-10k.ts clean  # borra todo el seed perf
 */
import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

const PROPERTY_ID = 'prop-hotel-tulum-001'
const ORG_ID = 'seed-org-1'
const PERF_MARKER = 'perf-seed'

const FIRST_NAMES = [
  'Carlos', 'María', 'José', 'Ana', 'Luis', 'Carmen', 'Pedro', 'Sofía',
  'Miguel', 'Laura', 'Roberto', 'Patricia', 'Javier', 'Isabel', 'Diego',
  'Lucía', 'Andrés', 'Valentina', 'Fernando', 'Camila', 'Ricardo', 'Daniela',
  'Sebastián', 'Gabriela', 'Eduardo', 'Mariana', 'Jorge', 'Adriana',
  'John', 'Emma', 'Michael', 'Olivia', 'David', 'Sophia', 'Robert', 'Isabella',
  'William', 'Ava', 'James', 'Mia', 'Christopher', 'Charlotte', 'Daniel',
]
const LAST_NAMES = [
  'García', 'Rodríguez', 'Martínez', 'López', 'González', 'Pérez', 'Sánchez',
  'Ramírez', 'Torres', 'Flores', 'Rivera', 'Gómez', 'Díaz', 'Cruz', 'Morales',
  'Vargas', 'Castillo', 'Romero', 'Jiménez', 'Mendoza',
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
]
const OTAS = ['booking', 'expedia', 'airbnb', 'direct', 'direct', 'direct', 'agoda']

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Random fecha en los últimos N meses, weighted hacia ahora (modelo realista).
 * Usa quadratic distribution: más probable cerca de hoy que hace 18 meses.
 */
function randomCheckinDate(monthsBack: number): Date {
  const r = Math.pow(Math.random(), 2) // bias toward 0 (recent)
  const daysAgo = Math.floor(r * monthsBack * 30)
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(14, 0, 0, 0) // standard check-in time
  return d
}

function randomFutureCheckin(): Date {
  const daysAhead = randomBetween(1, 90)
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  d.setHours(14, 0, 0, 0)
  return d
}

async function clean() {
  console.log('🧹 Limpiando perf-seed...')
  const r = await prisma.guestStay.deleteMany({ where: { source: PERF_MARKER } })
  console.log(`✅ ${r.count} stays borradas.`)
  process.exit(0)
}

async function main() {
  if (process.argv[2] === 'clean') {
    await clean()
    return
  }

  // 1) Pre-flight: rooms disponibles bajo Hotel Tulum
  const rooms = await prisma.room.findMany({
    where: { propertyId: PROPERTY_ID, deletedAt: null },
    select: { id: true },
  })
  if (rooms.length === 0) throw new Error(`Sin rooms en ${PROPERTY_ID}`)
  console.log(`📌 ${rooms.length} rooms detectadas. Generando ~10k stays...`)

  // 2) Staff actor (el primero con role)
  const actor = await prisma.staff.findFirst({
    where: { propertyId: PROPERTY_ID },
    select: { id: true },
  })
  if (!actor) throw new Error('Sin staff para checked_in_by_id')

  const TARGET = 10_000
  const BATCH = 500
  let created = 0
  const startTs = Date.now()

  for (let b = 0; b < TARGET / BATCH; b++) {
    const rows: Prisma.GuestStayCreateManyInput[] = []

    for (let i = 0; i < BATCH; i++) {
      const seq = b * BATCH + i
      // Distribución per spec:
      //   85% COMPLETED (historic)
      //   10% CANCELLED
      //    3% NO_SHOW
      //    2% ACTIVE (future / in-house)
      const r = Math.random()
      let kind: 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' | 'ACTIVE'
      if (r < 0.85)      kind = 'COMPLETED'
      else if (r < 0.95) kind = 'CANCELLED'
      else if (r < 0.98) kind = 'NO_SHOW'
      else               kind = 'ACTIVE'

      const isActive = kind === 'ACTIVE'
      const checkin = isActive ? randomFutureCheckin() : randomCheckinDate(18)
      const nights = randomBetween(1, 7)
      const scheduledCheckout = new Date(checkin)
      scheduledCheckout.setDate(scheduledCheckout.getDate() + nights)
      const rate = randomBetween(80, 280)
      const total = rate * nights
      const room = pickRandom(rooms)

      const guestFirstName = pickRandom(FIRST_NAMES)
      const guestLastName = pickRandom(LAST_NAMES)
      const ota = pickRandom(OTAS)

      rows.push({
        id: `perf-${seq.toString().padStart(6, '0')}-${Math.random().toString(36).slice(2, 8)}`,
        bookingRef: `PERF-${seq.toString().padStart(6, '0')}`,
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        roomId: room.id,
        guestName: `${guestFirstName} ${guestLastName}`,
        guestFirstName,
        guestLastName,
        paxCount: randomBetween(1, 4),
        checkinAt: checkin,
        scheduledCheckout,
        ratePerNight: new Prisma.Decimal(rate),
        totalAmount: new Prisma.Decimal(total),
        amountPaid: kind === 'COMPLETED' ? new Prisma.Decimal(total) : new Prisma.Decimal(0),
        paymentStatus: kind === 'COMPLETED' ? 'PAID' : 'PENDING',
        currency: 'MXN',
        source: PERF_MARKER,
        checkedInById: actor.id,
        actualCheckin: kind === 'COMPLETED' || kind === 'ACTIVE' ? checkin : null,
        actualCheckout: kind === 'COMPLETED' ? scheduledCheckout : null,
        cancelledAt: kind === 'CANCELLED' ? new Date(checkin.getTime() - 86_400_000) : null,
        cancelInitiator: kind === 'CANCELLED' ? pickRandom(['GUEST', 'HOTEL', 'OTA']) : null,
        cancelledFromChannel: kind === 'CANCELLED' ? 'PMS_DIRECT' : null,
        noShowAt: kind === 'NO_SHOW' ? scheduledCheckout : null,
        cancelledById: kind === 'CANCELLED' ? actor.id : null,
        cancelReason: kind === 'CANCELLED' ? 'perf-seed mock' : null,
        notes: `Channel: ${ota}`,
      })
    }

    await prisma.guestStay.createMany({ data: rows, skipDuplicates: true })
    created += BATCH
    const pct = Math.round((created / TARGET) * 100)
    const elapsed = ((Date.now() - startTs) / 1000).toFixed(1)
    process.stdout.write(`\r📦 ${created}/${TARGET} (${pct}%) · ${elapsed}s`)
  }

  console.log(`\n✅ ${created} stays creadas en ${((Date.now() - startTs) / 1000).toFixed(1)}s`)

  // 3) Distribución final
  const breakdown = await prisma.$queryRaw<Array<{ kind: string; n: bigint }>>`
    SELECT CASE
      WHEN cancelled_at IS NOT NULL THEN 'CANCELLED'
      WHEN no_show_at IS NOT NULL THEN 'NO_SHOW'
      WHEN actual_checkout IS NOT NULL THEN 'COMPLETED'
      WHEN actual_checkin IS NOT NULL THEN 'IN_HOUSE'
      ELSE 'FUTURE'
    END AS kind,
    COUNT(*)::bigint AS n
    FROM guest_stays WHERE source = ${PERF_MARKER}
    GROUP BY 1 ORDER BY 2 DESC
  `
  console.log('\n📊 Distribución:')
  for (const row of breakdown) console.log(`  ${row.kind}: ${row.n}`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('❌', e)
  prisma.$disconnect()
  process.exit(1)
})
