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
