/**
 * Seed idempotente — rate plans locales + links a Channex para la propiedad de
 * certificación PMS (`prop-channex-cert` ↔ "Test Property - Zenix").
 *
 * Crea 2 RatePlans (BAR, B&B) a nivel propiedad y 4 ChannexRatePlanLink que
 * mapean (roomType × ratePlan) → channex rate_plan_id. Esto es lo que permite
 * a las pruebas 3-8 apuntar a rate plans específicos (BAR vs B&B).
 *
 * Correr:  npx ts-node -r tsconfig-paths/register prisma/scripts/seed-channex-cert-rateplans.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const PROPERTY_ID = 'prop-channex-cert'

// Room types locales (verificados en BD).
const TWIN = 'd765dff1-4045-4e75-842e-9df81ea5713b'
const DOUBLE = 'e937c002-ef7f-4551-8e8a-8cb09dfcd0ee'

// channex rate_plan_id (de "Test Property - Zenix" en staging.channex.io).
const CHX = {
  twinBar: '88a90aa7-1bcc-41e4-a3dd-3e2a35227028',
  twinBnb: '56319005-c419-43af-b05b-5d3ad1944592',
  doubleBar: 'c57ad75e-aeee-434e-9ce1-2170f379912c',
  doubleBnb: 'ca745836-8385-4a9c-bad7-15fede59a755',
}

async function main() {
  const prop = await prisma.property.findUnique({ where: { id: PROPERTY_ID }, select: { id: true } })
  if (!prop) throw new Error(`Property ${PROPERTY_ID} no existe`)

  // 1) Rate plans (a nivel propiedad).
  const bar = await prisma.ratePlan.upsert({
    where: { propertyId_code: { propertyId: PROPERTY_ID, code: 'BAR' } },
    update: { name: 'Best Available Rate', baseStrategy: 'FIXED', baseRate: 100 },
    create: { propertyId: PROPERTY_ID, code: 'BAR', name: 'Best Available Rate', baseStrategy: 'FIXED', baseRate: 100 },
    select: { id: true },
  })
  const bnb = await prisma.ratePlan.upsert({
    where: { propertyId_code: { propertyId: PROPERTY_ID, code: 'BB' } },
    update: { name: 'Bed & Breakfast Rate', baseStrategy: 'FIXED', baseRate: 120 },
    create: { propertyId: PROPERTY_ID, code: 'BB', name: 'Bed & Breakfast Rate', baseStrategy: 'FIXED', baseRate: 120 },
    select: { id: true },
  })

  // 2) Links (roomType × ratePlan) → channex rate_plan_id.
  const links: Array<{ roomTypeId: string; ratePlanId: string; channexRatePlanId: string }> = [
    { roomTypeId: TWIN, ratePlanId: bar.id, channexRatePlanId: CHX.twinBar },
    { roomTypeId: TWIN, ratePlanId: bnb.id, channexRatePlanId: CHX.twinBnb },
    { roomTypeId: DOUBLE, ratePlanId: bar.id, channexRatePlanId: CHX.doubleBar },
    { roomTypeId: DOUBLE, ratePlanId: bnb.id, channexRatePlanId: CHX.doubleBnb },
  ]
  for (const l of links) {
    await prisma.channexRatePlanLink.upsert({
      where: { roomTypeId_ratePlanId: { roomTypeId: l.roomTypeId, ratePlanId: l.ratePlanId } },
      update: { channexRatePlanId: l.channexRatePlanId, propertyId: PROPERTY_ID },
      create: { propertyId: PROPERTY_ID, ...l },
    })
  }

  const result = await prisma.channexRatePlanLink.findMany({
    where: { propertyId: PROPERTY_ID },
    select: { roomTypeId: true, ratePlanId: true, channexRatePlanId: true },
  })
  console.log(`RatePlans: BAR=${bar.id} BB=${bnb.id}`)
  console.log(`Links (${result.length}):`)
  for (const r of result) console.log(`  rt=${r.roomTypeId.slice(0, 8)} plan=${r.ratePlanId.slice(0, 8)} -> chx=${r.channexRatePlanId}`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
