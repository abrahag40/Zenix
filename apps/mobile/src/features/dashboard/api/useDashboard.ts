/**
 * useDashboard / useRevenueSnapshot — mobile-side fetchers for the
 * Sprint 9 dashboard endpoints.
 *
 * Each hook wraps `useApiResource` and exposes a typed result. The
 * dashboard screen calls them at mount; cards render from the returned
 * payload (with mock fallback if MOCKS_DASHBOARD_ENABLED is true and
 * no live data has loaded yet — keeps QA experience smooth).
 *
 * Polling cadence:
 *   - Overview: 60s (operational state changes minute-to-minute)
 *   - Revenue:  120s (financial metrics drift slower; cheaper compute)
 */

import { useEffect } from 'react'
import type {
  DashboardOverviewDto,
  RevenueSnapshotDto,
  SseEventType,
} from '@zenix/shared'
import { useApiResource } from '../../../api/useApiResource'
import { registerSseConsumer } from '../../../api/useGlobalSSEListener'

// Events that materially change the dashboard overview payload.
// On any of these we trigger an immediate refetch (no waiting 60s poll).
const OVERVIEW_TRIGGERS: SseEventType[] = [
  'task:planned', 'task:ready', 'task:done', 'task:verified',
  'task:cancelled', 'task:auto-assigned',
  'block:activated', 'block:expired', 'block:cancelled',
  'stay:no_show', 'stay:no_show_reverted',
  'checkin:confirmed', 'checkout:early',
]

export function useDashboardOverview() {
  const result = useApiResource<DashboardOverviewDto>(
    '/v1/reports/dashboard-overview',
    { pollMs: 60_000 },
  )

  // Subscribe to SSE — refetch immediately on relevant events.
  // Single subscription per hook instance; cleaned up on unmount.
  useEffect(() => {
    return registerSseConsumer(OVERVIEW_TRIGGERS, () => {
      result.refetch().catch(() => undefined)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return result
}

export function useRevenueSnapshot(opts?: { enabled?: boolean }) {
  return useApiResource<RevenueSnapshotDto>('/v1/reports/revenue-snapshot', {
    pollMs: 120_000,
    enabled: opts?.enabled ?? true,
  })
}
