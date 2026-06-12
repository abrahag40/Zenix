/**
 * seed.platform.ts — Bootstrap de la PLATAFORMA (NO un hotel).
 *
 * Crea la cuenta de PLATFORM_ADMIN (ZaharDev / Abraham) que entra a Nova y desde
 * ahí corre el wizard "Zenix Activate" para onboardear hoteles REALES. Se corre
 * UNA vez por instancia (idempotente). No crea ningún hotel demo.
 *
 * Estructura (§161 D-NOVA-3): Partner(isInternal=true) → User(PLATFORM_ADMIN) →
 * PartnerMember. El trigger DB `partner_member_platform_admin_guard` exige que el
 * Partner del PLATFORM_ADMIN sea isInternal=true → por eso creamos el Partner primero.
 *
 * Uso (owner, contra prod):
 *   cd apps/api
 *   DATABASE_URL='<prod>' \
 *   PLATFORM_EMAIL='abraham@zahardev.com' PLATFORM_PASSWORD='ClaveFuerte123' \
 *   PLATFORM_FIRST='Abraham' PLATFORM_LAST='García' \
 *   npx ts-node -r tsconfig-paths/register prisma/seed.platform.ts
 *
 * Luego entras a https://zenix-web-silk.vercel.app con ese email/clave → Nova →
 * /nova/wizard para onboardear el primer hotel real.
 */
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

const PARTNER_NAME = process.env.PARTNER_NAME ?? 'ZaharDev'
const COUNTRY = (process.env.PLATFORM_COUNTRY ?? 'MX').toUpperCase()
const EMAIL = (process.env.PLATFORM_EMAIL ?? 'admin@zahardev.com').toLowerCase()
const PASSWORD = process.env.PLATFORM_PASSWORD ?? 'ChangeMe123!'
const FIRST = process.env.PLATFORM_FIRST ?? 'Platform'
const LAST = process.env.PLATFORM_LAST ?? 'Admin'

const PARTNER_ID = 'partner-zahardev'

async function main() {
  console.log(`🔑 Bootstrap PLATFORM_ADMIN: ${EMAIL} (Partner "${PARTNER_NAME}", interno)`)

  // 1. Partner interno ZaharDev. Hay un UNIQUE parcial `WHERE is_internal=true`
  // → solo puede existir UNO. Reusamos el existente si lo hay (idempotente);
  // si no, lo creamos (caso prod fresco).
  let partner = await prisma.partner.findFirst({ where: { isInternal: true } })
  if (!partner) {
    partner = await prisma.partner.create({
      data: {
        id: PARTNER_ID,
        name: PARTNER_NAME,
        tier: 'PLATINUM',
        countryCode: COUNTRY,
        contactEmail: EMAIL,
        licenseValidUntil: new Date('2099-12-31T00:00:00.000Z'), // licencia "infinita" del partner interno
        isInternal: true,
      },
    })
    console.log(`   · Partner interno "${PARTNER_NAME}" creado (${partner.id}).`)
  } else {
    console.log(`   · Partner interno existente reutilizado: "${partner.name}" (${partner.id}).`)
  }

  // 2. User PLATFORM_ADMIN (sin organizationId — opera cross-tenant)
  const passwordHash = await bcrypt.hash(PASSWORD, 12)
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { systemRole: 'PLATFORM_ADMIN', isActive: true },
    create: {
      email: EMAIL,
      passwordHash,
      firstName: FIRST,
      lastName: LAST,
      systemRole: 'PLATFORM_ADMIN',
      organizationId: null,
      isActive: true,
    },
  })

  // 3. PartnerMember vinculando User ↔ Partner (el trigger valida isInternal)
  const existingMember = await prisma.partnerMember.findUnique({ where: { userId: user.id } })
  if (!existingMember) {
    await prisma.partnerMember.create({
      data: {
        partnerId: partner.id,
        userId: user.id,
        role: 'PARTNER_ADMIN', // máximo rol dentro del firm; con systemRole PLATFORM_ADMIN = acceso pleno
        status: 'ACTIVE',
      },
    })
  }

  console.log(`✅ PLATFORM_ADMIN listo. Entra a la web con: ${EMAIL} / ${PASSWORD}`)
  console.log(`   → te lleva a Nova (/nova/clientes). Ve a /nova/wizard para onboardear un hotel real.`)
  console.log(`   ⚠️  Cambia la contraseña / usa una fuerte en producción.`)
}

main()
  .catch((e) => { console.error('❌ seed.platform falló:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
