import { Module } from '@nestjs/common'
import { NotificationCenterService } from './notification-center.service'
import { NotificationCenterController } from './notification-center.controller'
import { NotificationPurgeScheduler } from './notification-purge.scheduler'
import { NotificationsModule } from '../notifications/notifications.module'
import { TenantContextService } from '../common/tenant-context.service'

@Module({
  imports: [NotificationsModule],
  providers: [
    NotificationCenterService,
    NotificationPurgeScheduler,
    TenantContextService,
  ],
  controllers: [NotificationCenterController],
  exports: [NotificationCenterService],
})
export class NotificationCenterModule {}
