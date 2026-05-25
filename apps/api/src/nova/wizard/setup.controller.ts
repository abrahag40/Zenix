/**
 * SetupController — endpoints públicos para Org Owner activation.
 *
 *   GET  /v1/auth/setup/:token  — metadata del cliente pendiente
 *   POST /v1/auth/setup/:token  — set password + activar (auto-login JWT)
 *
 * Public (NO requiere JWT). El token raw que viene en la URL ES la auth —
 * single-use, 72h TTL, SHA256 hashed at-rest.
 *
 * Naming: vive bajo `/v1/auth/setup` (no `/v1/nova/wizard/setup`) porque
 * conceptualmente es el flow de auth del cliente, no del consultor —
 * mismo dominio `app.zenix.com`, no `nova.zenix.com`.
 */
import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common'
import { Public } from '../../common/decorators/public.decorator'
import { SetupService } from './setup.service'

interface SetupActivateBody {
  password: string
}

@Controller('v1/auth/setup')
@Public() // controller-wide — toda la ruta del setup es pre-auth
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Get(':token')
  async getMetadata(@Param('token') token: string) {
    return this.setup.getMetadata(token)
  }

  @Post(':token')
  @HttpCode(200)
  async activate(@Param('token') token: string, @Body() body: SetupActivateBody) {
    return this.setup.activate(token, body?.password)
  }
}
