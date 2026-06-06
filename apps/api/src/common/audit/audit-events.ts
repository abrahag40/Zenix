/**
 * AUDIT-CORE — domain event contracts.
 *
 * Pattern: outbox via EventEmitter2 (igual D-CHX-OUT-3 §141).
 * El service emite el evento POST-commit; el listener escribe asíncrono
 * a `audit_log`. Cero impacto en latencia del path crítico.
 *
 * Por qué outbox y no inline:
 *   · Latencia: tx.auditLog.create dentro de la tx crítica = +20-50ms.
 *     Multiplicado por 14 métodos críticos = degradación visible.
 *   · Fail-soft: si el INSERT en audit_log falla (FK rota, BD lenta), NO
 *     rompe el cancel/payment/checkout. El listener loguea + skip.
 *   · Bulk replay: el outbox queue puede tener un retry worker (futuro
 *     v1.0.x) para reintentar audit log faltantes.
 *
 * Compliance que cumple este patrón:
 *   · Visa CRR §5.9.2 — chargeback evidence ventana 120d
 *   · CFDI Art. 30 CFF — retención 5 años de operaciones que afectan facturación
 *   · §165 D-NOVA-7 — AuditLog universal append-only DB-level
 *
 * Naming convention: `audit.<entity>.<verb>` lowercase con dots.
 * Convención eclipsa namespace `channex.*` para diferenciar dominios.
 */

import type { SystemRole } from '@prisma/client'

/**
 * Payload base — campos comunes a TODOS los eventos audit.
 *
 * Resuelve el patrón observado durante el fix #20:
 *   1. `actorStaffId` = el JWT.sub del recepcionista (Staff.id)
 *   2. `actorRole` = StaffRole→SystemRole mapeado via mapJwtRoleToSystemRole
 *   3. `organizationId` = scope tenant (TenantContextService.getOrganizationId)
 *   4. `target` = entity afectada (stayId, paymentId, etc.)
 *   5. `payload` = snapshot inmutable de lo que cambió + razón
 */
export interface AuditEventBase {
  /** Staff.id que ejecutó la acción (JWT.sub). El listener resuelve Staff.userId */
  actorStaffId: string
  /** SystemRole opcional — si el caller lo pasa (caso Nova impersonation con
   *  actorTier), se usa tal cual. Si NO, el listener lo deriva del Staff.role
   *  y mapea StaffRole→SystemRole (SUPERVISOR→MANAGER, RECEPTIONIST→RECEPTIONIST,
   *  HOUSEKEEPER→HOUSEKEEPER). Esto evita cambiar 13 signatures del service
   *  para propagar el role. */
  actorRole?: SystemRole
  /** Organization scope */
  organizationId: string
  /** Entity target — convención: stayId · paymentLogId · roomId */
  target: string
  /** Snapshot del estado/cambio en el momento de emit */
  payload: Record<string, unknown>
  /** Reason humano (mapea a audit_log.reason) — opcional pero recomendado */
  reason?: string
  /** Override retention policy. Default = STANDARD; si requiresFiscalReview o
   *  fiscal/payment-touching → PERMANENT */
  retentionOverride?: 'PERMANENT' | 'STANDARD' | 'TRANSIENT'
}

// ─────────────────────────────────────────────────────────────────────
// EVENT NAMES — single source of truth (importable sin dep cycle)
// ─────────────────────────────────────────────────────────────────────

/** Stay lifecycle */
export const STAY_CHECKIN_CONFIRMED   = 'audit.stay.checkin-confirmed'
export const STAY_CHECKOUT            = 'audit.stay.checkout'
export const STAY_EARLY_CHECKOUT      = 'audit.stay.early-checkout'
export const STAY_LATE_CHECKOUT       = 'audit.stay.late-checkout'
export const STAY_UPDATED             = 'audit.stay.updated'
export const STAY_EXTENDED            = 'audit.stay.extended'
export const STAY_ROOM_MOVED          = 'audit.stay.room-moved'
export const STAY_ROOMS_SWAPPED       = 'audit.stay.rooms-swapped'
export const STAY_RESTORED            = 'audit.stay.restored'
export const STAY_CANCELLED           = 'audit.stay.cancelled' // ya implementado inline en cancelStay

/** No-show lifecycle */
export const NOSHOW_MARKED            = 'audit.no-show.marked'
export const NOSHOW_REVERTED          = 'audit.no-show.reverted'
export const NOSHOW_CHARGE_REGISTERED = 'audit.no-show.charge-registered'

/** Payment lifecycle (chargeback evidence) */
export const PAYMENT_REGISTERED       = 'audit.payment.registered'
export const PAYMENT_VOIDED           = 'audit.payment.voided'

/** Cancel-related (post-cancel financial outcome) */
export const CANCEL_REFUND_REGISTERED = 'audit.cancel.refund-registered'

// ─────────────────────────────────────────────────────────────────────
// PAYLOAD TYPED EXTENSIONS — opcional, para callers que quieran shape
// ─────────────────────────────────────────────────────────────────────

export interface AuditPaymentRegisteredPayload extends AuditEventBase {
  payload: {
    paymentLogId: string
    method: string
    amount: number
    currency: string
    reference: string | null
    appliesToStayIds?: string[]
    paidByStayId?: string | null
  }
}

export interface AuditNoShowChargePayload extends AuditEventBase {
  payload: {
    status: 'CHARGED' | 'FAILED' | 'WAIVED'
    method: string
    reference: string | null
    amount?: number
    currency?: string
  }
}

export interface AuditCheckinConfirmedPayload extends AuditEventBase {
  payload: {
    documentType?: string | null
    documentVerified: boolean
    paymentModel?: string | null
    balanceAtCheckin?: number
  }
}
