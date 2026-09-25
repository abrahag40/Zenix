import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator'
import { StaffRole } from '@zenix/shared'
import { Roles } from '../../common/decorators/roles.decorator'
import { TenantContextService } from '../../common/tenant-context.service'
import { RecepcionService } from './recepcion.service'
import { FirmarCartaService } from './firmar-carta.service'

export class VerificarOtpDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'El código son seis dígitos.' })
  codigo!: string
}

export class FirmarDto {
  /** La imagen de la firma, en base64. Es lo que dibujó el huésped. */
  @IsString()
  firmaBase64!: string

  /**
   * El SHA-256 que calculó la tableta.
   *
   * 🔴 Se usa para CONTRASTAR, no para confiar. El servidor relee los bytes ya
   * guardados y calcula el suyo: nada que venga del cliente es un hecho. Si no
   * coincide, se avisa y se sella el del servidor.
   */
  @IsOptional() @IsString() @Length(64, 64) firmaHash?: string

  /** El código de un solo uso que el huésped dictó, si se usó. */
  @IsOptional() @IsString() @Matches(/^\d{6}$/) otp?: string
}

export class EmitirOtpDto {
  @IsIn(['correo', 'sms'])
  canal!: 'correo' | 'sms'
}

/**
 * La tableta de recepción.
 *
 * 🔴 `RECEPTIONIST` **y** `SUPERVISOR`: registrar huéspedes es el trabajo de
 * recepción, no una tarea de gerencia. Exigir supervisor aquí obligaría a que
 * el gerente firmara cada entrada, y en la práctica acabaría con la contraseña
 * del gerente pegada en el mostrador — que es peor que no tener control.
 */
@ApiTags('recepcion')
@Controller('v1/recepcion')
export class RecepcionController {
  constructor(
    private readonly recepcion: RecepcionService,
    private readonly firmas: FirmarCartaService,
    private readonly tenant: TenantContextService,
  ) {}

  @ApiOperation({ summary: 'Buscar la reserva por el código que se teclea en la tableta' })
  @Get('estancias/:codigo')
  @Roles(StaffRole.RECEPTIONIST, StaffRole.SUPERVISOR)
  buscar(@Param('codigo') codigo: string, @Req() req: { user?: { sub?: string } }) {
    return this.recepcion.buscar({
      // Las dos salen del CONTEXTO. Si la propiedad viniera de la petición,
      // cambiarla sería leer las reservas de otro hotel.
      propertyId: this.tenant.getPropertyId(),
      sesionId: req.user?.sub ?? this.tenant.getUserId(),
      tecleado: codigo,
    })
  }

  @ApiOperation({ summary: 'Enviar al huésped un código de un solo uso' })
  @Post('estancias/:estanciaId/codigo')
  @HttpCode(200)
  @Roles(StaffRole.RECEPTIONIST, StaffRole.SUPERVISOR)
  async emitirOtp(@Param('estanciaId') estanciaId: string, @Body() dto: EmitirOtpDto) {
    await this.recepcion.emitirOtp({ estanciaId, canal: dto.canal })
    // 🔴 NO se devuelve el código. Devolverlo dejaría que el recepcionista lo
    // leyera de la pantalla y lo tecleara él mismo, que es exactamente lo que
    // el código existe para impedir: acredita que el HUÉSPED controla su
    // contacto, no que alguien pulsó un botón.
    return { enviado: true, canal: dto.canal }
  }

  @ApiOperation({ summary: 'Firmar y sellar la carta de registro' })
  @Post('estancias/:estanciaId/carta')
  @HttpCode(200)
  @Roles(StaffRole.RECEPTIONIST, StaffRole.SUPERVISOR)
  firmar(
    @Param('estanciaId') estanciaId: string,
    @Body() dto: FirmarDto,
    @Req() req: { user?: { sub?: string }; ip?: string; headers?: Record<string, string> },
  ) {
    return this.firmas.firmar({
      propertyId: this.tenant.getPropertyId(),
      estanciaId,
      firmaBase64: dto.firmaBase64,
      hashDelCliente: dto.firmaHash,
      otp: dto.otp,
      // Quién del hotel presenció la firma. El equivalente a «ante mí».
      testigoStaffId: req.user?.sub,
      ip: req.ip,
      userAgent: req.headers?.['user-agent'],
    })
  }
}
