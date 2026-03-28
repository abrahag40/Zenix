import { Module } from '@nestjs/common'
import { PropertiesController } from './properties.controller'
import { PropertiesService } from './properties.service'
import { TenantContextService } from '../common/tenant-context.service'

@Module({
  controllers: [PropertiesController],
  providers: [PropertiesService, TenantContextService],
  exports: [PropertiesService],
})
export class PropertiesModule {}
