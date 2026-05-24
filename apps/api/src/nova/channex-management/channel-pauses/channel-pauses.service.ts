/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 7.
 *
 * ChannelPausesService — pausar/despausar un channel OTA (Booking.com /
 * Expedia / Airbnb / Hostelworld / etc.) emulando "snooze channel" estilo
 * Cloudbeds (§"D-CHX-CC-7", schema en Day 2).
 *
 * Por qué emulamos:
 *   · Channex NO expone "pause channel" nativo — la API solo expone
 *     stop_sell=true a nivel rate plan via /restrictions endpoint.
 *   · Para "pausar Booking sin desconectar la integración" necesitamos:
 *       1. Tomar snapshot del estado actual de stop_sell de TODOS los
 *          rate plans del property (preState — para restore exacto).
 *       2. Aplicar stop_sell=true a todos los rate plans expuestos en ese
 *          channel (rango fechas now → now+365d).
 *       3. Persistir ChannexChannelPause row con preState + pausedAt + actor.
 *     Unpause:
 *       1. Leer preState.
 *       2. Aplicar stop_sell=preState[ratePlanId][date] (restore exacto).
 *       3. Marcar unpausedAt + unpausedById en la row existente.
 *
 * Nota arquitectura: NO ataca Channex channel mapping directly (eso
 * desconectaría el channel). Solo bloquea ventas via restrictions.
 * El channel sigue "encendido" — recibe webhooks, mapping intacto.
 *
 * Cuándo lo usa el cliente:
 *   · Renovación / mantenimiento → "Pausa Booking 3 días, no quiero más
 *     reservas mientras pintamos lobby".
 *   · Disputa con OTA → "Pausa Expedia hasta resolver el chargeback".
 *   · Estrategia comercial temporal → "Pausa Airbnb sept-oct,
 *     concentrémonos en direct".
 *
 * Anti-pattern explícito: NUNCA borrar el channel mapping en Channex.
 * Si el cliente quiere "desconectar definitivo" (no pausar), eso requiere
 * acción Channex extranet — fuera de scope Command Center.
 */
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../prisma/prisma.service'
import { TenantContextService } from '../../../common/tenant-context.service'
import { ChannexGateway, ChannexRestrictionEntry } from '../../../integrations/channex/channex.gateway'
import {
  CHANNEX_RESTRICTION_UPDATED,
  ChannexRestrictionUpdatedEvent,
} from '../../../integrations/channex/outbound/channex-outbound-events'
import { AuditLogService } from '../../audit/audit-log.service'

// Default lookahead — 365 días forward desde now. Channex no acepta
// restrictions infinitas; este horizonte cubre el ciclo anual.
const PAUSE_HORIZON_DAYS = 365

@Injectable()
export class ChannelPausesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly gateway: ChannexGateway,
    private readonly events: EventEmitter2,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(propertyId: string) {
    const orgId = this.tenant.getActingOrgIdOrThrow()
    await this.assertPropertyInOrg(propertyId, orgId)
    return this.prisma.channexChannelPause.findMany({
      where: { propertyId },
      orderBy: { pausedAt: 'desc' },
    })
  }

  async pause(
    propertyId: string,
    channexChannelId: string,
    channelName: string,
    pauseReason: string | undefined,
    actorId: string,
    actorRole: 'PLATFORM_ADMIN' | 'PARTNER_ADMIN' | 'PARTNER_MEMBER' | 'ORG_OWNER',
    onBehalfOfUserId?: string,
    reason?: string,
  ) {
    const orgId = this.tenant.getActingOrgIdOrThrow()
    await this.assertPropertyInOrg(propertyId, orgId)
    const channexPropertyId = await this.resolveChannexPropertyId(propertyId)

    // 1. Guard: ya existe un pause activo (unpausedAt null) para este channel?
    const existing = await this.prisma.channexChannelPause.findFirst({
      where: { propertyId, channexChannelId, unpausedAt: null },
    })
    if (existing) {
      throw new ConflictException(
        `Channel ${channelName} ya está pausado desde ${existing.pausedAt.toISOString()}. Despausar primero.`,
      )
    }

    // 2. Pull current state de stop_sell para todos rate plans + 365d window.
    //    Esto se persiste como preState para restore exacto en unpause.
    const today = new Date()
    const horizon = new Date(today)
    horizon.setUTCDate(horizon.getUTCDate() + PAUSE_HORIZON_DAYS)
    const dateFrom = today.toISOString().slice(0, 10)
    const dateTo = horizon.toISOString().slice(0, 10)

    const mappings = await this.prisma.channexRatePlanMapping.findMany({
      where: { propertyId, organizationId: orgId, isActive: true },
      select: { channexRatePlanId: true, title: true },
    })

    if (mappings.length === 0) {
      throw new BadRequestException(
        `Property ${propertyId} no tiene rate plans activos. Crear rate plans primero antes de pausar channel.`,
      )
    }

    // Pull current restrictions per rate plan (fail-soft — si Channex devuelve
    // empty para un plan, asumimos stop_sell=false default).
    const preStateByPlan: Record<string, Record<string, boolean>> = {}
    for (const m of mappings) {
      const result = await this.gateway.listRestrictions({
        propertyId: channexPropertyId,
        ratePlanId: m.channexRatePlanId,
        dateFrom,
        dateTo,
      })
      const dateMap: Record<string, boolean> = {}
      for (const row of result.rows) {
        if (row.stop_sell !== undefined) dateMap[row.date] = row.stop_sell
      }
      preStateByPlan[m.channexRatePlanId] = dateMap
    }

    // 3. Emit restriction event = stop_sell=true para todos rate plans en window.
    //    El worker dispatchea via /restrictions Channex endpoint.
    const entries: ChannexRestrictionEntry[] = []
    for (const m of mappings) {
      entries.push({
        propertyId: channexPropertyId,
        ratePlanId: m.channexRatePlanId,
        dateFrom,
        dateTo,
        stopSell: true,
      })
    }
    const event: ChannexRestrictionUpdatedEvent = {
      propertyId: channexPropertyId,
      entries,
    }
    this.events.emit(CHANNEX_RESTRICTION_UPDATED, event)

    // 4. Persist pause row + audit.
    const created = await this.prisma.channexChannelPause.create({
      data: {
        propertyId,
        channexChannelId,
        channelName,
        pausedAt: new Date(),
        pausedById: actorId,
        pauseReason,
        preState: preStateByPlan as Prisma.JsonObject,
      },
    })

    await this.auditLog.write({
      organizationId: orgId,
      actorRealId: actorId,
      actorRealRole: actorRole,
      onBehalfOfId: onBehalfOfUserId,
      onBehalfOfRole: onBehalfOfUserId ? 'ORG_OWNER' : undefined,
      action: 'CHANNEX_CHANNEL_PAUSE',
      target: channexChannelId,
      payload: {
        propertyId,
        channexChannelId,
        channelName,
        pauseReason,
        ratePlansPaused: mappings.length,
        horizonDays: PAUSE_HORIZON_DAYS,
        dateFrom,
        dateTo,
      },
      status: 'SUCCESS',
      retentionPolicy: 'PERMANENT', // pausar OTA = decisión revenue, audit forever
      reason,
    })

    return created
  }

  async unpause(
    propertyId: string,
    pauseId: string,
    unpauseReason: string | undefined,
    actorId: string,
    actorRole: 'PLATFORM_ADMIN' | 'PARTNER_ADMIN' | 'PARTNER_MEMBER' | 'ORG_OWNER',
    onBehalfOfUserId?: string,
    reason?: string,
  ) {
    const orgId = this.tenant.getActingOrgIdOrThrow()
    await this.assertPropertyInOrg(propertyId, orgId)
    const channexPropertyId = await this.resolveChannexPropertyId(propertyId)

    const pause = await this.prisma.channexChannelPause.findFirst({
      where: { id: pauseId, propertyId },
    })
    if (!pause) {
      throw new NotFoundException(`Pause ${pauseId} no existe para property ${propertyId}`)
    }
    if (pause.unpausedAt) {
      throw new ConflictException(`Pause ${pauseId} ya fue despausado en ${pause.unpausedAt.toISOString()}`)
    }

    // Restore: por cada rate plan en preState, emitimos el stop_sell value
    // previo (false default, o el value específico per date si lo había).
    const preState = (pause.preState ?? {}) as Record<string, Record<string, boolean>>
    const entries: ChannexRestrictionEntry[] = []

    // Aplicamos stop_sell=false al range completo (las pocas fechas que
    // tenían stop_sell=true previo se vuelven a settear como excepciones).
    const today = new Date()
    const horizon = new Date(today)
    horizon.setUTCDate(horizon.getUTCDate() + PAUSE_HORIZON_DAYS)
    const dateFrom = today.toISOString().slice(0, 10)
    const dateTo = horizon.toISOString().slice(0, 10)

    const planIds = Object.keys(preState)
    if (planIds.length === 0) {
      // No preState? Defensive: get mappings actuales y abrir todo
      const mappings = await this.prisma.channexRatePlanMapping.findMany({
        where: { propertyId, organizationId: orgId, isActive: true },
        select: { channexRatePlanId: true },
      })
      for (const m of mappings) {
        entries.push({
          propertyId: channexPropertyId,
          ratePlanId: m.channexRatePlanId,
          dateFrom,
          dateTo,
          stopSell: false,
        })
      }
    } else {
      // Restore based on preState: open everything, then re-apply specific stops
      for (const planId of planIds) {
        entries.push({
          propertyId: channexPropertyId,
          ratePlanId: planId,
          dateFrom,
          dateTo,
          stopSell: false,
        })
        // Re-apply previously-true stop_sells per date
        const dateMap = preState[planId] || {}
        for (const [date, wasStoppedSelling] of Object.entries(dateMap)) {
          if (wasStoppedSelling === true) {
            entries.push({
              propertyId: channexPropertyId,
              ratePlanId: planId,
              date,
              stopSell: true,
            })
          }
        }
      }
    }

    const event: ChannexRestrictionUpdatedEvent = {
      propertyId: channexPropertyId,
      entries,
    }
    this.events.emit(CHANNEX_RESTRICTION_UPDATED, event)

    const updated = await this.prisma.channexChannelPause.update({
      where: { id: pauseId },
      data: {
        unpausedAt: new Date(),
        unpausedById: actorId,
        unpauseReason,
      },
    })

    await this.auditLog.write({
      organizationId: orgId,
      actorRealId: actorId,
      actorRealRole: actorRole,
      onBehalfOfId: onBehalfOfUserId,
      onBehalfOfRole: onBehalfOfUserId ? 'ORG_OWNER' : undefined,
      action: 'CHANNEX_CHANNEL_UNPAUSE',
      target: pause.channexChannelId,
      payload: {
        propertyId,
        pauseId,
        channelName: pause.channelName,
        unpauseReason,
        ratePlansRestored: planIds.length,
        previousStopSellsRestored: Object.values(preState).reduce(
          (sum, dateMap) => sum + Object.values(dateMap).filter((v) => v === true).length,
          0,
        ),
      },
      status: 'SUCCESS',
      retentionPolicy: 'PERMANENT',
      reason,
    })

    return updated
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async assertPropertyInOrg(propertyId: string, orgId: string): Promise<void> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, organizationId: orgId },
      select: { id: true },
    })
    if (!property) {
      throw new NotFoundException(
        `Property ${propertyId} no existe o no pertenece al acting org`,
      )
    }
  }

  private async resolveChannexPropertyId(propertyId: string): Promise<string> {
    const settings = await this.prisma.propertySettings.findUnique({
      where: { propertyId },
      select: { channexPropertyId: true },
    })
    if (!settings?.channexPropertyId) {
      throw new BadRequestException(
        `Property ${propertyId} no tiene channexPropertyId. Configurar primero via wizard.`,
      )
    }
    return settings.channexPropertyId
  }
}
