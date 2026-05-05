/**
 * Reservations — types for mobile RECEPTION/ADMIN module.
 *
 * Two-tier shape (Research #4 §5.1):
 *   - List item: minimum to render a card. Computed status, no PII for HK.
 *   - Detail: full payload with payments, history, contact links.
 *
 * Role redaction is enforced by the backend (DTO selection in
 * GuestStaysService). The mobile app trusts whatever the API returns —
 * there is no client-side filter. This prevents a UI bug from leaking PII.
 *
 * Sprint 9 wires the real endpoints. For Sprint 8I we use mock data.
 */

export type ReservationStatus =
  | 'UNCONFIRMED'   // arrival day, actualCheckin == null, before audit
  | 'IN_HOUSE'      // confirmed, currently staying
  | 'DEPARTING'     // checkOut scheduled today
  | 'UPCOMING'      // future arrival
  | 'NO_SHOW'       // marked no-show (visible in list with badge)
  | 'DEPARTED'      // checked out (history)
  | 'CANCELLED'

export type ReservationSource =
  | 'DIRECT'
  | 'BOOKING'
  | 'AIRBNB'
  | 'EXPEDIA'
  | 'HOSTELWORLD'
  | 'WALK_IN'
  | 'OTHER'

/** Minimal shape for list/grid rendering. */
export interface ReservationListItem {
  id: string
  /** Guest display name. For HOUSEKEEPER role, the API redacts to "Hab. 203". */
  guestName: string
  /** True if the API redacted the guest data for this user role. */
  isRedacted: boolean
  roomNumber: string | null
  /** Single-letter or short label for the unit when applicable (HOSTAL+SHARED). */
  unitLabel: string | null
  status: ReservationStatus
  source: ReservationSource | null
  paxCount: number
  /** ISO timestamp. */
  checkinAt: string
  /** ISO timestamp. */
  scheduledCheckout: string
  /** Today's flag for sorting/grouping. Server-computed for tz correctness. */
  arrivesToday: boolean
  departsToday: boolean
  isNoShow: boolean
  /** Pre-formatted date label ("Hoy 15:00 → Mañana 12:00") in property tz. */
  dateRangeLabel: string
}

/** Full payload for detail screen — RECEPTION/ADMIN only. */
export interface ReservationDetail extends ReservationListItem {
  guestEmail: string | null
  guestPhone: string | null
  nationality: string | null
  documentType: string | null
  /** Server-side enmascared as `***1234` per CLAUDE.md privacy rules. */
  documentNumberMasked: string | null
  ratePerNight: string         // serialized Decimal
  currency: string
  totalAmount: string
  amountPaid: string
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID' | 'REFUNDED'
  notes: string | null
  arrivalNotes: string | null
  keyType: 'PHYSICAL' | 'CARD' | 'CODE' | 'MOBILE' | null
  noShowAt: string | null
  noShowReason: string | null
  payments: ReservationPaymentLine[]
  history: ReservationHistoryEvent[]
}

export interface ReservationPaymentLine {
  id: string
  method: 'CASH' | 'CARD_TERMINAL' | 'BANK_TRANSFER' | 'OTA_PREPAID' | 'COMP'
  amount: string
  currency: string
  collectedAt: string
  collectedByName: string | null
  isVoid: boolean
  reference: string | null
}

export interface ReservationHistoryEvent {
  id: string
  /** Server-formatted relative timestamp ("hace 2h"). */
  whenLabel: string
  /** Server-formatted absolute timestamp ("26 abr 21:42"). */
  absoluteLabel: string
  /** Translation-ready description ("Marcado como no-show"). */
  description: string
  /** Optional actor name ("Carlos R.") or null for system events. */
  actorName: string | null
  /** Lucide-style icon hint for the row marker. */
  iconKey: 'arrival' | 'departure' | 'payment' | 'noshow' | 'system' | 'edit'
}
