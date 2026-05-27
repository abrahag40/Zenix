/**
 * PricingAdminController — endpoints PLATFORM-only para gestionar pricing.
 *
 * Sprint BILLING-CORE Day 5. Vive bajo `/v1/nova/admin/*` y SOLO el tier
 * PLATFORM (ZaharDev staff) puede acceder. Cambios aquí impactan TODOS los
 * clientes Zenix simultáneamente.
 *
 * Endpoints:
 *   GET    /v1/nova/admin/pricing                       — list pricing tiers
 *   PATCH  /v1/nova/admin/pricing/:tier                 — update tier (PLATFORM)
 *   GET    /v1/nova/admin/partner-tier-caps             — list discount caps
 *   PATCH  /v1/nova/admin/partner-tier-caps/:tier       — update cap (PLATFORM)
 */
import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import type { JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { NovaTiers, NovaTiersGuard } from '../nova/guards/nova-tiers.guard'
import { PricingAdminService } from './pricing-admin.service'
import { UpdatePartnerTierCapDto, UpdatePricingConfigDto } from './dto/pricing-admin.dto'

@Controller('v1/nova/admin')
@UseGuards(AuthGuard('jwt'), NovaTiersGuard)
@NovaTiers('PLATFORM')
export class PricingAdminController {
  constructor(private readonly service: PricingAdminService) {}

  @Get('pricing')
  async listPricing() {
    return this.service.listPricingConfig()
  }

  @Patch('pricing/:tier')
  async updatePricing(
    @Param('tier') tier: string,
    @Body() dto: UpdatePricingConfigDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.updatePricingConfig(tier as 'STARTER' | 'PRO' | 'ENTERPRISE', dto, actor)
  }

  @Get('partner-tier-caps')
  async listCaps() {
    return this.service.listPartnerTierCaps()
  }

  @Patch('partner-tier-caps/:tier')
  async updateCap(
    @Param('tier') tier: string,
    @Body() dto: UpdatePartnerTierCapDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.updatePartnerTierCap(tier, dto, actor)
  }
}
