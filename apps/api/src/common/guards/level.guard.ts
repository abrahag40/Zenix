/**
 * LevelGuard — verifica metadata @RequiresLevel del decorator.
 *
 * Lee el JWT del actor (StaffLevel + Department) y rechaza si no cumple.
 * Para que funcione, AuthService debe incluir level y department en el JWT.
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtPayload } from '@zenix/shared'
import { LEVEL_KEY, LevelRequirement } from '../decorators/level.decorator'

@Injectable()
export class LevelGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<LevelRequirement | undefined>(
      LEVEL_KEY,
      [context.getHandler(), context.getClass()],
    )
    if (!required) return true

    const { user } = context.switchToHttp().getRequest<{ user: JwtPayload }>()

    // Level check — actor debe tener AL MENOS el nivel requerido.
    // Por ahora solo LEAD vs COLLABORATOR; si crecemos a más niveles
    // (LEAD > MANAGER > DIRECTOR), añadir lógica de jerarquía aquí.
    if (required.level === 'LEAD' && user.level !== 'LEAD') {
      throw new ForbiddenException(
        `Esta acción requiere nivel LEAD${required.department ? ` de ${required.department}` : ''}.`,
      )
    }

    // Department check — si especificado, debe coincidir exactamente.
    if (required.department && user.department !== required.department) {
      throw new ForbiddenException(
        `Esta acción requiere ser líder del área ${required.department}. Tu área es ${user.department ?? 'no asignada'}.`,
      )
    }

    return true
  }
}
