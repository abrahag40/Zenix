/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 9.
 *
 * GET /v1/nova/clients — devuelve orgs accesibles al actor según su tier.
 * No requiere X-Acting-Organization-Id (es justamente el endpoint que se
 * consulta ANTES de seleccionar la org).
 *
 * NovaTiers filter: ORG_STAFF excluido (no debería ver Nova).
 */
import { Controller, Get, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import type { JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { NovaTiers, NovaTiersGuard } from '../guards/nova-tiers.guard'
import { NovaClientsService } from './clients.service'

@Controller('v1/nova/clients')
@UseGuards(AuthGuard('jwt'), NovaTiersGuard)
@NovaTiers('PLATFORM', 'PARTNER_ADMIN', 'PARTNER_MEMBER', 'ORG_OWNER')
export class NovaClientsController {
  constructor(private readonly service: NovaClientsService) {}

  @Get()
  async list(@CurrentUser() actor: JwtPayload) {
    return this.service.listAccessibleClients({
      actorTier: actor.actorTier!,
      actorId: actor.sub,
      partnerMemberId: actor.partnerMemberId,
      organizationId: actor.organizationId || undefined,
      assignedOrgIds: actor.assignedOrgIds ?? null,
    })
  }
}
