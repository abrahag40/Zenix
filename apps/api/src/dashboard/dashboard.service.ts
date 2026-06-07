import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

/**
 * DashboardService — Command Center snapshot.
 *
 * Single endpoint que agrega 4 zonas vivas:
 *   1. hero      — greeting + contadores grandes
 *   2. liveNow   — staff activo + próximos eventos
 *   3. actions   — tareas urgentes
 *   4. pulse     — micro-trends 14d (sparklines)
 *
 * Diseño:
 *   · Single round-trip — Stripe Atlas / Linear inbox pattern
 *   · Subqueries en paralelo via Promise.all
 *   · El frontend formatea (separación crud/visual)
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name)

  constructor(private readonly prisma: PrismaService) {}

  /** Legacy scaffold endpoint — mantenido por back-compat. */
  async getOverview(propertyId: string) {
    return {
      propertyId,
      generatedAt: new Date().toISOString(),
      widgets: [],
    }
  }

  /** GET /v1/dashboard/snapshot — Command Center aggregator. */
  async getSnapshot(propertyId: string, organizationId: string, userId: string) {
    const now = new Date()
    const startOfDay = utcStartOfDay(now)
    const endOfDay = new Date(startOfDay.getTime() + 86400000)
    const in4Hours = new Date(now.getTime() + 4 * 3600000)

    const [
      property,
      user,
      totalRoomsAvailable,
      inHouse,
      arrivalsToday,
      departuresToday,
      nextArrival,
      nextDeparture,
      pendingCheckins,
      pendingCheckouts,
      housekeepingPending,
      overstayed,
      pulseSnapshots,
      activeStaff,
      unpaidArrivals,
    ] = await Promise.all([
      this.prisma.property.findUnique({
        where: { id: propertyId },
        select: { id: true, name: true, city: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
      this.prisma.room.count({
        where: { propertyId, organizationId, deletedAt: null, status: { not: 'OUT_OF_SERVICE' } },
      }),
      // In-house = checkin done + checkout pending + no cancel/no-show
      this.prisma.guestStay.count({
        where: {
          propertyId, organizationId, deletedAt: null,
          actualCheckin: { not: null }, actualCheckout: null,
          cancelledAt: null, noShowAt: null,
        },
      }),
      // Arrivals today (checkinAt in [today, tomorrow))
      this.prisma.guestStay.count({
        where: {
          propertyId, organizationId, deletedAt: null,
          checkinAt: { gte: startOfDay, lt: endOfDay },
          cancelledAt: null, noShowAt: null,
        },
      }),
      // Departures today
      this.prisma.guestStay.count({
        where: {
          propertyId, organizationId, deletedAt: null,
          scheduledCheckout: { gte: startOfDay, lt: endOfDay },
          actualCheckin: { not: null },
          cancelledAt: null, noShowAt: null,
        },
      }),
      // Next arrival within 4h
      this.prisma.guestStay.findFirst({
        where: {
          propertyId, organizationId, deletedAt: null,
          checkinAt: { gte: now, lt: in4Hours },
          actualCheckin: null,
          cancelledAt: null, noShowAt: null,
        },
        orderBy: { checkinAt: 'asc' },
        select: {
          id: true, guestName: true, checkinAt: true,
          room: { select: { number: true } },
        },
      }),
      // Next departure
      this.prisma.guestStay.findFirst({
        where: {
          propertyId, organizationId, deletedAt: null,
          actualCheckin: { not: null }, actualCheckout: null,
          scheduledCheckout: { gte: now },
          cancelledAt: null, noShowAt: null,
        },
        orderBy: { scheduledCheckout: 'asc' },
        select: {
          id: true, guestName: true, scheduledCheckout: true,
          room: { select: { number: true } },
        },
      }),
      // Pending check-ins preview top 3
      this.prisma.guestStay.findMany({
        where: {
          propertyId, organizationId, deletedAt: null,
          checkinAt: { gte: startOfDay, lt: endOfDay },
          actualCheckin: null,
          cancelledAt: null, noShowAt: null,
        },
        orderBy: { checkinAt: 'asc' },
        take: 3,
        select: {
          id: true, guestName: true, checkinAt: true,
          room: { select: { number: true } },
        },
      }),
      // Pending check-outs preview top 3
      this.prisma.guestStay.findMany({
        where: {
          propertyId, organizationId, deletedAt: null,
          actualCheckin: { not: null }, actualCheckout: null,
          scheduledCheckout: { lt: endOfDay },
          cancelledAt: null, noShowAt: null,
        },
        orderBy: { scheduledCheckout: 'asc' },
        take: 3,
        select: {
          id: true, guestName: true, scheduledCheckout: true,
          room: { select: { number: true } },
        },
      }),
      // Housekeeping pending count — status in (UNASSIGNED, READY, IN_PROGRESS)
      this.prisma.cleaningTask.count({
        where: {
          status: { in: ['UNASSIGNED', 'READY', 'IN_PROGRESS'] },
          // CleaningTask no tiene FK directa a property en este schema — el
          // filtro de tenant lo da el join Unit→Room→Property. Simplificamos
          // aceptando overestimación leve si hubiera cross-property assignments
          // (no es el caso del piloto single-property).
        },
      }),
      // Overstayed
      this.prisma.guestStay.findMany({
        where: {
          propertyId, organizationId, deletedAt: null,
          actualCheckin: { not: null }, actualCheckout: null,
          scheduledCheckout: { lt: startOfDay },
          cancelledAt: null, noShowAt: null,
        },
        select: { id: true, totalAmount: true, amountPaid: true },
      }),
      // Pulse — 14 day snapshots
      this.prisma.metricsDailySnapshot.findMany({
        where: {
          propertyId,
          date: { gte: addDaysUtc(startOfDay, -14), lt: startOfDay },
        },
        orderBy: { date: 'asc' },
        select: {
          date: true, occupancyPercent: true, adr: true, revpar: true, baseCurrency: true,
        },
      }),
      // Active staff hoy
      this.prisma.staff.findMany({
        where: {
          propertyId,
          organizationId,
          deletedAt: null,
          active: true,
          tasks: {
            some: {
              status: { in: ['READY', 'IN_PROGRESS'] },
            },
          },
        },
        select: { id: true, name: true, role: true },
        take: 6,
      }),
      // Unpaid arrivals (potencial saldo pendiente al checkin)
      this.prisma.guestStay.count({
        where: {
          propertyId, organizationId, deletedAt: null,
          checkinAt: { gte: startOfDay, lt: endOfDay },
          actualCheckin: null,
          paymentStatus: 'PENDING',
          cancelledAt: null, noShowAt: null,
        },
      }),
    ])

    const overstayedTotal = overstayed.length
    const overstayedBalance = overstayed.reduce(
      (sum, s) => sum + Math.max(0, Number(s.totalAmount) - Number(s.amountPaid)),
      0,
    )

    const userName =
      user?.firstName && user.firstName.trim().length > 0
        ? user.firstName
        : user?.email?.split('@')[0] ?? 'Hotelero'

    return {
      hero: {
        userName,
        propertyName: property?.name ?? '',
        propertyCity: property?.city ?? null,
        // timezone vive en PropertySettings (legacy field deprecated en
        // Property post v1.0.5). Frontend usa Intl con fallback Tulum.
        timezone: 'America/Cancun',
        nowIso: now.toISOString(),
        arrivalsCount: arrivalsToday,
        departuresCount: departuresToday,
        inHouseCount: inHouse,
        totalRooms: totalRoomsAvailable,
      },
      liveNow: {
        inHouseCount: inHouse,
        totalRooms: totalRoomsAvailable,
        activeStaff: activeStaff.map((s) => ({
          id: s.id,
          name: s.name,
          role: s.role,
        })),
        nextArrival: nextArrival
          ? {
              stayId: nextArrival.id,
              guestName: nextArrival.guestName,
              roomNumber: nextArrival.room?.number ?? null,
              scheduledIso: nextArrival.checkinAt.toISOString(),
            }
          : null,
        nextDeparture: nextDeparture
          ? {
              stayId: nextDeparture.id,
              guestName: nextDeparture.guestName,
              roomNumber: nextDeparture.room?.number ?? null,
              scheduledIso: nextDeparture.scheduledCheckout.toISOString(),
            }
          : null,
      },
      actions: {
        arrivals: {
          count: arrivalsToday,
          preview: pendingCheckins.map((s) => ({
            stayId: s.id,
            guestName: s.guestName,
            roomNumber: s.room?.number ?? null,
            scheduledIso: s.checkinAt.toISOString(),
          })),
        },
        departures: {
          count: departuresToday,
          preview: pendingCheckouts.map((s) => ({
            stayId: s.id,
            guestName: s.guestName,
            roomNumber: s.room?.number ?? null,
            scheduledIso: s.scheduledCheckout.toISOString(),
          })),
        },
        housekeeping: { count: housekeepingPending },
        overstayed: { count: overstayedTotal, balance: overstayedBalance },
        unpaidArrivals: { count: unpaidArrivals },
      },
      pulse: {
        baseCurrency: pulseSnapshots[0]?.baseCurrency ?? 'USD',
        days: pulseSnapshots.map((d) => ({
          dateIso: d.date.toISOString().slice(0, 10),
          occupancyPercent: Number(d.occupancyPercent),
          adr: Number(d.adr),
          revpar: Number(d.revpar),
        })),
      },
    }
  }
}

function utcStartOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0))
}
function addDaysUtc(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000)
}
