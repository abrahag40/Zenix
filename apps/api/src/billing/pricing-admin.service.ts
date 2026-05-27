/**
 * PricingAdminService — gestión owner-only del pricing y caps Zenix.
 *
 * Sprint BILLING-CORE Day 5. Solo PLATFORM_ADMIN (ZaharDev) puede modificar
 * estos parámetros — afectan a TODOS los clientes Zenix simultáneamente.
 *
 * Operaciones:
 *   - listPricingConfig: ver todos los tiers (activos + inactivos)
 *   - updatePricingConfig: cambiar montos / Stripe Price IDs / annual discount
 *   - listPartnerTierCaps: ver matriz cap per tier
 *   - updatePartnerTierCap: ajustar cap de un tier
 *
 * NUNCA borra rows — cambia isActive=false o ajusta valores. Audit obligatorio.
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import type { JwtPayload } from '@zenix/shared'
import { PrismaService } from '../prisma/prisma.service'
import type { UpdatePartnerTierCapDto, UpdatePricingConfigDto } from './dto/pricing-admin.dto'

@Injectable()
export class PricingAdminService {
  private readonly logger = new Logger(PricingAdminService.name)

  constructor(private readonly prisma: PrismaService) {}

  async listPricingConfig() {
    return this.prisma.billingPricingConfig.findMany({
      orderBy: { monthlyAmountMxn: 'asc' },
    })
  }

  async updatePricingConfig(
    tier: 'STARTER' | 'PRO' | 'ENTERPRISE',
    dto: UpdatePricingConfigDto,
    actor: JwtPayload,
  ) {
    const existing = await this.prisma.billingPricingConfig.findFirst({ where: { tier } })
    if (!existing) {
      throw new NotFoundException(`Pricing config para tier ${tier} no existe`)
    }

    const updated = await this.prisma.billingPricingConfig.update({
      where: { id: existing.id },
      data: {
        ...(dto.monthlyAmountMxn !== undefined && { monthlyAmountMxn: dto.monthlyAmountMxn }),
        ...(dto.monthlyAmountUsd !== undefined && { monthlyAmountUsd: dto.monthlyAmountUsd }),
        ...(dto.stripePriceIdMxn !== undefined && { stripePriceIdMxn: dto.stripePriceIdMxn }),
        ...(dto.stripePriceIdUsd !== undefined && { stripePriceIdUsd: dto.stripePriceIdUsd }),
        ...(dto.annualDiscountPct !== undefined && { annualDiscountPct: dto.annualDiscountPct }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    })

    // AuditLog requiere organizationId FK no-null. Pricing config es
    // platform-wide (no asociado a un org específico) — el cambio queda
    // trazable vía BillingPricingConfig.updatedAt + logger structured.
    // TODO v1.0.x: agregar PricingConfigChangeLog table dedicada.
    this.logger.warn(
      `[PricingAdmin] PRICING_CONFIG_UPDATED tier=${tier} actor=${actor.sub} ` +
        `from=${JSON.stringify(existing)} to=${JSON.stringify(updated)}`,
    )

    return updated
  }

  async listPartnerTierCaps() {
    return this.prisma.billingPartnerTierCap.findMany({
      orderBy: { maxDiscountPct: 'asc' },
    })
  }

  async updatePartnerTierCap(
    tier: string,
    dto: UpdatePartnerTierCapDto,
    actor: JwtPayload,
  ) {
    const existing = await this.prisma.billingPartnerTierCap.findUnique({ where: { tier } })
    if (!existing) {
      throw new NotFoundException(`Partner tier cap para ${tier} no existe`)
    }

    // Sanity check — caps no deben volverse permisivos accidentalmente
    if (dto.maxDiscountPct !== undefined && (dto.maxDiscountPct < 0 || dto.maxDiscountPct > 100)) {
      throw new BadRequestException('maxDiscountPct debe estar entre 0 y 100')
    }
    if (
      dto.maxDurationMonths !== undefined &&
      dto.maxDurationMonths !== null &&
      (dto.maxDurationMonths < 1 || dto.maxDurationMonths > 60)
    ) {
      throw new BadRequestException('maxDurationMonths debe estar entre 1 y 60, o null para forever')
    }

    const updated = await this.prisma.billingPartnerTierCap.update({
      where: { tier },
      data: {
        ...(dto.maxDiscountPct !== undefined && { maxDiscountPct: dto.maxDiscountPct }),
        ...(dto.maxDurationMonths !== undefined && { maxDurationMonths: dto.maxDurationMonths }),
        ...(dto.requiresApproval !== undefined && { requiresApproval: dto.requiresApproval }),
        updatedById: actor.sub,
      },
    })

    // Ver nota en updatePricingConfig — AuditLog requiere FK org no-null.
    this.logger.warn(
      `[PricingAdmin] PARTNER_TIER_CAP_UPDATED tier=${tier} actor=${actor.sub} ` +
        `from=${JSON.stringify(existing)} to=${JSON.stringify(updated)}`,
    )

    return updated
  }
}
