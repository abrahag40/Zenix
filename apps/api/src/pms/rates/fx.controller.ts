import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { IsNumber, IsOptional, IsString } from 'class-validator'
import { FxService } from './fx.service'
import { TenantContextService } from '../../common/tenant-context.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '@zenix/shared'

class UpsertFxDto {
  @IsString() baseCurrency!: string
  @IsString() quoteCurrency!: string
  @IsNumber() rate!: number
  @IsOptional() @IsNumber() spreadFromOfficial?: number
  @IsOptional() @IsString() validFrom?: string
  @IsOptional() @IsString() validTo?: string
}

@Controller('v1/fx')
export class FxController {
  constructor(
    private readonly service: FxService,
    private readonly tenant: TenantContextService,
  ) {}

  /**
   * GET /v1/fx/current?propertyId=X&base=USD&quote=MXN
   * Returns: official (Banxico) + internal (PropertyFxRate) + delta percent.
   * Para dashboard widget — vista lado-a-lado al recepcionista.
   */
  @Get('current')
  current(
    @Query('propertyId') propertyId: string,
    @Query('base') base: string = 'USD',
    @Query('quote') quote: string = 'MXN',
  ) {
    const orgId = this.tenant.getOrganizationId()
    return this.service.getCurrentRates(propertyId, orgId, base, quote)
  }

  /**
   * POST /v1/fx/override?propertyId=X
   * Body: { baseCurrency, quoteCurrency, rate, spreadFromOfficial?, validFrom?, validTo? }
   * Sólo SUPERVISOR/admin. Crea nueva entrada PropertyFxRate (append-only).
   */
  @Post('override')
  upsertOverride(
    @Query('propertyId') propertyId: string,
    @Body() dto: UpsertFxDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.upsertPropertyFx(propertyId, {
      baseCurrency:       dto.baseCurrency,
      quoteCurrency:      dto.quoteCurrency,
      rate:               dto.rate,
      spreadFromOfficial: dto.spreadFromOfficial,
      validFrom:          dto.validFrom ? new Date(dto.validFrom) : undefined,
      validTo:            dto.validTo ? new Date(dto.validTo) : undefined,
      updatedById:        actor.sub,
    })
  }

  /**
   * POST /v1/fx/refresh-banxico
   * Trigger manual del fetch (útil para testing + admin).
   */
  @Post('refresh-banxico')
  async refreshNow() {
    await this.service.refreshBanxicoDaily()
    return { ok: true }
  }
}
