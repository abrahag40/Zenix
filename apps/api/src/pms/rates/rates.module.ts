import { Module } from '@nestjs/common'
import { RatesService } from './rates.service'
import { RatesController } from './rates.controller'
import { FxService } from './fx.service'
import { FxController } from './fx.controller'
import { TenantContextService } from '../../common/tenant-context.service'
import { AuditLogService } from '../../nova/audit/audit-log.service'
// El control de publicación fiscal vive con los precios, pero su lógica es del
// motor público: se IMPORTA, no se copia. Sin ciclo: public-booking no conoce
// a rates.
import { PublicBookingModule } from '../../public-booking/public-booking.module'

@Module({
  imports: [PublicBookingModule],
  providers: [RatesService, FxService, TenantContextService, AuditLogService],
  controllers: [RatesController, FxController],
  exports: [RatesService, FxService],
})
export class RatesModule {}
