import { Body, Controller, Get, Post } from '@nestjs/common'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'
import { Public } from '../common/decorators/public.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { JwtPayload } from '@zenix/shared'

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto)
  }

  /** Lists all properties in the same org — for the property switcher. */
  @Get('properties')
  listProperties(@CurrentUser() actor: JwtPayload) {
    return this.authService.listProperties(actor)
  }

  /** Issues a new JWT scoped to a different property within the same org. */
  @Post('switch-property')
  switchProperty(
    @CurrentUser() actor: JwtPayload,
    @Body('targetPropertyId') targetPropertyId: string,
  ) {
    return this.authService.switchProperty(actor, targetPropertyId)
  }
}
