export interface RoomTypeGroup {
  id: string
  name: string
  code: string
  baseRate: number
  currency: string
  rooms: RoomRow[]
  collapsed: boolean
}

export interface RoomRow {
  id: string
  number: string
  floor: number | null
  status: RoomStatus
  roomTypeId: string
}

export interface GuestStayBlock {
  id: string
  bookingRef?: string
  roomId: string
  guestName: string
  checkIn: Date
  checkOut: Date
  nights: number
  ratePerNight: number
  paymentStatus: PaymentStatus
  source: string
  totalAmount: number
  amountPaid: number
  currency: string
  paxCount: number
  notes?: string
  // Sprint EDIT-RESERVATION — campos editables vía bulk-edit en BookingDetailSheet
  arrivalNotes?: string | null
  isLocked?: boolean
  actualCheckin?: Date
  actualCheckout?: Date
  noShowAt?: Date
  noShowFeeAmount?: number
  noShowFeeCurrency?: string
  noShowChargeStatus?: 'NOT_APPLICABLE' | 'PENDING' | 'CHARGED' | 'FAILED' | 'WAIVED'
  // Cancel-Archive (Sprint 2026-05-16)
  cancelledAt?: Date
  cancelInitiator?: 'GUEST' | 'HOTEL' | 'OTA' | 'ADMIN_ERROR' | 'SYSTEM'
  cancelReason?: string
  cancelReasonCode?: string
  stripePaymentMethodId?: string
  otaName?: string
  otaReservationId?: string
  pmsReservationId?: string
  /**
   * Sprint CHANNEX-INBOUND — campos Channex específicos.
   * Visibles en BookingDetailSheet "Tab OTA" y en BookingBlock como
   * visual cue (channexConflict → ring amber).
   */
  channexBookingId?: string | null
  channexOtaName?: string | null
  channexConflict?: boolean
  channexLastSyncAt?: Date | null
  paymentModel?: 'HOTEL_COLLECT' | 'OTA_COLLECT' | 'HYBRID_DEPOSIT'
  guestEmail?: string
  guestPhone?: string
  documentType?: string
  documentNumber?: string
  nationality?: string
  roomNumber?: string
  journeyId?: string
  guestStayId?: string      // GuestStay ID for journey blocks (id = segment ID)
  segmentId?: string
  segmentReason?: 'ORIGINAL' | 'EXTENSION_SAME_ROOM' | 'EXTENSION_NEW_ROOM' | 'ROOM_MOVE' | 'SPLIT'
  segmentLocked?: boolean
  /** Timestamp en que recepción confirmó la mudanza física (entrega de nueva
   *  llave). Solo aplica a segments con reason EXTENSION_NEW_ROOM o ROOM_MOVE.
   *  Sprint MOVE-CONFIRM 2026-05-18: alimenta la acción "Confirmar mudanza"
   *  inline en el bloque cuando es null + checkIn ≤ today. */
  moveConfirmedAt?: Date
  isFirstSegment?: boolean
  isLastSegment?: boolean
  hasMultipleSegments?: boolean
  originalRoomNumber?: string  // room the journey started in (for EXT_NEW_ROOM / ROOM_MOVE)
  /** Para segmentos intermedios de un journey: número de habitación del segmento siguiente
   *  y fecha de cambio. Alimenta el indicador "Movido a → X" sobre bloques históricos. */
  nextSegmentRoomNumber?: string
  nextSegmentCheckIn?: Date
  /**
   * Active cleaning task state for this stay's room (CLAUDE.md §54-§57).
   * Optional — populated only when the backend includes the relevant
   * CleaningTask in the GuestStay query. Drives the inline animation in
   * BookingBlock so the receptionist sees cleaning progress without
   * opening the kanban.
   */
  cleaningStatus?: 'PENDING' | 'READY' | 'IN_PROGRESS' | 'PAUSED' | 'DONE' | 'VERIFIED' | null
}

export interface DayMetrics {
  date: Date
  occupiedCount: number
  totalRooms: number
  revenue: number
  currency: string
}

export type RoomStatus =
  | 'AVAILABLE' | 'OCCUPIED' | 'CHECKING_OUT'
  | 'CLEANING' | 'INSPECTION' | 'MAINTENANCE' | 'OUT_OF_SERVICE'

export type PaymentStatus =
  | 'PENDING' | 'PARTIAL' | 'PAID' | 'CREDIT' | 'OVERDUE'

export type StayStatus = 'ARRIVING' | 'UNCONFIRMED' | 'IN_HOUSE' | 'DEPARTING' | 'DEPARTED' | 'NO_SHOW'

export type ViewMode = 'week' | 'month' | 'quarter'

export interface FlatRow {
  type: 'group' | 'room'
  id: string
  groupId?: string
  room?: RoomRow
  group?: RoomTypeGroup
}

export interface DragState {
  stayId: string
  originalRoomId: string
  originalCheckIn: Date
  originalCheckOut: Date
  nights: number
  currentRoomId: string
  currentCheckIn: Date
  currentCheckOut: Date
  isValid: boolean
  conflictReason?: string
}

export interface DropResult {
  stayId: string
  newRoomId: string
  newCheckIn: Date
  newCheckOut: Date
}

export interface ExtendState {
  stayId: string
  journeyId?: string
  roomId: string
  rowIndex: number
  groupHeaderOffsetY: number
  originalCheckOut: Date
  previewCheckOut: Date
  startClientX: number
}

export interface VirtualColumn {
  key: string
  index: number
  date: Date
  start: number
  size: number
}
