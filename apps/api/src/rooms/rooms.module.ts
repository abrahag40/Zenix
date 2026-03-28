import { Module } from '@nestjs/common'
import { RoomsController } from './rooms.controller'
import { RoomsService } from './rooms.service'
import { TenantContextService } from '../common/tenant-context.service'

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, TenantContextService],
  exports: [RoomsService],
})
export class RoomsModule {}
