/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 3 (§170 D-NOVA-12).
 *
 * NovaActingOrgGuard — middleware que valida header `X-Acting-Organization-Id`.
 *
 * Use case: PLATFORM_ADMIN o PARTNER_MEMBER están operando "en nombre de" una
 * Organization cliente — necesitan declarar a QUÉ org se aplica la operación.
 * Sin header, el server no puede determinar el organizationId de scope.
 *
 * Reglas:
 *   1. tier=PLATFORM: header opcional. Si presente → setea scope. Si ausente
 *      → endpoints cross-tenant válidos (BI ecosystem queries).
 *   2. tier=PARTNER_ADMIN/PARTNER_MEMBER: header REQUERIDO para endpoints
 *      org-scoped. Valida orgId ∈ actor.assignedOrgIds. 403 si invalid.
 *   3. tier=ORG_OWNER/ORG_STAFF: header IGNORADO. organizationId viene del JWT
 *      (legacy behavior preserved).
 *
 * Decorator pattern: usar `@RequireActingOrg()` en endpoints que demandan org
 * scope. Endpoints cross-tenant pueden omitir el decorator.
 *
 * Pattern análogo a Salesforce `X-PrettyPrint` + multi-org context.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import type { ActorTier, JwtPayload } from '@zenix/shared'

/** Decorator que marca un endpoint como requerido de scope org. */
export const RequireActingOrg = () => SetMetadata('nova:requireActingOrg', true)

export const ACTING_ORG_HEADER = 'x-acting-organization-id'

@Injectable()
export class NovaActingOrgGuard implements CanActivate {
  private readonly logger = new Logger(NovaActingOrgGuard.name)

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>('nova:requireActingOrg', [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required) return true

    const req = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>()
    const actor = req.user as JwtPayload | undefined
    if (!actor) {
      throw new ForbiddenException('No autenticado para acción org-scoped')
    }

    const tier: ActorTier = actor.actorTier ?? 'ORG_STAFF'

    // ── ORG_OWNER + ORG_STAFF: header ignorado, organizationId del JWT ──
    if (tier === 'ORG_OWNER' || tier === 'ORG_STAFF') {
      // Legacy behavior — el organizationId vive en JWT.organizationId, no en header
      return true
    }

    // ── PLATFORM_ADMIN: header opcional (puede operar cross-tenant) ──
    if (tier === 'PLATFORM') {
      const headerOrg = (req.headers[ACTING_ORG_HEADER] as string | undefined)?.trim()
      if (headerOrg) {
        // PLATFORM puede actuar sobre cualquier org → setea scope
        req.actingOrgId = headerOrg
      }
      // Sin header está OK para PLATFORM (cross-tenant queries permitidas)
      return true
    }

    // ── PARTNER_ADMIN + PARTNER_MEMBER: header REQUERIDO + validación ──
    const headerOrg = (req.headers[ACTING_ORG_HEADER] as string | undefined)?.trim()
    if (!headerOrg) {
      throw new ForbiddenException(
        'Falta header X-Acting-Organization-Id — los consultores deben declarar cliente activo',
      )
    }

    const assigned = actor.assignedOrgIds ?? []
    // Si assignedOrgIds está undefined en JWT (>20 orgs, fallback Redis), el
    // guard de Phase 1 rechaza para safety. Phase 2 v1.0.5 implementa el cache
    // lookup. Pre-warn al supervisor partner si su firm tiene > 20 clientes.
    if (actor.assignedOrgIds === undefined) {
      this.logger.warn(
        `[NovaActingOrgGuard] actor ${actor.sub} sin assignedOrgIds inline — overflow > 20. Redis cache fallback no implementado aún (Phase 2 v1.0.5).`,
      )
      throw new ForbiddenException(
        'Tu firm consultor tiene > 20 clientes activos — cache distribuido pendiente Phase 2 (v1.0.5). Contacta soporte.',
      )
    }

    if (!assigned.includes(headerOrg)) {
      throw new ForbiddenException(
        `No tienes asignación activa al cliente solicitado (${headerOrg.slice(0, 8)}…). Verifica con tu PARTNER_ADMIN.`,
      )
    }

    req.actingOrgId = headerOrg
    return true
  }
}

// Type augmentation para tener req.actingOrgId tipado downstream
declare module 'express-serve-static-core' {
  interface Request {
    actingOrgId?: string
  }
}
