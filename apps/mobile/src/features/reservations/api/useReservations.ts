/**
 * useReservations — list + filter hook.
 *
 * Fetches from GET /v1/guest-stays/mobile/list with server-side filtering
 * (search, statusFilter, dateFilter). Falls back to mock data when
 * EXPO_PUBLIC_USE_MOCKS=true and the API returns nothing.
 *
 * Section grouping for the list UI:
 *   - "Llegan hoy"  — UNCONFIRMED + arrivesToday == true
 *   - "En casa"     — IN_HOUSE
 *   - "Salen hoy"   — DEPARTING + departsToday == true
 *   - "Próximas"    — UPCOMING (next 7 days)
 *   - "No-shows"    — NO_SHOW (visible per CLAUDE.md §34)
 */

import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { api } from '../../../api/client'
import {
  MOCK_RESERVATIONS_LIST,
  MOCKS_RES_ENABLED,
} from '../__mocks__/mockReservations'
import type { ReservationListItem, ReservationDetail, ReservationStatus } from '../types'

export type DateFilter = 'today' | 'tomorrow' | 'dayAfter' | 'all'

export interface ReservationsQuery {
  search: string
  dateFilter: DateFilter
  /** Multi-select status filter. Empty array = show all statuses. */
  statusFilter?: ReservationStatus[]
}

export interface ReservationSection {
  key: string
  title: string
  emoji: string
  /** Named `data` (not `items`) because React Native's SectionList
   *  reads `section.data.length` directly — see
   *  VirtualizedSectionList.getItemCount in RN core. */
  data: ReservationListItem[]
}

const SECTION_ORDER: { status: ReservationStatus; title: string; emoji: string }[] = [
  { status: 'UNCONFIRMED', title: 'Llegan hoy',  emoji: '🔴' },
  { status: 'IN_HOUSE',    title: 'En casa',     emoji: '🟢' },
  { status: 'DEPARTING',   title: 'Salen hoy',   emoji: '🟡' },
  { status: 'NO_SHOW',     title: 'No-shows',    emoji: '⚠️' },
  { status: 'UPCOMING',    title: 'Próximas',    emoji: '⚪' },
]

/** Build the query string for the mobile/list endpoint. */
function buildListPath(query: ReservationsQuery): string {
  const params = new URLSearchParams()
  if (query.search?.trim())       params.set('search', query.search.trim())
  if (query.dateFilter !== 'all') params.set('dateFilter', query.dateFilter)
  if (query.statusFilter?.length) {
    for (const s of query.statusFilter) params.append('statusFilter', s)
  }
  const qs = params.toString()
  return `/v1/guest-stays/mobile/list${qs ? `?${qs}` : ''}`
}

export function useReservations(query: ReservationsQuery): {
  isLoading: boolean
  isError: boolean
  total: number
  sections: ReservationSection[]
} {
  const [data, setData] = useState<ReservationListItem[] | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [isError, setError] = useState(false)
  const mountedRef = useRef(true)

  const path = buildListPath(query)

  const fetchList = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const result = await api.get<ReservationListItem[]>(path)
      if (!mountedRef.current) return
      setData(result)
    } catch {
      if (!mountedRef.current) return
      setError(true)
      // Keep stale data on error rather than blanking the screen
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [path])

  useEffect(() => {
    mountedRef.current = true
    fetchList()
    return () => { mountedRef.current = false }
  }, [fetchList])

  // Fall back to mocks when API returned nothing (or hasn't loaded yet)
  const dataSource: ReservationListItem[] =
    data ?? (MOCKS_RES_ENABLED ? MOCK_RESERVATIONS_LIST : [])

  const sections = useMemo<ReservationSection[]>(() => {
    return SECTION_ORDER.map((s) => ({
      key: s.status,
      title: s.title,
      emoji: s.emoji,
      data: dataSource.filter((item) => item.status === s.status),
    })).filter((s) => s.data.length > 0)
  }, [dataSource])

  return {
    isLoading,
    isError,
    total: dataSource.length,
    sections,
  }
}

/**
 * Single-reservation lookup for the detail screen.
 * Fetches from GET /v1/guest-stays/mobile/:id with mock fallback.
 */
export function useReservationDetail(id: string | undefined): {
  isLoading: boolean
  isError: boolean
  data: ReservationDetail | null
} {
  const [data, setData] = useState<ReservationDetail | null>(null)
  const [isLoading, setLoading] = useState(!!id)
  const [isError, setError] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    if (!id) {
      setData(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(false)

    api.get<ReservationDetail>(`/v1/guest-stays/mobile/${id}`)
      .then((result) => {
        if (!mountedRef.current) return
        setData(result)
      })
      .catch(() => {
        if (!mountedRef.current) return
        setError(true)
        // Fall back to mock if available
        if (MOCKS_RES_ENABLED) {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const mocks = require('../__mocks__/mockReservations') as typeof import('../__mocks__/mockReservations')
          setData(mocks.MOCK_RESERVATIONS_BY_ID[id] ?? null)
        }
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false)
      })

    return () => { mountedRef.current = false }
  }, [id])

  return { isLoading, isError, data }
}
