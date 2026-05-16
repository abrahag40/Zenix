import { useMemo, useState, useCallback } from 'react'
import { isBefore, startOfDay, isToday } from 'date-fns'
import { cn } from '@/lib/utils'
import { TIMELINE } from '../../utils/timeline.constants'
import { useTodayTick } from '../../hooks/useTodayTick'
import type { FlatRow, VirtualColumn } from '../../types/timeline.types'

interface TimelineGridProps {
  virtualColumns: VirtualColumn[]
  totalWidth: number
  dayWidth: number
  flatRows: FlatRow[]
  dragTargetRoomId?: string | null
  dragIsValid?: boolean
  /** Suppress ghost block while a drag or resize gesture is in progress */
  isDragging?: boolean
  onCellClick?: (roomId: string, date: Date) => void
  /** Right-click on any cell (occupied or not) — used to open BlockModal */
  onCellContextMenu?: (roomId: string, date: Date) => void
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
  isDragging = false,
  onCellClick,
  onCellContextMenu,
  isOccupied,
  getRoomRate,
}: TimelineGridProps) {
  const isCompact = dayWidth <= 20

  // Ghost block for empty cells — Apple Calendar / Google Calendar pattern.
  // Suppressed during drag/resize: isDragging guard prevents conflict with those gestures.
  const [hoveredCell, setHoveredCell] = useState<{
    roomId: string
    date: Date
    colStart: number
    rowY: number
    colWidth: number
  } | null>(null)

  const clearHover = useCallback(() => setHoveredCell(null), [])

  // Precompute cumulative Y offsets and total height
  const { rowYOffsets, totalHeight } = useMemo(() => {
    const offsets: number[] = []
    let y = 0
    flatRows.forEach((row) => {
      offsets.push(y)
      y += row.type === 'group' ? TIMELINE.GROUP_HEADER_HEIGHT : TIMELINE.ROW_HEIGHT
    })
    return { rowYOffsets: offsets, totalHeight: y + 16 }
  }, [flatRows])

  // Subscribe to midnight rollover so `todayCol` and `isPast` checks below
  // refresh automatically — sin esto, una sesión abierta cruzando medianoche
  // mantiene el sombreado del día anterior hasta hacer reload.
  useTodayTick()

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
                    onContextMenu={(e) => {
                      if (!isPastDay) {
                        e.preventDefault()
                        onCellContextMenu?.(row.id, vc.date)
                      }
                    }}
                  >
                    {/* AM half (left) — checkout zone, no interaction */}
                    <div className="absolute inset-y-0 left-0 w-1/2" />
                    {/* PM half (right) — checkin zone: shows ghost block on hover */}
                    {(() => {
                      const cellOccupied = isOccupied?.(row.id, vc.date) ?? false
                      const blocked = isPastDay || cellOccupied || isDragging
                      return (
                        <div
                          className={cn(
                            'absolute inset-y-0 right-0 w-1/2',
                            // Cuando la celda está bajo un bloque de huésped o
                            // bloqueada por otra razón no cambiamos el cursor —
                            // permanece el default. El click ya está deshabilitado
                            // vía `onClick={!blocked ? … : undefined}`, así que
                            // "prohibido" sólo añade ruido visual (NN/g H8 minimalist).
                            isDragging || blocked ? '' : 'cursor-pointer',
                          )}
                          onMouseEnter={!blocked ? () => setHoveredCell({
                            roomId: row.id,
                            date: vc.date,
                            colStart: vc.start,
                            rowY: y,
                            colWidth: vc.size,
                          }) : clearHover}
                          onMouseLeave={clearHover}
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

      {/* Ghost block — empty-cell hover pattern (Apple Calendar/Google Calendar).
          Sprint Rates 2026-05-16: rediseño basado en research industria.
          PRIORIDAD VISUAL: rate > label. Cuando narrow, rate gana toda la celda;
          cuando wide, "+" + rate. "Nueva reserva" solo en celdas muy anchas (≥120px).
          Resuelve el bug "USD 2…" truncado (rate quedaba sin espacio). */}
      {!isDragging && hoveredCell && getRoomRate && !isCompact && (() => {
        const rateInfo = getRoomRate(hoveredCell.roomId)
        if (!rateInfo) return null
        const colW = hoveredCell.colWidth
        const blockW = Math.max(colW - 2, dayWidth / 2)
        const showLabel = blockW >= 120
        const showPlus = blockW >= 60
        // Format compacto: $1,450 en vez de "USD 1,450" cuando narrow
        const formattedRate = rateInfo.rate >= 1000
          ? `$${(rateInfo.rate / 1000).toFixed(rateInfo.rate >= 10000 ? 0 : 1)}k`
          : `$${rateInfo.rate.toLocaleString()}`
        const fullRate = `${rateInfo.currency} ${rateInfo.rate.toLocaleString()}`
        const useCompact = blockW < 70

        return (
          <div
            style={{
              position: 'absolute',
              top: hoveredCell.rowY + 3,
              left: hoveredCell.colStart,
              width: blockW,
              height: TIMELINE.ROW_HEIGHT - 6,
              background: 'rgba(16,185,129,0.10)',
              borderLeft: '3px solid rgba(16,185,129,0.55)',
              borderRadius: '0 5px 5px 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: showLabel ? 'space-between' : 'center',
              paddingLeft: showLabel ? 6 : 4,
              paddingRight: showLabel ? 5 : 4,
              pointerEvents: 'none',
              zIndex: 5,
              overflow: 'hidden',
              gap: 4,
            }}
          >
            {/* Left section: "+" + opcional label cuando hay espacio */}
            {showLabel && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'rgba(4,120,87,0.82)',
                  letterSpacing: '-0.015em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  lineHeight: 1,
                  flexShrink: 1,
                  minWidth: 0,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, flexShrink: 0 }}>+</span>
                <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Nueva reserva
                </span>
              </span>
            )}

            {/* Solo "+" cuando es mediana (sin label) */}
            {!showLabel && showPlus && (
              <span style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'rgba(4,120,87,0.6)',
                lineHeight: 1,
                flexShrink: 0,
              }}>+</span>
            )}

            {/* Rate — sin badge bg cuando narrow, con badge cuando wide */}
            <span
              style={{
                fontSize: useCompact ? 10 : 11,
                fontWeight: 700,
                color: 'rgba(4,120,87,0.92)',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
                letterSpacing: '-0.02em',
                lineHeight: 1,
                background: showLabel ? 'rgba(16,185,129,0.14)' : 'transparent',
                borderRadius: 4,
                padding: showLabel ? '2px 4px' : '0',
                flexShrink: 0,
              }}
              title={fullRate}
            >
              {useCompact ? formattedRate : fullRate}
            </span>
          </div>
        )
      })()}
    </div>
  )
}
