import { Module } from '@nestjs/common'
import { CheckoutsController } from './checkouts.controller'
import { CheckoutsService } from './checkouts.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { AssignmentModule } from '../assignment/assignment.module'
import { TenantContextService } from '../common/tenant-context.service'

@Module({
  imports: [NotificationsModule, AssignmentModule],
  controllers: [CheckoutsController],
  providers: [CheckoutsService, TenantContextService],
  exports: [CheckoutsService],
})
export class CheckoutsModule {}
