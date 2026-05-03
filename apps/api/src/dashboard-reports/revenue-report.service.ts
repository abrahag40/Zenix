/**
 * RevenueReportService — builds the 7 frames consumed by the mobile
 * RevenueCarouselCard. See `docs/revenue-data-mapping.md` for the
 * detailed BD-to-frame mapping for each metric (ADR, RevPAR, etc.).
 *
 * Privacy:
 *   - Endpoint guarded; only RECEPTION / SUPERVISOR / ADMIN can call.
 *   - Service throws ForbiddenException for HOUSEKEEPER (defense in depth).
 *
 * Money:
 *   - All arithmetic uses Prisma's Decimal (CLAUDE.md §17). The wire
 *     format is a pre-formatted string for display.
 */

import { ForbiddenException, Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import Decimal from 'decimal.js'
import { PrismaService } from '../prisma/prisma.service'
import type {
  RevenueSnapshotDto,
  RevenueFrameDto,
  RevenueBreakdownRowDto,
  HousekeepingRole,
} from '@zenix/shared'
import {
  localStartOfDay,
  addDays,
  fmtAmountWhole,
  fmtMoneyWithCurrency,
} from './format.helpers'

// Default OTA commission rates used as fallback when no ChannelCommission
// row exists for a given source. Documented Sprint 9 stub.
const FALLBACK_COMMISSION_RATES: Record<string, number> = {
  BOOKING:     15,
  AIRBNB:      15,
  EXPEDIA:     18,
  HOSTELWORLD: 12,
  DIRECT:      0,
  WALK_IN:     0,
}

@Injectable()
export class RevenueReportService {
  private readonly log = new Logger(RevenueReportService.name)

  constructor(private readonly prisma: PrismaService) {}

  async getSnapshot(
    propertyId: string,
    actorRole: HousekeepingRole,
  ): Promise<RevenueSnapshotDto> {
    if (actorRole === 'HOUSEKEEPER') {
      throw new ForbiddenException(
        'Revenue snapshot is restricted to reception / supervisor / admin roles',
      )
    }

    const settings = await this.prisma.propertySettings.findUnique({
      where: { propertyId },
    })
    const tz = settings?.timezone ?? 'America/Cancun'
    const currency = settings?.reportCurrency ?? 'MXN'
    const weeklyTarget = settings?.weeklyRevenueTarget
      ? new Decimal(settings.weeklyRevenueTarget.toString())
      : null

    const now = new Date()
    const todayStart = localStartOfDay(now, tz)
    const todayEnd = addDays(todayStart, 1)
    const yesterdayStart = addDays(todayStart, -1)
    const weekEnd = addDays(todayStart, 7)

    // ── Pull base data ────────────────────────────────────────────
    const todayStays = await this.prisma.guestStay.findMany({
      where: {
        propertyId,
        checkinAt: { lte: todayEnd },
        scheduledCheckout: { gt: todayStart },
        noShowAt: null,
      },
      select: {
        id: true,
        roomId: true,
        ratePerNight: true,
        totalAmount: true,
        amountPaid: true,
        paymentStatus: true,
        source: true,
        checkinAt: true,
        scheduledCheckout: true,
      },
    })

    const yesterdayStays = await this.prisma.guestStay.findMany({
      where: {
        propertyId,
        checkinAt: { lte: todayStart },
        scheduledCheckout: { gt: yesterdayStart },
        noShowAt: null,
      },
      select: { id: true, ratePerNight: true },
    })

    const totalRooms = await this.prisma.room.count({
      where: { propertyId, deletedAt: null },
    })
    const blockedToday = await this.prisma.roomBlock.count({
      where: {
        propertyId,
        startDate: { lte: todayEnd },
        OR: [{ endDate: null }, { endDate: { gt: todayStart } }],
      },
    })
    const availableRooms = Math.max(1, totalRooms - blockedToday)

    // ── Aggregations ──────────────────────────────────────────────
    const todayRevenue = todayStays.reduce(
      (sum, s) => sum.plus(new Decimal(s.ratePerNight.toString())),
      new Decimal(0),
    )
    const yesterdayRevenue = yesterdayStays.reduce(
      (sum, s) => sum.plus(new Decimal(s.ratePerNight.toString())),
      new Decimal(0),
    )
    const collectedToday = todayStays.reduce(
      (sum, s) => sum.plus(new Decimal(s.amountPaid.toString())),
      new Decimal(0),
    )
    const pendingFolios = todayStays.filter((s) =>
      ['UNPAID', 'PARTIAL'].includes(s.paymentStatus),
    )
    const pendingTotal = pendingFolios.reduce((sum, s) => {
      const total = new Decimal(s.totalAmount.toString())
      const paid = new Decimal(s.amountPaid.toString())
      return sum.plus(Decimal.max(0, total.minus(paid)))
    }, new Decimal(0))

    const roomsSold = new Set(todayStays.map((s) => s.roomId)).size
    const adr = roomsSold === 0
      ? new Decimal(0)
      : todayRevenue.dividedBy(roomsSold)
    const revPar = todayRevenue.dividedBy(availableRooms)

    // Yesterday for delta
    const yRoomsSold = new Set(yesterdayStays.map((s) => s.id)).size
    const yAdr = yRoomsSold === 0 ? null : yesterdayRevenue.dividedBy(yRoomsSold)

    // ── Frame builders ─────────────────────────────────────────────
    const frames: RevenueFrameDto[] = []

    // Frame 1 — INGRESOS HOY
    {
      const collectedPct = todayRevenue.eq(0)
        ? 0
        : Math.round(
            collectedToday.dividedBy(todayRevenue).times(100).toNumber(),
          )
      const deltaPct = yesterdayRevenue.eq(0)
        ? null
        : Math.round(
            todayRevenue
              .minus(yesterdayRevenue)
              .dividedBy(yesterdayRevenue)
              .times(100)
              .toNumber(),
          )
      const breakdown: RevenueBreakdownRowDto[] = [
        {
          label: 'Cobrado',
          amount: fmtMoneyWithCurrency(collectedToday, currency),
          meta: `${collectedPct}%`,
          progressPct: collectedPct,
          color: '#34D399',
        },
        {
          label: 'Pendiente',
          amount: fmtMoneyWithCurrency(pendingTotal, currency),
          meta: `${pendingFolios.length} folio${pendingFolios.length !== 1 ? 's' : ''}`,
          progressPct: null,
          color: '#FBBF24',
        },
      ]
      frames.push({
        id: 'today',
        label: 'INGRESOS HOY',
        primaryWhole: fmtAmountWhole(todayRevenue),
        primarySuffix: currency,
        caption:
          deltaPct == null
            ? 'proyectado'
            : `proyectado · ${deltaPct >= 0 ? '↑' : '↓'} ${deltaPct >= 0 ? '+' : ''}${deltaPct}% vs ayer`,
        captionTone:
          deltaPct == null
            ? 'neutral'
            : deltaPct > 0 ? 'positive' : deltaPct < 0 ? 'negative' : 'neutral',
        breakdown,
      })
    }

    // Frame 2 — ADR HOY
    {
      const deltaPct = !yAdr || yAdr.eq(0)
        ? null
        : Math.round(adr.minus(yAdr).dividedBy(yAdr).times(100).toNumber())
      frames.push({
        id: 'adr',
        label: 'ADR HOY',
        primaryWhole: fmtAmountWhole(adr),
        primarySuffix: `${currency}/hab`,
        caption:
          deltaPct == null
            ? 'sobre habitaciones vendidas hoy'
            : `${deltaPct >= 0 ? '↑' : '↓'} ${deltaPct >= 0 ? '+' : ''}${deltaPct}% vs ayer`,
        captionTone:
          deltaPct == null ? 'neutral' :
          deltaPct > 0 ? 'positive' : 'negative',
        breakdown: [
          { label: 'Habitaciones',  amount: `${roomsSold} vendidas`, meta: `de ${totalRooms}`, progressPct: null, color: null },
          { label: 'Revenue base',  amount: fmtMoneyWithCurrency(todayRevenue, currency), meta: 'sin extras', progressPct: null, color: null },
        ],
      })
    }

    // Frame 3 — RevPAR HOY
    {
      const occupancyPct = totalRooms === 0
        ? 0
        : Math.round((roomsSold / totalRooms) * 100)
      frames.push({
        id: 'revpar',
        label: 'RevPAR HOY',
        primaryWhole: fmtAmountWhole(revPar),
        primarySuffix: `${currency}/hab`,
        caption: `sobre ${availableRooms} habitaciones disponibles`,
        captionTone: 'neutral',
        breakdown: [
          { label: 'Ocupación',  amount: `${occupancyPct}%`, meta: `${roomsSold}/${totalRooms}`, progressPct: occupancyPct, color: '#34D399' },
          { label: 'Bloqueadas', amount: `${blockedToday} hab.`, meta: blockedToday > 0 ? 'fuera de venta' : '—', progressPct: null, color: null },
        ],
      })
    }

    // Frame 4 — CANAL TOP HOY
    {
      const byChannel = new Map<string, Decimal>()
      for (const s of todayStays) {
        const src = s.source ?? 'OTHER'
        const cur = byChannel.get(src) ?? new Decimal(0)
        byChannel.set(src, cur.plus(new Decimal(s.ratePerNight.toString())))
      }
      const sorted = Array.from(byChannel.entries()).sort(
        (a, b) => b[1].minus(a[1]).toNumber(),
      )
      const top = sorted[0]
      const topPct = !top || todayRevenue.eq(0)
        ? 0
        : Math.round(top[1].dividedBy(todayRevenue).times(100).toNumber())

      const channelColors: Record<string, string> = {
        BOOKING: '#5BA8FF', AIRBNB: '#FF787C', EXPEDIA: '#FFD43B',
        HOSTELWORLD: '#FF9457', DIRECT: '#34D399', OTHER: '#9CA3AF',
      }

      const breakdown: RevenueBreakdownRowDto[] = sorted.slice(0, 4).map(([src, amt]) => {
        const pct = todayRevenue.eq(0)
          ? 0
          : Math.round(amt.dividedBy(todayRevenue).times(100).toNumber())
        return {
          label: src.charAt(0) + src.slice(1).toLowerCase(),
          amount: fmtAmountWhole(amt),
          meta: `${pct}%`,
          progressPct: pct,
          color: channelColors[src] ?? channelColors.OTHER,
        }
      })

      frames.push({
        id: 'topChannel',
        label: 'CANAL TOP HOY',
        primaryWhole: top ? top[0].charAt(0) + top[0].slice(1).toLowerCase() : '—',
        primarySuffix: '',
        caption: top
          ? `${fmtAmountWhole(top[1])} ${currency} · ${topPct}% del revenue del día`
          : 'sin reservas hoy',
        captionTone: 'neutral',
        breakdown,
      })
    }

    // Frame 5 — COMISIONES OTA HOY
    {
      const commissions = await this.prisma.channelCommission.findMany({
        where: {
          propertyId,
          effectiveFrom: { lte: now },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
        },
      })
      const rateFor = (src: string): number => {
        const c = commissions.find((cc) => cc.source === src)
        if (c) return Number(c.ratePercent.toString())
        return FALLBACK_COMMISSION_RATES[src] ?? 0
      }

      let totalCommission = new Decimal(0)
      const byChannel = new Map<string, { revenue: Decimal; rate: number }>()
      for (const s of todayStays) {
        const src = s.source ?? 'OTHER'
        const cur = byChannel.get(src) ?? { revenue: new Decimal(0), rate: rateFor(src) }
        cur.revenue = cur.revenue.plus(new Decimal(s.ratePerNight.toString()))
        byChannel.set(src, cur)
      }
      const breakdown: RevenueBreakdownRowDto[] = []
      for (const [src, { revenue, rate }] of byChannel.entries()) {
        if (rate === 0) continue
        const c = revenue.times(rate).dividedBy(100)
        totalCommission = totalCommission.plus(c)
        breakdown.push({
          label: `${src.charAt(0) + src.slice(1).toLowerCase()} ${rate}%`,
          amount: fmtAmountWhole(c),
          meta: `sobre ${fmtAmountWhole(revenue)}`,
          progressPct: null,
          color: null,
        })
      }
      const totalRevPct = todayRevenue.eq(0)
        ? 0
        : Math.round(totalCommission.dividedBy(todayRevenue).times(100).toNumber())

      frames.push({
        id: 'commissions',
        label: 'COMISIONES OTA HOY',
        primaryWhole: fmtAmountWhole(totalCommission),
        primarySuffix: currency,
        caption: `${totalRevPct}% del revenue · ${commissions.length === 0 ? 'usando defaults' : 'tarifas configuradas'}`,
        captionTone: totalRevPct <= 18 ? 'positive' : 'warning',
        breakdown,
      })
    }

    // Frame 6 — CAJA RECEPCIÓN
    {
      const cashLogs = await this.prisma.paymentLog.findMany({
        where: {
          propertyId,
          method: 'CASH',
          isVoid: false,
          // PaymentLog uses shiftDate (DATE column, the operational shift it
          // belongs to — not server-time createdAt). For "today's cash"
          // we filter by shiftDate of the local day.
          shiftDate: { gte: todayStart, lt: todayEnd },
        },
        select: { amount: true },
      })
      const cashTotal = cashLogs.reduce(
        (sum, l) => sum.plus(new Decimal(l.amount.toString())),
        new Decimal(0),
      )
      frames.push({
        id: 'cashOnHand',
        label: 'CAJA RECEPCIÓN',
        primaryWhole: fmtAmountWhole(cashTotal),
        primarySuffix: currency,
        caption: `${cashLogs.length} movimiento${cashLogs.length !== 1 ? 's' : ''} en turno`,
        captionTone: 'positive',
        breakdown: [
          { label: 'Cobros del turno', amount: `+${fmtAmountWhole(cashTotal)}`, meta: `${cashLogs.length} ingresos`, progressPct: null, color: '#34D399' },
        ],
      })
    }

    // Frame 7 — FORECAST SEMANA
    {
      const weekStays = await this.prisma.guestStay.findMany({
        where: {
          propertyId,
          checkinAt: { lt: weekEnd },
          scheduledCheckout: { gt: todayStart },
          noShowAt: null,
        },
        select: {
          checkinAt: true,
          scheduledCheckout: true,
          totalAmount: true,
          ratePerNight: true,
        },
      })
      // Prorrate each stay's total over its overlap with [todayStart, weekEnd].
      let forecast = new Decimal(0)
      for (const s of weekStays) {
        const totalNights = Math.max(
          1,
          Math.round((s.scheduledCheckout.getTime() - s.checkinAt.getTime()) / 86_400_000),
        )
        const overlapStart = s.checkinAt.getTime() > todayStart.getTime() ? s.checkinAt : todayStart
        const overlapEnd = s.scheduledCheckout.getTime() < weekEnd.getTime() ? s.scheduledCheckout : weekEnd
        const overlapNights = Math.max(
          0,
          (overlapEnd.getTime() - overlapStart.getTime()) / 86_400_000,
        )
        const total = new Decimal(s.totalAmount.toString())
        forecast = forecast.plus(total.times(overlapNights).dividedBy(totalNights))
      }

      const targetPct = !weeklyTarget || weeklyTarget.eq(0)
        ? null
        : Math.round(forecast.dividedBy(weeklyTarget).times(100).toNumber())

      const breakdown: RevenueBreakdownRowDto[] = []
      breakdown.push({
        label: 'Próximos 7d',
        amount: fmtMoneyWithCurrency(forecast, currency),
        meta: targetPct != null ? `${targetPct}%` : '—',
        progressPct: targetPct,
        color: '#10B981',
      })
      if (weeklyTarget) {
        breakdown.push({
          label: 'Meta semanal',
          amount: fmtMoneyWithCurrency(weeklyTarget, currency),
          meta: 'configurada',
          progressPct: null,
          color: null,
        })
      }

      frames.push({
        id: 'forecastWeek',
        label: 'FORECAST SEMANA',
        primaryWhole: fmtAmountWhole(forecast),
        primarySuffix: currency,
        caption:
          targetPct != null
            ? `al ${targetPct}% de la meta semanal`
            : 'configura una meta semanal en ajustes',
        captionTone:
          targetPct == null ? 'neutral' :
          targetPct >= 100 ? 'positive' :
          targetPct >= 75 ? 'neutral' : 'warning',
        breakdown,
      })
    }

    return {
      computedAt: now.toISOString(),
      currency,
      frames,
    }
  }
}
