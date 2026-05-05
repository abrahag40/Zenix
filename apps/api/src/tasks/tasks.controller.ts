import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { CleaningDeferReason, HousekeepingRole, JwtPayload } from '@zenix/shared'
import { IsEnum, IsISO8601, IsNumber, IsOptional, IsPositive, IsString, MaxLength, MinLength } from 'class-validator'
import { Type } from 'class-transformer'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { Roles } from '../common/decorators/roles.decorator'
import { TenantResource } from '../common/guards/tenant.guard'
import { TasksService } from './tasks.service'
import { AssignTaskDto, CreateTaskDto, EndTaskDto, QueryTaskDto } from './dto/create-task.dto'

class DeferTaskDto {
  @IsEnum(CleaningDeferReason)
  reason!: CleaningDeferReason
}

class HoldCleaningDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason!: string
}

class WalkInDto {
  @IsString() @MinLength(1) roomId!: string
  @IsOptional() @IsString() unitId?: string
  @IsString() @MinLength(2) @MaxLength(120) guestName!: string
  @IsNumber() @IsPositive() @Type(() => Number) ratePerNight!: number
  @IsString() @MinLength(3) @MaxLength(3) currency!: string
  @IsISO8601() scheduledCheckout!: string
  @IsOptional() @IsNumber() @IsPositive() @Type(() => Number) paxCount?: number
}

@Controller('tasks')
export class TasksController {
  constructor(private service: TasksService) {}

  @Post()
  @Roles(HousekeepingRole.SUPERVISOR)
  create(@Body() dto: CreateTaskDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor)
  }

  @Get()
  findAll(@Query() query: QueryTaskDto, @CurrentUser() actor: JwtPayload) {
    return this.service.findAll(query, actor)
  }

  @Get(':id')
  @TenantResource({ model: 'cleaningTask', paramName: 'id' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Patch(':id/start')
  @TenantResource({ model: 'cleaningTask', paramName: 'id' })
  start(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.service.startTask(id, actor)
  }

  @Patch(':id/end')
  @TenantResource({ model: 'cleaningTask', paramName: 'id' })
  end(
    @Param('id') id: string,
    @Body() dto: EndTaskDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.endTask(id, actor, dto)
  }

  @Patch(':id/pause')
  @TenantResource({ model: 'cleaningTask', paramName: 'id' })
  pause(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.service.pauseTask(id, actor)
  }

  @Patch(':id/resume')
  @TenantResource({ model: 'cleaningTask', paramName: 'id' })
  resume(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.service.resumeTask(id, actor)
  }

  @Patch(':id/verify')
  @TenantResource({ model: 'cleaningTask', paramName: 'id' })
  @Roles(HousekeepingRole.SUPERVISOR, HousekeepingRole.RECEPTIONIST)
  verify(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.service.verifyTask(id, actor)
  }

  @Patch(':id/assign')
  @TenantResource({ model: 'cleaningTask', paramName: 'id' })
  @Roles(HousekeepingRole.SUPERVISOR)
  assign(@Param('id') id: string, @Body() dto: AssignTaskDto, @CurrentUser() actor: JwtPayload) {
    return this.service.assignTask(id, dto, actor)
  }

  /**
   * EC-6 — Skip-and-retry. Housekeeper o supervisor difieren la tarea.
   * Body: { reason: 'DND_PHYSICAL' | 'NO_ANSWER' | 'GUEST_REQUEST' }
   */
  @Post(':id/defer')
  @TenantResource({ model: 'cleaningTask', paramName: 'id' })
  defer(
    @Param('id') id: string,
    @Body() dto: DeferTaskDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.deferTask(id, dto.reason, actor)
  }

  // ── D15 — Operational overrides (Ajustes del día) ──────────────────────────

  @Post(':id/force-urgent')
  @TenantResource({ model: 'cleaningTask', paramName: 'id' })
  @Roles(HousekeepingRole.SUPERVISOR, HousekeepingRole.RECEPTIONIST)
  forceUrgent(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.service.forceUrgent(id, actor)
  }

  @Post(':id/toggle-deep-clean')
  @TenantResource({ model: 'cleaningTask', paramName: 'id' })
  @Roles(HousekeepingRole.SUPERVISOR, HousekeepingRole.RECEPTIONIST)
  toggleDeepClean(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.service.toggleDeepClean(id, actor)
  }

  @Post(':id/hold')
  @TenantResource({ model: 'cleaningTask', paramName: 'id' })
  @Roles(HousekeepingRole.SUPERVISOR, HousekeepingRole.RECEPTIONIST)
  hold(
    @Param('id') id: string,
    @Body() dto: HoldCleaningDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.holdCleaning(id, dto.reason, actor)
  }

  @Post(':id/release-hold')
  @TenantResource({ model: 'cleaningTask', paramName: 'id' })
  @Roles(HousekeepingRole.SUPERVISOR, HousekeepingRole.RECEPTIONIST)
  releaseHold(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.service.releaseHold(id, actor)
  }

  /** D15 — Walk-in checkout. Crea GuestStay + CleaningTask atómicamente. */
  @Post('walk-in')
  @Roles(HousekeepingRole.SUPERVISOR, HousekeepingRole.RECEPTIONIST)
  walkIn(@Body() dto: WalkInDto, @CurrentUser() actor: JwtPayload) {
    return this.service.createWalkIn(
      {
        roomId: dto.roomId,
        unitId: dto.unitId,
        guestName: dto.guestName,
        ratePerNight: dto.ratePerNight,
        currency: dto.currency,
        scheduledCheckout: new Date(dto.scheduledCheckout),
        paxCount: dto.paxCount,
      },
      actor,
    )
  }
}
