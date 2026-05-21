import { Global, Module } from '@nestjs/common'
import { DLCController } from './dlc.controller'
import { DLCService } from './dlc.service'
import { DLCArchiveScheduler } from './dlc-archive.scheduler'
import { DLCGuard } from './dlc.guard'

/**
 * DLCModule — gestión de suscripciones Add-On / DLC del tenant.
 *
 * @Global porque DLCService y DLCGuard se usan desde múltiples módulos
 * (Learning, futuros Booking Engine / POS / People). Mismo pattern que
 * AccessControlModule.
 *
 * DLCGuard NO se registra como APP_GUARD global — se aplica selectivamente
 * via @RequiresDLC en endpoints específicos. Esto preserva el principio
 * "feature flag opt-in": un endpoint sin marca no requiere DLC.
 *
 * Doc completo: docs/zenix-learning/14-dlc-architecture.md
 */
@Global()
@Module({
  controllers: [DLCController],
  providers: [DLCService, DLCArchiveScheduler, DLCGuard],
  exports: [DLCService, DLCGuard],
})
export class DLCModule {}
