import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

// ── Channex.io Channel Manager Gateway ───────────────────────────────────────
//
// Responsibility: abstract all I/O against api.channex.io so the rest of the
// codebase never talks to the Channex HTTP API directly. Every module that
// touches inventory (AvailabilityService) goes through this gateway.
//
// Why a gateway: (a) Channex credentials live in one place, (b) rate-limit
// handling and retry logic are centralized, (c) Sprint 8 swaps the stub with
// real HTTP calls without touching consumers.
//
// Reference: https://docs.channex.io/api-v1  (see CLAUDE.md §Sprint 8)
//
// Endpoints this gateway will hit in Sprint 8:
//   GET  /v1/room_types/:id/availabilities?date_from=&date_to=   (pull)
//   POST /v1/availability                                         (push inventory)
//   POST /v1/restrictions                                         (push stop-sell, MLOS)
//   POST /v1/rates                                                (push rates)
//   Webhooks (inbound): booking_new, booking_modify, booking_cancel

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChannexAvailabilitySlot {
  date: string            // ISO date YYYY-MM-DD (local day of the property)
  roomTypeId: string      // Channex room_type_id (mapped from internal roomId via RoomTypeMapping)
  available: number       // remaining allotment across all channels
  stopSell: boolean
}

export interface ChannexInventoryUpdate {
  roomTypeId: string
  dateFrom: string        // ISO YYYY-MM-DD
  dateTo: string          // ISO YYYY-MM-DD (exclusive)
  delta: number           // -1 per night when reserving, +1 when releasing
  reason: 'RESERVATION' | 'CANCELLATION' | 'ROOM_MOVE' | 'SPLIT' | 'BLOCK' | 'RELEASE'
  // Internal trace id to correlate with our audit trail
  traceId: string
}

export interface ChannexPullResult {
  /** True if we got a real answer from Channex; false if gateway is disabled */
  fromChannex: boolean
  slots: ChannexAvailabilitySlot[]
}

// ── Gateway ──────────────────────────────────────────────────────────────────

@Injectable()
export class ChannexGateway {
  private readonly logger = new Logger(ChannexGateway.name)

  constructor(private readonly config: ConfigService) {}

  /** Whether Channex integration is enabled for this property/environment. */
  get enabled(): boolean {
    return this.config.get<string>('CHANNEX_ENABLED') === 'true'
  }

  /**
   * Pull availability for a room_type across a date range.
   *
   * Sprint 8: GET /v1/room_types/:id/availabilities?date_from&date_to
   * Today:    returns { fromChannex: false } — consumers fall back to local DB.
   */
  async pullAvailability(params: {
    roomTypeId: string
    dateFrom: Date
    dateTo: Date
  }): Promise<ChannexPullResult> {
    if (!this.enabled) {
      return { fromChannex: false, slots: [] }
    }

    // TODO(sprint8): implement real HTTP call with user-api-key header.
    // const res = await fetch(`${this.baseUrl}/room_types/${params.roomTypeId}/availabilities?...`)
    // Map response → ChannexAvailabilitySlot[]
    this.logger.warn('pullAvailability called but Sprint 8 impl is pending')
    return { fromChannex: false, slots: [] }
  }

  /**
   * Push an inventory delta to Channex so all connected channels see the
   * updated allotment. Fire-and-forget: we log on failure, do not throw.
   *
   * Sprint 8: POST /v1/availability with room_type_id, date, availability
   */
  async pushInventory(update: ChannexInventoryUpdate): Promise<void> {
    if (!this.enabled) return

    // TODO(sprint8): implement. Retry queue on transient failures.
    this.logger.warn(
      `pushInventory queued (Sprint 8 pending): ${update.reason} trace=${update.traceId}`,
    )
  }

  /**
   * Push a stop-sell flag for a room_type on a date range.
   * Use when the property decides to block selling (renovation, maintenance).
   */
  async pushStopSell(params: {
    roomTypeId: string
    dateFrom: Date
    dateTo: Date
    stopSell: boolean
    traceId: string
  }): Promise<void> {
    if (!this.enabled) return
    // TODO(sprint8): POST /v1/restrictions { stop_sell: true/false }
    this.logger.warn(`pushStopSell queued (Sprint 8 pending): trace=${params.traceId}`)
  }
}
