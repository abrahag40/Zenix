/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 5.
 *
 * ChannexManagementModule — controllers + services para CRUD Channex desde Nova.
 *
 * Imports:
 *   · PrismaModule (write-through Zenix DB)
 *   · NovaModule (NovaActingOrgGuard, NovaTiersGuard, AccessControlService)
 *   · ChannexModule global (ChannexGateway disponible vía @Global)
 *
 * Days futuros agregan:
 *   · Day 6: RateCalendar controller + service
 *   · Day 7: Restrictions + Channels + Mappings controllers
 */
import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { TenantContextService } from '../../common/tenant-context.service'
import { AuditLogService } from '../audit/audit-log.service'
import { NovaModule } from '../nova.module'
import { ChannelPausesController } from './channel-pauses/channel-pauses.controller'
import { ChannelPausesService } from './channel-pauses/channel-pauses.service'
import { MappingsController } from './mappings/mappings.controller'
import { MappingsService } from './mappings/mappings.service'
import { RateCalendarController } from './rate-calendar/rate-calendar.controller'
import { RateCalendarService } from './rate-calendar/rate-calendar.service'
import { ChannexRatePlansController } from './rate-plans/rate-plans.controller'
import { ChannexRatePlansService } from './rate-plans/rate-plans.service'
import { RestrictionsController } from './restrictions/restrictions.controller'
import { ChannexRoomTypesController } from './room-types/room-types.controller'
import { ChannexRoomTypesService } from './room-types/room-types.service'

@Module({
  imports: [PrismaModule, NovaModule],
  controllers: [
    ChannexRoomTypesController,
    ChannexRatePlansController,
    RateCalendarController, // Day 6 — Rate Calendar Matrix
    RestrictionsController, // Day 7 — Restrictions dedicated tab
    ChannelPausesController, // Day 7 — Channel pause/unpause (Cloudbeds snooze pattern)
    MappingsController, // Day 7 — Room↔Channex mapping wizard
  ],
  providers: [
    // TenantContextService es app-level (registrado en app.module.ts) pero
    // NestJS DI es module-scoped — cada module que lo inyecta debe declararlo.
    // Pattern usado en blocks/checkouts/maintenance/rooms modules.
    TenantContextService,
    AuditLogService,
    ChannexRoomTypesService,
    ChannexRatePlansService,
    RateCalendarService,
    ChannelPausesService,
    MappingsService,
  ],
  exports: [AuditLogService],
})
export class ChannexManagementModule {}
