import { useMemo, useState } from 'react'
import { isBefore, startOfDay, isToday } from 'date-fns'
import { cn } from '@/lib/utils'
import { TIMELINE } from '../../utils/timeline.constants'
import type { FlatRow, VirtualColumn } from '../../types/timeline.types'

interface TimelineGridProps {
  virtualColumns: VirtualColumn[]
  totalWidth: number
  dayWidth: number
  flatRows: FlatRow[]
  dragTargetRoomId?: string | null
  dragIsValid?: boolean
  onCellClick?: (roomId: string, date: Date) => void
  isOccupied?: (roomId: string, date: Date) => boolean
  /** Returns base rate + currency for a room — used to render ghost block price */
  getRoomRate?: (roomId: string) => { rate: number; currency: string } | undefined
}

export function TimelineGrid({
  virtualColumns,
  totalWidth,
  dayWidth,
  flatRows,
  dragTargetRoomId,
  dragIsValid = true,
  onCellClick,
  isOccupied,
  getRoomRate,
}: TimelineGridProps) {
  const isCompact = dayWidth <= 20

  // Ghost block for empty cells — Apple Calendar / Google Calendar pattern
  // Shows on PM-half hover only (the check-in zone). Never for past days or occupied cells.
  // Color psychology: emerald = availability ("go" signal, Mehrabian-Russell 1974).
  const [hoveredCell, setHoveredCell] = useState<{ roomId: string; date: Date; colStart: number; rowY: number } | null>(null)

  // Precompute cumulative Y offsets and total height
  const { rowYOffsets, totalHeight } = useMemo(() => {
    const offsets: number[] = []
    let y = 0
    flatRows.forEach((row) => {
      offsets.push(y)
      y += row.type === 'group' ? TIMELINE.GROUP_HEADER_HEIGHT : TIMELINE.ROW_HEIGHT
    })
    return { rowYOffsets: offsets, totalHeight: y }
  }, [flatRows])

  // Find today column for the vertical line
  const todayCol = virtualColumns.find((vc) => isToday(vc.date))

  return (
    <div className="relative" style={{ width: totalWidth, height: totalHeight }}>
      {/* Vertical day columns — only render visible (virtualized) */}
      {virtualColumns.map((vc) => {
        const isPast = isBefore(startOfDay(vc.date), startOfDay(new Date()))
        return (
          <div
            key={vc.key}
            className={cn(
              'absolute top-0 border-r border-slate-200/70',
              isPast && 'bg-slate-50/80',
            )}
            style={{
              left: vc.start,
              width: vc.size,
              height: totalHeight,
            }}
          />
        )
      })}

      {/* Horizontal row lines + split-day cells */}
      {flatRows.map((row, i) => {
        const y = rowYOffsets[i]
        const h =
          row.type === 'group' ? TIMELINE.GROUP_HEADER_HEIGHT : TIMELINE.ROW_HEIGHT
        const isDropTarget = row.type === 'room' && dragTargetRoomId === row.id

        return (
          <div
            key={`row-${row.type}-${row.id}`}
            className={cn(
              'absolute left-0 border-b transition-colors duration-100',
              row.type === 'group'
                ? 'border-slate-200 bg-slate-50/80'
                : 'border-slate-200/70',
              isDropTarget && dragIsValid && 'bg-emerald-50/60',
              isDropTarget && !dragIsValid && 'bg-red-50/40',
            )}
            style={{ top: y, width: totalWidth, height: h }}
          >
            {/* Split-day cells for room rows — only render visible columns */}
            {row.type === 'room' &&
              !isCompact &&
              virtualColumns.map((vc) => {
                const isPastDay = isBefore(startOfDay(vc.date), startOfDay(new Date()))
                return (
                  <div
                    key={vc.key}
                    className="absolute top-0"
                    style={{
                      left: vc.start,
                      width: vc.size,
                      height: h,
                    }}
                  >
                    {/* AM half (left) — checkout zone, no interaction */}
                    <div className="absolute inset-y-0 left-0 w-1/2" />
                    {/* PM half (right) — checkin zone: shows ghost block on hover */}
                    {(() => {
                      const cellOccupied = isOccupied?.(row.id, vc.date) ?? false
                      const blocked = isPastDay || cellOccupied
                      const isHovered = hoveredCell?.roomId === row.id &&
                        hoveredCell?.date.getTime() === vc.date.getTime()
                      return (
                        <div
                          className={cn(
                            'absolute inset-y-0 right-0 w-1/2',
                            blocked ? 'cursor-not-allowed' : 'cursor-pointer',
                          )}
                          onMouseEnter={!blocked ? () => setHoveredCell({
                            roomId: row.id, date: vc.date,
                            colStart: vc.start, rowY: y,
                          }) : undefined}
                          onMouseLeave={() => setHoveredCell(null)}
                          onClick={!blocked ? () => {
                            onCellClick?.(row.id, vc.date)
                          } : undefined}
                        />
                      )
                    })()}
                  </div>
                )
              })}
          </div>
        )
      })}

      {/* Today line — thin, subtle */}
      {todayCol && (
        <div
          className="absolute top-0 animate-today pointer-events-none"
          style={{
            left: todayCol.start + todayCol.size / 2,
            width: 1,
            height: totalHeight,
            backgroundColor: 'rgba(16, 185, 129, 0.35)',
            zIndex: 2,
          }}
        />
      )}

      {/* Ghost block — Apple Calendar / Google Calendar empty-cell hover pattern.
          In-grid (not portal): consistent visual language with real booking blocks.
          Emerald = availability signal (Mehrabian-Russell 1974, "go" color semantics).
          Only shown on PM-half (check-in zone) of unoccupied, non-past cells. */}
      {hoveredCell && getRoomRate && !isCompact && (() => {
        const rateInfo = getRoomRate(hoveredCell.roomId)
        if (!rateInfo) return null
        const ghostWidth = (virtualColumns.find(vc => vc.date.getTime() === hoveredCell.date.getTime())?.size ?? dayWidth) - 3
        return (
          <div
            style={{
              position: 'absolute',
              top: hoveredCell.rowY + 2,
              left: hoveredCell.colStart,
              width: Math.max(ghostWidth, dayWidth / 2),
              height: TIMELINE.ROW_HEIGHT - 4,
              backgroundColor: 'rgba(16,185,129,0.10)',
              border: '1.5px dashed rgba(16,185,129,0.5)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(4,120,87,0.8)', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' }}>
              {rateInfo.currency} {rateInfo.rate.toLocaleString()}/n
            </span>
          </div>
        )
      })()}
    </div>
  )
}
