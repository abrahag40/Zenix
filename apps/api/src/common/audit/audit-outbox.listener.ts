/**
 * AuditOutboxListener — escribe `audit_log` asíncrono.
 *
 * 1 listener catch-all que matchea `audit.*` (EventEmitter2 wildcard).
 * Resuelve `Staff.userId` (FK audit_log_actor_real_id_fkey → users) y
 * persiste el row append-only.
 *
 * Fail-soft documentado:
 *   · Si Staff sin User vinculado → warn + skip (no fail loud)
 *   · Si INSERT falla (FK, lock, otro) → error log + skip (no relanza)
 *   · El path crítico ya respondió OK — el audit no debe romper UX
 *
 * Retención adaptativa:
 *   · `retentionOverride` del payload tiene prioridad
 *   · Default: STANDARD (365 días)
 *   · Para acts que tocan dinero/fiscal: PERMANENT (los helpers ya lo setean)
 *
 * Mapeo event name → action string del audit_log:
 *   `audit.stay.checkin-confirmed` → `STAY_CHECKIN_CONFIRMED`
 *   (lowercase con dots → SCREAMING_SNAKE_CASE)
 */

import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { AuditLogRetention, AuditLogStatus, SystemRole } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import type { AuditEventBase } from './audit-events'

@Injectable()
export class AuditOutboxListener {
  private readonly logger = new Logger(AuditOutboxListener.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Catch-all listener para todos los eventos `audit.*`.
   *
   * EventEmitter2 wildcard: el segundo parámetro de @OnEvent es el
   * event name resolved. Permite tener un solo método en vez de 14.
   */
  @OnEvent('audit.**', { async: true, promisify: true })
  async handle(payload: AuditEventBase & { _eventName?: string }) {
    // EventEmitter2 wildcard NO pasa el event name de forma confiable en
    // @nestjs/event-emitter v3+. El service lo inyecta en `_eventName` del
    // payload. Documentado en audit-outbox.service.ts emit().
    const eventName = payload._eventName
    if (!eventName) {
      this.logger.warn(`audit listener invoked sin eventName — target=${payload.target}`)
      return
    }

    try {
      // (a) Resolver User.id + Staff.role en UNA sola query
      //     - userId: FK audit_log_actor_real_id_fkey
      //     - role:   si caller no pasó actorRole, mapeamos del Staff
      const staff = await this.prisma.staff.findUnique({
        where: { id: payload.actorStaffId },
        select: { userId: true, role: true },
      })
      if (!staff?.userId) {
        // Legacy staff sin user vinculado — skip + warn. Esto solo ocurre
        // con seeds antiguos; staff productivos siempre tienen User.
        this.logger.warn(
          `audit-outbox skipped ${eventName} target=${payload.target}: staff ${payload.actorStaffId} sin userId vinculado`,
        )
        return
      }

      // Resolución de actorRole: caller > staff.role mapeado > RECEPTIONIST fallback
      let resolvedRole: SystemRole = payload.actorRole ?? SystemRole.RECEPTIONIST
      if (!payload.actorRole) {
        // StaffRole → SystemRole (consistente con mapJwtRoleToSystemRole helper)
        switch (staff.role) {
          case 'SUPERVISOR':   resolvedRole = SystemRole.MANAGER; break
          case 'RECEPTIONIST': resolvedRole = SystemRole.RECEPTIONIST; break
          case 'HOUSEKEEPER':  resolvedRole = SystemRole.HOUSEKEEPER; break
        }
      }

      // (b) Action string — convención SCREAMING_SNAKE del event name
      //     `audit.stay.checkin-confirmed` → `STAY_CHECKIN_CONFIRMED`
      const action = eventName
        .replace(/^audit\./, '')
        .replace(/[.-]/g, '_')
        .toUpperCase()

      // (c) Retention policy adaptativo
      const retention: AuditLogRetention =
        payload.retentionOverride === 'PERMANENT'
          ? AuditLogRetention.PERMANENT
          : payload.retentionOverride === 'TRANSIENT'
          ? AuditLogRetention.TRANSIENT
          : AuditLogRetention.STANDARD

      // (d) Insert append-only
      await this.prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId,
          actorRealId: staff.userId,
          actorRealRole: resolvedRole,
          action,
          target: payload.target,
          payload: payload.payload as object, // jsonb compatible
          status: AuditLogStatus.SUCCESS,
          reason: payload.reason ?? null,
          retentionPolicy: retention,
        },
      })
    } catch (err) {
      // Fail-soft per design: audit-outbox NO rompe el path crítico.
      // Loguear como ERROR (no warn) para alertar ops monitoring.
      this.logger.error(
        `audit-outbox INSERT failed for ${eventName} target=${payload.target}: ${err instanceof Error ? err.message : err}`,
      )
    }
  }
}
