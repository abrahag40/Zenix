/**
 * Sprint CHANNEX-UX-E2-E3 demo — map Zenix Hotel Tulum rooms → Channex room types.
 *
 * Channex room type IDs (created via /tmp/create-room-types.sh on 2026-05-23):
 *   Cabaña       → 8ed90f98-f082-450b-9d46-1b41c5ad2c2b (2 rooms)
 *   Estándar     → 2bde3aba-2f90-4890-a61d-2ab28f3a979b (6 rooms)
 *   Superior     → c73d5ea8-89ea-46e3-ba92-78a47e44b0d5 (6 rooms)
 *   Junior Suite → e18cc549-1a68-4ec5-92c1-2ae89295b6ae (6 rooms)
 *   Suite        → b938aec0-0261-4acd-99c4-78aa2ce424ab (4 rooms)
 *
 * También crea las habitaciones faltantes (206 Superior + 306 Junior Suite) para
 * alcanzar las 24 totales del layout target.
 *
 * Run: npx ts-node -r tsconfig-paths/register prisma/scripts/map-channex-room-types.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const PROPERTY_ID = 'prop-hotel-tulum-001'

const CHANNEX_BY_TYPE: Record<string, string> = {
  'Cabaña':       '8ed90f98-f082-450b-9d46-1b41c5ad2c2b',
  'Estándar':     '2bde3aba-2f90-4890-a61d-2ab28f3a979b',
  'Superior':     'c73d5ea8-89ea-46e3-ba92-78a47e44b0d5',
  'Junior Suite': 'e18cc549-1a68-4ec5-92c1-2ae89295b6ae',
  'Suite':        'b938aec0-0261-4acd-99c4-78aa2ce424ab',
}

async function main() {
  // 1. Mapear todos los Rooms existentes
  const roomTypes = await prisma.roomType.findMany({
    where: { propertyId: PROPERTY_ID, deletedAt: null },
    select: { id: true, name: true },
  })
  const rtByName = new Map(roomTypes.map((rt) => [rt.name, rt.id]))

  // 2. Crear 206 Superior si no existe
  const superiorRtId = rtByName.get('Superior')
  const r206 = await prisma.room.findFirst({
    where: { propertyId: PROPERTY_ID, number: '206' },
  })
  if (!r206 && superiorRtId) {
    await prisma.room.create({
      data: {
        propertyId: PROPERTY_ID,
        number: '206',
        floor: 2,
        category: 'PRIVATE',
        capacity: 3,
        status: 'AVAILABLE',
        roomTypeId: superiorRtId,
      },
    })
    console.log('✓ Creado 206 Superior')
  }

  // 3. Crear 306 Junior Suite si no existe
  const jrRtId = rtByName.get('Junior Suite')
  const r306 = await prisma.room.findFirst({
    where: { propertyId: PROPERTY_ID, number: '306' },
  })
  if (!r306 && jrRtId) {
    await prisma.room.create({
      data: {
        propertyId: PROPERTY_ID,
        number: '306',
        floor: 3,
        category: 'PRIVATE',
        capacity: 4,
        status: 'AVAILABLE',
        roomTypeId: jrRtId,
      },
    })
    console.log('✓ Creado 306 Junior Suite')
  }

  // 4. Mapear cada Room a su channexRoomTypeId
  const rooms = await prisma.room.findMany({
    where: { propertyId: PROPERTY_ID, deletedAt: null },
    select: { id: true, number: true, roomType: { select: { name: true } } },
    orderBy: { number: 'asc' },
  })

  let mapped = 0
  for (const room of rooms) {
    const channexId = room.roomType ? CHANNEX_BY_TYPE[room.roomType.name] : null
    if (!channexId) {
      console.log(`⚠ ${room.number} — sin match (type: ${room.roomType?.name ?? 'null'})`)
      continue
    }
    await prisma.room.update({
      where: { id: room.id },
      data: { channexRoomTypeId: channexId },
    })
    mapped += 1
  }
  console.log(`✓ ${mapped} rooms mapeados a Channex room types`)

  // 5. Resumen
  const summary = await prisma.room.groupBy({
    by: ['channexRoomTypeId'],
    where: { propertyId: PROPERTY_ID, deletedAt: null },
    _count: { _all: true },
  })
  console.log('\nResumen channex_room_type_id → count:')
  for (const row of summary) {
    const name = Object.entries(CHANNEX_BY_TYPE).find(([, id]) => id === row.channexRoomTypeId)?.[0]
    console.log(`  ${name ?? '(none)'.padEnd(15)} → ${row._count._all}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
