import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { DLCCode } from '@prisma/client'
import { JwtPayload } from '@zenix/shared'
import { DLCService } from './dlc.service'
import { REQUIRES_DLC_KEY } from './requires-dlc.decorator'

/**
 * DLCGuard — bloquea acceso a endpoints marcados @RequiresDLC cuando el
 * tenant no tiene status=ACTIVE para ese DLC.
 *
 * Order de guards globales (app.module.ts):
 *   1. JwtAuthGuard       — valida token JWT
 *   2. TenantGuard        — popula TenantContextService
 *   3. PropertyScopeGuard — anti-IDOR ?propertyId= (§MT-5 SEC-α)
 *   4. DLCGuard           — verifica DLC ACTIVE para endpoints marcados
 *
 * §142 — fail-soft con 402 Payment Required y mensaje accionable.
 *
 * Respuesta cuando DLC no activo:
 *   HTTP 402 Payment Required
 *   { code: 'DLC_NOT_ACTIVE', dlcCode: 'LEARNING_CORE', status: 'ARCHIVED',
 *     message: 'Zenix Learning no está activo en esta organización.
 *              Reactívalo desde Settings > Add-Ons.', activateUrl: '...' }
 */
@Injectable()
export class DLCGuard implements CanActivate {
  private readonly logger = new Logger(DLCGuard.name)

  constructor(
    private readonly reflector: Reflector,
    private readonly dlcService: DLCService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const dlcCode = this.reflector.getAllAndOverride<DLCCode | undefined>(REQUIRES_DLC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    // Endpoint sin @RequiresDLC → siempre pasa
    if (!dlcCode) return true

    const request = context.switchToHttp().getRequest()
    const actor = request.user as JwtPayload | undefined
    if (!actor?.organizationId) {
      // JwtAuthGuard debió bloquear antes — pero defensa por si endpoint
      // se marca @Public + @RequiresDLC (caso raro)
      throw new HttpException(
        { code: 'NO_TENANT_CONTEXT', message: 'Tenant context required for DLC check' },
        HttpStatus.UNAUTHORIZED,
      )
    }

    const dlc = await this.dlcService.getStatus(actor.organizationId, dlcCode)

    if (!dlc) {
      throw new HttpException(
        {
          code: 'DLC_NOT_ACTIVATED',
          dlcCode,
          status: 'NEVER_ACTIVATED',
          message: `El add-on ${dlcCode} no ha sido activado en esta organización. Activa el plan desde Settings > Add-Ons.`,
          activateUrl: `/settings/dlc/activate/${dlcCode}`,
        },
        HttpStatus.PAYMENT_REQUIRED,
      )
    }

    if (dlc.status === 'ACTIVE') return true

    // SUSPENDED / GRACE_PERIOD / ARCHIVED / PURGED → bloqueo con detalle
    const isReactivable = dlc.status !== 'PURGED'
    throw new HttpException(
      {
        code: 'DLC_NOT_ACTIVE',
        dlcCode,
        status: dlc.status,
        suspensionReason: dlc.suspensionReason,
        cancellationReason: dlc.cancellationReason,
        gracePeriodEndsAt: dlc.gracePeriodEndsAt,
        message: isReactivable
          ? `El add-on ${dlcCode} está en estado ${dlc.status}. Tu data se preserva — puedes reactivarlo desde Settings > Add-Ons.`
          : `El add-on ${dlcCode} fue purgado por retención fiscal (5 años). Contacta a soporte para opciones.`,
        activateUrl: isReactivable ? `/settings/dlc/reactivate/${dlcCode}` : null,
        dataPreserved: isReactivable,
      },
      HttpStatus.PAYMENT_REQUIRED,
    )
  }
}
