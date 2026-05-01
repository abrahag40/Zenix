import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { HousekeepingRole, JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { Roles } from '../common/decorators/roles.decorator'
import { ShiftsService } from './shifts/shifts.service'
import { CoverageService } from './coverage/coverage.service'
import { ClockService } from './clock/clock.service'
import { AvailabilityQueryService } from './availability-query.service'
import {
  CreateShiftDto,
  UpdateShiftDto,
  CreateShiftExceptionDto,
  CreateAbsenceDto,
} from './shifts/dto/shift.dto'
import { CreateCoverageDto, UpdateCoverageDto } from './coverage/dto/coverage.dto'
import { ClockInDto, ClockOutDto } from './clock/dto/clock.dto'
import { AssignmentService } from '../assignment/assignment.service'
import { MorningRosterScheduler } from './morning-roster.scheduler'

@Controller('v1/scheduling')
export class SchedulingController {
  constructor(
    private shifts: ShiftsService,
    private coverage: CoverageService,
    private clock: ClockService,
    private availability: AvailabilityQueryService,
    private assignment: AssignmentService,
    private roster: MorningRosterScheduler,
  ) {}

  // ── On-shift query ───────────────────────────────────────────────────────

  @Get('on-shift')
  async getOnShift(@CurrentUser() user: JwtPayload, @Query('at') at?: string) {
    const instant = at ? new Date(at) : new Date()
    return this.availability.getOnShiftStaff(user.propertyId, instant)
  }

  // ── Shifts ───────────────────────────────────────────────────────────────

  @Get('shifts')
  listShifts(@CurrentUser() user: JwtPayload) {
    return this.shifts.listShifts(user.propertyId)
  }

  @Post('shifts')
  @Roles(HousekeepingRole.SUPERVISOR)
  createShift(@CurrentUser() user: JwtPayload, @Body() dto: CreateShiftDto) {
    return this.shifts.createShift(user.propertyId, dto)
  }

  @Patch('shifts/:id')
  @Roles(HousekeepingRole.SUPERVISOR)
  updateShift(@Param('id') id: string, @Body() dto: UpdateShiftDto) {
    return this.shifts.updateShift(id, dto)
  }

  @Delete('shifts/:id')
  @Roles(HousekeepingRole.SUPERVISOR)
  deleteShift(@Param('id') id: string) {
    return this.shifts.deleteShift(id)
  }

  // ── Shift exceptions ─────────────────────────────────────────────────────

  @Get('exceptions')
  listExceptions(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.shifts.listExceptions(user.propertyId, from, to)
  }

  @Post('exceptions')
  @Roles(HousekeepingRole.SUPERVISOR)
  createException(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateShiftExceptionDto,
  ) {
    return this.shifts.createException(user.propertyId, dto, user.sub)
  }

  /**
   * Marcar ausencia (D5) — atajo desde recepción/supervisor.
   * Crea StaffShiftException(OFF) y dispara reasignación de tareas no iniciadas.
   * NO cancela tareas IN_PROGRESS (D11).
   */
  @Post('absences')
  @Roles(HousekeepingRole.SUPERVISOR, HousekeepingRole.RECEPTIONIST)
  async markAbsence(@CurrentUser() user: JwtPayload, @Body() dto: CreateAbsenceDto) {
    const exception = await this.shifts.markAbsence(user.propertyId, dto, user.sub)
    // Reasignar las tareas elegibles del día — fire-and-forget para no bloquear.
    void this.assignment
      .reassignTasksForAbsence(dto.staffId, user.propertyId)
      .catch(() => undefined)
    return exception
  }

  @Delete('exceptions/:id')
  @Roles(HousekeepingRole.SUPERVISOR)
  deleteException(@Param('id') id: string) {
    return this.shifts.deleteException(id)
  }

  // ── Coverage ─────────────────────────────────────────────────────────────

  @Get('coverage')
  listCoverage(@CurrentUser() user: JwtPayload) {
    return this.coverage.list(user.propertyId)
  }

  @Get('coverage/room/:roomId')
  listCoverageForRoom(@Param('roomId') roomId: string) {
    return this.coverage.listForRoom(roomId)
  }

  @Get('coverage/staff/:staffId')
  listCoverageForStaff(@Param('staffId') staffId: string) {
    return this.coverage.listForStaff(staffId)
  }

  @Post('coverage')
  @Roles(HousekeepingRole.SUPERVISOR)
  createCoverage(@CurrentUser() user: JwtPayload, @Body() dto: CreateCoverageDto) {
    return this.coverage.create(user.propertyId, dto)
  }

  @Patch('coverage/:id')
  @Roles(HousekeepingRole.SUPERVISOR)
  updateCoverage(@Param('id') id: string, @Body() dto: UpdateCoverageDto) {
    return this.coverage.update(id, dto)
  }

  @Delete('coverage/:id')
  @Roles(HousekeepingRole.SUPERVISOR)
  deleteCoverage(@Param('id') id: string) {
    return this.coverage.remove(id)
  }

  // ── Clock-in / out ───────────────────────────────────────────────────────

  @Post('clock/in')
  clockIn(@CurrentUser() user: JwtPayload, @Body() dto: ClockInDto) {
    return this.clock.clockIn(user.sub, user.propertyId, dto)
  }

  @Post('clock/out')
  clockOut(@CurrentUser() user: JwtPayload, @Body() dto: ClockOutDto) {
    return this.clock.clockOut(user.sub, dto)
  }

  @Get('clock/me')
  getMyOpenShift(@CurrentUser() user: JwtPayload) {
    return this.clock.getOpenShift(user.sub)
  }

  @Get('clock/staff/:staffId')
  @Roles(HousekeepingRole.SUPERVISOR)
  listClocksForStaff(
    @Param('staffId') staffId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.clock.listForStaff(staffId, from, to)
  }

  // ── Manual roster trigger ────────────────────────────────────────────────
  // Útil para testing y disaster recovery (servidor caído durante el cron 7am).

  @Post('run-roster')
  @Roles(HousekeepingRole.SUPERVISOR)
  async runRoster(@CurrentUser() user: JwtPayload) {
    return this.roster.runForProperty(user.propertyId, { force: true })
  }
}
