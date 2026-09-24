import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common'
import { IsString, MinLength } from 'class-validator'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Public } from '../../common/decorators/public.decorator'
import { InvitacionDeStaffService } from './invitacion-de-staff.service'

export class ActivarInvitacionDto {
  /**
   * 🔴 Diez caracteres y ninguna regla de composición. No es dejadez: NIST
   * SP 800-63B §5.1.1.2 desaconseja expresamente exigir mayúsculas, dígitos y
   * símbolos, porque empuja a patrones predecibles —`Hotel2026!`— sin ganar
   * entropía real. La longitud sí la gana.
   */
  @IsString()
  @MinLength(10)
  contrasena!: string
}

/**
 * El alta del personal del hotel. **Pre-autenticación, a propósito**: quien
 * entra aquí todavía no tiene contraseña, que es justo lo que viene a poner.
 *
 * Lo que protege la ruta no es un JWT, es el token del enlace: 32 bytes
 * aleatorios, de un solo uso y con 72 h de vigencia, del que en la base sólo
 * vive el hash.
 */
@ApiTags('auth')
@Controller('v1/auth/invitacion')
@Public()
export class InvitacionDeStaffController {
  constructor(private readonly invitaciones: InvitacionDeStaffService) {}

  @ApiOperation({ summary: 'Datos de la invitación, para la pantalla de alta' })
  @Get(':token')
  metadatos(@Param('token') token: string) {
    return this.invitaciones.metadatos(token)
  }

  @ApiOperation({ summary: 'Canjear la invitación fijando la contraseña' })
  @Post(':token')
  @HttpCode(200)
  activar(@Param('token') token: string, @Body() dto: ActivarInvitacionDto) {
    return this.invitaciones.activar(token, dto.contrasena)
  }
}
