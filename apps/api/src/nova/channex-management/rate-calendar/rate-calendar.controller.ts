/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 6.
 *
 * Rate Calendar Matrix endpoints.
 *
 * Endpoints:
 *   GET    /v1/nova/channex/properties/:propertyId/rate-calendar
 *            ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *          → matriz `días × rate plans` + parity issues + caps.
 *
 *   PATCH  /v1/nova/channex/properties/:propertyId/rate-calendar/bulk
 *          body: { entries: RateCalendarBulkEntry[], reason?: string }
 *          → valida caps + emite UN evento → outbox → Channex.
 *
 *   POST   /v1/nova/channex/properties/:propertyId/rate-calendar/expand-template
 *          body: DayOfWeekTemplate
 *          → expande template a entries[] (preview, NO persiste).
 *
 * RBAC:
 *   · GET allowed para PLATFORM_ADMIN, PARTNER_ADMIN, PARTNER_MEMBER, ORG_OWNER
 *     (lectura — la vista de pricing es esencial para el supervisor cliente).
 *   · PATCH / POST allowed para PLATFORM_ADMIN, PARTNER_ADMIN, PARTNER_MEMBER,
 *     ORG_OWNER (este último opera dentro de los caps que el consultor definió,
 *     Salesforce Permission Set pattern — §D-CHX-CC-9).
 */
import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { DateRangeDto } from '../../../common/dto/date-range.dto'
import { AuthGuard } from '@nestjs/passport'
import type { JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { NovaActingOrgGuard, RequireActingOrg } from '../../guards/nova-acting-org.guard'
import { NovaTiers, NovaTiersGuard } from '../../guards/nova-tiers.guard'
import {
  DayOfWeekTemplate,
  RateCalendarBulkEntry,
  RateCalendarService,
} from './rate-calendar.service'

const HEADER_ON_BEHALF_OF = 'x-on-behalf-of-user-id'
const HEADER_REASON = 'x-impersonation-reason'

@Controller('v1/nova/channex/properties/:propertyId/rate-calendar')
@UseGuards(AuthGuard('jwt'), NovaTiersGuard, NovaActingOrgGuard)
@NovaTiers('PLATFORM', 'PARTNER_ADMIN', 'PARTNER_MEMBER', 'ORG_OWNER')
@RequireActingOrg()
export class RateCalendarController {
  constructor(private readonly service: RateCalendarService) {}

  @Get()
  async getMatrix(@Param('propertyId') propertyId: string, @Query() dto: DateRangeDto) {
    return this.service.getMatrix(propertyId, dto.from, dto.to)
  }

  @Patch('bulk')
  async bulkUpdate(
    @Param('propertyId') propertyId: string,
    @Body() body: { entries: RateCalendarBulkEntry[]; reason?: string },
    @CurrentUser() actor: JwtPayload,
    @Headers(HEADER_ON_BEHALF_OF) onBehalfOfHeader?: string,
    @Headers(HEADER_REASON) reasonHeader?: string,
  ) {
    if (!body || !Array.isArray(body.entries)) {
      throw new BadRequestException('Body requiere { entries: RateCalendarBulkEntry[] }')
    }
    return this.service.bulkUpdate(
      propertyId,
      body.entries,
      actor.sub,
      mapTierToSystemRole(actor.actorTier!),
      onBehalfOfHeader,
      reasonHeader ?? body.reason,
    )
  }

  @Post('expand-template')
  async expandTemplate(
    @Param('propertyId') _propertyId: string,
    @Body() template: DayOfWeekTemplate,
  ) {
    if (!template?.ratePlanId || !template?.dateFrom || !template?.dateTo || !template?.weekdayRates) {
      throw new BadRequestException(
        'Body requiere { ratePlanId, dateFrom, dateTo, weekdayRates: { mo?, tu?, ... } }',
      )
    }
    return { entries: this.service.expandTemplate(template) }
  }
}

function mapTierToSystemRole(
  tier: 'PLATFORM' | 'PARTNER_ADMIN' | 'PARTNER_MEMBER' | 'ORG_OWNER' | 'ORG_STAFF',
): 'PLATFORM_ADMIN' | 'PARTNER_ADMIN' | 'PARTNER_MEMBER' | 'ORG_OWNER' {
  if (tier === 'PLATFORM') return 'PLATFORM_ADMIN'
  if (tier === 'PARTNER_ADMIN') return 'PARTNER_ADMIN'
  if (tier === 'PARTNER_MEMBER') return 'PARTNER_MEMBER'
  if (tier === 'ORG_OWNER') return 'ORG_OWNER'
  throw new Error(`Tier ${tier} no permitido en RateCalendar controller`)
}
