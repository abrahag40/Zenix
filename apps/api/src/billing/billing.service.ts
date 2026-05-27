/**
 * BillingService — wrapper de Stripe SDK + acceso a pricing config local.
 *
 * Sprint BILLING-CORE Day 1 — skeleton.
 *
 * Las operaciones de alto nivel (createSubscription, generateDiscount,
 * cancelSubscription, etc.) viven en services especializados que se
 * agregan en los siguientes días del sprint:
 *   - SubscriptionService (Day 3)
 *   - DiscountCodeService (Day 4)
 *   - RetentionSaveOfferService (Day 16)
 *   - DunningEscalationScheduler (Day 20)
 *
 * Esta clase expone:
 *   - cliente Stripe configurado (singleton)
 *   - getPricingConfig(tier) — lee de billing_pricing_config
 *   - getPartnerTierCap(tier) — lee de billing_partner_tier_caps
 *   - isStripeConfigured() — sanity check
 */
import { Injectable, Logger } from '@nestjs/common'
import Stripe = require('stripe')
import { PrismaService } from '../prisma/prisma.service'

type StripeInstance = InstanceType<typeof Stripe>

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name)
  private stripe: StripeInstance | null = null

  constructor(private readonly prisma: PrismaService) {
    const apiKey = process.env.STRIPE_SECRET_KEY
    if (apiKey) {
      this.stripe = new Stripe(apiKey, { apiVersion: '2026-04-22.dahlia' })
      this.logger.log('[BillingService] Stripe SDK initialized (live mode if STRIPE_SECRET_KEY is sk_live_, test mode if sk_test_).')
    } else {
      this.logger.warn(
        '[BillingService] STRIPE_SECRET_KEY no configurado — billing features deshabilitadas en este entorno.',
      )
    }
  }

  isStripeConfigured(): boolean {
    return this.stripe !== null
  }

  getStripeClient(): StripeInstance {
    if (!this.stripe) {
      throw new Error(
        '[BillingService] Stripe no está configurado. Verifica STRIPE_SECRET_KEY env var.',
      )
    }
    return this.stripe
  }

  /**
   * Lee el pricing config vigente del tier solicitado.
   * Devuelve null si el tier no existe o está inactivo.
   */
  async getPricingConfig(tier: 'STARTER' | 'PRO' | 'ENTERPRISE') {
    return this.prisma.billingPricingConfig.findFirst({
      where: { tier, isActive: true },
    })
  }

  /**
   * Lee el cap del partner tier.
   * Devuelve null si el tier no está registrado (e.g. PLATFORM_ADMIN no tiene cap).
   */
  async getPartnerTierCap(tier: string) {
    return this.prisma.billingPartnerTierCap.findUnique({
      where: { tier },
    })
  }

  /**
   * Lista todos los pricing configs activos — usado por el wizard Step 7.5
   * para mostrar tiers disponibles dinámicamente (no hardcoded).
   */
  async listActivePricingConfigs() {
    return this.prisma.billingPricingConfig.findMany({
      where: { isActive: true },
      orderBy: { monthlyAmountMxn: 'asc' },
    })
  }
}
