/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 13.
 *
 * GET /v1/nova/audit-logs            — list con filtros + cursor pagination
 * GET /v1/nova/audit-logs/actions    — distinct actions del acting org (filter dropdown)
 * GET /v1/nova/audit-logs/:id        — detail con payload completo
 *
 * RBAC: PLATFORM_ADMIN + PARTNER_ADMIN + PARTNER_MEMBER + ORG_OWNER.
 * ORG_STAFF NO — el cliente recepcionista no debería ver el audit log
 * cross-acción (su propio acceso es vía Notificaciones individuales).
 */
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { NovaActingOrgGuard, RequireActingOrg } from '../guards/nova-acting-org.guard'
import { NovaTiers, NovaTiersGuard } from '../guards/nova-tiers.guard'
import { AuditLogQueryService } from './audit-log-query.service'

@Controller('v1/nova/audit-logs')
@UseGuards(AuthGuard('jwt'), NovaTiersGuard, NovaActingOrgGuard)
@NovaTiers('PLATFORM', 'PARTNER_ADMIN', 'PARTNER_MEMBER', 'ORG_OWNER')
@RequireActingOrg()
export class AuditLogController {
  constructor(private readonly service: AuditLogQueryService) {}

  @Get()
  async list(
    @Query('action') action?: string,
    @Query('actorRealId') actorRealId?: string,
    @Query('status') status?: 'SUCCESS' | 'FAILURE' | 'PARTIAL',
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list({
      action,
      actorRealId,
      status,
      dateFrom,
      dateTo,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    })
  }

  @Get('actions')
  async listAvailableActions() {
    return { actions: await this.service.listAvailableActions() }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.service.findById(id)
  }
}
