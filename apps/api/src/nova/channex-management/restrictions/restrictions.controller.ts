/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 7.
 *
 * Restrictions endpoints — controller dedicado para el tab "Restricciones"
 * del Command Center. Funcionalmente es un subset del bulkUpdate del
 * RateCalendarService (Day 6) — todos los restriction fields (minStay,
 * maxStay, CTA, CTD, stopSell) van por el mismo path /restrictions Channex
 * (ver §142 D-CHX-OUT-4: AVAILABILITY vs RATES_RESTRICTIONS separación
 * estructural).
 *
 * **Por qué un controller separado** si bulkUpdate ya hace todo:
 *   1. UX: el supervisor que quiere "cerrar venta de viernes 13" piensa en
 *      "stop sell viernes" — no en "rate plan + rate". El tab Restrictions
 *      colecta solo restriction fields, sin rate. UI más simple.
 *   2. Audit: el `action` queda `CHANNEX_RESTRICTION_UPDATE` (no
 *      `CHANNEX_RATE_CALENDAR_BULK_UPDATE`) — separación analytics.
 *   3. RBAC futuro: podemos abrir restrictions a más roles que rate edits
 *      (e.g. RECEPTIONIST puede stop-sell mañana por overbooking pero NO
 *      cambiar rates). Hoy ambos requieren ORG_OWNER+.
 *
 * Routes:
 *   PATCH /v1/nova/channex/properties/:propertyId/restrictions/bulk
 *         body: { entries: RestrictionEntry[], reason?: string }
 *
 * Internamente delega a RateCalendarService.bulkUpdate filtrando rate undef.
 */
import { BadRequestException, Body, Controller, Headers, Param, Patch, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import type { JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { NovaActingOrgGuard, RequireActingOrg } from '../../guards/nova-acting-org.guard'
import { NovaTiers, NovaTiersGuard } from '../../guards/nova-tiers.guard'
import { RateCalendarBulkEntry, RateCalendarService } from '../rate-calendar/rate-calendar.service'

const HEADER_ON_BEHALF_OF = 'x-on-behalf-of-user-id'
const HEADER_REASON = 'x-impersonation-reason'

interface RestrictionEntry {
  ratePlanId: string
  date: string
  minStayArrival?: number
  minStayThrough?: number
  maxStay?: number
  closedToArrival?: boolean
  closedToDeparture?: boolean
  stopSell?: boolean
}

@Controller('v1/nova/channex/properties/:propertyId/restrictions')
@UseGuards(AuthGuard('jwt'), NovaTiersGuard, NovaActingOrgGuard)
@NovaTiers('PLATFORM', 'PARTNER_ADMIN', 'PARTNER_MEMBER', 'ORG_OWNER')
@RequireActingOrg()
export class RestrictionsController {
  constructor(private readonly rateCalendar: RateCalendarService) {}

  @Patch('bulk')
  async bulkUpdate(
    @Param('propertyId') propertyId: string,
    @Body() body: { entries: RestrictionEntry[]; reason?: string },
    @CurrentUser() actor: JwtPayload,
    @Headers(HEADER_ON_BEHALF_OF) onBehalfOfHeader?: string,
    @Headers(HEADER_REASON) reasonHeader?: string,
  ) {
    if (!body || !Array.isArray(body.entries)) {
      throw new BadRequestException('Body requiere { entries: RestrictionEntry[] }')
    }

    // Mapeamos al shape de RateCalendarBulkEntry (rate undefined garantiza
    // que el bulkUpdate NO toca rates — solo restrictions).
    const entries: RateCalendarBulkEntry[] = body.entries.map((e) => ({
      ratePlanId: e.ratePlanId,
      date: e.date,
      // rate intencionalmente omitido
      ...(e.minStayArrival !== undefined ? { minStayArrival: e.minStayArrival } : {}),
      ...(e.minStayThrough !== undefined ? { minStayThrough: e.minStayThrough } : {}),
      ...(e.maxStay !== undefined ? { maxStay: e.maxStay } : {}),
      ...(e.closedToArrival !== undefined ? { closedToArrival: e.closedToArrival } : {}),
      ...(e.closedToDeparture !== undefined ? { closedToDeparture: e.closedToDeparture } : {}),
      ...(e.stopSell !== undefined ? { stopSell: e.stopSell } : {}),
    }))

    return this.rateCalendar.bulkUpdate(
      propertyId,
      entries,
      actor.sub,
      mapTierToSystemRole(actor.actorTier!),
      onBehalfOfHeader,
      reasonHeader ?? body.reason,
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
  throw new Error(`Tier ${tier} no permitido en Restrictions controller`)
}
