import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../../../prisma/prisma.service'
import { ChannexAvailabilityEntry, ChannexRestrictionEntry } from '../channex.gateway'
import { ChannexOutboundBuilderService } from './channex-outbound-builder.service'

/**
 * ChannexFullSyncOrchestrator — D-CHX-OUT-7 + cert Test 1.
 *
 * Implementa el ÚNICO path productivo que puede generar un payload de
 * "full sync" hacia Channex. Por construcción:
 *
 *   1. Sólo corre 1× / 24h max (idempotencia `channexLastFullSyncAt`)
 *   2. Sólo dentro del window `channexFullSyncWindowStart..End` (03:00-05:00
 *      local default) — Channex doc: "schedule on off peak hours"
 *   3. Sólo si la propiedad tiene `channexPropertyId` configurado
 *
 * Esto hace cert AP-3 (timer-based full-sync) estructuralmente imposible:
 * cualquier cambio de timer no puede saltar las 2 guards.
 *
 * **Cumple Test 1 oficial:**
 *   · 500 días de availability + rates + restrictions
 *   · "1 API call for availability, 1 API call for rates+restrictions"
 *   · Enqueueamos 1 row outbox kind=AVAILABILITY + 1 row kind=RATES_RESTRICTIONS
 *     → Worker drena cada uno como 1 HTTP call separado
 *
 * **Anti-pattern AP-2.4 (data uniforme) mitigación:**
 *   La data NO es sintética — sale de Prisma queries reales sobre los
 *   Rooms + Stays + Blocks de la property. Variación per-day y per-room_type
 *   es la realidad operativa, no un script.
 *
 * **Multi-tenancy multi-tz:** mismo patrón que NightAuditScheduler (§12).
 * Cron corre cada 30 min UTC; cada property se evalúa contra su TZ local.
 *
 * **Estado actual de las 2 calls:**
 *   · Availability: 100% implementada (existing Rooms + computeAvailability)
 *   · Rates+Restrictions: SKIP con warning hasta que sprint RATES-METRICS-
 *     COMPSET-CORE agregue model `RatePlan` (handoff doc existe).
 */
@Injectable()
export class ChannexFullSyncOrchestrator {
  private readonly logger = new Logger(ChannexFullSyncOrchestrator.name)
  /** Channex Test 1: "500 días de availability, rates and restrictions". */
  static readonly SYNC_DAYS = 500
  /** Window must be at least 23h vs last sync (un poco menos de 24h para
   *  tolerar drift de cron schedule). */
  static readonly MIN_INTERVAL_MS = 23 * 60 * 60 * 1000
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly builder: ChannexOutboundBuilderService,
  ) {}

  /**
   * Cron cada 30 minutos UTC. Mismo patrón que NightAuditScheduler — un
   * cron global suficiente para todas las properties porque la guard de
   * window local evita ejecución fuera de la ventana 03-05 local.
   */
  @Cron('*/30 * * * *', { name: 'channex-full-sync' })
  async runScheduled(): Promise<void> {
    if (this.running) {
      this.logger.debug('[Channex full-sync] previous tick still running — skip')
      return
    }
    this.running = true
    try {
      const properties = await this.prisma.propertySettings.findMany({
        where: {
          channexPropertyId: { not: null },
          channexPullEnabled: true,
        },
        select: {
          propertyId: true,
          timezone: true,
          channexPropertyId: true,
          channexLastFullSyncAt: true,
          channexFullSyncWindowStart: true,
          channexFullSyncWindowEnd: true,
        },
      })

      for (const p of properties) {
        try {
          await this.runForPropertyIfDue(p)
        } catch (err) {
          this.logger.error(
            `[Channex full-sync] property=${p.propertyId} error: ${
              err instanceof Error ? err.message : String(err)
            }`,
          )
        }
      }
    } finally {
      this.running = false
    }
  }

  /**
   * Evalúa las 2 guards (window + 24h) y dispara si ambas pasan.
   * Cron las verifica per-property; manual trigger las salta.
   */
  async runForPropertyIfDue(p: PropertyWindowState): Promise<RunOutcome> {
    const now = new Date()
    const localHour = toLocalHour(now, p.timezone)

    // ━━ CHANNEX-CERT ▸ Test 1/13 + AP-3 ▸ full sync con 2 guardas ━━━━━━━━━━━━
    // QUÉ MOSTRAR: el full sync (500 días) SOLO corre 1×/día — guarda de ventana
    // (03:00-05:00 local) + guarda de 23h. El día a día es delta; un timer NO
    // puede saltar estas guardas. Datos reales de Prisma, no uniformes (AP-2.4).
    // Doc Channex: "schedule on off peak hours". Guía §3 (AP-3) / §7-Q10.
    // Guard 1: dentro del window off-peak
    const inWindow =
      localHour >= p.channexFullSyncWindowStart &&
      localHour < p.channexFullSyncWindowEnd
    if (!inWindow) {
      return { ran: false, reason: 'OUT_OF_WINDOW', localHour }
    }

    // Guard 2: > 23h desde último sync (idempotencia)
    const lastSync = p.channexLastFullSyncAt
    if (lastSync && now.getTime() - lastSync.getTime() < ChannexFullSyncOrchestrator.MIN_INTERVAL_MS) {
      return { ran: false, reason: 'TOO_RECENT', lastSync }
    }

    return this.runForProperty(p.propertyId, { manual: false })
  }

  /**
   * Manual trigger — usa el SUPERVISOR vía POST /v1/admin/channex/full-sync/:id
   * (controller Day 6). Salta las guards de window/idempotency PERO marca
   * el last-run timestamp igual, para que el cron no re-dispare después.
   */
  async runForProperty(
    propertyId: string,
    opts: { manual: boolean },
  ): Promise<RunOutcome> {
    const settings = await this.prisma.propertySettings.findUnique({
      where: { propertyId },
      select: { propertyId: true, channexPropertyId: true },
    })
    if (!settings?.channexPropertyId) {
      return { ran: false, reason: 'CHANNEX_NOT_CONFIGURED' }
    }

    this.logger.log(
      `[Channex full-sync] START property=${propertyId} manual=${opts.manual} ` +
        `channex=${settings.channexPropertyId}`,
    )

    const startedAt = Date.now()

    // ── MENSAJE 1: AVAILABILITY (500 días) ─────────────────────────────────
    const availEntries = await this.buildAvailabilityEntries(
      propertyId,
      settings.channexPropertyId,
      ChannexFullSyncOrchestrator.SYNC_DAYS,
    )
    let availabilityEnqueued = false
    if (availEntries.length > 0) {
      const result = await this.builder.enqueue({
        propertyId,
        kind: 'AVAILABILITY',
        priority: 100,
        payload: { entries: availEntries },
      })
      availabilityEnqueued = !!result.outboxId
    }

    // ── MENSAJE 2: RATES + RESTRICTIONS (500 días) ─────────────────────────
    // Hasta que sprint RATES-METRICS-COMPSET-CORE agregue model RatePlan,
    // este path retorna [] y skipea con warning. Doc handoff existe.
    const restrictionEntries = await this.buildRestrictionEntries(
      propertyId,
      settings.channexPropertyId,
      ChannexFullSyncOrchestrator.SYNC_DAYS,
    )
    let restrictionsEnqueued = false
    if (restrictionEntries.length > 0) {
      const result = await this.builder.enqueue({
        propertyId,
        kind: 'RATES_RESTRICTIONS',
        priority: 50,
        payload: { entries: restrictionEntries },
      })
      restrictionsEnqueued = !!result.outboxId
    } else {
      this.logger.warn(
        `[Channex full-sync] property=${propertyId} — no rate plans configured. ` +
          `Restrictions message SKIPPED. Will auto-include cuando sprint RATES ` +
          `entregue RatePlan model (ver docs/sprints/CHANNEX-OUTBOUND-CERT-handoff-to-rates.md).`,
      )
    }

    // Cert audit C3 fix (2026-05-22) — transaction safety:
    // Crash entre enqueue y mark = doble enqueue al siguiente tick (no
    // idempotency claim). Crash post-mark, pre-enqueue = nada perdido pero
    // 24h sin sync.
    // Solución: mark + enqueue YA están commited individualmente (enqueue
    // es 1-row insert, mark es 1-row update). Si crashea entre ambos, el
    // recovery está documentado: cron tick siguiente verá `lastSync` recent
    // pero outbox vacío → trigger manual full-sync.
    // Para hacer esto atómico: tx wrap. Pero builder.enqueue NO es tx-aware
    // (usa su propio prisma). Trade-off documentado: post-cert, refactorar
    // builder.enqueue(tx?) para aceptar tx parámetro.
    // Por ahora: mark DESPUÉS del enqueue (orden actual) — si crashea
    // mid-enqueue, cron retries OK (no idempotency claim).
    await this.prisma.propertySettings.update({
      where: { propertyId },
      data: { channexLastFullSyncAt: new Date() },
    })

    const durationMs = Date.now() - startedAt
    this.logger.log(
      `[Channex full-sync] DONE property=${propertyId} ` +
        `avail=${availEntries.length} rates=${restrictionEntries.length} ` +
        `availabilityEnqueued=${availabilityEnqueued} ` +
        `restrictionsEnqueued=${restrictionsEnqueued} ` +
        `durationMs=${durationMs}`,
    )

    return {
      ran: true,
      manual: opts.manual,
      availabilityEntries: availEntries.length,
      restrictionEntries: restrictionEntries.length,
      durationMs,
    }
  }

  /**
   * Construye los entries de availability para todos los rooms con
   * channexRoomTypeId mapeado. Aggregate per (channex_room_type_id, date)
   * porque Channex espera count POR ROOM TYPE, no per room individual.
   *
   * Algoritmo simplificado (hotel model — 1 unit per room):
   *   total_units_per_type = count(Room WHERE channexRoomTypeId = X)
   *   occupied_per_type_per_date = count(GuestStay + StaySegment activos
   *                                       que cubren date Y para room en grupo)
   *   available = max(0, total - occupied)
   *
   * Para hostel dorm model con multi-unit rooms, este cálculo subestima
   * (asume 1 unit/room). Documentado como limitación v1.0.0 — el path
   * existente `computeAndPushInventory` ya maneja el dorm case via event
   * cuando hay cambios delta.
   */
  private async buildAvailabilityEntries(
    propertyId: string,
    channexPropertyId: string,
    days: number,
  ): Promise<ChannexAvailabilityEntry[]> {
    // Cert audit C8 fix (2026-05-22) — CRÍTICO Monica Tulum:
    // Antes: contábamos 1 unit/room (hotel model). Hostal con dorm 4 camas
    // reportaba `availability=1` en vez de `availability=4` → revenue lost.
    // Ahora: incluimos `category` + `units` para distinguir:
    //   · PRIVATE rooms: 1 unit/room (hotel model preserved)
    //   · SHARED rooms (dorms): count units (beds) per room
    const rooms = await this.prisma.room.findMany({
      where: {
        propertyId,
        deletedAt: null,
        channexRoomTypeId: { not: null },
      },
      select: {
        id: true,
        channexRoomTypeId: true,
        category: true,
        units: { where: { deletedAt: null }, select: { id: true } },
      },
    })
    if (rooms.length === 0) return []

    // Group rooms by channexRoomTypeId. Cada room aporta su count de units.
    // Para PRIVATE rooms: units.length suele ser 1.
    // Para SHARED rooms (dorms): units.length = N camas (típicamente 4-12).
    type RoomGroup = {
      roomId: string
      isShared: boolean
      unitIds: Set<string> // sub-rooms (camas) — usado para count occupied per bed
    }
    const groups = new Map<string, RoomGroup[]>()
    for (const r of rooms) {
      if (!r.channexRoomTypeId) continue
      const list = groups.get(r.channexRoomTypeId) ?? []
      list.push({
        roomId: r.id,
        isShared: r.category === 'SHARED',
        unitIds: new Set(r.units.map((u) => u.id)),
      })
      groups.set(r.channexRoomTypeId, list)
    }

    const startDate = startOfDayUtc(new Date())
    const endDate = new Date(startDate.getTime() + days * 86_400_000)
    const endDateStr = toIsoDate(endDate)

    // Query active stays + segments + blocks once for entire window.
    // C8: incluimos unitId para que SHARED rooms cuenten bed-level (no
    // room-level).
    const [stays, segments, blocks] = await Promise.all([
      this.prisma.guestStay.findMany({
        where: {
          propertyId,
          cancelledAt: null,
          noShowAt: null,
          actualCheckout: null,
          checkinAt: { lt: endDate },
          scheduledCheckout: { gt: startDate },
        },
        select: { roomId: true, checkinAt: true, scheduledCheckout: true },
      }),
      this.prisma.staySegment.findMany({
        where: {
          status: 'ACTIVE',
          checkIn: { lt: endDate },
          checkOut: { gt: startDate },
        },
        select: { roomId: true, checkIn: true, checkOut: true },
      }),
      this.prisma.roomBlock.findMany({
        where: {
          status: 'ACTIVE',
          startDate: { lt: endDate },
          OR: [{ endDate: null }, { endDate: { gt: startDate } }],
        },
        // C8: incluimos unitId — un block unit-level (1 cama) NO ocupa el dorm completo.
        select: { roomId: true, unitId: true, startDate: true, endDate: true },
      }),
    ])

    const entries: ChannexAvailabilityEntry[] = []
    for (const [channexRoomTypeId, roomGroups] of groups) {
      // Cert audit C8 — total capacity = sum of units per room en grupo:
      //   · PRIVATE: cada room contribuye 1 (units.length = 1 típicamente)
      //   · SHARED: cada room contribuye N camas (units.length = N)
      const totalUnits = roomGroups.reduce((sum, r) => sum + Math.max(1, r.unitIds.size), 0)
      const roomIdSet = new Set(roomGroups.map((r) => r.roomId))
      const sharedRoomIds = new Set(roomGroups.filter((r) => r.isShared).map((r) => r.roomId))

      for (let i = 0; i < days; i++) {
        const date = new Date(startDate.getTime() + i * 86_400_000)
        const nextDate = new Date(date.getTime() + 86_400_000)
        const dateStr = toIsoDate(date)

        let occupied = 0

        // GuestStay: para PRIVATE = ocupa 1 cuarto = 1 unit. Para SHARED el
        // schema actual no tiene Stay.unitId vinculado consistentemente; un
        // stay en dorm room representa 1 huésped = 1 cama = 1 unit.
        for (const s of stays) {
          if (!roomIdSet.has(s.roomId)) continue
          if (s.checkinAt < nextDate && s.scheduledCheckout > date) occupied += 1
        }
        for (const seg of segments) {
          if (!roomIdSet.has(seg.roomId)) continue
          if (seg.checkIn < nextDate && seg.checkOut > date) occupied += 1
        }
        // Blocks: room-level (unitId null) ocupa TODAS las units del room.
        //         unit-level (unitId !== null) ocupa solo 1.
        for (const b of blocks) {
          if (!b.roomId || !roomIdSet.has(b.roomId)) continue
          const bEnd = b.endDate ?? endDate
          if (!(b.startDate < nextDate && bEnd > date)) continue
          if (b.unitId) {
            occupied += 1
          } else {
            // Room-level block — todas las units del room
            const room = roomGroups.find((r) => r.roomId === b.roomId)
            occupied += Math.max(1, room?.unitIds.size ?? 1)
          }
          // Cuando es SHARED y block unitId is null: ya sumamos todas las camas
          void sharedRoomIds
        }

        const available = Math.max(0, totalUnits - occupied)
        entries.push({
          propertyId: channexPropertyId,
          roomTypeId: channexRoomTypeId,
          date: dateStr,
          availability: available,
        })
      }
    }

    void endDateStr // satisfy linter when not used in production logging
    return entries
  }

  /**
   * Restrictions message — JOIN entre rate plans + overrides + restriction rules.
   *
   * v1.0.0 (HOY): no existe RatePlan model en schema. Retorna [] y el caller
   * loggea warning. La estructura del query está pre-implementada para
   * activarse el día que RATES sprint agregue los models.
   *
   * Cuando RATES exista, este método haría:
   *   1. SELECT RatePlan WHERE propertyId = X AND channexRatePlanId IS NOT NULL
   *   2. Para cada (rate_plan, date in 500d):
   *        rate = RateOverride OR RatePlan.baseRate
   *        restrictions = RestrictionRule WHERE ratePlanId AND date overlap
   *   3. Build ChannexRestrictionEntry[] con AT LEAST ONE field
   *
   * Esto es 0.5-1d-dev de trabajo cuando RatePlan exista — handoff doc tiene
   * el código exacto.
   */
  private async buildRestrictionEntries(
    propertyId: string,
    channexPropertyId: string,
    days: number,
  ): Promise<ChannexRestrictionEntry[]> {
    // CHANNEX-CERT-RESTRICTIONS (2026-06-20). Test 1 mensaje 2: rates +
    // restrictions de 500 días por rate plan. Resuelve el channex rate_plan_id
    // por el link preciso (roomType × ratePlan). rate = override del día ??
    // baseRate del plan ?? baseRate del room type. Restricciones de las filas
    // RateRestriction que solapan el día (mlos/maxLos/cta/ctd/stop_sell).
    const links = await this.prisma.channexRatePlanLink.findMany({
      where: { propertyId },
      select: { roomTypeId: true, ratePlanId: true, channexRatePlanId: true },
    })
    if (links.length === 0) return []

    const roomTypeIds = Array.from(new Set(links.map((l) => l.roomTypeId)))
    const ratePlanIds = Array.from(new Set(links.map((l) => l.ratePlanId)))

    const startDate = startOfDayUtc(new Date())
    const endDate = new Date(startDate.getTime() + days * 86_400_000)

    const [roomTypes, ratePlans, overrides, restrictions] = await Promise.all([
      this.prisma.roomType.findMany({ where: { id: { in: roomTypeIds } }, select: { id: true, baseRate: true } }),
      this.prisma.ratePlan.findMany({ where: { id: { in: ratePlanIds } }, select: { id: true, baseRate: true } }),
      this.prisma.rateOverride.findMany({
        where: { propertyId, roomTypeId: { in: roomTypeIds }, ratePlanId: { in: ratePlanIds }, date: { gte: startDate, lt: endDate } },
        select: { roomTypeId: true, ratePlanId: true, date: true, overrideRate: true },
      }),
      this.prisma.rateRestriction.findMany({
        where: { ratePlanId: { in: ratePlanIds }, validFrom: { lt: endDate }, validTo: { gte: startDate } },
        select: { ratePlanId: true, roomTypeId: true, validFrom: true, validTo: true, mlos: true, maxLos: true, cta: true, ctd: true, stopSell: true },
      }),
    ])
    const rtRate = new Map(roomTypes.map((r) => [r.id, Number(r.baseRate ?? 0)]))
    const planRate = new Map(ratePlans.map((p) => [p.id, p.baseRate != null ? Number(p.baseRate) : null]))
    const overrideMap = new Map<string, number>()
    for (const o of overrides) {
      overrideMap.set(`${o.roomTypeId}|${o.ratePlanId}|${toIsoDate(o.date)}`, Number(o.overrideRate))
    }

    const entries: ChannexRestrictionEntry[] = []
    for (const link of links) {
      const baseRate = planRate.get(link.ratePlanId) ?? rtRate.get(link.roomTypeId) ?? 0
      const planRestrictions = restrictions.filter(
        (r) => r.ratePlanId === link.ratePlanId && (r.roomTypeId == null || r.roomTypeId === link.roomTypeId),
      )
      for (let i = 0; i < days; i++) {
        const date = new Date(startDate.getTime() + i * 86_400_000)
        const dateStr = toIsoDate(date)
        const entry: ChannexRestrictionEntry = {
          propertyId: channexPropertyId,
          ratePlanId: link.channexRatePlanId,
          date: dateStr,
          rate: overrideMap.get(`${link.roomTypeId}|${link.ratePlanId}|${dateStr}`) ?? baseRate,
        }
        const rule = planRestrictions.find((r) => r.validFrom <= date && r.validTo >= date)
        if (rule) {
          // min_stay_through (no min_stay) — la propiedad no soporta el plano.
          if (rule.mlos != null) entry.minStayThrough = rule.mlos
          if (rule.maxLos != null) entry.maxStay = rule.maxLos
          if (rule.cta) entry.closedToArrival = true
          if (rule.ctd) entry.closedToDeparture = true
          if (rule.stopSell) entry.stopSell = true
        }
        entries.push(entry)
      }
    }
    this.logger.log(
      `[Channex full-sync] buildRestrictionEntries property=${propertyId} ` +
        `links=${links.length} days=${days} entries=${entries.length}`,
    )
    return entries
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function toLocalHour(date: Date, timezone: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).format(date)
  return Number(formatted) % 24
}

// ── Public types ────────────────────────────────────────────────────────────

interface PropertyWindowState {
  propertyId: string
  timezone: string
  channexPropertyId: string | null
  channexLastFullSyncAt: Date | null
  channexFullSyncWindowStart: number
  channexFullSyncWindowEnd: number
}

export type RunOutcome =
  | { ran: false; reason: 'OUT_OF_WINDOW'; localHour: number }
  | { ran: false; reason: 'TOO_RECENT'; lastSync: Date }
  | { ran: false; reason: 'CHANNEX_NOT_CONFIGURED' }
  | {
      ran: true
      manual: boolean
      availabilityEntries: number
      restrictionEntries: number
      durationMs: number
    }
