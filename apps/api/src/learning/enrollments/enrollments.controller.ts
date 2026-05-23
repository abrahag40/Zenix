import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { DLCGuard } from '../../dlc/dlc.guard'
import { RequiresDLC } from '../../dlc/requires-dlc.decorator'
import { EnrollmentsService, CreateEnrollmentDto } from './enrollments.service'

@UseGuards(DLCGuard)
@RequiresDLC('LEARNING_CORE')
@Controller()
export class EnrollmentsController {
  constructor(private readonly service: EnrollmentsService) {}

  @Post('v1/learning/enrollments')
  create(@Body() dto: CreateEnrollmentDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor)
  }

  @Patch('v1/learning/enrollments/:id/start')
  start(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.service.start(id, actor)
  }

  @Get('v1/learning/enrollments')
  listMine(@Query('staffId') staffId: string | undefined, @CurrentUser() actor: JwtPayload) {
    return this.service.listForStaff(staffId ?? actor.sub, actor)
  }

  /**
   * Manager dashboard — todos los enrollments del scope del actor.
   * §multi-tenant: respeta scope BRAND/LEGAL_ENTITY/PROPERTY del JWT.
   */
  @Get('v1/learning/manager/enrollments')
  listForManagerScope(
    @CurrentUser() actor: JwtPayload,
    @Query('courseId') courseId?: string,
    @Query('overdue') overdue?: string,
  ) {
    return this.service.listForActorScope(actor, {
      courseId,
      overdue: overdue === 'true',
    })
  }
}
