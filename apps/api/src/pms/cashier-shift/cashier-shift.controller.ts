import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { JwtPayload, StaffRole } from '@zenix/shared'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CashierShiftService } from './cashier-shift.service'
import {
  AddCashMovementDto,
  CloseShiftDto,
  ListShiftsQueryDto,
  OpenShiftDto,
  ReconcileShiftDto,
  RecordSpotCountDto,
} from './dto/cashier-shift.dto'

/**
 * Caja / Turnos — Sprint CASH-DRAWER-REPORTS (S1 apertura + S2 cierre/arqueo).
 * RECEPTIONIST opera su turno; SUPERVISOR concilia, ve todos y hace el spot-count.
 * El reporte imprimible + export viven en S3.
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

  /** GET /v1/cashier-shifts/pending-handover — turno por recibir (gaveta compartida). */
  @Get('pending-handover')
  pendingHandover(@CurrentUser() actor: JwtPayload) {
    return this.service.getPendingHandover(actor)
  }

  /** GET /v1/cashier-shifts — listado (cajero: propios; supervisor: todos). */
  @Get()
  list(@Query() query: ListShiftsQueryDto, @CurrentUser() actor: JwtPayload) {
    return this.service.listShifts(query, actor)
  }

  /** POST /v1/cashier-shifts/:id/close — entrega/cierra el turno (conteo a ciegas). */
  @Post(':id/close')
  close(@Param('id') id: string, @Body() dto: CloseShiftDto, @CurrentUser() actor: JwtPayload) {
    return this.service.closeShift(id, dto, actor)
  }

  /** POST /v1/cashier-shifts/:id/reconcile — SUPERVISOR concilia turno fuera de tolerancia. */
  @Post(':id/reconcile')
  @Roles(StaffRole.SUPERVISOR)
  reconcile(@Param('id') id: string, @Body() dto: ReconcileShiftDto, @CurrentUser() actor: JwtPayload) {
    return this.service.reconcileShift(id, dto, actor)
  }

  /** POST /v1/cashier-shifts/:id/movements — movimiento de caja (paid-out, cambio, etc.). */
  @Post(':id/movements')
  addMovement(@Param('id') id: string, @Body() dto: AddCashMovementDto, @CurrentUser() actor: JwtPayload) {
    return this.service.addCashMovement(id, dto, actor)
  }

  /** GET /v1/cashier-shifts/:id/spot-count — SUPERVISOR: esperado del turno activo (read-only). */
  @Get(':id/spot-count')
  @Roles(StaffRole.SUPERVISOR)
  spotCount(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.service.getSpotCount(id, actor)
  }

  /** POST /v1/cashier-shifts/:id/spot-count — SUPERVISOR registra su conteo a mitad de turno. */
  @Post(':id/spot-count')
  @Roles(StaffRole.SUPERVISOR)
  recordSpotCount(@Param('id') id: string, @Body() dto: RecordSpotCountDto, @CurrentUser() actor: JwtPayload) {
    return this.service.recordSpotCount(id, dto, actor)
  }
}
