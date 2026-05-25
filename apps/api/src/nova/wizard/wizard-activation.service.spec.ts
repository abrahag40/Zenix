/**
 * WizardActivationService — pre-flight + happy-path tests (Day 16).
 *
 * Cobertura mínima:
 *   · slug uniqueness rechazado (409)
 *   · email uniqueness rechazado (409)
 *   · properties.length === 0 rechazado (400)
 *   · properties.length > 50 rechazado (400)
 *   · happy path: crea Organization + LegalEntity + Properties + Owner + AuditLog
 */
import { BadRequestException, ConflictException } from '@nestjs/common'
import { WizardActivationService } from './wizard-activation.service'
import type { WizardActivateDto } from './dto/wizard-dto'

const baseActor = {
  sub: 'consultor-abraham',
  role: 'PLATFORM_ADMIN',
  organizationId: '',
  propertyId: '',
  systemRole: 'PLATFORM_ADMIN',
  email: 'abraham@zenix.com',
  actorTier: 'PLATFORM' as const,
  iat: 0,
  exp: 0,
} as any

function makeDto(overrides: Partial<WizardActivateDto> = {}): WizardActivateDto {
  return {
    organizationName: 'Hotel Test Tulum',
    organizationSlug: 'hotel-test-tulum',
    organizationCountryCode: 'MX',
    organizationTimezone: 'America/Cancun',
    brandEnabled: false,
    legalEntityName: 'Test Hospitality S.A. de C.V.',
    legalEntityTaxId: 'TBH240501ABC',
    legalEntityRegime: 'PERSONA_MORAL',
    legalEntityBaseCurrency: 'MXN',
    legalEntityPacAdapter: 'MX_FACTURAMA',
    properties: [
      {
        name: 'Hotel Test Tulum Centro',
        type: 'BOUTIQUE',
        timezone: 'America/Cancun',
        cityId: 'mx_tulum',
        cityDisplay: 'Tulum, Quintana Roo',
      },
    ],
    inventoryTemplate: 'BOUTIQUE',
    orgOwnerEmail: 'owner@hotel-test.com',
    orgOwnerName: 'María Fernández',
    ...overrides,
  }
}

function makePrismaMock(opts: {
  slugExists?: boolean
  emailExists?: boolean
  taxIdExists?: boolean
  txError?: Error
} = {}) {
  const orgFindUnique = jest.fn().mockResolvedValue(opts.slugExists ? { id: 'org-existing' } : null)
  const userFindUnique = jest.fn().mockResolvedValue(opts.emailExists ? { id: 'user-existing' } : null)
  const legalEntityFindFirst = jest.fn().mockResolvedValue(
    opts.taxIdExists ? { id: 'le-existing', organizationId: 'org-existing' } : null,
  )

  // Mock transactional create — simula creación de todas las entidades
  const tx = {
    organization: {
      create: jest.fn().mockResolvedValue({ id: 'new-org-id', slug: 'hotel-test-tulum' }),
      update: jest.fn().mockResolvedValue({}),
    },
    brand: {
      create: jest.fn().mockResolvedValue({ id: 'new-brand-id' }),
    },
    legalEntity: {
      create: jest.fn().mockResolvedValue({ id: 'new-le-id' }),
    },
    property: {
      create: jest.fn().mockResolvedValue({ id: 'new-prop-id' }),
    },
    propertySettings: {
      create: jest.fn().mockResolvedValue({}),
    },
    user: {
      create: jest.fn().mockResolvedValue({ id: 'new-owner-id', email: 'owner@hotel-test.com' }),
    },
    userPropertyRole: {
      create: jest.fn().mockResolvedValue({}),
    },
  }

  return {
    organization: { findUnique: orgFindUnique },
    user: { findUnique: userFindUnique },
    legalEntity: { findFirst: legalEntityFindFirst },
    $transaction: jest.fn().mockImplementation(async (fn: any) => {
      if (opts.txError) throw opts.txError
      return fn(tx)
    }),
    _tx: tx,
  } as any
}

function makeAuditMock() {
  return {
    write: jest.fn().mockResolvedValue({ id: 'audit-1' }),
  } as any
}

describe('WizardActivationService', () => {
  describe('pre-flight checks', () => {
    it('rejects if properties array is empty', async () => {
      const service = new WizardActivationService(makePrismaMock(), makeAuditMock())
      await expect(service.activate(makeDto({ properties: [] }), baseActor)).rejects.toThrow(
        BadRequestException,
      )
    })

    it('rejects if properties exceed 50 (chain too large)', async () => {
      const tooMany = Array.from({ length: 51 }, (_, i) => ({
        name: `Hotel ${i}`,
        type: 'BOUTIQUE' as const,
        timezone: 'America/Cancun',
      }))
      const service = new WizardActivationService(makePrismaMock(), makeAuditMock())
      await expect(service.activate(makeDto({ properties: tooMany }), baseActor)).rejects.toThrow(
        BadRequestException,
      )
    })

    it('rejects with 409 if slug already exists', async () => {
      const service = new WizardActivationService(
        makePrismaMock({ slugExists: true }),
        makeAuditMock(),
      )
      await expect(service.activate(makeDto(), baseActor)).rejects.toThrow(ConflictException)
    })

    it('rejects with 409 if email already exists', async () => {
      const service = new WizardActivationService(
        makePrismaMock({ emailExists: true }),
        makeAuditMock(),
      )
      await expect(service.activate(makeDto(), baseActor)).rejects.toThrow(ConflictException)
    })

    it('does NOT reject if same tax ID exists (multi-org with same RFC allowed)', async () => {
      // Tax ID dup is a soft warning logged, NOT a blocker
      const prisma = makePrismaMock({ taxIdExists: true })
      const service = new WizardActivationService(prisma, makeAuditMock())
      const res = await service.activate(makeDto(), baseActor)
      expect(res.organizationId).toBe('new-org-id')
    })
  })

  describe('happy path', () => {
    it('creates Organization + LegalEntity + Property + Owner + audit entry', async () => {
      const prisma = makePrismaMock()
      const audit = makeAuditMock()
      const service = new WizardActivationService(prisma, audit)
      const res = await service.activate(makeDto(), baseActor)

      expect(res.organizationId).toBe('new-org-id')
      expect(res.legalEntityId).toBe('new-le-id')
      expect(res.propertyIds).toHaveLength(1)
      expect(res.orgOwnerUserId).toBe('new-owner-id')
      expect(res.ownerSetupLink).toMatch(/\/setup\/[a-f0-9]{64}$/)
      expect(res.auditLogged).toBe(true)
      expect(res.activatedAt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)

      // Brand not created (brandEnabled=false)
      expect(prisma._tx.brand.create).not.toHaveBeenCalled()

      // Audit log called with the right action
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ORGANIZATION_ACTIVATED',
          target: 'new-org-id',
          status: 'SUCCESS',
          retentionPolicy: 'PERMANENT',
        }),
      )
    })

    it('creates Brand when brandEnabled=true with brandName', async () => {
      const prisma = makePrismaMock()
      const service = new WizardActivationService(prisma, makeAuditMock())
      await service.activate(
        makeDto({ brandEnabled: true, brandName: 'Tulum Collection' }),
        baseActor,
      )
      expect(prisma._tx.brand.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Tulum Collection' }),
        }),
      )
    })

    it('audit log failure does NOT throw — operación de negocio sigue', async () => {
      const prisma = makePrismaMock()
      const audit = { write: jest.fn().mockRejectedValue(new Error('audit DB down')) } as any
      const service = new WizardActivationService(prisma, audit)
      const res = await service.activate(makeDto(), baseActor)
      expect(res.organizationId).toBe('new-org-id')
      expect(res.auditLogged).toBe(false)
    })

    it('returns setup link with 64-hex token (32 bytes)', async () => {
      const service = new WizardActivationService(makePrismaMock(), makeAuditMock())
      const res = await service.activate(makeDto(), baseActor)
      const token = res.ownerSetupLink.split('/setup/')[1]
      expect(token).toMatch(/^[a-f0-9]{64}$/)
    })
  })

  describe('passes pacOverrideAccepted flag through', () => {
    it('records the override flag in pacCredentials.overrideAccepted', async () => {
      const prisma = makePrismaMock()
      const service = new WizardActivationService(prisma, makeAuditMock())
      await service.activate(makeDto({ pacOverrideAccepted: true }), baseActor)
      expect(prisma._tx.legalEntity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pacCredentials: expect.objectContaining({
              adapter: 'MX_FACTURAMA',
              pendingConfiguration: true,
              overrideAccepted: true,
            }),
          }),
        }),
      )
    })
  })
})
