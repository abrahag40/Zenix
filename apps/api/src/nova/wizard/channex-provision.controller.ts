/**
 * ChannexProvisionController — Sprint CHANNEX-AUTO-PROVISION Day 5.
 *
 * Surface: /v1/nova/channex/* — recovery + retry del provisioning Channex.
 *
 * Endpoints:
 *   GET  /v1/nova/channex/provisioning            — lista status per property (acting org)
 *   POST /v1/nova/channex/provision/:propertyId   — re-dispara provisioning (idempotent)
 *
 * Auth: NovaTiers PLATFORM, PARTNER_ADMIN, PARTNER_MEMBER, ORG_OWNER. PARTNER_MEMBER debe declarar
 * X-Acting-Organization-Id dentro de su scope (§170 D-NOVA-12); PLATFORM
 * puede omitir el header (cross-tenant queries).
 *
 * El retry es idempotente: ChannexProvisionService.retryProperty verifica
 * mappings BD antes de cualquier POST a Channex (D-CHX-AP-2). Si la property
 * ya tiene channexPropertyId, skip create; solo crea lo faltante.
 */
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import type { Request } from 'express'
import type { JwtPayload } from '@zenix/shared'
import { PrismaService } from '../../prisma/prisma.service'
import { NovaTiers, NovaTiersGuard } from '../guards/nova-tiers.guard'
import { NovaActingOrgGuard, RequireActingOrg } from '../guards/nova-acting-org.guard'
import { ChannexProvisionService } from './channex-provision.service'

class RetryChannelDto {
  @IsIn(['BookingCom', 'ExpediaCom', 'AirbnbCom', 'AgodaCom', 'GoogleHotelAds', 'VRBOCom', 'OpenChannel'])
  type!:
    | 'BookingCom'
    | 'ExpediaCom'
    | 'AirbnbCom'
    | 'AgodaCom'
    | 'GoogleHotelAds'
    | 'VRBOCom'
    | 'OpenChannel'

  @IsString() @MinLength(2) @MaxLength(120)
  title!: string

  @IsOptional()
  @IsObject()
  credentials?: Record<string, string>

  @IsBoolean()
  configureLater!: boolean
}

class RetryProvisionDto {
  /**
   * Channels opcionales. Si vacío, el retry solo re-intenta property + room
   * types + rate plans (los channels existentes en BD NO se duplican porque
   * Channel.channexChannelId tiene constraint UNIQUE — el create-side filter
   * en provisionFromWizard solo crea los que faltan).
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RetryChannelDto)
  channels?: RetryChannelDto[]
}

/**
 * Helper: resuelve la acting org del request.
 * - PLATFORM: lee header opcional `X-Acting-Organization-Id` via req.actingOrgId.
 * - PARTNER_*: el guard ya validó assignedOrgIds; req.actingOrgId siempre set.
 * - ORG_OWNER: actor.organizationId del JWT.
 */
function resolveActingOrgId(req: Request & { user?: JwtPayload }): string | undefined {
  const augmented = req as Request & { actingOrgId?: string; user?: JwtPayload }
  const fromHeader = augmented.actingOrgId
  const fromJwt = augmented.user?.organizationId
  return fromHeader ?? fromJwt
}

@Controller('v1/nova/channex')
@UseGuards(AuthGuard('jwt'), NovaTiersGuard, NovaActingOrgGuard)
@NovaTiers('PLATFORM', 'PARTNER_ADMIN', 'PARTNER_MEMBER', 'ORG_OWNER')
export class ChannexProvisionController {
  constructor(
    private readonly provision: ChannexProvisionService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Lista el estado de provisioning para todas las Properties de la acting
   * org. Alimenta `/nova/billing/channex` recovery UI.
   */
  @Get('provisioning')
  @RequireActingOrg()
  async listProvisioning(@Req() req: Request & { user?: JwtPayload }) {
    const orgId = resolveActingOrgId(req)
    if (!orgId) {
      throw new BadRequestException(
        'Sin acting org — PLATFORM debe enviar X-Acting-Organization-Id para esta consulta.',
      )
    }
    return this.provision.listProvisioningStatus(orgId)
  }

  /**
   * Re-dispara el provisioning para una Property específica. Idempotent.
   * Si la property ya tiene mappings completos, el resultado es no-op + estado
   * 'completed'.
   *
   * Defense-in-depth: además del NovaActingOrgGuard (que valida que el actor
   * tenga acceso a la acting org), verificamos que la propertyId pertenece a
   * la acting org — previene IDOR de un consultor con acceso legítimo a
   * org-A escribiendo a una property de org-B usando el endpoint POST.
   */
  @Post('provision/:propertyId')
  @RequireActingOrg()
  async retryProvision(
    @Param('propertyId') propertyId: string,
    @Body() dto: RetryProvisionDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    const actingOrgId = resolveActingOrgId(req)
    if (!actingOrgId) {
      throw new BadRequestException(
        'Sin acting org — PLATFORM debe enviar X-Acting-Organization-Id para retry.',
      )
    }

    const prop = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { organizationId: true },
    })
    if (!prop) {
      throw new ForbiddenException(`Property ${propertyId} no encontrada`)
    }
    if (prop.organizationId !== actingOrgId) {
      throw new ForbiddenException(
        `Property ${propertyId} no pertenece a la organización en contexto`,
      )
    }

    return this.provision.retryProperty(
      propertyId,
      (dto.channels ?? []).map((c) => ({
        type: c.type,
        title: c.title,
        credentials: c.credentials,
        configureLater: c.configureLater,
      })),
    )
  }
}
