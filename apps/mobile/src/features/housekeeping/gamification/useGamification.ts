/**
 * Gamification data hooks for the Hub Recamarista.
 *
 * Each hook wraps useApiResource with privacy-respecting endpoints
 * (/v1/me/* — only the calling staff sees their own data).
 *
 * Polling: streak/rings refresh every 60s (so the user sees ring fill
 * after a task completes from another device session).
 */

import { useEffect } from 'react'
import type {
  StaffStreakDto,
  StaffPersonalRecordDto,
  DailyRingsDto,
  SseEventType,
} from '@zenix/shared'
import { useApiResource } from '../../../api/useApiResource'
import { registerSseConsumer } from '../../../api/useGlobalSSEListener'

// Events that move the rings / streak counters.
const GAMIFICATION_TRIGGERS: SseEventType[] = [
  'task:done',
  'task:verified',
]

export function useStaffStreak(opts?: { enabled?: boolean }) {
  const result = useApiResource<StaffStreakDto>('/v1/me/streak', {
    pollMs: 60_000,
    enabled: opts?.enabled ?? true,
  })
  useEffect(() => {
    if (opts?.enabled === false) return
    return registerSseConsumer(GAMIFICATION_TRIGGERS, () => {
      result.refetch().catch(() => undefined)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.enabled])
  return result
}

export function usePersonalRecords(opts?: { enabled?: boolean }) {
  const result = useApiResource<StaffPersonalRecordDto[]>(
    '/v1/me/personal-records',
    { pollMs: 300_000, enabled: opts?.enabled ?? true },
  )
  useEffect(() => {
    if (opts?.enabled === false) return
    // PRs only change on task:done (cleaning duration recorded)
    return registerSseConsumer(['task:done'], () => {
      result.refetch().catch(() => undefined)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.enabled])
  return result
}

export function useDailyRings(opts?: { enabled?: boolean }) {
  const result = useApiResource<DailyRingsDto>('/v1/me/daily-rings', {
    pollMs: 60_000,
    enabled: opts?.enabled ?? true,
  })
  useEffect(() => {
    if (opts?.enabled === false) return
    return registerSseConsumer(GAMIFICATION_TRIGGERS, () => {
      result.refetch().catch(() => undefined)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.enabled])
  return result
}
