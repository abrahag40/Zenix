/**
 * seed-channex-sandbox.ts — Poblar el sandbox `staging.channex.io` con datos
 * VARIADOS para la certificación Stage 4 (mitiga el anti-pattern oficial AP-2.4).
 *
 * AP-2.4 (verbatim Channex): "We don't want to see a full sync with all rooms
 * with 1 availability and 100 USD as example. Better the availability and
 * prices are different like a real hotel."
 *
 * Qué hace (idempotente — re-correr es seguro):
 *   1. Lista los room types existentes; crea "Twin Room" y "Double Room" si
 *      faltan (match por título → no duplica).
 *   2. Lista los rate plans existentes; crea 4 (Twin BAR/BB, Double BAR/BB) con
 *      precios DISTINTOS entre sí.
 *   3. Empuja disponibilidad VARIADA (huecos naturales) para los próximos 60
 *      días — 1 sola llamada con array (respeta AP-4 + rate limit).
 *   4. Empuja restricciones VARIADAS: min-stay 2 en fin de semana, closed-to-
 *      arrival los domingos, un stop-sell puntual — 1 sola llamada con array.
 *   5. Imprime los UUIDs descubiertos + las líneas exactas para pegar en `.env`
 *      (CHANNEX_SANDBOX_ROOM_TYPE_ID / CHANNEX_SANDBOX_RATE_PLAN_ID) que
 *      desbloquean los Tests 2-10 del cert.
 *
 * Cómo correr (desde apps/api, con el .env cargado apuntando al sandbox):
 *   set -a && source .env && set +a
 *   npx ts-node -r tsconfig-paths/register prisma/scripts/seed-channex-sandbox.ts
 *
 * SEGURIDAD: solo corre contra `staging.channex.io`. Si CHANNEX_BASE_URL apunta
 * a producción (app.channex.io), aborta — nunca sembramos datos de prueba en una
 * propiedad real.
 *
 * NO crea reservas de prueba (eso requiere una cuenta OTA de prueba conectada en
 * el extranet o creación manual). El resto del seed sí queda automatizado.
 */
import { ConfigService } from '@nestjs/config'
import {
  ChannexGateway,
  ChannexAvailabilityEntry,
  ChannexRestrictionEntry,
  ChannexRoomType,
  ChannexRatePlan,
} from '../../src/integrations/channex/channex.gateway'

const PROPERTY_ID =
  process.env.CHANNEX_SANDBOX_PROPERTY_ID || 'ef0bdedf-e7fb-43fd-8664-a4dfb6bcec13'

// Catálogo objetivo. Precios DISTINTOS a propósito (anti-AP-2.4).
const ROOM_TYPES: Array<{ title: string; countOfRooms: number; occAdults: number }> = [
  { title: 'Twin Room', countOfRooms: 8, occAdults: 2 },
  { title: 'Double Room', countOfRooms: 5, occAdults: 2 },
]

// Rate plans por room type. rateCents = entero en centavos (Channex lo espera así).
const RATE_PLANS: Array<{ roomTypeTitle: string; title: string; rateCents: number }> = [
  { roomTypeTitle: 'Twin Room', title: 'Best Available Rate', rateCents: 10000 }, // $100.00
  { roomTypeTitle: 'Twin Room', title: 'Bed & Breakfast', rateCents: 12200 }, //     $122.00
  { roomTypeTitle: 'Double Room', title: 'Best Available Rate', rateCents: 13500 }, // $135.00
  { roomTypeTitle: 'Double Room', title: 'Bed & Breakfast', rateCents: 15800 }, //   $158.00
]

const CURRENCY = 'USD'
const HORIZON_DAYS = 60

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function addDays(base: Date, n: number): Date {
  return new Date(base.getTime() + n * 86_400_000)
}

/**
 * Disponibilidad pseudo-aleatoria pero DETERMINISTA por (roomType, díaIndex).
 * Genera huecos naturales — nunca el patrón uniforme que delata un script.
 */
function variedAvailability(totalUnits: number, dayIndex: number, seed: number): number {
  const wobble = (Math.sin((dayIndex + seed) * 1.3) + 1) / 2 // 0..1 determinista
  const occupied = Math.floor(wobble * (totalUnits + 1)) // 0..totalUnits
  return Math.max(0, totalUnits - occupied)
}

async function main(): Promise<void> {
  const baseUrl = process.env.CHANNEX_BASE_URL ?? ''
  const apiKey = process.env.CHANNEX_API_KEY ?? ''

  // ── Guardas de seguridad ────────────────────────────────────────────────
  if (!apiKey) {
    console.error('❌ CHANNEX_API_KEY no está set. Corre: set -a && source .env && set +a')
    process.exit(1)
  }
  if (!baseUrl.includes('staging.channex.io')) {
    console.error(
      `❌ ABORTADO por seguridad: CHANNEX_BASE_URL = "${baseUrl}". ` +
        'Este seed SOLO corre contra staging.channex.io (sandbox). ' +
        'Nunca sembramos datos de prueba en producción (app.channex.io).',
    )
    process.exit(1)
  }

  const config = new ConfigService()
  // El gateway lee de ConfigService — inyectamos los valores del proceso.
  ;(config as unknown as { get: (k: string) => unknown }).get = (k: string) => {
    if (k === 'CHANNEX_API_KEY') return apiKey
    if (k === 'CHANNEX_BASE_URL') return baseUrl
    return undefined
  }
  const gateway = new ChannexGateway(config)

  console.log('🌱 Channex sandbox seed — staging.channex.io')
  console.log(`   property=${PROPERTY_ID}`)
  console.log('')

  // ── 1. Room types (idempotente por título) ──────────────────────────────
  const existingTypes = await gateway.listRoomTypes(PROPERTY_ID)
  const typeByTitle = new Map<string, ChannexRoomType>()
  for (const t of existingTypes) typeByTitle.set(t.title, t)

  for (const rt of ROOM_TYPES) {
    if (typeByTitle.has(rt.title)) {
      console.log(`   ✓ room type ya existe: "${rt.title}" (${typeByTitle.get(rt.title)!.id})`)
      continue
    }
    const created = await gateway.createRoomType({
      propertyId: PROPERTY_ID,
      title: rt.title,
      countOfRooms: rt.countOfRooms,
      occAdults: rt.occAdults,
      defaultOccupancy: rt.occAdults,
      roomKind: 'room',
    })
    typeByTitle.set(rt.title, created)
    console.log(`   + room type creado: "${rt.title}" (${created.id})`)
  }

  // ── 2. Rate plans (idempotente por título) ──────────────────────────────
  const existingPlans = await gateway.listRatePlans(PROPERTY_ID)
  const planByTitle = new Map<string, ChannexRatePlan>()
  for (const p of existingPlans) planByTitle.set(p.title, p)

  for (const rp of RATE_PLANS) {
    const roomType = typeByTitle.get(rp.roomTypeTitle)
    if (!roomType?.id) {
      console.warn(`   ⚠ no se pudo mapear room type "${rp.roomTypeTitle}" — skip rate plan`)
      continue
    }
    const key = `${rp.roomTypeTitle} · ${rp.title}`
    if (planByTitle.has(rp.title)) {
      console.log(`   ✓ rate plan ya existe: "${rp.title}" (${planByTitle.get(rp.title)!.id})`)
      continue
    }
    const created = await gateway.createRatePlan({
      propertyId: PROPERTY_ID,
      roomTypeId: roomType.id,
      title: rp.title,
      currency: CURRENCY,
      rateCents: rp.rateCents,
      occupancy: 2,
      sellMode: 'per_room',
      rateMode: 'manual',
    })
    planByTitle.set(rp.title, created)
    console.log(`   + rate plan creado: "${key}" $${(rp.rateCents / 100).toFixed(2)} (${created.id})`)
  }

  // ── 3. Disponibilidad variada (1 array → 1 HTTP call) ───────────────────
  const today = new Date()
  const availEntries: ChannexAvailabilityEntry[] = []
  let seed = 0
  for (const rt of ROOM_TYPES) {
    const roomTypeId = typeByTitle.get(rt.title)?.id
    if (!roomTypeId) continue
    seed += 7
    for (let i = 0; i < HORIZON_DAYS; i++) {
      availEntries.push({
        propertyId: PROPERTY_ID,
        roomTypeId,
        date: isoDate(addDays(today, i)),
        availability: variedAvailability(rt.countOfRooms, i, seed),
      })
    }
  }
  if (availEntries.length) {
    await gateway.pushAvailability(availEntries)
    console.log(
      `   ↑ availability: ${availEntries.length} entries variados (${HORIZON_DAYS}d × ${ROOM_TYPES.length} tipos) en 1 call`,
    )
  }

  // ── 4. Restricciones variadas (1 array → 1 HTTP call) ───────────────────
  const restrEntries: ChannexRestrictionEntry[] = []
  const from = isoDate(today)
  const to = isoDate(addDays(today, HORIZON_DAYS - 1))
  const stopSellDate = isoDate(addDays(today, 21)) // mantenimiento programado puntual
  for (const rp of RATE_PLANS) {
    const planId = planByTitle.get(rp.title)?.id
    if (!planId) continue
    // Fin de semana: min-stay 2 noches
    restrEntries.push({
      propertyId: PROPERTY_ID,
      ratePlanId: planId,
      dateFrom: from,
      dateTo: to,
      days: ['fr', 'sa'],
      minStayThrough: 2,
    })
    // Domingo: closed-to-arrival (común en boutique)
    restrEntries.push({
      propertyId: PROPERTY_ID,
      ratePlanId: planId,
      dateFrom: from,
      dateTo: to,
      days: ['su'],
      closedToArrival: true,
    })
    // Stop-sell puntual (1 fecha)
    restrEntries.push({
      propertyId: PROPERTY_ID,
      ratePlanId: planId,
      date: stopSellDate,
      stopSell: true,
    })
  }
  if (restrEntries.length) {
    await gateway.pushRestrictions(restrEntries)
    console.log(
      `   ↑ restrictions: ${restrEntries.length} entries variados (min-stay weekend + CTA domingo + stop-sell ${stopSellDate}) en 1 call`,
    )
  }

  // ── 5. Imprimir UUIDs + líneas .env ─────────────────────────────────────
  const twinId = typeByTitle.get('Twin Room')?.id ?? '(no resuelto)'
  const twinBarId = planByTitle.get('Best Available Rate')?.id ?? '(no resuelto)'

  console.log('')
  console.log('✅ Seed completo. Datos VARIADOS en el sandbox (anti-AP-2.4 cubierto).')
  console.log('')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(' Pega estas 3 líneas en apps/api/.env para desbloquear Tests 2-10:')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(`CHANNEX_SANDBOX_PROPERTY_ID="${PROPERTY_ID}"`)
  console.log(`CHANNEX_SANDBOX_ROOM_TYPE_ID="${twinId}"`)
  console.log(`CHANNEX_SANDBOX_RATE_PLAN_ID="${twinBarId}"`)
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('')
  console.log('Todos los room types + rate plans:')
  for (const [title, t] of typeByTitle) console.log(`   room type  · ${title.padEnd(14)} ${t.id}`)
  for (const [title, p] of planByTitle) console.log(`   rate plan  · ${title.padEnd(20)} ${p.id}`)
  console.log('')
  console.log('Pendiente (acción tuya, requiere extranet): conectar una OTA de prueba')
  console.log('(Booking.com test) y crear ~20 reservas para huecos de availability reales.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Seed falló:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
