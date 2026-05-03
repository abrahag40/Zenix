import { Body, Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common'
import { HousekeepingRole, JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { Roles } from '../common/decorators/roles.decorator'
import { FeatureFlagsService } from './feature-flags.service'
import { UpsertFlagDto } from './dto/upsert-flag.dto'

/**
 * /v1/feature-flags — solo SUPERVISOR puede tocar flags.
 * Razón: un toggle de "test.alarm" en prod genera vibraciones reales en
 * teléfonos del staff. No es destructivo pero sí ruidoso. SUPERVISOR es
 * quien tiene la responsabilidad operativa.
 *
 * Lectura (GET) también requiere SUPERVISOR — los flags exponen detalles
 * de QA que no deben filtrarse a recepcionistas/housekeepers.
 */
@Controller('v1/feature-flags')
@Roles(HousekeepingRole.SUPERVISOR)
export class FeatureFlagsController {
  constructor(private readonly service: FeatureFlagsService) {}

  @Get()
  list() {
    return this.service.list()
  }

  @Get(':key/audit')
  audit(@Param('key') key: string, @Query('limit') limit?: string) {
    const n = limit ? Number.parseInt(limit, 10) : undefined
    return this.service.listAudit(key, Number.isFinite(n) ? n : undefined)
  }

  @Patch()
  upsert(@Body() dto: UpsertFlagDto, @CurrentUser() actor: JwtPayload) {
    return this.service.upsert(dto, actor)
  }

  @Delete(':key')
  remove(@Param('key') key: string, @CurrentUser() actor: JwtPayload) {
    return this.service.deleteFlag(key, actor)
  }
}
