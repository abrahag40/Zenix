import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

// ── Channex.io Channel Manager Gateway ───────────────────────────────────────
//
// Centraliza todo el I/O contra api.channex.io. Ningún módulo externo habla
// con Channex directamente — siempre a través de este gateway.
//
// Auth: header `user-api-key` en cada request (Channex API docs).
// Base URL: CHANNEX_BASE_URL (default: https://app.channex.io/api/v1)
// Política de fallos (CLAUDE.md §31): pushInventory es best-effort.
//   - Si Channex falla, la operación local ya está commiteada → log, NO revertir.
//   - pullAvailability en lecturas normales: fail-soft (retorna fromChannex:false).
//
// Endpoints implementados:
//   GET  /v1/room_types/:id/availabilities?date_from&date_to  (pull allotment)
//   POST /v1/availability                                      (push inventory delta)
//   POST /v1/restrictions                                      (stop-sell, MLOS) — stub
//
// Webhooks inbound (booking_new, booking_modify, booking_cancel):
//   Consumidos en /api/webhooks/channex (ver Sprint 8).

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ChannexAvailabilitySlot {
  date: string            // YYYY-MM-DD (día local de la propiedad)
  roomTypeId: string      // Channex room_type_id
  available: number       // allotment total en todos los canales
  stopSell: boolean
}

export interface ChannexInventoryUpdate {
  channexPropertyId?: string  // Property ID en Channex (de PropertySettings.channexPropertyId)
  roomTypeId: string          // Room type ID en Channex (de Room.channexRoomTypeId)
  dateFrom: string            // YYYY-MM-DD (inclusive)
  dateTo: string              // YYYY-MM-DD (inclusive)
  delta: number               // +1 = liberar una unidad, -1 = ocupar una unidad
  reason: 'RESERVATION' | 'CANCELLATION' | 'ROOM_MOVE' | 'SPLIT' | 'BLOCK' | 'RELEASE'
  traceId: string             // ID interno para correlacionar con audit trail
}

/**
 * Modelo de conteo absoluto para hostales con camas múltiples (dorms).
 *
 * Channex espera valores absolutos: `available=3` en la fecha D significa
 * "quedan 3 camas disponibles" — no deltas. Esto garantiza idempotencia:
 * una re-sincronización siempre produce el estado correcto sin replay de eventos.
 */
export interface ChannexAbsoluteUpdate {
  channexPropertyId?: string           // PropertySettings.channexPropertyId
  roomTypeId: string                   // Room.channexRoomTypeId
  entries: { date: string; available: number }[]  // YYYY-MM-DD → conteo absoluto
  traceId: string
}

export interface ChannexPullResult {
  fromChannex: boolean
  slots: ChannexAvailabilitySlot[]
}

// ── Gateway ──────────────────────────────────────────────────────────────────

@Injectable()
export class ChannexGateway {
  private readonly logger = new Logger(ChannexGateway.name)

  constructor(private readonly config: ConfigService) {}

  private get apiKey(): string | undefined {
    return this.config.get<string>('CHANNEX_API_KEY')
  }

  private get baseUrl(): string {
    return (
      this.config.get<string>('CHANNEX_BASE_URL') ??
      'https://app.channex.io/api/v1'
    )
  }

  /** True si las credenciales están configuradas. Sin ellas, todas las llamadas son no-op. */
  get enabled(): boolean {
    return !!this.apiKey
  }

  // ─── Pull availability ──────────────────────────────────────────────────────
  //
  // Channex endpoint: GET /room_types/:id/availabilities?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
  // Respuesta: { data: [{ attributes: { availability: [{date, availability, stop_sell}] } }] }
  //
  // Fail-soft en lecturas — los consumidores vuelven a datos locales si Channex no responde.
  async pullAvailability(params: {
    roomTypeId: string
    dateFrom: Date
    dateTo: Date
  }): Promise<ChannexPullResult> {
    if (!this.enabled) {
      return { fromChannex: false, slots: [] }
    }

    const from = toDateString(params.dateFrom)
    const to   = toDateString(params.dateTo)
    const url  = `${this.baseUrl}/room_types/${params.roomTypeId}/availabilities?date_from=${from}&date_to=${to}`

    try {
      const res = await fetch(url, {
        headers: {
          'user-api-key': this.apiKey!,
          'Content-Type': 'application/json',
        },
      })

      if (!res.ok) {
        const text = await res.text()
        this.logger.warn(`[Channex] pullAvailability HTTP ${res.status}: ${text}`)
        return { fromChannex: false, slots: [] }
      }

      const json = await res.json() as {
        data?: { attributes?: { availability?: Array<{ date: string; availability: number; stop_sell: boolean }> } }[]
      }

      const raw = json.data?.[0]?.attributes?.availability ?? []
      const slots: ChannexAvailabilitySlot[] = raw.map((item) => ({
        date:       item.date,
        roomTypeId: params.roomTypeId,
        available:  item.availability,
        stopSell:   item.stop_sell,
      }))

      return { fromChannex: true, slots }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.warn(`[Channex] pullAvailability failed: ${msg} — using local data`)
      return { fromChannex: false, slots: [] }
    }
  }

  // ─── Push inventory delta ───────────────────────────────────────────────────
  //
  // Channex endpoint: POST /availability
  // Body: { values: [{ property_id, room_type_id, date, availability }] }
  //
  // Nota: Channex acepta valores ABSOLUTOS, no deltas. Este método envía
  // availability=1 para RELEASE y availability=0 para RESERVATION/BLOCK.
  // Esto es correcto para propiedades con 1 unidad por room_type (boutique hotels).
  // Para propiedades con múltiples unidades, se necesitará pull-then-push (Sprint 8+).
  //
  // IMPORTANTE — Best-effort (CLAUDE.md §31):
  //   La operación local ya fue commiteada antes de llamar aquí.
  //   Si Channex falla, logueamos pero NO lanzamos excepción.
  async pushInventory(update: ChannexInventoryUpdate): Promise<void> {
    if (!this.enabled) return
    // Skip silently if the property has no Channex ID configured (§31 fail-soft)
    if (!update.channexPropertyId) return

    // Generar lista de fechas en el rango (dateFrom inclusive, dateTo inclusive)
    const dates = generateDateRange(update.dateFrom, update.dateTo)
    if (dates.length === 0) return

    // Channex usa valores absolutos: RELEASE (+1 delta) → 1 disponible; todo lo demás → 0
    const absoluteValue = update.delta > 0 ? 1 : 0

    const values = dates.map((date) => ({
      property_id:  update.channexPropertyId,
      room_type_id: update.roomTypeId,
      date,
      availability: absoluteValue,
    }))

    try {
      const res = await fetch(`${this.baseUrl}/availability`, {
        method: 'POST',
        headers: {
          'user-api-key':  this.apiKey!,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ values }),
      })

      if (!res.ok) {
        const text = await res.text()
        // Log pero NO throw — la operación local ya está commiteada
        this.logger.error(
          `[Channex] pushInventory failed HTTP ${res.status} ` +
          `reason=${update.reason} trace=${update.traceId}: ${text}`,
        )
        return
      }

      this.logger.log(
        `[Channex] pushInventory OK reason=${update.reason} ` +
        `dates=${dates.length} delta=${update.delta} trace=${update.traceId}`,
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      // Best-effort: loguear y continuar (CLAUDE.md §31)
      this.logger.error(
        `[Channex] pushInventory network error reason=${update.reason} trace=${update.traceId}: ${msg}`,
      )
    }
  }

  // ─── Push absolute availability (hostel dorm model) ────────────────────────
  //
  // Channex endpoint: POST /availability
  // Body: { values: [{ property_id, room_type_id, date, availability }] }
  //
  // Diferencia clave vs pushInventory (delta):
  //   pushInventory envía 0 o 1 (modelo hotel — 1 unidad por room type).
  //   pushAbsoluteAvailability envía el CONTEO REAL de unidades disponibles,
  //   calculado externamente por AvailabilityService.computeAndPushInventory().
  //   Esto es correcto para dorms con N camas: si hay 4 camas y 1 bloqueada,
  //   se envía availability=3 — Channex y las OTAs muestran 3 disponibles.
  //
  // Idempotente: llamar dos veces con el mismo conteo produce el mismo resultado.
  // Best-effort (CLAUDE.md §31): nunca lanza excepción.
  async pushAbsoluteAvailability(update: ChannexAbsoluteUpdate): Promise<void> {
    if (!this.enabled) return
    if (!update.channexPropertyId) return
    if (update.entries.length === 0) return

    const values = update.entries.map(({ date, available }) => ({
      property_id:  update.channexPropertyId,
      room_type_id: update.roomTypeId,
      date,
      availability: available,
    }))

    try {
      const res = await fetch(`${this.baseUrl}/availability`, {
        method: 'POST',
        headers: {
          'user-api-key':  this.apiKey!,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ values }),
      })

      if (!res.ok) {
        const text = await res.text()
        this.logger.error(
          `[Channex] pushAbsoluteAvailability failed HTTP ${res.status} ` +
          `entries=${values.length} trace=${update.traceId}: ${text}`,
        )
        return
      }

      this.logger.log(
        `[Channex] pushAbsoluteAvailability OK ` +
        `roomType=${update.roomTypeId} entries=${values.length} trace=${update.traceId}`,
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(
        `[Channex] pushAbsoluteAvailability network error trace=${update.traceId}: ${msg}`,
      )
    }
  }

  // ─── Push stop-sell ─────────────────────────────────────────────────────────
  //
  // Channex endpoint: POST /restrictions
  // Usada cuando la propiedad bloquea venta (renovación, mantenimiento).
  async pushStopSell(params: {
    channexPropertyId: string
    roomTypeId: string
    dateFrom: Date
    dateTo: Date
    stopSell: boolean
    traceId: string
  }): Promise<void> {
    if (!this.enabled) return

    const dates = generateDateRange(toDateString(params.dateFrom), toDateString(params.dateTo))
    if (dates.length === 0) return

    const values = dates.map((date) => ({
      property_id:  params.channexPropertyId,
      room_type_id: params.roomTypeId,
      date,
      stop_sell:    params.stopSell,
    }))

    try {
      const res = await fetch(`${this.baseUrl}/restrictions`, {
        method: 'POST',
        headers: {
          'user-api-key': this.apiKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values }),
      })

      if (!res.ok) {
        const text = await res.text()
        this.logger.error(
          `[Channex] pushStopSell failed HTTP ${res.status} trace=${params.traceId}: ${text}`,
        )
        return
      }

      this.logger.log(`[Channex] pushStopSell OK stopSell=${params.stopSell} trace=${params.traceId}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`[Channex] pushStopSell network error trace=${params.traceId}: ${msg}`)
    }
  }

  // ─── ARI Push (Sprint CHANNEX-OUTBOUND-CERT) ────────────────────────────────
  //
  // Endpoints oficiales Channex (verificado 2026-05-22):
  //   POST /availability   — count per [property, room_type, date]
  //   POST /restrictions   — rates + min_stay + max_stay + CTA/CTD + stop_sell
  //                          per [property, rate_plan, date]
  //
  // NOTA crítica: NO existe POST /rates separado. Todo lo que NO es
  // availability (rates, stop_sell, CTA, CTD, min/max stay) va junto al
  // endpoint /restrictions y opera a nivel de rate_plan_id (NO room_type_id).
  // El pushStopSell legacy del Sprint 8 enviaba room_type_id (incorrecto).
  // pushRestrictions corrige esto y debe usarse para todo nuevo código.
  //
  // Anti-patterns mitigados:
  //   · AP-4: ambos métodos aceptan arrays. Singular methods no existen.
  //   · AP-2.8: dos métodos distintos para los dos endpoints — imposible
  //     mezclar avail con rate/restriction en un solo HTTP call.

  /**
   * POST /api/v1/availability
   *
   * Acepta batch de entries cross-property cross-room-type. El caller
   * (ChannexOutboundWorker) debe haber armado el batch respetando rate limit.
   *
   * Soporta tanto `date` (single) como `date_from`+`date_to` (range) per row.
   *
   * Best-effort §31: el caller maneja retry/backoff (outbox pattern).
   * Lanza ChannexHttpError si Channex responde no-200.
   */
  async pushAvailability(entries: ChannexAvailabilityEntry[]): Promise<void> {
    this.requireEnabled('pushAvailability')
    if (entries.length === 0) return

    const values = entries.map((e) => {
      const base = {
        property_id: e.propertyId,
        room_type_id: e.roomTypeId,
        availability: e.availability,
      }
      if (e.date) {
        return { ...base, date: e.date }
      }
      if (e.dateFrom && e.dateTo) {
        return { ...base, date_from: e.dateFrom, date_to: e.dateTo }
      }
      throw new Error(
        `[Channex] pushAvailability entry needs either { date } or { dateFrom, dateTo } — ` +
          `got property=${e.propertyId} room_type=${e.roomTypeId}`,
      )
    })

    const res = await fetch(`${this.baseUrl}/availability`, {
      method: 'POST',
      headers: {
        'user-api-key': this.apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new ChannexHttpError(
        `pushAvailability HTTP ${res.status} entries=${entries.length}: ${text}`,
        res.status,
      )
    }

    this.logger.log(`[Channex] pushAvailability OK entries=${entries.length}`)
  }

  /**
   * POST /api/v1/restrictions
   *
   * Endpoint unificado que soporta rate + todas las restricciones por
   * rate_plan_id. Channex requiere AT LEAST ONE restriction field por row.
   *
   * Una sola llamada puede contener N entries con CUALQUIER combinación de:
   *   rate, min_stay_through, min_stay_arrival, min_stay, max_stay,
   *   closed_to_arrival, closed_to_departure, stop_sell, days[]
   *
   * Esto cumple los Tests 2-8 oficiales (todos baten "1 API call" porque
   * agrupamos batched entries dentro del array values).
   */
  async pushRestrictions(entries: ChannexRestrictionEntry[]): Promise<void> {
    this.requireEnabled('pushRestrictions')
    if (entries.length === 0) return

    const values = entries.map((e) => {
      const row: Record<string, unknown> = {
        property_id: e.propertyId,
        rate_plan_id: e.ratePlanId, // ← CRÍTICO: rate_plan_id, NO room_type_id
      }
      if ('date' in e && e.date) row.date = e.date
      else {
        row.date_from = e.dateFrom
        row.date_to = e.dateTo
      }
      if (e.days && e.days.length > 0) row.days = e.days
      if (e.rate !== undefined) row.rate = e.rate
      if (e.rates && e.rates.length > 0) row.rates = e.rates
      if (e.minStayThrough !== undefined) row.min_stay_through = e.minStayThrough
      if (e.minStayArrival !== undefined) row.min_stay_arrival = e.minStayArrival
      if (e.minStay !== undefined) row.min_stay = e.minStay
      if (e.maxStay !== undefined) row.max_stay = e.maxStay
      if (e.closedToArrival !== undefined) row.closed_to_arrival = e.closedToArrival
      if (e.closedToDeparture !== undefined) row.closed_to_departure = e.closedToDeparture
      if (e.stopSell !== undefined) row.stop_sell = e.stopSell

      // Channex: "At least one restriction should be present on the request"
      const hasField = Object.keys(row).some(
        (k) =>
          ![
            'property_id',
            'rate_plan_id',
            'date',
            'date_from',
            'date_to',
            'days',
          ].includes(k),
      )
      if (!hasField) {
        throw new Error(
          `[Channex] pushRestrictions entry must have at least one restriction ` +
            `(rate, min_stay_*, max_stay, closed_to_*, stop_sell) — got only date keys`,
        )
      }
      return row
    })

    const res = await fetch(`${this.baseUrl}/restrictions`, {
      method: 'POST',
      headers: {
        'user-api-key': this.apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new ChannexHttpError(
        `pushRestrictions HTTP ${res.status} entries=${entries.length}: ${text}`,
        res.status,
      )
    }

    this.logger.log(`[Channex] pushRestrictions OK entries=${entries.length}`)
  }

  // ─── Booking revisions API (Sprint CHANNEX-INBOUND) ─────────────────────────
  //
  // Cuando Channex emite un webhook booking_new/modify/cancel, el payload
  // trae SOLO `{event, property_id, booking_id, revision_id}`. Para obtener
  // la reserva completa, el PMS debe llamar GET /booking_revisions/:id con
  // user-api-key, persistir, y luego POST /booking_revisions/:id/ack.
  //
  // Si no se ackea en 30 minutos, Channex re-emite `non_acked_booking`.

  /**
   * GET /api/v1/booking_revisions/:id
   * Retorna la revision completa con guest, rooms, services, currency, etc.
   * Lanza si HTTP != 200 — el caller debe manejar retry/backoff (outbox).
   */
  async getBookingRevision(revisionId: string): Promise<ChannexBookingRevision> {
    this.requireEnabled('getBookingRevision')
    const url = `${this.baseUrl}/booking_revisions/${revisionId}`
    const res = await fetch(url, {
      headers: {
        'user-api-key': this.apiKey!,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      const text = await res.text()
      throw new ChannexHttpError(
        `getBookingRevision ${revisionId} HTTP ${res.status}: ${text}`,
        res.status,
      )
    }

    const json = (await res.json()) as { data?: { attributes?: ChannexBookingRevision } }
    const attrs = json.data?.attributes
    if (!attrs) {
      throw new ChannexHttpError(`getBookingRevision ${revisionId} missing data.attributes`, 502)
    }
    return attrs
  }

  /**
   * POST /api/v1/booking_revisions/:id/ack
   * Marca la revision como recibida y procesada. Idempotente del lado
   * Channex — un ack duplicado responde 422 (Unprocessable Entity), no error.
   */
  async ackBookingRevision(revisionId: string): Promise<{ acked: boolean; alreadyAcked: boolean }> {
    this.requireEnabled('ackBookingRevision')
    const url = `${this.baseUrl}/booking_revisions/${revisionId}/ack`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'user-api-key': this.apiKey!,
        'Content-Type': 'application/json',
      },
    })

    if (res.status === 200) {
      return { acked: true, alreadyAcked: false }
    }
    // Idempotent success on 404 / 422 — the revision is no longer in the
    // unacked queue (acked by a previous worker, or by the feed scheduler
    // racing the webhook). Audit C2: treating these as DEAD_LETTER on a
    // duplicate ack call was producing false alarms.
    //   · 404 — documented response when "Booking Revision with provided
    //     ID is not present at system" (post-ack purge).
    //   · 422 — observed in some Channex environments for the same case
    //     (kept defensively).
    if (res.status === 404 || res.status === 422) {
      this.logger.warn(
        `[Channex] ackBookingRevision ${revisionId} HTTP ${res.status} ` +
          `(treating as already-acked / idempotent)`,
      )
      return { acked: true, alreadyAcked: true }
    }
    const text = await res.text()
    throw new ChannexHttpError(
      `ackBookingRevision ${revisionId} HTTP ${res.status}: ${text}`,
      res.status,
    )
  }

  /**
   * GET /api/v1/booking_revisions/feed
   * Lista las revisions no ackeadas (oldest first). Usado por el
   * ChannexFeedScheduler para reconciliation nocturna (D-CHX6) y como
   * fallback si un webhook se perdió.
   */
  async listBookingRevisionsFeed(params?: {
    propertyId?: string
    page?: number
    limit?: number
  }): Promise<{ revisions: ChannexBookingRevision[]; meta: ChannexFeedMeta }> {
    this.requireEnabled('listBookingRevisionsFeed')
    const search = new URLSearchParams({
      'order[inserted_at]': 'asc',
      ...(params?.propertyId ? { 'filter[property_id]': params.propertyId } : {}),
      ...(params?.page ? { page: String(params.page) } : {}),
      ...(params?.limit ? { limit: String(params.limit) } : {}),
    })
    const url = `${this.baseUrl}/booking_revisions/feed?${search.toString()}`
    const res = await fetch(url, {
      headers: {
        'user-api-key': this.apiKey!,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      const text = await res.text()
      throw new ChannexHttpError(`listBookingRevisionsFeed HTTP ${res.status}: ${text}`, res.status)
    }

    const json = (await res.json()) as {
      data?: Array<{ attributes: ChannexBookingRevision }>
      meta?: ChannexFeedMeta
    }
    const revisions = (json.data ?? []).map((row) => row.attributes)
    const meta: ChannexFeedMeta = json.meta ?? { total: 0, page: 1, limit: revisions.length }
    return { revisions, meta }
  }

  /**
   * GET /api/v1/properties
   * Health check para certification + debug. Lista properties accesibles
   * con la api-key configurada.
   */
  async listProperties(): Promise<Array<{ id: string; title: string; timezone: string; currency: string }>> {
    this.requireEnabled('listProperties')
    const res = await fetch(`${this.baseUrl}/properties`, {
      headers: {
        'user-api-key': this.apiKey!,
        'Content-Type': 'application/json',
      },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new ChannexHttpError(`listProperties HTTP ${res.status}: ${text}`, res.status)
    }
    const json = (await res.json()) as {
      data?: Array<{ id: string; attributes: { title: string; timezone: string; currency: string } }>
    }
    return (json.data ?? []).map((row) => ({
      id: row.id,
      title: row.attributes.title,
      timezone: row.attributes.timezone,
      currency: row.attributes.currency,
    }))
  }

  /**
   * PUT /api/v1/bookings/:id
   * Cancel a booking via Channex CRS — Channex relays the cancellation
   * upstream to the OTA. Per Channex docs (CRS API): "to cancel booking,
   * please use status cancelled".
   *
   * NOTE: this only propagates the cancellation signal. The OTA's own
   * cancellation policy (refund / penalty / fee) is enforced by the OTA
   * itself — Booking.com / Expedia / Airbnb decide. Front-desk should
   * communicate with the guest via the OTA extranet for any monetary
   * resolution.
   */
  async cancelBookingAtChannex(
    bookingId: string,
    reason?: string,
  ): Promise<{ ok: boolean; status: number }> {
    this.requireEnabled('cancelBookingAtChannex')
    const url = `${this.baseUrl}/bookings/${bookingId}`
    const body = {
      booking: {
        status: 'cancelled',
        ...(reason ? { notes: `Cancelled by Zenix PMS: ${reason}` } : {}),
      },
    }
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'user-api-key': this.apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (res.status === 200 || res.status === 204) {
      this.logger.log(`[Channex] cancelBookingAtChannex OK booking=${bookingId}`)
      return { ok: true, status: res.status }
    }
    const text = await res.text()
    throw new ChannexHttpError(
      `cancelBookingAtChannex ${bookingId} HTTP ${res.status}: ${text}`,
      res.status,
    )
  }

  private requireEnabled(op: string): void {
    if (!this.enabled) {
      throw new ChannexHttpError(`[Channex] ${op} called but CHANNEX_API_KEY not set`, 503)
    }
  }
}

// ── Booking revision types ───────────────────────────────────────────────────

export type ChannexBookingStatus = 'new' | 'modified' | 'cancelled'

export interface ChannexBookingRevisionRoom {
  amount: string
  checkin_date: string
  checkout_date: string
  rate_plan_id: string
  room_type_id: string
  occupancy: { adults: number; children: number; infants: number }
  days?: Record<string, string>
  services?: unknown[]
  taxes?: unknown[]
  guests?: Array<{ name?: string; surname?: string }>
}

export interface ChannexBookingRevisionCustomer {
  name?: string
  surname?: string
  mail?: string
  phone?: string
  address?: string
  city?: string
  country?: string
  zip?: string
  language?: string
  company?: string
}

export interface ChannexBookingRevision {
  id: string
  property_id: string
  booking_id: string
  unique_id?: string
  system_id?: string
  ota_reservation_code?: string
  ota_name?: string
  status: ChannexBookingStatus
  arrival_date: string
  departure_date: string
  arrival_hour?: string
  amount?: string
  /**
   * Channex 2026-04-01 schema addition. Indicates whether `amount` is gross
   * (incluye comisión OTA + impuestos) o net (sin comisión). Si Channex
   * empieza a enviar net, nuestro mapeo necesita restar/sumar diferenciado
   * para que el folio coincida con USALI. Default seguro: tratamos null y
   * 'gross' como gross. Cualquier otro valor → log warning + tratamos como
   * gross (manager debe reconciliar).
   */
  amount_type?: 'gross' | 'net' | null
  currency?: string
  ota_commission?: string
  rooms: ChannexBookingRevisionRoom[]
  services?: unknown[]
  customer?: ChannexBookingRevisionCustomer
  occupancy?: { adults: number; children: number; infants: number }
  inserted_at?: string
  notes?: string
  payment_collect?: 'property' | 'channel' | 'ota'
  /** Booking.com Genius / Airbnb virtual card details (2024+ schema). */
  guarantee?: unknown
}

export interface ChannexFeedMeta {
  total: number
  page: number
  limit: number
}

export class ChannexHttpError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'ChannexHttpError'
  }
}

// ── ARI Push entry types (Sprint CHANNEX-OUTBOUND-CERT) ─────────────────────

/**
 * Availability entry — POST /availability. Provide EITHER `date` (single day)
 * OR (`dateFrom` + `dateTo`) for a range. `availability` is the absolute count.
 * Validated at runtime by `pushAvailability`.
 */
export interface ChannexAvailabilityEntry {
  propertyId: string
  roomTypeId: string
  date?: string // YYYY-MM-DD
  dateFrom?: string // YYYY-MM-DD inclusive
  dateTo?: string // YYYY-MM-DD inclusive
  availability: number
}

/**
 * Restriction entry — POST /restrictions. At LEAST ONE of {rate, rates,
 * min_stay_*, max_stay, closed_to_*, stop_sell} must be present. Otherwise
 * `pushRestrictions` throws (cert AP — empty restriction rows fail).
 *
 * `days` filters which weekdays the row applies to (e.g., ['mo','tu','we']
 * for weekday-only restrictions; omit for all days).
 *
 * For per-occupancy rates use `rates: [{occupancy, rate}, ...]` instead of
 * the singular `rate` field (Channex doc: "multi-occupancy support").
 */
export interface ChannexRestrictionEntry {
  propertyId: string
  ratePlanId: string // ← rate_plan_id (NOT room_type_id — endpoint operates per rate plan)
  date?: string // YYYY-MM-DD (use this OR dateFrom+dateTo)
  dateFrom?: string
  dateTo?: string
  days?: ChannexWeekday[]
  rate?: number | string // single rate
  rates?: Array<{ occupancy: number; rate: number | string }> // multi-occupancy
  minStayThrough?: number
  minStayArrival?: number
  /** @deprecated Use minStayThrough — Channex still accepts but newer flow uses through/arrival explicit. */
  minStay?: number
  maxStay?: number
  closedToArrival?: boolean
  closedToDeparture?: boolean
  stopSell?: boolean
}

export type ChannexWeekday = 'mo' | 'tu' | 'we' | 'th' | 'fr' | 'sa' | 'su'

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0]
}

/** Genera todas las fechas entre from y to (ambas inclusive), formato YYYY-MM-DD. */
function generateDateRange(from: string, to: string): string[] {
  const dates: string[] = []
  const current = new Date(`${from}T00:00:00Z`)
  const end     = new Date(`${to}T00:00:00Z`)
  while (current <= end) {
    dates.push(toDateString(current))
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return dates
}
