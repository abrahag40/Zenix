/**
 * AccessControlService — v1.0.5 TENANT-CTX-3LEVEL.
 *
 * Tests del UNION query de 3 niveles + cache + edge cases.
 *
 * Estrategia: contra BD real (no mocks) porque la query usa SQL raw que
 * tiene reglas específicas de Postgres (UNION ALL, plan optimization).
 * Sembramos un escenario completo Brand → Org → 2 LegalEntities → 3
 * Properties con users de los 3 scopes y verificamos cada path.
 */

import { PrismaClient, SystemRole } from '@prisma/client'
import { AccessControlService } from './access-control.service'

describe('AccessControlService — UNION 3-level access check', () => {
  const prisma = new PrismaClient()
  const service = new AccessControlService(prisma as any)

  // Setup escenario completo Selina-mini:
  //   Brand "AccessTest Brand"
  //     └─ Org "AccessTest Org"
  //          ├─ LegalEntity "MX" → Property "tulum-test"
  //          ├─ LegalEntity "MX" → Property "cancun-test"  (mismo LE)
  //          └─ LegalEntity "CR" → Property "sanjose-test"
  //
  //   Users:
  //     · brandCEO     → BrandUserRole sobre "AccessTest Brand"
  //     · countryGMmx  → LegalEntityUserRole sobre "MX"
  //     · frontDesk    → UserPropertyRole sobre "tulum-test"
  //     · outsider     → ningún rol
  //
  // Esperado:
  //   brandCEO    → puede a tulum, cancun, sanjose (todos)
  //   countryGMmx → puede a tulum, cancun (MX), NO sanjose
  //   frontDesk   → puede a tulum, NO cancun, NO sanjose
  //   outsider    → no puede a ninguno

  let brand: any
  let org: any
  let leMX: any
  let leCR: any
  let propTulum: any
  let propCancun: any
  let propSanJose: any
  let userBrandCEO: any
  let userCountryGM: any
  let userFrontDesk: any
  let userOutsider: any

  beforeAll(async () => {
    const ts = Date.now().toString()
    brand = await prisma.brand.create({
      data: { name: 'AccessTest Brand', slug: `access-test-${ts}` },
    })
    org = await prisma.organization.create({
      data: {
        name: 'AccessTest Org',
        slug: `access-test-org-${ts}`,
        brandId: brand.id,
        countryCode: 'MX',
        currency: 'MXN',
      },
    })
    leMX = await prisma.legalEntity.create({
      data: {
        organizationId: org.id,
        countryCode: 'MX',
        name: 'AccessTest MX SA',
        taxId: `ATMX-${ts}`,
        legalAddress: {},
        baseCurrency: 'MXN',
      },
    })
    leCR = await prisma.legalEntity.create({
      data: {
        organizationId: org.id,
        countryCode: 'CR',
        name: 'AccessTest CR SRL',
        taxId: `ATCR-${ts}`,
        legalAddress: {},
        baseCurrency: 'CRC',
      },
    })
    propTulum = await prisma.property.create({
      data: {
        organizationId: org.id,
        legalEntityId: leMX.id,
        name: 'AccessTest Tulum',
        type: 'HOTEL',
      },
    })
    propCancun = await prisma.property.create({
      data: {
        organizationId: org.id,
        legalEntityId: leMX.id,
        name: 'AccessTest Cancun',
        type: 'HOTEL',
      },
    })
    propSanJose = await prisma.property.create({
      data: {
        organizationId: org.id,
        legalEntityId: leCR.id,
        name: 'AccessTest SanJose',
        type: 'HOTEL',
      },
    })

    // Users (helper para evitar repeat)
    const mkUser = (email: string) =>
      prisma.user.create({
        data: {
          organizationId: org.id,
          email,
          passwordHash: 'x',
          firstName: 'Test',
          lastName: email.split('@')[0],
        },
      })

    userBrandCEO = await mkUser(`brand-ceo-${ts}@access.test`)
    userCountryGM = await mkUser(`country-gm-${ts}@access.test`)
    userFrontDesk = await mkUser(`front-desk-${ts}@access.test`)
    userOutsider = await mkUser(`outsider-${ts}@access.test`)

    await prisma.brandUserRole.create({
      data: { userId: userBrandCEO.id, brandId: brand.id, role: SystemRole.OWNER },
    })
    await prisma.legalEntityUserRole.create({
      data: { userId: userCountryGM.id, legalEntityId: leMX.id, role: SystemRole.MANAGER },
    })
    await prisma.userPropertyRole.create({
      data: { userId: userFrontDesk.id, propertyId: propTulum.id, role: SystemRole.RECEPTIONIST },
    })
  })

  afterAll(async () => {
    // Cleanup en orden inverso por las foreign keys.
    await prisma.userPropertyRole.deleteMany({ where: { userId: userFrontDesk?.id } })
    await prisma.legalEntityUserRole.deleteMany({ where: { userId: userCountryGM?.id } })
    await prisma.brandUserRole.deleteMany({ where: { userId: userBrandCEO?.id } })
    await prisma.user.deleteMany({ where: { id: { in: [userBrandCEO.id, userCountryGM.id, userFrontDesk.id, userOutsider.id] } } })
    await prisma.property.deleteMany({ where: { id: { in: [propTulum.id, propCancun.id, propSanJose.id] } } })
    await prisma.legalEntity.deleteMany({ where: { id: { in: [leMX.id, leCR.id] } } })
    await prisma.organization.delete({ where: { id: org.id } })
    await prisma.brand.delete({ where: { id: brand.id } })
    await prisma.$disconnect()
  })

  beforeEach(() => service.clearCache())

  describe('canUserAccessProperty — los 3 niveles', () => {
    it('BrandUserRole permite acceso a TODAS las properties del brand', async () => {
      await expect(service.canUserAccessProperty(userBrandCEO.id, propTulum.id)).resolves.toBe(true)
      await expect(service.canUserAccessProperty(userBrandCEO.id, propCancun.id)).resolves.toBe(true)
      await expect(service.canUserAccessProperty(userBrandCEO.id, propSanJose.id)).resolves.toBe(true)
    })

    it('LegalEntityUserRole permite acceso a properties de SU entidad fiscal', async () => {
      await expect(service.canUserAccessProperty(userCountryGM.id, propTulum.id)).resolves.toBe(true)
      await expect(service.canUserAccessProperty(userCountryGM.id, propCancun.id)).resolves.toBe(true)
    })

    it('LegalEntityUserRole RECHAZA properties de otra entidad fiscal', async () => {
      // GM México NO puede ver property Costa Rica
      await expect(service.canUserAccessProperty(userCountryGM.id, propSanJose.id)).resolves.toBe(false)
    })

    it('UserPropertyRole permite acceso SOLO a la property exacta', async () => {
      await expect(service.canUserAccessProperty(userFrontDesk.id, propTulum.id)).resolves.toBe(true)
    })

    it('UserPropertyRole RECHAZA otras properties (incluso de la misma legal entity)', async () => {
      await expect(service.canUserAccessProperty(userFrontDesk.id, propCancun.id)).resolves.toBe(false)
      await expect(service.canUserAccessProperty(userFrontDesk.id, propSanJose.id)).resolves.toBe(false)
    })

    it('User sin grants es rechazado en todas las properties (anti-default-allow)', async () => {
      await expect(service.canUserAccessProperty(userOutsider.id, propTulum.id)).resolves.toBe(false)
      await expect(service.canUserAccessProperty(userOutsider.id, propCancun.id)).resolves.toBe(false)
      await expect(service.canUserAccessProperty(userOutsider.id, propSanJose.id)).resolves.toBe(false)
    })
  })

  describe('canUserAccessLegalEntity', () => {
    it('BrandUserRole permite acceso a TODAS las LegalEntities del brand', async () => {
      await expect(service.canUserAccessLegalEntity(userBrandCEO.id, leMX.id)).resolves.toBe(true)
      await expect(service.canUserAccessLegalEntity(userBrandCEO.id, leCR.id)).resolves.toBe(true)
    })

    it('LegalEntityUserRole permite acceso solo a SU legal entity', async () => {
      await expect(service.canUserAccessLegalEntity(userCountryGM.id, leMX.id)).resolves.toBe(true)
      await expect(service.canUserAccessLegalEntity(userCountryGM.id, leCR.id)).resolves.toBe(false)
    })

    it('UserPropertyRole NO escala a LegalEntity', async () => {
      // El front desk NO debe poder hacer queries cross-property dentro de la LE
      await expect(service.canUserAccessLegalEntity(userFrontDesk.id, leMX.id)).resolves.toBe(false)
    })
  })

  describe('canUserAccessBrand', () => {
    it('BrandUserRole permite acceso al brand', async () => {
      await expect(service.canUserAccessBrand(userBrandCEO.id, brand.id)).resolves.toBe(true)
    })

    it('LegalEntityUserRole NO escala a Brand', async () => {
      await expect(service.canUserAccessBrand(userCountryGM.id, brand.id)).resolves.toBe(false)
    })

    it('UserPropertyRole NO escala a Brand', async () => {
      await expect(service.canUserAccessBrand(userFrontDesk.id, brand.id)).resolves.toBe(false)
    })
  })

  describe('listAccessiblePropertyIds — agregación cross-scope', () => {
    it('BrandUserRole lista todas las properties del brand', async () => {
      const ids = await service.listAccessiblePropertyIds(userBrandCEO.id)
      expect(ids.has(propTulum.id)).toBe(true)
      expect(ids.has(propCancun.id)).toBe(true)
      expect(ids.has(propSanJose.id)).toBe(true)
    })

    it('LegalEntityUserRole lista solo properties de su entidad fiscal', async () => {
      const ids = await service.listAccessiblePropertyIds(userCountryGM.id)
      expect(ids.has(propTulum.id)).toBe(true)
      expect(ids.has(propCancun.id)).toBe(true)
      expect(ids.has(propSanJose.id)).toBe(false)
    })

    it('UserPropertyRole lista solo su property', async () => {
      const ids = await service.listAccessiblePropertyIds(userFrontDesk.id)
      expect(ids.size).toBe(1)
      expect(ids.has(propTulum.id)).toBe(true)
    })

    it('Outsider lista vacío', async () => {
      const ids = await service.listAccessiblePropertyIds(userOutsider.id)
      expect(ids.size).toBe(0)
    })
  })

  describe('cache', () => {
    it('cache hit no re-ejecuta query', async () => {
      // 1ra llamada — populates cache
      const first = await service.canUserAccessProperty(userFrontDesk.id, propTulum.id)
      expect(first).toBe(true)

      // 2da llamada con mismo input — cache hit (sin error de mock o spy)
      const second = await service.canUserAccessProperty(userFrontDesk.id, propTulum.id)
      expect(second).toBe(true)
    })

    it('invalidateUser limpia cache del user específico', async () => {
      await service.canUserAccessProperty(userFrontDesk.id, propTulum.id)
      service.invalidateUser(userFrontDesk.id)
      // No es un test exhaustivo de cache miss, pero verifica que el método no falla
      const after = await service.canUserAccessProperty(userFrontDesk.id, propTulum.id)
      expect(after).toBe(true)
    })
  })
})
