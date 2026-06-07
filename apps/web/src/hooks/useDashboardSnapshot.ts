import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'

export interface DashboardStaff {
  id: string
  name: string
  role: string
}
export interface DashboardEvent {
  stayId: string
  guestName: string
  roomNumber: string | null
  scheduledIso: string
}
export interface PulseDay {
  dateIso: string
  occupancyPercent: number
  adr: number
  revpar: number
}
export interface DashboardSnapshot {
  hero: {
    userName: string
    propertyName: string
    propertyCity: string | null
    timezone: string
    nowIso: string
    arrivalsCount: number
    departuresCount: number
    inHouseCount: number
    totalRooms: number
  }
  liveNow: {
    inHouseCount: number
    totalRooms: number
    activeStaff: DashboardStaff[]
    nextArrival: DashboardEvent | null
    nextDeparture: DashboardEvent | null
  }
  actions: {
    arrivals: { count: number; preview: DashboardEvent[] }
    departures: { count: number; preview: DashboardEvent[] }
    housekeeping: { count: number }
    overstayed: { count: number; balance: number }
    unpaidArrivals: { count: number }
  }
  pulse: {
    baseCurrency: string
    days: PulseDay[]
  }
}

export function useDashboardSnapshot() {
  return useQuery<DashboardSnapshot>({
    queryKey: ['dashboard-snapshot'],
    queryFn: () => api.get('/v1/dashboard/snapshot'),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
}
