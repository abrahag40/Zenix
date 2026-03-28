import { Module } from '@nestjs/common'
import { TasksController } from './tasks.controller'
import { TasksService } from './tasks.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { TenantContextService } from '../common/tenant-context.service'

@Module({
  imports: [NotificationsModule],
  controllers: [TasksController],
  providers: [TasksService, TenantContextService],
  exports: [TasksService],
})
export class TasksModule {}
