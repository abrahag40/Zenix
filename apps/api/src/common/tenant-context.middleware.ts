import { Injectable, NestMiddleware } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'
import { JwtService } from '@nestjs/jwt'
import { ClsService } from 'nestjs-cls'
import type { JwtPayload, TenantScope } from '@zenix/shared'

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    private readonly jwt: JwtService,
    private readonly cls: ClsService,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return next()
    }

    try {
      const token = authHeader.slice(7)
      const payload = this.jwt.verify(token) as JwtPayload

      this.cls.set('organizationId', payload.organizationId)
      this.cls.set('propertyId', payload.propertyId)
      this.cls.set('userId', payload.sub)
      this.cls.set('role', payload.role)

      // v1.0.5 TENANT-CTX-3LEVEL — campos opcionales del JWT (backward-compat).
      // Si están ausentes (tokens pre-v1.0.5), scope queda en 'PROPERTY' por default.
      const scope: TenantScope = payload.scope ?? 'PROPERTY'
      this.cls.set('scope', scope)
      if (payload.legalEntityId) this.cls.set('legalEntityId', payload.legalEntityId)
      if (payload.brandId) this.cls.set('brandId', payload.brandId)
    } catch {
      // Token invalid — JwtAuthGuard will handle the 401
    }

    next()
  }
}
