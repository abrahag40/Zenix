import { Module } from '@nestjs/common'
import { StaffController } from './staff.controller'
import { StaffService } from './staff.service'
import { TenantContextService } from '../common/tenant-context.service'

@Module({
  controllers: [StaffController],
  providers: [StaffService, TenantContextService],
  exports: [StaffService],
})
export class StaffModule {}
