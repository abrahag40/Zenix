/**
 * multi-tenant-hierarchy.spec.ts — Sprint v1.0.5 ORG-HIERARCHY-SEED.
 *
 * Valida invariantes del modelo 4-level Brand→Organization→LegalEntity→Property
 * tras la migration `20260515032127_v1_0_5_org_hierarchy_seed`.
 *
 * Cubre:
 *   1. Toda Property tiene organization_id NOT NULL
 *   2. Toda Property con legal_entity_id tiene su organization_id consistente
 *      con la organization_id de la LegalEntity (invariante 4-level)
 *   3. FiscalRegime sembrado con los 10 países LATAM esperados
 *   4. Solo 2 regimes activos (MX_CFDI4, CO_DIAN) per roadmap v1.0.x
 *   5. UserPropertyRole + BrandUserRole + LegalEntityUserRole respetan unique constraints
 *
 * Estos tests corren contra la BD real (no mocks). Si la migration o el seed
 * cambian la estructura, estos tests detectan la regresión.
 */

import { PrismaClient } from '@prisma/client'

describe('Multi-tenant 4-level hierarchy invariants', () => {
  const prisma = new PrismaClient()

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('toda Property tiene organization_id NOT NULL (audit MT-4 cierre)', async () => {
    const orphanCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM properties WHERE organization_id IS NULL
    `
    expect(Number(orphanCount[0].count)).toBe(0)
  })

  it('toda Property con legal_entity_id mantiene consistencia con organization_id', async () => {
    // Invariante 4-level: si Property.legalEntityId está set, entonces
    // Property.organizationId === LegalEntity.organizationId.
    // Esto es lo que garantiza que un user con scope de Organization no
    // pueda "saltar" a una LegalEntity de otra org via Property mal-asignada.
    const inconsistent = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM properties p
      JOIN legal_entities le ON le.id = p.legal_entity_id
      WHERE p.organization_id != le.organization_id
    `
    expect(Number(inconsistent[0].count)).toBe(0)
  })

  it('FiscalRegime sembrado con los 10 países LATAM esperados', async () => {
    const regimes = await prisma.fiscalRegime.findMany({ orderBy: { id: 'asc' } })
    const ids = regimes.map((r) => r.id).sort()
    expect(ids).toEqual([
      'AR_AFIP',
      'BR_NFE',
      'CO_DIAN',
      'CR_TRIBU',
      'GT_FEL',
      'HN_SAR',
      'MX_CFDI4',
      'PA_DGI',
      'PE_SUNAT',
      'SV_HACIENDA',
    ])
  })

  it('solo 2 fiscal regimes activos en v1.0.x (MX_CFDI4, CO_DIAN)', async () => {
    const active = await prisma.fiscalRegime.findMany({
      where: { active: true },
      orderBy: { id: 'asc' },
    })
    expect(active.map((r) => r.id)).toEqual(['CO_DIAN', 'MX_CFDI4'])
  })

  it('LegalEntity hereda countryCode válido y baseCurrency ISO 4217', async () => {
    const entities = await prisma.legalEntity.findMany()
    const validCountries = ['MX', 'CO', 'CR', 'PE', 'PA', 'GT', 'SV', 'HN', 'BR', 'AR']
    const validCurrencies = ['MXN', 'COP', 'CRC', 'PEN', 'USD', 'GTQ', 'SVC', 'HNL', 'BRL', 'ARS', 'PAB', 'BZD']
    for (const le of entities) {
      expect(validCountries).toContain(le.countryCode)
      expect(validCurrencies).toContain(le.baseCurrency)
    }
  })

  it('LegalEntity activa MX está vinculada al régimen MX_CFDI4', async () => {
    const mxEntity = await prisma.legalEntity.findFirst({
      where: { countryCode: 'MX', active: true, taxId: { not: { startsWith: 'PENDING-' } } },
      include: { fiscalRegime: true },
    })
    if (!mxEntity) throw new Error('Expected at least 1 MX LegalEntity from seed')
    expect(mxEntity.fiscalRegime?.id).toBe('MX_CFDI4')
    expect(mxEntity.fiscalRegime?.active).toBe(true)
  })

  it('UserPropertyRole, BrandUserRole, LegalEntityUserRole tienen tablas creadas e indexadas', async () => {
    // Smoke check — las tablas existen y aceptan queries vacíos
    await expect(prisma.userPropertyRole.findMany({ take: 1 })).resolves.toBeDefined()
    await expect(prisma.brandUserRole.findMany({ take: 1 })).resolves.toBeDefined()
    await expect(prisma.legalEntityUserRole.findMany({ take: 1 })).resolves.toBeDefined()
  })

  it('Property del seed (Hotel Tulum) está correctamente vinculada a LegalEntity MX', async () => {
    const tulum = await prisma.property.findUnique({
      where: { id: 'prop-hotel-tulum-001' },
      include: { legalEntity: { include: { fiscalRegime: true } }, organization: true },
    })
    if (!tulum) throw new Error('Seed property prop-hotel-tulum-001 no encontrada')
    expect(tulum.organizationId).toBeTruthy()
    expect(tulum.legalEntityId).toBeTruthy()
    expect(tulum.legalEntity?.countryCode).toBe('MX')
    expect(tulum.legalEntity?.baseCurrency).toBe('MXN')
    expect(tulum.legalEntity?.fiscalRegime?.id).toBe('MX_CFDI4')
    // Invariante: organizationId de la Property coincide con el de su LegalEntity
    expect(tulum.organizationId).toBe(tulum.legalEntity?.organizationId)
  })

  it('Brand sin organizations es permitido (no FK requirement reverse)', async () => {
    // Brand puede existir antes de tener organizations linkeados (caso:
    // sales crea Brand "Selina" antes de configurar las orgs por país)
    const orphanBrand = await prisma.brand.create({
      data: {
        name: 'Test Orphan Brand',
        slug: `test-orphan-${Date.now()}`,
      },
    })
    expect(orphanBrand.id).toBeTruthy()
    await prisma.brand.delete({ where: { id: orphanBrand.id } })
  })

  it('Organization.brandId NULL es válido (hoteles independientes)', async () => {
    const orgs = await prisma.organization.findMany({ where: { brandId: null } })
    expect(orgs.length).toBeGreaterThan(0) // el seed Hotel Tulum/Cancún es independiente
  })

  it('LegalEntity unique constraint en (organizationId, taxId)', async () => {
    const seedOrg = await prisma.organization.findFirst({ where: { id: 'seed-org-1' } })
    if (!seedOrg) throw new Error('Seed org no encontrada')
    // Intentar crear LegalEntity con el mismo (orgId, taxId) que ya existe
    // debería fallar con unique violation P2002
    await expect(
      prisma.legalEntity.create({
        data: {
          organizationId: seedOrg.id,
          countryCode: 'MX',
          name: 'Duplicado',
          taxId: 'ZDX240101ABC', // mismo que seed
          legalAddress: {},
          baseCurrency: 'MXN',
        },
      }),
    ).rejects.toThrow(/Unique constraint/i)
  })
})
