import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { LessonsService, UpsertProgressDto } from './lessons.service'

@Controller()
export class LessonsController {
  constructor(private readonly service: LessonsService) {}

  @Get('v1/learning/lessons/:id')
  getLesson(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.service.getLesson(id, actor)
  }

  @Post('v1/learning/lessons/:id/progress')
  trackProgress(
    @Param('id') lessonId: string,
    @Body() dto: Omit<UpsertProgressDto, 'lessonId'>,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.upsertProgress({ ...dto, lessonId }, actor)
  }
}
