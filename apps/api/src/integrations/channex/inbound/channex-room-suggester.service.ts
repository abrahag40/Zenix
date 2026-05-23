import { Injectable, Logger } from '@nestjs/common'
import { AvailabilityService } from '../../../pms/availability/availability.service'
import { PrismaService } from '../../../prisma/prisma.service'

/**
 * ChannexRoomSuggesterService — Day 7 D-CHX5 UX enhancement.
 *
 * Cuando un stay queda en conflicto Channex (typically AVAILABILITY_OVERLAP
 * o NO_ROOM_TYPE_MATCH), el SUPERVISOR necesita decidir rápido a qué
 * habitación moverlo. En vez de presentar un dropdown plano de todas las
 * habitaciones del hotel (ruido cognitivo + Hick's Law) ranqueamos
 * candidatos por similitud al placeholder + viability.
 *
 * Algoritmo (scoring weighted, 0-100):
 *   Filter (HARD — descarta candidatos):
 *     · Same property
 *     · Not deleted
 *     · Not the current conflict room
 *     · Available para [checkinAt, scheduledCheckout) via AvailabilityService
 *
 *   Score (SOFT — ordena los que pasan el filter):
 *     ┌─────────────────────────────────────────────────────┬────┐
 *     │ Componente                                           │ pts│
 *     ├─────────────────────────────────────────────────────┼────┤
 *     │ Same channexRoomTypeId (OTA mapping continúa válido) │ 30 │
 *     │ Same RoomType.id (categoría comercial idéntica)      │ 25 │
 *     │ Same RoomCategory (PRIVATE vs SHARED)                │ 15 │
 *     │ Same capacity (camas individuales/dobles match)      │ 15 │
 *     │ Same floor (proximidad — guests prefieren misma área)│ 10 │
 *     │ Same room status AVAILABLE (vs DIRTY/CLEANING)       │  5 │
 *     └─────────────────────────────────────────────────────┴────┘
 *     Max possible score = 100. Ties broken por room.number asc.
 *
 *   Top 3 returned con reasoning chips ("misma cat. doble", "mismo piso").
 *
 * Pattern de Mews "Space alternatives" + Cloudbeds "Room move suggestions"
 * — boutique PMS UX donde el manager toma una decisión informada en 2 clicks.
 */
@Injectable()
export class ChannexRoomSuggesterService {
  private readonly logger = new Logger(ChannexRoomSuggesterService.name)
  private static readonly TOP_N = 3

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
  ) {}

  async suggest(stayId: string): Promise<RoomSuggestion[]> {
    const stay = await this.prisma.guestStay.findUnique({
      where: { id: stayId },
      select: {
        id: true,
        propertyId: true,
        roomId: true,
        checkinAt: true,
        scheduledCheckout: true,
        paxCount: true,
        room: {
          select: {
            id: true,
            number: true,
            floor: true,
            category: true,
            capacity: true,
            roomTypeId: true,
            channexRoomTypeId: true,
          },
        },
      },
    })
    if (!stay) return []

    // Get all candidate rooms in the same property
    const candidates = await this.prisma.room.findMany({
      where: {
        propertyId: stay.propertyId,
        deletedAt: null,
        id: { not: stay.roomId },
        // Hard requirement: capacity ≥ paxCount of the stay
        capacity: { gte: stay.paxCount },
      },
      select: {
        id: true,
        number: true,
        floor: true,
        category: true,
        capacity: true,
        status: true,
        roomTypeId: true,
        channexRoomTypeId: true,
        roomType: { select: { id: true, name: true, code: true } },
      },
    })

    // Filter by availability + score
    const scored: RoomSuggestion[] = []
    for (const cand of candidates) {
      const check = await this.availability.check({
        roomId: cand.id,
        from: stay.checkinAt,
        to: stay.scheduledCheckout,
        excludeStayIds: [stay.id],
      })
      if (!check.available) continue

      const { score, reasons } = ChannexRoomSuggesterService.scoreCandidate(
        stay.room,
        cand,
      )

      scored.push({
        roomId: cand.id,
        roomNumber: cand.number,
        floor: cand.floor,
        category: cand.category,
        capacity: cand.capacity,
        status: cand.status,
        roomTypeName: cand.roomType?.name ?? null,
        roomTypeCode: cand.roomType?.code ?? null,
        score,
        reasons,
      })
    }

    // Sort: highest score first, then room number asc for stable order
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })
    })

    const top = scored.slice(0, ChannexRoomSuggesterService.TOP_N)
    this.logger.debug(
      `[Channex suggester] stay=${stayId} candidates=${candidates.length} ` +
        `available=${scored.length} top=${top.map((s) => `${s.roomNumber}(${s.score})`).join(',')}`,
    )
    return top
  }

  /**
   * Pure scoring function. Exposed static so it can be unit-tested without
   * DI / DB. Returns score 0-100 and the reasons that contributed.
   */
  static scoreCandidate(
    reference: {
      floor: number | null
      category: string
      capacity: number
      roomTypeId: string | null
      channexRoomTypeId: string | null
    },
    candidate: {
      floor: number | null
      category: string
      capacity: number
      status: string
      roomTypeId: string | null
      channexRoomTypeId: string | null
    },
  ): { score: number; reasons: SuggestionReason[] } {
    const reasons: SuggestionReason[] = []
    let score = 0

    // Same channexRoomTypeId mapping — highest weight because future OTA
    // rebookings can re-target this room without remapping.
    if (
      reference.channexRoomTypeId &&
      candidate.channexRoomTypeId === reference.channexRoomTypeId
    ) {
      score += 30
      reasons.push({ kind: 'SAME_CHANNEX_ROOM_TYPE', label: 'Mismo mapeo OTA', weight: 30 })
    }

    // Same Zenix RoomType — commercial category match (same rate, same description).
    if (reference.roomTypeId && candidate.roomTypeId === reference.roomTypeId) {
      score += 25
      reasons.push({ kind: 'SAME_ROOM_TYPE', label: 'Mismo tipo de habitación', weight: 25 })
    }

    // Same RoomCategory — PRIVATE vs SHARED matters operationally.
    if (candidate.category === reference.category) {
      score += 15
      reasons.push({
        kind: 'SAME_CATEGORY',
        label: candidate.category === 'PRIVATE' ? 'Privada' : 'Compartida',
        weight: 15,
      })
    }

    // Same capacity — best proxy for "same bed configuration" without
    // querying Unit-level bed types (which v1.0.0 doesn't track per-bed —
    // ver post-cert roadmap §6 para bedType matching v1.0.5+).
    //
    // Decisión 2026-05-22: capacidad MAYOR del candidato NO suma score.
    // Razón: si el guest reservó una sencilla, queremos que el supervisor
    // vea PRIMERO otras sencillas disponibles. La doble pasa el filtro
    // hard (capacity ≥ paxCount) por si es la única opción, pero queda
    // ranqueada al fondo y con label honesto del mismatch.
    if (candidate.capacity === reference.capacity) {
      score += 15
      reasons.push({
        kind: 'SAME_CAPACITY',
        label: `Capacidad ${candidate.capacity} hués${candidate.capacity === 1 ? 'ped' : 'pedes'}`,
        weight: 15,
      })
    } else if (candidate.capacity > reference.capacity) {
      // Acepta pero NO da score. Label explícito del mismatch para que el
      // supervisor decida con la info en frente (no acepte automatic).
      reasons.push({
        kind: 'LARGER_CAPACITY',
        label: `⚠ Distinto tipo de cama (${reference.capacity} → ${candidate.capacity})`,
        weight: 0,
      })
    }

    // Same floor — guest preference + housekeeping efficiency
    if (
      reference.floor !== null &&
      candidate.floor !== null &&
      candidate.floor === reference.floor
    ) {
      score += 10
      reasons.push({ kind: 'SAME_FLOOR', label: `Mismo piso (${candidate.floor})`, weight: 10 })
    }

    // Room AVAILABLE means clean and ready — no housekeeping delay
    if (candidate.status === 'AVAILABLE') {
      score += 5
      reasons.push({ kind: 'READY_NOW', label: 'Lista ahora', weight: 5 })
    }

    return { score, reasons }
  }
}

// ── Public types ─────────────────────────────────────────────────────────────

export interface RoomSuggestion {
  roomId: string
  roomNumber: string
  floor: number | null
  category: string
  capacity: number
  status: string
  roomTypeName: string | null
  roomTypeCode: string | null
  score: number
  reasons: SuggestionReason[]
}

export interface SuggestionReason {
  kind:
    | 'SAME_CHANNEX_ROOM_TYPE'
    | 'SAME_ROOM_TYPE'
    | 'SAME_CATEGORY'
    | 'SAME_CAPACITY'
    | 'LARGER_CAPACITY'
    | 'SAME_FLOOR'
    | 'READY_NOW'
  label: string
  weight: number
}
