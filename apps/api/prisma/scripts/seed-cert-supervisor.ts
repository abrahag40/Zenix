import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'
const prisma = new PrismaClient()
async function main() {
  const passwordHash = await bcrypt.hash('123456', 10)
  const s = await prisma.staff.upsert({
    where: { email: 'cert@z.co' },
    update: { passwordHash, active: true, role: 'SUPERVISOR', propertyId: 'prop-channex-cert', organizationId: 'org-channex-cert' },
    create: {
      email: 'cert@z.co', name: 'Cert Supervisor', passwordHash,
      role: 'SUPERVISOR', propertyId: 'prop-channex-cert', organizationId: 'org-channex-cert',
    },
    select: { id: true, email: true, role: true, propertyId: true },
  })
  console.log(JSON.stringify(s))
}
main().then(()=>prisma.$disconnect()).catch(async e=>{console.error(e);await prisma.$disconnect();process.exit(1)})
