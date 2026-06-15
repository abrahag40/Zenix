import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { JwtPayload, StaffRole } from '@zenix/shared'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CashierShiftService } from './cashier-shift.service'
import { ListShiftsQueryDto, OpenShiftDto } from './dto/cashier-shift.dto'

/**
 * Caja / Turnos — Sprint CASH-DRAWER-REPORTS Sprint 1. RECEPTIONIST + SUPERVISOR
 * (el cajero opera su turno; el supervisor concilia + ve todos, S2/S3). El cierre,
 * arqueo, movimientos y spot-count llegan en sprints siguientes.
 */
@Controller('v1/cashier-shifts')
@Roles(StaffRole.RECEPTIONIST, StaffRole.SUPERVISOR)
export class CashierShiftController {
  constructor(private readonly service: CashierShiftService) {}

  /** POST /v1/cashier-shifts — abre turno (recibe + acepta fondo). */
  @Post()
  open(@Body() dto: OpenShiftDto, @CurrentUser() actor: JwtPayload) {
    return this.service.openShift(dto, actor)
  }

  /** GET /v1/cashier-shifts/current — turno activo del cajero (o null). */
  @Get('current')
  current(@CurrentUser() actor: JwtPayload) {
    return this.service.getCurrentShift(actor)
  }

  /** GET /v1/cashier-shifts — listado (cajero: propios; supervisor: todos). */
  @Get()
  list(@Query() query: ListShiftsQueryDto, @CurrentUser() actor: JwtPayload) {
    return this.service.listShifts(query, actor)
  }
}
