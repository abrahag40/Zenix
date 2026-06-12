import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiExcludeController } from '@nestjs/swagger'
import { Request } from 'express'
import type { JwtPayload } from '@zenix/shared'
import { PrismaService } from '../prisma/prisma.service'
import { NovaTiers, NovaTiersGuard } from '../nova/guards/nova-tiers.guard'
import { NovaActingOrgGuard, RequireActingOrg } from '../nova/guards/nova-acting-org.guard'
import { BookingEngineConfigService } from './booking-engine-config.service'
import { BookingApiKeyService } from './booking-api-key.service'
import { WebhookSubscriptionService } from './webhooks/webhook-subscription.service'
import {
  CreateWebhookDto,
  GenerateApiKeyDto,
  ToggleBookingDto,
  ToggleWebhookDto,
  UpsertBookingConfigDto,
} from './dto/booking-engine-management.dto'

function resolveActingOrgId(req: Request & { user?: JwtPayload }): string | undefined {
  const aug = req as Request & { actingOrgId?: string; user?: JwtPayload }
  return aug.actingOrgId ?? aug.user?.organizationId
}

/**
 * BookingEngineManagementController — BOOKING-ENGINE B4.
 *
 * Panel consultor-led de "Zenix Booking" en Nova. El consultor activa/desactiva
 * el motor (opcional, se cobra extra), configura branding/copy, genera API keys
 * y suscribe webhooks — SIN tocar código. Scoped por acting org: cada property
 * se valida contra la organización en contexto (defense-in-depth IDOR, §191).
 */
@ApiExcludeController() // interno (Nova) — fuera de la doc pública del motor
@Controller('v1/nova/booking-engine')
@UseGuards(AuthGuard('jwt'), NovaTiersGuard, NovaActingOrgGuard)
@NovaTiers('PLATFORM', 'PARTNER_ADMIN', 'PARTNER_MEMBER', 'ORG_OWNER')
export class BookingEngineManagementController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: BookingEngineConfigService,
    private readonly apiKeys: BookingApiKeyService,
    private readonly webhooks: WebhookSubscriptionService,
  ) {}

  /** Valida que la property pertenezca a la acting org. Devuelve el orgId. */
  private async assertPropertyInActingOrg(propertyId: string, req: Request & { user?: JwtPayload }) {
    const orgId = resolveActingOrgId(req)
    if (!orgId) throw new BadRequestException('Sin acting org — declara X-Acting-Organization-Id.')
    const prop = await this.prisma.property.findUnique({ where: { id: propertyId }, select: { organizationId: true } })
    if (!prop) throw new ForbiddenException(`Property ${propertyId} no encontrada`)
    if (prop.organizationId !== orgId) {
      throw new ForbiddenException(`Property ${propertyId} no pertenece a la organización en contexto`)
    }
    return orgId
  }

  /** Lista todas las properties de la acting org + su estado de motor on/off. */
  @Get()
  @RequireActingOrg()
  async list(@Req() req: Request & { user?: JwtPayload }) {
    const orgId = resolveActingOrgId(req)
    if (!orgId) throw new BadRequestException('Sin acting org — declara X-Acting-Organization-Id.')
    return this.configService.listForOrg(orgId)
  }

  @Get(':propertyId')
  @RequireActingOrg()
  async get(@Param('propertyId') propertyId: string, @Req() req: Request & { user?: JwtPayload }) {
    await this.assertPropertyInActingOrg(propertyId, req)
    return this.configService.getForProperty(propertyId)
  }

  @Put(':propertyId')
  @RequireActingOrg()
  async upsert(
    @Param('propertyId') propertyId: string,
    @Body() dto: UpsertBookingConfigDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    await this.assertPropertyInActingOrg(propertyId, req)
    return this.configService.upsert(propertyId, dto)
  }

  /** Activar/desactivar el motor (crea la config si se activa y no existía). */
  @Post(':propertyId/toggle')
  @RequireActingOrg()
  async toggle(
    @Param('propertyId') propertyId: string,
    @Body() dto: ToggleBookingDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    await this.assertPropertyInActingOrg(propertyId, req)
    return this.configService.toggle(propertyId, dto.enabled)
  }

  /** Genera una API key. El plaintext se devuelve UNA sola vez. */
  @Post(':propertyId/api-keys')
  @RequireActingOrg()
  async generateApiKey(
    @Param('propertyId') propertyId: string,
    @Body() dto: GenerateApiKeyDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    await this.assertPropertyInActingOrg(propertyId, req)
    return this.apiKeys.generate({
      propertyId,
      label: dto.label,
      environment: dto.environment ?? 'live',
      allowedOrigins: dto.allowedOrigins,
    })
  }

  @Delete(':propertyId/api-keys/:keyId')
  @RequireActingOrg()
  async revokeApiKey(
    @Param('propertyId') propertyId: string,
    @Param('keyId') keyId: string,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    await this.assertPropertyInActingOrg(propertyId, req)
    return this.apiKeys.revoke(propertyId, keyId)
  }

  /** Suscribe un webhook. El secret se devuelve UNA sola vez. */
  @Post(':propertyId/webhooks')
  @RequireActingOrg()
  async createWebhook(
    @Param('propertyId') propertyId: string,
    @Body() dto: CreateWebhookDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    await this.assertPropertyInActingOrg(propertyId, req)
    return this.webhooks.create(propertyId, dto.url, dto.events ?? [])
  }

  @Post(':propertyId/webhooks/:id/toggle')
  @RequireActingOrg()
  async toggleWebhook(
    @Param('propertyId') propertyId: string,
    @Param('id') id: string,
    @Body() dto: ToggleWebhookDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    await this.assertPropertyInActingOrg(propertyId, req)
    return this.webhooks.setActive(propertyId, id, dto.active)
  }
}
