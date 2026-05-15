import { useEffect, useState } from 'react'
import { startOfDay } from 'date-fns'

/**
 * useTodayTick — returns the current day-start timestamp and re-renders the
 * caller whenever the local-time day rolls over.
 *
 * Why this exists: the timeline today-column highlight, the today-line and
 * any other "current day" indicator are memoized against `new Date()` at
 * render time. If a session stays open across midnight, those memos never
 * refresh and the visual marker stays stuck on the previous day until the
 * user reloads. Subscribing to this hook forces a re-render at midnight.
 *
 * The implementation schedules a single timeout to the next midnight (+1s
 * safety margin) rather than polling — minimal cost, exact rollover. After
 * each fire it reschedules. A visibilitychange listener also re-syncs when
 * the tab is brought back from sleep (laptops/tabs paused overnight), so we
 * don't miss the rollover that happened while suspended.
 */
export function useTodayTick(): number {
  const [today, setToday] = useState(() => startOfDay(new Date()).getTime())

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const schedule = () => {
      const now = new Date()
      const nextMidnight = startOfDay(new Date(now.getTime() + 86400_000)).getTime()
      const delay = Math.max(1000, nextMidnight - now.getTime() + 1000)
      timeoutId = setTimeout(() => {
        setToday(startOfDay(new Date()).getTime())
        schedule()
      }, delay)
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const current = startOfDay(new Date()).getTime()
        setToday((prev) => (prev !== current ? current : prev))
      }
    }

    schedule()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (timeoutId !== null) clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  return today
}
