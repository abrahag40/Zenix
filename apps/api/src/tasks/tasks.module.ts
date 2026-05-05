import { Module } from '@nestjs/common'
import { TasksController } from './tasks.controller'
import { TasksService } from './tasks.service'
import { TestAlarmScheduler } from './test-alarm.scheduler'
import { DeferRetryScheduler } from './defer-retry.scheduler'
import { NotificationsModule } from '../notifications/notifications.module'
import { TenantContextService } from '../common/tenant-context.service'
import { StaffGamificationModule } from '../staff-gamification/staff-gamification.module'
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module'

@Module({
  imports: [NotificationsModule, StaffGamificationModule, FeatureFlagsModule],
  controllers: [TasksController],
  providers: [TasksService, TestAlarmScheduler, DeferRetryScheduler, TenantContextService],
  exports: [TasksService],
})
export class TasksModule {}
