import { Module } from '@nestjs/common'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'
import { MetricsModule } from '../pms/metrics/metrics.module'
import { ReportGenerationService } from './report-generation.service'
import { ScheduledReportsController } from './scheduled/scheduled-reports.controller'
import { ScheduledReportsService } from './scheduled/scheduled-reports.service'
import { ScheduledReportEmailService } from './scheduled/scheduled-report-email.service'
import { ScheduledReportsScheduler } from './scheduled/scheduled-reports.scheduler'

@Module({
  imports: [MetricsModule],
  controllers: [ReportsController, ScheduledReportsController],
  providers: [
    ReportsService,
    ReportGenerationService,
    ScheduledReportsService,
    ScheduledReportEmailService,
    ScheduledReportsScheduler,
  ],
})
export class ReportsModule {}
