import { Moon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STAY_STATUS_COLORS, TIMELINE } from '../../utils/timeline.constants'
import type { StayStatusKey } from '../../utils/timeline.constants'
import { getStayStatus } from '../../utils/timeline.utils'
import type { DragState, GuestStayBlock } from '../../types/timeline.types'

interface DragGhostProps {
  dragState: DragState
  stay: GuestStayBlock
  dayWidth: number
}

export function DragGhost({ dragState, stay, dayWidth }: DragGhostProps) {
  const stayStatus = getStayStatus(stay.checkIn, stay.checkOut)
  const colors = STAY_STATUS_COLORS[stayStatus as StayStatusKey]

  const width = dragState.nights * dayWidth - 3

  return (
    <div
      style={{
        position: 'relative',
        width: Math.max(width, dayWidth / 2),
        height: TIMELINE.ROW_HEIGHT - 4,
      }}
    >
      {/* Main ghost block */}
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: dragState.isValid ? colors.bg : '#FEF2F2',
          borderRadius: 6,
          boxShadow: dragState.isValid
            ? `0 8px 25px rgba(0,0,0,0.15), 0 3px 10px rgba(0,0,0,0.1),
               inset 0 1px 0 rgba(255,255,255,0.6)`
            : `0 8px 25px rgba(239,68,68,0.25), 0 3px 10px rgba(239,68,68,0.15),
               inset 0 1px 0 rgba(255,255,255,0.6)`,
          border: dragState.isValid
            ? `1.5px solid ${colors.border}`
            : '1.5px solid rgba(239,68,68,0.6)',
          opacity: dragState.isValid ? 0.92 : 0.6,
          cursor: 'grabbing',
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          gap: 6,
          overflow: 'hidden',
          transform: 'scale(1.02)',
          transformOrigin: 'center left',
        }}
      >
        <span
          className="text-xs font-semibold truncate"
          style={{ color: dragState.isValid ? colors.text : '#DC2626' }}
        >
          {dragState.isValid ? stay.guestName : dragState.conflictReason ?? stay.guestName}
        </span>

        {dragState.isValid && (
          <span
            className="text-[10px] ml-auto flex-shrink-0 opacity-60 font-mono"
            style={{ color: colors.text }}
          >
            <span className="inline-flex items-center gap-0.5">
              <Moon className="h-2.5 w-2.5 opacity-60" />
              {dragState.nights}n
            </span>
          </span>
        )}
      </div>

      {/* Apple HIG no-drop badge — bottom-right corner, above ghost */}
      {!dragState.isValid && (
        <div
          style={{
            position: 'absolute',
            bottom: -4,
            right: -6,
            width: 18,
            height: 18,
            borderRadius: '50%',
            backgroundColor: '#EF4444',
            border: '2px solid white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            lineHeight: 1,
            zIndex: 1,
          }}
          aria-hidden="true"
        >
          🚫
        </div>
      )}
    </div>
  )
}
