import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { HousekeepingRole } from '@zenix/shared'
import { Roles } from '../common/decorators/roles.decorator'
import { TenantResource } from '../common/guards/tenant.guard'
import { UnitsService } from './units.service'
import { CreateUnitDto } from './dto/create-unit.dto'

@Controller()
export class UnitsController {
  constructor(private service: UnitsService) {}

  @Post('rooms/:roomId/units')
  @TenantResource({ model: 'room', paramName: 'roomId' })
  @Roles(HousekeepingRole.SUPERVISOR)
  create(@Param('roomId') roomId: string, @Body() dto: CreateUnitDto) {
    return this.service.create(roomId, dto)
  }

  @Get('rooms/:roomId/units')
  @TenantResource({ model: 'room', paramName: 'roomId' })
  findByRoom(@Param('roomId') roomId: string) {
    return this.service.findByRoom(roomId)
  }

  @Get('units/:id')
  @TenantResource({ model: 'unit', paramName: 'id' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Patch('units/:id')
  @TenantResource({ model: 'unit', paramName: 'id' })
  @Roles(HousekeepingRole.SUPERVISOR)
  update(@Param('id') id: string, @Body() dto: Partial<CreateUnitDto>) {
    return this.service.update(id, dto)
  }

  @Delete('units/:id')
  @TenantResource({ model: 'unit', paramName: 'id' })
  @Roles(HousekeepingRole.SUPERVISOR)
  remove(@Param('id') id: string) {
    return this.service.remove(id)
  }
}
