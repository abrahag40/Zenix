import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { differenceInCalendarDays, startOfDay } from 'date-fns'
import { api } from '@/api/client'
import type { GuestStayBlock } from '../types/timeline.types'

type SegmentReason = GuestStayBlock['segmentReason']

interface ApiSegment {
  id: string
  checkIn: string
  checkOut: string
  status: string
  locked: boolean
  reason: SegmentReason
  rateSnapshot: number | null
  room: { id: string; number: string }
}

interface ApiJourney {
  id: string
  guestStayId: string
  guestName: string
  /** ACTIVE | NO_SHOW | CHECKED_OUT — usado para derivar actualCheckout de segments */
  status?: string
  /** Set cuando journey.status === 'CHECKED_OUT' — el moment del checkout real */
  journeyCheckOut?: string
  /** bookingRef + actualCheckin viven en GuestStay (parent) — incluidos via include. */
  guestStay?: { bookingRef?: string | null; actualCheckin?: string | null }
  segments: ApiSegment[]
}

function adaptJourneys(journeys: ApiJourney[]): GuestStayBlock[] {
  const blocks: GuestStayBlock[] = []

  for (const journey of journeys) {
    const activeSegments = journey.segments.filter((s) => s.status !== 'CANCELLED')
    const hasMultiple = activeSegments.length > 1
    // Si el journey ya cerró (CHECKED_OUT) propagar el momento real del
    // checkout a TODOS los segments del journey. Sin esto, getStayStatus()
    // no detecta DEPARTED y el bloque sigue mostrándose como IN_HOUSE
    // con botón checkout activo (issue reportado por usuario en Marco Rossi 301).
    const actualCheckoutDate =
      journey.status === 'CHECKED_OUT' && journey.journeyCheckOut
        ? new Date(journey.journeyCheckOut)
        : undefined

    // ACTUAL CHECK-IN propagation (Sprint 2026-05-17):
    // El check-in es operación única por estadía (verificar doc + capturar
    // pago). Las EXTENSIONES no requieren re-check-in — 5/5 PMS consensus
    // (Mews, Cloudbeds, Opera, Little Hotelier, RoomRaccoon). Sin esta
    // propagación, segmentos de extensión se renderizan como "UNCONFIRMED"
    // y muestran "Confirmar check-in" duplicado (anti-pattern operacional).
    // Para room-change segments, sigue mostrándose el cambio de habitación
    // como indicador visual (sin requerir re-check-in del documento/pago).
    const actualCheckinDate = journey.guestStay?.actualCheckin
      ? new Date(journey.guestStay.actualCheckin)
      : undefined

    // Determine first/last by checkIn/checkOut dates
    const sorted = [...activeSegments].sort(
      (a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime(),
    )
    const firstId = sorted[0]?.id
    const lastId = sorted[sorted.length - 1]?.id

    // The ORIGINAL segment's room number — used to annotate EXT_NEW_ROOM / ROOM_MOVE blocks.
    const originalRoomNumber = sorted[0]?.room.number
    // El ÚLTIMO segmento del journey — alimenta el indicador "movido a → X"
    // sobre cualquier segmento intermedio. Mostramos el destino final (no el
    // inmediato siguiente) porque es lo operativamente útil: el recepcionista
    // que ve un bloque histórico quiere saber dónde está el huésped HOY.
    const lastSegment = sorted[sorted.length - 1]
    const lastSegmentRoomNumber = lastSegment?.room.number
    const lastSegmentCheckIn = lastSegment ? new Date(lastSegment.checkIn) : undefined

    for (let i = 0; i < sorted.length; i++) {
      const seg = sorted[i]
      let checkIn = new Date(seg.checkIn)
      const checkOut = new Date(seg.checkOut)

      // Clip checkIn so this segment never visually overlaps the previous one.
      // Overlap can happen when the backend stores an extension starting 1 day
      // before the preceding segment's checkout (e.g. Apr 13 vs Apr 14).
      if (i > 0) {
        const prevCheckOut = new Date(sorted[i - 1].checkOut)
        if (checkIn < prevCheckOut) checkIn = prevCheckOut
      }

      const nights = Math.max(1, differenceInCalendarDays(checkOut, checkIn))
      const ratePerNight = seg.rateSnapshot ?? 0
      const isNonOriginal =
        seg.reason === 'EXTENSION_NEW_ROOM' || seg.reason === 'ROOM_MOVE'

      blocks.push({
        id: seg.id,
        guestStayId: journey.guestStayId,
        bookingRef: journey.guestStay?.bookingRef ?? undefined,
        roomId: seg.room.id,
        guestName: journey.guestName,
        checkIn,
        checkOut,
        nights,
        ratePerNight,
        paymentStatus: 'PENDING',
        source: 'direct',
        totalAmount: nights * ratePerNight,
        amountPaid: 0,
        currency: 'USD',
        paxCount: 1,
        isLocked: seg.locked,
        journeyId: journey.id,
        segmentId: seg.id,
        segmentReason: seg.reason,
        segmentLocked: seg.locked,
        isFirstSegment: seg.id === firstId,
        isLastSegment: seg.id === lastId,
        hasMultipleSegments: hasMultiple,
        roomNumber: seg.room.number,
        originalRoomNumber: isNonOriginal ? originalRoomNumber : undefined,
        // Para segmentos intermedios: exponer la habitación + fecha del ÚLTIMO
        // segmento del journey (donde el huésped está / estará al cerrar). Solo
        // si el destino final difiere de este segmento — si todos los segmentos
        // están en la misma habitación, no hay "destino" que mostrar.
        nextSegmentRoomNumber:
          seg.id !== lastSegment?.id && lastSegment && lastSegment.room.id !== seg.room.id
            ? lastSegmentRoomNumber
            : undefined,
        nextSegmentCheckIn:
          seg.id !== lastSegment?.id && lastSegment && lastSegment.room.id !== seg.room.id
            ? lastSegmentCheckIn
            : undefined,
        // DEPARTED detection — set solo cuando journey ya cerró
        actualCheckout: actualCheckoutDate,
        // CHECKED-IN propagation — heredado del parent GuestStay para que
        // las extensiones NO muestren "Confirmar check-in" duplicado.
        actualCheckin: actualCheckinDate,
      })
    }
  }

  return blocks
}

export function useStayJourneys(propertyId: string, from: Date, to: Date) {
  const { data, isLoading, error } = useQuery({
    queryKey: [
      'stay-journeys-timeline',
      propertyId,
      startOfDay(from).toISOString(),
      startOfDay(to).toISOString(),
    ],
    queryFn: async () => {
      const raw = await api.get<ApiJourney[]>(
        `/v1/stay-journeys/timeline?propertyId=${propertyId}&from=${from.toISOString()}&to=${to.toISOString()}`,
      )
      return adaptJourneys(raw)
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    enabled: !!propertyId,
    placeholderData: keepPreviousData,
  })

  return { journeyBlocks: data ?? [], isLoading, error }
}
