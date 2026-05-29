/**
 * ChannexProvisionController — Sprint CHANNEX-AUTO-PROVISION Days 5+ (close).
 *
 * Surface RESTful nested: recursos jerarquizados bajo Organization/Property.
 *
 * Endpoints:
 *   GET  /v1/nova/organizations/provisioning
 *        → lista status per property de la acting org
 *   POST /v1/nova/properties/:propertyId/channex/provision
 *        → re-dispara provisioning (idempotent; opcional force=true para
 *          delete+recreate de channels existentes)
 *   POST /v1/nova/channex/channels/:channelId/credentials
 *        → completa/actualiza credentials de un Channel pre-existente
 *          (caso típico: configureLater=true al activar, completar después)
 *
 * Auth: NovaTiers PLATFORM, PARTNER_ADMIN, PARTNER_MEMBER, ORG_OWNER.
 * PARTNER_MEMBER debe declarar X-Acting-Organization-Id dentro de su scope
 * (§170 D-NOVA-12); PLATFORM puede omitir el header (cross-tenant queries).
 *
 * El retry es idempotente: ChannexProvisionService.retryProperty verifica
 * mappings BD antes de cualquier POST a Channex (D-CHX-AP-2). Si la property
 * ya tiene channexPropertyId, skip create; solo crea lo faltante. Con
 * `force=true`, los channels existentes se eliminan en Channex + BD y se
 * re-crean — útil cuando el cliente actualizó credentials Booking/Expedia y
 * el partner exige re-binding.
 */
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
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
import { ChannelCredentialsCryptoService } from './channel-credentials-crypto.service'
import { ChannexGateway } from '../../integrations/channex/channex.gateway'

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

  /**
   * Si true → delete + recreate de Channel rows que ya existen en BD para
   * los `channels` provistos. Útil cuando el cliente cambió credentials
   * Booking/Expedia y el partner exige re-binding del mapping.
   *
   * Default false → idempotent skip (no toca channels existentes).
   *
   * SAFETY: el delete-recreate es destructivo en Channex (rompe el binding
   * activo) — solo úsalo cuando estés seguro. Cliente debe estar en pause
   * o el OTA no debe estar published para evitar perder reservas en flight.
   */
  @IsOptional()
  @IsBoolean()
  force?: boolean
}

class CompleteChannelCredentialsDto {
  /**
   * Credentials plain del cliente. Backend cifra AES-256-GCM antes de persistir
   * en Channel.settingsEncrypted. También las propaga a Channex via
   * gateway.updateChannel(settings=...) para activar el binding.
   */
  @IsObject()
  credentials!: Record<string, string>
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

@Controller('v1/nova')
@UseGuards(AuthGuard('jwt'), NovaTiersGuard, NovaActingOrgGuard)
@NovaTiers('PLATFORM', 'PARTNER_ADMIN', 'PARTNER_MEMBER', 'ORG_OWNER')
export class ChannexProvisionController {
  constructor(
    private readonly provision: ChannexProvisionService,
    private readonly prisma: PrismaService,
    private readonly crypto: ChannelCredentialsCryptoService,
    private readonly gateway: ChannexGateway,
  ) {}

  /**
   * Lista el estado de provisioning para todas las Properties de la acting
   * org. Alimenta `/nova/billing/channex` recovery UI.
   */
  @Get('organizations/provisioning')
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
   * Re-dispara el provisioning para una Property específica. Idempotent por
   * default; `force=true` opcional para reset destructivo de channels.
   */
  @Post('properties/:propertyId/channex/provision')
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
      { force: dto.force ?? false },
    )
  }

  /**
   * Completa credentials de un Channel existente. Caso típico: channel se creó
   * al activar con `configureLater=true` (status='pending_credentials'); el
   * consultor/cliente vuelve después con las credenciales reales.
   *
   * Flow:
   *   1. Valida channel pertenece a una property de la acting org.
   *   2. Validate no es Airbnb (los Airbnb son requires_oauth, NO admiten
   *      credentials manuales — OAuth flow vive en sprint AIRBNB-OAUTH).
   *   3. Cifra credentials con KEK + persiste en Channel.settingsEncrypted.
   *   4. Propaga a Channex via gateway.updateChannel({settings}) para que el
   *      partner OTA active el binding.
   *   5. Update Channel.status='inactive' (creado + bindeado, pero NOT yet
   *      published — eso requiere paso manual post OTA-side onboarding).
   */
  @Post('channex/channels/:channelId/credentials')
  @RequireActingOrg()
  async completeChannelCredentials(
    @Param('channelId') channelId: string,
    @Body() dto: CompleteChannelCredentialsDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    const actingOrgId = resolveActingOrgId(req)
    if (!actingOrgId) {
      throw new BadRequestException(
        'Sin acting org — PLATFORM debe enviar X-Acting-Organization-Id para completar credentials.',
      )
    }

    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { property: { select: { organizationId: true } } },
    })
    if (!channel) {
      throw new NotFoundException(`Channel ${channelId} no encontrado`)
    }
    if (channel.property.organizationId !== actingOrgId) {
      throw new ForbiddenException(
        `Channel ${channelId} no pertenece a la organización en contexto`,
      )
    }
    if (channel.type === 'AirbnbCom') {
      throw new BadRequestException(
        'Airbnb requiere OAuth handshake en su extranet — no admite credentials manuales. Abre Airbnb extranet desde la UI de recovery.',
      )
    }
    if (!this.crypto.isReady()) {
      throw new BadRequestException(
        'CHANNEX_CREDENTIALS_KEK no configurada en este server — no se puede cifrar. Contacta soporte.',
      )
    }

    // Cifrar antes que cualquier llamada externa (evita state intermedio si
    // el crypto throws).
    const settingsEncrypted = this.crypto.encrypt(dto.credentials)

    // Propagar a Channex. El gateway recibe plain text y lo manda a Channex
    // vault. Si Channex 422 (credenciales inválidas para el OTA), no
    // persistimos en BD — el cliente verá el error y reintenta.
    try {
      await this.gateway.updateChannel(channel.channexChannelId, {
        settings: dto.credentials,
      })
    } catch (err) {
      throw new BadRequestException(
        `Channex rechazó las credenciales: ${(err as Error).message?.slice(0, 200)}`,
      )
    }

    // Persistir cifradas + flip status a 'inactive' (creado + bindeado, sin publish)
    const updated = await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        settingsEncrypted,
        status: 'inactive',
        lastSyncedAt: new Date(),
      },
      select: {
        id: true,
        type: true,
        title: true,
        status: true,
        lastSyncedAt: true,
      },
    })

    return updated
  }
}
