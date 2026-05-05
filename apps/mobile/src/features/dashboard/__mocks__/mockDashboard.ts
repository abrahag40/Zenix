/**
 * 🟡 QA-ONLY MOCK DATA — DELETE BEFORE PRODUCTION
 * ════════════════════════════════════════════════════════════════════
 *
 * Hardcoded fallback data for the Dashboard so the receptionist can
 * preview the time-aware adaptive layout without backend wiring.
 *
 * Activates when:
 *   1. EXPO_PUBLIC_USE_MOCKS=true (set in apps/mobile/.env)
 *   2. AND the dashboard endpoints have not been wired yet (Sprint 9).
 *
 * To remove from the codebase entirely: delete this file + every
 * `MOCK_DASHBOARD_*` import in apps/mobile/app/(app)/index.tsx.
 */

import type { RoomGridItem, RoomDisplayStatus, BedInRoom } from '../components/RoomsGridCard'
import type { NoShowItem } from '../components/NoShowsListCard'
import type { FxRateRow } from '../components/FxRateCard'
import type { OccupancyDonutData } from '../components/OccupancyDonutCard'
import type { BlockedRoom } from '../components/BlockedRoomsCard'
import type { InHouseRoomItem } from '../components/InHouseCard'
import type { TickerInsight } from '../components/RotatingTicker'
import type { PendingTasksData } from '../components/PendingTasksCard'
import type { TodayRevenueData } from '../components/TodayRevenueCard'
import type { RevenueFrame } from '../components/RevenueCarouselCard'
import type { UpcomingArrival } from '../components/ArrivalsTimelineCard'
import type { MovementItem } from '../components/MovementsCard'
import type { SpecialRequest } from '../components/SpecialRequestsCard'
import type { ApprovalRequest } from '../components/PendingApprovalsCard'

/**
 * Sprint 8I default: ON. To disable when real /reports endpoints
 * land in Sprint 9, set EXPO_PUBLIC_USE_MOCKS=false.
 */
export const MOCKS_DASHBOARD_ENABLED = process.env.EXPO_PUBLIC_USE_MOCKS !== 'false'

// ── Donut data (replaces sparkline) ─────────────────────────────────
export const MOCK_OCCUPANCY_DONUT: OccupancyDonutData = {
  percentage: 78,
  occupied: 11,
  arrivingToday: 4,
  empty: 7,
  yesterdayPercentage: 72,
  targetPercentage: 80,
}

// ── Visual room grid — 24 rooms across 3 sections ───────────────────
const STATUSES: RoomDisplayStatus[] = [
  'OCCUPIED', 'CLEAN', 'DIRTY', 'CLEANING', 'OCCUPIED', 'OCCUPIED',
  'CLEAN', 'DIRTY', 'OCCUPIED', 'BLOCKED', 'CLEAN', 'CLEAN',
  'OCCUPIED', 'CLEANING', 'OCCUPIED', 'DIRTY', 'CLEAN', 'OCCUPIED',
  'OCCUPIED', 'CLEAN', 'DIRTY', 'OCCUPIED', 'CLEAN', 'OCCUPIED',
]

// Sample beds for ONE shared dorm (mock-room-312) to demo the HOSTAL flow.
const MOCK_DORM_BEDS: BedInRoom[] = [
  { id: 'bed-312-A', label: 'Cama A', status: 'OCCUPIED', guestName: 'Sofía R.', scheduleLabel: 'sale mañana' },
  { id: 'bed-312-B', label: 'Cama B', status: 'OCCUPIED', guestName: 'Liam N.',  scheduleLabel: 'sale en 2 días' },
  { id: 'bed-312-C', label: 'Cama C', status: 'DIRTY',    guestName: null,        scheduleLabel: 'salió hoy' },
  { id: 'bed-312-D', label: 'Cama D', status: 'CLEAN',    guestName: null,        scheduleLabel: 'lista' },
]

export const MOCK_ROOMS_GRID: RoomGridItem[] = STATUSES.map((status, i) => {
  const floor = Math.floor(i / 8) + 1
  const room = (i % 8) + 1
  const number = `${floor}0${room}`
  // Distribute into 3 sections to demonstrate grouping:
  //  - 8 rooms on "Piso 1"   (typical hotel rooms)
  //  - 8 rooms on "Piso 2"   (typical hotel rooms)
  //  - 8 rooms in "Cabañas"  (section override — non-numeric grouping)
  const section: string | null = i >= 16 ? 'Cabañas' : null
  return {
    id: `mock-room-${number}`,
    number: i >= 16 ? `C${room}` : number,
    status,
    section,
    floor: section ? null : floor,
    category: status === 'OCCUPIED' && i === 14 ? 'SHARED' : 'PRIVATE',
    beds: i === 14 ? MOCK_DORM_BEDS : undefined,
    guestName:
      status === 'OCCUPIED'
        ? ['María García', 'Carlos M.', 'Diego H.', 'Sebastián T.', 'Laura V.'][i % 5]
        : null,
    paxCount: status === 'OCCUPIED' ? (i % 3) + 1 : null,
    scheduleLabel:
      status === 'OCCUPIED' ? 'sale mañana 12:00' :
      status === 'DIRTY'    ? 'salió hoy — pendiente limpieza' :
      status === 'CLEAN'    ? 'lista para vender' :
      status === 'CLEANING' ? 'limpieza en curso' :
      status === 'BLOCKED'  ? 'bloqueada por mantenimiento' :
      null,
    operationalNotes:
      i === 0 ? 'Solicita extra toallas en el baño' :
      i === 9 ? 'Fuga reportada — esperando refacción' :
      null,
  }
})

// ── Blocked rooms ───────────────────────────────────────────────────
// Mocked at 5 entries to demonstrate the cap=3 + "Ver todas (5)" CTA.
export const MOCK_BLOCKED_ROOMS: BlockedRoom[] = [
  {
    id: 'blk-1',
    roomNumber: '105',
    reason: 'Fuga de agua en regadera — esperando plomero externo',
    category: 'MAINTENANCE',
    startsAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    endsAt: new Date(Date.now() + 1 * 86_400_000).toISOString(),
    rangeLabel: '23 abr → 26 abr · 3 días',
    requestedByName: 'Carlos R.',
    approvedByName: 'Ana G.',
    ticketId: 'TKT-441',
  },
  {
    id: 'blk-2',
    roomNumber: '412',
    reason: 'Renovación pintura recámara y baño',
    category: 'RENOVATION',
    startsAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
    endsAt: null,
    rangeLabel: '25 abr → indefinido',
    requestedByName: 'Ana G.',
    approvedByName: null,
    ticketId: null,
  },
  {
    id: 'blk-3',
    roomNumber: '208',
    reason: 'Aire acondicionado fuera de servicio',
    category: 'MAINTENANCE',
    startsAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    endsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    rangeLabel: '22 abr → 27 abr · 5 días',
    requestedByName: 'María T.',
    approvedByName: 'Ana G.',
    ticketId: 'TKT-442',
  },
  {
    id: 'blk-4',
    roomNumber: '301',
    reason: 'Bloqueo administrativo por requisición fiscal',
    category: 'ADMIN',
    startsAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
    endsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    rangeLabel: '25 abr → 30 abr · 5 días',
    requestedByName: 'Director Ops',
    approvedByName: 'Director Ops',
    ticketId: null,
  },
  {
    id: 'blk-5',
    roomNumber: '105B',
    reason: 'Inspección periódica plomería piso 1',
    category: 'OTHER',
    startsAt: new Date(Date.now() + 1 * 86_400_000).toISOString(),
    endsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    rangeLabel: '27 abr → 28 abr · 1 día',
    requestedByName: 'Pedro R.',
    approvedByName: 'Ana G.',
    ticketId: 'TKT-443',
  },
]

// ── In-house rooms (for InHouseCard inline expand) ──────────────────
export const MOCK_IN_HOUSE_ROOMS: InHouseRoomItem[] = [
  { id: 'inh-1',  roomNumber: '203', guestName: 'María García',     metaLabel: 'sale mañana 12:00 · 2 pax', flair: 'VIP' },
  { id: 'inh-2',  roomNumber: '210', guestName: 'Sebastián Torres', metaLabel: 'sale mañana 12:00 · 2 pax' },
  { id: 'inh-3',  roomNumber: '312', guestName: 'Sofía Ramírez',    metaLabel: 'sale en 2 días · 1 pax · dorm' },
  { id: 'inh-4',  roomNumber: '101', guestName: 'Diego Hernández',  metaLabel: 'sale hoy 12:00 · 2 pax' },
  { id: 'inh-5',  roomNumber: '102', guestName: 'Liam Nielsen',     metaLabel: 'sale en 3 días · 1 pax' },
  { id: 'inh-6',  roomNumber: '105', guestName: 'Camila Vega',      metaLabel: 'sale mañana 12:00 · 3 pax', flair: 'Late ck' },
  { id: 'inh-7',  roomNumber: '202', guestName: 'Andrés Salinas',   metaLabel: 'sale en 2 días · 2 pax' },
  { id: 'inh-8',  roomNumber: '305', guestName: 'Valentina Cruz',   metaLabel: 'sale mañana 12:00 · 1 pax' },
  { id: 'inh-9',  roomNumber: '308', guestName: 'Lucas Méndez',     metaLabel: 'sale en 4 días · 2 pax' },
  { id: 'inh-10', roomNumber: 'C2',  guestName: 'Familia Ortega',   metaLabel: 'sale mañana · 4 pax', flair: 'Cabaña' },
  { id: 'inh-11', roomNumber: 'C5',  guestName: 'Renata Ibáñez',    metaLabel: 'sale en 5 días · 2 pax' },
]

// ── Operational ticker insights for the donut footer ───────────────
// These rotate every 5 seconds. Each is a real-time data point that the
// receptionist would otherwise have to dig 3-clicks for.
export const MOCK_TICKER_INSIGHTS: TickerInsight[] = [
  {
    id: 'avg-checkout-time',
    icon: '⏱',
    label: 'Check-out promedio: 11:42',
    caption: '12 min antes del estándar',
    tone: 'positive',
  },
  {
    id: 'cancellation-rate',
    icon: '📊',
    label: 'Cancelaciones 7d: 4.2%',
    caption: 'baja vs 5.8% promedio',
    tone: 'positive',
  },
  {
    id: 'rating-week',
    icon: '⭐',
    label: 'Rating última semana: 4.7',
    caption: 'sobre 12 reseñas',
    tone: 'positive',
  },
  {
    id: 'foot-traffic',
    icon: '🛎️',
    label: 'Recepción últ. hora: 8 atenciones',
    caption: 'flujo regular',
    tone: 'neutral',
  },
  {
    id: 'pending-folios',
    icon: '💳',
    label: 'Folios sin saldar: 3',
    caption: '$2,140 MXN pendientes',
    tone: 'warning',
  },
]

/** In-house guest counts. */
export const MOCK_IN_HOUSE = {
  guestCount: 19,
  roomsOccupied: 11,
  arrivalsToday: 4,
  departuresToday: 3,
}

/** Potential no-shows — only meaningful in evening window. */
export const MOCK_NO_SHOWS: NoShowItem[] = [
  {
    stayId: 'mock-stay-1',
    guestName: 'María García',
    roomNumber: '203',
    expectedCheckInLabel: '15:00',
    hoursOverdue: 5.5,
  },
  {
    stayId: 'mock-stay-2',
    guestName: 'Carlos Mendoza',
    roomNumber: '105',
    expectedCheckInLabel: '17:00',
    hoursOverdue: 3.2,
  },
  {
    stayId: 'mock-stay-3',
    guestName: 'Sofía Ramírez',
    roomNumber: '312',
    expectedCheckInLabel: '19:30',
    hoursOverdue: 1.0,
  },
]

/** FX rates — only shown in morning window. */
export const MOCK_FX_RATES: FxRateRow[] = [
  { currency: 'USD', rate: 18.42, delta: 0.12, localCurrency: 'MXN' },
  { currency: 'EUR', rate: 19.85, delta: -0.04, localCurrency: 'MXN' },
]

// ── Pending operational tasks ─────────────────────────────────────
export const MOCK_PENDING_TASKS: PendingTasksData = {
  housekeepingPending: 4,
  maintenanceCritical: 1,
  unpaidFolios: 3,
  unpaidAmountLabel: '$2,140 MXN',
}

// ── Today revenue (RECEPTION+ only) ───────────────────────────────
export const MOCK_TODAY_REVENUE: TodayRevenueData = {
  projectedAmount: 42180,
  currency: 'MXN',
  collectedAmount: 38200,
  pendingFolios: 3,
  pendingAmount: 3980,
  deltaPercentVsYesterday: 12,
}

// ── Capital insights for the revenue card ticker ──────────────────
// Rotates capital/finance metrics that complement the headline number.
// Each is the kind of figure a manager checks 5 times per shift.
export const MOCK_REVENUE_INSIGHTS: TickerInsight[] = [
  {
    id: 'adr-today',
    icon: '🛏',
    label: 'ADR hoy: $1,540 MXN',
    caption: '↑ +8% vs últimos 7 días',
    tone: 'positive',
  },
  {
    id: 'revpar-today',
    icon: '📈',
    label: 'RevPAR hoy: $1,201 MXN',
    caption: 'sobre 22 habitaciones disponibles',
    tone: 'neutral',
  },
  {
    id: 'topChannel',
    icon: '🥇',
    label: 'Canal top hoy: Booking',
    caption: '$18,400 · 43% del revenue',
    tone: 'neutral',
  },
  {
    id: 'commissions',
    icon: '💼',
    label: 'Comisiones OTA hoy: $5,800',
    caption: '15% del revenue · OK vs límite 18%',
    tone: 'positive',
  },
  {
    id: 'cashOnHand',
    icon: '💵',
    label: 'Caja recepción: $4,250 MXN',
    caption: '8 movimientos en turno · sin diferencias',
    tone: 'positive',
  },
  {
    id: 'forecastWeek',
    icon: '🗓',
    label: 'Forecast semana: $312K MXN',
    caption: 'al 78% de meta semanal',
    tone: 'neutral',
  },
]

// ── Revenue carousel frames (full-card rotation) ──────────────────
// Each frame replaces the ENTIRE card content for ~7s. Sprint 9 wires
// these from `GET /v1/reports/revenue-snapshot` (returns FrameDto[]).
export const MOCK_REVENUE_FRAMES: RevenueFrame[] = [
  {
    id: 'today',
    label: 'INGRESOS HOY',
    primaryWhole: '$42,180',
    primarySuffix: 'MXN',
    caption: 'proyectado · ↑ +12% vs ayer',
    captionTone: 'positive',
    breakdown: [
      { label: 'Cobrado',   amount: '$38,200 MXN', meta: '90%',         color: '#34D399', progressPct: 90 },
      { label: 'Pendiente', amount: '$3,980 MXN',  meta: '3 folios',    color: '#FBBF24' },
    ],
  },
  {
    id: 'adr',
    label: 'ADR HOY',
    primaryWhole: '$1,540',
    primarySuffix: 'MXN/hab',
    caption: '↑ +8% vs últimos 7 días',
    captionTone: 'positive',
    breakdown: [
      { label: 'Promedio 7d',   amount: '$1,425 MXN', meta: '7 días',          color: "#10B981" },
      { label: 'Habitaciones',  amount: '11 vendidas', meta: 'sobre 22 dispon.' },
    ],
  },
  {
    id: 'revpar',
    label: 'RevPAR HOY',
    primaryWhole: '$1,201',
    primarySuffix: 'MXN/hab',
    caption: 'sobre 22 habitaciones disponibles',
    captionTone: 'neutral',
    breakdown: [
      { label: 'Promedio mes',  amount: '$985 MXN',  meta: '↑ +22%',  color: '#34D399' },
      { label: 'Mejor día mes', amount: '$1,420 MXN', meta: '15 abr' },
    ],
  },
  {
    id: 'topChannel',
    label: 'CANAL TOP HOY',
    primaryWhole: 'Booking',
    primarySuffix: '',
    caption: '$18,400 MXN · 43% del revenue del día',
    captionTone: 'neutral',
    breakdown: [
      { label: 'Booking',  amount: '$18,400', meta: '43%', color: '#5BA8FF', progressPct: 43 },
      { label: 'Direct',   amount: '$12,300', meta: '29%', color: '#34D399', progressPct: 29 },
      { label: 'Airbnb',   amount: '$8,200',  meta: '19%', color: '#FF787C', progressPct: 19 },
      { label: 'Otros',    amount: '$3,280',  meta: '9%',  color: '#9CA3AF', progressPct: 9 },
    ],
  },
  {
    id: 'commissions',
    label: 'COMISIONES OTA HOY',
    primaryWhole: '$5,800',
    primarySuffix: 'MXN',
    caption: '15% del revenue · OK vs límite 18%',
    captionTone: 'positive',
    breakdown: [
      { label: 'Booking 15%',  amount: '$2,760', meta: 'sobre $18,400', color: '#5BA8FF' },
      { label: 'Airbnb 14%',   amount: '$1,148', meta: 'sobre $8,200',  color: '#FF787C' },
      { label: 'Expedia 18%',  amount: '$1,892', meta: 'sobre $10,500', color: '#FFD43B' },
    ],
  },
  {
    id: 'cashOnHand',
    label: 'CAJA RECEPCIÓN',
    primaryWhole: '$4,250',
    primarySuffix: 'MXN',
    caption: '8 movimientos · sin diferencias',
    captionTone: 'positive',
    breakdown: [
      { label: 'Cobros del turno', amount: '+$3,400', meta: '6 ingresos', color: '#34D399' },
      { label: 'Devoluciones',     amount: '-$0',     meta: '—' },
      { label: 'Inicial turno',    amount: '$850',    meta: 'fondo fijo' },
    ],
  },
  {
    id: 'forecastWeek',
    label: 'FORECAST SEMANA',
    primaryWhole: '$312K',
    primarySuffix: 'MXN',
    caption: 'al 78% de meta semanal',
    captionTone: 'neutral',
    breakdown: [
      { label: 'Hoy + 6d',     amount: '$312K',  meta: '78%', color: "#10B981", progressPct: 78 },
      { label: 'Meta semanal', amount: '$400K',  meta: 'lun-dom' },
    ],
  },
]

// ── Today movements (arrivals + departures) — feeds MovementsCard ─
export const MOCK_TODAY_ARRIVALS: MovementItem[] = [
  { stayId: 'mock-res-2', guestName: 'Liam Nielsen',     roomNumber: '102', paxCount: 1, source: 'BOOKING' },
  { stayId: 'arr-2',      guestName: 'Camila Vega',      roomNumber: '105', paxCount: 3, source: 'DIRECT', flair: 'VIP' },
  { stayId: 'arr-3',      guestName: 'Familia Ortega',   roomNumber: 'C2',  paxCount: 4, source: 'DIRECT' },
  { stayId: 'arr-4',      guestName: 'Andrés Salinas',   roomNumber: '202', paxCount: 2, source: 'AIRBNB' },
  { stayId: 'arr-5',      guestName: 'Renata Ibáñez',    roomNumber: 'C5',  paxCount: 2, source: 'BOOKING' },
  { stayId: 'arr-6',      guestName: 'Lucas Méndez',     roomNumber: '308', paxCount: 2, source: 'EXPEDIA' },
  { stayId: 'mock-res-1', guestName: 'María García',     roomNumber: '203', paxCount: 2, source: 'BOOKING', flair: 'Late' },
]

export const MOCK_TODAY_DEPARTURES: MovementItem[] = [
  { stayId: 'dep-1', guestName: 'Diego Hernández',   roomNumber: '101', paxCount: 2, source: 'BOOKING' },
  { stayId: 'dep-2', guestName: 'Mateo Vásquez',     roomNumber: '107', paxCount: 1, source: 'AIRBNB' },
  { stayId: 'dep-3', guestName: 'Ana & Pedro Ruiz',  roomNumber: '309', paxCount: 2, source: 'DIRECT', flair: 'Late ck' },
  { stayId: 'dep-4', guestName: 'Familia Aguilar',   roomNumber: 'C3',  paxCount: 4, source: 'EXPEDIA' },
  { stayId: 'dep-5', guestName: 'Karen Fox',         roomNumber: '211', paxCount: 1, source: 'HOSTELWORLD' },
]

// ── (deprecated) Upcoming arrivals — kept for ArrivalsTimelineCard
//    that now lives in deferred backlog. Safe to remove on Sprint 9.
export const MOCK_UPCOMING_ARRIVALS: UpcomingArrival[] = [
  { stayId: 'mock-res-2', expectedAtLabel: '15:00', expectedHour: 15, guestName: 'Liam Nielsen',     roomNumber: '102', paxCount: 1, source: 'BOOKING' },
  { stayId: 'arr-2',      expectedAtLabel: '15:00', expectedHour: 15, guestName: 'Camila Vega',      roomNumber: '105', paxCount: 3, source: 'DIRECT', flair: 'VIP' },
  { stayId: 'arr-3',      expectedAtLabel: '16:00', expectedHour: 16, guestName: 'Familia Ortega',   roomNumber: 'C2',  paxCount: 4, source: 'DIRECT' },
  { stayId: 'arr-4',      expectedAtLabel: '17:00', expectedHour: 17, guestName: 'Andrés Salinas',   roomNumber: '202', paxCount: 2, source: 'AIRBNB' },
  { stayId: 'arr-5',      expectedAtLabel: '19:00', expectedHour: 19, guestName: 'Renata Ibáñez',    roomNumber: 'C5',  paxCount: 2, source: 'BOOKING' },
  { stayId: 'arr-6',      expectedAtLabel: '20:00', expectedHour: 20, guestName: 'Lucas Méndez',     roomNumber: '308', paxCount: 2, source: 'EXPEDIA' },
  { stayId: 'mock-res-1', expectedAtLabel: '20:00', expectedHour: 20, guestName: 'María García',     roomNumber: '203', paxCount: 2, source: 'BOOKING', flair: 'Late' },
]

// ── Special requests pending today ───────────────────────────────
export const MOCK_SPECIAL_REQUESTS: SpecialRequest[] = [
  {
    id: 'req-1',
    type: 'OCEAN_VIEW',
    description: 'Solicita vista al mar — habitación tranquila',
    guestName: 'Ana Pérez',
    roomNumber: '405',
    whenLabel: 'check-in mañana 14:00',
    priority: 'high',
  },
  {
    id: 'req-2',
    type: 'CELEBRATION',
    description: 'Botella de vino tinto — aniversario',
    guestName: 'Diego & Camila',
    roomNumber: '203',
    whenLabel: 'hoy 18:00',
    priority: 'high',
  },
  {
    id: 'req-3',
    type: 'EXTRA_BED',
    description: 'Cama extra para niño de 8 años',
    guestName: 'Familia Ortega',
    roomNumber: 'C2',
    whenLabel: 'check-in hoy 16:00',
  },
  {
    id: 'req-4',
    type: 'AIRPORT_PICKUP',
    description: 'Transfer aeropuerto — vuelo AM 0843 18:30',
    guestName: 'Sofía Ramírez',
    roomNumber: '312',
    whenLabel: 'mañana 17:30',
  },
  {
    id: 'req-5',
    type: 'DIETARY',
    description: 'Desayuno vegano · sin gluten',
    guestName: 'Liam Nielsen',
    roomNumber: '102',
    whenLabel: 'cada mañana',
  },
]

// ── Pending approvals (SUPERVISOR/ADMIN only) ─────────────────────
export const MOCK_APPROVALS: ApprovalRequest[] = [
  {
    id: 'apr-1',
    kind: 'LATE_CHECKOUT',
    title: 'Late check-out · Hab. 203 · +2h',
    subline: 'solicita Carlos R. · María García',
    amountLabel: '$400 MXN',
  },
  {
    id: 'apr-2',
    kind: 'COMP',
    title: 'Cortesía $500 · Hab. 105',
    subline: 'razón: sin agua caliente 2h · solicita Carlos R.',
    amountLabel: '$500 MXN',
  },
  {
    id: 'apr-3',
    kind: 'BLOCK_RELEASE',
    title: 'Liberar bloqueo · Hab. 412',
    subline: 'pintura completada · solicita Ana G.',
    amountLabel: null,
  },
]
