import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common'
import { JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { DLCGuard } from '../../dlc/dlc.guard'
import { RequiresDLC } from '../../dlc/requires-dlc.decorator'
import { AttemptsService, StartAttemptDto, SubmitAttemptDto } from './attempts.service'

@UseGuards(DLCGuard)
@RequiresDLC('LEARNING_CORE')
@Controller()
export class AttemptsController {
  constructor(private readonly service: AttemptsService) {}

  @Post('v1/learning/attempts')
  start(@Body() dto: StartAttemptDto, @CurrentUser() actor: JwtPayload) {
    return this.service.start(dto, actor)
  }

  @Post('v1/learning/attempts/:id/submit')
  submit(
    @Param('id') id: string,
    @Body() dto: SubmitAttemptDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.submit(id, dto, actor)
  }
}
