/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 5.
 *
 * Rate Plans CRUD endpoints — Tier A only.
 *
 * Routes:
 *   GET    /v1/nova/channex/properties/:propertyId/rate-plans
 *   POST   /v1/nova/channex/properties/:propertyId/rate-plans
 *   PATCH  /v1/nova/channex/properties/:propertyId/rate-plans/:id
 *   DELETE /v1/nova/channex/properties/:propertyId/rate-plans/:id
 */
import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import type { JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { NovaActingOrgGuard, RequireActingOrg } from '../../guards/nova-acting-org.guard'
import { NovaTiers, NovaTiersGuard } from '../../guards/nova-tiers.guard'
import { ChannexRatePlansService } from './rate-plans.service'

const HEADER_ON_BEHALF_OF = 'x-on-behalf-of-user-id'
const HEADER_REASON = 'x-impersonation-reason'

@Controller('v1/nova/channex/properties/:propertyId/rate-plans')
@UseGuards(AuthGuard('jwt'), NovaTiersGuard, NovaActingOrgGuard)
@NovaTiers('PLATFORM', 'PARTNER_ADMIN', 'PARTNER_MEMBER')
@RequireActingOrg()
export class ChannexRatePlansController {
  constructor(private readonly service: ChannexRatePlansService) {}

  @Get()
  async list(@Param('propertyId') propertyId: string) {
    return this.service.list(propertyId)
  }

  @Post()
  async create(
    @Param('propertyId') propertyId: string,
    @Body()
    body: {
      roomTypeId: string
      title: string
      currency: string
      rateCents: number
      occupancy?: number
      sellMode?: 'per_room' | 'per_person'
      rateMode?: 'manual' | 'derived'
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
    @Param('id') channexRatePlanId: string,
    @Body()
    body: {
      title?: string
      currency?: string
      sellMode?: 'per_room' | 'per_person'
      rateMode?: 'manual' | 'derived'
    },
    @CurrentUser() actor: JwtPayload,
    @Headers(HEADER_ON_BEHALF_OF) onBehalfOfHeader?: string,
    @Headers(HEADER_REASON) reasonHeader?: string,
  ) {
    return this.service.update(
      channexRatePlanId,
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
    @Param('id') channexRatePlanId: string,
    @CurrentUser() actor: JwtPayload,
    @Headers(HEADER_ON_BEHALF_OF) onBehalfOfHeader?: string,
    @Headers(HEADER_REASON) reasonHeader?: string,
  ) {
    return this.service.delete(
      channexRatePlanId,
      propertyId,
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
  throw new Error(`Tier ${tier} no permitido en RatePlans controller`)
}
