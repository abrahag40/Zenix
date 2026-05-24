// Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 5.
//
// NovaTiers decorator + Guard — enforcement de tier en hierarchy 5-tier Nova.
//
// Diferencia con Roles(StaffRole):
//   - Roles valida JwtPayload.role (StaffRole enum legacy: OWNER/MANAGER/etc.)
//   - NovaTiers valida JwtPayload.actorTier (ActorTier: PLATFORM/PARTNER_/ORG_)
//
// Endpoint pattern (commented to avoid JSDoc tag confusion):
//   NovaTiers('PLATFORM', 'PARTNER_ADMIN', 'PARTNER_MEMBER')
//   RequireActingOrg()
//   Post('/room-types')
//   create(...) { ... }
//
// 403 ForbiddenException si actorTier no incluido en lista o si tier undefined
// (legacy JWT pre-Nova).
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { ActorTier, JwtPayload } from '@zenix/shared'

export const NOVA_TIERS_KEY = 'nova:tiers'

export const NovaTiers = (...tiers: ActorTier[]) => SetMetadata(NOVA_TIERS_KEY, tiers)

@Injectable()
export class NovaTiersGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<ActorTier[]>(NOVA_TIERS_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required || required.length === 0) return true

    const { user } = context.switchToHttp().getRequest<{ user: JwtPayload }>()
    if (!user) {
      throw new ForbiddenException('No autenticado para endpoint Nova')
    }

    const tier: ActorTier | undefined = user.actorTier
    if (!tier || !required.includes(tier)) {
      throw new ForbiddenException(
        `Tier insuficiente — endpoint requiere uno de [${required.join(', ')}], actor es ${tier ?? 'undefined (token legacy)'}`,
      )
    }
    return true
  }
}
