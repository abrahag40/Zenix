import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { TenantContextService } from '../tenant-context.service'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

/**
 * PropertyScopeGuard — Sprint SEC-α (CLAUDE.md §Audit 20260513 bug MT-5).
 *
 * Defense against IDOR-style cross-property data leak via query param.
 * If a request includes `?propertyId=<id>`, this guard validates that the
 * value matches the JWT-scoped propertyId from TenantContext. A mismatch
 * throws ForbiddenException — preventing a user authenticated for property A
 * from querying data of property B (even within the same organization).
 *
 * Registered globally in AppModule so any new endpoint that accepts
 * `?propertyId=` is automatically protected without opt-in.
 *
 * Notes:
 * - Public routes (login etc.) are skipped via @Public() decorator.
 * - When `query.propertyId` is absent, the guard is a no-op (TenantContext
 *   provides the property scope from JWT in the controller/service).
 * - The TenantContextService getter throws if not set; we wrap in try/catch
 *   so endpoints reached before middleware (rare) don't 500.
 */
@Injectable()
export class PropertyScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenant: TenantContextService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest()
    const queryPropertyId = request.query?.propertyId
    if (!queryPropertyId || typeof queryPropertyId !== 'string') return true

    let actorPropertyId: string
    try {
      actorPropertyId = this.tenant.getPropertyId()
    } catch {
      // TenantContext not initialized — let downstream guards/handlers fail.
      return true
    }

    if (queryPropertyId !== actorPropertyId) {
      throw new ForbiddenException(
        'Property scope mismatch — query.propertyId does not match authenticated property',
      )
    }
    return true
  }
}
