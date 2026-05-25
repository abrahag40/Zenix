import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { StaffRole, JwtPayload, ActorTier } from '@zenix/shared'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { NOVA_TIERS_KEY } from '../../nova/guards/nova-tiers.guard'

/**
 * RolesGuard global — valida que el actor cumple las restricciones de
 * autorización del endpoint.
 *
 * Day 11 update — OR-semantics con NovaTiers:
 *
 * El endpoint puede declarar:
 *   - SOLO `@Roles(SUPERVISOR)` → solo StaffRole legacy pasa
 *   - SOLO `@NovaTiers('PLATFORM', ...)` → solo actorTier Nova pasa
 *   - AMBOS → CUALQUIER de los dos satisface (OR)
 *
 * Caso de uso: endpoints admin (Channex status, audit log, reports) que
 * deben ser accesibles tanto por SUPERVISOR del cliente (legacy Staff)
 * como por consultor Nova (Abraham PLATFORM_ADMIN, Partner team). Sin la
 * OR semántica, deberíamos elegir UNO solo — y rompemos al otro.
 *
 * Pre-Day 11: solo respetaba @Roles → consultor Nova recibía 403 en
 * endpoints SUPERVISOR-marked, aunque tier='PLATFORM'.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<StaffRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    const requiredTiers = this.reflector.getAllAndOverride<ActorTier[]>(NOVA_TIERS_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    const hasRolesReq = requiredRoles && requiredRoles.length > 0
    const hasTiersReq = requiredTiers && requiredTiers.length > 0

    // Sin nada requerido → pass-through
    if (!hasRolesReq && !hasTiersReq) return true

    const { user } = context.switchToHttp().getRequest<{ user: JwtPayload }>()
    if (!user) {
      throw new ForbiddenException('No autenticado')
    }

    // OR semantics: pasa si CUALQUIER de los dos satisface
    const passRole = hasRolesReq && requiredRoles!.includes(user.role)
    const passTier =
      hasTiersReq && user.actorTier !== undefined && requiredTiers!.includes(user.actorTier)

    if (passRole || passTier) return true

    throw new ForbiddenException('Insufficient permissions')
  }
}
