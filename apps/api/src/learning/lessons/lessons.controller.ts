import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { DLCGuard } from '../../dlc/dlc.guard'
import { RequiresDLC } from '../../dlc/requires-dlc.decorator'
import { LessonsService, UpsertProgressDto } from './lessons.service'

@UseGuards(DLCGuard)
@RequiresDLC('LEARNING_CORE')
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
