import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { JwtPayload } from '@zenix/shared'
import { SettingsService } from './settings.service'
import { UpdateSettingsDto } from './dto/update-settings.dto'

@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private service: SettingsService) {}

  @Get()
  find(@CurrentUser() user: JwtPayload) {
    return this.service.findByProperty(user.propertyId)
  }

  @Patch()
  update(@CurrentUser() user: JwtPayload, @Body() dto: UpdateSettingsDto) {
    return this.service.update(user.propertyId, dto)
  }

  /**
   * Sprint PAC-CLIENT-WARNING (2026-05-29).
   * GET /v1/settings/legal-entity-status
   *
   * Retorna el estado del PAC del LegalEntity asociado al property activo.
   * El frontend usa esto para renderizar banner sticky + tooltip CFDI.
   * Endpoint específico (no flatten en /settings) porque el shape es
   * legalEntity-scope, no property-scope.
   */
  @Get('legal-entity-status')
  legalEntityStatus(@CurrentUser() user: JwtPayload) {
    return this.service.getLegalEntityStatus(user.propertyId)
  }
}
