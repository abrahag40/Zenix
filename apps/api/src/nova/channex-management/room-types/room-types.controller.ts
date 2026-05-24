/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 5.
 *
 * Room Types CRUD endpoints — Tier A only (PLATFORM/PARTNER_*).
 *
 * Routes:
 *   GET    /v1/nova/channex/properties/:propertyId/room-types
 *   POST   /v1/nova/channex/properties/:propertyId/room-types
 *   PATCH  /v1/nova/channex/properties/:propertyId/room-types/:id
 *   DELETE /v1/nova/channex/properties/:propertyId/room-types/:id?force=true
 *
 * Guards stack (en orden):
 *   1. JwtAuthGuard — valida Bearer token
 *   2. NovaTiersGuard — valida actorTier ∈ {PLATFORM, PARTNER_ADMIN, PARTNER_MEMBER}
 *   3. NovaActingOrgGuard — valida X-Acting-Organization-Id ∈ assignedOrgIds
 *
 * Audit: cada operación escribe entry en audit_log via service.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import type { JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { NovaActingOrgGuard, RequireActingOrg } from '../../guards/nova-acting-org.guard'
import { NovaTiers, NovaTiersGuard } from '../../guards/nova-tiers.guard'
import { ChannexRoomTypesService } from './room-types.service'

const HEADER_ON_BEHALF_OF = 'x-on-behalf-of-user-id'
const HEADER_REASON = 'x-impersonation-reason'

@Controller('v1/nova/channex/properties/:propertyId/room-types')
@UseGuards(AuthGuard('jwt'), NovaTiersGuard, NovaActingOrgGuard)
@NovaTiers('PLATFORM', 'PARTNER_ADMIN', 'PARTNER_MEMBER')
@RequireActingOrg()
export class ChannexRoomTypesController {
  constructor(private readonly service: ChannexRoomTypesService) {}

  @Get()
  async list(@Param('propertyId') propertyId: string) {
    return this.service.list(propertyId)
  }

  @Post()
  async create(
    @Param('propertyId') propertyId: string,
    @Body()
    body: {
      title: string
      countOfRooms: number
      occAdults: number
      occChildren?: number
      occInfants?: number
      defaultOccupancy?: number
      roomKind?: 'room' | 'dorm'
    },
    @CurrentUser() actor: JwtPayload,
    @Headers(HEADER_ON_BEHALF_OF) onBehalfOfHeader?: string,
    @Headers(HEADER_REASON) reasonHeader?: string,
  ) {
    return this.service.create(
      propertyId,
      body,
      actor.sub,
      mapTierToSystemRole(actor.actorTier!),
      onBehalfOfHeader,
      reasonHeader,
    )
  }

  @Patch(':id')
  async update(
    @Param('propertyId') propertyId: string,
    @Param('id') channexRoomTypeId: string,
    @Body()
    body: {
      title?: string
      countOfRooms?: number
      occAdults?: number
      occChildren?: number
      occInfants?: number
      defaultOccupancy?: number
    },
    @CurrentUser() actor: JwtPayload,
    @Headers(HEADER_ON_BEHALF_OF) onBehalfOfHeader?: string,
    @Headers(HEADER_REASON) reasonHeader?: string,
  ) {
    return this.service.update(
      channexRoomTypeId,
      propertyId,
      body,
      actor.sub,
      mapTierToSystemRole(actor.actorTier!),
      onBehalfOfHeader,
      reasonHeader,
    )
  }

  @Delete(':id')
  async delete(
    @Param('propertyId') propertyId: string,
    @Param('id') channexRoomTypeId: string,
    @Query('force') force: string | undefined,
    @CurrentUser() actor: JwtPayload,
    @Headers(HEADER_ON_BEHALF_OF) onBehalfOfHeader?: string,
    @Headers(HEADER_REASON) reasonHeader?: string,
  ) {
    return this.service.delete(
      channexRoomTypeId,
      propertyId,
      { force: force === 'true' },
      actor.sub,
      mapTierToSystemRole(actor.actorTier!),
      onBehalfOfHeader,
      reasonHeader,
    )
  }
}

function mapTierToSystemRole(
  tier: 'PLATFORM' | 'PARTNER_ADMIN' | 'PARTNER_MEMBER' | 'ORG_OWNER' | 'ORG_STAFF',
): 'PLATFORM_ADMIN' | 'PARTNER_ADMIN' | 'PARTNER_MEMBER' {
  if (tier === 'PLATFORM') return 'PLATFORM_ADMIN'
  if (tier === 'PARTNER_ADMIN') return 'PARTNER_ADMIN'
  if (tier === 'PARTNER_MEMBER') return 'PARTNER_MEMBER'
  throw new Error(`Tier ${tier} no permitido en RoomTypes controller (NovaTiersGuard debió rechazar)`)
}
