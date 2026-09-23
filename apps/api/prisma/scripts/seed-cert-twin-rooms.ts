import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const PROP = 'prop-channex-cert'
const TWIN_RT = 'd765dff1-4045-4e75-842e-9df81ea5713b'
const CHX_TWIN = '2e0b297f-b44c-4d60-87c5-1d3e27219628'
async function main() {
  const prop = await prisma.property.findUnique({ where: { id: PROP }, select: { organizationId: true } })
  for (const n of ['106', '107', '108']) {
    const existing = await prisma.room.findFirst({ where: { propertyId: PROP, number: n } })
    if (existing) { console.log(`room ${n} ya existe (${existing.id})`); continue }
    const r = await prisma.room.create({
      data: { organizationId: prop?.organizationId ?? null, propertyId: PROP, number: n, category: 'PRIVATE', capacity: 2, roomTypeId: TWIN_RT, channexRoomTypeId: CHX_TWIN },
    })
    console.log(`creado room ${n} = ${r.id}`)
  }
  const count = await prisma.room.count({ where: { propertyId: PROP, channexRoomTypeId: CHX_TWIN } })
  console.log(`Total Twin rooms locales: ${count}`)
}
main().then(()=>prisma.$disconnect()).catch(async e=>{console.error(e);await prisma.$disconnect();process.exit(1)})
