import { Module } from '@nestjs/common'
import { RatesService } from './rates.service'
import { RatesController } from './rates.controller'
import { FxService } from './fx.service'
import { FxController } from './fx.controller'
import { TenantContextService } from '../../common/tenant-context.service'
import { AuditLogService } from '../../nova/audit/audit-log.service'

@Module({
  providers: [RatesService, FxService, TenantContextService, AuditLogService],
  controllers: [RatesController, FxController],
  exports: [RatesService, FxService],
})
export class RatesModule {}
