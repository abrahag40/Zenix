import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

/**
 * MobileDashboardService — Etapa B §B1 del plan MOBILE-DASHBOARD.
 *
 * Endpoint único `/v1/dashboard/mobile` con shape role-aware:
 *   · SUPERVISOR  → ocupación 3-state donut + ingresos hoy + atender ahora + jornada 4h
 *   · RECEPTIONIST → movimientos hoy (llegadas/salidas) + cobros pendientes + bloqueadas
 *   · HOUSEKEEPER → not handled here — el Hub Recamarista ya tiene su flow propio
 *
 * Single round-trip. Payload optimizado para mobile (4G LATAM): ~3-5KB vs
 * ~15-20KB del snapshot web. No incluye pulse 14d (heavy + no se ve en mobile).
 *
 * Decisión D-MOB-6 del plan: donut 3-state (Ocupadas verde / Llegadas hoy
 * ámbar / Bloqueadas rojo). Vacías es el complemento implícito — no se
 * grafica (owner 2026-06-08).
 */
@Injectable()
export class MobileDashboardService {
  private readonly logger = new Logger(MobileDashboardService.name)

  constructor(private readonly prisma: PrismaService) {}

  async getSupervisorSnapshot(propertyId: string, organizationId: string, userId: string) {
    const now = new Date()
    const { startOfDay, endOfDay, startOfYesterday } = dayBounds(now)
    const in4h = new Date(now.getTime() + 4 * 3600000)

    const [
      property,
      user,
      totalRooms,
      occupied,
      arrivingToday,
      blockedRooms,
      revenueToday,
      revenueYesterday,
      overstayedCount,
      maintenanceCritical,
      unpaidArrivals,
      nextArrival,
      nextDeparture,
      arrivalsCount4h,
      departuresCount4h,
    ] = await Promise.all([
      this.prisma.property.findUnique({
        where: { id: propertyId },
        select: {
          id: true, name: true, city: true,
          settings: { select: { timezone: true } },
          legalEntity: { select: { baseCurrency: true } },
        },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.room.count({
        where: { propertyId, organizationId, deletedAt: null, status: { not: 'OUT_OF_SERVICE' } },
      }),
      // Ocupadas = stay con actualCheckin + sin checkout aún
      this.prisma.guestStay.count({
        where: {
          propertyId, organizationId, deletedAt: null,
          actualCheckin: { not: null }, actualCheckout: null,
          cancelledAt: null, noShowAt: null,
        },
      }),
      // Llegadas hoy pendientes (checkin programado HOY, aún no entrado)
      this.prisma.guestStay.count({
        where: {
          propertyId, organizationId, deletedAt: null,
          checkinAt: { gte: startOfDay, lt: endOfDay },
          actualCheckin: null,
          cancelledAt: null, noShowAt: null,
        },
      }),
      // Bloqueadas — RoomBlock activos hoy
      this.prisma.roomBlock.count({
        where: {
          room: { propertyId, organizationId },
          status: 'ACTIVE',
          startDate: { lte: endOfDay },
          OR: [{ endDate: null }, { endDate: { gte: startOfDay } }],
        },
      }),
      // Revenue hoy — suma payments paidAt hoy
      this.prisma.paymentLog.aggregate({
        where: {
          stay: { propertyId, organizationId },
          createdAt: { gte: startOfDay, lt: endOfDay },
          isVoid: false,
          voidsLogId: null,
        },
        _sum: { amount: true },
      }),
      // Revenue ayer — para comparativa
      this.prisma.paymentLog.aggregate({
        where: {
          stay: { propertyId, organizationId },
          createdAt: { gte: startOfYesterday, lt: startOfDay },
          isVoid: false,
          voidsLogId: null,
        },
        _sum: { amount: true },
      }),
      // Overstayed
      this.prisma.guestStay.count({
        where: {
          propertyId, organizationId, deletedAt: null,
          actualCheckin: { not: null }, actualCheckout: null,
          scheduledCheckout: { lt: startOfDay },
          cancelledAt: null, noShowAt: null,
        },
      }),
      // Mtto crítico activo
      this.prisma.maintenanceTicket.count({
        where: {
          property: { id: propertyId, organizationId },
          priority: 'CRITICAL',
          status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING_PARTS'] },
        },
      }),
      // Cobros pendientes — llegadas hoy con saldo no cubierto
      this.prisma.guestStay.findMany({
        where: {
          propertyId, organizationId, deletedAt: null,
          checkinAt: { gte: startOfDay, lt: endOfDay },
          actualCheckin: null,
          cancelledAt: null, noShowAt: null,
          paymentModel: { in: ['HOTEL_COLLECT', 'HYBRID_DEPOSIT'] },
        },
        select: { id: true, totalAmount: true, amountPaid: true },
      }),
      // Próxima llegada en 4h
      this.prisma.guestStay.findFirst({
        where: {
          propertyId, organizationId, deletedAt: null,
          checkinAt: { gte: now, lt: in4h },
          actualCheckin: null,
          cancelledAt: null, noShowAt: null,
        },
        orderBy: { checkinAt: 'asc' },
        select: {
          id: true, guestName: true, checkinAt: true,
          room: { select: { number: true } },
        },
      }),
      // Próxima salida
      this.prisma.guestStay.findFirst({
        where: {
          propertyId, organizationId, deletedAt: null,
          actualCheckin: { not: null }, actualCheckout: null,
          scheduledCheckout: { gte: now, lt: in4h },
          cancelledAt: null, noShowAt: null,
        },
        orderBy: { scheduledCheckout: 'asc' },
        select: {
          id: true, guestName: true, scheduledCheckout: true,
          room: { select: { number: true } },
        },
      }),
      // Count próximas 4h
      this.prisma.guestStay.count({
        where: {
          propertyId, organizationId, deletedAt: null,
          checkinAt: { gte: now, lt: in4h },
          actualCheckin: null,
          cancelledAt: null, noShowAt: null,
        },
      }),
      this.prisma.guestStay.count({
        where: {
          propertyId, organizationId, deletedAt: null,
          actualCheckin: { not: null }, actualCheckout: null,
          scheduledCheckout: { gte: now, lt: in4h },
          cancelledAt: null, noShowAt: null,
        },
      }),
    ])

    const tz = property?.settings?.timezone ?? 'UTC'
    const currency = property?.legalEntity?.baseCurrency ?? 'MXN'

    // Revenue computations (Decimal-safe)
    const revToday = toNumber(revenueToday._sum?.amount ?? null)
    const revYesterday = toNumber(revenueYesterday._sum?.amount ?? null)
    const revVsYesterdayPct = revYesterday > 0
      ? Math.round(((revToday - revYesterday) / revYesterday) * 100)
      : null

    // Unpaid balance aggregate
    const unpaidBalance = unpaidArrivals.reduce((sum, s) => {
      const total = toNumber(s.totalAmount)
      const paid = toNumber(s.amountPaid)
      return sum + Math.max(0, total - paid)
    }, 0)

    // Attention items — top 3 ordered by criticidad
    const attentionItems: Array<{
      kind: 'overstayed' | 'maintenance_critical' | 'unpaid_arrival'
      title: string
      count: number
      deeplink: string
    }> = []
    if (overstayedCount > 0) {
      attentionItems.push({
        kind: 'overstayed',
        title: 'Salidas vencidas sin checkout',
        count: overstayedCount,
        deeplink: '/reports/overstayed',
      })
    }
    if (maintenanceCritical > 0) {
      attentionItems.push({
        kind: 'maintenance_critical',
        title: 'Tickets de mantenimiento críticos',
        count: maintenanceCritical,
        deeplink: '/maintenance',
      })
    }
    if (unpaidArrivals.length > 0 && unpaidBalance > 0) {
      attentionItems.push({
        kind: 'unpaid_arrival',
        title: 'Llegadas con saldo pendiente',
        count: unpaidArrivals.length,
        deeplink: '/calendar',
      })
    }

    return {
      role: 'SUPERVISOR' as const,
      hero: {
        greeting: greetingFromHour(now, tz),
        firstName: user?.firstName ?? 'Hotelero',
        propertyName: property?.name ?? 'Hotel',
        propertyCity: property?.city ?? null,
        timeOfDay: timeOfDay(now, tz),
        timezone: tz,
        currentTimeIso: now.toISOString(),
      },
      occupancy: {
        occupied,
        arrivingToday,
        blocked: blockedRooms,
        total: totalRooms,
        // vacías = totalRooms - occupied - arrivingToday - blocked (frontend lo computa)
      },
      revenue: {
        todayAmount: revToday,
        currency,
        projected: now < endOfDay,
        vsYesterdayPct: revVsYesterdayPct,
      },
      attentionNow: attentionItems,
      upcoming4h: {
        arrivalsCount: arrivalsCount4h,
        departuresCount: departuresCount4h,
        nextEvent: nextEventOf(nextArrival, nextDeparture),
      },
      lastSyncIso: new Date().toISOString(),
    }
  }

  async getReceptionistSnapshot(propertyId: string, organizationId: string, userId: string) {
    const now = new Date()
    const { startOfDay, endOfDay } = dayBounds(now)

    const [
      property,
      user,
      arrivalsToday,
      departuresToday,
      blockedRooms,
      pendingCharges,
    ] = await Promise.all([
      this.prisma.property.findUnique({
        where: { id: propertyId },
        select: {
          id: true, name: true, city: true,
          settings: { select: { timezone: true } },
          legalEntity: { select: { baseCurrency: true } },
        },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, firstName: true, lastName: true },
      }),
      // (RECEPTIONIST) Llegadas pendientes hoy (no han hecho checkin todavía)
      this.prisma.guestStay.findMany({
        where: {
          propertyId, organizationId, deletedAt: null,
          checkinAt: { gte: startOfDay, lt: endOfDay },
          actualCheckin: null,
          cancelledAt: null, noShowAt: null,
        },
        orderBy: { checkinAt: 'asc' },
        take: 10,
        select: {
          id: true, guestName: true, paxCount: true,
          checkinAt: true, paymentModel: true,
          totalAmount: true, amountPaid: true,
          documentNumber: true, documentPhotoUrl: true,
          room: { select: { number: true } },
        },
      }),
      // Salidas pendientes hoy
      this.prisma.guestStay.findMany({
        where: {
          propertyId, organizationId, deletedAt: null,
          actualCheckin: { not: null }, actualCheckout: null,
          scheduledCheckout: { gte: startOfDay, lt: endOfDay },
          cancelledAt: null, noShowAt: null,
        },
        orderBy: { scheduledCheckout: 'asc' },
        take: 10,
        select: {
          id: true, guestName: true,
          scheduledCheckout: true,
          totalAmount: true, amountPaid: true,
          room: { select: { number: true } },
        },
      }),
      // Habitaciones bloqueadas activas
      this.prisma.roomBlock.findMany({
        where: {
          room: { propertyId, organizationId },
          status: 'ACTIVE',
          startDate: { lte: endOfDay },
          OR: [{ endDate: null }, { endDate: { gte: startOfDay } }],
        },
        take: 5,
        select: {
          id: true, reason: true, endDate: true,
          maintenanceTicketId: true,
          room: { select: { number: true } },
        },
      }),
      // Cobros pendientes — todas las stays activas con saldo
      this.prisma.guestStay.findMany({
        where: {
          propertyId, organizationId, deletedAt: null,
          actualCheckout: null,
          cancelledAt: null, noShowAt: null,
          paymentModel: { in: ['HOTEL_COLLECT', 'HYBRID_DEPOSIT'] },
        },
        select: { id: true, totalAmount: true, amountPaid: true },
      }),
    ])

    const tz = property?.settings?.timezone ?? 'UTC'
    const currency = property?.legalEntity?.baseCurrency ?? 'MXN'

    const pendingChargesAggr = pendingCharges.reduce(
      (acc, s) => {
        const balance = Math.max(0, toNumber(s.totalAmount) - toNumber(s.amountPaid))
        if (balance > 0) {
          acc.count++
          acc.totalAmount += balance
        }
        return acc
      },
      { count: 0, totalAmount: 0 },
    )

    return {
      role: 'RECEPTIONIST' as const,
      hero: {
        greeting: greetingFromHour(now, tz),
        firstName: user?.firstName ?? 'Recepcionista',
        propertyName: property?.name ?? 'Hotel',
        propertyCity: property?.city ?? null,
        timeOfDay: timeOfDay(now, tz),
        timezone: tz,
        currentTimeIso: now.toISOString(),
      },
      movements: {
        arrivals: arrivalsToday.map((s) => ({
          stayId: s.id,
          guestName: s.guestName,
          roomLabel: s.room?.number ?? '—',
          paxCount: s.paxCount ?? 1,
          etaIso: s.checkinAt.toISOString(),
          paymentModel: s.paymentModel,
          balance: Math.max(0, toNumber(s.totalAmount) - toNumber(s.amountPaid)),
          currency,
          hasDocument: !!(s.documentNumber || s.documentPhotoUrl),
        })),
        departures: departuresToday.map((s) => ({
          stayId: s.id,
          guestName: s.guestName,
          roomLabel: s.room?.number ?? '—',
          scheduledIso: s.scheduledCheckout.toISOString(),
          balance: Math.max(0, toNumber(s.totalAmount) - toNumber(s.amountPaid)),
          currency,
        })),
      },
      blockedRooms: blockedRooms.map((b) => ({
        blockId: b.id,
        roomLabel: b.room?.number ?? '—',
        reason: String(b.reason ?? 'sin razón'),
        untilIso: b.endDate ? b.endDate.toISOString() : null,
      })),
      pendingCharges: {
        count: pendingChargesAggr.count,
        totalAmount: pendingChargesAggr.totalAmount,
        currency,
      },
      lastSyncIso: new Date().toISOString(),
    }
  }
}

// ─── Helpers puros ──────────────────────────────────────────────────────────

function dayBounds(now: Date) {
  const startOfDay = utcStartOfDay(now)
  const endOfDay = new Date(startOfDay.getTime() + 86400000)
  const startOfYesterday = new Date(startOfDay.getTime() - 86400000)
  return { startOfDay, endOfDay, startOfYesterday }
}

function utcStartOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function toNumber(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  return Number(v)
}

function greetingFromHour(date: Date, timezone: string): string {
  const hour = localHour(date, timezone)
  if (hour < 6) return 'Buenas noches'
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function timeOfDay(date: Date, timezone: string): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = localHour(date, timezone)
  if (hour < 6) return 'night'
  if (hour < 12) return 'morning'
  if (hour < 19) return 'afternoon'
  return 'evening'
}

function localHour(date: Date, timezone: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).format(date)
  return Number(formatted) % 24
}

export interface NextEvent { kind: 'arrival' | 'departure'; guestName: string; roomLabel: string; timeIso: string }
function nextEventOf(
  arrival: { guestName: string; checkinAt: Date; room: { number: string } | null } | null,
  departure: { guestName: string; scheduledCheckout: Date; room: { number: string } | null } | null,
): NextEvent | null {
  if (!arrival && !departure) return null
  if (arrival && !departure) {
    return { kind: 'arrival', guestName: arrival.guestName, roomLabel: arrival.room?.number ?? '—', timeIso: arrival.checkinAt.toISOString() }
  }
  if (!arrival && departure) {
    return { kind: 'departure', guestName: departure.guestName, roomLabel: departure.room?.number ?? '—', timeIso: departure.scheduledCheckout.toISOString() }
  }
  // Both — pick earliest
  if (arrival!.checkinAt <= departure!.scheduledCheckout) {
    return { kind: 'arrival', guestName: arrival!.guestName, roomLabel: arrival!.room?.number ?? '—', timeIso: arrival!.checkinAt.toISOString() }
  }
  return { kind: 'departure', guestName: departure!.guestName, roomLabel: departure!.room?.number ?? '—', timeIso: departure!.scheduledCheckout.toISOString() }
}
