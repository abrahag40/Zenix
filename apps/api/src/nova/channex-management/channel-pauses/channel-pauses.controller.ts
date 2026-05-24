/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 7.
 *
 * Routes:
 *   GET    /v1/nova/channex/properties/:propertyId/channel-pauses
 *   POST   /v1/nova/channex/properties/:propertyId/channel-pauses
 *            body: { channexChannelId, channelName, pauseReason? }
 *   POST   /v1/nova/channex/properties/:propertyId/channel-pauses/:id/unpause
 *            body: { unpauseReason? }
 */
import { BadRequestException, Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import type { JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { NovaActingOrgGuard, RequireActingOrg } from '../../guards/nova-acting-org.guard'
import { NovaTiers, NovaTiersGuard } from '../../guards/nova-tiers.guard'
import { ChannelPausesService } from './channel-pauses.service'

const HEADER_ON_BEHALF_OF = 'x-on-behalf-of-user-id'
const HEADER_REASON = 'x-impersonation-reason'

@Controller('v1/nova/channex/properties/:propertyId/channel-pauses')
@UseGuards(AuthGuard('jwt'), NovaTiersGuard, NovaActingOrgGuard)
@NovaTiers('PLATFORM', 'PARTNER_ADMIN', 'PARTNER_MEMBER', 'ORG_OWNER')
@RequireActingOrg()
export class ChannelPausesController {
  constructor(private readonly service: ChannelPausesService) {}

  @Get()
  async list(@Param('propertyId') propertyId: string) {
    return this.service.list(propertyId)
  }

  @Post()
  async pause(
    @Param('propertyId') propertyId: string,
    @Body() body: { channexChannelId: string; channelName: string; pauseReason?: string },
    @CurrentUser() actor: JwtPayload,
    @Headers(HEADER_ON_BEHALF_OF) onBehalfOfHeader?: string,
    @Headers(HEADER_REASON) reasonHeader?: string,
  ) {
    if (!body?.channexChannelId || !body?.channelName) {
      throw new BadRequestException('Body requiere { channexChannelId, channelName }')
    }
    return this.service.pause(
      propertyId,
      body.channexChannelId,
      body.channelName,
      body.pauseReason,
      actor.sub,
      mapTierToSystemRole(actor.actorTier!),
      onBehalfOfHeader,
      reasonHeader,
    )
  }

  @Post(':id/unpause')
  async unpause(
    @Param('propertyId') propertyId: string,
    @Param('id') pauseId: string,
    @Body() body: { unpauseReason?: string },
    @CurrentUser() actor: JwtPayload,
    @Headers(HEADER_ON_BEHALF_OF) onBehalfOfHeader?: string,
    @Headers(HEADER_REASON) reasonHeader?: string,
  ) {
    return this.service.unpause(
      propertyId,
      pauseId,
      body?.unpauseReason,
      actor.sub,
      mapTierToSystemRole(actor.actorTier!),
      onBehalfOfHeader,
      reasonHeader,
    )
  }
}

function mapTierToSystemRole(
  tier: 'PLATFORM' | 'PARTNER_ADMIN' | 'PARTNER_MEMBER' | 'ORG_OWNER' | 'ORG_STAFF',
): 'PLATFORM_ADMIN' | 'PARTNER_ADMIN' | 'PARTNER_MEMBER' | 'ORG_OWNER' {
  if (tier === 'PLATFORM') return 'PLATFORM_ADMIN'
  if (tier === 'PARTNER_ADMIN') return 'PARTNER_ADMIN'
  if (tier === 'PARTNER_MEMBER') return 'PARTNER_MEMBER'
  if (tier === 'ORG_OWNER') return 'ORG_OWNER'
  throw new Error(`Tier ${tier} no permitido en ChannelPauses controller`)
}
