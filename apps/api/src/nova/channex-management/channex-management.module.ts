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
import { AuditLogService } from '../audit/audit-log.service'
import { NovaModule } from '../nova.module'
import { RateCalendarController } from './rate-calendar/rate-calendar.controller'
import { RateCalendarService } from './rate-calendar/rate-calendar.service'
import { ChannexRatePlansController } from './rate-plans/rate-plans.controller'
import { ChannexRatePlansService } from './rate-plans/rate-plans.service'
import { ChannexRoomTypesController } from './room-types/room-types.controller'
import { ChannexRoomTypesService } from './room-types/room-types.service'

@Module({
  imports: [PrismaModule, NovaModule],
  controllers: [
    ChannexRoomTypesController,
    ChannexRatePlansController,
    RateCalendarController, // Day 6 — Rate Calendar Matrix
  ],
  providers: [
    AuditLogService,
    ChannexRoomTypesService,
    ChannexRatePlansService,
    RateCalendarService,
  ],
  exports: [AuditLogService],
})
export class ChannexManagementModule {}
