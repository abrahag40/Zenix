import { Controller, Get, NotFoundException, Param, Post } from '@nestjs/common'
import { JwtPayload, StaffRole } from '@zenix/shared'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { Roles } from '../../../common/decorators/roles.decorator'
import { PrismaService } from '../../../prisma/prisma.service'
import { ChannexAdminService } from './channex-admin.service'
import { ChannexFullSyncOrchestrator } from './channex-full-sync.orchestrator'

/**
 * Channex full-sync — manual trigger endpoint.
 *
 * SUPERVISOR-only. Útil cuando:
 *   · Onboarding: primer activación de Channex de una property nueva
 *   · Drift recovery: detectaste diff entre Zenix y OTAs y quieres re-baseline
 *   · QA: validar el sync flujo antes de Stage 4 cert
 *
 * Salta las guards de window/24h (manager sabe lo que hace). Pero MARCA
 * `channexLastFullSyncAt` igual — el cron NO re-dispara en las próximas
 * 24h después de un manual run.
 *
 * Audit: cada manual trigger queda registrado vía CurrentUser (actor.sub).
 * Log structured con actorId — visible en /settings/channex (Day 6).
 */
@Controller('v1/admin/channex')
@Roles(StaffRole.SUPERVISOR)
export class ChannexFullSyncController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: ChannexFullSyncOrchestrator,
    private readonly admin: ChannexAdminService,
  ) {}

  /**
   * GET /v1/admin/channex/status/:propertyId
   * Observability snapshot — usado por /settings/channex admin UI y por
   * el cert Stage 4 reviewer durante el live screenshare.
   */
  @Get('status/:propertyId')
  async getStatus(@Param('propertyId') propertyId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    })
    if (!property) {
      throw new NotFoundException(`Property ${propertyId} not found`)
    }
    return this.admin.getStatus(propertyId)
  }

  @Post('full-sync/:propertyId')
  async triggerFullSync(
    @Param('propertyId') propertyId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    // Defense in depth: verify property belongs to actor's org (TenantGuard
    // already does this via JWT scope, but explicit check protects against
    // misconfigured guard chains).
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, organizationId: true },
    })
    if (!property) {
      throw new NotFoundException(`Property ${propertyId} not found`)
    }

    const outcome = await this.orchestrator.runForProperty(propertyId, { manual: true })

    return {
      propertyId,
      actor: actor.sub,
      triggeredAt: new Date().toISOString(),
      outcome,
    }
  }
}
