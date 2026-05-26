import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { properties: true } },
    },
    orderBy: { name: 'asc' },
  })
  console.log('Organizations + propertiesCount:')
  for (const o of orgs) {
    console.log(`  ${o.name.padEnd(45)} (slug: ${o.slug.padEnd(35)}) -> ${o._count.properties} properties`)
  }
  console.log('')
  const props = await prisma.property.findMany({
    select: { id: true, name: true, organizationId: true },
    orderBy: { name: 'asc' },
  })
  console.log('Properties + organizationId:')
  for (const p of props) {
    console.log(`  ${p.name.padEnd(40)} (id: ${p.id.padEnd(30)}) -> orgId: ${p.organizationId}`)
  }
}
main().finally(() => prisma.$disconnect())
