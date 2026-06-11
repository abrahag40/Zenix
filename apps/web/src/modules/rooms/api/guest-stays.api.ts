import { api } from '@/api/client'
import type { RoomAvailabilityResult, ConfirmCheckinInput, PaymentEntryInput } from '@zenix/shared'

export type { ConfirmCheckinInput, PaymentEntryInput }

// Sprint CHECK-IN-α §107 — payload del endpoint /checkin-context.
export type PaymentModel = 'HOTEL_COLLECT' | 'OTA_COLLECT' | 'HYBRID_DEPOSIT'

// Sprint EDIT-RESERVATION — bitácora de notas
export type NoteChannel = 'GENERAL' | 'GUEST_REQUEST' | 'HOUSEKEEPING' | 'INTERNAL'

export interface PaymentLogDto {
  id: string
  stayId: string
  method: string
  amount: number | string  // Decimal serializa como string en JSON
  currency: string
  reference: string | null
  approvedById: string | null
  approvalReason: string | null
  isVoid: boolean
  voidedAt: string | null
  voidedById: string | null
  voidReason: string | null
  voidsLogId: string | null
  collectedById: string
  createdAt: string
  shiftDate: string
  // Sprint EDIT-RESERVATION iter 4 — staff resolvido server-side.
  collector: { id: string; name: string | null; email: string } | null
  voider:    { id: string; name: string | null; email: string } | null
}

export interface GuestStayNoteDto {
  id: string
  stayId: string
  authorId: string
  content: string
  channel: NoteChannel
  createdAt: string
  editedAt: string | null
}

export interface CheckinContext {
  stay: {
    id: string
    bookingRef: string | null
    guestName: string
    /** Sprint CHECK-IN C1.12 — split BI nombre/apellido. Null en stays legacy
     *  pre-backfill; UI deriva fallback de guestName.split. */
    guestFirstName: string | null
    guestLastName:  string | null
    guestEmail: string | null
    guestPhone: string | null
    documentType: string | null
    documentNumber: string | null
    documentPhotoUrl: string | null
    nationality: string | null
    paxCount: number
    checkinAt: string
    scheduledCheckout: string
    source: string | null
    currency: string
    arrivalNotes: string | null
  }
  room: { id: string; number: string; status: string }
  paymentModel: PaymentModel
  /** Moneda primaria operacional — LegalEntity.baseCurrency o folio fallback. */
  propertyCurrency: string
  /**
   * Map currency-code → "1 unidad de propertyCurrency = rate target".
   * Typically {USD, EUR, MXN} \ propertyCurrency. Null por target sin rate.
   */
  secondaryRates: Record<string, number | null>
  balanceProjection: {
    totalAmount: number
    amountPaid: number
    balance: number
    currency: string
  }
  canCheckIn: {
    ok: boolean
    reasons: string[]
    warnings: string[]
  }
  identityCaptured: boolean
  // AUTO-CHECKIN §D-AC6 — el huésped hizo su pre-checkin (datos + foto) antes
  // de llegar. `guestVerifiedFields` = campos que confirmó/corrigió.
  precheckinSubmittedAt: string | null
  guestVerifiedFields: string[]
  paymentLogs: Array<{
    id: string
    method: string
    amount: number
    currency: string
    reference: string | null
    createdAt: string
  }>
}

/** GROUP-PAYMENTS Fase A — desglose de balance por habitación del grupo. */
export interface GroupBalanceEntry {
  stayId: string
  roomNumber: string | null
  roomIndex: number | null
  guestName: string
  totalAmount: number
  amountPaid: number
  balance: number
  paymentStatus: string
  paymentModel: 'HOTEL_COLLECT' | 'OTA_COLLECT' | 'HYBRID_DEPOSIT'
  checkedIn: boolean
  cancelled: boolean
  noShow: boolean
  isContext: boolean
}
export interface GroupBalances {
  groupId: string | null
  currency: string | null
  stays: GroupBalanceEntry[]
}

/** GROUP-BILLING Fase C C4 — preview de cancelación por miembro del grupo. */
export interface GroupCancelMember {
  stayId: string
  roomNumber: string | null
  roomIndex: number | null
  guestName: string
  currency: string
  totalAmount: number
  amountPaid: number
  checkedIn: boolean
  checkedOut: boolean
  noShow: boolean
  cancelled: boolean
  /** true si el miembro puede cancelarse ahora (no checked-in/out, no no-show, no cancelado). */
  cancellable: boolean
  isContext: boolean
  retention: number
  refund: number
  free: boolean
  appliedTier: { fromHours: number; toHours: number; chargeType: 'NIGHTS' | 'PERCENT' | 'FIXED'; value: number } | null
}
export interface GroupCancellationPreview {
  groupId: string | null
  primaryGuestName: string | null
  currency: string | null
  channexBookingId: string | null
  otaName: string | null
  members: GroupCancelMember[]
}

const BASE = '/v1/guest-stays'

export const guestStaysApi = {
  list: (propertyId: string, from: Date, to: Date) =>
    api.get<Record<string, unknown>[]>(
      `${BASE}?propertyId=${propertyId}&from=${from.toISOString()}&to=${to.toISOString()}`
    ),

  /**
   * Pre-flight availability check — no side effects.
   * Returns the full conflict list so the dialog can show detailed inline warnings
   * before the user submits the form.
   */
  checkAvailability: (roomId: string, checkIn: Date, checkOut: Date) =>
    api.get<RoomAvailabilityResult>(
      `${BASE}/availability?roomId=${roomId}&checkIn=${checkIn.toISOString()}&checkOut=${checkOut.toISOString()}`
    ),

  create: (data: {
    propertyId: string
    roomId: string
    firstName: string
    lastName: string
    guestEmail?: string
    guestPhone?: string
    nationality?: string
    guestSex?: string
    documentType?: string
    adults: number
    children: number
    checkIn: string
    checkOut: string
    ratePerNight: number
    currency: string
    source: string
    amountPaid: number
    paymentMethod?: string
    paymentReference?: string
    notes?: string
  }) => api.post<Record<string, unknown>>(BASE, data),

  get: (stayId: string) =>
    api.get<Record<string, unknown>>(`${BASE}/${stayId}`),

  checkout: (stayId: string) =>
    api.post(`${BASE}/${stayId}/checkout`, {}),

  earlyCheckout: (stayId: string, notes?: string) =>
    api.post<{ success: boolean; freedFrom: string; freedTo: string; tasksScheduledFor: 'today' | 'tomorrow' }>(
      `${BASE}/${stayId}/early-checkout`,
      { notes },
    ),

  moveRoom: (stayId: string, newRoomId: string, pricingDecision: string) =>
    api.patch(`${BASE}/${stayId}/move-room`, { newRoomId, pricingDecision }),

  // CHECK-IN C3.1 v3 (2026-05-30) — Atomic room swap entre 2 stays activas.
  // Use case primario: ReservationGroup OTA con asignación interna confundida.
  swapRooms: (stayIdA: string, stayIdB: string, reason?: string) =>
    api.post<{ success: boolean; stayA: { id: string; newRoomId: string }; stayB: { id: string; newRoomId: string } }>(
      `${BASE}/swap-rooms`,
      { stayIdA, stayIdB, reason },
    ),

  extendStay: (stayId: string, newCheckOut: Date) =>
    api.patch(`${BASE}/${stayId}/extend`, { newCheckOut: newCheckOut.toISOString() }),

  extendSameRoom: (journeyId: string, newCheckOut: Date) =>
    api.post(`/v1/stay-journeys/${journeyId}/extend-same-room`, {
      newCheckOut: newCheckOut.toISOString(),
    }),

  extendNewRoom: (journeyId: string, newRoomId: string, newCheckOut: Date) =>
    api.post(`/v1/stay-journeys/${journeyId}/extend-new-room`, {
      newRoomId,
      newCheckOut: newCheckOut.toISOString(),
    }),

  moveExtensionRoom: (segmentId: string, newRoomId: string) =>
    api.patch(`/v1/stay-journeys/segments/${segmentId}/move-room`, { newRoomId }),

  /**
   * Cancela un segmento futuro de un journey (extensión que el guest checked-in
   * decide no tomar). Difiere del cancel-stay (guards no-checked-in) y del
   * early-checkout (guest se va HOY). El guest sigue alojado en el segmento
   * actual; solo se revoca la prolongación planeada.
   */
  cancelExtensionSegment: (segmentId: string, reason?: string) =>
    api.post(`/v1/stay-journeys/segments/${segmentId}/cancel`, { reason }),

  /**
   * Confirma físicamente que el guest cambió de habitación (recepción entregó
   * la nueva llave). Aplica solo a segments con reason EXTENSION_NEW_ROOM o
   * ROOM_MOVE, en el día del move. Triggera HK task READY para el cuarto
   * previo (promueve PENDING existente o crea READY si no había).
   */
  confirmSegmentMove: (segmentId: string) =>
    api.post(`/v1/stay-journeys/segments/${segmentId}/confirm-move`, {}),

  splitReservation: (
    journeyId: string,
    parts: Array<{ roomId: string; checkIn: Date; checkOut: Date }>,
  ) =>
    api.post(`/v1/stay-journeys/${journeyId}/split`, {
      parts: parts.map((p) => ({
        roomId: p.roomId,
        checkIn: p.checkIn.toISOString(),
        checkOut: p.checkOut.toISOString(),
      })),
    }),

  confirmCheckin: (stayId: string, data: ConfirmCheckinInput) =>
    api.post<{ success: boolean; actualCheckin: string }>(
      `${BASE}/${stayId}/confirm-checkin`,
      data,
    ),

  /** Sprint CHECK-IN-α §107 — datos consolidados para el dialog de check-in. */
  getCheckinContext: (stayId: string) =>
    api.get<CheckinContext>(`${BASE}/${stayId}/checkin-context`),

  /** GROUP-PAYMENTS Fase A (D-GRP-A3/A4) — balances por habitación del grupo. */
  getGroupBalances: (stayId: string) =>
    api.get<GroupBalances>(`${BASE}/${stayId}/group-balances`),

  /** GROUP-CHECKIN Fase B (D-GRP-B1..B3) — check-in bulk de miembros del grupo. */
  bulkCheckin: (payload: {
    members: { stayId: string; guestName?: string }[]
    documentVerified: boolean
  }) => api.post<{
    checkedIn: number
    total: number
    results: { stayId: string; status: string; guestName?: string; balance?: number }[]
  }>(`${BASE}/group-checkin`, payload),

  // ─── Sprint EDIT-RESERVATION ─────────────────────────────────────────────

  /**
   * PATCH parcial — guards per-phase enforced server-side.
   * Devuelve `{ ok, changed, phase, changedFields }`. Si `changed=false`,
   * el server short-circuiteó (sin escritura ni audit).
   */
  updateStay: (
    stayId: string,
    patch: {
      guestName?: string
      guestEmail?: string
      guestPhone?: string
      documentType?: string
      documentNumber?: string
      documentPhotoUrl?: string
      nationality?: string
      notes?: string
      arrivalNotes?: string
      paxCount?: number
      ratePerNight?: number
      managerApprovalCode?: string
      managerApprovalReason?: string
      reason?: string
    },
  ) =>
    api.patch<{
      ok: true
      changed: boolean
      phase: 'PRE_CHECKIN' | 'POST_CHECKIN' | 'POST_CHECKOUT' | 'CANCELLED' | 'NOSHOW'
      changedFields?: string[]
    }>(`${BASE}/${stayId}`, patch),

  /** Notes — bitácora humana per reserva (append-only, edit window 5min). */
  listNotes: (stayId: string) =>
    api.get<Array<GuestStayNoteDto>>(`${BASE}/${stayId}/notes`),

  createNote: (
    stayId: string,
    payload: { content: string; channel?: NoteChannel },
  ) => api.post<GuestStayNoteDto>(`${BASE}/${stayId}/notes`, payload),

  editNote: (noteId: string, payload: { content: string }) =>
    api.patch<GuestStayNoteDto>(`${BASE}/notes/${noteId}`, payload),

  /** Lista PaymentLogs de la stay (incluye voided + entradas negativas). */
  listPayments: (stayId: string) =>
    api.get<PaymentLogDto[]>(`${BASE}/${stayId}/payments`),

  /** Anula un PaymentLog — backend crea entrada negativa append-only (§28). */
  voidPayment: (paymentLogId: string, voidReason: string) =>
    api.post<{ success: true }>(`${BASE}/payments/${paymentLogId}/void`, { voidReason }),

  /** Registra un pago adicional sobre la stay (ya existe el endpoint backend). */
  registerPayment: (stayId: string, payload: {
    method: string
    amount: number
    reference?: string
    approvedById?: string
    approvalReason?: string
    /** GROUP-PAYMENTS Fase A — pagador (otra stay del grupo). */
    paidByStayId?: string
    /** GROUP-PAYMENTS Fase A — stays del grupo que este pago liquida. */
    appliesToStayIds?: string[]
  }) => api.post<PaymentLogDto>(`${BASE}/${stayId}/payments`, payload),

  // ── Cancel-Archive (Sprint 2026-05-16) ───────────────────────────────────
  cancel: (stayId: string, data: {
    initiator: 'GUEST' | 'HOTEL' | 'OTA' | 'ADMIN_ERROR' | 'SYSTEM'
    reason?: string
    reasonCode?: string
    cancelledFromChannel?: 'PMS_DIRECT' | 'CHANNEX_WEBHOOK' | 'AUTO_SYSTEM'
    metadata?: Record<string, unknown>
  }) =>
    api.post<{ ok: true; cancelledAt: string }>(`${BASE}/${stayId}/cancel`, data),

  restore: (stayId: string) =>
    api.post<{ ok: true; restoredAt: string }>(`${BASE}/${stayId}/restore`, {}),

  // ── GROUP-BILLING Fase C C2/C3 — política de cancelación ──────────────────
  /** Preview de retención/reembolso si se cancela AHORA (según la policy aplicable). */
  cancellationPreview: (stayId: string) =>
    api.get<{
      stayId: string
      alreadyCancelled: boolean
      totalAmount: number
      amountPaid: number
      free: boolean
      hoursUntilCheckin: number
      appliedTier: { fromHours: number; toHours: number; chargeType: 'NIGHTS' | 'PERCENT' | 'FIXED'; value: number } | null
      retention: number
      refund: number
      currency: string
    }>(`${BASE}/${stayId}/cancellation-preview`),

  /** Registra el outcome administrativo del reembolso de una reserva cancelada. */
  registerCancelRefund: (stayId: string, payload: {
    status: 'REFUNDED' | 'WAIVED'
    method?: string
    reference?: string
    amount?: number
    reason?: string
  }) => api.post<{ ok: true; cancelRefundStatus: string }>(`${BASE}/${stayId}/register-cancel-refund`, payload),

  // ── GROUP-BILLING Fase C C4 — cancelación de grupo ────────────────────────
  /** Preview retención/reembolso por miembro del grupo si se cancela AHORA. */
  groupCancellationPreview: (stayId: string) =>
    api.get<GroupCancellationPreview>(`${BASE}/${stayId}/group-cancellation-preview`),

  /** Cancela N miembros de un grupo (parcial o total). */
  groupCancel: (payload: {
    stayIds: string[]
    initiator: 'GUEST' | 'HOTEL' | 'OTA' | 'ADMIN_ERROR' | 'SYSTEM'
    reason?: string
    reasonCode?: string
  }) => api.post<{
    ok: true
    groupCancelled: boolean
    cancelledCount: number
    remainingActive: number
    results: Array<{ stayId: string; roomNumber: string; retention: number; refund: number; refundStatus: 'PENDING' | 'NONE' }>
  }>(`${BASE}/group-cancel`, payload),

  listCancelled: (params: { propertyId: string; limit?: number; offset?: number; initiator?: string; since?: string }) => {
    const qs = new URLSearchParams({ propertyId: params.propertyId })
    if (params.limit !== undefined)    qs.set('limit', String(params.limit))
    if (params.offset !== undefined)   qs.set('offset', String(params.offset))
    if (params.initiator !== undefined) qs.set('initiator', params.initiator)
    if (params.since !== undefined)    qs.set('since', params.since)
    return api.get<{ rows: Array<Record<string, unknown>>; total: number }>(
      `${BASE}/cancelled?${qs.toString()}`,
    )
  },

  countCancelledToday: (propertyId: string, timezone: string) =>
    api.get<number>(`${BASE}/cancelled-today-count?propertyId=${propertyId}&timezone=${encodeURIComponent(timezone)}`),
}
