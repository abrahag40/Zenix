/**
 * 🟡 QA-ONLY MOCK DATA — DELETE BEFORE PRODUCTION
 * ════════════════════════════════════════════════════════════════════
 *
 * Mock reservations for the Reservas tab on mobile. Activates when:
 *   1. EXPO_PUBLIC_USE_MOCKS=true
 *   2. AND the API endpoint is empty (Sprint 9 wiring) or unavailable.
 *
 * Coverage: every status the list renders + edge cases (no-show
 * with revert window, multi-pax dorm bed, OTA + direct mix).
 *
 * Remove via: delete this file + every `MOCK_RESERVATIONS` import.
 */

import type {
  ReservationListItem,
  ReservationDetail,
  ReservationPaymentLine,
  ReservationHistoryEvent,
} from '../types'

/**
 * Sprint 8I default: ON. The QA build always sees mock data so the
 * receptionist UX can be validated without backend coupling.
 * To turn OFF (e.g., to test the real `mobile/list` endpoint when
 * Sprint 9 wires it), set EXPO_PUBLIC_USE_MOCKS=false.
 */
export const MOCKS_RES_ENABLED = process.env.EXPO_PUBLIC_USE_MOCKS !== 'false'

const now = new Date()
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)
const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
const inThreeDays = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000)
const inFiveDays = new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000)
const minusHours = (d: Date, h: number) => new Date(d.getTime() - h * 3600 * 1000)
const plusHours = (d: Date, h: number) => new Date(d.getTime() + h * 3600 * 1000)

function iso(d: Date): string {
  return d.toISOString()
}

// ── List items ──────────────────────────────────────────────────────────
export const MOCK_RESERVATIONS_LIST: ReservationListItem[] = [
  {
    id: 'mock-res-1',
    guestName: 'María García',
    isRedacted: false,
    roomNumber: '203',
    unitLabel: null,
    status: 'UNCONFIRMED',
    source: 'BOOKING',
    paxCount: 2,
    checkinAt: iso(plusHours(today, 15)),
    scheduledCheckout: iso(plusHours(tomorrow, 12)),
    arrivesToday: true,
    departsToday: false,
    isNoShow: false,
    dateRangeLabel: 'Hoy 15:00 → Mañana 12:00',
  },
  {
    id: 'mock-res-2',
    guestName: 'Carlos Mendoza',
    isRedacted: false,
    roomNumber: '105',
    unitLabel: null,
    status: 'UNCONFIRMED',
    source: 'AIRBNB',
    paxCount: 1,
    checkinAt: iso(plusHours(today, 17)),
    scheduledCheckout: iso(plusHours(today, 24 * 3 + 12)),
    arrivesToday: true,
    departsToday: false,
    isNoShow: false,
    dateRangeLabel: 'Hoy 17:00 → 3 noches',
  },
  {
    id: 'mock-res-3',
    guestName: 'Sofía Ramírez',
    isRedacted: false,
    roomNumber: '312',
    unitLabel: 'Cama A',
    status: 'IN_HOUSE',
    source: 'HOSTELWORLD',
    paxCount: 1,
    checkinAt: iso(minusHours(today, 12)),
    scheduledCheckout: iso(plusHours(tomorrow, 12)),
    arrivesToday: false,
    departsToday: false,
    isNoShow: false,
    dateRangeLabel: 'Ayer → Mañana',
  },
  {
    id: 'mock-res-4',
    guestName: 'Sebastián Torres',
    isRedacted: false,
    roomNumber: '210',
    unitLabel: null,
    status: 'IN_HOUSE',
    source: 'DIRECT',
    paxCount: 2,
    checkinAt: iso(minusHours(today, 36)),
    scheduledCheckout: iso(plusHours(tomorrow, 12)),
    arrivesToday: false,
    departsToday: false,
    isNoShow: false,
    dateRangeLabel: 'Hace 2 días → Mañana',
  },
  {
    id: 'mock-res-5',
    guestName: 'Diego Hernández',
    isRedacted: false,
    roomNumber: '101',
    unitLabel: null,
    status: 'DEPARTING',
    source: 'BOOKING',
    paxCount: 2,
    checkinAt: iso(minusHours(today, 60)),
    scheduledCheckout: iso(plusHours(today, 12)),
    arrivesToday: false,
    departsToday: true,
    isNoShow: false,
    dateRangeLabel: 'Hace 3 días → Hoy 12:00',
  },
  {
    id: 'mock-res-6',
    guestName: 'Valentina Cruz',
    isRedacted: false,
    roomNumber: '308',
    unitLabel: null,
    status: 'NO_SHOW',
    source: 'BOOKING',
    paxCount: 1,
    checkinAt: iso(minusHours(today, 6)),
    scheduledCheckout: iso(plusHours(tomorrow, 12)),
    arrivesToday: false,
    departsToday: false,
    isNoShow: true,
    dateRangeLabel: 'Hoy (no llegó)',
  },
  {
    id: 'mock-res-7',
    guestName: 'Miguel Ángel Rivas',
    isRedacted: false,
    roomNumber: '202',
    unitLabel: null,
    status: 'UPCOMING',
    source: 'EXPEDIA',
    paxCount: 3,
    checkinAt: iso(plusHours(tomorrow, 15)),
    scheduledCheckout: iso(plusHours(inThreeDays, 12)),
    arrivesToday: false,
    departsToday: false,
    isNoShow: false,
    dateRangeLabel: 'Mañana → en 3 días',
  },
  {
    id: 'mock-res-8',
    guestName: 'Ana Pérez',
    isRedacted: false,
    roomNumber: '405',
    unitLabel: null,
    status: 'UPCOMING',
    source: 'AIRBNB',
    paxCount: 2,
    checkinAt: iso(plusHours(inThreeDays, 14)),
    scheduledCheckout: iso(plusHours(inFiveDays, 12)),
    arrivesToday: false,
    departsToday: false,
    isNoShow: false,
    dateRangeLabel: 'En 3 días → 2 noches',
  },
]

// ── Detail builder ──────────────────────────────────────────────────────
function payments(stayId: string): ReservationPaymentLine[] {
  return [
    {
      id: `${stayId}-pay-1`,
      method: 'OTA_PREPAID',
      amount: '1850.00',
      currency: 'MXN',
      collectedAt: iso(minusHours(now, 72)),
      collectedByName: null,
      isVoid: false,
      reference: 'BKG-87291',
    },
    {
      id: `${stayId}-pay-2`,
      method: 'CASH',
      amount: '350.00',
      currency: 'MXN',
      collectedAt: iso(minusHours(now, 48)),
      collectedByName: 'Carlos R.',
      isVoid: false,
      reference: null,
    },
  ]
}

function history(stayId: string, status: ReservationListItem['status']): ReservationHistoryEvent[] {
  const events: ReservationHistoryEvent[] = [
    {
      id: `${stayId}-h-1`,
      whenLabel: 'hace 3 días',
      absoluteLabel: '23 abr 14:12',
      description: 'Reserva creada desde Booking.com',
      actorName: null,
      iconKey: 'system',
    },
    {
      id: `${stayId}-h-2`,
      whenLabel: 'hace 2 días',
      absoluteLabel: '24 abr 09:00',
      description: 'Pago prepagado registrado · $1,850 MXN',
      actorName: null,
      iconKey: 'payment',
    },
  ]
  if (status === 'IN_HOUSE' || status === 'DEPARTING' || status === 'DEPARTED') {
    events.push({
      id: `${stayId}-h-3`,
      whenLabel: 'hace 12h',
      absoluteLabel: '26 abr 14:30',
      description: 'Check-in confirmado · llave entregada (PHYSICAL)',
      actorName: 'Carlos R.',
      iconKey: 'arrival',
    })
  }
  if (status === 'NO_SHOW') {
    events.push({
      id: `${stayId}-h-3`,
      whenLabel: 'hace 2h',
      absoluteLabel: '26 abr 22:15',
      description: 'Marcado como no-show — sin contacto previo',
      actorName: 'Carlos R.',
      iconKey: 'noshow',
    })
  }
  if (status === 'DEPARTED') {
    events.push({
      id: `${stayId}-h-4`,
      whenLabel: 'hoy',
      absoluteLabel: '27 abr 11:30',
      description: 'Check-out completado',
      actorName: 'María L.',
      iconKey: 'departure',
    })
  }
  return events
}

export function buildMockDetail(item: ReservationListItem): ReservationDetail {
  return {
    ...item,
    guestEmail: 'guest@example.com',
    guestPhone: '+52 998 123 4567',
    nationality: 'MX',
    documentType: 'INE',
    documentNumberMasked: '***1234',
    ratePerNight: '1100.00',
    currency: 'MXN',
    totalAmount: '2200.00',
    amountPaid: item.status === 'UPCOMING' ? '0.00' : '2200.00',
    paymentStatus: item.status === 'UPCOMING' ? 'UNPAID' : 'PAID',
    notes: 'Solicita habitación tranquila, lejos del elevador.',
    arrivalNotes: item.status === 'IN_HOUSE' ? 'Pidió cama extra' : null,
    keyType: item.status === 'IN_HOUSE' ? 'PHYSICAL' : null,
    noShowAt: item.isNoShow ? iso(minusHours(now, 2)) : null,
    noShowReason: item.isNoShow ? 'Sin contacto previo' : null,
    payments: item.status === 'UPCOMING' ? [] : payments(item.id),
    history: history(item.id, item.status),
  }
}

export const MOCK_RESERVATIONS_BY_ID: Record<string, ReservationDetail> = Object.fromEntries(
  MOCK_RESERVATIONS_LIST.map((r) => [r.id, buildMockDetail(r)]),
)
