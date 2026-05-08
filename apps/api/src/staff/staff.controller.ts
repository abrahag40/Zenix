import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { StaffRole, JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { Roles } from '../common/decorators/roles.decorator'
import { TenantResource } from '../common/guards/tenant.guard'
import { StaffService } from './staff.service'
import { CreateStaffDto, UpdateStaffDto } from './dto/create-staff.dto'

@Controller('staff')
export class StaffController {
  constructor(private service: StaffService) {}

  @Post()
  @Roles(StaffRole.SUPERVISOR)
  create(@Body() dto: CreateStaffDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor)
  }

  @Get()
  findAll(@CurrentUser() actor: JwtPayload) {
    return this.service.findAll(actor.propertyId)
  }

  @Get(':id')
  @TenantResource({ model: 'staff', paramName: 'id' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Patch(':id')
  @TenantResource({ model: 'staff', paramName: 'id' })
  @Roles(StaffRole.SUPERVISOR)
  update(@Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.service.update(id, dto)
  }

  @Delete(':id')
  @TenantResource({ model: 'staff', paramName: 'id' })
  @Roles(StaffRole.SUPERVISOR)
  remove(@Param('id') id: string) {
    return this.service.remove(id)
  }
}
