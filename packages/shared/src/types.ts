import {
  UnitStatus,
  BlockLogEvent,
  BlockReason,
  BlockSemantic,
  BlockStatus,
  Capability,
  CarryoverPolicy,
  CleaningCancelReason,
  CleaningStatus,
  ClockSource,
  Department,
  DiscrepancyStatus,
  DiscrepancyType,
  ExtensionFlag,
  GamificationLevel,
  HousekeepingRole,
  KeyDeliveryType,
  MaintenanceCategory,
  NoShowChargeStatus,
  PaymentMethod,
  PmsMode,
  Priority,
  RoomCategory,
  ShiftExceptionType,
  TaskLogEvent,
  TaskType,
  PropertyType,
} from './enums'

// ─── Property ────────────────────────────────────────────────────────────────

export interface PropertyDto {
  id: string
  name: string
  createdAt: string
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string
  email: string
  role: HousekeepingRole
  /** Operational area — drives the role-aware module switch in mobile (Sprint 8I AD-011).
   *  Optional for backward-compat with old tokens; backfilled to HOUSEKEEPING by default. */
  department?: Department
  propertyId: string
  organizationId: string
}

export interface AuthResponse {
  accessToken: string
  user: {
    id: string
    name: string
    email: string
    role: HousekeepingRole
    department: Department
    propertyId: string
    /** Display name of the property the user is currently scoped to. */
    propertyName: string | null
    /** Drives operational UX in the mobile app:
     *   HOTEL          → unit = room. Hide bed labels (e.g. "Cama A") everywhere.
     *   HOSTAL         → mixed inventory: PRIVATE rooms hide bed labels;
     *                    SHARED dorms show them. Decision per-room via
     *                    RoomCategory enum (CLAUDE.md). Property-level type
     *                    is a hint for default copy ("habitación" vs "cama").
     *   BOUTIQUE       → behaves like HOTEL.
     *   GLAMPING/ECO_LODGE → behaves like HOTEL (1 unit per "room").
     *   VACATION_RENTAL → listing-driven; no front desk; check-in by code.
     *                    Different dashboard set (CLAUDE.md docs/research-airbnb.md).
     */
    propertyType:
      | 'HOTEL'
      | 'HOSTAL'
      | 'BOUTIQUE'
      | 'GLAMPING'
      | 'ECO_LODGE'
      | 'VACATION_RENTAL'
      | null
  }
}

// ─── Staff ───────────────────────────────────────────────────────────────────

export interface StaffDto {
  id: string
  propertyId: string
  name: string
  email: string
  role: HousekeepingRole
  department?: Department
  active: boolean
  capabilities: Capability[]
  createdAt: string
}

// ─── Room / Unit ──────────────────────────────────────────────────────────────

export interface RoomDto {
  id: string
  propertyId: string
  number: string
  floor: number | null
  category: RoomCategory
  capacity: number
  units?: UnitDto[]
}

export interface UnitDto {
  id: string
  roomId: string
  label: string
  status: UnitStatus
  createdAt: string
  updatedAt: string
}

// ─── Checkout ────────────────────────────────────────────────────────────────

export interface CheckoutDto {
  id: string
  roomId: string
  guestName: string | null
  actualCheckoutAt: string
  source: 'MANUAL' | 'SYSTEM'
  isEarlyCheckout: boolean
  hasSameDayCheckIn: boolean
  notes: string | null
  cancelled: boolean
  cancelledAt: string | null
  createdAt: string
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export interface CleaningTaskDto {
  id: string
  unitId: string
  checkoutId: string | null
  assignedToId: string | null
  status: CleaningStatus
  taskType: TaskType
  requiredCapability: Capability
  priority: Priority
  hasSameDayCheckIn: boolean
  startedAt: string | null
  finishedAt: string | null
  verifiedAt: string | null
  verifiedById: string | null
  createdAt: string
  updatedAt: string
  // Sprint 8H — scheduling
  scheduledFor: string | null
  carryoverFromDate: string | null
  carryoverFromTaskId: string | null
  autoAssignmentRule: string | null
  cancelledReason: CleaningCancelReason | null
  cancelledAt: string | null
  extensionFlag: ExtensionFlag | null
  unit?: UnitDto & { room?: RoomDto }
  assignedTo?: StaffDto | null
}

export interface TaskLogDto {
  id: string
  taskId: string
  staffId: string | null   // Nullable: system-generated events have no associated staff
  event: TaskLogEvent
  note: string | null
  /** Snapshot opcional del evento. Caso principal:
   *  COMPLETED { checklist: [{ id, label, completed }] }  (Sprint 8K reports). */
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface CleaningNoteDto {
  id: string
  taskId: string
  staffId: string
  content: string
  createdAt: string
  staff?: Pick<StaffDto, 'id' | 'name'>
}

export interface MaintenanceIssueDto {
  id: string
  taskId: string
  reportedById: string
  category: MaintenanceCategory
  description: string
  photoUrl: string | null
  resolved: boolean
  createdAt: string
}

// ─── Daily Planning ───────────────────────────────────────────────────────────

export interface DailyPlanningCell {
  unitId: string
  unitLabel: string
  roomId: string
  roomNumber: string
  /**
   * Estado físico actual de la unidad en la base de datos.
   * CRÍTICO: Usado por inferState() para distinguir unidades OCCUPIED (con huésped,
   * elegibles para checkout) de unidades AVAILABLE (sin huésped, no deben marcarse
   * para checkout). Sin este campo, todas las unidades sin tarea aparecen como EMPTY
   * y el supervisor no puede marcarlas.
   */
  unitStatus: UnitStatus
  /** Current task for today (if any) */
  taskId: string | null
  taskStatus: CleaningStatus | null
  assignedToId: string | null
  hasSameDayCheckIn: boolean
  checkoutId: string | null
  cancelled: boolean
}

export interface DailyPlanningRow {
  roomId: string
  roomNumber: string
  roomCategory: RoomCategory
  floor: number | null
  units: DailyPlanningCell[]
}

export interface DailyPlanningGrid {
  date: string
  sharedRooms: DailyPlanningRow[]
  privateRooms: DailyPlanningRow[]
}

export interface SseEvent<T = unknown> {
  type: SseEventType
  data: T
}

// ─── Guest Stay ───────────────────────────────────────────────────────────────

export interface GuestStayDto {
  id: string
  bookingRef: string | null
  propertyId: string
  roomId: string
  guestName: string
  guestEmail: string | null
  guestPhone: string | null
  nationality: string | null
  documentType: string | null
  documentNumber: string | null
  paxCount: number
  checkinAt: string
  scheduledCheckout: string
  actualCheckout: string | null
  ratePerNight: string        // Decimal serialized as string
  currency: string
  totalAmount: string
  amountPaid: string
  paymentStatus: string
  source: string | null
  notes: string | null
  // No-show fields — all null until markAsNoShow() is called
  noShowAt: string | null
  noShowById: string | null
  noShowReason: string | null
  noShowFeeAmount: string | null
  noShowFeeCurrency: string | null
  noShowChargeStatus: NoShowChargeStatus | null
  noShowRevertedAt: string | null
  noShowRevertedById: string | null
  // Sprint 8 — check-in confirmation
  actualCheckin: string | null
  checkinConfirmedById: string | null
  // Sprint 9 — check-in extended fields
  arrivalNotes: string | null
  keyType: KeyDeliveryType | null
  paymentLogs?: PaymentLogDto[]
  createdAt: string
  updatedAt: string
  room?: RoomDto
  /**
   * Sprint 9 — Active cleaning state for the room of this stay (CLAUDE.md §54-§57).
   * Aggregated across all units of the room (most "active" status wins).
   * Drives the inline animation in the calendar PMS BookingBlock.
   * Null when no active task exists for this room today.
   */
  cleaningStatus?: 'PENDING' | 'READY' | 'IN_PROGRESS' | 'PAUSED' | 'DONE' | 'VERIFIED' | null
}

// ─── Payment ─────────────────────────────────────────────────────────────────

export interface PaymentLogDto {
  id: string
  organizationId: string
  propertyId: string
  stayId: string
  method: PaymentMethod
  amount: string            // Decimal serialized as string
  currency: string
  reference: string | null
  approvedById: string | null
  approvalReason: string | null
  isVoid: boolean
  voidedAt: string | null
  voidedById: string | null
  voidReason: string | null
  voidsLogId: string | null
  shiftDate: string
  collectedById: string
  createdAt: string
}

export interface CashSummaryDto {
  date: string
  propertyId: string
  totalCash: string
  byCollector: {
    collectedById: string
    collectorName: string
    total: string
    count: number
  }[]
}

// ─── Check-in Confirmation ───────────────────────────────────────────────────

export interface PaymentEntryInput {
  method: PaymentMethod
  amount: number
  reference?: string
  approvedById?: string
  approvalReason?: string
}

export interface ConfirmCheckinInput {
  documentVerified: boolean
  documentType?: string
  documentNumber?: string
  arrivalNotes?: string
  keyType?: KeyDeliveryType
  payments: PaymentEntryInput[]
  managerApprovalCode?: string
  managerApprovalReason?: string
}

// ─── Property Settings ────────────────────────────────────────────────────────

export interface PropertySettingsDto {
  id: string
  propertyId: string
  defaultCheckoutTime: string  // "HH:mm"
  timezone: string
  pmsMode: PmsMode
  noShowCutoffHour: number     // hora local (0-23) a partir de la cual se marca no-show
  propertyType: PropertyType

  // ── Sprint 8H — Housekeeping scheduling rules ──────────────────────────────
  morningRosterHour?: number             // 0-23 — default 7 AM local
  carryoverPolicy?: CarryoverPolicy
  autoAssignmentEnabled?: boolean        // default true
  shiftClockingRequired?: boolean        // default false

  updatedAt: string
}

// ─── No-Show Report ───────────────────────────────────────────────────────────

export interface NoShowItemDto {
  id: string
  guestName: string
  roomNumber: string | null
  scheduledCheckin: string
  scheduledCheckout: string
  noShowAt: string
  noShowReason: string | null
  feeAmount: string | null
  feeCurrency: string | null
  chargeStatus: NoShowChargeStatus | null
  source: string | null
  markedById: string | null
}

export interface NoShowReportDto {
  from: string
  to: string
  totalNoShows: number
  noShowRate: number | null          // % de no-shows vs total reservas del período
  totalFeeRevenue: string            // suma de feeAmount cobrado (CHARGED)
  totalFeePending: string            // suma de feeAmount en estado PENDING
  bySource: { source: string; count: number }[]
  items: NoShowItemDto[]
}

// ─── Unit Discrepancy ─────────────────────────────────────────────────────────

export interface UnitDiscrepancyDto {
  id: string
  unitId: string
  reportedById: string
  resolvedById: string | null
  type: DiscrepancyType
  status: DiscrepancyStatus
  description: string
  resolution: string | null
  createdAt: string
  resolvedAt: string | null
  unit?: UnitDto & { room?: { number: string; floor: number | null } }
  reportedBy?: Pick<StaffDto, 'id' | 'name'>
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export interface ReportOverviewDto {
  date: string
  totalCheckouts: number
  tasksCompleted: number
  tasksVerified: number
  tasksPending: number
  tasksUnassigned: number
  avgMinutesToComplete: number | null
}

export interface StaffPerformanceDto {
  staffId: string
  staffName: string
  tasksCompleted: number
  tasksVerified: number
  avgMinutesToComplete: number | null
}

// ─── Sprint 9 — Mobile Dashboard Reports ─────────────────────────────────────
// Contracts consumed by the mobile dashboard cards. Each is a "view model"
// pre-formatted for direct render — the mobile layer does NOT compute money,
// percentages, or strings. CLAUDE.md §14 timezone discipline applies.

/** OccupancyDonutCard payload. */
export interface OccupancyDonutDto {
  /** 0-100 (already rounded). */
  percentage: number
  occupied: number
  arrivingToday: number
  empty: number
  /** Yesterday's value for delta display. null if no historic data. */
  yesterdayPercentage: number | null
  /** Property's target (PropertySettings — future). Default 80. */
  targetPercentage: number
}

/** InHouseCard summary + expanded list payload. */
export interface InHouseSummaryDto {
  guestCount: number
  roomsOccupied: number
  arrivalsToday: number
  departuresToday: number
}

export interface InHouseRoomDto {
  id: string
  roomNumber: string
  /** Backend-redacted by role: null for HOUSEKEEPER. */
  guestName: string | null
  /** Pre-formatted "sale mañana 12:00 · 2 pax". */
  metaLabel: string
  flair: string | null
}

/** PendingTasksCard payload. */
export interface PendingTasksDto {
  housekeepingPending: number
  maintenanceCritical: number
  unpaidFolios: number
  /** Pre-formatted "$2,140 MXN" — null when unpaidFolios=0 or HK redacts. */
  unpaidAmountLabel: string | null
}

/** BlockedRoomsCard preview row (full detail in /v1/blocked-rooms/:id). */
export interface BlockedRoomDto {
  id: string
  roomNumber: string
  reason: string
  category: 'MAINTENANCE' | 'RENOVATION' | 'ADMIN' | 'OTHER'
  startsAt: string
  endsAt: string | null
  /** Pre-formatted "23 abr → 26 abr · 3 días". */
  rangeLabel: string
  requestedByName: string | null
  approvedByName: string | null
  ticketId: string | null
}

/** MovementsCard row — same shape for arrivals + departures. */
export interface MovementItemDto {
  stayId: string
  guestName: string | null
  roomNumber: string | null
  paxCount: number
  source: string | null
  flair: string | null
}

// ─── Rooms Grid ──────────────────────────────────────────────────────────────

export type RoomDisplayStatus = 'CLEAN' | 'DIRTY' | 'CLEANING' | 'OCCUPIED' | 'BLOCKED' | 'UNKNOWN'

export interface BedInRoomDto {
  id: string
  label: string
  status: RoomDisplayStatus
  scheduleLabel: string | null
  /** null for HOUSEKEEPER role. */
  guestName: string | null
}

export interface RoomGridItemDto {
  id: string
  number: string
  status: RoomDisplayStatus
  section: string | null
  floor: number | null
  category: 'PRIVATE' | 'SHARED'
  /** Populated only for SHARED rooms. */
  beds: BedInRoomDto[]
  operationalNotes: string | null
  /** Pre-formatted e.g. "sale mañana 12:00". */
  scheduleLabel: string | null
  /** null for HOUSEKEEPER role. */
  guestName: string | null
  paxCount: number | null
}

// ─── No-shows list (dashboard card — distinct from NoShowItemDto in reports) ──
// The report NoShowItemDto (line ~353) represents confirmed no-shows with full
// fiscal data. This DTO represents *potential* no-shows: arrivals today whose
// check-in has not yet been confirmed. Different shape, different purpose.

export interface DashboardNoShowItemDto {
  stayId: string
  /** null for HOUSEKEEPER role. */
  guestName: string | null
  roomNumber: string | null
  /** Pre-formatted "15:00", "ayer 14:00". */
  expectedCheckInLabel: string
  hoursOverdue: number
}

// ─── FX Rates ─────────────────────────────────────────────────────────────────

export interface FxRateRowDto {
  currency: string
  rate: number
  delta: number | null
  localCurrency: string
}

// ─── Ticker insights (rotating footer in OccupancyDonut) ──────────────────────

export interface TickerInsightDto {
  id: string
  icon?: string
  label: string
  caption?: string
  tone: 'positive' | 'negative' | 'neutral' | 'warning'
}

/** Full payload of GET /v1/reports/dashboard-overview. */
export interface DashboardOverviewDto {
  /** ISO timestamp of when the snapshot was computed. */
  computedAt: string
  occupancy: OccupancyDonutDto
  inHouse: InHouseSummaryDto
  /** Top N in-house rooms (sorted by checkout-soonest first). */
  inHouseRooms: InHouseRoomDto[]
  pendingTasks: PendingTasksDto
  blockedRooms: BlockedRoomDto[]
  arrivals: MovementItemDto[]
  departures: MovementItemDto[]
  /** Visual room-status grid (all rooms in property). */
  roomsGrid: RoomGridItemDto[]
  /** Potential no-shows: today's arrivals without confirmed check-in, past warning hour. */
  noShows: DashboardNoShowItemDto[]
  /** FX rates for the morning window. Empty when no rates configured. */
  fxRates: FxRateRowDto[]
  /** Rotating operational insights displayed in the OccupancyDonut footer. */
  tickerInsights: TickerInsightDto[]
}

// ─── Revenue Carousel (Sprint 9) ─────────────────────────────────────────────
// CLAUDE.md §17 — money arithmetic uses Decimal end-to-end. Strings here
// are pre-formatted by the server for display only.

export interface RevenueBreakdownRowDto {
  label: string
  /** Pre-formatted "$38,200 MXN". */
  amount: string
  /** Pre-formatted "90%" / "3 folios" / "↑ +8%". */
  meta: string
  /** 0-100. Optional progress bar. */
  progressPct: number | null
  /** Optional hex color override for this row's bar. */
  color: string | null
}

export interface RevenueFrameDto {
  /** Stable id used as React key + analytics tag. */
  id: 'today' | 'adr' | 'revpar' | 'topChannel' | 'commissions' | 'cashOnHand' | 'forecastWeek'
  /** Card label (top L2): "INGRESOS HOY", "ADR HOY", … */
  label: string
  /** Primary numeric, pre-formatted ("$42,180" / "Booking" / "$1,540"). */
  primaryWhole: string
  /** Currency or unit suffix ("MXN", "MXN/hab", ""). */
  primarySuffix: string
  /** Caption underneath the number, pre-formatted with delta. */
  caption: string
  captionTone: 'positive' | 'negative' | 'neutral' | 'warning'
  breakdown: RevenueBreakdownRowDto[]
}

export interface RevenueSnapshotDto {
  computedAt: string
  /** Property currency (ISO 4217). */
  currency: string
  /** Ordered frames; mobile rotates through them. */
  frames: RevenueFrameDto[]
}

// ─── Sprint 8I-J — Hub Recamarista Gamification ──────────────────────────────
// Privacy-first: every payload below is private to the staff member (and
// their supervisor for coaching). Peer-to-peer access is forbidden (D9).

export interface StaffStreakDto {
  currentDays: number
  longestDays: number
  freezesAvailable: number
  freezesTotal: number
  /** ISO YMD or null if never worked. */
  lastWorkDate: string | null
  /** True when today is not the lastWorkDate — visual cue (not a threat). */
  isAtRisk: boolean
}

export interface StaffPersonalRecordDto {
  roomCategory: string
  /** Pre-formatted "22 min". */
  bestLabel: string
  bestMinutes: number
  achievedAt: string
}

export interface DailyRingsDto {
  date: string
  tasksRing: { value: number; target: number; pct: number }
  minutesRing: { value: number; target: number; pct: number }
  verifiedRing: { value: number; target: number; pct: number }
  ringsCompleted: boolean
}

// ─── SSE Events (extended) ───────────────────────────────────────────────────

export type SseEventType =
  | 'task:planned'
  | 'task:ready'
  | 'task:started'
  | 'task:paused'      // Sprint 8K — emitted on pauseTask
  | 'task:resumed'     // Sprint 8K — emitted on resumeTask
  | 'task:done'
  | 'task:verified'    // Sprint 8K — supervisor approved cleaning
  | 'task:unassigned'
  | 'task:cancelled'
  | 'maintenance:reported'
  | 'discrepancy:reported'
  | 'room:ready'
  | 'checkout:confirmed'
  | 'checkin:completed'
  | 'room:moved'
  // SmartBlock events
  | 'block:created'
  | 'block:approved'
  | 'block:rejected'
  | 'block:activated'
  | 'block:expired'
  | 'block:cancelled'
  | 'block:extended'
  // Checkout events
  | 'checkout:early'
  // No-show events
  | 'stay:no_show'
  | 'stay:no_show_reverted'
  // Pre-arrival warning (potential no-show)
  | 'arrival:at_risk'
  // Soft-lock advisory (intra-Zenix overbooking UX — no hard block)
  | 'soft:lock:acquired'
  | 'soft:lock:released'
  // Notification center — real-time bell push
  | 'notification:new'
  // Check-in confirmation
  | 'checkin:confirmed'
  // Sprint 8H — Housekeeping scheduling
  | 'task:carryover'           // tarea movida del día anterior
  | 'task:auto-assigned'       // auto-asignación visible en tiempo real al supervisor
  | 'task:reassigned'          // reasignación post-creación (ausencia o manual)
  | 'task:extension-confirmed' // D12 — extensión confirma o cancela limpieza
  | 'roster:published'         // cron 7am terminó de ejecutar para esta propiedad
  | 'shift:absence'            // recepcionista marcó ausencia de un staff
  | 'shift:clock-in'           // staff hizo check-in al turno
  | 'shift:clock-out'          // staff hizo check-out al turno
  // Sprint 9 — flow refactor (D14, EC-3, EC-6)
  | 'stayover:published'       // cron 8am stayover terminó (D14)
  | 'task:deferred'            // EC-6 — housekeeper difirió tarea
  | 'task:retry-scheduled'     // EC-6 — auto-retry promovió tarea de DEFERRED
  | 'task:blocked'             // EC-6 — 3 deferrals → status=BLOCKED
  | 'task:rescheduled'         // EC-3 — late-checkout movió scheduledCheckout
  // Sprint 9 — D15 operational overrides (recepción)
  | 'task:priority-overridden' // recepción forzó URGENT
  | 'task:deep-clean-flagged'  // toggled deep clean flag
  | 'task:hold-placed'         // hold por extensión sin formalizar
  | 'task:hold-released'       // hold liberado

// ─── Offline Sync (Mobile) ────────────────────────────────────────────────────

export type SyncOperationType = 'START_TASK' | 'END_TASK' | 'PAUSE_TASK' | 'RESUME_TASK'

export interface SyncOperation {
  id: string
  type: SyncOperationType
  taskId: string
  timestamp: string
  retryCount: number
}

// ─── SmartBlock ───────────────────────────────────────────────────────────────

export interface BlockLogDto {
  id: string
  blockId: string
  staffId: string | null
  event: BlockLogEvent
  note: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  staff?: Pick<StaffDto, 'id' | 'name'> | null
}

export interface RoomBlockDto {
  id: string
  propertyId: string
  roomId: string | null     // null = bloqueo solo de unidad
  unitId: string | null     // null = bloqueo de habitación completa
  semantic: BlockSemantic
  reason: BlockReason
  status: BlockStatus
  notes: string | null
  internalNotes: string | null
  startDate: string         // ISO — cuándo entra en vigor
  endDate: string | null    // ISO — cuándo expira (null = indefinido)
  requestedById: string
  approvedById: string | null
  approvalNotes: string | null
  approvedAt: string | null
  cleaningTaskId: string | null  // tarea MAINTENANCE creada al activar
  createdAt: string
  updatedAt: string
  // Populated relations (endpoints de detalle)
  room?: RoomDto | null
  unit?: UnitDto | null
  requestedBy?: Pick<StaffDto, 'id' | 'name' | 'role'>
  approvedBy?: Pick<StaffDto, 'id' | 'name' | 'role'> | null
  cleaningTask?: Pick<CleaningTaskDto, 'id' | 'status' | 'assignedToId'> | null
  logs?: BlockLogDto[]
}

// Request payloads
export interface CreateBlockDto {
  roomId?: string        // XOR con unitId — si ninguno → error
  unitId?: string
  semantic: BlockSemantic
  reason: BlockReason
  notes?: string
  internalNotes?: string
  startDate?: string     // ISO, default = now
  endDate?: string       // ISO, null = indefinido
}

export interface ApproveBlockDto {
  approvalNotes?: string
}

export interface RejectBlockDto {
  approvalNotes: string  // obligatorio al rechazar
}

export interface CancelBlockDto {
  reason: string         // obligatorio al cancelar
}

export interface ExtendBlockDto {
  endDate: string        // nueva fecha ISO > endDate actual
}

// ─── Room Availability ────────────────────────────────────────────────────────
//
// Algorithm: half-open interval [checkIn, checkOut)
// Two date ranges overlap iff: existingCheckIn < newCheckOut AND existingCheckOut > newCheckIn
// Same-day turnover (existing.checkOut == new.checkIn) is NOT a conflict.
//
// Sources of conflict (in priority order):
//   GUEST_STAY  — an active GuestStay record overlaps the requested dates (HARD)
//   ROOM_STATUS — room is in MAINTENANCE or OUT_OF_SERVICE (SOFT — future supervisor override)

export type ConflictSource = 'GUEST_STAY' | 'ROOM_STATUS'

/** HARD = blocks booking. SOFT = operational warning (future: supervisor can override). */
export type ConflictSeverity = 'HARD' | 'SOFT'

export interface AvailabilityConflict {
  /** Where the conflict originates */
  source: ConflictSource
  severity: ConflictSeverity
  /** Guest name — only present for GUEST_STAY conflicts */
  guestName?: string
  /** Start of the conflicting existing reservation (ISO string) */
  conflictStart: string
  /** End of the conflicting existing reservation (ISO string) */
  conflictEnd: string
  /** Number of nights where the requested range overlaps the existing one */
  overlapDays: number
}

export interface RoomAvailabilityResult {
  /** True only when there are zero conflicts of any kind */
  available: boolean
  conflicts: AvailabilityConflict[]
}

// Slim Property payload returned by GET /properties. Feeds the
// PropertySwitcher dropdown — needs name for the label, region for
// grouping multiple properties in the same chain (Mews/Opera multi-
// property pattern), and city for disambiguating same-named hotels
// across regions (Slack / Google account-picker pattern).
export interface PropertyDto {
  id: string
  name: string
  organizationId?: string | null
  type?: string
  region?: string | null
  city?: string | null
}

// ─── Housekeeping Scheduling (Sprint 8H) ─────────────────────────────────────

export interface StaffShiftDto {
  id: string
  staffId: string
  propertyId: string
  dayOfWeek: number       // 0 (Sun) - 6 (Sat)
  startTime: string       // "HH:mm" local
  endTime: string         // "HH:mm" local
  effectiveFrom: string   // ISO date
  effectiveUntil: string | null
  active: boolean
  createdAt: string
}

export interface StaffShiftExceptionDto {
  id: string
  staffId: string
  date: string                          // ISO date
  type: ShiftExceptionType
  startTime: string | null
  endTime: string | null
  reason: string | null
  approvedById: string | null
  createdAt: string
}

export interface StaffCoverageDto {
  id: string
  propertyId: string
  staffId: string
  roomId: string
  isPrimary: boolean
  weight: number
  createdAt: string
  staff?: Pick<StaffDto, 'id' | 'name'>
  room?: Pick<RoomDto, 'id' | 'number'>
}

export interface StaffShiftClockDto {
  id: string
  staffId: string
  propertyId: string
  clockInAt: string
  clockOutAt: string | null
  source: ClockSource
  notes: string | null
  createdAt: string
}

export interface StaffPreferencesDto {
  id: string
  staffId: string
  gamificationLevel: GamificationLevel
  language: string
  hapticEnabled: boolean
  soundEnabled: boolean
  updatedAt: string
}

/** On-shift staff snapshot returned by AvailabilityQueryService. */
export interface OnShiftStaffDto {
  staffId: string
  name: string
  role: HousekeepingRole
  capabilities: Capability[]
  shiftStart: string   // "HH:mm"
  shiftEnd: string     // "HH:mm"
  source: 'RECURRING' | 'EXTRA' | 'MODIFIED'
}

/** Result of an autoAssign() call. */
export interface AutoAssignmentResult {
  assigned: boolean
  staffId: string | null
  rule: 'COVERAGE_PRIMARY' | 'COVERAGE_BACKUP' | 'ROUND_ROBIN' | null
  reason: string | null  // explicación si NO se asignó
}

/** Daily roster summary pushed to each housekeeper at 7am. */
export interface DailyRosterSummaryDto {
  date: string                  // ISO local date YYYY-MM-DD
  staffId: string
  totalTasks: number
  sameDayCheckInTasks: number
  carryoverTasks: number
  doubleUrgentTasks: number     // carryover && hasSameDayCheckIn
}
