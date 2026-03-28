import { Module } from '@nestjs/common'
import { BedsController } from './beds.controller'
import { BedsService } from './beds.service'
import { TenantContextService } from '../common/tenant-context.service'

@Module({
  controllers: [BedsController],
  providers: [BedsService, TenantContextService],
  exports: [BedsService],
})
export class BedsModule {}
