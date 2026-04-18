import { Controller, Get, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { JwtPayload } from '@housekeeping/shared'
import { DashboardService } from './dashboard.service'

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('overview')
  overview(@CurrentUser() user: JwtPayload) {
    return this.service.getOverview(user.propertyId)
  }
}
