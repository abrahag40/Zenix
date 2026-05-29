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

function makeEmailMock(opts: { sent?: boolean; throws?: boolean } = {}) {
  return {
    sendActivationEmail: jest.fn().mockImplementation(async () => {
      if (opts.throws) throw new Error('email service down')
      return { sent: opts.sent ?? true, resendMessageId: 'rsd_test_1' }
    }),
  } as any
}

// Day 7 — Billing mocks. Default: Stripe NO configurado → wizard skip
// subscription creation silenciosamente. Spec puede activarlo via
// makeBillingMock({ stripeConfigured: true }) para verificar happy path.
function makeBillingMock(opts: { stripeConfigured?: boolean } = {}) {
  return {
    isStripeConfigured: () => opts.stripeConfigured ?? false,
  } as any
}

function makeSubscriptionMock() {
  // Netflix-style trial Day 1 — el wizard ahora llama createPendingSubscription
  // (no createSubscription). Status='pending_payment_method' hasta que el
  // cliente captura tarjeta en Stripe Checkout setup mode.
  return {
    createPendingSubscription: jest.fn().mockResolvedValue({
      id: 'sub-zenix-1',
      stripeSubscriptionId: 'pending_test-uuid',
      status: 'pending_payment_method',
      planTier: 'PRO',
    }),
    // Mantenemos createSubscription en mock para tests legacy / por si algún
    // test cubre el endpoint admin que aún lo usa
    createSubscription: jest.fn().mockResolvedValue({
      id: 'sub-zenix-1',
      stripeSubscriptionId: 'sub_stripe_1',
      status: 'trialing',
      planTier: 'PRO',
    }),
  } as any
}

function makeDiscountMock(opts: { kind?: 'applied' | 'pending_approval' } = {}) {
  return {
    generate: jest.fn().mockResolvedValue(
      opts.kind === 'pending_approval'
        ? { kind: 'pending_approval', request: { id: 'req-1' } }
        : { kind: 'applied', discount: { id: 'disc-1' } },
    ),
    // Sprint DISCOUNT-CODES Day 4 — applyTemplate wrapper
    applyTemplate: jest.fn().mockResolvedValue(
      opts.kind === 'pending_approval'
        ? { kind: 'pending_approval', request: { id: 'req-tpl-1' }, templateName: 'TPL-X' }
        : { kind: 'applied', discount: { id: 'disc-tpl-1' }, templateName: 'TPL-X' },
    ),
  } as any
}

// Sprint CHANNEX-AUTO-PROVISION Day 3 — provision service mock
function makeChannexProvisionMock() {
  return {
    provisionFromWizard: jest.fn().mockResolvedValue({
      status: 'completed',
      groupId: 'grp-test',
      propertiesProvisioned: 1,
      roomTypesCreated: 0,
      ratePlansCreated: 0,
      channelsCreated: 0,
      channelsRequiringOauth: 0,
      channelsPendingCredentials: 0,
      errors: [],
    }),
    retryProperty: jest.fn(),
  } as any
}

function makeServiceWithDefaults(prismaMock?: any, opts?: { stripeConfigured?: boolean }) {
  return new WizardActivationService(
    prismaMock ?? makePrismaMock(),
    makeAuditMock(),
    makeEmailMock(),
    makeSubscriptionMock(),
    makeDiscountMock(),
    makeBillingMock({ stripeConfigured: opts?.stripeConfigured ?? false }),
    makeChannexProvisionMock(),
  )
}

describe('WizardActivationService', () => {
  describe('pre-flight checks', () => {
    it('rejects if properties array is empty', async () => {
      const service = new WizardActivationService(makePrismaMock(), makeAuditMock(), makeEmailMock(), makeSubscriptionMock(), makeDiscountMock(), makeBillingMock(), makeChannexProvisionMock())
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
      const service = new WizardActivationService(makePrismaMock(), makeAuditMock(), makeEmailMock(), makeSubscriptionMock(), makeDiscountMock(), makeBillingMock(), makeChannexProvisionMock())
      await expect(service.activate(makeDto({ properties: tooMany }), baseActor)).rejects.toThrow(
        BadRequestException,
      )
    })

    it('rejects with 409 if slug already exists', async () => {
      const service = new WizardActivationService(
        makePrismaMock({ slugExists: true }),
        makeAuditMock(),
        makeEmailMock(),
        makeSubscriptionMock(),
        makeDiscountMock(),
        makeBillingMock(),
        makeChannexProvisionMock(),
      )
      await expect(service.activate(makeDto(), baseActor)).rejects.toThrow(ConflictException)
    })

    it('rejects with 409 if email already exists', async () => {
      const service = new WizardActivationService(
        makePrismaMock({ emailExists: true }),
        makeAuditMock(),
        makeEmailMock(),
        makeSubscriptionMock(),
        makeDiscountMock(),
        makeBillingMock(),
        makeChannexProvisionMock(),
      )
      await expect(service.activate(makeDto(), baseActor)).rejects.toThrow(ConflictException)
    })

    it('does NOT reject if same tax ID exists (multi-org with same RFC allowed)', async () => {
      // Tax ID dup is a soft warning logged, NOT a blocker
      const prisma = makePrismaMock({ taxIdExists: true })
      const service = new WizardActivationService(prisma, makeAuditMock(), makeEmailMock(), makeSubscriptionMock(), makeDiscountMock(), makeBillingMock(), makeChannexProvisionMock())
      const res = await service.activate(makeDto(), baseActor)
      expect(res.organizationId).toBe('new-org-id')
    })
  })

  describe('happy path', () => {
    it('creates Organization + LegalEntity + Property + Owner + audit entry', async () => {
      const prisma = makePrismaMock()
      const audit = makeAuditMock()
      const service = new WizardActivationService(prisma, audit, makeEmailMock(), makeSubscriptionMock(), makeDiscountMock(), makeBillingMock(), makeChannexProvisionMock())
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
      const service = new WizardActivationService(prisma, makeAuditMock(), makeEmailMock(), makeSubscriptionMock(), makeDiscountMock(), makeBillingMock(), makeChannexProvisionMock())
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
      const service = new WizardActivationService(prisma, audit, makeEmailMock(), makeSubscriptionMock(), makeDiscountMock(), makeBillingMock(), makeChannexProvisionMock())
      const res = await service.activate(makeDto(), baseActor)
      expect(res.organizationId).toBe('new-org-id')
      expect(res.auditLogged).toBe(false)
    })

    it('email failure does NOT throw — setup link queda en response', async () => {
      const service = new WizardActivationService(
        makePrismaMock(),
        makeAuditMock(),
        makeEmailMock({ throws: true }),
        makeSubscriptionMock(),
        makeDiscountMock(),
        makeBillingMock(),
        makeChannexProvisionMock(),
      )
      const res = await service.activate(makeDto(), baseActor)
      expect(res.organizationId).toBe('new-org-id')
      expect(res.emailSent).toBe(false)
      expect(res.ownerSetupLink).toMatch(/\/setup\/[a-f0-9]{64}$/)
    })

    it('emailSent=true when Resend stub returns success', async () => {
      const email = makeEmailMock({ sent: true })
      const service = new WizardActivationService(
        makePrismaMock(),
        makeAuditMock(),
        email,
        makeSubscriptionMock(),
        makeDiscountMock(),
        makeBillingMock(),
        makeChannexProvisionMock(),
      )
      const res = await service.activate(makeDto(), baseActor)
      expect(res.emailSent).toBe(true)
      expect(email.sendActivationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@hotel-test.com',
          ownerName: 'María Fernández',
          organizationName: 'Hotel Test Tulum',
          hoursUntilExpiry: 72,
          propertyCount: 1,
        }),
      )
    })

    it('returns setup link with 64-hex token (32 bytes)', async () => {
      const service = new WizardActivationService(makePrismaMock(), makeAuditMock(), makeEmailMock(), makeSubscriptionMock(), makeDiscountMock(), makeBillingMock(), makeChannexProvisionMock())
      const res = await service.activate(makeDto(), baseActor)
      const token = res.ownerSetupLink.split('/setup/')[1]
      expect(token).toMatch(/^[a-f0-9]{64}$/)
    })
  })

  // ── Day 7 — Stripe Subscription post-tx ───────────────────────────
  describe('Stripe subscription (Day 7)', () => {
    it('skip silencioso si Stripe NO está configurado (subscription=null)', async () => {
      const subscription = makeSubscriptionMock()
      const service = new WizardActivationService(
        makePrismaMock(),
        makeAuditMock(),
        makeEmailMock(),
        subscription,
        makeDiscountMock(),
        makeBillingMock({ stripeConfigured: false }),
        makeChannexProvisionMock(),
      )
      const res = await service.activate(makeDto({ planTier: 'PRO' }), baseActor)
      expect(subscription.createPendingSubscription).not.toHaveBeenCalled()
      expect(res.subscription).toBeNull()
    })

    it('crea pending Subscription cuando planTier presente + Stripe configurado (Netflix flow)', async () => {
      const subscription = makeSubscriptionMock()
      const service = new WizardActivationService(
        makePrismaMock(),
        makeAuditMock(),
        makeEmailMock(),
        subscription,
        makeDiscountMock(),
        makeBillingMock({ stripeConfigured: true }),
        makeChannexProvisionMock(),
      )
      const res = await service.activate(
        makeDto({ planTier: 'PRO', billingCycle: 'monthly', trialDays: 14 }),
        baseActor,
      )
      // Netflix-style trial: wizard llama createPendingSubscription (no
      // createSubscription). El Sub queda en pending_payment_method hasta que
      // el cliente capture tarjeta en Stripe Checkout setup mode.
      expect(subscription.createPendingSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'new-org-id',
          planTier: 'PRO',
          propertyCount: 1,
          billingCycle: 'monthly',
          trialDays: 14,
          ownerEmail: 'owner@hotel-test.com',
        }),
        baseActor,
      )
      // El flag legacy allowIncompleteWithoutPaymentMethod NO se pasa más
      // — pendiente de tarjeta es el state default ahora.
      expect(subscription.createPendingSubscription).not.toHaveBeenCalledWith(
        expect.objectContaining({ allowIncompleteWithoutPaymentMethod: true }),
        expect.anything(),
      )
      expect(res.subscription).toEqual({
        id: 'sub-zenix-1',
        stripeSubscriptionId: 'pending_test-uuid',
        status: 'pending_payment_method',
        planTier: 'PRO',
        discountApplied: false,
        discountStatus: null,
      })
    })

    it('aplica discount cuando discount presente + dentro de cap → applied', async () => {
      const discount = makeDiscountMock({ kind: 'applied' })
      const service = new WizardActivationService(
        makePrismaMock(),
        makeAuditMock(),
        makeEmailMock(),
        makeSubscriptionMock(),
        discount,
        makeBillingMock({ stripeConfigured: true }),
        makeChannexProvisionMock(),
      )
      const res = await service.activate(
        makeDto({
          planTier: 'PRO',
          discount: {
            percentOff: 20,
            duration: 'repeating',
            durationInMonths: 3,
            reason: 'Cliente piloto referido por consultor — bienvenida 3m.',
          },
        }),
        baseActor,
      )
      expect(discount.generate).toHaveBeenCalled()
      expect(res.subscription?.discountApplied).toBe(true)
      expect(res.subscription?.discountStatus).toBe('applied')
    })

    it('si discount excede cap → pending_approval (no rompe activación)', async () => {
      const discount = makeDiscountMock({ kind: 'pending_approval' })
      const service = new WizardActivationService(
        makePrismaMock(),
        makeAuditMock(),
        makeEmailMock(),
        makeSubscriptionMock(),
        discount,
        makeBillingMock({ stripeConfigured: true }),
        makeChannexProvisionMock(),
      )
      const res = await service.activate(
        makeDto({
          planTier: 'PRO',
          discount: {
            percentOff: 40,
            duration: 'forever',
            reason: 'Cliente estratégico — descuento permanente solicitado.',
          },
        }),
        baseActor,
      )
      expect(res.subscription?.discountApplied).toBe(false)
      expect(res.subscription?.discountStatus).toBe('pending_approval')
      expect(res.organizationId).toBe('new-org-id') // org activada igualmente
    })

    it('si Stripe falla → activación sigue, subscription queda null', async () => {
      const subscription = {
        createSubscription: jest.fn().mockRejectedValue(new Error('Stripe down')),
      } as any
      const service = new WizardActivationService(
        makePrismaMock(),
        makeAuditMock(),
        makeEmailMock(),
        subscription,
        makeDiscountMock(),
        makeBillingMock({ stripeConfigured: true }),
        makeChannexProvisionMock(),
      )
      const res = await service.activate(makeDto({ planTier: 'PRO' }), baseActor)
      expect(res.organizationId).toBe('new-org-id') // org NO se rolleó
      expect(res.subscription).toBeNull() // pero subscription quedó null
    })
  })

  // ── Sprint DISCOUNT-CODES Day 4 — templateId path ─────────────────
  describe('Discount via template (Day 4 DISCOUNT-CODES)', () => {
    it('discountTemplateId prevalece sobre discount manual → applyTemplate', async () => {
      const discount = makeDiscountMock({ kind: 'applied' })
      const service = new WizardActivationService(
        makePrismaMock(),
        makeAuditMock(),
        makeEmailMock(),
        makeSubscriptionMock(),
        discount,
        makeBillingMock({ stripeConfigured: true }),
        makeChannexProvisionMock(),
      )
      const res = await service.activate(
        makeDto({
          planTier: 'PRO',
          discountTemplateId: 'tpl-piloto-q3-2026',
          // discount manual NO debe aplicarse cuando templateId está set
          discount: {
            percentOff: 30,
            duration: 'forever',
            reason: 'Manual override que NO debería usarse.',
          },
        }),
        baseActor,
      )
      // applyTemplate fue llamado con el templateId
      expect(discount.applyTemplate).toHaveBeenCalledWith(
        'tpl-piloto-q3-2026',
        'sub-zenix-1',
        baseActor,
      )
      // generate (manual override) NO fue llamado
      expect(discount.generate).not.toHaveBeenCalled()
      expect(res.subscription?.discountApplied).toBe(true)
      expect(res.subscription?.discountStatus).toBe('applied')
    })

    it('discountTemplateId con cap excedido → pending_approval (no rompe activación)', async () => {
      const discount = makeDiscountMock({ kind: 'pending_approval' })
      const service = new WizardActivationService(
        makePrismaMock(),
        makeAuditMock(),
        makeEmailMock(),
        makeSubscriptionMock(),
        discount,
        makeBillingMock({ stripeConfigured: true }),
        makeChannexProvisionMock(),
      )
      const res = await service.activate(
        makeDto({
          planTier: 'PRO',
          discountTemplateId: 'tpl-excede-cap',
        }),
        baseActor,
      )
      expect(discount.applyTemplate).toHaveBeenCalled()
      expect(res.subscription?.discountApplied).toBe(false)
      expect(res.subscription?.discountStatus).toBe('pending_approval')
      expect(res.organizationId).toBe('new-org-id') // org activada igualmente
    })

    it('applyTemplate falla → activación sigue, sin descuento (logged warn)', async () => {
      const discount = {
        generate: jest.fn(),
        applyTemplate: jest.fn().mockRejectedValue(new Error('Template not found')),
      } as any
      const service = new WizardActivationService(
        makePrismaMock(),
        makeAuditMock(),
        makeEmailMock(),
        makeSubscriptionMock(),
        discount,
        makeBillingMock({ stripeConfigured: true }),
        makeChannexProvisionMock(),
      )
      const res = await service.activate(
        makeDto({
          planTier: 'PRO',
          discountTemplateId: 'tpl-missing',
        }),
        baseActor,
      )
      expect(res.organizationId).toBe('new-org-id') // org activada
      // discountApplied=false porque applyTemplate falló
      expect(res.subscription?.discountApplied).toBe(false)
      expect(res.subscription?.discountStatus).toBeNull()
    })

    it('sin templateId + sin discount → subscription sin descuento', async () => {
      const discount = makeDiscountMock()
      const service = new WizardActivationService(
        makePrismaMock(),
        makeAuditMock(),
        makeEmailMock(),
        makeSubscriptionMock(),
        discount,
        makeBillingMock({ stripeConfigured: true }),
        makeChannexProvisionMock(),
      )
      const res = await service.activate(makeDto({ planTier: 'PRO' }), baseActor)
      // Ni applyTemplate ni generate fueron llamados
      expect(discount.applyTemplate).not.toHaveBeenCalled()
      expect(discount.generate).not.toHaveBeenCalled()
      expect(res.subscription?.discountApplied).toBe(false)
      expect(res.subscription?.discountStatus).toBeNull()
    })
  })

  describe('passes pacOverrideAccepted flag through', () => {
    it('records the override flag in pacCredentials.overrideAccepted', async () => {
      const prisma = makePrismaMock()
      const service = new WizardActivationService(prisma, makeAuditMock(), makeEmailMock(), makeSubscriptionMock(), makeDiscountMock(), makeBillingMock(), makeChannexProvisionMock())
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
