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
    // Netflix-style trial mocks
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          id: 'cs_test_checkout_setup',
          url: 'https://checkout.stripe.com/c/pay/cs_test_checkout_setup',
          customer: 'cus_test_123',
          mode: 'setup',
          setup_intent: 'seti_test_pending',
          status: 'open',
          metadata: {},
        }),
      },
    },
    setupIntents: {
      retrieve: jest.fn().mockResolvedValue({
        id: 'seti_test_succeeded',
        customer: 'cus_test_123',
        payment_method: 'pm_card_visa',
        status: 'succeeded',
        metadata: { zenix_kind: 'NETFLIX_TRIAL_CARD_CAPTURE' },
      }),
    },
  }
  // customers.update used by activateAfterSetupIntent
  ;(stripe.customers as any).update = jest.fn().mockResolvedValue({ id: 'cus_test_123' })
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

  // ─── Netflix-style trial flow (Day 1) ──────────────────────────────────
  describe('createPendingSubscription (Netflix trial)', () => {
    it('crea Customer + persiste local Sub status=pending_payment_method', async () => {
      const prisma = makePrismaMock()
      // upsert devuelve la row tal cual la persistimos
      prisma.subscription.upsert = jest.fn().mockImplementation(async (args: any) => ({
        id: 'sub-local-pending',
        ...args.create,
      }))
      const stripe = makeStripeMock()
      const service = makeService({ prisma, stripe })
      const sub = await service.createPendingSubscription(
        { ...createDtoBase, trialDays: 14, stripeCouponId: 'coup_welcome10' },
        baseActor,
      )
      expect(stripe.customers.create).toHaveBeenCalled()
      expect(prisma.subscription.upsert).toHaveBeenCalled()
      expect(sub.status).toBe('pending_payment_method')
      expect(sub.pendingCouponId).toBe('coup_welcome10')
      expect(sub.pendingTrialDays).toBe(14)
      // stripeSubscriptionId tiene prefix 'pending_'
      expect(String(sub.stripeSubscriptionId)).toMatch(/^pending_/)
    })

    it('Stripe no configurado → throws', async () => {
      const billing = makeBillingMock({ stripeConfigured: false })
      const service = makeService({ billing })
      await expect(
        service.createPendingSubscription(createDtoBase, baseActor),
      ).rejects.toThrow()
    })

    it('Organization no existe → 404', async () => {
      const prisma = makePrismaMock({ orgExists: false })
      const service = makeService({ prisma })
      await expect(
        service.createPendingSubscription(createDtoBase, baseActor),
      ).rejects.toThrow(NotFoundException)
    })

    it('Sub activa duplicada → 409', async () => {
      const prisma = makePrismaMock({ existingSub: { status: 'active', id: 'sub-already' } })
      const service = makeService({ prisma })
      await expect(
        service.createPendingSubscription(createDtoBase, baseActor),
      ).rejects.toThrow(ConflictException)
    })
  })

  describe('createSetupCheckoutSession (Netflix trial)', () => {
    it('Netflix path: pendingTrialDays > 0 → mode=setup ($0 SetupIntent)', async () => {
      const prisma = makePrismaMock({
        existingSub: {
          id: 'sub-pending-1',
          organizationId: 'org-1',
          stripeCustomerId: 'cus_test_123',
          status: 'pending_payment_method',
          pendingTrialDays: 14, // Netflix path
        },
      })
      const stripe = makeStripeMock()
      const service = makeService({ prisma, stripe })
      const result = await service.createSetupCheckoutSession(
        {
          organizationId: 'org-1',
          successUrl: 'https://app.zenix.com/onboarding/card?payment=success',
          cancelUrl: 'https://app.zenix.com/onboarding/card?payment=cancel',
        },
        baseActor,
      )
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'setup',
          customer: 'cus_test_123',
          payment_method_types: ['card'],
        }),
        expect.objectContaining({ idempotencyKey: expect.stringContaining('setup_checkout_') }),
      )
      expect(result.url).toContain('checkout.stripe.com')
      expect(result.customerId).toBe('cus_test_123')
      expect((result as any).mode).toBe('setup')
    })

    // ── BILLING-DAY1 (Sprint 2026-05-29) ───────────────────────────────
    it('Day-1 path: pendingTrialDays === 0 → mode=subscription con line_items + cobro inmediato', async () => {
      const prisma = makePrismaMock({
        existingSub: {
          id: 'sub-day1-1',
          organizationId: 'org-1',
          stripeCustomerId: 'cus_day1_999',
          status: 'pending_payment_method',
          pendingTrialDays: 0, // Day-1 default
          planTier: 'PRO',
          currency: 'MXN' as const,
          propertyCount: 2,
          pendingCouponId: null,
        },
      })
      const stripe = makeStripeMock()
      const service = makeService({ prisma, stripe })
      const result = await service.createSetupCheckoutSession(
        {
          organizationId: 'org-1',
          successUrl: 'https://app.zenix.com/onboarding/card?payment=success',
          cancelUrl: 'https://app.zenix.com/onboarding/card?payment=cancel',
        },
        baseActor,
      )
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          customer: 'cus_day1_999',
          line_items: [
            expect.objectContaining({ quantity: 2 }),
          ],
          subscription_data: expect.objectContaining({
            metadata: expect.objectContaining({ zenix_kind: 'DAY1_IMMEDIATE_CHARGE' }),
          }),
        }),
        expect.objectContaining({ idempotencyKey: expect.stringContaining('day1_checkout_') }),
      )
      expect((result as any).mode).toBe('subscription')
    })

    it('Day-1 con pendingCouponId → Checkout incluye discounts', async () => {
      const prisma = makePrismaMock({
        existingSub: {
          id: 'sub-day1-coupon',
          organizationId: 'org-1',
          stripeCustomerId: 'cus_day1_777',
          status: 'pending_payment_method',
          pendingTrialDays: 0,
          planTier: 'PRO',
          currency: 'USD' as const,
          propertyCount: 1,
          pendingCouponId: 'coupon_welcome10',
        },
      })
      const stripe = makeStripeMock()
      const service = makeService({ prisma, stripe })
      await service.createSetupCheckoutSession(
        {
          organizationId: 'org-1',
          successUrl: 'https://x',
          cancelUrl: 'https://y',
        },
        baseActor,
      )
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          discounts: [{ coupon: 'coupon_welcome10' }],
        }),
        expect.anything(),
      )
    })

    it('Sub status != pending_payment_method → 409', async () => {
      const prisma = makePrismaMock({
        existingSub: { id: 'sub-active', status: 'trialing', stripeCustomerId: 'cus_x' },
      })
      const service = makeService({ prisma })
      await expect(
        service.createSetupCheckoutSession(
          {
            organizationId: 'org-1',
            successUrl: 'https://x',
            cancelUrl: 'https://y',
          },
          baseActor,
        ),
      ).rejects.toThrow(ConflictException)
    })

    it('Sub no existe → 404', async () => {
      const prisma = makePrismaMock() // existingSub default null
      const service = makeService({ prisma })
      await expect(
        service.createSetupCheckoutSession(
          {
            organizationId: 'org-1',
            successUrl: 'https://x',
            cancelUrl: 'https://y',
          },
          baseActor,
        ),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('activateAfterSetupIntent (Netflix trial)', () => {
    function makePendingSubMock(overrides: any = {}) {
      const baseSub = {
        id: 'sub-local-pending',
        organizationId: 'org-1',
        stripeCustomerId: 'cus_test_123',
        stripeSubscriptionId: 'pending_uuid-x',
        status: 'pending_payment_method',
        planTier: 'PRO',
        billingCycle: 'monthly',
        currency: 'MXN' as const,
        propertyCount: 1,
        pendingCouponId: null,
        pendingTrialDays: 14,
        ...overrides,
      }
      return {
        organization: {
          findUnique: jest.fn().mockResolvedValue({ id: 'org-1', name: 'Test' }),
        },
        subscription: {
          findFirst: jest.fn().mockResolvedValue(baseSub),
          findUnique: jest.fn().mockResolvedValue(baseSub),
          update: jest.fn().mockImplementation(async (args: any) => ({ ...baseSub, ...args.data })),
        },
      } as any
    }

    it('happy path — crea Stripe Sub real con default_payment_method + trial', async () => {
      const prisma = makePendingSubMock()
      const stripe = makeStripeMock()
      const service = makeService({ prisma, stripe })
      const result = await service.activateAfterSetupIntent('seti_test_succeeded')
      expect(result.activated).toBe(true)
      expect(stripe.customers.update).toHaveBeenCalledWith('cus_test_123', {
        invoice_settings: { default_payment_method: 'pm_card_visa' },
      })
      expect(stripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_test_123',
          default_payment_method: 'pm_card_visa',
          trial_period_days: 14,
        }),
        expect.objectContaining({
          idempotencyKey: expect.stringContaining('create_sub_after_setup_'),
        }),
      )
      expect(prisma.subscription.update).toHaveBeenCalled()
    })

    it('setup_intent NOT succeeded → activated=false (no Stripe call)', async () => {
      const prisma = makePendingSubMock()
      const stripe = makeStripeMock()
      stripe.setupIntents.retrieve = jest.fn().mockResolvedValue({
        id: 'seti_pending',
        customer: 'cus_x',
        payment_method: null,
        status: 'requires_action',
        metadata: {},
      })
      const service = makeService({ prisma, stripe })
      const result = await service.activateAfterSetupIntent('seti_pending')
      expect(result.activated).toBe(false)
      expect((result as any).reason).toBe('setup_intent_not_succeeded')
      expect(stripe.subscriptions.create).not.toHaveBeenCalled()
    })

    it('no pending sub para customer → activated=false (idempotent retry safety)', async () => {
      const prisma = makePendingSubMock()
      prisma.subscription.findFirst = jest.fn().mockResolvedValue(null)
      const stripe = makeStripeMock()
      const service = makeService({ prisma, stripe })
      const result = await service.activateAfterSetupIntent('seti_test_succeeded')
      expect(result.activated).toBe(false)
      expect((result as any).reason).toBe('no_pending_subscription')
      expect(stripe.subscriptions.create).not.toHaveBeenCalled()
    })

    it('attacha pendingCouponId al crear Stripe Sub si existe', async () => {
      const prisma = makePendingSubMock({ pendingCouponId: 'coup_welcome10' })
      const stripe = makeStripeMock()
      const service = makeService({ prisma, stripe })
      await service.activateAfterSetupIntent('seti_test_succeeded')
      expect(stripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          discounts: [{ coupon: 'coup_welcome10' }],
        }),
        expect.anything(),
      )
    })
  })
})
