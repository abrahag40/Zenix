import { useQuery } from '@tanstack/react-query'
import { startOfDay } from 'date-fns'
import { api } from '@/api/client'

export interface DailyBar {
  date: string  // YYYY-MM-DD
  bar: number
  currency: string
}

export interface RateQuoteRoomType {
  id: string
  name: string
  code: string
  baseRate: number
  currency: string
  maxOccupancy: number
}

export interface RateQuoteGrid {
  roomTypes: RateQuoteRoomType[]
  dates: string[]
  grid: Record<string, Record<string, number>>  // [roomTypeId][date] = rate
  currency: string
}

export function useDailyBar(propertyId: string, from: Date, to: Date) {
  return useQuery<DailyBar[]>({
    queryKey: [
      'daily-bar',
      propertyId,
      startOfDay(from).toISOString().slice(0, 10),
      startOfDay(to).toISOString().slice(0, 10),
    ],
    queryFn: () =>
      api.get<DailyBar[]>(
        `/v1/rates/daily-bar?propertyId=${propertyId}&from=${from.toISOString()}&to=${to.toISOString()}`,
      ),
    enabled: !!propertyId,
    staleTime: 5 * 60_000,
  })
}

export function useRateQuoteGrid(propertyId: string, from: Date, to: Date, enabled = true) {
  return useQuery<RateQuoteGrid>({
    queryKey: [
      'rate-quote',
      propertyId,
      startOfDay(from).toISOString().slice(0, 10),
      startOfDay(to).toISOString().slice(0, 10),
    ],
    queryFn: () =>
      api.get<RateQuoteGrid>(
        `/v1/rates/quote?propertyId=${propertyId}&from=${from.toISOString()}&to=${to.toISOString()}`,
      ),
    enabled: enabled && !!propertyId,
    staleTime: 60_000,
  })
}
