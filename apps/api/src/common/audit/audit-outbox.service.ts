/**
 * AuditOutboxService — facade del audit outbox.
 *
 * Patrón Strangler Fig: en vez de invocar `EventEmitter2.emit(...)` directo
 * por todo el codebase (acoplamiento al string del evento), los services
 * llaman `this.audit.recordStayCancelled({...})`. Si mañana cambiamos de
 * EventEmitter2 a Kafka/Redis Streams, solo se toca esta clase.
 *
 * Convención post-commit:
 *   Llamar SIEMPRE después de `await this.prisma.$transaction(...)`.
 *   Si la tx fallaba antes del emit, el audit NO se escribe.
 *   Si la tx tuvo éxito pero el emit/listener falla, la operación
 *   principal NO se revierte (fail-soft documentado §144 D-CHX-OUT-6
 *   adaptado a audit).
 */

import { Injectable, Logger } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import type { SystemRole } from '@prisma/client'
import * as Events from './audit-events'
import type { AuditEventBase } from './audit-events'

@Injectable()
export class AuditOutboxService {
  private readonly logger = new Logger(AuditOutboxService.name)

  constructor(private readonly events: EventEmitter2) {}

  /**
   * Método base — emite cualquier evento audit.
   *
   * Los services pueden usar este directo (más conciso) o los helpers
   * tipados de abajo (más auto-completion).
   */
  emit(eventName: string, payload: AuditEventBase): void {
    try {
      // EventEmitter2 wildcard listener en @nestjs/event-emitter v3+ NO recibe
      // el eventName como segundo arg de forma confiable. Lo inyectamos en el
      // payload para que el listener lo recupere. Hack pragmático documentado.
      const enriched = { ...payload, _eventName: eventName }
      this.events.emit(eventName, enriched)
    } catch (err) {
      // Defensive: emit jamás debería tirar. Si tira (e.g. memoria),
      // log warn y seguir — la operación principal ya cometió.
      this.logger.warn(
        `audit-outbox emit failed for ${eventName} target=${payload.target}: ${err}`,
      )
    }
  }

  // ── Helpers tipados (fase 3 los usa) ─────────────────────────────

  recordStayCheckinConfirmed(args: {
    stayId: string
    actorStaffId: string
    actorRole?: SystemRole
    organizationId: string
    documentVerified: boolean
    paymentModel?: string | null
    balanceAtCheckin?: number
  }) {
    this.emit(Events.STAY_CHECKIN_CONFIRMED, {
      actorStaffId: args.actorStaffId,
      actorRole: args.actorRole,
      organizationId: args.organizationId,
      target: args.stayId,
      payload: {
        documentVerified: args.documentVerified,
        paymentModel: args.paymentModel ?? null,
        balanceAtCheckin: args.balanceAtCheckin ?? 0,
      },
      // Check-in con captura ID es chargeback evidence (Visa CRR §5.9.2)
      retentionOverride: 'PERMANENT',
    })
  }

  recordCheckout(args: {
    stayId: string
    actorStaffId: string
    actorRole?: SystemRole
    organizationId: string
    actualCheckoutAt: Date
    isEarly?: boolean
  }) {
    this.emit(args.isEarly ? Events.STAY_EARLY_CHECKOUT : Events.STAY_CHECKOUT, {
      actorStaffId: args.actorStaffId,
      actorRole: args.actorRole,
      organizationId: args.organizationId,
      target: args.stayId,
      payload: {
        actualCheckoutAt: args.actualCheckoutAt.toISOString(),
        isEarly: !!args.isEarly,
      },
      retentionOverride: 'PERMANENT', // cobro final cierra folio fiscal
    })
  }

  recordLateCheckout(args: {
    stayId: string
    actorStaffId: string
    actorRole?: SystemRole
    organizationId: string
    tier: number
    fee?: number
  }) {
    this.emit(Events.STAY_LATE_CHECKOUT, {
      actorStaffId: args.actorStaffId,
      actorRole: args.actorRole,
      organizationId: args.organizationId,
      target: args.stayId,
      payload: { tier: args.tier, fee: args.fee ?? 0 },
    })
  }

  recordStayUpdated(args: {
    stayId: string
    actorStaffId: string
    actorRole?: SystemRole
    organizationId: string
    changes: Record<string, { from: unknown; to: unknown }>
    phase: 'PRE_CHECKIN' | 'POST_CHECKIN'
    reason?: string
  }) {
    this.emit(Events.STAY_UPDATED, {
      actorStaffId: args.actorStaffId,
      actorRole: args.actorRole,
      organizationId: args.organizationId,
      target: args.stayId,
      payload: { changes: args.changes, phase: args.phase },
      reason: args.reason,
      // POST_CHECKIN edits son auditoría sensible (puede afectar guest profile fiscal)
      retentionOverride: args.phase === 'POST_CHECKIN' ? 'PERMANENT' : 'STANDARD',
    })
  }

  recordStayExtended(args: {
    stayId: string
    actorStaffId: string
    actorRole?: SystemRole
    organizationId: string
    newCheckOut: Date
    previousCheckOut: Date
    reason?: string
  }) {
    this.emit(Events.STAY_EXTENDED, {
      actorStaffId: args.actorStaffId,
      actorRole: args.actorRole,
      organizationId: args.organizationId,
      target: args.stayId,
      payload: {
        newCheckOut: args.newCheckOut.toISOString(),
        previousCheckOut: args.previousCheckOut.toISOString(),
      },
      reason: args.reason,
    })
  }

  recordRoomMoved(args: {
    stayId: string
    actorStaffId: string
    actorRole?: SystemRole
    organizationId: string
    fromRoomId: string
    toRoomId: string
    reason?: string
  }) {
    this.emit(Events.STAY_ROOM_MOVED, {
      actorStaffId: args.actorStaffId,
      actorRole: args.actorRole,
      organizationId: args.organizationId,
      target: args.stayId,
      payload: { fromRoomId: args.fromRoomId, toRoomId: args.toRoomId },
      reason: args.reason,
    })
  }

  recordRoomsSwapped(args: {
    stayIdA: string
    stayIdB: string
    actorStaffId: string
    actorRole?: SystemRole
    organizationId: string
    reason?: string
  }) {
    // Un solo evento — el listener decide si crea 1 o 2 entries en audit_log.
    // Target = "<stayIdA>+<stayIdB>" pattern para que sea greppable.
    this.emit(Events.STAY_ROOMS_SWAPPED, {
      actorStaffId: args.actorStaffId,
      actorRole: args.actorRole,
      organizationId: args.organizationId,
      target: `${args.stayIdA}+${args.stayIdB}`,
      payload: { stayIdA: args.stayIdA, stayIdB: args.stayIdB },
      reason: args.reason,
    })
  }

  recordStayRestored(args: {
    stayId: string
    actorStaffId: string
    actorRole?: SystemRole
    organizationId: string
    reason?: string
  }) {
    this.emit(Events.STAY_RESTORED, {
      actorStaffId: args.actorStaffId,
      actorRole: args.actorRole,
      organizationId: args.organizationId,
      target: args.stayId,
      payload: {},
      reason: args.reason,
      // Restore después de cancel = puede afectar disputa Visa — permanente
      retentionOverride: 'PERMANENT',
    })
  }

  recordNoShowMarked(args: {
    stayId: string
    actorStaffId: string
    actorRole?: SystemRole
    organizationId: string
    feeAmount: number
    feeCurrency: string
    reason?: string
  }) {
    this.emit(Events.NOSHOW_MARKED, {
      actorStaffId: args.actorStaffId,
      actorRole: args.actorRole,
      organizationId: args.organizationId,
      target: args.stayId,
      payload: { feeAmount: args.feeAmount, feeCurrency: args.feeCurrency },
      reason: args.reason,
      retentionOverride: 'PERMANENT', // Visa CRR + ISAHC evidence
    })
  }

  recordNoShowReverted(args: {
    stayId: string
    actorStaffId: string
    actorRole?: SystemRole
    organizationId: string
    reason?: string
  }) {
    this.emit(Events.NOSHOW_REVERTED, {
      actorStaffId: args.actorStaffId,
      actorRole: args.actorRole,
      organizationId: args.organizationId,
      target: args.stayId,
      payload: {},
      reason: args.reason,
      retentionOverride: 'PERMANENT',
    })
  }

  recordNoShowChargeRegistered(args: {
    stayId: string
    actorStaffId: string
    actorRole?: SystemRole
    organizationId: string
    status: 'CHARGED' | 'FAILED' | 'WAIVED'
    method: string
    reference: string | null
    amount?: number
    currency?: string
    reason?: string
  }) {
    this.emit(Events.NOSHOW_CHARGE_REGISTERED, {
      actorStaffId: args.actorStaffId,
      actorRole: args.actorRole,
      organizationId: args.organizationId,
      target: args.stayId,
      payload: {
        status: args.status,
        method: args.method,
        reference: args.reference,
        amount: args.amount,
        currency: args.currency,
      },
      reason: args.reason,
      retentionOverride: 'PERMANENT',
    })
  }

  recordPaymentRegistered(args: {
    paymentLogId: string
    stayId: string
    actorStaffId: string
    actorRole?: SystemRole
    organizationId: string
    method: string
    amount: number
    currency: string
    reference: string | null
    appliesToStayIds?: string[]
    paidByStayId?: string | null
  }) {
    this.emit(Events.PAYMENT_REGISTERED, {
      actorStaffId: args.actorStaffId,
      actorRole: args.actorRole,
      organizationId: args.organizationId,
      // Target = paymentLogId — permite query directo "auditoría de este pago"
      target: args.paymentLogId,
      payload: {
        paymentLogId: args.paymentLogId,
        stayId: args.stayId,
        method: args.method,
        amount: args.amount,
        currency: args.currency,
        reference: args.reference,
        appliesToStayIds: args.appliesToStayIds,
        paidByStayId: args.paidByStayId ?? null,
      },
      retentionOverride: 'PERMANENT', // chargeback evidence + CFDI compliance
    })
  }

  recordPaymentVoided(args: {
    paymentLogId: string
    voidingLogId: string
    stayId: string
    actorStaffId: string
    actorRole?: SystemRole
    organizationId: string
    reason: string // void siempre exige reason
  }) {
    this.emit(Events.PAYMENT_VOIDED, {
      actorStaffId: args.actorStaffId,
      actorRole: args.actorRole,
      organizationId: args.organizationId,
      target: args.paymentLogId,
      payload: {
        paymentLogId: args.paymentLogId,
        voidingLogId: args.voidingLogId,
        stayId: args.stayId,
      },
      reason: args.reason,
      retentionOverride: 'PERMANENT', // void es operación sensible per §28
    })
  }

  recordCancelRefundRegistered(args: {
    stayId: string
    actorStaffId: string
    actorRole?: SystemRole
    organizationId: string
    status: 'REFUNDED' | 'WAIVED'
    amount: number
    method: string
    reference: string | null
    reason?: string
  }) {
    this.emit(Events.CANCEL_REFUND_REGISTERED, {
      actorStaffId: args.actorStaffId,
      actorRole: args.actorRole,
      organizationId: args.organizationId,
      target: args.stayId,
      payload: {
        status: args.status,
        amount: args.amount,
        method: args.method,
        reference: args.reference,
      },
      reason: args.reason,
      retentionOverride: 'PERMANENT', // CFDI E + Visa CRR
    })
  }
}
