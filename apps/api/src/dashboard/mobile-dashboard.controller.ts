import { Controller, Get, UseGuards, ForbiddenException } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { JwtPayload, StaffRole } from '@zenix/shared'
import { MobileDashboardService } from './mobile-dashboard.service'
import { TenantContextService } from '../common/tenant-context.service'

/**
 * MobileDashboardController — Etapa B §B1 del plan MOBILE-DASHBOARD.
 *
 * Single endpoint `/v1/dashboard/mobile` con shape role-aware. El backend
 * decide qué proyectar según `actor.role`. Frontend mobile usa un router
 * que renderea `SupervisorDashboard` o `ReceptionistDashboard` según el
 * `role` del response.
 *
 * HOUSEKEEPER no tiene snapshot aquí — usa /v1/housekeeping/my-day que ya
 * existe (Hub Recamarista §60 D18).
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/dashboard/mobile')
export class MobileDashboardController {
  constructor(
    private readonly service: MobileDashboardService,
    private readonly tenant: TenantContextService,
  ) {}

  @Get()
  async snapshot(@CurrentUser() user: JwtPayload) {
    const orgId = this.tenant.getOrganizationId()
    if (user.role === StaffRole.SUPERVISOR) {
      return this.service.getSupervisorSnapshot(user.propertyId, orgId, user.sub)
    }
    if (user.role === StaffRole.RECEPTIONIST) {
      return this.service.getReceptionistSnapshot(user.propertyId, orgId, user.sub)
    }
    if (user.role === StaffRole.HOUSEKEEPER) {
      throw new ForbiddenException(
        'HOUSEKEEPER usa el endpoint /v1/housekeeping/my-day (Hub Recamarista).',
      )
    }
    // Otros roles (futuro PLATFORM_ADMIN, PARTNER_MEMBER) reciben supervisor view
    return this.service.getSupervisorSnapshot(user.propertyId, orgId, user.sub)
  }
}
