import { Module } from '@nestjs/common'
import { DashboardReportsController } from './dashboard-reports.controller'
import { DashboardOverviewService } from './dashboard-overview.service'
import { RevenueReportService } from './revenue-report.service'

@Module({
  controllers: [DashboardReportsController],
  providers: [DashboardOverviewService, RevenueReportService],
  exports: [DashboardOverviewService, RevenueReportService],
})
export class DashboardReportsModule {}
