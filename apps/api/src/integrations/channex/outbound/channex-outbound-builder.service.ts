import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { createHash } from 'crypto'
import { PrismaService } from '../../../prisma/prisma.service'
import {
  ChannexAvailabilityEntry,
  ChannexRestrictionEntry,
} from '../channex.gateway'
import {
  CHANNEX_AVAILABILITY_CHANGED,
  CHANNEX_RESTRICTION_UPDATED,
  ChannexAvailabilityChangedEvent,
  ChannexRestrictionUpdatedEvent,
} from './channex-outbound-events'

/**
 * ChannexOutboundBuilderService — D-CHX-OUT-1, AP-2.2 mitigation.
 *
 * Event listener entre los save handlers del PMS y la cola outbound.
 *
 * **Por qué existe** (cert AP-2.2): si el save handler de Rates llamara
 * directo a `Gateway.pushRestrictions(...)`, dos consecuencias graves:
 *   1. Si Channex está caído/lento, el recepcionista NO puede guardar el
 *      cambio de precio (la petición HTTP bloquea la transacción local).
 *   2. No podemos respetar rate limit 20 ARI/min — cada acción del usuario
 *      dispara HTTP inmediato.
 *
 * Patrón correcto: el save handler emite domain event vía EventEmitter
 * NestJS → este servicio escucha → persiste row en ChannexOutboundQueue →
 * ChannexOutboundWorker drena la cola respetando rate limit.
 *
 * **Por qué EventEmitter y no polling DB** (AP-2.1): la doc oficial dice:
 * "A mechanism in your PMS that detects ARI changes as they happen — not
 * a polling loop over your database." Domain events son IN-PROCESS y
 * inmediatos (latencia 0ms vs polling cron tick).
 *
 * Dedup vía payloadHash: si el mismo delta llega 2× en <5s (double-click
 * del recepcionista por ejemplo), persistimos solo el primero. El hash es
 * SHA-256 sobre kind+propertyId+normalized(entries).
 */
@Injectable()
export class ChannexOutboundBuilderService {
  private readonly logger = new Logger(ChannexOutboundBuilderService.name)
  private static readonly DEDUP_WINDOW_MS = 5_000

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Listener: cambio de availability local → encola row AVAILABILITY.
   *
   * Emitido por AvailabilityService al crear/cancelar/mover stay, al
   * activar/expirar Block, etc. El payload trae el delta exacto (no full
   * recompute) — alineado con AP-3 (delta-only).
   */
  @OnEvent(CHANNEX_AVAILABILITY_CHANGED)
  async onAvailabilityChanged(args: ChannexAvailabilityChangedEvent): Promise<void> {
    if (!args.entries || args.entries.length === 0) return
    await this.enqueue({
      propertyId: args.propertyId,
      kind: 'AVAILABILITY',
      priority: 100, // Channex prioriza avail vs rates/restrictions
      payload: { entries: args.entries },
    })
  }

  /**
   * Listener: cambio de rate/restriction local → encola row RATES_RESTRICTIONS.
   *
   * Emitido por RatesService (cuando se actualiza un RatePlan / RateOverride)
   * y por RestrictionsService (CTA, CTD, min/max stay, stop sell). El
   * payload trae entries del shape ChannexRestrictionEntry — AT LEAST ONE
   * restriction field debe estar populated (Channex requirement).
   */
  @OnEvent(CHANNEX_RESTRICTION_UPDATED)
  async onRestrictionUpdated(args: ChannexRestrictionUpdatedEvent): Promise<void> {
    if (!args.entries || args.entries.length === 0) return
    await this.enqueue({
      propertyId: args.propertyId,
      kind: 'RATES_RESTRICTIONS',
      priority: 50,
      payload: { entries: args.entries },
    })
  }

  /**
   * Core enqueue logic con dedup. Pública para que el FullSyncOrchestrator
   * (Day 4) la use directo sin emitir event (full sync no es delta — se
   * salta el path de events).
   */
  async enqueue(args: {
    propertyId: string
    kind: 'AVAILABILITY' | 'RATES_RESTRICTIONS'
    priority: number
    payload: { entries: unknown[] }
  }): Promise<{ outboxId: string | null; deduped: boolean }> {
    const payloadHash = ChannexOutboundBuilderService.hashPayload(
      args.kind,
      args.propertyId,
      args.payload,
    )

    // Dedup: si hay un row con mismo hash PENDING/IN_PROGRESS creado en
    // los últimos 5s, skipeamos (anti-flood double-click).
    const since = new Date(Date.now() - ChannexOutboundBuilderService.DEDUP_WINDOW_MS)
    const recent = await this.prisma.channexOutboundQueue.findFirst({
      where: {
        payloadHash,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        createdAt: { gte: since },
      },
      select: { id: true },
    })
    if (recent) {
      this.logger.debug(
        `[Channex outbound] dedup ${args.kind} property=${args.propertyId} ` +
          `hash=${payloadHash.slice(0, 8)} existing=${recent.id}`,
      )
      return { outboxId: null, deduped: true }
    }

    const row = await this.prisma.channexOutboundQueue.create({
      data: {
        propertyId: args.propertyId,
        kind: args.kind,
        payload: args.payload as Prisma.InputJsonValue,
        status: 'PENDING',
        priority: args.priority,
        payloadHash,
      },
      select: { id: true },
    })

    this.logger.log(
      `[Channex outbound] enqueued ${args.kind} property=${args.propertyId} ` +
        `entries=${args.payload.entries.length} row=${row.id}`,
    )
    return { outboxId: row.id, deduped: false }
  }

  /**
   * SHA-256 hash sobre kind + propertyId + entries normalizadas (sorted keys).
   * Determinístico: misma data produce mismo hash → dedup confiable.
   *
   * Static + exported para que specs puedan verificar hash equality sin DI.
   */
  static hashPayload(
    kind: string,
    propertyId: string,
    payload: { entries: unknown[] },
  ): string {
    const normalized = JSON.stringify({
      kind,
      propertyId,
      entries: payload.entries.map((e) =>
        // Sort keys per entry para que { a:1, b:2 } y { b:2, a:1 } produzcan
        // el mismo hash.
        JSON.parse(JSON.stringify(e, Object.keys(e as object).sort())),
      ),
    })
    return createHash('sha256').update(normalized).digest('hex')
  }
}
