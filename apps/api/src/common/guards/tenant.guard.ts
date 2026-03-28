import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { SetMetadata } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { TenantContextService } from '../tenant-context.service'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

export const TENANT_RESOURCE_KEY = 'tenantResource'

export interface TenantResourceConfig {
  model: string // nombre del modelo Prisma: 'cleaningTask', 'room', etc.
  paramName: string // nombre del param en la URL: 'id', 'roomId', etc.
}

export const TenantResource = (config: TenantResourceConfig) =>
  SetMetadata(TENANT_RESOURCE_KEY, config)

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip public endpoints (login, etc.)
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const config = this.reflector.get<TenantResourceConfig>(
      TENANT_RESOURCE_KEY,
      context.getHandler(),
    )

    // Si el endpoint no tiene @TenantResource(), el guard no actúa
    if (!config) return true

    const request = context.switchToHttp().getRequest()
    const resourceId = request.params[config.paramName]

    if (!resourceId) return true

    const orgId = this.tenant.get().organizationId
    if (!orgId) return true // No tenant context — let other guards handle auth

    // Acceso dinámico al modelo de Prisma
    const model = (this.prisma as any)[config.model]
    if (!model) throw new Error(`Unknown Prisma model: ${config.model}`)

    const resource = await model.findUnique({
      where: { id: resourceId },
      select: { organizationId: true },
    })

    if (!resource) {
      throw new NotFoundException('Resource not found')
    }

    if (resource.organizationId !== orgId) {
      // Devuelve 404, no 403 — nunca revela que el recurso existe
      throw new NotFoundException('Resource not found')
    }

    return true
  }
}
