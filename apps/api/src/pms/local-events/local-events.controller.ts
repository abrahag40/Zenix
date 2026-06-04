import { Controller, Get, Param, Query } from '@nestjs/common'
import { StaffRole } from '@zenix/shared'
import { Roles } from '../../common/decorators/roles.decorator'
import { LocalEventsService } from './local-events.service'

/**
 * LocalEvents — eventos aplicables a esta property (D-COMPSET8). Visibilidad
 * SUPERVISOR-only por ahora (datos no-PII pero entrelazados con compset card).
 *
 * Admin endpoints para el Events Curator (D-COMPSET9) viven aparte en
 * `/v1/admin/local-events` (no incluido en chunk 1).
 */
@Controller('v1/properties/:propertyId/local-events')
@Roles(StaffRole.SUPERVISOR)
export class LocalEventsController {
  constructor(private readonly service: LocalEventsService) {}

  @Get()
  list(
    @Param('propertyId') propertyId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.findEventsForProperty(propertyId, new Date(from), new Date(to))
  }
}
