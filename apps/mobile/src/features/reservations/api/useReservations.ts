/**
 * useReservations — list + filter hook.
 *
 * Sprint 8I: returns mock data when EXPO_PUBLIC_USE_MOCKS=true.
 * Sprint 9: replace `dataSource` with a useQuery against
 *   `GET /v1/guest-stays/mobile/list?from=&to=&search=`
 *
 * Filter logic runs client-side over the mock array. When the API
 * is wired, the same filter shape is sent as query params and the
 * server does the heavy lifting (search via Postgres trgm index).
 *
 * Section grouping for the list UI:
 *   - "Llegan hoy"  — UNCONFIRMED + arrivesToday == true
 *   - "En casa"     — IN_HOUSE
 *   - "Salen hoy"   — DEPARTING + departsToday == true
 *   - "Próximas"    — UPCOMING (next 7 days)
 *   - "No-shows"    — NO_SHOW (visible per CLAUDE.md §34)
 */

import { useMemo } from 'react'
import {
  MOCK_RESERVATIONS_LIST,
  MOCKS_RES_ENABLED,
} from '../__mocks__/mockReservations'
import type { ReservationListItem, ReservationStatus } from '../types'

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

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function matchesDateFilter(item: ReservationListItem, filter: DateFilter): boolean {
  switch (filter) {
    case 'today':
      return item.arrivesToday || item.departsToday || item.status === 'IN_HOUSE' || item.status === 'NO_SHOW'
    case 'tomorrow': {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const checkin = new Date(item.checkinAt)
      return isSameLocalDay(checkin, tomorrow)
    }
    case 'dayAfter': {
      const dayAfter = new Date()
      dayAfter.setDate(dayAfter.getDate() + 2)
      const checkin = new Date(item.checkinAt)
      return isSameLocalDay(checkin, dayAfter)
    }
    case 'all':
    default:
      return true
  }
}

function matchesStatusFilter(item: ReservationListItem, filter?: ReservationStatus[]): boolean {
  if (!filter || filter.length === 0) return true
  return filter.includes(item.status)
}

function matchesSearch(item: ReservationListItem, q: string): boolean {
  if (!q.trim()) return true
  const needle = q.trim().toLowerCase()
  return (
    item.guestName.toLowerCase().includes(needle) ||
    (item.roomNumber ?? '').toLowerCase().includes(needle) ||
    item.id.toLowerCase().includes(needle)
  )
}

export function useReservations(query: ReservationsQuery): {
  isLoading: boolean
  isError: boolean
  total: number
  sections: ReservationSection[]
} {
  // For Sprint 8I we synchronously use the mocks. Sprint 9 swaps for useQuery.
  const dataSource = MOCKS_RES_ENABLED ? MOCK_RESERVATIONS_LIST : []

  const filtered = useMemo(
    () =>
      dataSource.filter(
        (item) =>
          matchesSearch(item, query.search) &&
          matchesDateFilter(item, query.dateFilter) &&
          matchesStatusFilter(item, query.statusFilter),
      ),
    [dataSource, query.search, query.dateFilter, query.statusFilter],
  )

  const sections = useMemo<ReservationSection[]>(() => {
    return SECTION_ORDER.map((s) => ({
      key: s.status,
      title: s.title,
      emoji: s.emoji,
      data: filtered.filter((item) => item.status === s.status),
    })).filter((s) => s.data.length > 0)
  }, [filtered])

  return {
    isLoading: false,
    isError: false,
    total: filtered.length,
    sections,
  }
}

/**
 * Single-reservation lookup for the detail screen.
 * Sprint 9: useQuery against `GET /v1/guest-stays/mobile/:id`.
 */
export function useReservationDetail(id: string | undefined) {
  const dataSource = MOCKS_RES_ENABLED
    ? // Lazy import via require to avoid circular deps
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      (require('../__mocks__/mockReservations') as typeof import('../__mocks__/mockReservations')).MOCK_RESERVATIONS_BY_ID
    : ({} as Record<string, never>)

  if (!id) return { isLoading: false, isError: false, data: null }

  const data = dataSource[id] ?? null
  return {
    isLoading: false,
    isError: false,
    data,
  }
}
