import { useMemo } from 'react'
import { isToday, differenceInCalendarDays, startOfDay } from 'date-fns'
import { TIMELINE } from '../../utils/timeline.constants'
import { useTodayTick } from '../../hooks/useTodayTick'
import type { FlatRow } from '../../types/timeline.types'

interface TodayColumnHighlightProps {
  days: Date[]
  dayWidth: number
  flatRows: FlatRow[]
  poolStart?: Date
}

export function TodayColumnHighlight({ days, dayWidth, flatRows, poolStart }: TodayColumnHighlightProps) {
  // Re-render at midnight so the highlighted column follows the actual current
  // day. Without this, sessions open across midnight stay stuck on the previous
  // day until reload.
  const today = useTodayTick()
  const totalHeight = useMemo(() => {
    let h = 0
    flatRows.forEach((row) => {
      h += row.type === 'group' ? TIMELINE.GROUP_HEADER_HEIGHT : TIMELINE.ROW_HEIGHT
    })
    return h
  }, [flatRows])

  // When poolStart is provided, compute absolute position from pool start
  const todayLeft = useMemo(() => {
    if (poolStart) {
      const todayDate = new Date(today)
      const idx = differenceInCalendarDays(todayDate, startOfDay(poolStart))
      if (idx < 0) return null
      return idx * dayWidth
    }
    // Fallback: find today in the days array
    const idx = days.findIndex((d) => isToday(d))
    if (idx < 0) return null
    return idx * dayWidth
  }, [days, dayWidth, poolStart, today])

  if (todayLeft === null) return null

  return (
    <div
      className="absolute top-0 pointer-events-none"
      style={{
        left: todayLeft,
        width: dayWidth,
        height: totalHeight,
        backgroundColor: 'rgba(16, 185, 129, 0.06)',
        borderLeft: '1px solid rgba(16, 185, 129, 0.25)',
        borderRight: '1px solid rgba(16, 185, 129, 0.25)',
        zIndex: 1,
      }}
    />
  )
}
