import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * MetricsService — Sprint RATES-METRICS-COMPSET-CORE Fase 2 (D-METRICS1, 2026-06-03).
 *
 * `computeDailySnapshot` calcula los KPIs de UN día y los persiste en
 * `MetricsDailySnapshot` (upsert idempotente por [property, date]). Lo llama el
 * NightAuditScheduler cada noche; `backfillSnapshots` reconstruye el histórico
 * desde las reservas existentes (los KPIs de actuals SÍ se reconstruyen; pace/
 * pickup/STLY NO — esos requieren capturar on-the-books a futuro, día a día).
 *
 * Definiciones USALI:
 *   - Ocupación = roomsSold ÷ totalRoomsAvailable
 *   - ADR       = roomRevenue ÷ roomsSold
 *   - RevPAR    = roomRevenue ÷ totalRoomsAvailable (= ADR × ocupación)
 * Una "noche D" = [00:00 D, 00:00 D+1). Una stay la ocupa si checkin < finNoche y
 * checkout > inicioNoche (el día de checkout NO cuenta como noche).
 */
@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name)

  constructor(private readonly prisma: PrismaService) {}

  /** Computa + persiste el snapshot de un día. NO usa TenantContext (lo llama el
   *  cron, sin request) — el caller pasa el propertyId + organizationId. */
  async computeDailySnapshot(propertyId: string, organizationId: string, date: Date) {
    const nightStart = startOfUtcDay(date)
    const nightEnd = addDaysUtc(nightStart, 1)

    // Stays que ocupan la noche D (excluye cancel + no-show).
    const occupying = await this.prisma.guestStay.findMany({
      where: {
        propertyId, organizationId, deletedAt: null, cancelledAt: null, noShowAt: null,
        checkinAt: { lt: nightEnd }, scheduledCheckout: { gt: nightStart },
      },
      select: { roomId: true, ratePerNight: true, currency: true, source: true, room: { select: { roomTypeId: true } } },
    })

    const soldRoomIds = new Set(occupying.map((s) => s.roomId))
    const roomsSold = soldRoomIds.size
    const roomRevenue = round2(occupying.reduce((a, s) => a + Number(s.ratePerNight), 0))

    // Capacidad: habitaciones vendibles (no eliminadas, no fuera de servicio).
    const totalRoomsAvailable = await this.prisma.room.count({
      where: { propertyId, organizationId, deletedAt: null, status: { not: 'OUT_OF_SERVICE' } },
    })

    const occupancyPercent = totalRoomsAvailable > 0 ? round2((roomsSold / totalRoomsAvailable) * 100) : 0
    const adr = roomsSold > 0 ? round2(roomRevenue / roomsSold) : 0
    const revpar = totalRoomsAvailable > 0 ? round2(roomRevenue / totalRoomsAvailable) : 0

    // Channel mix + revenue por room type de la noche.
    const channelMix: Record<string, number> = {}
    const revenueByRoomType: Record<string, { rooms: number; revenue: number }> = {}
    for (const s of occupying) {
      const ch = (s.source ?? 'DIRECT').toUpperCase()
      channelMix[ch] = (channelMix[ch] ?? 0) + 1
      const rt = s.room?.roomTypeId ?? 'unknown'
      const e = (revenueByRoomType[rt] ??= { rooms: 0, revenue: 0 })
      e.rooms += 1
      e.revenue = round2(e.revenue + Number(s.ratePerNight))
    }
    const baseCurrency = occupying[0]?.currency ?? 'USD'

    // Eventos del día (por fecha de cancelledAt/noShowAt/checkinAt/scheduledCheckout).
    const [cancellationsCount, noShowsCount, arrivals] = await Promise.all([
      this.prisma.guestStay.count({ where: { propertyId, organizationId, cancelledAt: { gte: nightStart, lt: nightEnd } } }),
      this.prisma.guestStay.count({ where: { propertyId, organizationId, noShowAt: { gte: nightStart, lt: nightEnd } } }),
      this.prisma.guestStay.findMany({
        where: { propertyId, organizationId, deletedAt: null, cancelledAt: null, noShowAt: null, checkinAt: { gte: nightStart, lt: nightEnd } },
        select: { checkinAt: true, scheduledCheckout: true, bookingLeadDays: true },
      }),
    ])
    const departuresCount = await this.prisma.guestStay.count({
      where: { propertyId, organizationId, deletedAt: null, cancelledAt: null, noShowAt: null, scheduledCheckout: { gte: nightStart, lt: nightEnd } },
    })

    const arrivalsCount = arrivals.length
    const avgLengthOfStay = arrivalsCount > 0
      ? round2(arrivals.reduce((a, s) => a + nightsBetween(s.checkinAt, s.scheduledCheckout), 0) / arrivalsCount)
      : null
    const leads = arrivals.map((s) => s.bookingLeadDays).filter((v): v is number => v != null)
    const avgLeadTime = leads.length > 0 ? round2(leads.reduce((a, v) => a + v, 0) / leads.length) : null

    return this.prisma.metricsDailySnapshot.upsert({
      where: { propertyId_date: { propertyId, date: nightStart } },
      create: {
        propertyId, date: nightStart, totalRoomsAvailable, roomsSold, occupancyPercent,
        roomRevenue, baseCurrency, adr, revpar, cancellationsCount, noShowsCount,
        arrivalsCount, departuresCount, avgLengthOfStay, avgLeadTime,
        channelMix, revenueByRoomType,
      },
      update: {
        computedAt: new Date(), totalRoomsAvailable, roomsSold, occupancyPercent,
        roomRevenue, baseCurrency, adr, revpar, cancellationsCount, noShowsCount,
        arrivalsCount, departuresCount, avgLengthOfStay, avgLeadTime,
        channelMix, revenueByRoomType,
      },
    })
  }

  /** Reconstruye snapshots desde `fromDate` hasta ayer (inclusive). Idempotente. */
  async backfillSnapshots(propertyId: string, organizationId: string, fromDate: Date) {
    let cursor = startOfUtcDay(fromDate)
    const yesterday = addDaysUtc(startOfUtcDay(new Date()), -1)
    let rowsCreated = 0
    while (cursor.getTime() <= yesterday.getTime()) {
      await this.computeDailySnapshot(propertyId, organizationId, cursor)
      rowsCreated += 1
      cursor = addDaysUtc(cursor, 1)
      if (rowsCreated > 800) break // backstop ~2 años
    }
    this.logger.log(`[Metrics] backfill property=${propertyId} from=${fromDate.toISOString().slice(0, 10)} rows=${rowsCreated}`)
    return { rowsCreated }
  }

  /** Snapshots de un rango para charts (orden cronológico). */
  async getRange(propertyId: string, organizationId: string, from: Date, to: Date) {
    return this.prisma.metricsDailySnapshot.findMany({
      where: { propertyId, property: { organizationId }, date: { gte: startOfUtcDay(from), lte: startOfUtcDay(to) } },
      orderBy: { date: 'asc' },
    })
  }

  // ──────────────────────────────────────────────────────────────────
  // D-METRICS3 — Forward capture (pace/pickup/STLY).
  // ──────────────────────────────────────────────────────────────────

  /**
   * Captura "on-the-books" para cada noche futura `[asOfDate, asOfDate + horizonDays)`.
   * Idempotente por [property, asOfDate, stayDate] (upsert). Lo llama el scheduler
   * cada noche, después del snapshot del día que cerró.
   */
  async captureForwardSnapshot(
    propertyId: string,
    organizationId: string,
    asOfDate: Date,
    horizonDays = 90,
  ): Promise<{ stays: number }> {
    const asOf = startOfUtcDay(asOfDate)
    const horizonEnd = addDaysUtc(asOf, horizonDays)

    // Stays con cualquier noche dentro del horizonte (creadas antes del corte).
    const stays = await this.prisma.guestStay.findMany({
      where: {
        propertyId,
        organizationId,
        deletedAt: null,
        cancelledAt: null,
        noShowAt: null,
        createdAt: { lte: addDaysUtc(asOf, 1) }, // sólo lo que ya existía AS-OF
        checkinAt: { lt: horizonEnd },
        scheduledCheckout: { gt: asOf },
      },
      select: { roomId: true, checkinAt: true, scheduledCheckout: true, ratePerNight: true, currency: true },
    })

    const totalRoomsAvailable = await this.prisma.room.count({
      where: { propertyId, organizationId, deletedAt: null, status: { not: 'OUT_OF_SERVICE' } },
    })

    // Agregar por noche futura.
    type Bucket = { rooms: Set<string>; revenue: number; currency: string }
    const buckets = new Map<number, Bucket>()
    for (const s of stays) {
      const start = startOfUtcDay(s.checkinAt).getTime()
      const end = startOfUtcDay(s.scheduledCheckout).getTime()
      const horizonStart = asOf.getTime()
      const horizonStop = horizonEnd.getTime()
      for (let t = Math.max(start, horizonStart); t < Math.min(end, horizonStop); t += 86400000) {
        const b = buckets.get(t) ?? { rooms: new Set<string>(), revenue: 0, currency: s.currency }
        b.rooms.add(s.roomId)
        b.revenue = round2(b.revenue + Number(s.ratePerNight))
        buckets.set(t, b)
      }
    }

    // Upsert una row por noche del horizonte (también si no hay ventas → ceros,
    // así pace/pickup puede comparar contra rows existentes sin huecos).
    for (let t = asOf.getTime(); t < horizonEnd.getTime(); t += 86400000) {
      const stayDate = new Date(t)
      const b = buckets.get(t)
      const roomsOnBooks = b ? b.rooms.size : 0
      const roomRevenue = b ? round2(b.revenue) : 0
      const baseCurrency = b?.currency ?? 'USD'
      const occupancyPercent = totalRoomsAvailable > 0 ? round2((roomsOnBooks / totalRoomsAvailable) * 100) : 0
      const adr = roomsOnBooks > 0 ? round2(roomRevenue / roomsOnBooks) : 0
      const revpar = totalRoomsAvailable > 0 ? round2(roomRevenue / totalRoomsAvailable) : 0
      await this.prisma.metricsForwardSnapshot.upsert({
        where: { propertyId_asOfDate_stayDate: { propertyId, asOfDate: asOf, stayDate } },
        create: {
          propertyId, asOfDate: asOf, stayDate, totalRoomsAvailable, roomsOnBooks,
          occupancyPercent, roomRevenue, baseCurrency, adr, revpar,
        },
        update: {
          computedAt: new Date(), totalRoomsAvailable, roomsOnBooks, occupancyPercent,
          roomRevenue, baseCurrency, adr, revpar,
        },
      })
    }
    return { stays: stays.length }
  }

  /**
   * Pickup(N): cuántas hab. y cuánto revenue entró ENTRE [asOf−N, asOf] para cada
   * noche futura. Devuelve la última asOf, la asOf comparada, y un array por noche.
   */
  async getPickup(
    propertyId: string,
    organizationId: string,
    asOfDate: Date,
    daysAgo: number,
    horizonDays = 30,
  ) {
    const asOfNow = startOfUtcDay(asOfDate)
    const asOfPrev = addDaysUtc(asOfNow, -daysAgo)
    const horizonEnd = addDaysUtc(asOfNow, horizonDays)

    const [now, prev] = await Promise.all([
      this.prisma.metricsForwardSnapshot.findMany({
        where: {
          propertyId, property: { organizationId },
          asOfDate: asOfNow,
          stayDate: { gte: asOfNow, lt: horizonEnd },
        },
        orderBy: { stayDate: 'asc' },
      }),
      this.prisma.metricsForwardSnapshot.findMany({
        where: {
          propertyId, property: { organizationId },
          asOfDate: asOfPrev,
          stayDate: { gte: asOfNow, lt: horizonEnd },
        },
      }),
    ])
    const prevByDate = new Map(prev.map((r) => [r.stayDate.getTime(), r]))
    const series = now.map((r) => {
      const p = prevByDate.get(r.stayDate.getTime())
      const prevRooms = p?.roomsOnBooks ?? 0
      const prevRevenue = p ? Number(p.roomRevenue) : 0
      return {
        stayDate: r.stayDate,
        roomsOnBooks: r.roomsOnBooks,
        roomsPickup: r.roomsOnBooks - prevRooms,
        revenue: Number(r.roomRevenue),
        revenuePickup: round2(Number(r.roomRevenue) - prevRevenue),
        occupancyPercent: Number(r.occupancyPercent),
        adr: Number(r.adr),
        baseCurrency: r.baseCurrency,
      }
    })
    return { asOfDate: asOfNow, comparedTo: asOfPrev, daysAgo, series }
  }

  /**
   * Pace YoY: on-the-books AS-OF hoy para noche D, vs on-the-books AS-OF hace-1-año
   * para noche D−365 ("same time last year"). Útil cuando hay ≥1 año de histórico.
   */
  async getPace(propertyId: string, organizationId: string, asOfDate: Date, horizonDays = 90) {
    const asOfNow = startOfUtcDay(asOfDate)
    const asOfStly = addDaysUtc(asOfNow, -365)
    const horizonEnd = addDaysUtc(asOfNow, horizonDays)

    const [now, stly] = await Promise.all([
      this.prisma.metricsForwardSnapshot.findMany({
        where: {
          propertyId, property: { organizationId },
          asOfDate: asOfNow,
          stayDate: { gte: asOfNow, lt: horizonEnd },
        },
        orderBy: { stayDate: 'asc' },
      }),
      this.prisma.metricsForwardSnapshot.findMany({
        where: {
          propertyId, property: { organizationId },
          asOfDate: asOfStly,
          stayDate: { gte: asOfStly, lt: addDaysUtc(asOfStly, horizonDays) },
        },
      }),
    ])
    const stlyByOffset = new Map<number, (typeof stly)[number]>()
    for (const r of stly) {
      const offset = Math.round((r.stayDate.getTime() - asOfStly.getTime()) / 86400000)
      stlyByOffset.set(offset, r)
    }
    const series = now.map((r) => {
      const offset = Math.round((r.stayDate.getTime() - asOfNow.getTime()) / 86400000)
      const s = stlyByOffset.get(offset)
      return {
        stayDate: r.stayDate,
        roomsOnBooks: r.roomsOnBooks,
        stlyRoomsOnBooks: s?.roomsOnBooks ?? null,
        occupancyPercent: Number(r.occupancyPercent),
        stlyOccupancyPercent: s ? Number(s.occupancyPercent) : null,
        baseCurrency: r.baseCurrency,
      }
    })
    return { asOfDate: asOfNow, stlyAsOfDate: asOfStly, series }
  }

  // ──────────────────────────────────────────────────────────────────
  // Reporte tabular de Métricas diarias (Estándar de Reportes).
  // Molde idéntico a reports.service.buildNoShowReportRows / getNoShowReportTable.
  // ──────────────────────────────────────────────────────────────────

  /**
   * Construye las filas del reporte de Métricas diarias (una fila por snapshot).
   * Los totales agregan al estilo USALI: ocupación = Σhab.vendidas ÷ Σhab.disponibles,
   * ADR = Σingreso ÷ Σhab.vendidas, RevPAR = Σingreso ÷ Σhab.disponibles — NO el
   * promedio aritmético de las tasas diarias.
   */
  async buildMetricsReportRows(
    propertyId: string,
    organizationId: string,
    params: { from: string; to: string; sort?: string; dir?: string },
  ) {
    const snapshots = await this.getRange(propertyId, organizationId, new Date(params.from), new Date(params.to))

    // Divisa dominante (la más frecuente entre los snapshots del rango).
    const curCount = new Map<string, number>()
    for (const s of snapshots) curCount.set(s.baseCurrency, (curCount.get(s.baseCurrency) ?? 0) + 1)
    const currency = [...curCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD'

    const rows = snapshots.map((s) => ({
      id: s.id,
      date: s.date.toISOString(),
      occupancy: Number(s.occupancyPercent),
      roomsSold: s.roomsSold,
      roomsAvailable: s.totalRoomsAvailable,
      adr: Number(s.adr),
      revpar: Number(s.revpar),
      revenue: Number(s.roomRevenue),
      arrivals: s.arrivalsCount,
      departures: s.departuresCount,
      cancellations: s.cancellationsCount,
      noShows: s.noShowsCount,
      currency: s.baseCurrency,
    }))

    const SORTABLE = [
      'date', 'occupancy', 'roomsSold', 'adr', 'revpar',
      'revenue', 'arrivals', 'departures', 'cancellations', 'noShows',
    ] as const
    const sortKey = (SORTABLE as readonly string[]).includes(params.sort ?? '') ? (params.sort as (typeof SORTABLE)[number]) : 'date'
    const dir = params.dir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      const va = a[sortKey] as string | number
      const vb = b[sortKey] as string | number
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir
    })

    // Totales agregados (no naive average — método USALI). Per-divisa SUM-able
    // (D-CASH3): el total agrega solo las filas de la divisa dominante; las filas
    // en otra divisa se muestran en el listado pero no suman (sumar montos de
    // distinta divisa sería incorrecto). En operación normal una property usa una
    // sola divisa → no se excluye nada.
    const inCur = rows.filter((r) => r.currency === currency)
    const sumRevenue = round2(inCur.reduce((s, r) => s + r.revenue, 0))
    const sumSold = inCur.reduce((s, r) => s + r.roomsSold, 0)
    const sumAvail = inCur.reduce((s, r) => s + r.roomsAvailable, 0)
    const totals = {
      days: inCur.length,
      occupancy: sumAvail > 0 ? round2((sumSold / sumAvail) * 100) : 0,
      roomsSold: sumSold,
      adr: sumSold > 0 ? round2(sumRevenue / sumSold) : 0,
      revpar: sumAvail > 0 ? round2(sumRevenue / sumAvail) : 0,
      revenue: sumRevenue,
      arrivals: inCur.reduce((s, r) => s + r.arrivals, 0),
      departures: inCur.reduce((s, r) => s + r.departures, 0),
      cancellations: inCur.reduce((s, r) => s + r.cancellations, 0),
      noShows: inCur.reduce((s, r) => s + r.noShows, 0),
    }
    return { rows, totals, currency, sort: sortKey, dir: dir === 1 ? 'asc' : 'desc' }
  }

  async getMetricsReportTable(
    propertyId: string,
    organizationId: string,
    params: { from: string; to: string; sort?: string; dir?: string; page?: number; pageSize?: number },
  ) {
    const r = await this.buildMetricsReportRows(propertyId, organizationId, params)
    const page = Math.max(1, params.page ?? 1)
    const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 25))
    return {
      rows: r.rows.slice((page - 1) * pageSize, page * pageSize),
      total: r.rows.length,
      totals: r.totals,
      currency: r.currency,
      sort: r.sort,
      dir: r.dir,
      page,
      pageSize,
    }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0))
}
function addDaysUtc(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000)
}
function nightsBetween(checkin: Date, checkout: Date): number {
  return Math.max(0, Math.round((startOfUtcDay(checkout).getTime() - startOfUtcDay(checkin).getTime()) / 86400000))
}
