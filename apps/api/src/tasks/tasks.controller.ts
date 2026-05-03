import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { HousekeepingRole, JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { Roles } from '../common/decorators/roles.decorator'
import { TenantResource } from '../common/guards/tenant.guard'
import { TasksService } from './tasks.service'
import { AssignTaskDto, CreateTaskDto, EndTaskDto, QueryTaskDto } from './dto/create-task.dto'

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
}
