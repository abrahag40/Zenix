import { Module } from '@nestjs/common'
import { DashboardController } from './dashboard.controller'
import { DashboardService } from './dashboard.service'
import { PrismaModule } from '../prisma/prisma.module'
import { TenantContextService } from '../common/tenant-context.service'

@Module({
  imports: [PrismaModule],
  controllers: [DashboardController],
  providers: [DashboardService, TenantContextService],
})
export class DashboardModule {}
