import { Module } from '@nestjs/common'
import { UnitsController } from './units.controller'
import { UnitsService } from './units.service'
import { TenantContextService } from '../common/tenant-context.service'

@Module({
  controllers: [UnitsController],
  providers: [UnitsService, TenantContextService],
  exports: [UnitsService],
})
export class UnitsModule {}
