import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'

/** Una fila de MetricsDailySnapshot (Fase 2 RATES-METRICS). */
export interface MetricsSnapshot {
  date: string
  totalRoomsAvailable: number
  roomsSold: number
  occupancyPercent: string
  roomRevenue: string
  baseCurrency: string
  adr: string
  revpar: string
  cancellationsCount: number
  noShowsCount: number
  arrivalsCount: number
  departuresCount: number
  avgLengthOfStay: string | null
  avgLeadTime: string | null
  channelMix: Record<string, number>
  revenueByRoomType: Record<string, { rooms: number; revenue: number }> | null
}

/**
 * Snapshots de métricas en un rango. SUPERVISOR-only del lado backend → si el
 * usuario no es supervisor, el endpoint responde 403 y la query queda en error
 * (el componente no renderiza). `enabled` permite gatear por rol desde el caller.
 */
export function useMetricsRange(propertyId: string, from: Date, to: Date, enabled = true) {
  return useQuery<MetricsSnapshot[]>({
    queryKey: ['metrics-range', propertyId, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)],
    queryFn: () =>
      api.get<MetricsSnapshot[]>(
        `/v1/metrics/range?propertyId=${propertyId}&from=${from.toISOString()}&to=${to.toISOString()}`,
      ),
    enabled: enabled && !!propertyId,
    staleTime: 5 * 60_000,
    retry: false, // 403 (no supervisor) no debe reintentar
  })
}

/** Pickup (D-METRICS3): delta de on-the-books entre asOf y asOf−daysAgo por noche futura. */
export interface PickupRow {
  stayDate: string
  roomsOnBooks: number
  roomsPickup: number
  revenue: number
  revenuePickup: number
  occupancyPercent: number
  adr: number
  baseCurrency: string
}
export interface PickupResponse {
  asOfDate: string
  comparedTo: string
  daysAgo: number
  series: PickupRow[]
}
export function usePickup(propertyId: string, daysAgo: number, horizonDays = 14, enabled = true) {
  return useQuery<PickupResponse>({
    queryKey: ['metrics-pickup', propertyId, daysAgo, horizonDays],
    queryFn: () =>
      api.get<PickupResponse>(
        `/v1/metrics/pickup?propertyId=${propertyId}&daysAgo=${daysAgo}&horizonDays=${horizonDays}`,
      ),
    enabled: enabled && !!propertyId,
    staleTime: 5 * 60_000,
    retry: false,
  })
}

/** Pace YoY (D-METRICS3): on-the-books AS-OF hoy vs same-time-last-year. */
export interface PaceRow {
  stayDate: string
  roomsOnBooks: number
  stlyRoomsOnBooks: number | null
  occupancyPercent: number
  stlyOccupancyPercent: number | null
  baseCurrency: string
}
export interface PaceResponse {
  asOfDate: string
  stlyAsOfDate: string
  series: PaceRow[]
}
export function usePace(propertyId: string, horizonDays = 30, enabled = true) {
  return useQuery<PaceResponse>({
    queryKey: ['metrics-pace', propertyId, horizonDays],
    queryFn: () =>
      api.get<PaceResponse>(`/v1/metrics/pace?propertyId=${propertyId}&horizonDays=${horizonDays}`),
    enabled: enabled && !!propertyId,
    staleTime: 5 * 60_000,
    retry: false,
  })
}
