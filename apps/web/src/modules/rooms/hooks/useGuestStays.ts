import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { startOfDay } from 'date-fns'
import toast from 'react-hot-toast'
import { api, ApiError } from '@/api/client'
import { guestStaysApi } from '../api/guest-stays.api'
import type { NewStayData } from '../components/dialogs/CheckInDialog'
import { OTA_OPTIONS } from '../components/dialogs/CheckInDialog'
import type { GuestStayBlock } from '../types/timeline.types'

/** Converts a raw API record (Prisma GuestStay) into the frontend GuestStayBlock. */
function adaptStay(raw: Record<string, unknown>): GuestStayBlock {
  const checkIn  = new Date(raw.checkinAt as string)
  const checkOut = new Date(raw.scheduledCheckout as string)
  const nights   = Math.max(1, Math.round(
    (checkOut.getTime() - checkIn.getTime()) / 86400000
  ))
  const source = (raw.source as string) ?? 'other'
  const ota = OTA_OPTIONS.find(o => o.value === source)

  const stayJourney = raw.stayJourney as { id: string } | null | undefined
  return {
    id:               raw.id as string,
    bookingRef:       raw.bookingRef as string | undefined,
    roomId:           raw.roomId as string,
    guestName:        raw.guestName as string,
    journeyId:        stayJourney?.id ?? undefined,
    guestEmail:       raw.guestEmail as string | undefined,
    guestPhone:       raw.guestPhone as string | undefined,
    nationality:      raw.nationality as string | undefined,
    documentType:     raw.documentType as string | undefined,
    paxCount:         (raw.paxCount as number) ?? 1,
    checkIn,
    checkOut,
    nights,
    ratePerNight:     Number(raw.ratePerNight),
    totalAmount:      Number(raw.totalAmount),
    amountPaid:       Number(raw.amountPaid),
    paymentStatus:    raw.paymentStatus as GuestStayBlock['paymentStatus'],
    currency:         (raw.currency as string) ?? 'USD',
    source,
    otaName:          ota?.label ?? source,
    pmsReservationId: raw.pmsReservationId as string | undefined,
    notes:            raw.notes as string | undefined,
    isLocked:         false,
    actualCheckin:    raw.actualCheckin ? new Date(raw.actualCheckin as string) : undefined,
    actualCheckout:   raw.actualCheckout ? new Date(raw.actualCheckout as string) : undefined,
    noShowAt:             raw.noShowAt ? new Date(raw.noShowAt as string) : undefined,
    noShowFeeAmount:      raw.noShowFeeAmount != null ? Number(raw.noShowFeeAmount) : undefined,
    noShowFeeCurrency:    raw.noShowFeeCurrency as string | undefined,
    noShowChargeStatus:   raw.noShowChargeStatus as GuestStayBlock['noShowChargeStatus'],
    stripePaymentMethodId: raw.stripePaymentMethodId as string | undefined,
    cancelledAt:          raw.cancelledAt ? new Date(raw.cancelledAt as string) : undefined,
    cancelInitiator:      raw.cancelInitiator as GuestStayBlock['cancelInitiator'],
    cancelReason:         raw.cancelReason as string | undefined,
    cancelReasonCode:     raw.cancelReasonCode as string | undefined,
  }
}

export function useGuestStays(propertyId: string, from: Date, to: Date) {
  return useQuery({
    queryKey: [
      'guest-stays',
      propertyId,
      startOfDay(from).toISOString(),
      startOfDay(to).toISOString(),
    ],
    queryFn:  async () => {
      const raw = await guestStaysApi.list(propertyId, from, to)
      return raw.map(adaptStay)
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    enabled: !!propertyId,
    placeholderData: keepPreviousData,
  })
}

export function useCreateGuestStay(propertyId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (data: NewStayData & { propertyId: string }) => {
      const { documentPhoto: _photo, ...rest } = data
      return guestStaysApi.create({
        ...rest,
        propertyId: data.propertyId,
        adults: data.adults ?? 1,
        children: data.children ?? 0,
        amountPaid: data.amountPaid ?? 0,
        guestEmail: data.guestEmail || undefined,
        // Si el form pre-fillea "+52" como dial code default pero el usuario
        // NO tecleó dígitos, descartamos — sino guardaríamos un teléfono
        // inválido tipo "+52" sin número real. Regex: + + 1-4 dígitos = solo dial code.
        guestPhone: data.guestPhone && !/^\+\d{1,4}$/.test(data.guestPhone.trim())
          ? data.guestPhone
          : undefined,
        checkIn:  new Date(data.checkIn).toISOString(),
        checkOut: new Date(data.checkOut).toISOString(),
      })
    },

    onMutate: async (data) => {
      // Cancelar fetches en vuelo
      await qc.cancelQueries({
        predicate: (q) =>
          q.queryKey[0] === 'guest-stays' && q.queryKey[1] === propertyId,
      })

      // Snapshot vía findAll (TanStack v5 API)
      const stayQueries = qc.getQueryCache().findAll({
        predicate: (q) =>
          q.queryKey[0] === 'guest-stays' && q.queryKey[1] === propertyId,
      })
      const snapshots = stayQueries.map((q) => ({
        key: q.queryKey,
        data: q.state.data as GuestStayBlock[] | undefined,
      }))

      const checkInDate = new Date(data.checkIn)
      const checkOutDate = new Date(data.checkOut)
      const nights = Math.max(
        1,
        Math.round((checkOutDate.getTime() - checkInDate.getTime()) / 86400000),
      )
      const ota = OTA_OPTIONS.find((o) => o.value === data.source)

      // Optimistic insert — incluir TODOS los campos del huésped (no solo
      // los del bloque visual del calendario). Sin esto, si el usuario abre
      // el detalle de la reserva recién creada antes del refetch del server,
      // el sheet muestra Phone/Email/Nationality vacíos (bug reportado
      // 2026-05-17). Cuando llega el refetch, el temp- es reemplazado por la
      // versión real con el mismo dataset → continuidad visual transparente.
      const optimisticStay: GuestStayBlock = {
        id: 'temp-' + Date.now(),
        roomId: data.roomId,
        guestName: `${data.firstName} ${data.lastName}`.trim(),
        checkIn: checkInDate,
        checkOut: checkOutDate,
        nights,
        ratePerNight: data.ratePerNight,
        totalAmount: data.ratePerNight * nights,
        amountPaid: data.amountPaid ?? 0,
        paymentStatus: 'PENDING',
        currency: data.currency,
        source: data.source,
        otaName: ota?.label ?? data.source,
        paxCount: (data.adults ?? 1) + (data.children ?? 0),
        isLocked: false,
        bookingRef: undefined,
        // Campos del huésped — antes faltaban, generaban detalle "vacío"
        guestEmail:     data.guestEmail || undefined,
        guestPhone:     data.guestPhone || undefined,
        nationality:    data.nationality || undefined,
        documentType:   data.documentType || undefined,
      }

      // Insertar en cada cache activo de guest-stays
      stayQueries.forEach((q) => {
        const current = q.state.data as GuestStayBlock[] | undefined
        if (current) {
          qc.setQueryData(q.queryKey, [...current, optimisticStay])
        }
      })

      return { snapshots }
    },

    onError: (error, _data, ctx) => {
      ctx?.snapshots?.forEach(({ key, data }) => {
        qc.setQueryData(key, data)
      })
      const msg = error instanceof ApiError
        ? error.message
        : 'Error al crear la reserva'
      toast.error(msg)
      console.error('[CheckIn] mutation error:', error)
    },

    onSuccess: () => {
      qc.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === 'guest-stays' && q.queryKey[1] === propertyId,
      })
      qc.invalidateQueries({
        queryKey: ['stay-journeys-timeline', propertyId],
        exact: false,
        refetchType: 'active',
      })
      qc.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === 'rooms' && q.queryKey[1] === propertyId,
      })
    },
  })
}

export function useCheckout(propertyId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (stayId: string) => guestStaysApi.checkout(stayId),
    // 2026-05-17 — Fix bug recurrente "el bloque del huésped NO se actualiza
    // tras checkout (Pedro & Carmen Vega, observado múltiples sprints)".
    // Mismo bug que `useEarlyCheckout` ya tenía documentado (líneas 212-218):
    // invalidateQueries con refetchType:'active' NO garantiza re-fetch
    // sincrónico cuando el dialog modal estaba abierto — la query queda en
    // estado suspendido y el UI re-renderiza con la data stale del journey
    // (color "IN_HOUSE" persiste aunque GuestStay.actualCheckout ya existe).
    //
    // Fix: `await refetchQueries` para AMBAS queries antes de mostrar el
    // toast. El dialog ya se cerró desde TimelineScheduler (línea 1257)
    // sincrónicamente — necesitamos garantizar que cuando vuelve el control
    // al render del calendar, ya tenga ambas fuentes refrescadas.
    onSuccess: async () => {
      await qc.refetchQueries({
        queryKey: ['guest-stays', propertyId],
        exact: false,
        type: 'active',
      })
      // El calendario PMS deriva el color del bloque del estado del journey
      // (DEPARTED vs IN_HOUSE). Refetch awaited explícito — NO invalidate.
      await qc.refetchQueries({
        queryKey: ['stay-journeys-timeline', propertyId],
        exact: false,
        type: 'active',
      })
      qc.invalidateQueries({ queryKey: ['rooms', propertyId], exact: false })
      toast.success('Checkout registrado — habitación liberada')
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'No se pudo realizar el checkout')
    },
  })
}

export function useEarlyCheckout(propertyId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ stayId, notes }: { stayId: string; notes?: string }) =>
      guestStaysApi.earlyCheckout(stayId, notes),
    // 2026-05-15 — Fix bug recurrente "checkout no actualiza el bloque
    // automáticamente, debo hacer refresh". Causa: invalidateQueries con
    // refetchType:'active' NO garantiza un re-fetch sincrónico, especialmente
    // cuando el dialog modal estaba abierto (puede dejar queries en estado
    // suspendido). Reemplazamos por `await refetchQueries` (mismo patrón que
    // useCheckout regular) — fuerza re-fetch antes de cerrar el dialog, así
    // el UI re-renderiza con data fresca antes que el usuario pueda mirar.
    onSuccess: async (result) => {
      await qc.refetchQueries({
        queryKey: ['guest-stays', propertyId],
        exact: false,
        type: 'active',
      })
      // stay-journeys-timeline también se refetchquea explícitamente — el
      // calendario PMS deriva el color del bloque del estado del journey.
      await qc.refetchQueries({
        queryKey: ['stay-journeys-timeline', propertyId],
        exact: false,
        type: 'active',
      })
      qc.invalidateQueries({ queryKey: ['rooms', propertyId], exact: false })
      const msg =
        result.tasksScheduledFor === 'tomorrow'
          ? 'Salida anticipada registrada — limpieza programada para mañana'
          : 'Salida anticipada registrada — limpieza disponible para hoy'
      toast.success(msg)
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'No se pudo registrar la salida anticipada')
    },
  })
}

export function useMoveRoom(propertyId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ stayId, newRoomId }: { stayId: string; newRoomId: string }) =>
      guestStaysApi.moveRoom(stayId, newRoomId, 'complimentary'),
    // 2026-05-19 — Bug fix: el bloque no se movía visualmente hasta refresh.
    // Root cause: (1) `invalidateQueries` con refetchType:'active' no garantiza
    // re-fetch cuando React Query considera el query "suspendido" (CLAUDE.md §3);
    // (2) faltaba invalidar `stay-journeys-timeline` que es de donde el calendar
    // lee segmentos. Mismo patrón que useExtendStay / useEarlyCheckout.
    // También invalida `guest-stay-timeline` (audit history) para que el
    // Historial en ReservationDetailPage muestre cada move sin staleness.
    onSuccess: async () => {
      await qc.refetchQueries({
        queryKey: ['guest-stays', propertyId],
        exact: false,
      })
      await qc.refetchQueries({
        queryKey: ['stay-journeys-timeline', propertyId],
        exact: false,
      })
      qc.invalidateQueries({ queryKey: ['rooms', propertyId], exact: false })
      qc.invalidateQueries({ queryKey: ['guest-stay-timeline'], exact: false })
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'No se pudo mover la reserva')
    },
  })
}

export function useMarkNoShow(propertyId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({
      stayId,
      reason,
      waiveCharge,
    }: {
      stayId: string
      reason?: string
      waiveCharge?: boolean
    }) => api.post(`/v1/guest-stays/${stayId}/no-show`, { reason, waiveCharge }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guest-stays', propertyId], exact: false, refetchType: 'active' })
      toast.success('No-show registrado')
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'No se pudo marcar no-show')
    },
  })
}

// ── Cancel-Archive (Sprint 2026-05-16) ─────────────────────────────────────
export interface CancelStayInput {
  initiator: 'GUEST' | 'HOTEL' | 'OTA' | 'ADMIN_ERROR' | 'SYSTEM'
  reason?: string
  reasonCode?: string
  cancelledFromChannel?: 'PMS_DIRECT' | 'CHANNEX_WEBHOOK' | 'AUTO_SYSTEM'
  metadata?: Record<string, unknown>
}

export function useCancelStay(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ stayId, data }: { stayId: string; data: CancelStayInput }) =>
      guestStaysApi.cancel(stayId, data),
    onSuccess: async () => {
      await qc.refetchQueries({ queryKey: ['guest-stays', propertyId], exact: false })
      await qc.refetchQueries({ queryKey: ['stay-journeys-timeline', propertyId], exact: false })
      await qc.refetchQueries({ queryKey: ['cancelled-today-count', propertyId], exact: false })
      await qc.refetchQueries({ queryKey: ['cancelled-stays', propertyId], exact: false })
      toast.success('Reserva cancelada')
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'No se pudo cancelar la reserva')
    },
  })
}

export function useRestoreStay(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (stayId: string) => guestStaysApi.restore(stayId),
    onSuccess: async () => {
      await qc.refetchQueries({ queryKey: ['guest-stays', propertyId], exact: false })
      await qc.refetchQueries({ queryKey: ['stay-journeys-timeline', propertyId], exact: false })
      await qc.refetchQueries({ queryKey: ['cancelled-stays', propertyId], exact: false })
      toast.success('Reserva restaurada')
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'No se pudo restaurar la reserva')
    },
  })
}

export function useCancelledStays(propertyId: string, opts?: { initiator?: string; since?: string; limit?: number }) {
  return useQuery({
    queryKey: ['cancelled-stays', propertyId, opts?.initiator ?? 'all', opts?.since ?? 'all'],
    queryFn: () => guestStaysApi.listCancelled({ propertyId, ...opts }),
    enabled: !!propertyId,
    staleTime: 60_000,
  })
}

export function useCancelledTodayCount(propertyId: string, timezone: string) {
  return useQuery({
    queryKey: ['cancelled-today-count', propertyId, timezone],
    queryFn: () => guestStaysApi.countCancelledToday(propertyId, timezone),
    enabled: !!propertyId && !!timezone,
    staleTime: 30_000,
  })
}

export function useRevertNoShow(propertyId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (stayId: string) =>
      api.post(`/v1/guest-stays/${stayId}/revert-no-show`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guest-stays', propertyId], exact: false, refetchType: 'active' })
      qc.invalidateQueries({ queryKey: ['stay-journeys-timeline', propertyId], exact: false, refetchType: 'active' })
      toast.success('No-show revertido')
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'No se pudo revertir el no-show')
    },
  })
}

export function useExtendStay(propertyId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ stayId, newCheckOut }: { stayId: string; newCheckOut: Date }) =>
      guestStaysApi.extendStay(stayId, newCheckOut),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guest-stays', propertyId], exact: false, refetchType: 'active' })
      qc.invalidateQueries({ queryKey: ['stay-journeys-timeline', propertyId], exact: false, refetchType: 'active' })
      toast.success('Estadía extendida')
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'No se pudo extender la estadía')
    },
  })
}

/** Extension via StayJourney endpoint — creates EXTENSION_SAME_ROOM segment (+ext block).
 *  Use this when the stay has a journeyId. Invalidates both guest-stays and
 *  stay-journeys-timeline so the +ext block appears immediately after confirm. */
export function useExtendSameRoom(propertyId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ journeyId, newCheckOut }: { journeyId: string; newCheckOut: Date }) =>
      guestStaysApi.extendSameRoom(journeyId, newCheckOut),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guest-stays', propertyId], exact: false, refetchType: 'active' })
      qc.invalidateQueries({ queryKey: ['stay-journeys-timeline', propertyId], exact: false, refetchType: 'active' })
      toast.success('Estadía extendida')
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'No se pudo extender la estadía')
    },
  })
}

/** Extension into a different room when the original is unavailable for the new dates.
 *  Creates EXTENSION_NEW_ROOM segment + room-change cleaning tasks. */
export function useExtendNewRoom(propertyId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ journeyId, newRoomId, newCheckOut }: { journeyId: string; newRoomId: string; newCheckOut: Date }) =>
      guestStaysApi.extendNewRoom(journeyId, newRoomId, newCheckOut),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guest-stays', propertyId], exact: false, refetchType: 'active' })
      qc.invalidateQueries({ queryKey: ['stay-journeys-timeline', propertyId], exact: false, refetchType: 'active' })
      toast.success('Estadía extendida en otra habitación')
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'No se pudo extender en otra habitación')
    },
  })
}

/** Mid-stay room move for IN_HOUSE guests. Routes to stay-journeys endpoint which
 *  creates a ROOM_MOVE segment preserving the StayJourney audit trail. */
export function useSplitMidStay(propertyId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({
      journeyId,
      newRoomId,
      effectiveDate,
      actorId,
    }: {
      journeyId: string
      newRoomId: string
      effectiveDate: Date
      actorId: string
    }) =>
      api.post(`/v1/stay-journeys/${journeyId}/room-move`, {
        newRoomId,
        effectiveDate: effectiveDate.toISOString(),
      }),
    // 2026-05-19 — Bug fix: el segmento ROOM_MOVE no aparecía en el calendar
    // hasta refresh. Falta clave `stay-journeys-timeline` (donde viven los
    // segments) + invalidateQueries refetchType:'active' no garantiza fetch
    // (CLAUDE.md §3). Pattern alineado con useExtendStay / useMoveExtensionRoom.
    onSuccess: async () => {
      await qc.refetchQueries({
        queryKey: ['stay-journeys-timeline', propertyId],
        exact: false,
      })
      await qc.refetchQueries({
        queryKey: ['guest-stays', propertyId],
        exact: false,
      })
      qc.invalidateQueries({ queryKey: ['rooms', propertyId], exact: false })
      qc.invalidateQueries({ queryKey: ['guest-stay-timeline'], exact: false })
      toast.success('Habitación cambiada')
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'No se pudo cambiar la habitación')
    },
  })
}

/** Reassign an existing EXTENSION_SAME_ROOM / EXTENSION_NEW_ROOM segment to a different room.
 *  No effectiveDate needed — the extension dates are already fixed.
 *  Invalidates stay-journeys-timeline so the dragged block re-renders in its new row. */
export function useMoveExtensionRoom(propertyId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ segmentId, newRoomId }: { segmentId: string; newRoomId: string }) =>
      guestStaysApi.moveExtensionRoom(segmentId, newRoomId),
    // 2026-05-19 — refetch (no invalidate) + add guest-stay-timeline para que
    // el Historial muestre cada re-asignación sin staleness.
    onSuccess: async () => {
      await qc.refetchQueries({ queryKey: ['stay-journeys-timeline', propertyId], exact: false })
      await qc.refetchQueries({ queryKey: ['guest-stays', propertyId], exact: false })
      qc.invalidateQueries({ queryKey: ['guest-stay-timeline'], exact: false })
      toast.success('Extensión movida a la nueva habitación')
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'No se pudo mover la extensión')
    },
  })
}

/**
 * Cancela un segmento FUTURO (extensión) de un journey activo. El guest sigue
 * checked-in en su segmento actual; solo se revoca la prolongación planeada.
 * Distinto de cancelStay (requiere no-checkin) y de earlyCheckout (sale HOY).
 * Justificación + comparación cross-PMS: ver service.cancelFutureSegment().
 */
export function useCancelExtensionSegment(propertyId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ segmentId, reason }: { segmentId: string; reason?: string }) =>
      guestStaysApi.cancelExtensionSegment(segmentId, reason),
    onSuccess: async () => {
      // Pattern §useCheckout fix: await refetch para garantizar UI fresca
      // ANTES de cerrar el dialog.
      await qc.refetchQueries({
        queryKey: ['stay-journeys-timeline', propertyId],
        exact: false,
        type: 'active',
      })
      await qc.refetchQueries({
        queryKey: ['guest-stays', propertyId],
        exact: false,
        type: 'active',
      })
      qc.invalidateQueries({ queryKey: ['rooms', propertyId], exact: false })
      // El backend incluye extension cancellations en listCancelled +
      // countCancelledToday — invalidar ambos para que el badge y el drawer
      // reflejen la nueva cancelación inmediatamente.
      await qc.refetchQueries({ queryKey: ['cancelled-today-count', propertyId], exact: false })
      await qc.refetchQueries({ queryKey: ['cancelled-stays', propertyId], exact: false })
      toast.success('Extensión cancelada — fecha de salida revertida')
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'No se pudo cancelar la extensión')
    },
  })
}

/**
 * Confirma físicamente que el guest cambió de habitación (recepción entregó
 * nueva llave). Acción 1-click el día del move. Triggera HK task READY para
 * el cuarto previo. Sprint MOVE-CONFIRM 2026-05-18.
 */
export function useConfirmSegmentMove(propertyId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ segmentId }: { segmentId: string }) =>
      guestStaysApi.confirmSegmentMove(segmentId),
    onSuccess: async () => {
      // Refetch journey timeline para que el segmento muestre el nuevo estado
      // (moveConfirmedAt) y desaparezca la acción "Confirmar mudanza".
      await qc.refetchQueries({
        queryKey: ['stay-journeys-timeline', propertyId],
        exact: false,
        type: 'active',
      })
      // Rooms invalidate — HK task READY puede cambiar la animación del cuarto
      qc.invalidateQueries({ queryKey: ['rooms', propertyId], exact: false })
      qc.invalidateQueries({ queryKey: ['room-readiness', propertyId], exact: false })
      toast.success('Mudanza confirmada — limpieza disponible para la habitación previa')
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'No se pudo confirmar la mudanza')
    },
  })
}

/** Split N-way: reemplaza los segmentos ACTIVE del journey con N tramos nuevos.
 *  Soporta ARRIVING (toda la reserva en N cuartos) e IN_HOUSE (primer tramo
 *  = cuarto actual hasta hoy, resto en otros cuartos). Invalida ambos caches
 *  para que los bloques aparezcan inmediatamente. */
export function useSplitReservation(propertyId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({
      journeyId,
      parts,
    }: {
      journeyId: string
      parts: Array<{ roomId: string; checkIn: Date; checkOut: Date }>
    }) => guestStaysApi.splitReservation(journeyId, parts),
    // 2026-05-19 — await refetchQueries (CLAUDE.md §3) — invalidate refetchType:'active'
    // no garantiza re-render del calendar; los nuevos segments quedaban invisibles.
    onSuccess: async (_data, vars) => {
      await qc.refetchQueries({
        queryKey: ['stay-journeys-timeline', propertyId],
        exact: false,
      })
      await qc.refetchQueries({
        queryKey: ['guest-stays', propertyId],
        exact: false,
      })
      qc.invalidateQueries({ queryKey: ['rooms', propertyId], exact: false })
      toast.success(`Reserva dividida en ${vars.parts.length} habitaciones`)
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'No se pudo dividir la reserva')
    },
  })
}

export function useConfirmCheckin(propertyId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({
      stayId,
      data,
    }: {
      stayId: string
      data: Parameters<typeof guestStaysApi.confirmCheckin>[1]
    }) => guestStaysApi.confirmCheckin(stayId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guest-stays', propertyId], exact: false, refetchType: 'active' })
      qc.invalidateQueries({ queryKey: ['stay-journeys-timeline', propertyId], exact: false, refetchType: 'active' })
      toast.success('Check-in confirmado — el huésped está en casa')
    },
    onError: (err: Error) => {
      // Sprint CHECK-IN-α §110 — códigos machine-readable. Idempotency
      // (otra sesión confirmó este check-in) NO es un error duro: refrescamos
      // y mostramos info, no toast.error rojo.
      const code = err instanceof ApiError ? err.code : undefined
      if (code === 'CHECKIN_ALREADY_CONFIRMED') {
        toast('Este check-in ya fue confirmado por otra sesión', { icon: 'ℹ️' })
        qc.invalidateQueries({ queryKey: ['guest-stays', propertyId], exact: false, refetchType: 'active' })
        qc.invalidateQueries({ queryKey: ['stay-journeys-timeline', propertyId], exact: false, refetchType: 'active' })
        return
      }
      toast.error(err.message ?? 'No se pudo confirmar el check-in')
    },
  })
}

export function useLogContact(stayId: string) {
  return useMutation({
    mutationFn: ({
      channel,
      messagePreview,
    }: {
      channel: 'WHATSAPP' | 'EMAIL' | 'PHONE'
      messagePreview?: string
    }) =>
      api.post(`/v1/guest-stays/${stayId}/contact-log`, { channel, messagePreview }),
  })
}

export function useChargeNoShow(stayId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post(`/v1/payments/guest-stays/${stayId}/charge-noshow`, {}),
    onSuccess: () => {
      toast.success('Cargo procesado')
      qc.invalidateQueries({ queryKey: ['guest-stays'], refetchType: 'active' })
    },
    onError: (err: ApiError) => {
      toast.error(err.message ?? 'No se pudo procesar el cargo')
    },
  })
}

export function useWaiveNoShow(stayId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (reason: string) =>
      api.post(`/v1/payments/guest-stays/${stayId}/waive-noshow`, { reason }),
    onSuccess: () => {
      toast.success('Cargo perdonado')
      qc.invalidateQueries({ queryKey: ['guest-stays'], refetchType: 'active' })
    },
    onError: (err: ApiError) => {
      toast.error(err.message ?? 'No se pudo perdonar el cargo')
    },
  })
}

export function useRoomReadinessTasks(propertyId: string) {
  return useQuery({
    queryKey: ['room-readiness', propertyId],
    queryFn: () =>
      api.get<Record<string, unknown>[]>(
        `/v1/room-readiness?propertyId=${propertyId}`,
      ),
    staleTime: 15_000,
    enabled: !!propertyId,
  })
}

// ─── Sprint EDIT-RESERVATION — update + notes ────────────────────────────

/**
 * PATCH guest stay con guards per-phase server-side. Invalida calendar +
 * detail caches al success. Surface code machine-readable para que la UI
 * muestre feedback informativo (Apple HIG: explain what happened).
 */
export function useUpdateGuestStay(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      stayId,
      patch,
    }: {
      stayId: string
      patch: Parameters<typeof guestStaysApi.updateStay>[1]
    }) => guestStaysApi.updateStay(stayId, patch),
    onSuccess: (result, vars) => {
      // Si server short-circuiteó (sin cambios reales), evitamos toast ruidoso.
      if (!result.changed) return
      qc.invalidateQueries({ queryKey: ['guest-stays', propertyId], exact: false, refetchType: 'active' })
      qc.invalidateQueries({ queryKey: ['stay-journeys-timeline', propertyId], exact: false, refetchType: 'active' })
      qc.invalidateQueries({ queryKey: ['checkin-context', vars.stayId], refetchType: 'active' })
      toast.success('Reserva actualizada')
    },
    onError: (err: Error) => {
      // Códigos machine-readable a UX amistoso. Apple HIG: explain why.
      const code = err instanceof ApiError ? err.code : undefined
      const map: Record<string, string> = {
        STAY_CANCELLED:                     'Esta reserva está cancelada — solo notas internas son editables',
        STAY_NOSHOW:                        'Esta reserva está en flujo no-show — campos congelados',
        STAY_CHECKED_OUT_IMMUTABLE_FIELD:   'Reserva ya cerrada — usar nota de crédito para correcciones monetarias',
        RATE_CHANGE_REQUIRES_APPROVAL:      'Cambio post-checkin requiere código + razón del manager',
        CFDI_LOCKED:                        'CFDI emitida — emitir nota de crédito desde el módulo fiscal',
      }
      toast.error(code && map[code] ? map[code] : err.message ?? 'No se pudo actualizar')
    },
  })
}

/** GET lista de notas — refresca via SSE stay.note.created. */
export function useGuestStayNotes(stayId: string | null) {
  return useQuery({
    queryKey: ['guest-stay-notes', stayId],
    queryFn:  () => guestStaysApi.listNotes(stayId!),
    enabled:  !!stayId,
    staleTime: 30_000,
  })
}

export function useCreateGuestStayNote(stayId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof guestStaysApi.createNote>[1]) =>
      guestStaysApi.createNote(stayId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guest-stay-notes', stayId], refetchType: 'active' })
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'No se pudo guardar la nota')
    },
  })
}

/**
 * Sprint EDIT-RESERVATION iter 4 — hook para el contexto del stay
 * reutilizado por BookingDetailSheet (Pago tab necesita propertyCurrency +
 * secondaryRates + paymentModel). Comparte queryKey con el del check-in
 * dialog para que el cache se aproveche.
 */
export function useStayContext(stayId: string | null) {
  return useQuery({
    queryKey: ['checkin-context', stayId],
    queryFn:  () => guestStaysApi.getCheckinContext(stayId!),
    enabled:  !!stayId,
    staleTime: 30_000,
  })
}

/** Lista PaymentLogs de una reserva. */
export function useStayPayments(stayId: string | null) {
  return useQuery({
    queryKey: ['stay-payments', stayId],
    queryFn:  () => guestStaysApi.listPayments(stayId!),
    enabled:  !!stayId,
    staleTime: 15_000,
  })
}

/** Registra un pago adicional sobre la stay. */
export function useRegisterPayment(stayId: string, propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof guestStaysApi.registerPayment>[1]) =>
      guestStaysApi.registerPayment(stayId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stay-payments', stayId], refetchType: 'active' })
      qc.invalidateQueries({ queryKey: ['guest-stays', propertyId], exact: false, refetchType: 'active' })
      qc.invalidateQueries({ queryKey: ['stay-journeys-timeline', propertyId], exact: false, refetchType: 'active' })
      qc.invalidateQueries({ queryKey: ['checkin-context', stayId], refetchType: 'active' })
      toast.success('Pago registrado')
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'No se pudo registrar el pago')
    },
  })
}

/** Anula un PaymentLog (crea entrada negativa append-only). */
export function useVoidPayment(stayId: string, propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ paymentLogId, voidReason }: { paymentLogId: string; voidReason: string }) =>
      guestStaysApi.voidPayment(paymentLogId, voidReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stay-payments', stayId], refetchType: 'active' })
      qc.invalidateQueries({ queryKey: ['guest-stays', propertyId], exact: false, refetchType: 'active' })
      qc.invalidateQueries({ queryKey: ['stay-journeys-timeline', propertyId], exact: false, refetchType: 'active' })
      toast.success('Pago anulado — entrada negativa registrada')
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'No se pudo anular el pago')
    },
  })
}

export function useEditGuestStayNote(stayId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ noteId, content }: { noteId: string; content: string }) =>
      guestStaysApi.editNote(noteId, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guest-stay-notes', stayId], refetchType: 'active' })
    },
    onError: (err: Error) => {
      const code = err instanceof ApiError ? err.code : undefined
      const map: Record<string, string> = {
        NOTE_NOT_OWNER:            'Solo el autor original puede editar la nota',
        NOTE_EDIT_WINDOW_EXPIRED:  'Ventana de edición expirada (5 min). Agrega una nueva nota corrigiendo.',
      }
      toast.error(code && map[code] ? map[code] : err.message ?? 'No se pudo editar')
    },
  })
}
