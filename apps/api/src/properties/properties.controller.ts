import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { Roles } from '../common/decorators/roles.decorator'
import { StaffRole } from '@zenix/shared'
import { PropertiesService } from './properties.service'
import { CreatePropertyDto } from './dto/create-property.dto'

@Controller('properties')
export class PropertiesController {
  constructor(private service: PropertiesService) {}

  @Post()
  @Roles(StaffRole.SUPERVISOR)
  create(@Body() dto: CreatePropertyDto) {
    return this.service.create(dto)
  }

  @Get()
  findAll() {
    return this.service.findAll()
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Patch(':id')
  @Roles(StaffRole.SUPERVISOR)
  update(@Param('id') id: string, @Body() dto: Partial<CreatePropertyDto>) {
    return this.service.update(id, dto)
  }

  /**
   * Soft-delete con type-to-confirm.
   * Body: `{ confirmation: "<exact-property-name>" }` — backend valida.
   * Sin el header de confirmation o mismatch → 400.
   */
  @Delete(':id')
  @Roles(StaffRole.SUPERVISOR)
  remove(@Param('id') id: string, @Body() body?: { confirmation?: string }) {
    return this.service.remove(id, body?.confirmation)
  }
}
