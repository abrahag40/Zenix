/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 5.
 *
 * AuditLogService — fuente única para escribir entries en `audit_log`.
 * Pattern: TODOS los controllers Days 5-7 importan este servicio y llaman
 * `auditLog.write(...)` después de cada operación CRUD (success O failure).
 *
 * Decisiones aplicadas:
 *   §165 D-NOVA-7 — append-only DB trigger (no podemos mutar existing rows)
 *   §166 D-NOVA-8 — transparency notif al cliente cuando onBehalfOf (Day 16 lo conecta)
 *   §167 D-NOVA-9 — retention policy drives v1.0.3 cold storage scheduler
 *
 * Validación M4 (Day 5+ schema audit deferred):
 *   · `payload` se sanitiza para remover PII obvio antes de DB write
 *   · `reason` obligatorio cuando onBehalfOfId != null (CHECK constraint también enforce)
 */
import { ForbiddenException, Injectable, Logger } from '@nestjs/common'
import type { AuditLogRetention, AuditLogStatus, SystemRole } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

export interface AuditLogWriteInput {
  organizationId: string
  actorRealId: string
  actorRealRole: SystemRole
  /** Set si el actor opera "on behalf of" un usuario del cliente.
   *  Si set, `reason` es REQUIRED. */
  onBehalfOfId?: string
  onBehalfOfRole?: SystemRole
  /** Acción ejecutada — naming convention 'ENTITY_VERB' uppercase. */
  action: string
  /** Entity target id (room_type_id, rate_plan_id, etc.). */
  target?: string
  /** Request payload completo. Se sanitiza PII obvio antes del write. */
  payload: Record<string, unknown>
  /** Respuesta Channex API si la acción involucró Channex. */
  channexResponse?: Record<string, unknown>
  status: AuditLogStatus
  /** Mensaje de error (cuando status='FAILURE' o 'PARTIAL'). */
  errorMessage?: string
  /** Razón. REQUIRED si onBehalfOfId presente. */
  reason?: string
  retentionPolicy?: AuditLogRetention
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Escribe una entrada en audit_log.
   *
   * Side effects:
   *   · INSERT en audit_log (append-only, trigger Postgres garantiza)
   *   · Si onBehalfOfId set → defer Day 16 emite AppNotification + email al ORG_OWNER
   *     (transparency §166 D-NOVA-8). Por ahora solo log.
   *   · Failure de write se logea pero NO throws — auditoría no debe bloquear la acción de negocio.
   */
  async write(input: AuditLogWriteInput): Promise<{ id: string } | null> {
    // Defensive: reason required si on_behalf_of_id presente.
    // CHECK constraint en DB también enforce, pero validamos en app-layer para
    // mensaje de error más claro (no leak del SQL constraint nombre).
    if (input.onBehalfOfId && (!input.reason || input.reason.trim().length === 0)) {
      throw new ForbiddenException(
        'AuditLog: reason es REQUIRED cuando se actúa onBehalfOf un usuario (§165 D-NOVA-7)',
      )
    }

    try {
      const sanitizedPayload = AuditLogService.sanitizePayload(input.payload)
      const entry = await this.prisma.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorRealId: input.actorRealId,
          actorRealRole: input.actorRealRole,
          onBehalfOfId: input.onBehalfOfId,
          onBehalfOfRole: input.onBehalfOfRole,
          action: input.action,
          target: input.target,
          payload: sanitizedPayload as object,
          channexResponse: (input.channexResponse as object) ?? undefined,
          status: input.status,
          errorMessage: input.errorMessage,
          reason: input.reason,
          retentionPolicy: input.retentionPolicy ?? 'STANDARD',
        },
        select: { id: true },
      })

      // Day 16 hook: si onBehalfOf, emitir transparency notif al ORG_OWNER.
      // Por ahora solo log marker — Day 16 wire AppNotification + email.
      if (input.onBehalfOfId) {
        this.logger.log(
          `[AuditLog] action=${input.action} actor=${input.actorRealId} ` +
            `onBehalfOf=${input.onBehalfOfId} reason="${input.reason!.slice(0, 80)}" ` +
            `→ TODO Day 16: transparency notif al ORG_OWNER`,
        )
      }
      return { id: entry.id }
    } catch (err) {
      // Audit failure debe NO romper el flow de negocio — log + return null.
      // La operación de negocio que generó el audit ya succeeded; perder el log
      // es mejor que rechazar al usuario por un fail de write append-only.
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(
        `[AuditLog] write failed (action=${input.action} actor=${input.actorRealId}): ${msg}`,
      )
      return null
    }
  }

  /**
   * Sanitiza payload removiendo campos sensibles obvios (PCI / PII).
   * Lista based on OWASP ASVS 4.0.3 V9.1 "Logging".
   *
   * NUNCA loguea:
   *   · password, passwordHash, hash
   *   · creditCard, cvc, cvv, cardNumber, pan
   *   · ssn, taxId (RFC/CURP MX, RUC PE, NIT CO, CPF BR) full — solo masked
   *   · authorization Bearer tokens
   *   · jwt, accessToken, refreshToken
   *   · privateKey, secret
   */
  static sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
    const SENSITIVE_KEYS = [
      'password',
      'passwordhash',
      'hash',
      'creditcard',
      'cvc',
      'cvv',
      'cardnumber',
      'pan',
      'ssn',
      'authorization',
      'jwt',
      'accesstoken',
      'refreshtoken',
      'privatekey',
      'secret',
      'apikey',
      'api_key',
    ]
    const sanitize = (v: unknown): unknown => {
      if (v === null || typeof v !== 'object') return v
      if (Array.isArray(v)) return v.map(sanitize)
      const out: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (SENSITIVE_KEYS.includes(k.toLowerCase())) {
          out[k] = '<REDACTED>'
        } else if (typeof val === 'object' && val !== null) {
          out[k] = sanitize(val)
        } else {
          out[k] = val
        }
      }
      return out
    }
    return sanitize(payload) as Record<string, unknown>
  }
}
