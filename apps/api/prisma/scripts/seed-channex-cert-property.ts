/**
 * seed-channex-cert-property.ts — Crea la PROPIEDAD DE PRUEBA exacta que pide el
 * formulario de certificación de Channex (Stage 4 test scenario).
 *
 * Especificación textual del formulario:
 *   - Property Name: "Test Property - Zenix"   (Provider Name = Zenix)
 *   - Currency: USD
 *   - Room Types: Twin Room (occ 2), Double Room (occ 2)
 *   - Rate Plans:
 *       Twin Room   → Best Available Rate $100, Bed & Breakfast $120
 *       Double Room → Best Available Rate $100, Bed & Breakfast $120
 *   - "Please, use our API to fetch ID's for provided entities."
 *
 * Este script crea TODO vía la API de Channex (idempotente — match por título,
 * no duplica) y al final imprime los IDs (property, room types, rate plans)
 * usando las List APIs que el formulario referencia:
 *   - properties/list, room_types/list, rate_plans/list
 *
 * Cómo correr (desde apps/api, con .env apuntando al sandbox):
 *   set -a && source .env && set +a
 *   npx ts-node -r tsconfig-paths/register prisma/scripts/seed-channex-cert-property.ts
 *
 * SEGURIDAD: aborta si CHANNEX_BASE_URL no es staging.channex.io.
 *
 * NOTA sobre AP-2.4 (datos uniformes): las tarifas 100/120 son el SETUP que el
 * formulario exige (rate plan default rates). NO contradice AP-2.4 — ese
 * anti-pattern aplica a la DATA que sincronizas en los tests (availability +
 * rates por fecha), que sí varía. El setup base es el que pide el cert.
 */
import { ConfigService } from '@nestjs/config'
import {
  ChannexGateway,
  ChannexRoomType,
  ChannexRatePlan,
} from '../../src/integrations/channex/channex.gateway'

const PROPERTY_TITLE = 'Test Property - Zenix'
const CURRENCY = 'USD'
const TIMEZONE = 'America/Cancun'
const COUNTRY = 'MX'

const ROOM_TYPES: Array<{ title: string; occAdults: number; countOfRooms: number }> = [
  { title: 'Twin Room', occAdults: 2, countOfRooms: 5 },
  { title: 'Double Room', occAdults: 2, countOfRooms: 5 },
]

// rateCents = entero en centavos. $100 = 10000, $120 = 12000.
const RATE_PLANS: Array<{ roomTypeTitle: string; title: string; rateCents: number }> = [
  { roomTypeTitle: 'Twin Room', title: 'Best Available Rate', rateCents: 10000 },
  { roomTypeTitle: 'Twin Room', title: 'Bed & Breakfast Rate', rateCents: 12000 },
  { roomTypeTitle: 'Double Room', title: 'Best Available Rate', rateCents: 10000 },
  { roomTypeTitle: 'Double Room', title: 'Bed & Breakfast Rate', rateCents: 12000 },
]

async function main(): Promise<void> {
  const baseUrl = process.env.CHANNEX_BASE_URL ?? ''
  const apiKey = process.env.CHANNEX_API_KEY ?? ''

  if (!apiKey) {
    console.error('❌ CHANNEX_API_KEY no está set. Corre: set -a && source .env && set +a')
    process.exit(1)
  }
  if (!baseUrl.includes('staging.channex.io')) {
    console.error(
      `❌ ABORTADO por seguridad: CHANNEX_BASE_URL = "${baseUrl}". ` +
        'Este script SOLO corre contra staging.channex.io (sandbox).',
    )
    process.exit(1)
  }

  const config = new ConfigService()
  ;(config as unknown as { get: (k: string) => unknown }).get = (k: string) => {
    if (k === 'CHANNEX_API_KEY') return apiKey
    if (k === 'CHANNEX_BASE_URL') return baseUrl
    return undefined
  }
  const gateway = new ChannexGateway(config)

  console.log('🌱 Channex CERT property seed — staging.channex.io')
  console.log(`   target title: "${PROPERTY_TITLE}" · ${CURRENCY}`)
  console.log('')

  // ── 1. Property (idempotente por título) ────────────────────────────────
  const properties = await gateway.listProperties()
  let property = properties.find((p) => p.title === PROPERTY_TITLE)
  if (property) {
    console.log(`   ✓ property ya existe: "${PROPERTY_TITLE}" (${property.id})`)
  } else {
    const created = await gateway.createProperty({
      title: PROPERTY_TITLE,
      currency: CURRENCY,
      timezone: TIMEZONE,
      country: COUNTRY,
      propertyType: 'hotel',
    })
    property = { id: created.id!, title: created.title, timezone: TIMEZONE, currency: CURRENCY }
    console.log(`   + property creada: "${PROPERTY_TITLE}" (${property.id})`)
  }
  const propertyId = property.id

  // ── 2. Room types (idempotente por título) ──────────────────────────────
  const existingTypes = await gateway.listRoomTypes(propertyId)
  const typeByTitle = new Map<string, ChannexRoomType>()
  for (const t of existingTypes) typeByTitle.set(t.title, t)

  for (const rt of ROOM_TYPES) {
    if (typeByTitle.has(rt.title)) {
      console.log(`   ✓ room type ya existe: "${rt.title}" (${typeByTitle.get(rt.title)!.id})`)
      continue
    }
    const created = await gateway.createRoomType({
      propertyId,
      title: rt.title,
      countOfRooms: rt.countOfRooms,
      occAdults: rt.occAdults,
      defaultOccupancy: rt.occAdults,
      roomKind: 'room',
    })
    typeByTitle.set(rt.title, created)
    console.log(`   + room type creado: "${rt.title}" occ=${rt.occAdults} (${created.id})`)
  }

  // ── 3. Rate plans (idempotente por título dentro del room type) ─────────
  const existingPlans = await gateway.listRatePlans(propertyId)
  // Channex no garantiza unicidad de título global, así que mapeamos por
  // (roomTypeId, title) cuando el list lo permita; fallback por título.
  const planKey = (roomTypeTitle: string, title: string) => `${roomTypeTitle}::${title}`
  const planByKey = new Map<string, ChannexRatePlan>()
  // Pre-cargar existentes por título simple (best-effort idempotency).
  const existingPlanTitles = new Set(existingPlans.map((p) => p.title))

  const createdPlanByKey = new Map<string, ChannexRatePlan>()
  for (const rp of RATE_PLANS) {
    const roomType = typeByTitle.get(rp.roomTypeTitle)
    if (!roomType?.id) {
      console.warn(`   ⚠ no se pudo mapear room type "${rp.roomTypeTitle}" — skip rate plan`)
      continue
    }
    const key = planKey(rp.roomTypeTitle, rp.title)
    // Idempotency: si ya hay un plan con ese título Y solo había uno por tipo,
    // lo reusamos. (En sandbox limpio no habrá colisión.)
    if (existingPlanTitles.has(rp.title) && existingPlans.length >= RATE_PLANS.length) {
      const match = existingPlans.find((p) => p.title === rp.title)
      if (match) {
        planByKey.set(key, match)
        console.log(`   ✓ rate plan ya existe: "${rp.roomTypeTitle} · ${rp.title}" (${match.id})`)
        continue
      }
    }
    const created = await gateway.createRatePlan({
      propertyId,
      roomTypeId: roomType.id,
      title: rp.title,
      currency: CURRENCY,
      rateCents: rp.rateCents,
      occupancy: 2,
      sellMode: 'per_room',
      rateMode: 'manual',
    })
    createdPlanByKey.set(key, created)
    planByKey.set(key, created)
    console.log(
      `   + rate plan creado: "${rp.roomTypeTitle} · ${rp.title}" $${(rp.rateCents / 100).toFixed(0)} (${created.id})`,
    )
  }

  // ── 4. Fetch final de IDs vía las List APIs (lo que pide el formulario) ──
  const finalTypes = await gateway.listRoomTypes(propertyId)
  const finalPlans = await gateway.listRatePlans(propertyId)

  console.log('')
  console.log('✅ Property de certificación lista. IDs para el formulario:')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(`Property:  "${PROPERTY_TITLE}"`)
  console.log(`  property_id = ${propertyId}`)
  console.log(`  currency    = ${CURRENCY}`)
  console.log('')
  console.log('Room Types (GET /room_types):')
  for (const t of finalTypes) {
    console.log(`  ${t.title.padEnd(14)} room_type_id = ${t.id}`)
  }
  console.log('')
  console.log('Rate Plans (GET /rate_plans):')
  for (const p of finalPlans) {
    console.log(`  ${p.title.padEnd(22)} rate_plan_id = ${p.id}`)
  }
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('')
  console.log('Endpoints API que el reviewer referenció (para verificar tú mismo):')
  console.log(`  GET ${baseUrl}/properties`)
  console.log(`  GET ${baseUrl}/room_types?filter[property_id]=${propertyId}`)
  console.log(`  GET ${baseUrl}/rate_plans?filter[property_id]=${propertyId}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Seed cert property falló:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
