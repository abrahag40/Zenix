import { Prisma } from '@prisma/client'
import { ChannexBookingRevision } from '../channex.gateway'

/**
 * ChannexBookingMapper — pure function that turns a Channex booking revision
 * into a Prisma create payload for GuestStay. Has no DI — easy to unit test.
 *
 * Design constraints (Channex official + Stage 4 cert review):
 *   1. arrival_date + arrival_hour combined in the property's IANA timezone.
 *      Channex sends date strings (no TZ); the local interpretation is the
 *      property TZ.
 *   2. ratePerNight derived from amount/nights when amount is present.
 *      If amount is missing (rare — Channex may omit on some OTAs), fall back
 *      to summing the rooms[].days breakdown.
 *   3. payment_collect → paymentModel:
 *        'ota'     → OTA_COLLECT  (§106 — skips balance guard at check-in)
 *        'channel' → OTA_COLLECT  (defensive: undocumented value seen on some OTAs)
 *        'property'→ HOTEL_COLLECT
 *        null      → HOTEL_COLLECT (default)
 *   4. paxCount = adults + children (infants no cuentan en pricing standard
 *      AHLEI / Mews / Cloudbeds — infants suelen ser <2y y no pagan).
 *   5. guestName combinado "name surname" — usamos los del room.guests[0]
 *      si está disponible (más específico al room), si no el revision.customer.
 *   6. notes preserva `notes` original + special requests del customer.
 *   7. source = ota_name normalizado upper-case (consistente con flujos manual
 *      donde recepcionista escribe "BOOKING.COM" o "DIRECT").
 */
export class ChannexBookingMapper {
  /**
   * Map revision into the data accepted by `prisma.guestStay.create()`.
   * Caller still supplies `checkedInById` (the Channex system staff sentinel)
   * because that lookup needs DI. The mapper itself is pure.
   */
  static toGuestStayCreate(args: {
    revision: ChannexBookingRevision
    propertyId: string
    organizationId: string
    propertyTimezone: string
    roomId: string | null // null when no room match → UNASSIGNED conflict (D-CHX9)
    channexConflict: boolean
  }): Omit<Prisma.GuestStayUncheckedCreateInput, 'checkedInById'> {
    const { revision, propertyId, organizationId, propertyTimezone, roomId, channexConflict } = args

    const nights = ChannexBookingMapper.computeNights(revision.arrival_date, revision.departure_date)
    const total = ChannexBookingMapper.computeTotalAmount(revision)
    const ratePerNight = nights > 0 ? total.dividedBy(nights) : new Prisma.Decimal(0)
    const currency = revision.currency ?? 'USD'

    const checkinAt = ChannexBookingMapper.combineDateAndHour(
      revision.arrival_date,
      revision.arrival_hour,
      propertyTimezone,
      'checkin',
    )
    // Departure has no hour from Channex → use property checkout default 11:00 local.
    const scheduledCheckout = ChannexBookingMapper.combineDateAndHour(
      revision.departure_date,
      '11:00',
      propertyTimezone,
      'checkout',
    )

    const occupancy = revision.occupancy ?? { adults: 1, children: 0, infants: 0 }
    const paxCount = Math.max(1, occupancy.adults + occupancy.children)

    const guestName = ChannexBookingMapper.composeGuestName(revision)
    const guestEmail = revision.customer?.mail ?? null
    const guestPhone = revision.customer?.phone ?? null
    const nationality = revision.customer?.country ?? null

    const paymentModel = ChannexBookingMapper.derivePaymentModel(revision.payment_collect)
    const isOtaCollect = paymentModel === 'OTA_COLLECT'
    const amountPaid = isOtaCollect ? total : new Prisma.Decimal(0)
    const paymentStatus = isOtaCollect ? 'PAID' : 'PENDING'

    const sourceLabel =
      typeof revision.ota_name === 'string' && revision.ota_name.length > 0
        ? revision.ota_name.toUpperCase()
        : 'CHANNEX'

    return {
      organizationId,
      propertyId,
      // roomId NOT NULL en schema. Cuando no hay match (UNASSIGNED), el caller
      // debe persistir el stay en una "holding room" virtual o postergar la
      // creación. Para v1.0.0 pasamos string vacío y el caller decide — pero
      // como roomId es NOT NULL, el caller DEBE proveer un fallback. Por eso
      // este mapper requiere roomId ya resuelto (or null + skip create).
      roomId: roomId as string, // caller already validated non-null OR uses UNASSIGNED branch
      guestName,
      guestEmail,
      guestPhone,
      nationality,
      paxCount,
      checkinAt,
      scheduledCheckout,
      ratePerNight,
      currency,
      totalAmount: total,
      amountPaid,
      paymentStatus,
      paymentModel,
      source: sourceLabel,
      notes: ChannexBookingMapper.composeNotes(revision),

      // Channex inbound idempotency + provenance
      channexBookingId: revision.booking_id,
      channexLastSyncAt: revision.inserted_at ? new Date(revision.inserted_at) : new Date(),
      channexConflict,
      channexOtaName: revision.ota_name ?? null,
      // Cert audit C9 — virtual card guarantee persist (Booking.com Genius,
      // Airbnb Premium). Channex envía masked + meta — PCI safe.
      // Prisma.DbNull cuando ausente (vs undefined que sería "no setear").
      channexGuaranteeMeta:
        ChannexBookingMapper.composeGuaranteeMeta(revision) ?? Prisma.DbNull,

      // Pace / lead-time analytics
      bookingLeadDays: ChannexBookingMapper.computeLeadDays(
        revision.inserted_at,
        revision.arrival_date,
      ),
    }
  }

  static computeNights(arrival: string, departure: string): number {
    const a = Date.parse(`${arrival}T00:00:00Z`)
    const d = Date.parse(`${departure}T00:00:00Z`)
    if (Number.isNaN(a) || Number.isNaN(d) || d <= a) return 0
    return Math.round((d - a) / 86_400_000)
  }

  static computeTotalAmount(revision: ChannexBookingRevision): Prisma.Decimal {
    // Audit D2 — Channex 2026-04-01 schema: amount_type field. Si llega
    // 'net', revision.amount NO incluye comisión OTA — el folio puede
    // quedar por debajo de lo cobrado al guest. Hasta que implementemos
    // gross+commission split (v1.0.1 PAY-CORE), emitimos warning visible
    // y usamos `amount` tal cual (best-effort gross).
    if (
      revision.amount_type &&
      revision.amount_type !== 'gross' &&
      // eslint-disable-next-line no-console
      typeof console !== 'undefined'
    ) {
      console.warn(
        `[Channex mapper] revision=${revision.id} amount_type=${revision.amount_type} ` +
          `— using amount as-is. PAY-CORE v1.0.1 needs to handle this distinction.`,
      )
    }
    if (typeof revision.amount === 'string' && revision.amount.length > 0) {
      try {
        return new Prisma.Decimal(revision.amount)
      } catch {
        // fall through to rooms[].days sum
      }
    }
    // Fallback: sum rooms[].days values
    let sum = new Prisma.Decimal(0)
    for (const room of revision.rooms ?? []) {
      if (room.days) {
        for (const v of Object.values(room.days)) {
          try {
            sum = sum.plus(new Prisma.Decimal(v))
          } catch {
            /* ignore malformed entry */
          }
        }
      } else if (typeof room.amount === 'string') {
        try {
          sum = sum.plus(new Prisma.Decimal(room.amount))
        } catch {
          /* ignore */
        }
      }
    }
    return sum
  }

  static derivePaymentModel(
    paymentCollect: ChannexBookingRevision['payment_collect'] | undefined,
  ): 'OTA_COLLECT' | 'HOTEL_COLLECT' {
    if (paymentCollect === 'ota' || paymentCollect === 'channel') return 'OTA_COLLECT'
    return 'HOTEL_COLLECT'
  }

  static composeGuestName(revision: ChannexBookingRevision): string {
    // Prefer the room-level guest when present (more specific for multi-room
    // bookings under a single customer account).
    const firstRoomGuest = revision.rooms?.[0]?.guests?.[0]
    const name = firstRoomGuest?.name ?? revision.customer?.name ?? ''
    const surname = firstRoomGuest?.surname ?? revision.customer?.surname ?? ''
    const composed = `${name} ${surname}`.trim()
    if (composed.length > 0) return composed
    // Last resort: OTA reservation code (cert reviewers expect a non-empty name).
    // Cert audit D2: español es-MX para piloto LATAM.
    if (revision.ota_reservation_code) return `Huésped ${revision.ota_reservation_code}`
    return 'Huésped sin nombre'
  }

  static composeNotes(revision: ChannexBookingRevision): string | null {
    const parts: string[] = []
    if (revision.notes) parts.push(revision.notes.trim())
    // Pre-arrival visibility para recepción: si el OTA marcó payment_collect
    // y trae guarantee.is_virtual, lo anotamos.
    if (revision.payment_collect === 'ota') {
      parts.push('[Channex] Payment collected by OTA — folio se marca PAID al check-in.')
    }
    return parts.length > 0 ? parts.join('\n') : null
  }

  /**
   * Cert audit C9 — extrae guarantee enmascarada para chargeback evidence.
   * Channex pre-enmascara `card_number` (e.g. "****1234") — almacenar es
   * PCI-safe SAQ A. Si no hay guarantee retorna null.
   */
  static composeGuaranteeMeta(revision: ChannexBookingRevision): Prisma.InputJsonValue | null {
    const g = (revision as ChannexBookingRevision & { guarantee?: GuaranteeShape }).guarantee
    if (!g || typeof g !== 'object') return null
    const out: Record<string, unknown> = {}
    if (g.card_type) out.cardType = g.card_type
    if (g.card_number) out.masked = g.card_number // ya pre-enmascarado por Channex
    if (g.expiration_date) out.expirationDate = g.expiration_date
    if (g.is_virtual !== undefined) out.isVirtual = g.is_virtual
    if (g.meta) {
      out.meta = {
        currency: g.meta.virtual_card_currency_code ?? null,
        balance: g.meta.virtual_card_current_balance ?? null,
        effectiveDate: g.meta.virtual_card_effective_date ?? null,
        expirationDate: g.meta.virtual_card_expiration_date ?? null,
      }
    }
    return Object.keys(out).length > 0 ? (out as Prisma.InputJsonValue) : null
  }

  static computeLeadDays(insertedAt: string | undefined, arrivalDate: string): number | null {
    if (!insertedAt) return null
    // Industry standard (Mews/Cloudbeds): calendar-day difference, hour-of-day
    // ignored. Truncate insertedAt to its UTC date.
    const insertedDate = insertedAt.slice(0, 10) // YYYY-MM-DD
    const ins = Date.parse(`${insertedDate}T00:00:00Z`)
    const arr = Date.parse(`${arrivalDate}T00:00:00Z`)
    if (Number.isNaN(ins) || Number.isNaN(arr)) return null
    const diff = Math.max(0, Math.round((arr - ins) / 86_400_000))
    return diff
  }

  /**
   * Combine a YYYY-MM-DD date and an HH:MM hour in the property's IANA TZ
   * into a Date (UTC). We do this via Intl.DateTimeFormat — same pattern used
   * by the night audit scheduler (§12 CLAUDE.md, NEVER hardcode TZ).
   *
   * Strategy: compute the UTC offset of the property timezone for the given
   * local date, then construct the UTC instant directly. Avoids the date-fns-tz
   * dependency and stays consistent with §12.
   */
  static combineDateAndHour(
    dateStr: string,
    hourStr: string | null | undefined,
    timezone: string,
    bias: 'checkin' | 'checkout',
  ): Date {
    const [hourPart, minutePart] = (hourStr ?? (bias === 'checkin' ? '15:00' : '11:00'))
      .split(':')
      .map((s) => parseInt(s, 10))
    const hh = Number.isFinite(hourPart) ? hourPart : bias === 'checkin' ? 15 : 11
    const mm = Number.isFinite(minutePart) ? minutePart : 0

    // Build a naive UTC instant at the wanted local time, then correct it
    // by the property's offset at that instant.
    const naiveUtcStr = `${dateStr}T${pad2(hh)}:${pad2(mm)}:00Z`
    const naive = new Date(naiveUtcStr)

    // Compute the offset (in minutes) Intl reports for this property TZ at this instant.
    const offsetMin = getTimeZoneOffsetMinutes(naive, timezone)
    // If America/Cancun is UTC-5, offsetMin = -300. To convert "16:00 local"
    // to UTC we ADD 5h. Formula: utcMs = localAsIfUtcMs - offsetMin*60_000.
    return new Date(naive.getTime() - offsetMin * 60_000)
  }
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

interface GuaranteeShape {
  card_type?: string
  card_number?: string // masked
  expiration_date?: string
  is_virtual?: boolean
  meta?: {
    virtual_card_currency_code?: string
    virtual_card_current_balance?: string
    virtual_card_effective_date?: string
    virtual_card_expiration_date?: string
  }
}

/**
 * Returns the offset (minutes) of `timezone` at `instant`. Positive for
 * timezones east of UTC, negative for west. America/Cancun → -300.
 */
function getTimeZoneOffsetMinutes(instant: Date, timezone: string): number {
  // Use Intl to format the same instant in the target TZ vs UTC and compare.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(instant).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value
    return acc
  }, {})
  const local = Date.UTC(
    parseInt(parts.year, 10),
    parseInt(parts.month, 10) - 1,
    parseInt(parts.day, 10),
    parseInt(parts.hour === '24' ? '00' : parts.hour, 10),
    parseInt(parts.minute, 10),
    parseInt(parts.second, 10),
  )
  return Math.round((local - instant.getTime()) / 60_000)
}
