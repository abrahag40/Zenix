import { Module } from '@nestjs/common'
import { DashboardController } from './dashboard.controller'
import { DashboardService } from './dashboard.service'
import { MobileDashboardController } from './mobile-dashboard.controller'
import { MobileDashboardService } from './mobile-dashboard.service'
import { PrismaModule } from '../prisma/prisma.module'
import { TenantContextService } from '../common/tenant-context.service'

@Module({
  imports: [PrismaModule],
  controllers: [DashboardController, MobileDashboardController],
  providers: [DashboardService, MobileDashboardService, TenantContextService],
})
export class DashboardModule {}
