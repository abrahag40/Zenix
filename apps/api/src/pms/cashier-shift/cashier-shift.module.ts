import { Module } from '@nestjs/common'
import { TenantContextService } from '../../common/tenant-context.service'
import { CashierShiftService } from './cashier-shift.service'
import { CashierShiftController } from './cashier-shift.controller'
import { CashReportController } from './cash-report.controller'

/**
 * CashierShiftModule — Sprint CASH-DRAWER-REPORTS. PrismaService es global.
 * Exporta CashierShiftService para que GuestStaysModule ligue los pagos en
 * efectivo al turno abierto (D-CASH14, link best-effort tras la bandera).
 */
@Module({
  providers: [CashierShiftService, TenantContextService],
  controllers: [CashierShiftController, CashReportController],
  exports: [CashierShiftService],
})
export class CashierShiftModule {}
