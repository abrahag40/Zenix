import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { DLCCode } from '@prisma/client'
import { JwtPayload, StaffRole } from '@zenix/shared'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { Roles } from '../common/decorators/roles.decorator'
import { DLCService, ActivateDLCDto } from './dlc.service'

/**
 * DLCController — gestión de suscripciones DLC del tenant.
 * Endpoints mounted at `/v1/dlc/*`.
 *
 * Auth: SUPERVISOR puede activar/cancelar. Stripe webhooks llegarán a un
 * endpoint público específico en Fase 1.4 PAY-CORE (no aquí).
 */
@Controller('v1/dlc')
export class DLCController {
  constructor(private readonly service: DLCService) {}

  @Get()
  listMine(@CurrentUser() actor: JwtPayload) {
    return this.service.listForOrganization(actor.organizationId)
  }

  @Get(':dlcCode')
  getOne(@Param('dlcCode') dlcCode: DLCCode, @CurrentUser() actor: JwtPayload) {
    return this.service.getStatus(actor.organizationId, dlcCode)
  }

  @Post('activate')
  @Roles(StaffRole.SUPERVISOR)
  activate(@Body() dto: ActivateDLCDto, @CurrentUser() actor: JwtPayload) {
    return this.service.activate(actor.organizationId, dto, actor)
  }

  @Post(':dlcCode/cancel')
  @Roles(StaffRole.SUPERVISOR)
  cancel(
    @Param('dlcCode') dlcCode: DLCCode,
    @Body() body: { reason: string },
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.cancelByCustomer(
      actor.organizationId,
      dlcCode,
      body.reason ?? 'No reason provided',
      actor,
    )
  }
}
