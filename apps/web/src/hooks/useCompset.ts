import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'

export interface CompetitorDto {
  id: string
  propertyId: string
  name: string
  externalId: string | null
  externalSource: string | null
  externalUrl: string | null
  latitude: number
  longitude: number
  address: string | null
  starRating: string | null
  guestRating: string | null
  reviewCount: number | null
  roomCount: number | null
  isActive: boolean
  createdAt: string
}

export interface CompsetCompetitorCard {
  id: string
  name: string
  starRating: number | null
  guestRating: number | null
  roomCount: number | null
  latestScrapeAt: string | null
  source: string | null
  ratesByDate: Record<string, { lowestRate: number | null; currency: string; availability: boolean } | null>
  warnings: string[]
}
export interface CompsetDashboardCard {
  propertyId: string
  competitors: CompsetCompetitorCard[]
  latestSnapshotAt: string | null
  horizonDays: number
  disclaimer: string
}
export interface HotelSearchResult {
  externalId: string
  externalSource: string
  externalUrl: string | null
  name: string
  address: string | null
  latitude: number
  longitude: number
  starRating: number | null
  roomCount: number | null
}

export interface LocalEventDto {
  id: string
  name: string
  description: string | null
  category: string
  startDate: string
  endDate: string
  demandImpact: string
  expectedAttendance: number | null
  source: string
  sourceUrl: string | null
  overridden: boolean
}

export function useCompetitors(propertyId: string, enabled = true) {
  return useQuery<CompetitorDto[]>({
    queryKey: ['compset', 'competitors', propertyId],
    queryFn: () => api.get(`/v1/properties/${propertyId}/compset/competitors`),
    enabled: enabled && !!propertyId,
    retry: false,
  })
}

export function useAddCompetitor(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<CompetitorDto, 'id' | 'propertyId' | 'isActive' | 'createdAt' | 'starRating' | 'guestRating'> & { starRating?: number; guestRating?: number }) =>
      api.post(`/v1/properties/${propertyId}/compset/competitors`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compset', 'competitors', propertyId] }),
  })
}

export function useDeactivateCompetitor(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (competitorId: string) =>
      api.delete(`/v1/properties/${propertyId}/compset/competitors/${competitorId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compset', 'competitors', propertyId] }),
  })
}

export function useSearchHotel(propertyId: string, q: string, enabled: boolean) {
  return useQuery<HotelSearchResult[]>({
    queryKey: ['compset', 'search', propertyId, q],
    queryFn: () => api.get(`/v1/properties/${propertyId}/compset/competitors/search?q=${encodeURIComponent(q)}`),
    enabled: enabled && !!propertyId && q.length >= 2,
    retry: false,
    staleTime: 60_000,
  })
}

export function useRefreshCompset(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<{ ok: number; failed: number }>(`/v1/properties/${propertyId}/compset/refresh`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compset', 'dashboard', propertyId] })
      qc.invalidateQueries({ queryKey: ['compset', 'competitors', propertyId] })
    },
  })
}

export function useCompsetDashboard(propertyId: string, enabled = true) {
  return useQuery<CompsetDashboardCard>({
    queryKey: ['compset', 'dashboard', propertyId],
    queryFn: () => api.get(`/v1/properties/${propertyId}/compset/dashboard`),
    enabled: enabled && !!propertyId,
    retry: false,
    staleTime: 5 * 60_000,
  })
}

export function useLocalEvents(propertyId: string, from: Date, to: Date, enabled = true) {
  return useQuery<{ property: unknown; events: LocalEventDto[] }>({
    queryKey: ['local-events', propertyId, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)],
    queryFn: () =>
      api.get(`/v1/properties/${propertyId}/local-events?from=${from.toISOString()}&to=${to.toISOString()}`),
    enabled: enabled && !!propertyId,
    retry: false,
    staleTime: 5 * 60_000,
  })
}
