import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common'
import { Public } from '../common/decorators/public.decorator'
import { PrecheckinService } from './precheckin.service'
import { SubmitPrecheckinDto } from './dto/submit-precheckin.dto'

/**
 * PrecheckinController — Sprint AUTO-CHECKIN, Fase 1.
 *
 * Rutas PÚBLICAS (pre-auth) — el huésped abre el link desde su móvil sin sesión.
 * El gate es el **token opaco de 32 bytes** en la URL (no enumerable); el ID
 * interno nunca se expone. (Throttling explícito = hardening pendiente de Fase 1;
 * el token de alta entropía es la defensa primaria contra enumeración.)
 */
@Controller('v1/precheckin')
@Public()
export class PrecheckinController {
  constructor(private readonly precheckin: PrecheckinService) {}

  /** Datos pre-cargados (de Channex) para el formulario del huésped. */
  @Get(':token')
  getContext(@Param('token') token: string) {
    return this.precheckin.getContext(token)
  }

  /** El huésped confirma/corrige datos + sube foto de ID. */
  @Post(':token')
  @HttpCode(200)
  submit(@Param('token') token: string, @Body() dto: SubmitPrecheckinDto) {
    return this.precheckin.submit(token, dto)
  }
}
