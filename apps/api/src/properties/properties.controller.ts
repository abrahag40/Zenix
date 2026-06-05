import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { JwtPayload, StaffRole } from '@zenix/shared'
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

  /**
   * BUG #11 fix 2026-06-04 — scope filter por rol del actor.
   *
   * Antes: `findAll()` retornaba TODAS las properties de la organización al
   * usuario, ignorando su rol. RECEPTIONIST/HOUSEKEEPER de Property A veían
   * en SettingsScopeBanner la lista completa (Hotel A + Hotel B) — el banner
   * incluso renderizaba la primera alfabéticamente, no la activa, confundiendo
   * al usuario con "Editando Hotel B" cuando estaba en Hotel A.
   *
   * Ahora: usa `findMine(actor)` que filtra por rol:
   *   · SUPERVISOR: ve todas las properties de su organización
   *   · RECEPTIONIST/HOUSEKEEPER: ve solo su Property
   */
  @Get()
  findAll(@CurrentUser() actor: JwtPayload) {
    return this.service.findMine(actor)
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
