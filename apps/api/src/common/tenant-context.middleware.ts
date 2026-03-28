import { Injectable, NestMiddleware } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'
import { JwtService } from '@nestjs/jwt'
import { ClsService } from 'nestjs-cls'

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
      const payload = this.jwt.verify(token) as {
        sub: string
        organizationId: string
        propertyId: string
        role: string
      }

      this.cls.set('organizationId', payload.organizationId)
      this.cls.set('propertyId', payload.propertyId)
      this.cls.set('userId', payload.sub)
      this.cls.set('role', payload.role)
    } catch {
      // Token invalid — JwtAuthGuard will handle the 401
    }

    next()
  }
}
