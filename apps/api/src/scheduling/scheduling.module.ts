import { Module, forwardRef } from '@nestjs/common'
import { SchedulingController } from './scheduling.controller'
import { ShiftsService } from './shifts/shifts.service'
import { CoverageService } from './coverage/coverage.service'
import { ClockService } from './clock/clock.service'
import { AvailabilityQueryService } from './availability-query.service'
import { MorningRosterScheduler } from './morning-roster.scheduler'
import { StayoverScheduler } from './stayover.scheduler'
import { BookingSameDayListener } from './listeners/booking-same-day.listener'
import { RoomMovedHkListener } from './listeners/room-moved-hk.listener'
import { TenantContextService } from '../common/tenant-context.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { AssignmentModule } from '../assignment/assignment.module'

/**
 * SchedulingModule — fuente de verdad de turnos, cobertura, clock-in/out, y
 * el roster matutino. Otros módulos (Checkouts, GuestStays, StayJourneys)
 * lo consumen para auto-asignar tareas vía AssignmentService.
 *
 * Importa NotificationsModule (SSE/Push) y forwardRef AssignmentModule
 * (AssignmentModule importa SchedulingModule.AvailabilityQueryService;
 * SchedulingController consume AssignmentService → ciclo).
 */
@Module({
  imports: [NotificationsModule, forwardRef(() => AssignmentModule)],
  controllers: [SchedulingController],
  providers: [
    ShiftsService,
    CoverageService,
    ClockService,
    AvailabilityQueryService,
    MorningRosterScheduler,
    StayoverScheduler,
    TenantContextService,
    // Etapa A — fix gap HK ↔ Channex (MOBILE-DASHBOARD plan §A1+§A2)
    BookingSameDayListener,
    RoomMovedHkListener,
  ],
  exports: [
    AvailabilityQueryService,
    ShiftsService,
    CoverageService,
    ClockService,
    MorningRosterScheduler,
    StayoverScheduler,
  ],
})
export class SchedulingModule {}
