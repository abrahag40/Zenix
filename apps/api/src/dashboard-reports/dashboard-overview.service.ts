/**
 * DashboardOverviewService — single endpoint that aggregates 5 cards of
 * the mobile dashboard:
 *
 *   - OccupancyDonut    (3-segment pie)
 *   - InHouseSummary    (counts) + InHouseRooms (top N expanded list)
 *   - PendingTasks      (HK + Mtto + unpaid folios)
 *   - BlockedRooms      (top N preview rows)
 *   - Movements         (today's arrivals + departures)
 *
 * Why one endpoint and not five:
 *   - Mobile dashboard renders all five card simultaneously on mount.
 *     One round-trip beats five (Stripe Atlas pattern, Linear inbox).
 *   - Reduces SSE invalidation surface — one queryKey to invalidate
 *     when a `task:*`, `block:*` or `stay:*` event fires.
 *   - Keeps formatting consistent (single `format.helpers.ts` instance).
 *
 * Privacy:
 *   - Guest names redacted to null for HOUSEKEEPER role
 *   - Financial figures (unpaidAmountLabel) redacted to null for HK
 *   - All other counts are operational, visible to all roles
 */

import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type {
  DashboardOverviewDto,
  OccupancyDonutDto,
  InHouseSummaryDto,
  InHouseRoomDto,
  PendingTasksDto,
  BlockedRoomDto,
  MovementItemDto,
  HousekeepingRole,
} from '@zenix/shared'
import {
  localStartOfDay,
  addDays,
  fmtScheduleLabel,
  fmtDateRange,
  fmtAmountWhole,
  deriveFlair,
} from './format.helpers'

const IN_HOUSE_ROWS_CAP = 12   // mobile expand fits ~5; we send 12 for "Ver todas"
const BLOCKED_ROWS_CAP = 12    // mobile dashboard cap=3; full list ≤12 per card
const MOVEMENT_ROWS_CAP = 10

@Injectable()
export class DashboardOverviewService {
  private readonly log = new Logger(DashboardOverviewService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build the full overview payload for a property at a given role.
   *
   * @param propertyId — actor's property scope
   * @param actorRole  — drives PII redaction
   */
  async getOverview(
    propertyId: string,
    actorRole: HousekeepingRole,
  ): Promise<DashboardOverviewDto> {
    const settings = await this.prisma.propertySettings.findUnique({
      where: { propertyId },
    })
    const tz = settings?.timezone ?? 'America/Cancun'
    const defaultCheckoutTime = settings?.defaultCheckoutTime ?? '11:00'

    const now = new Date()
    const todayStart = localStartOfDay(now, tz)
    const todayEnd = addDays(todayStart, 1)
    const yesterdayStart = addDays(todayStart, -1)

    // ── 1. Occupancy donut ─────────────────────────────────────────
    const totalRooms = await this.prisma.room.count({
      where: { propertyId, deletedAt: null },
    })

    const inHouseStays = await this.prisma.guestStay.findMany({
      where: {
        propertyId,
        checkinAt:  { lte: todayEnd },
        scheduledCheckout: { gt: todayStart },
        actualCheckout: null,
        noShowAt: null,
      },
      select: {
        id: true,
        roomId: true,
        guestName: true,
        scheduledCheckout: true,
        paxCount: true,
        actualCheckin: true,
        notes: true,
      },
    })

    const arrivingTodayStays = inHouseStays.filter((s) => s.actualCheckin == null)
    const occupiedSet = new Set(inHouseStays.map((s) => s.roomId))
    const arrivingSet = new Set(arrivingTodayStays.map((s) => s.roomId))

    const occupied = occupiedSet.size - arrivingSet.size
    const arrivingToday = arrivingSet.size
    const empty = Math.max(0, totalRooms - occupiedSet.size)
    const todayPct = totalRooms === 0
      ? 0
      : Math.round((occupiedSet.size / totalRooms) * 100)

    // Yesterday's snapshot — for delta vs ayer
    const yesterdayInHouse = await this.prisma.guestStay.count({
      where: {
        propertyId,
        checkinAt:  { lt: todayStart },
        scheduledCheckout: { gt: yesterdayStart },
      },
    })
    const yesterdayPct = totalRooms === 0
      ? null
      : Math.round((yesterdayInHouse / totalRooms) * 100)

    const occupancy: OccupancyDonutDto = {
      percentage: todayPct,
      occupied,
      arrivingToday,
      empty,
      yesterdayPercentage: yesterdayPct,
      targetPercentage: 80,
    }

    // ── 2. In-house summary + expanded rows ─────────────────────────
    const departedToday = await this.prisma.guestStay.count({
      where: {
        propertyId,
        actualCheckout: { gte: todayStart, lt: todayEnd },
      },
    })

    const inHouse: InHouseSummaryDto = {
      guestCount: inHouseStays.reduce((sum, s) => sum + (s.paxCount ?? 1), 0),
      roomsOccupied: occupied,
      arrivalsToday: arrivingToday,
      departuresToday: departedToday,
    }

    // Build expanded rows — sorted by checkout-soonest first
    const sortedInHouse = [...inHouseStays].sort(
      (a, b) =>
        new Date(a.scheduledCheckout).getTime() -
        new Date(b.scheduledCheckout).getTime(),
    )
    const inHouseRoomsRaw = await this.prisma.guestStay.findMany({
      where: { id: { in: sortedInHouse.slice(0, IN_HOUSE_ROWS_CAP).map((s) => s.id) } },
      include: { room: { select: { id: true, number: true } } },
    })
    // Preserve sort order via a map — Prisma's `in` doesn't preserve insertion order
    const idIdx = new Map(sortedInHouse.slice(0, IN_HOUSE_ROWS_CAP).map((s, i) => [s.id, i]))
    inHouseRoomsRaw.sort((a, b) => (idIdx.get(a.id) ?? 0) - (idIdx.get(b.id) ?? 0))

    const inHouseRooms: InHouseRoomDto[] = inHouseRoomsRaw.map((s) => ({
      id: s.id,
      roomNumber: s.room?.number ?? '—',
      guestName: this.redactGuestName(s.guestName, actorRole),
      metaLabel: fmtScheduleLabel(s.scheduledCheckout, s.paxCount ?? 1, tz),
      flair: deriveFlair(s.notes, s.scheduledCheckout, defaultCheckoutTime, tz),
    }))

    // ── 3. Pending operational tasks ────────────────────────────────
    // CleaningTask doesn't carry propertyId directly — join through Unit.
    const hkPending = await this.prisma.cleaningTask.count({
      where: {
        scheduledFor: { gte: todayStart, lt: todayEnd },
        status: { in: ['PENDING', 'READY', 'UNASSIGNED', 'IN_PROGRESS', 'PAUSED'] },
        unit: { room: { propertyId } },
      },
    })

    // Maintenance critical — for Sprint 9, fall back to RoomBlock count
    // where the block is currently active. The dedicated MaintenanceTicket
    // model lives in the Maintenance roadmap (P7).
    // Schema uses startDate / endDate (Date columns), not startsAt / endsAt.
    const mttoCritical = await this.prisma.roomBlock.count({
      where: {
        propertyId,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gt: now } }],
      },
    })

    // Unpaid folios — only counted for non-HK roles.
    // PaymentStatus enum: PENDING | PARTIAL | PAID | CREDIT | OVERDUE.
    // "UNPAID" was wrong — the schema's neutral term is PENDING + OVERDUE.
    let unpaidFolios = 0
    let unpaidAmount = 0
    if (actorRole !== 'HOUSEKEEPER') {
      const unpaid = await this.prisma.guestStay.findMany({
        where: {
          propertyId,
          paymentStatus: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
          checkinAt: { lte: now },
          actualCheckout: null,
          noShowAt: null,
        },
        select: { totalAmount: true, amountPaid: true },
      })
      unpaidFolios = unpaid.length
      unpaidAmount = unpaid.reduce(
        (sum, f) => sum + Math.max(0, Number(f.totalAmount) - Number(f.amountPaid)),
        0,
      )
    }

    const pendingTasks: PendingTasksDto = {
      housekeepingPending: hkPending,
      maintenanceCritical: mttoCritical,
      unpaidFolios,
      unpaidAmountLabel:
        actorRole === 'HOUSEKEEPER' || unpaidFolios === 0
          ? null
          : `${fmtAmountWhole(unpaidAmount)} ${settings?.reportCurrency ?? 'MXN'}`,
    }

    // ── 4. Blocked rooms ────────────────────────────────────────────
    // Schema uses startDate/endDate, reason is BlockReason enum, semantic
    // is BlockSemantic enum. We map BlockReason → mobile category.
    const blocks = await this.prisma.roomBlock.findMany({
      where: {
        propertyId,
        OR: [{ endDate: null }, { endDate: { gt: now } }],
      },
      include: {
        // Direct includes — relations exist on RoomBlock per schema.
        // Need to read via prisma.roomBlock.findMany with `include`.
      },
      orderBy: { startDate: 'asc' },
      take: BLOCKED_ROWS_CAP,
    })

    // Second pass to fetch relation names — avoids the include type-check
    // dance with optional relations. Acceptable: ≤12 blocks per property.
    const roomIds = blocks.map((b) => b.roomId).filter((x): x is string => !!x)
    const requestedIds = blocks.map((b) => b.requestedById)
    const approvedIds = blocks.map((b) => b.approvedById).filter((x): x is string => !!x)
    const [rooms, requesters, approvers] = await Promise.all([
      this.prisma.room.findMany({
        where: { id: { in: roomIds } },
        select: { id: true, number: true },
      }),
      this.prisma.housekeepingStaff.findMany({
        where: { id: { in: requestedIds } },
        select: { id: true, name: true },
      }),
      this.prisma.housekeepingStaff.findMany({
        where: { id: { in: approvedIds } },
        select: { id: true, name: true },
      }),
    ])
    const roomById = new Map(rooms.map((r) => [r.id, r]))
    const reqById = new Map(requesters.map((r) => [r.id, r]))
    const apvById = new Map(approvers.map((r) => [r.id, r]))

    const blockedRooms: BlockedRoomDto[] = blocks.map((b) => ({
      id: b.id,
      roomNumber: b.roomId ? (roomById.get(b.roomId)?.number ?? '—') : '—',
      reason: b.notes ?? this.humanReason(b.reason),
      category: this.mapBlockCategory(b.reason),
      startsAt: b.startDate.toISOString(),
      endsAt: b.endDate?.toISOString() ?? null,
      rangeLabel: fmtDateRange(b.startDate, b.endDate, tz),
      requestedByName:
        actorRole === 'HOUSEKEEPER' ? null : (reqById.get(b.requestedById)?.name ?? null),
      approvedByName:
        actorRole === 'HOUSEKEEPER' || !b.approvedById
          ? null
          : (apvById.get(b.approvedById)?.name ?? null),
      ticketId: null, // P7 Maintenance module — link surfaced in Sprint 9+
    }))

    // ── 5. Movements (arrivals + departures) ─────────────────────────
    const arrivals = await this.fetchMovements(
      propertyId,
      actorRole,
      'arrivals',
      todayStart,
      todayEnd,
    )
    const departures = await this.fetchMovements(
      propertyId,
      actorRole,
      'departures',
      todayStart,
      todayEnd,
    )

    return {
      computedAt: now.toISOString(),
      occupancy,
      inHouse,
      inHouseRooms,
      pendingTasks,
      blockedRooms,
      arrivals,
      departures,
    }
  }

  // ── Private helpers ──────────────────────────────────────────────

  private redactGuestName(
    name: string | null,
    role: HousekeepingRole,
  ): string | null {
    if (role === 'HOUSEKEEPER') return null
    return name ?? null
  }

  /**
   * Map RoomBlock.reason enum to the BlockedRoomDto category.
   * BlockReason is a Prisma enum — values like MAINTENANCE / DEEP_CLEAN
   * / SMART_BLOCK / VIP_HOLD / etc. For mobile we collapse into 4 buckets.
   */
  private mapBlockCategory(
    blockReason: string,
  ): BlockedRoomDto['category'] {
    const upper = (blockReason ?? '').toUpperCase()
    if (upper.includes('MAINT') || upper.includes('REPAIR')) return 'MAINTENANCE'
    if (
      upper.includes('RENOV') ||
      upper.includes('REFURB') ||
      upper.includes('DEEP_CLEAN')
    ) return 'RENOVATION'
    if (
      upper.includes('ADMIN') ||
      upper.includes('SMART') ||
      upper.includes('VIP') ||
      upper.includes('BAD_DEBT')
    ) return 'ADMIN'
    return 'OTHER'
  }

  /** Human-readable fallback when notes are empty. */
  private humanReason(reason: string): string {
    return reason
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }

  private async fetchMovements(
    propertyId: string,
    actorRole: HousekeepingRole,
    kind: 'arrivals' | 'departures',
    todayStart: Date,
    todayEnd: Date,
  ): Promise<MovementItemDto[]> {
    const where =
      kind === 'arrivals'
        ? {
            propertyId,
            checkinAt: { gte: todayStart, lt: todayEnd },
            // We surface ALL arrivals expected today (whether already
            // checked-in or not — the mobile card has the toggle).
            noShowAt: null,
          }
        : {
            propertyId,
            scheduledCheckout: { gte: todayStart, lt: todayEnd },
            actualCheckout: null,
            noShowAt: null,
          }

    const stays = await this.prisma.guestStay.findMany({
      where,
      include: { room: { select: { number: true } } },
      take: MOVEMENT_ROWS_CAP,
      orderBy: kind === 'arrivals' ? { checkinAt: 'asc' } : { scheduledCheckout: 'asc' },
    })

    return stays.map((s) => ({
      stayId: s.id,
      guestName: this.redactGuestName(s.guestName, actorRole),
      roomNumber: s.room?.number ?? null,
      paxCount: s.paxCount ?? 1,
      source: s.source ?? null,
      flair: null, // Sprint 9+: derive from notes / extras
    }))
  }
}
