/**
 * Billing Controllers RBAC — verifica que los decoradores @NovaTiers y
 * @RequireActingOrg estén bien aplicados a cada endpoint Day 5.
 *
 * No bootea NestJS — usa Reflector para leer metadata directo de los
 * handlers. Esto es la garantía estructural de RBAC.
 */
import 'reflect-metadata'
import { BillingController } from './billing.controller'
import { NovaBillingController } from './nova-billing.controller'
import { PricingAdminController } from './pricing-admin.controller'
import { NOVA_TIERS_KEY } from '../nova/guards/nova-tiers.guard'

const ACTING_ORG_KEY = 'nova:requireActingOrg'

function getTiers(target: any, method?: string): string[] | undefined {
  if (method) {
    return Reflect.getMetadata(NOVA_TIERS_KEY, target.prototype[method])
  }
  return Reflect.getMetadata(NOVA_TIERS_KEY, target)
}

function getRequireActingOrg(target: any, method: string): boolean | undefined {
  return Reflect.getMetadata(ACTING_ORG_KEY, target.prototype[method])
}

describe('Billing controllers RBAC matrix', () => {
  describe('BillingController (cliente ORG_OWNER)', () => {
    it('controller-level NovaTiers = [ORG_OWNER] (cliente solo)', () => {
      const tiers = getTiers(BillingController)
      expect(tiers).toEqual(['ORG_OWNER'])
    })

    it('NO requiere X-Acting-Organization-Id (org viene del JWT)', () => {
      expect(getRequireActingOrg(BillingController, 'getMine')).toBeUndefined()
      expect(getRequireActingOrg(BillingController, 'createPortal')).toBeUndefined()
      expect(getRequireActingOrg(BillingController, 'cancel')).toBeUndefined()
    })
  })

  describe('NovaBillingController (consultor + admin)', () => {
    it('controller-level NovaTiers = [PLATFORM, PARTNER_ADMIN, PARTNER_MEMBER]', () => {
      const tiers = getTiers(NovaBillingController)
      expect(tiers).toEqual(['PLATFORM', 'PARTNER_ADMIN', 'PARTNER_MEMBER'])
      // Cliente ORG_OWNER explícitamente FUERA
      expect(tiers).not.toContain('ORG_OWNER')
      expect(tiers).not.toContain('ORG_STAFF')
    })

    it('subscription endpoints requieren X-Acting-Organization-Id', () => {
      expect(getRequireActingOrg(NovaBillingController, 'create')).toBe(true)
      expect(getRequireActingOrg(NovaBillingController, 'getById')).toBe(true)
      expect(getRequireActingOrg(NovaBillingController, 'changePlan')).toBe(true)
      expect(getRequireActingOrg(NovaBillingController, 'pause')).toBe(true)
      expect(getRequireActingOrg(NovaBillingController, 'resume')).toBe(true)
      expect(getRequireActingOrg(NovaBillingController, 'cancel')).toBe(true)
      expect(getRequireActingOrg(NovaBillingController, 'generateDiscount')).toBe(true)
    })

    it('discount approval + listing endpoints son cross-org (sin acting-org)', () => {
      // Un PARTNER_ADMIN debe poder listar pending approvals de TODOS sus clientes
      // sin tener que declarar org específico en cada listing.
      expect(getRequireActingOrg(NovaBillingController, 'approveDiscount')).toBeUndefined()
      expect(getRequireActingOrg(NovaBillingController, 'rejectDiscount')).toBeUndefined()
      expect(getRequireActingOrg(NovaBillingController, 'listPendingApprovals')).toBeUndefined()
    })

    it('templates son consultor-scoped (sin acting-org)', () => {
      expect(getRequireActingOrg(NovaBillingController, 'listTemplates')).toBeUndefined()
      expect(getRequireActingOrg(NovaBillingController, 'saveTemplate')).toBeUndefined()
      expect(getRequireActingOrg(NovaBillingController, 'deleteTemplate')).toBeUndefined()
    })
  })

  describe('PricingAdminController (PLATFORM only)', () => {
    it('controller-level NovaTiers = [PLATFORM] solo', () => {
      const tiers = getTiers(PricingAdminController)
      expect(tiers).toEqual(['PLATFORM'])
      // Nadie más
      expect(tiers).not.toContain('PARTNER_ADMIN')
      expect(tiers).not.toContain('PARTNER_MEMBER')
      expect(tiers).not.toContain('ORG_OWNER')
    })

    it('NO requiere acting-org (PLATFORM opera global, sin org context)', () => {
      expect(getRequireActingOrg(PricingAdminController, 'listPricing')).toBeUndefined()
      expect(getRequireActingOrg(PricingAdminController, 'updatePricing')).toBeUndefined()
      expect(getRequireActingOrg(PricingAdminController, 'listCaps')).toBeUndefined()
      expect(getRequireActingOrg(PricingAdminController, 'updateCap')).toBeUndefined()
    })
  })
})
