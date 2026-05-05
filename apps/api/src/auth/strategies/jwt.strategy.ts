import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { JwtPayload } from '@zenix/shared'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      // Aceptar token via Authorization header O query param ?token=
      // El query param es necesario para SSE (EventSource API no permite
      // headers custom). Header tiene prioridad si ambos están presentes.
      // Sin esto, /api/events?token=... devuelve 401 y el frontend redirige
      // a /login, bloqueando todas las páginas que montan useSSE.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter('token'),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret') ?? 'changeme',
    })
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const staff = await this.prisma.housekeepingStaff.findUnique({
      where: { id: payload.sub },
      select: { id: true, active: true },
    })
    if (!staff || !staff.active) throw new UnauthorizedException()
    return payload
  }
}
