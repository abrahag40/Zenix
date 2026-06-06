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
  /**
   * @deprecated Cert AP-4 risk — toma single update + itera per-date
   * internamente. **NUNCA llamar desde production code path nuevo**.
   * Migrado a event-driven `CHANNEX_AVAILABILITY_CHANGED` → outbox →
   * worker → `pushAvailability(entries[])` (arrays only).
   * Mock cert interview Stage 4 (2026-06-06) Q6 flagged este método.
   * Removal: v1.0.1 cleanup sprint.
   */
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
  /**
   * @deprecated Cert AP-4 risk — toma single update + itera per-date.
   * Use event-driven path con `pushAvailability(entries[])` arrays.
   * Removal: v1.0.1 cleanup sprint (mock interview Stage 4 2026-06-06 Q6).
   */
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
  /**
   * @deprecated Cert AP-4 risk — toma single params. Use event-driven path
   * con `pushRestrictions(entries[])` arrays. Removal: v1.0.1 cleanup sprint
   * (mock interview Stage 4 2026-06-06 Q6).
   */
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

    await this.throwIfNotOk(res, `pushAvailability entries=${entries.length}`)

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

    await this.throwIfNotOk(res, `pushRestrictions entries=${entries.length}`)

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

    await this.throwIfNotOk(res, `getBookingRevision ${revisionId}`)

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
    //   · 422 — DEFENSIVE only. Channex docs (verified 2026-05-22) NO
    //     mention 422 explicitly for ack idempotency; just 200/401/404.
    //     Pero algunos sandbox legacy responden 422 con "already_acked"
    //     body — preservamos la rama por compat. Audit D1: confirmar con
    //     soporte Channex post-cert si seguimos viéndolo.
    if (res.status === 404 || res.status === 422) {
      this.logger.warn(
        `[Channex] ackBookingRevision ${revisionId} HTTP ${res.status} ` +
          `(treating as already-acked / idempotent)`,
      )
      return { acked: true, alreadyAcked: true }
    }
    await this.throwIfNotOk(res, `ackBookingRevision ${revisionId}`)
    // throwIfNotOk threw — unreachable but TS requires return
    return { acked: false, alreadyAcked: false }
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

    await this.throwIfNotOk(res, 'listBookingRevisionsFeed')

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
    await this.throwIfNotOk(res, 'listProperties')
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
   * GET booking por id (CRS) — booking completa (attributes) tal cual Channex.
   * Usado SOLO por el flujo de cancelación (reconstruir el PUT con el objeto
   * completo), NO para recibir reservas (eso es el feed booking_revisions —
   * anti-patrón AP-2.6 evitado).
   */
  async getBooking(bookingId: string): Promise<ChannexBookingAttributes> {
    this.requireEnabled('getBooking')
    const res = await fetch(`${this.baseUrl}/bookings/${bookingId}`, {
      headers: { 'user-api-key': this.apiKey!, 'Content-Type': 'application/json' },
    })
    await this.throwIfNotOk(res, `getBooking ${bookingId}`)
    const json = (await res.json()) as { data?: { attributes?: ChannexBookingAttributes } }
    const attrs = json.data?.attributes
    if (!attrs) throw new ChannexHttpError(`getBooking ${bookingId} missing data.attributes`, 502)
    return attrs
  }

  /**
   * PUT /api/v1/bookings/:id — cancela una booking vía Channex CRS.
   *
   * Channex NO acepta un payload "status-only": el `PUT /bookings/:id` valida el
   * objeto booking COMPLETO (currency, ota_name, property_id, arrival/departure,
   * customer, rooms) → un body parcial responde HTTP 422 (bug detectado en e2e
   * 2026-06-03). Por eso traemos la booking actual con `getBooking`, la re-armamos
   * íntegra y le seteamos `status:'cancelled'`. Channex relaya la cancelación a la
   * OTA. La política de reembolso/penalización la decide la OTA.
   *
   * Airbnb: regla regulatoria 2022 prohíbe cancel programático desde el PMS (§152).
   * Retornamos `{ ok:false, skipped:'airbnb' }` SIN llamar a Channex — el worker
   * levanta notif de ajuste manual en el extranet.
   */
  async cancelBookingAtChannex(
    bookingId: string,
    reason?: string,
  ): Promise<{ ok: boolean; status: number; skipped?: 'airbnb' | 'unmapped' | 'forbidden' }> {
    this.requireEnabled('cancelBookingAtChannex')

    const booking = await this.getBooking(bookingId)

    // Airbnb no permite cancel programático — el operador ajusta en el extranet.
    if (/airbnb/i.test(booking.ota_name ?? '')) {
      this.logger.warn(
        `[Channex] cancelBookingAtChannex SKIP airbnb booking=${bookingId} — ajuste manual en extranet`,
      )
      return { ok: false, status: 0, skipped: 'airbnb' }
    }

    // Re-armar el objeto booking completo + status cancelled (Channex CRS update).
    // El PUT exige `room_type_id` + `rate_plan_id` (UUIDs), NO los `_code` del meta
    // (confirmado en e2e: 422 "room_type_id/rate_plan_id can't be blank").
    const rooms = (booking.rooms ?? []).map((r) => ({
      room_type_id: r.room_type_id,
      rate_plan_id: r.rate_plan_id,
      days: r.days ?? {},
      occupancy: r.occupancy ?? { adults: 1, children: 0, infants: 0 },
    }))

    // Una booking OTA cuyos rooms no tienen room_type_id/rate_plan_id de Channex
    // (canal sin mapear) NO se puede cancelar vía CRS PUT (Channex 422). En vez de
    // martillar hasta DEAD_LETTER, skip con razón clara → notif de ajuste manual.
    if (rooms.length === 0 || rooms.some((r) => !r.room_type_id || !r.rate_plan_id)) {
      this.logger.warn(
        `[Channex] cancelBookingAtChannex SKIP unmapped booking=${bookingId} ota=${booking.ota_name} — ` +
          `rooms sin room_type_id/rate_plan_id (canal sin mapear); ajuste manual en extranet`,
      )
      return { ok: false, status: 0, skipped: 'unmapped' }
    }
    const body = {
      booking: {
        status: 'cancelled',
        property_id: booking.property_id,
        ota_name: booking.ota_name,
        ota_reservation_code: booking.ota_reservation_code,
        currency: booking.currency,
        arrival_date: booking.arrival_date,
        departure_date: booking.departure_date,
        ...(booking.arrival_hour ? { arrival_hour: booking.arrival_hour } : {}),
        customer: booking.customer,
        ...(booking.payment_collect ? { payment_collect: booking.payment_collect } : {}),
        ...(booking.payment_type ? { payment_type: booking.payment_type } : {}),
        rooms,
        services: booking.services ?? [],
        meta: booking.meta ?? {},
        notes: `${booking.notes ? booking.notes + '\n' : ''}Cancelled by Zenix PMS${reason ? `: ${reason}` : ''}`,
      },
    }

    const res = await fetch(`${this.baseUrl}/bookings/${bookingId}`, {
      method: 'PUT',
      headers: { 'user-api-key': this.apiKey!, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.status === 200 || res.status === 204) {
      this.logger.log(`[Channex] cancelBookingAtChannex OK booking=${bookingId} ota=${booking.ota_name}`)
      return { ok: true, status: res.status }
    }
    // 403 = la cuenta Channex no tiene Booking CRS write habilitado (Beta) → el
    // PMS NO puede cancelar bookings programáticamente. NO es un fallo recuperable
    // (reintentar siempre dará 403) → skip gracioso + notif de ajuste manual, en
    // vez de DEAD_LETTER. Validado e2e 2026-06-03: api-key con ARI write + booking
    // read pero booking write 403.
    if (res.status === 403) {
      this.logger.warn(
        `[Channex] cancelBookingAtChannex 403 booking=${bookingId} — Booking CRS write no habilitado ` +
          `en la cuenta Channex; ajuste manual en el extranet`,
      )
      return { ok: false, status: 403, skipped: 'forbidden' }
    }
    await this.throwIfNotOk(res, `cancelBookingAtChannex ${bookingId}`)
    return { ok: false, status: res.status }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Channex CRUD extensions — Sprint NOVA-CHANNEX-COMMAND-CENTER Day 4
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Métodos de gestión del catálogo Channex (room types + rate plans + channels).
  // Llamados desde controllers del Command Center (Days 5-7), nunca directamente
  // desde frontend ni desde otros módulos PMS (Hexagonal — channex es la
  // integración, dominio no la conoce, ver §141 D-CHX-OUT-3 CLAUDE.md).
  //
  // Todos los métodos:
  //   · Requieren CHANNEX_API_KEY set (requireEnabled())
  //   · Usan header `user-api-key` Channex (NO HMAC, ver §131 D-CHX3)
  //   · Lanzan ChannexHttpError con status code en cualquier non-2xx
  //   · NO escriben a Zenix DB — eso es responsabilidad del controller (write-through)
  //   · NO emiten events — el controller maneja audit + outbound triggers
  //
  // Cert tests cubiertos por estos métodos:
  //   · Test 9-10 (ARI batching) — pushAvailability/pushRestrictions (ya existían)
  //   · Test 11 (booking revisions feed) — listBookingRevisionsFeed (ya existía)
  //   · Test 12 (rate limits) — TokenBucket maneja, no gateway concern
  //   · Test 13 (delta-only) — pattern del outbox, no gateway concern
  //
  // Cert tests pendientes (Day 4 NO los cubre):
  //   · Tests 2-8 (rates per channel) — pending sprint RATES-METRICS-COMPSET-CORE

  // ─── Room Types CRUD ──────────────────────────────────────────────────────

  async listRoomTypes(propertyId: string): Promise<ChannexRoomType[]> {
    this.requireEnabled('listRoomTypes')
    const url = `${this.baseUrl}/room_types?filter%5Bproperty_id%5D=${encodeURIComponent(propertyId)}`
    const res = await fetch(url, {
      headers: { 'user-api-key': this.apiKey! },
    })
    await this.throwIfNotOk(res, 'listRoomTypes')
    const json = (await res.json()) as { data: Array<{ id: string; attributes: ChannexRoomType }> }
    return json.data.map((d) => ({ ...d.attributes, id: d.id }))
  }

  async createRoomType(input: ChannexRoomTypeCreateInput): Promise<ChannexRoomType> {
    this.requireEnabled('createRoomType')
    const body = {
      room_type: {
        property_id: input.propertyId,
        title: input.title,
        count_of_rooms: input.countOfRooms,
        occ_adults: input.occAdults,
        occ_children: input.occChildren ?? 0,
        occ_infants: input.occInfants ?? 0,
        default_occupancy: input.defaultOccupancy ?? input.occAdults,
        room_kind: input.roomKind ?? 'room',
      },
    }
    const res = await fetch(`${this.baseUrl}/room_types`, {
      method: 'POST',
      headers: {
        'user-api-key': this.apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    await this.throwIfNotOk(res, 'createRoomType')
    const json = (await res.json()) as { data: { id: string; attributes: ChannexRoomType } }
    this.logger.log(`[Channex] createRoomType OK id=${json.data.id} title="${input.title}"`)
    return { ...json.data.attributes, id: json.data.id }
  }

  async updateRoomType(id: string, input: ChannexRoomTypeUpdateInput): Promise<ChannexRoomType> {
    this.requireEnabled('updateRoomType')
    const body: { room_type: Record<string, unknown> } = { room_type: {} }
    if (input.title !== undefined) body.room_type.title = input.title
    if (input.countOfRooms !== undefined) body.room_type.count_of_rooms = input.countOfRooms
    if (input.occAdults !== undefined) body.room_type.occ_adults = input.occAdults
    if (input.occChildren !== undefined) body.room_type.occ_children = input.occChildren
    if (input.occInfants !== undefined) body.room_type.occ_infants = input.occInfants
    if (input.defaultOccupancy !== undefined) body.room_type.default_occupancy = input.defaultOccupancy

    const res = await fetch(`${this.baseUrl}/room_types/${id}`, {
      method: 'PUT',
      headers: {
        'user-api-key': this.apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    await this.throwIfNotOk(res, 'updateRoomType')
    const json = (await res.json()) as { data: { id: string; attributes: ChannexRoomType } }
    this.logger.log(`[Channex] updateRoomType OK id=${id}`)
    return { ...json.data.attributes, id: json.data.id }
  }

  async deleteRoomType(id: string): Promise<void> {
    this.requireEnabled('deleteRoomType')
    const res = await fetch(`${this.baseUrl}/room_types/${id}`, {
      method: 'DELETE',
      headers: { 'user-api-key': this.apiKey! },
    })
    await this.throwIfNotOk(res, 'deleteRoomType ${id}')
    this.logger.log(`[Channex] deleteRoomType OK id=${id}`)
  }

  // ─── Rate Plans CRUD ──────────────────────────────────────────────────────

  async listRatePlans(propertyId: string): Promise<ChannexRatePlan[]> {
    this.requireEnabled('listRatePlans')
    const url = `${this.baseUrl}/rate_plans?filter%5Bproperty_id%5D=${encodeURIComponent(propertyId)}`
    const res = await fetch(url, {
      headers: { 'user-api-key': this.apiKey! },
    })
    await this.throwIfNotOk(res, 'listRatePlans')
    const json = (await res.json()) as { data: Array<{ id: string; attributes: ChannexRatePlan }> }
    return json.data.map((d) => ({ ...d.attributes, id: d.id }))
  }

  async createRatePlan(input: ChannexRatePlanCreateInput): Promise<ChannexRatePlan> {
    this.requireEnabled('createRatePlan')
    const body = {
      rate_plan: {
        property_id: input.propertyId,
        room_type_id: input.roomTypeId,
        title: input.title,
        currency: input.currency,
        sell_mode: input.sellMode ?? 'per_room',
        rate_mode: input.rateMode ?? 'manual',
        options: [
          {
            occupancy: input.occupancy ?? 2,
            is_primary: true,
            rate: input.rateCents, // Channex usa cents (e.g. 7000 = $70.00)
          },
        ],
      },
    }
    const res = await fetch(`${this.baseUrl}/rate_plans`, {
      method: 'POST',
      headers: {
        'user-api-key': this.apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    await this.throwIfNotOk(res, 'createRatePlan')
    const json = (await res.json()) as { data: { id: string; attributes: ChannexRatePlan } }
    this.logger.log(`[Channex] createRatePlan OK id=${json.data.id} title="${input.title}"`)
    return { ...json.data.attributes, id: json.data.id }
  }

  async updateRatePlan(id: string, input: ChannexRatePlanUpdateInput): Promise<ChannexRatePlan> {
    this.requireEnabled('updateRatePlan')
    const body: { rate_plan: Record<string, unknown> } = { rate_plan: {} }
    if (input.title !== undefined) body.rate_plan.title = input.title
    if (input.currency !== undefined) body.rate_plan.currency = input.currency
    if (input.sellMode !== undefined) body.rate_plan.sell_mode = input.sellMode
    if (input.rateMode !== undefined) body.rate_plan.rate_mode = input.rateMode

    const res = await fetch(`${this.baseUrl}/rate_plans/${id}`, {
      method: 'PUT',
      headers: {
        'user-api-key': this.apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    await this.throwIfNotOk(res, 'updateRatePlan')
    const json = (await res.json()) as { data: { id: string; attributes: ChannexRatePlan } }
    this.logger.log(`[Channex] updateRatePlan OK id=${id}`)
    return { ...json.data.attributes, id: json.data.id }
  }

  async deleteRatePlan(id: string): Promise<void> {
    this.requireEnabled('deleteRatePlan')
    const res = await fetch(`${this.baseUrl}/rate_plans/${id}`, {
      method: 'DELETE',
      headers: { 'user-api-key': this.apiKey! },
    })
    await this.throwIfNotOk(res, 'deleteRatePlan ${id}')
    this.logger.log(`[Channex] deleteRatePlan OK id=${id}`)
  }

  // ─── Restrictions read (Day 6 — Rate Calendar Matrix aggregator) ──────────
  //
  // GET /api/v1/restrictions?filter[property_id]=...&filter[rate_plan_id]=...
  //                          &filter[date_from]=YYYY-MM-DD&filter[date_to]=YYYY-MM-DD
  //
  // Channex devuelve rates + restrictions per [rate_plan, date]. Usado por
  // RateCalendarService para armar el grid `días × rate plans × rate fields`.
  //
  // Si rate plan + fecha NO tiene restrictions seteadas, Channex retorna
  // entry vacío para esa fecha O simplemente no lo incluye en la lista — el
  // aggregator hace fallback a `defaultRate` del mapping local en ese caso.
  //
  // Best-effort fail-soft: lecturas no deben romper el aggregator. Devuelve
  // `{ fromChannex: false, rows: [] }` si Channex está caído — el caller
  // arma la matriz solo con defaults locales.

  async listRestrictions(params: {
    propertyId: string
    ratePlanId?: string
    dateFrom: string // YYYY-MM-DD
    dateTo: string // YYYY-MM-DD
  }): Promise<{ fromChannex: boolean; rows: ChannexRestrictionRow[] }> {
    if (!this.enabled) return { fromChannex: false, rows: [] }
    const qs = new URLSearchParams()
    qs.set('filter[property_id]', params.propertyId)
    if (params.ratePlanId) qs.set('filter[rate_plan_id]', params.ratePlanId)
    qs.set('filter[date_from]', params.dateFrom)
    qs.set('filter[date_to]', params.dateTo)

    try {
      const res = await fetch(`${this.baseUrl}/restrictions?${qs.toString()}`, {
        headers: {
          'user-api-key': this.apiKey!,
          'Content-Type': 'application/json',
        },
      })
      if (!res.ok) {
        const text = await res.text()
        this.logger.warn(`[Channex] listRestrictions HTTP ${res.status}: ${text}`)
        return { fromChannex: false, rows: [] }
      }
      const json = (await res.json()) as {
        data?: Array<{ attributes: ChannexRestrictionRow }>
      }
      const rows = (json.data ?? []).map((d) => d.attributes)
      return { fromChannex: true, rows }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.warn(`[Channex] listRestrictions failed: ${msg} — using local defaults`)
      return { fromChannex: false, rows: [] }
    }
  }

  // ─── Channels (read-only via list; pause/unpause emulado via restrictions) ──

  async listChannels(propertyId: string): Promise<ChannexChannel[]> {
    this.requireEnabled('listChannels')
    const url = `${this.baseUrl}/channels?filter%5Bproperty_id%5D=${encodeURIComponent(propertyId)}`
    const res = await fetch(url, {
      headers: { 'user-api-key': this.apiKey! },
    })
    await this.throwIfNotOk(res, 'listChannels')
    const json = (await res.json()) as { data: Array<{ id: string; attributes: ChannexChannel }> }
    return json.data.map((d) => ({ ...d.attributes, id: d.id }))
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Sprint CHANNEX-AUTO-PROVISION Day 1 — Property + Group + Channel CRUD
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Endpoints alineados con docs.channex.io/api-v.1-documentation/api-reference.
  // Auth via header `user-api-key` (existente). Body wrapped en `{ resource: {...} }`
  // y response unwrapped from `{ data: { id, attributes } }` — patrón JSON:API.
  //
  // Estos métodos los consume `ChannexProvisionService.provisionFromWizard()`
  // outside-tx después del wizard activate. Multi-tenant Fase 1 = Modelo D
  // adaptado: 1 API key master + Group per Organization para sub-tenancy lógica.

  // ─── Properties CRUD ──────────────────────────────────────────────────────

  /**
   * POST /api/v1/properties — crea una nueva property en Channex.
   *
   * `group_id` (opcional) asigna la property al Group de la Organization
   * en el momento de la creación (multi-tenant Fase 1, evita un PUT extra).
   */
  async createProperty(input: ChannexPropertyCreateInput): Promise<ChannexProperty> {
    this.requireEnabled('createProperty')
    const body: { property: Record<string, unknown> } = {
      property: {
        title: input.title,
        currency: input.currency,
        timezone: input.timezone,
        country: input.country,
        ...(input.email ? { email: input.email } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.city ? { city: input.city } : {}),
        ...(input.state ? { state: input.state } : {}),
        ...(input.address ? { address: input.address } : {}),
        ...(input.zipCode ? { zip_code: input.zipCode } : {}),
        ...(input.propertyType ? { property_type: input.propertyType } : {}),
        ...(input.groupId ? { group_id: input.groupId } : {}),
      },
    }
    const res = await fetch(`${this.baseUrl}/properties`, {
      method: 'POST',
      headers: {
        'user-api-key': this.apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    await this.throwIfNotOk(res, 'createProperty')
    const json = (await res.json()) as { data: { id: string; attributes: ChannexProperty } }
    this.logger.log(`[Channex] createProperty OK id=${json.data.id} title="${input.title}"`)
    return { ...json.data.attributes, id: json.data.id }
  }

  /**
   * PUT /api/v1/properties/:id — update parcial (solo los campos enviados).
   */
  async updateProperty(id: string, input: ChannexPropertyUpdateInput): Promise<ChannexProperty> {
    this.requireEnabled('updateProperty')
    const body: { property: Record<string, unknown> } = { property: {} }
    if (input.title !== undefined) body.property.title = input.title
    if (input.email !== undefined) body.property.email = input.email
    if (input.phone !== undefined) body.property.phone = input.phone
    if (input.city !== undefined) body.property.city = input.city
    if (input.address !== undefined) body.property.address = input.address
    if (input.groupId !== undefined) body.property.group_id = input.groupId

    const res = await fetch(`${this.baseUrl}/properties/${id}`, {
      method: 'PUT',
      headers: {
        'user-api-key': this.apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    await this.throwIfNotOk(res, 'updateProperty')
    const json = (await res.json()) as { data: { id: string; attributes: ChannexProperty } }
    this.logger.log(`[Channex] updateProperty OK id=${id}`)
    return { ...json.data.attributes, id: json.data.id }
  }

  /**
   * GET /api/v1/properties/:id — fetch property by ID.
   * Usado por health check + ChannexProvisionService idempotency.
   */
  async getProperty(id: string): Promise<ChannexProperty> {
    this.requireEnabled('getProperty')
    const res = await fetch(`${this.baseUrl}/properties/${id}`, {
      headers: { 'user-api-key': this.apiKey! },
    })
    await this.throwIfNotOk(res, 'getProperty')
    const json = (await res.json()) as { data: { id: string; attributes: ChannexProperty } }
    return { ...json.data.attributes, id: json.data.id }
  }

  // ─── Groups (multi-tenant Fase 1) ─────────────────────────────────────────

  /**
   * POST /api/v1/groups — crea un Group para sub-tenancy lógica.
   *
   * Sprint CHANNEX-AUTO-PROVISION D-CHX-AP-3: cada Organization Zenix tiene
   * su propio Group. Cuando hagamos `gateway.createProperty({ groupId })`
   * la property queda automáticamente bajo el Group del cliente — aislamiento
   * lógico sin necesidad de Channex Partner Program (Fase 2).
   */
  async createGroup(input: { title: string }): Promise<ChannexGroup> {
    this.requireEnabled('createGroup')
    const body = { group: { title: input.title } }
    const res = await fetch(`${this.baseUrl}/groups`, {
      method: 'POST',
      headers: {
        'user-api-key': this.apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    await this.throwIfNotOk(res, 'createGroup')
    const json = (await res.json()) as { data: { id: string; attributes: ChannexGroup } }
    this.logger.log(`[Channex] createGroup OK id=${json.data.id} title="${input.title}"`)
    return { ...json.data.attributes, id: json.data.id }
  }

  /**
   * PUT /api/v1/properties/:id — asigna una property existente a un Group.
   *
   * Útil cuando la property ya existía antes de Zenix (cliente con presencia
   * OTA previa) y necesitamos moverla al Group de su Organization. Wraps
   * updateProperty para semántica clara en el código del ProvisionService.
   */
  async assignPropertyToGroup(propertyId: string, groupId: string): Promise<void> {
    await this.updateProperty(propertyId, { groupId })
    this.logger.log(`[Channex] assignPropertyToGroup OK property=${propertyId} group=${groupId}`)
  }

  // ─── Channels CRUD (OTA connections) ──────────────────────────────────────

  /**
   * POST /api/v1/channels — crea una conexión a un OTA channel.
   *
   * `type` debe ser uno de los channel codes oficiales Channex:
   *   BookingCom | ExpediaCom | AirbnbCom | AgodaCom | GoogleHotelAds |
   *   VRBOCom | OpenChannel
   *
   * `settings` es un objeto channel-specific (hotel_id + credentials para
   * Booking/Expedia/Agoda; listing_id para Airbnb; partner_id +
   * booking_link_template para Google Hotel Ads). Encriptadas at-rest en
   * Channel.settingsEncrypted (AES-256-GCM) del lado Zenix antes de pasar
   * al gateway — el gateway recibe el objeto plain text y lo envía a Channex
   * que lo guarda en su propio vault.
   *
   * Default: `is_active: false` — el canal queda creado pero no published.
   * El consultor activa published manualmente desde /settings/channex tras
   * confirmar OTA-side onboarding (content moderation Booking, etc.).
   */
  async createChannel(input: ChannexChannelCreateInput): Promise<ChannexChannel> {
    this.requireEnabled('createChannel')
    const body: { channel: Record<string, unknown> } = {
      channel: {
        type: input.type,
        property_id: input.propertyId,
        title: input.title,
        is_active: input.isActive ?? false,
        ...(input.settings ? { settings: input.settings } : {}),
      },
    }
    const res = await fetch(`${this.baseUrl}/channels`, {
      method: 'POST',
      headers: {
        'user-api-key': this.apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    await this.throwIfNotOk(res, 'createChannel')
    const json = (await res.json()) as { data: { id: string; attributes: ChannexChannel } }
    this.logger.log(
      `[Channex] createChannel OK id=${json.data.id} type=${input.type} title="${input.title}"`,
    )
    return { ...json.data.attributes, id: json.data.id }
  }

  /**
   * PUT /api/v1/channels/:id — update parcial.
   */
  async updateChannel(id: string, input: ChannexChannelUpdateInput): Promise<ChannexChannel> {
    this.requireEnabled('updateChannel')
    const body: { channel: Record<string, unknown> } = { channel: {} }
    if (input.title !== undefined) body.channel.title = input.title
    if (input.isActive !== undefined) body.channel.is_active = input.isActive
    if (input.settings !== undefined) body.channel.settings = input.settings

    const res = await fetch(`${this.baseUrl}/channels/${id}`, {
      method: 'PUT',
      headers: {
        'user-api-key': this.apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    await this.throwIfNotOk(res, 'updateChannel')
    const json = (await res.json()) as { data: { id: string; attributes: ChannexChannel } }
    this.logger.log(`[Channex] updateChannel OK id=${id}`)
    return { ...json.data.attributes, id: json.data.id }
  }

  /**
   * DELETE /api/v1/channels/:id — destructivo. Usar con cuidado.
   * Si el channel tiene mappings activos, Channex puede rechazar (422).
   */
  async deleteChannel(id: string): Promise<void> {
    this.requireEnabled('deleteChannel')
    const res = await fetch(`${this.baseUrl}/channels/${id}`, {
      method: 'DELETE',
      headers: { 'user-api-key': this.apiKey! },
    })
    await this.throwIfNotOk(res, 'deleteChannel ${id}')
    this.logger.log(`[Channex] deleteChannel OK id=${id}`)
  }

  // ─── Channel mappings (room_type ↔ channel external_id) ───────────────────

  /**
   * POST /api/v1/channel_room_types — mapping Zenix RoomType ↔ external ID
   * que la OTA usa (Booking room_id, Expedia EQC room_id, Airbnb room_id).
   *
   * Idempotent UPSERT: si ya existe mapping para (channel_id, room_type_id),
   * Channex update en vez de duplicar (verificar contra cert API spec).
   */
  async upsertChannelRoomType(mapping: ChannexChannelRoomTypeMapping): Promise<void> {
    this.requireEnabled('upsertChannelRoomType')
    const body = {
      channel_room_type: {
        channel_id: mapping.channelId,
        room_type_id: mapping.roomTypeId,
        external_room_type_id: mapping.externalRoomTypeId,
        ...(mapping.externalRoomTypeName ? { external_room_type_name: mapping.externalRoomTypeName } : {}),
      },
    }
    const res = await fetch(`${this.baseUrl}/channel_room_types`, {
      method: 'POST',
      headers: {
        'user-api-key': this.apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    await this.throwIfNotOk(res, 'upsertChannelRoomType')
    this.logger.log(
      `[Channex] upsertChannelRoomType OK channel=${mapping.channelId} roomType=${mapping.roomTypeId} → external=${mapping.externalRoomTypeId}`,
    )
  }

  /**
   * POST /api/v1/channel_rate_plans — mapping Zenix RatePlan ↔ external ID
   * que la OTA usa (Booking rate_id, Expedia rate_id, etc.).
   */
  async upsertChannelRatePlan(mapping: ChannexChannelRatePlanMapping): Promise<void> {
    this.requireEnabled('upsertChannelRatePlan')
    const body = {
      channel_rate_plan: {
        channel_id: mapping.channelId,
        rate_plan_id: mapping.ratePlanId,
        external_rate_plan_id: mapping.externalRatePlanId,
        ...(mapping.externalRatePlanName ? { external_rate_plan_name: mapping.externalRatePlanName } : {}),
      },
    }
    const res = await fetch(`${this.baseUrl}/channel_rate_plans`, {
      method: 'POST',
      headers: {
        'user-api-key': this.apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    await this.throwIfNotOk(res, 'upsertChannelRatePlan')
    this.logger.log(
      `[Channex] upsertChannelRatePlan OK channel=${mapping.channelId} ratePlan=${mapping.ratePlanId} → external=${mapping.externalRatePlanId}`,
    )
  }

  private requireEnabled(op: string): void {
    if (!this.enabled) {
      throw new ChannexHttpError(`[Channex] ${op} called but CHANNEX_API_KEY not set`, 503)
    }
  }

  /**
   * Sprint CHANNEX-CERT-B1 (2026-05-29) — helper centralizado para verificar
   * respuestas Channex. Reemplaza el patrón duplicado en cada método:
   *
   *   if (!res.ok) {
   *     const text = await res.text()
   *     throw new ChannexHttpError(`opLabel HTTP ${res.status}: ${text}`, res.status)
   *   }
   *
   * Beneficio principal: parsea `Retry-After` header cuando 429 y lanza
   * `ChannexRateLimitError` con el valor real (no estimado). El worker
   * consume `error.retryAfterSeconds` para respetar el backoff exacto que
   * Channex pide. Esto es cert-mandatory per Stage 4 anti-pattern AP-2.3.
   *
   * El método NO consume el body en caso 2xx — el caller sigue haciendo
   * `await res.json()` después. Solo se consume cuando hay error
   * (para incluir el contexto en el mensaje).
   */
  private async throwIfNotOk(res: Response, opLabel: string): Promise<void> {
    if (res.ok) return
    let text = ''
    try {
      text = await res.text()
    } catch {
      // Body unreadable — no añadimos detalle pero no fallamos el throw
    }
    if (res.status === 429) {
      const retryAfterHeader = res.headers.get('retry-after') ?? res.headers.get('Retry-After')
      const retryAfterSeconds = parseRetryAfter(retryAfterHeader)
      this.logger.warn(
        `[Channex] ${opLabel} 429 rate-limited (retry-after=${retryAfterSeconds ?? 'none'}s): ${text.slice(0, 200)}`,
      )
      throw new ChannexRateLimitError(
        `${opLabel} HTTP 429 rate-limited (retry-after=${retryAfterSeconds ?? 'none'}s): ${text}`,
        retryAfterSeconds,
      )
    }
    throw new ChannexHttpError(`${opLabel} HTTP ${res.status}: ${text}`, res.status)
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

/**
 * GET /bookings/:id room shape — incluye `meta.room_type_code/rate_plan_code`
 * (los códigos que el PUT de cancelación CRS exige, distintos de los UUID
 * internos room_type_id/rate_plan_id).
 */
export interface ChannexBookingAttributesRoom {
  meta?: { room_type_code?: string | number; rate_plan_code?: string | number }
  room_type_id?: string
  rate_plan_id?: string
  occupancy?: { adults: number; children: number; infants: number }
  days?: Record<string, string>
}

/** GET /bookings/:id attributes — superset usado para reconstruir el PUT de cancel. */
export interface ChannexBookingAttributes {
  id: string
  property_id: string
  booking_id?: string
  status: ChannexBookingStatus
  ota_name?: string
  ota_reservation_code?: string
  currency?: string
  arrival_date: string
  departure_date: string
  arrival_hour?: string | null
  customer?: ChannexBookingRevisionCustomer
  payment_collect?: string | null
  payment_type?: string | null
  notes?: string | null
  rooms?: ChannexBookingAttributesRoom[]
  services?: unknown[]
  meta?: Record<string, unknown>
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
  constructor(
    message: string,
    public readonly status: number,
    /**
     * Parsed `Retry-After` header value in seconds. Only populated for 429 responses.
     * - Numeric `Retry-After: 120` → 120
     * - HTTP-date `Retry-After: Wed, 21 Oct 2026 07:28:00 GMT` → seconds until that date
     * - Missing/malformed → null
     *
     * Sprint CHANNEX-CERT-B1 (2026-05-29). Cert Stage 4 requirement: worker
     * MUST respect the value Channex provides. Anti-pattern AP-2.3 mitigation.
     */
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message)
    this.name = 'ChannexHttpError'
  }
}

/**
 * Specialized 429 error — semantic clarity for worker dispatch.
 * Used by `ChannexOutboundWorker` to differentiate rate limit (respect
 * server-provided backoff) from other 4xx/5xx (own backoff policy).
 */
export class ChannexRateLimitError extends ChannexHttpError {
  constructor(message: string, retryAfterSeconds: number | null) {
    super(message, 429, retryAfterSeconds)
    this.name = 'ChannexRateLimitError'
  }
}

/**
 * Parse the `Retry-After` HTTP header per RFC 7231 §7.1.3.
 *
 * Two valid formats:
 *  · Delta-seconds:  `Retry-After: 120`
 *  · HTTP-date:      `Retry-After: Wed, 21 Oct 2026 07:28:00 GMT`
 *
 * Returns:
 *  · positive integer seconds when parseable and in the future
 *  · `null` when missing, malformed, or in the past (server bug)
 *
 * Exported for unit tests (Sprint CHANNEX-CERT-B1).
 */
export function parseRetryAfter(headerValue: string | null | undefined): number | null {
  if (!headerValue) return null
  const trimmed = headerValue.trim()
  if (!trimmed) return null

  // Try delta-seconds first (most common form per Channex docs)
  const asNumber = Number(trimmed)
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.ceil(asNumber)
  }

  // Try HTTP-date
  const asDate = Date.parse(trimmed)
  if (!Number.isNaN(asDate)) {
    const diffMs = asDate - Date.now()
    if (diffMs > 0) return Math.ceil(diffMs / 1000)
    // Past date is malformed/buggy — fall through to null
  }

  return null
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

// ── CRUD types — Sprint NOVA-CHANNEX-COMMAND-CENTER Day 4 ──────────────────

export interface ChannexRoomType {
  id?: string
  title: string
  count_of_rooms: number
  occ_adults: number
  occ_children: number
  occ_infants: number
  default_occupancy: number
  room_kind?: string
}

export interface ChannexRoomTypeCreateInput {
  propertyId: string
  title: string
  countOfRooms: number
  occAdults: number
  occChildren?: number
  occInfants?: number
  defaultOccupancy?: number
  roomKind?: 'room' | 'dorm'
}

export interface ChannexRoomTypeUpdateInput {
  title?: string
  countOfRooms?: number
  occAdults?: number
  occChildren?: number
  occInfants?: number
  defaultOccupancy?: number
}

export interface ChannexRatePlan {
  id?: string
  title: string
  currency: string
  sell_mode: string
  rate_mode: string
  options: Array<{ occupancy: number; is_primary: boolean; rate: string }>
}

export interface ChannexRatePlanCreateInput {
  propertyId: string
  roomTypeId: string
  title: string
  currency: string
  // rate in cents (Channex API expects integer cents, e.g. 7000 = $70.00)
  rateCents: number
  occupancy?: number
  sellMode?: 'per_room' | 'per_person'
  rateMode?: 'manual' | 'derived'
}

export interface ChannexRatePlanUpdateInput {
  title?: string
  currency?: string
  sellMode?: 'per_room' | 'per_person'
  rateMode?: 'manual' | 'derived'
}

export interface ChannexChannel {
  id?: string
  title: string
  channel: string         // 'booking_com' | 'expedia' | 'airbnb' | ...
  is_active: boolean
}

// ─── Sprint CHANNEX-AUTO-PROVISION Day 1 — types ─────────────────────────

export interface ChannexProperty {
  id?: string
  title: string
  currency: string         // ISO 4217 (e.g. 'MXN' | 'USD')
  timezone: string         // IANA (e.g. 'America/Cancun')
  country: string          // ISO 3166-1 alpha-2 (e.g. 'MX')
  email?: string
  phone?: string
  city?: string
  state?: string
  address?: string
  zip_code?: string
  property_type?: string   // 'hotel' | 'hostel' | 'apartment' | ...
  group_id?: string | null
  is_active?: boolean
}

export interface ChannexPropertyCreateInput {
  title: string
  currency: string
  timezone: string
  country: string
  email?: string
  phone?: string
  city?: string
  state?: string
  address?: string
  zipCode?: string
  propertyType?: string
  /** Multi-tenant Fase 1 — asigna al Group de la Organization al crear */
  groupId?: string
}

export interface ChannexPropertyUpdateInput {
  title?: string
  email?: string
  phone?: string
  city?: string
  address?: string
  groupId?: string
}

export interface ChannexGroup {
  id?: string
  title: string
}

/** Channex channel type codes — alineados con docs.channex.io changelog */
export type ChannexChannelType =
  | 'BookingCom'
  | 'ExpediaCom'
  | 'AirbnbCom'
  | 'AgodaCom'
  | 'GoogleHotelAds'
  | 'VRBOCom'
  | 'OpenChannel'

export interface ChannexChannelCreateInput {
  type: ChannexChannelType
  propertyId: string
  title: string
  /** Plain object con credentials channel-specific. Cifradas at-rest en
   *  Zenix (Channel.settingsEncrypted AES-256-GCM); plain text al pasar
   *  al gateway que las envía a Channex vault. */
  settings?: Record<string, unknown>
  /** Default false — el canal queda creado pero NO published. Activación
   *  manual post-onboarding OTA-side (content moderation Booking, etc.). */
  isActive?: boolean
}

export interface ChannexChannelUpdateInput {
  title?: string
  settings?: Record<string, unknown>
  isActive?: boolean
}

export interface ChannexChannelRoomTypeMapping {
  channelId: string
  roomTypeId: string
  externalRoomTypeId: string
  externalRoomTypeName?: string
}

export interface ChannexChannelRatePlanMapping {
  channelId: string
  ratePlanId: string
  externalRatePlanId: string
  externalRatePlanName?: string
}

// ─── Restriction read row (Day 6 — Rate Calendar Matrix) ───────────────────
// Forma de cada entry retornada por GET /restrictions. Channex pone TODOS los
// campos opcionales — solo aparecen los que el operador realmente seteó.
export interface ChannexRestrictionRow {
  property_id: string
  rate_plan_id: string
  date: string                       // YYYY-MM-DD
  rate?: string | number             // string en JSON Channex (e.g. "70.00")
  min_stay_arrival?: number
  min_stay_through?: number
  max_stay?: number
  closed_to_arrival?: boolean
  closed_to_departure?: boolean
  stop_sell?: boolean
}
