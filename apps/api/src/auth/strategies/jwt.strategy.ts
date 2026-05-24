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
    // Path 1 — Staff legacy (recepcionistas/supervisores/housekeepers).
    const staff = await this.prisma.staff.findUnique({
      where: { id: payload.sub },
      select: { id: true, active: true },
    })
    if (staff) {
      if (!staff.active) throw new UnauthorizedException()
      return payload
    }

    // Path 2 — Nova User (Day 3+) — PLATFORM_ADMIN / PARTNER_* / ORG_OWNER.
    // Estos usuarios viven en `users` table (no `staff`). Sin este lookup, sus
    // JWTs eran rechazados con 401 silencioso → frontend hacía auto-logout en
    // loop infinito (bug reportado durante Day 9 sandbox testing).
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true },
    })
    if (!user || !user.isActive) throw new UnauthorizedException()
    return payload
  }
}
