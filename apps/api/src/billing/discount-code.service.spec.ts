/**
 * DiscountCodeService — unit tests Day 4.
 *
 * Cobertura por método + cap matrix per partner tier + approval workflow.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { DiscountCodeService } from './discount-code.service'
import type { JwtPayload } from '@zenix/shared'

const baseActor = (overrides: Partial<any> = {}): JwtPayload =>
  ({
    sub: 'consultor-1',
    role: 'PARTNER_MEMBER',
    actorTier: 'PARTNER_MEMBER',
    organizationId: '',
    propertyId: '',
    email: 'consultor@partner.com',
    iat: 0,
    exp: 0,
    ...overrides,
  }) as unknown as JwtPayload

function makeStripeMock(opts: { couponThrows?: any; promoThrows?: any; updateSubThrows?: any } = {}) {
  return {
    coupons: {
      create: jest.fn().mockImplementation(async () => {
        if (opts.couponThrows) throw opts.couponThrows
        return {
          id: 'coupon_test_1',
          percent_off: 25,
          duration: 'repeating',
          duration_in_months: 3,
          metadata: {},
        }
      }),
    },
    promotionCodes: {
      create: jest.fn().mockImplementation(async () => {
        if (opts.promoThrows) throw opts.promoThrows
        return {
          id: 'promo_test_1',
          code: 'ZAHAR-TEST-2026',
          coupon: { id: 'coupon_test_1' },
          customer: 'cus_x',
          active: true,
          metadata: {},
        }
      }),
    },
    subscriptions: {
      update: jest.fn().mockImplementation(async () => {
        if (opts.updateSubThrows) throw opts.updateSubThrows
        return { id: 'sub_x' }
      }),
    },
  } as any
}

function makeBillingMock(stripe: any) {
  return {
    isStripeConfigured: () => true,
    getStripeClient: () => stripe,
  } as any
}

function makeAuditMock() {
  return { write: jest.fn().mockResolvedValue({ id: 'audit-1' }) } as any
}

function makePrismaMock(opts: {
  subscription?: any
  partnerTier?: string | null
  partnerMember?: any
  cap?: any
  approval?: any
} = {}) {
  const baseDiscount = {
    id: 'disc-1',
    subscriptionId: 'sub-1',
    stripeCouponId: 'coupon_test_1',
    stripePromotionCodeId: 'promo_test_1',
    promotionCode: 'ZAHAR-TEST-2026',
    percentOff: 25,
    duration: 'repeating',
    durationInMonths: 3,
    generatedById: 'consultor-1',
    generatedByRole: 'PARTNER_MEMBER',
    reason: 'Test discount con razón suficientemente larga',
    approvedById: 'consultor-1',
    approvedAt: new Date(),
    appliedAt: new Date(),
    expiresAt: new Date(Date.now() + 90 * 86400 * 1000),
  }

  return {
    subscription: {
      findUnique: jest.fn().mockResolvedValue(
        opts.subscription === null
          ? null
          : opts.subscription ?? {
              id: 'sub-1',
              organizationId: 'org-1',
              status: 'active',
              stripeSubscriptionId: 'sub_stripe_x',
              stripeCustomerId: 'cus_x',
            },
      ),
    },
    partnerMember: {
      findUnique: jest.fn().mockResolvedValue(
        opts.partnerMember === null
          ? null
          : opts.partnerMember ?? {
              userId: 'consultor-1',
              partnerId: 'partner-1',
              partner: { tier: opts.partnerTier ?? 'SILVER' },
            },
      ),
    },
    billingPartnerTierCap: {
      findUnique: jest.fn().mockResolvedValue(
        opts.cap === null
          ? null
          : opts.cap ?? {
              tier: 'SILVER',
              maxDiscountPct: 25,
              maxDurationMonths: 6,
              requiresApproval: false,
            },
      ),
    },
    discountApprovalRequest: {
      create: jest.fn().mockResolvedValue({
        id: 'req-1',
        status: 'PENDING',
        organizationId: 'org-1',
        subscriptionId: 'sub-1',
        requestedById: 'consultor-1',
        percentOff: 40,
        duration: 'repeating',
        durationInMonths: 12,
        reason: 'Test reason',
        expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
      }),
      findUnique: jest.fn().mockResolvedValue(
        opts.approval === null
          ? null
          : opts.approval ?? {
              id: 'req-1',
              status: 'PENDING',
              organizationId: 'org-1',
              subscriptionId: 'sub-1',
              requestedById: 'consultor-1',
              percentOff: 30,
              duration: 'repeating',
              durationInMonths: 6,
              reason: 'Original request',
              expiresAt: new Date(Date.now() + 5 * 86400 * 1000),
            },
      ),
      update: jest.fn().mockImplementation(async (args) => ({
        id: 'req-1',
        ...args.data,
      })),
      findMany: jest.fn().mockResolvedValue([]),
    },
    subscriptionDiscount: {
      create: jest.fn().mockResolvedValue(baseDiscount),
    },
    consultorDiscountTemplate: {
      create: jest.fn().mockResolvedValue({ id: 'tpl-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
    },
  } as any
}

function makeService(opts: {
  prisma?: any
  stripe?: any
  audit?: any
} = {}) {
  const stripe = opts.stripe ?? makeStripeMock()
  const billing = makeBillingMock(stripe)
  return new DiscountCodeService(
    opts.prisma ?? makePrismaMock(),
    billing,
    opts.audit ?? makeAuditMock(),
  )
}

const dtoBase = {
  subscriptionId: 'sub-1',
  percentOff: 25,
  duration: 'repeating' as const,
  durationInMonths: 3,
  reason: 'Cliente regateó por features Cloudbeds — cierre rápido Q4',
}

describe('DiscountCodeService', () => {
  // ─── generate — happy path within cap ─────────────────────
  describe('generate within cap', () => {
    it('SILVER consultor con 25% off 3 meses → applied (igual al cap)', async () => {
      const stripe = makeStripeMock()
      const audit = makeAuditMock()
      const service = makeService({ stripe, audit })
      const res = await service.generate(dtoBase, baseActor())
      expect(res.kind).toBe('applied')
      expect(stripe.coupons.create).toHaveBeenCalledWith(
        expect.objectContaining({
          percent_off: 25,
          duration: 'repeating',
          duration_in_months: 3,
        }),
        expect.objectContaining({ idempotencyKey: expect.stringContaining('create_coupon_') }),
      )
      expect(stripe.promotionCodes.create).toHaveBeenCalledWith(
        expect.objectContaining({ coupon: 'coupon_test_1' }),
        expect.any(Object),
      )
      // Issue C — discounts a nivel Subscription
      expect(stripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_stripe_x',
        expect.objectContaining({ discounts: [{ coupon: 'coupon_test_1' }] }),
        expect.any(Object),
      )
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DISCOUNT_APPLIED' }),
      )
    })

    it('GOLD consultor con 35% off 12 meses → applied (top of cap)', async () => {
      const stripe = makeStripeMock()
      const prisma = makePrismaMock({
        partnerTier: 'GOLD',
        cap: { tier: 'GOLD', maxDiscountPct: 35, maxDurationMonths: 12 },
      })
      const service = makeService({ prisma, stripe })
      const res = await service.generate(
        { ...dtoBase, percentOff: 35, durationInMonths: 12 },
        baseActor(),
      )
      expect(res.kind).toBe('applied')
    })

    it('PLATFORM_ADMIN sin cap → 50% forever permitido', async () => {
      const stripe = makeStripeMock()
      const service = makeService({ stripe })
      const res = await service.generate(
        { ...dtoBase, percentOff: 50, duration: 'forever', durationInMonths: undefined },
        baseActor({ actorTier: 'PLATFORM' }),
      )
      expect(res.kind).toBe('applied')
    })
  })

  // ─── generate — exceeds cap → approval request ──────────
  describe('generate exceeds cap → approval', () => {
    it('SILVER consultor con 40% off (excede 25% cap) → pending_approval', async () => {
      const prisma = makePrismaMock()
      const audit = makeAuditMock()
      const service = makeService({ prisma, audit })
      const res = await service.generate(
        { ...dtoBase, percentOff: 40 },
        baseActor(),
      )
      expect(res.kind).toBe('pending_approval')
      expect(prisma.discountApprovalRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            percentOff: 40,
            status: 'PENDING',
          }),
        }),
      )
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DISCOUNT_APPROVAL_REQUESTED' }),
      )
    })

    it('AUTHORIZED consultor con 20% off (excede 15% cap) → pending_approval', async () => {
      const prisma = makePrismaMock({
        partnerTier: 'AUTHORIZED',
        cap: { tier: 'AUTHORIZED', maxDiscountPct: 15, maxDurationMonths: 3 },
      })
      const service = makeService({ prisma })
      const res = await service.generate({ ...dtoBase, percentOff: 20 }, baseActor())
      expect(res.kind).toBe('pending_approval')
    })

    it('SILVER pidiendo "forever" (cap permite max 6m) → pending_approval', async () => {
      const prisma = makePrismaMock()
      const service = makeService({ prisma })
      const res = await service.generate(
        { ...dtoBase, percentOff: 20, duration: 'forever', durationInMonths: undefined },
        baseActor(),
      )
      expect(res.kind).toBe('pending_approval')
    })

    it('PLATINUM pidiendo "forever" → applied (su cap permite forever)', async () => {
      const stripe = makeStripeMock()
      const prisma = makePrismaMock({
        partnerTier: 'PLATINUM',
        cap: { tier: 'PLATINUM', maxDiscountPct: 50, maxDurationMonths: null },
      })
      const service = makeService({ prisma, stripe })
      const res = await service.generate(
        { ...dtoBase, percentOff: 50, duration: 'forever', durationInMonths: undefined },
        baseActor(),
      )
      expect(res.kind).toBe('applied')
    })

    it('autoRequestApprovalIfExceedsCap=false → throws ForbiddenException', async () => {
      const service = makeService()
      await expect(
        service.generate(
          { ...dtoBase, percentOff: 40, autoRequestApprovalIfExceedsCap: false },
          baseActor(),
        ),
      ).rejects.toThrow(ForbiddenException)
    })
  })

  // ─── input validation ──────────────────────────────────
  describe('input validation', () => {
    it("duration='repeating' sin durationInMonths → 400", async () => {
      const service = makeService()
      await expect(
        service.generate(
          { ...dtoBase, duration: 'repeating', durationInMonths: undefined },
          baseActor(),
        ),
      ).rejects.toThrow(BadRequestException)
    })

    it("duration='once' con durationInMonths → 400", async () => {
      const service = makeService()
      await expect(
        service.generate(
          { ...dtoBase, duration: 'once', durationInMonths: 3 },
          baseActor(),
        ),
      ).rejects.toThrow(BadRequestException)
    })

    it('Subscription no existe → 404', async () => {
      const service = makeService({ prisma: makePrismaMock({ subscription: null }) })
      await expect(service.generate(dtoBase, baseActor())).rejects.toThrow(NotFoundException)
    })

    it('Subscription canceled → 409', async () => {
      const service = makeService({
        prisma: makePrismaMock({
          subscription: {
            id: 'sub-1',
            organizationId: 'org-1',
            status: 'canceled',
            stripeSubscriptionId: 'x',
            stripeCustomerId: 'cus_x',
          },
        }),
      })
      await expect(service.generate(dtoBase, baseActor())).rejects.toThrow(ConflictException)
    })

    it('Actor sin PartnerMember → 403', async () => {
      const service = makeService({ prisma: makePrismaMock({ partnerMember: null }) })
      await expect(service.generate(dtoBase, baseActor())).rejects.toThrow(ForbiddenException)
    })

    it('Actor ORG_OWNER → 403', async () => {
      const service = makeService()
      await expect(
        service.generate(dtoBase, baseActor({ actorTier: 'ORG_OWNER' })),
      ).rejects.toThrow(ForbiddenException)
    })
  })

  // ─── approveRequest ────────────────────────────────────
  describe('approveRequest', () => {
    it('PARTNER_MEMBER no puede aprobar → 403', async () => {
      const service = makeService()
      await expect(
        service.approveRequest('req-1', baseActor({ actorTier: 'PARTNER_MEMBER' })),
      ).rejects.toThrow(ForbiddenException)
    })

    it('PARTNER_ADMIN aprueba → crea SubscriptionDiscount + actualiza request', async () => {
      const stripe = makeStripeMock()
      const prisma = makePrismaMock()
      const service = makeService({ prisma, stripe })
      const res = await service.approveRequest(
        'req-1',
        baseActor({ sub: 'admin-1', actorTier: 'PARTNER_ADMIN', role: 'PARTNER_ADMIN' }),
      )
      expect(res.request.status).toBe('APPROVED')
      expect(prisma.subscriptionDiscount.create).toHaveBeenCalled()
    })

    it('PLATFORM_ADMIN aprueba → OK', async () => {
      const stripe = makeStripeMock()
      const service = makeService({ stripe })
      const res = await service.approveRequest(
        'req-1',
        baseActor({ sub: 'plat-1', actorTier: 'PLATFORM', role: 'PLATFORM_ADMIN' }),
      )
      expect(res.request.status).toBe('APPROVED')
    })

    it('Request ya APPROVED → 409', async () => {
      const prisma = makePrismaMock({
        approval: {
          id: 'req-1',
          status: 'APPROVED',
          organizationId: 'org-1',
          subscriptionId: 'sub-1',
          requestedById: 'consultor-1',
          percentOff: 30,
          duration: 'repeating',
          durationInMonths: 6,
          reason: 'old',
          expiresAt: new Date(Date.now() + 5 * 86400 * 1000),
        },
      })
      const service = makeService({ prisma })
      await expect(
        service.approveRequest(
          'req-1',
          baseActor({ actorTier: 'PARTNER_ADMIN', role: 'PARTNER_ADMIN' }),
        ),
      ).rejects.toThrow(ConflictException)
    })

    it('Request expirada → marca EXPIRED + 409', async () => {
      const prisma = makePrismaMock({
        approval: {
          id: 'req-1',
          status: 'PENDING',
          organizationId: 'org-1',
          subscriptionId: 'sub-1',
          requestedById: 'consultor-1',
          percentOff: 30,
          duration: 'repeating',
          durationInMonths: 6,
          reason: 'old',
          expiresAt: new Date(Date.now() - 86400 * 1000), // ya expiró
        },
      })
      const service = makeService({ prisma })
      await expect(
        service.approveRequest(
          'req-1',
          baseActor({ actorTier: 'PARTNER_ADMIN', role: 'PARTNER_ADMIN' }),
        ),
      ).rejects.toThrow(ConflictException)
      expect(prisma.discountApprovalRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'EXPIRED' }) }),
      )
    })
  })

  // ─── rejectRequest ────────────────────────────────────
  describe('rejectRequest', () => {
    it('PARTNER_MEMBER no puede rechazar → 403', async () => {
      const service = makeService()
      await expect(
        service.rejectRequest('req-1', { rejectionReason: 'Not appropriate' }, baseActor()),
      ).rejects.toThrow(ForbiddenException)
    })

    it('PARTNER_ADMIN rechaza con razón → status REJECTED', async () => {
      const prisma = makePrismaMock()
      const audit = makeAuditMock()
      const service = makeService({ prisma, audit })
      const res = await service.rejectRequest(
        'req-1',
        { rejectionReason: 'Demasiado agresivo para este tier de cliente' },
        baseActor({ sub: 'admin-1', actorTier: 'PARTNER_ADMIN', role: 'PARTNER_ADMIN' }),
      )
      expect(res.status).toBe('REJECTED')
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DISCOUNT_APPROVAL_REJECTED' }),
      )
    })
  })

  // ─── listPendingApprovals ──────────────────────────────
  describe('listPendingApprovals', () => {
    it('PARTNER_MEMBER no puede listar → 403', async () => {
      const service = makeService()
      await expect(service.listPendingApprovals(baseActor())).rejects.toThrow(ForbiddenException)
    })

    it('PLATFORM_ADMIN ve TODAS las pending', async () => {
      const prisma = makePrismaMock()
      const service = makeService({ prisma })
      await service.listPendingApprovals(
        baseActor({ actorTier: 'PLATFORM', role: 'PLATFORM_ADMIN' }),
      )
      expect(prisma.discountApprovalRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'PENDING' },
        }),
      )
    })

    it('PARTNER_ADMIN filtra por assignedOrgIds', async () => {
      const prisma = makePrismaMock()
      const service = makeService({ prisma })
      await service.listPendingApprovals(
        baseActor({
          actorTier: 'PARTNER_ADMIN',
          role: 'PARTNER_ADMIN',
          assignedOrgIds: ['org-1', 'org-2'],
        }),
      )
      expect(prisma.discountApprovalRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING',
            organizationId: { in: ['org-1', 'org-2'] },
          }),
        }),
      )
    })

    it('PARTNER_ADMIN sin assignedOrgIds → []', async () => {
      const service = makeService()
      const res = await service.listPendingApprovals(
        baseActor({
          actorTier: 'PARTNER_ADMIN',
          role: 'PARTNER_ADMIN',
          assignedOrgIds: [],
        }),
      )
      expect(res).toEqual([])
    })
  })

  // ─── consultor templates ──────────────────────────────
  describe('consultor templates', () => {
    it('saveTemplate persists con consultor.sub', async () => {
      const prisma = makePrismaMock()
      const service = makeService({ prisma })
      await service.saveTemplate(
        { name: 'Mi código rápido', percentOff: 20, duration: 'once' },
        baseActor(),
      )
      expect(prisma.consultorDiscountTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ consultorId: 'consultor-1', name: 'Mi código rápido' }),
        }),
      )
    })

    it('listTemplates filtra por consultor.sub', async () => {
      const prisma = makePrismaMock()
      const service = makeService({ prisma })
      await service.listTemplates(baseActor())
      expect(prisma.consultorDiscountTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { consultorId: 'consultor-1' },
        }),
      )
    })

    // ── applyTemplate — Sprint BILLING-DISCOUNT-CODES Day 1 ──
    it('applyTemplate del propio consultor + dentro de cap → applied', async () => {
      const prisma = makePrismaMock({ partnerMember: { partner: { tier: 'SILVER' } }, cap: { maxDiscountPct: 25, maxDurationMonths: 6 } })
      prisma.consultorDiscountTemplate.findUnique = jest.fn().mockResolvedValue({
        id: 'tpl-1',
        consultorId: 'consultor-1',
        name: 'Mi código piloto',
        percentOff: 15,
        duration: 'repeating',
        durationInMonths: 3,
      })
      const service = makeService({ prisma })
      const res = await service.applyTemplate('tpl-1', 'sub-1', baseActor())
      expect(res.kind).toBe('applied')
      expect((res as any).templateName).toBe('Mi código piloto')
    })

    it('applyTemplate de OTRO consultor → 403', async () => {
      const prisma = makePrismaMock()
      prisma.consultorDiscountTemplate.findUnique = jest.fn().mockResolvedValue({
        id: 'tpl-1',
        consultorId: 'OTRO-CONSULTOR',
        name: 'Código ajeno',
        percentOff: 15,
        duration: 'repeating',
        durationInMonths: 3,
      })
      const service = makeService({ prisma })
      await expect(
        service.applyTemplate('tpl-1', 'sub-1', baseActor()),
      ).rejects.toThrow(ForbiddenException)
    })

    it('applyTemplate template not found → 404', async () => {
      const prisma = makePrismaMock()
      prisma.consultorDiscountTemplate.findUnique = jest.fn().mockResolvedValue(null)
      const service = makeService({ prisma })
      await expect(
        service.applyTemplate('tpl-missing', 'sub-1', baseActor()),
      ).rejects.toThrow(NotFoundException)
    })

    it('applyTemplate excede cap → pending_approval', async () => {
      const prisma = makePrismaMock({ partnerMember: { partner: { tier: 'SILVER' } }, cap: { maxDiscountPct: 25, maxDurationMonths: 6 } })
      prisma.consultorDiscountTemplate.findUnique = jest.fn().mockResolvedValue({
        id: 'tpl-big',
        consultorId: 'consultor-1',
        name: 'Big discount',
        percentOff: 40, // excede cap SILVER 25%
        duration: 'repeating',
        durationInMonths: 3,
      })
      const service = makeService({ prisma })
      const res = await service.applyTemplate('tpl-big', 'sub-1', baseActor())
      expect(res.kind).toBe('pending_approval')
      expect((res as any).templateName).toBe('Big discount')
    })

    it('deleteTemplate de otro consultor → 403', async () => {
      const prisma = makePrismaMock()
      prisma.consultorDiscountTemplate.findUnique = jest.fn().mockResolvedValue({
        id: 'tpl-1',
        consultorId: 'OTRO-CONSULTOR',
      })
      const service = makeService({ prisma })
      await expect(service.deleteTemplate('tpl-1', baseActor())).rejects.toThrow(ForbiddenException)
    })
  })
})
