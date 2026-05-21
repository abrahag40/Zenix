import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { EnrollmentsService, CreateEnrollmentDto } from './enrollments.service'

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
}
