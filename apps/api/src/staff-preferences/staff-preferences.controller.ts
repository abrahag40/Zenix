import { Body, Controller, Get, Param, Patch } from '@nestjs/common'
import { HousekeepingRole, JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { Roles } from '../common/decorators/roles.decorator'
import { StaffPreferencesService } from './staff-preferences.service'
import { UpdateStaffPreferencesDto } from './dto/staff-preferences.dto'

@Controller('v1/staff/:id/preferences')
export class StaffPreferencesController {
  constructor(private service: StaffPreferencesService) {}

  @Get()
  get(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.getForStaff(id, {
      staffId: user.sub,
      role: user.role,
      propertyId: user.propertyId,
    })
  }

  @Patch()
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStaffPreferencesDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, dto, {
      staffId: user.sub,
      role: user.role,
      propertyId: user.propertyId,
    })
  }

  @Get('log')
  @Roles(HousekeepingRole.SUPERVISOR)
  getLog(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.getLog(id, {
      staffId: user.sub,
      role: user.role,
      propertyId: user.propertyId,
    })
  }
}
