/**
 * SubscriptionService — unit tests Day 3.
 *
 * Cobertura por método + casos de error críticos identificados en
 * stripe-best-practices.md §3.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { SubscriptionService } from './subscription.service'

const baseActor = {
  sub: 'consultor-abraham',
  role: 'PLATFORM_ADMIN',
  actorTier: 'PLATFORM',
  organizationId: '',
  propertyId: '',
  email: 'abraham@zenix.com',
  iat: 0,
  exp: 0,
} as any

function makeBillingMock(opts: { stripeConfigured?: boolean; pricingMissing?: boolean; priceIdMissing?: boolean } = {}) {
  return {
    isStripeConfigured: jest.fn().mockReturnValue(opts.stripeConfigured !== false),
    getStripeClient: jest.fn(),
    getPricingConfig: jest.fn().mockResolvedValue(
      opts.pricingMissing
        ? null
        : {
            id: 'pc-1',
            tier: 'PRO',
            monthlyAmountMxn: 2400,
            monthlyAmountUsd: 120,
            stripePriceIdMxn: opts.priceIdMissing ? null : 'price_mxn_pro_123',
            stripePriceIdUsd: opts.priceIdMissing ? null : 'price_usd_pro_123',
          },
    ),
    getPartnerTierCap: jest.fn().mockResolvedValue(null),
  } as any
}

function makeAuditMock() {
  return { write: jest.fn().mockResolvedValue({ id: 'audit-1' }) } as any
}

function makeStripeMock(opts: {
  customerCreateThrows?: any
  subscriptionCreateThrows?: any
  subscriptionUpdateThrows?: any
  subscriptionCancelThrows?: any
} = {}) {
  const stripe = {
    customers: {
      create: jest.fn().mockImplementation(async () => {
        if (opts.customerCreateThrows) throw opts.customerCreateThrows
        return { id: 'cus_test_123', email: 'owner@hotel.com', metadata: {} }
      }),
    },
    subscriptions: {
      create: jest.fn().mockImplementation(async () => {
        if (opts.subscriptionCreateThrows) throw opts.subscriptionCreateThrows
        return {
          id: 'sub_test_123',
          customer: 'cus_test_123',
          status: 'active',
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          cancel_at_period_end: false,
          canceled_at: null,
          trial_start: null,
          trial_end: null,
          pause_collection: null,
          metadata: {},
          items: { data: [{ id: 'si_test_1', price: { id: 'price_mxn_pro_123', unit_amount: 240000, currency: 'mxn' } }] },
        }
      }),
      update: jest.fn().mockImplementation(async () => {
        if (opts.subscriptionUpdateThrows) throw opts.subscriptionUpdateThrows
        return {
          id: 'sub_test_123',
          customer: 'cus_test_123',
          status: 'active',
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          cancel_at_period_end: true,
          canceled_at: null,
          trial_start: null,
          trial_end: null,
          pause_collection: null,
          metadata: {},
          items: { data: [{ id: 'si_test_1', price: { id: 'price_mxn_pro_123', unit_amount: 240000, currency: 'mxn' } }] },
        }
      }),
      cancel: jest.fn().mockImplementation(async () => {
        if (opts.subscriptionCancelThrows) throw opts.subscriptionCancelThrows
        return {
          id: 'sub_test_123',
          status: 'canceled',
          customer: 'cus_test_123',
          current_period_start: Math.floor(Date.now() / 1000) - 5 * 86400,
          current_period_end: Math.floor(Date.now() / 1000) + 25 * 86400,
          cancel_at_period_end: false,
          canceled_at: Math.floor(Date.now() / 1000),
          trial_start: null,
          trial_end: null,
          pause_collection: null,
          metadata: {},
          items: { data: [{ id: 'si_test_1', price: { id: 'price_mxn_pro_123', unit_amount: 240000, currency: 'mxn' } }] },
        }
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'sub_test_123',
        items: { data: [{ id: 'si_test_1', price: { id: 'price_mxn_pro_123' } }] },
      }),
    },
    billingPortal: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          id: 'bps_test_1',
          url: 'https://billing.stripe.com/p/session/test-portal',
          return_url: 'https://app.zenix.com/settings/billing',
          expires_at: Math.floor(Date.now() / 1000) + 300,
        }),
      },
    },
  }
  return stripe as any
}

function makePrismaMock(opts: { orgExists?: boolean; existingSub?: any | null } = {}) {
  const baseRow = {
    id: 'sub-local-1',
    organizationId: 'org-1',
    stripeCustomerId: 'cus_test_123',
    stripeSubscriptionId: 'sub_test_123',
    planTier: 'PRO',
    status: 'active',
    billingCycle: 'monthly',
    currency: 'MXN',
    propertyCount: 1,
    baseMonthlyAmount: 2400,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 86400 * 1000),
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    pausedAt: null,
    pausedUntil: null,
    trialStartedAt: null,
    trialEndsAt: null,
  }

  return {
    organization: {
      findUnique: jest.fn().mockResolvedValue(opts.orgExists === false ? null : { id: 'org-1', name: 'Test Hotel' }),
    },
    subscription: {
      findUnique: jest.fn().mockResolvedValue(opts.existingSub === undefined ? null : opts.existingSub),
      upsert: jest.fn().mockResolvedValue(baseRow),
      update: jest.fn().mockImplementation(async (args: any) => ({ ...baseRow, ...args.data })),
    },
  } as any
}

function makeService(opts: {
  prisma?: any
  billing?: any
  audit?: any
  stripe?: any
} = {}) {
  const billing = opts.billing ?? makeBillingMock()
  const stripe = opts.stripe ?? makeStripeMock()
  ;(billing as any).getStripeClient = () => stripe
  return new SubscriptionService(opts.prisma ?? makePrismaMock(), billing, opts.audit ?? makeAuditMock())
}

const createDtoBase = {
  organizationId: 'org-1',
  planTier: 'PRO' as const,
  propertyCount: 1,
  billingCycle: 'monthly' as const,
  currency: 'MXN' as const,
  ownerEmail: 'owner@hotel.com',
  ownerName: 'María Fernández',
}

describe('SubscriptionService', () => {
  // ─── createSubscription ──────────────────────────────────────────
  describe('createSubscription', () => {
    it('Stripe no configurado → throws', async () => {
      const service = makeService({ billing: makeBillingMock({ stripeConfigured: false }) })
      await expect(service.createSubscription(createDtoBase, baseActor)).rejects.toThrow()
    })

    it('Organization no existe → 404', async () => {
      const service = makeService({ prisma: makePrismaMock({ orgExists: false }) })
      await expect(service.createSubscription(createDtoBase, baseActor)).rejects.toThrow(NotFoundException)
    })

    it('Subscription activa duplicada → 409', async () => {
      const prisma = makePrismaMock({ existingSub: { id: 'sub-old', status: 'active' } })
      const service = makeService({ prisma })
      await expect(service.createSubscription(createDtoBase, baseActor)).rejects.toThrow(ConflictException)
    })

    it('Reactivar después de cancelled OK', async () => {
      const prisma = makePrismaMock({ existingSub: { id: 'sub-old', status: 'canceled' } })
      const service = makeService({ prisma })
      const res = await service.createSubscription(createDtoBase, baseActor)
      expect(res).toBeDefined()
    })

    it('Plan tier no existe → 404', async () => {
      const service = makeService({ billing: makeBillingMock({ pricingMissing: true }) })
      await expect(service.createSubscription(createDtoBase, baseActor)).rejects.toThrow(NotFoundException)
    })

    it('Stripe Price ID no configurado → 500', async () => {
      const service = makeService({ billing: makeBillingMock({ priceIdMissing: true }) })
      await expect(service.createSubscription(createDtoBase, baseActor)).rejects.toThrow()
    })

    it('happy path — crea Customer + Subscription + AuditLog', async () => {
      const stripe = makeStripeMock()
      const audit = makeAuditMock()
      const service = makeService({ stripe, audit })

      const res = await service.createSubscription(createDtoBase, baseActor)

      // Stripe Customer creation con idempotency key
      expect(stripe.customers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'owner@hotel.com',
          metadata: expect.objectContaining({ zenix_organization_id: 'org-1' }),
        }),
        expect.objectContaining({ idempotencyKey: 'create_customer_org-1' }),
      )

      // Stripe Subscription creation con idempotency key
      expect(stripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_test_123',
          items: [{ price: 'price_mxn_pro_123', quantity: 1 }],
          metadata: expect.objectContaining({ zenix_organization_id: 'org-1' }),
        }),
        expect.objectContaining({ idempotencyKey: 'create_sub_org-1' }),
      )

      // AuditLog write
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUBSCRIPTION_CREATED',
          status: 'SUCCESS',
          retentionPolicy: 'PERMANENT',
        }),
      )

      expect(res.organizationId).toBe('org-1')
    })

    it('Trial días aplicado correctamente', async () => {
      const stripe = makeStripeMock()
      const service = makeService({ stripe })
      await service.createSubscription({ ...createDtoBase, trialDays: 14 }, baseActor)

      expect(stripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({ trial_period_days: 14 }),
        expect.any(Object),
      )
    })

    it('Discount aplicado a nivel Subscription (Issue C — no Customer)', async () => {
      const stripe = makeStripeMock()
      const service = makeService({ stripe })
      await service.createSubscription({ ...createDtoBase, stripeCouponId: 'coupon_25_3mo' }, baseActor)

      // ✅ discounts a nivel subscription
      expect(stripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({ discounts: [{ coupon: 'coupon_25_3mo' }] }),
        expect.any(Object),
      )
      // ❌ NO en Customer
      expect(stripe.customers.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ coupon: expect.anything() }),
        expect.any(Object),
      )
    })

    it('Stripe error → rollback subscription local a incomplete_expired', async () => {
      const stripeError = { type: 'StripeCardError', message: 'Card declined' }
      const stripe = makeStripeMock({ subscriptionCreateThrows: stripeError })
      const prisma = makePrismaMock()
      const service = makeService({ prisma, stripe })
      await expect(service.createSubscription(createDtoBase, baseActor)).rejects.toThrow(BadRequestException)
      // Verify update llamado con incomplete_expired
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'incomplete_expired' }),
        }),
      )
    })
  })

  // ─── changePlan ────────────────────────────────────────────────
  describe('changePlan', () => {
    it('Subscription no existe → 404', async () => {
      const prisma = makePrismaMock()
      prisma.subscription.findUnique = jest.fn().mockResolvedValue(null)
      const service = makeService({ prisma })
      await expect(
        service.changePlan('sub-x', { newPlanTier: 'ENTERPRISE', newPropertyCount: 2 }, baseActor),
      ).rejects.toThrow(NotFoundException)
    })

    it('Subscription en status canceled no permite cambio → 409', async () => {
      const prisma = makePrismaMock({ existingSub: { id: 'sub-1', status: 'canceled', stripeSubscriptionId: 'sub_x', planTier: 'STARTER', propertyCount: 1, currency: 'MXN' } })
      const service = makeService({ prisma })
      await expect(
        service.changePlan('sub-1', { newPlanTier: 'PRO', newPropertyCount: 1 }, baseActor),
      ).rejects.toThrow(ConflictException)
    })

    it('Upgrade STARTER → PRO usa create_prorations (cliente paga diff)', async () => {
      const stripe = makeStripeMock()
      const prisma = makePrismaMock({
        existingSub: {
          id: 'sub-1',
          status: 'active',
          stripeSubscriptionId: 'sub_x',
          planTier: 'STARTER',
          propertyCount: 1,
          currency: 'MXN',
        },
      })
      const service = makeService({ prisma, stripe })
      await service.changePlan('sub-1', { newPlanTier: 'PRO', newPropertyCount: 1 }, baseActor)

      expect(stripe.subscriptions.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ proration_behavior: 'create_prorations' }),
        expect.any(Object),
      )
    })

    it('Downgrade PRO → STARTER usa "none" (efectivo siguiente ciclo)', async () => {
      const stripe = makeStripeMock()
      const prisma = makePrismaMock({
        existingSub: {
          id: 'sub-1',
          status: 'active',
          stripeSubscriptionId: 'sub_x',
          planTier: 'PRO',
          propertyCount: 1,
          currency: 'MXN',
        },
      })
      const service = makeService({ prisma, stripe })
      await service.changePlan('sub-1', { newPlanTier: 'STARTER', newPropertyCount: 1 }, baseActor)

      expect(stripe.subscriptions.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ proration_behavior: 'none' }),
        expect.any(Object),
      )
    })
  })

  // ─── pauseSubscription ──────────────────────────────────────────
  describe('pauseSubscription', () => {
    it('Subscription en active OK → pause con behavior void', async () => {
      const stripe = makeStripeMock()
      const prisma = makePrismaMock({
        existingSub: { id: 'sub-1', status: 'active', stripeSubscriptionId: 'sub_x', currency: 'MXN' },
      })
      const service = makeService({ prisma, stripe })

      await service.pauseSubscription('sub-1', { pauseMonths: 3 }, baseActor)

      // Verificar pause_collection.behavior='void' (§2.7)
      expect(stripe.subscriptions.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          pause_collection: expect.objectContaining({ behavior: 'void' }),
        }),
        expect.any(Object),
      )
    })

    it('Subscription paused no permite pause adicional → 409', async () => {
      const prisma = makePrismaMock({ existingSub: { id: 'sub-1', status: 'paused', stripeSubscriptionId: 'sub_x' } })
      const service = makeService({ prisma })
      await expect(service.pauseSubscription('sub-1', { pauseMonths: 2 }, baseActor)).rejects.toThrow(ConflictException)
    })
  })

  // ─── cancelSubscription ────────────────────────────────────────
  describe('cancelSubscription', () => {
    it('Subscription canceled → 409', async () => {
      const prisma = makePrismaMock({ existingSub: { id: 'sub-1', status: 'canceled', stripeSubscriptionId: 'sub_x' } })
      const service = makeService({ prisma })
      await expect(
        service.cancelSubscription('sub-1', { cancellationReason: 'PRICE_TOO_HIGH' }, baseActor),
      ).rejects.toThrow(ConflictException)
    })

    it('Graceful cancel (default) → cancel_at_period_end=true', async () => {
      const stripe = makeStripeMock()
      const prisma = makePrismaMock({
        existingSub: { id: 'sub-1', status: 'active', stripeSubscriptionId: 'sub_x', currency: 'MXN' },
      })
      const service = makeService({ prisma, stripe })

      await service.cancelSubscription('sub-1', { cancellationReason: 'PRICE_TOO_HIGH' }, baseActor)

      expect(stripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_x',
        expect.objectContaining({ cancel_at_period_end: true }),
        expect.any(Object),
      )
      expect(stripe.subscriptions.cancel).not.toHaveBeenCalled()
    })

    it('Immediate cancel solo PLATFORM_ADMIN', async () => {
      const stripe = makeStripeMock()
      const prisma = makePrismaMock({
        existingSub: { id: 'sub-1', status: 'active', stripeSubscriptionId: 'sub_x', currency: 'MXN' },
      })
      const orgOwnerActor = { ...baseActor, actorTier: 'ORG_OWNER' }
      const service = makeService({ prisma, stripe })

      await expect(
        service.cancelSubscription(
          'sub-1',
          { cancellationReason: 'OTHER', immediate: true },
          orgOwnerActor,
        ),
      ).rejects.toThrow(BadRequestException)
    })

    it('Immediate cancel con PLATFORM_ADMIN → stripe.subscriptions.cancel', async () => {
      const stripe = makeStripeMock()
      const prisma = makePrismaMock({
        existingSub: { id: 'sub-1', status: 'active', stripeSubscriptionId: 'sub_x', currency: 'MXN' },
      })
      const service = makeService({ prisma, stripe })

      await service.cancelSubscription('sub-1', { cancellationReason: 'OTHER', immediate: true }, baseActor)

      expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_x')
    })
  })

  // ─── createCustomerPortalSession ──────────────────────────────
  describe('createCustomerPortalSession', () => {
    it('Org sin subscription → 404', async () => {
      const service = makeService()
      await expect(service.createCustomerPortalSession('org-no-sub')).rejects.toThrow(NotFoundException)
    })

    it('Org con subscription → URL Stripe + expiresAt', async () => {
      const prisma = makePrismaMock({
        existingSub: { id: 'sub-1', stripeCustomerId: 'cus_test_123', stripeSubscriptionId: 'sub_x' },
      })
      const service = makeService({ prisma })
      const res = await service.createCustomerPortalSession('org-1')
      expect(res.url).toContain('billing.stripe.com')
      expect(res.expiresAt).toBeDefined()
    })
  })

  // ─── Error categorization (§2.9) ───────────────────────────────
  describe('error translation', () => {
    it('StripeCardError → BadRequestException', async () => {
      const stripe = makeStripeMock({
        subscriptionCreateThrows: { type: 'StripeCardError', message: 'Card declined' },
      })
      const service = makeService({ stripe })
      await expect(service.createSubscription(createDtoBase, baseActor)).rejects.toThrow(BadRequestException)
    })

    it('StripeAuthenticationError → 500 InternalServerError', async () => {
      const stripe = makeStripeMock({
        customerCreateThrows: { type: 'StripeAuthenticationError', message: 'Invalid API key' },
      })
      const service = makeService({ stripe })
      await expect(service.createSubscription(createDtoBase, baseActor)).rejects.toThrow()
    })
  })
})
