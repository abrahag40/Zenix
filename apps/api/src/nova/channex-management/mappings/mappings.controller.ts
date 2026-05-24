/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 7.
 *
 * Routes:
 *   GET   /v1/nova/channex/properties/:propertyId/mappings/proposal
 *   PATCH /v1/nova/channex/properties/:propertyId/mappings/rooms
 *           body: { mappings: MappingUpdate[], reason? }
 *   GET   /v1/nova/channex/properties/:propertyId/mappings/health
 */
import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import type { JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { NovaActingOrgGuard, RequireActingOrg } from '../../guards/nova-acting-org.guard'
import { NovaTiers, NovaTiersGuard } from '../../guards/nova-tiers.guard'
import { MappingUpdate, MappingsService } from './mappings.service'

const HEADER_ON_BEHALF_OF = 'x-on-behalf-of-user-id'
const HEADER_REASON = 'x-impersonation-reason'

@Controller('v1/nova/channex/properties/:propertyId/mappings')
@UseGuards(AuthGuard('jwt'), NovaTiersGuard, NovaActingOrgGuard)
@NovaTiers('PLATFORM', 'PARTNER_ADMIN', 'PARTNER_MEMBER', 'ORG_OWNER')
@RequireActingOrg()
export class MappingsController {
  constructor(private readonly service: MappingsService) {}

  @Get('proposal')
  async proposal(@Param('propertyId') propertyId: string) {
    return this.service.proposal(propertyId)
  }

  @Patch('rooms')
  async bulkUpdate(
    @Param('propertyId') propertyId: string,
    @Body() body: { mappings: MappingUpdate[]; reason?: string },
    @CurrentUser() actor: JwtPayload,
    @Headers(HEADER_ON_BEHALF_OF) onBehalfOfHeader?: string,
    @Headers(HEADER_REASON) reasonHeader?: string,
  ) {
    if (!body || !Array.isArray(body.mappings)) {
      throw new BadRequestException('Body requiere { mappings: MappingUpdate[] }')
    }
    return this.service.bulkUpdate(
      propertyId,
      body.mappings,
      actor.sub,
      mapTierToSystemRole(actor.actorTier!),
      onBehalfOfHeader,
      reasonHeader ?? body.reason,
    )
  }

  @Get('health')
  async health(@Param('propertyId') propertyId: string) {
    return this.service.healthCheck(propertyId)
  }
}

function mapTierToSystemRole(
  tier: 'PLATFORM' | 'PARTNER_ADMIN' | 'PARTNER_MEMBER' | 'ORG_OWNER' | 'ORG_STAFF',
): 'PLATFORM_ADMIN' | 'PARTNER_ADMIN' | 'PARTNER_MEMBER' | 'ORG_OWNER' {
  if (tier === 'PLATFORM') return 'PLATFORM_ADMIN'
  if (tier === 'PARTNER_ADMIN') return 'PARTNER_ADMIN'
  if (tier === 'PARTNER_MEMBER') return 'PARTNER_MEMBER'
  if (tier === 'ORG_OWNER') return 'ORG_OWNER'
  throw new Error(`Tier ${tier} no permitido en Mappings controller`)
}
