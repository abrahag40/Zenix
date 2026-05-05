/**
 * DashboardReportsController — endpoints consumed by the mobile dashboard.
 *
 * Both endpoints scoped to actor.propertyId (single-property views — chain
 * aggregation is V2.0). Both use JWT guard. Role gating happens inside the
 * services (defense in depth — a future SDK ever calling without the
 * controller would still be redacted/rejected).
 *
 * Routes (mounted under global `/v1` prefix):
 *   GET /v1/reports/dashboard-overview
 *   GET /v1/reports/revenue-snapshot
 */

import { Controller, Get, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import type { JwtPayload } from '@zenix/shared'
import { DashboardOverviewService } from './dashboard-overview.service'
import { RevenueReportService } from './revenue-report.service'

@UseGuards(JwtAuthGuard)
@Controller('v1/reports')
export class DashboardReportsController {
  constructor(
    private readonly overview: DashboardOverviewService,
    private readonly revenue: RevenueReportService,
  ) {}

  @Get('dashboard-overview')
  getDashboardOverview(@CurrentUser() user: JwtPayload) {
    return this.overview.getOverview(user.propertyId, user.role)
  }

  @Get('revenue-snapshot')
  getRevenueSnapshot(@CurrentUser() user: JwtPayload) {
    return this.revenue.getSnapshot(user.propertyId, user.role)
  }
}
