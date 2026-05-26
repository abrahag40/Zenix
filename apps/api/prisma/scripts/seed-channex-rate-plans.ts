/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 2 seed.
 *
 * Mapea los 5 rate plans BAR ya creados en Channex sandbox (via API directa el
 * 2026-05-23) a Zenix DB en la nueva tabla ChannexRatePlanMapping.
 *
 * Channex rate plan IDs (creados via /tmp/create-rate-plans.sh):
 *   BAR — Cabaña        015ad43e-648c-4c96-bb22-0368f93dffda → $130
 *   BAR — Estándar      4aea6806-f0fe-4517-9642-b67600cc01ff → $70
 *   BAR — Superior      2db4ff86-8279-4606-96a6-14d1ff050dc5 → $110
 *   BAR — Junior Suite  3101dafb-9f62-4110-a687-7651a9caf416 → $180
 *   BAR — Suite         89391dcb-2eba-4e7b-a2a5-80ab3b7c62f3 → $280
 *
 * Cada rate plan apunta a su room type via channexRoomTypeId (ya en Zenix Rooms).
 *
 * Idempotente — re-ejecutable. Upsert por channexRatePlanId.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const PROPERTY_ID = 'prop-hotel-tulum-001'
const PLATFORM_ADMIN_USER_ID = 'user-abraham-platform-admin'

const RATE_PLANS = [
  {
    channexRatePlanId: '015ad43e-648c-4c96-bb22-0368f93dffda',
    channexRoomTypeId: '8ed90f98-f082-450b-9d46-1b41c5ad2c2b',
    title: 'BAR — Cabaña',
    defaultRate: 130,
  },
  {
    channexRatePlanId: '4aea6806-f0fe-4517-9642-b67600cc01ff',
    channexRoomTypeId: '2bde3aba-2f90-4890-a61d-2ab28f3a979b',
    title: 'BAR — Estándar',
    defaultRate: 70,
  },
  {
    channexRatePlanId: '2db4ff86-8279-4606-96a6-14d1ff050dc5',
    channexRoomTypeId: 'c73d5ea8-89ea-46e3-ba92-78a47e44b0d5',
    title: 'BAR — Superior',
    defaultRate: 110,
  },
  {
    channexRatePlanId: '3101dafb-9f62-4110-a687-7651a9caf416',
    channexRoomTypeId: 'e18cc549-1a68-4ec5-92c1-2ae89295b6ae',
    title: 'BAR — Junior Suite',
    defaultRate: 180,
  },
  {
    channexRatePlanId: '89391dcb-2eba-4e7b-a2a5-80ab3b7c62f3',
    channexRoomTypeId: 'b938aec0-0261-4acd-99c4-78aa2ce424ab',
    title: 'BAR — Suite',
    defaultRate: 280,
  },
]

async function main() {
  console.log('🌟 Channex rate plans seed — Day 2')
  console.log('─'.repeat(60))

  const property = await prisma.property.findUnique({
    where: { id: PROPERTY_ID },
    select: { organizationId: true },
  })
  if (!property) throw new Error(`Property ${PROPERTY_ID} no encontrada`)

  let mapped = 0
  for (const rp of RATE_PLANS) {
    const mapping = await prisma.channexRatePlanMapping.upsert({
      where: { channexRatePlanId: rp.channexRatePlanId },
      update: {
        title: rp.title,
        defaultRate: rp.defaultRate,
        isActive: true,
        updatedById: PLATFORM_ADMIN_USER_ID,
      },
      create: {
        organizationId: property.organizationId,
        propertyId: PROPERTY_ID,
        channexRatePlanId: rp.channexRatePlanId,
        channexRoomTypeId: rp.channexRoomTypeId,
        title: rp.title,
        currency: 'USD',
        sellMode: 'per_room',
        rateMode: 'manual',
        defaultRate: rp.defaultRate,
        defaultOccupancy: 2,
        isActive: true,
        createdById: PLATFORM_ADMIN_USER_ID,
      },
    })
    console.log(`✓ ${rp.title.padEnd(22)} → ${mapping.id.slice(0, 8)}… ($${rp.defaultRate})`)
    mapped += 1
  }

  console.log('─'.repeat(60))
  console.log(`✨ ${mapped} rate plans Channex mapeados a Zenix DB.`)

  // Audit log: registrar el seed
  await prisma.auditLog.create({
    data: {
      organizationId: property.organizationId,
      actorRealId: PLATFORM_ADMIN_USER_ID,
      actorRealRole: 'PLATFORM_ADMIN',
      action: 'CHANNEX_RATE_PLANS_BULK_SEED',
      target: PROPERTY_ID,
      payload: {
        sprint: 'NOVA-CHANNEX-COMMAND-CENTER',
        day: 2,
        count: mapped,
        ratePlanIds: RATE_PLANS.map((r) => r.channexRatePlanId),
      },
      status: 'SUCCESS',
      retentionPolicy: 'STANDARD',
    },
  })
  console.log('✓ AuditLog entry creado (action=CHANNEX_RATE_PLANS_BULK_SEED)')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
