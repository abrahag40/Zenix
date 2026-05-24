/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 1 seed.
 *
 * Crea:
 *   1. ZaharDev como Partner con isInternal=true, tier PLATINUM
 *   2. Primer User PLATFORM_ADMIN (Abraham — owner ZaharDev)
 *   3. PartnerMember linking the user al partner ZaharDev como PARTNER_ADMIN
 *   4. AuditLog seed entry registrando el bootstrap (no impersonation)
 *
 * Idempotente — re-ejecutable. Si ZaharDev Partner ya existe, lo actualiza.
 *
 * Decisiones aplicadas:
 *   §161 D-NOVA-3 — Partner.isInternal=true reservado para ZaharDev
 *   §165 D-NOVA-7 — AuditLog primer entry registrando bootstrap
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register prisma/scripts/seed-nova-foundation.ts
 */

import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

const ZAHARDEV_PARTNER_ID = 'partner-zahardev-internal'
const PLATFORM_ADMIN_USER_ID = 'user-abraham-platform-admin'
const PLATFORM_ADMIN_EMAIL = 'abrahag40@gmail.com'

async function main() {
  console.log('🌟 Nova foundation seed — Day 1')
  console.log('─'.repeat(60))

  // 1. ZaharDev como Partner internal — PLATINUM tier
  const zahardev = await prisma.partner.upsert({
    where: { id: ZAHARDEV_PARTNER_ID },
    update: {
      tier: 'PLATINUM',
      isInternal: true,
    },
    create: {
      id: ZAHARDEV_PARTNER_ID,
      name: 'ZaharDev',
      tier: 'PLATINUM',
      countryCode: 'MX',
      contactEmail: PLATFORM_ADMIN_EMAIL,
      contactPhone: null,
      licenseValidUntil: new Date('2099-12-31'), // platform owner — license sin expiración
      parentPartnerId: null,
      isInternal: true, // ← único Partner con este flag
    },
  })
  console.log(`✓ Partner: ZaharDev (${zahardev.id}) — tier=${zahardev.tier} isInternal=${zahardev.isInternal}`)

  // 2. Primer User con systemRole=PLATFORM_ADMIN
  // organizationId = null porque PLATFORM_ADMIN no pertenece a una Org cliente.
  const passwordHash = await bcrypt.hash('123456', 10)
  const platformAdmin = await prisma.user.upsert({
    where: { email: PLATFORM_ADMIN_EMAIL },
    update: {
      systemRole: 'PLATFORM_ADMIN',
      organizationId: null,
    },
    create: {
      id: PLATFORM_ADMIN_USER_ID,
      organizationId: null, // sin Org — vive en el Partner ZaharDev
      email: PLATFORM_ADMIN_EMAIL,
      passwordHash,
      firstName: 'Abraham',
      lastName: 'ZaharDev',
      isActive: true,
      systemRole: 'PLATFORM_ADMIN',
    },
  })
  console.log(`✓ User: ${platformAdmin.email} (${platformAdmin.id}) — systemRole=${platformAdmin.systemRole}`)

  // 3. PartnerMember linking — Abraham es PARTNER_ADMIN del Partner ZaharDev
  // (PARTNER_ADMIN dentro del firm + systemRole=PLATFORM_ADMIN cross-Partner).
  const member = await prisma.partnerMember.upsert({
    where: { userId: platformAdmin.id },
    update: {
      role: 'PARTNER_ADMIN',
      partnerId: zahardev.id,
      status: 'ACTIVE',
    },
    create: {
      partnerId: zahardev.id,
      userId: platformAdmin.id,
      role: 'PARTNER_ADMIN',
      status: 'ACTIVE',
      joinedAt: new Date(),
      certifiedAt: new Date(),
      certificationLevel: 'PLATINUM',
    },
  })
  console.log(`✓ PartnerMember: Abraham → ZaharDev (${member.id}) — role=${member.role}`)

  // 4. AuditLog primer entry: bootstrap (sin organizationId real — sentinel)
  // Como AuditLog requiere organizationId NOT NULL, este entry usa un Org sentinel
  // creado solo para registros platform-wide. Si no existe, lo creamos.
  let platformSentinelOrg = await prisma.organization.findFirst({
    where: { slug: 'zahardev-platform-sentinel' },
  })
  if (!platformSentinelOrg) {
    platformSentinelOrg = await prisma.organization.create({
      data: {
        name: 'ZaharDev Platform Sentinel (audit-only)',
        slug: 'zahardev-platform-sentinel',
        plan: 'ENTERPRISE',
        countryCode: 'MX',
      },
    })
    console.log(`✓ Sentinel Org: ${platformSentinelOrg.id} (audit-only, no real properties)`)
  }

  await prisma.auditLog.create({
    data: {
      organizationId: platformSentinelOrg.id,
      actorRealId: platformAdmin.id,
      actorRealRole: 'PLATFORM_ADMIN',
      onBehalfOfId: null,
      onBehalfOfRole: null,
      action: 'NOVA_FOUNDATION_BOOTSTRAP',
      target: zahardev.id,
      payload: {
        sprint: 'NOVA-CHANNEX-COMMAND-CENTER',
        day: 1,
        decision: '§159-§175 D-NOVA-1..17',
        seedScript: 'seed-nova-foundation.ts',
      },
      status: 'SUCCESS',
      retentionPolicy: 'PERMANENT',
    },
  })
  console.log(`✓ AuditLog: bootstrap entry persistido (retentionPolicy=PERMANENT)`)

  console.log('─'.repeat(60))
  console.log('✨ Nova foundation seed complete.')
  console.log('')
  console.log('Login credentials:')
  console.log(`  Email:    ${PLATFORM_ADMIN_EMAIL}`)
  console.log(`  Password: 123456`)
  console.log(`  Role:     PLATFORM_ADMIN (Nova access)`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
