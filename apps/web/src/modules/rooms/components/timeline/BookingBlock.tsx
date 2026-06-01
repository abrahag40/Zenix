import { memo, useMemo, useRef } from 'react'
import { startOfDay, addDays, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Lock, Unlock, LogOut, UserX, ArrowUpRight, Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { STAY_STATUS_COLORS, OTA_ACCENT_COLORS, TIMELINE } from '../../utils/timeline.constants'
import type { StayStatusKey } from '../../utils/timeline.constants'
import { stayToRect, getStayStatus } from '../../utils/timeline.utils'
import { groupColor } from '../../utils/groupColor'
import type { GuestStayBlock, GroupSummary } from '../../types/timeline.types'
import { useTooltip } from '../../hooks/useTooltip'
import { TooltipPortal } from './TooltipPortal'

interface BookingBlockProps {
  stay: GuestStayBlock
  rowIndex: number
  calendarStart: Date
  dayWidth: number
  groupHeaderOffsetY: number
  staggerIndex: number
  onDragStart: (stayId: string, clientX: number, clientY: number) => void
  onExtendStart?: (stayId: string, roomId: string, rowIndex: number, groupHeaderOffsetY: number, originalCheckOut: Date, clientX: number) => void
  /** Activa el resaltado del journey completo (cadena de segmentos). Click del
   *  indicador ↗ de un segmento intermedio lo dispara — Opera Cloud / Mews pattern. */
  onActivateJourney?: (journeyId: string) => void
  onClick: () => void
  onCheckout?: (stayId: string) => void
  onNoShow?: (stayId: string) => void
  onStartCheckin?: (stayId: string) => void
  onRevertNoShow?: (stayId: string) => void
  onOpenDetail?: (stayId: string) => void
  isDragging?: boolean
  /** 2026-05-15 — true cuando CUALQUIER bloque del calendario está siendo arrastrado.
   *  Durante drag, suprimimos los tooltips de otros bloques para evitar
   *  ruido visual (el cursor pasa sobre múltiples bloques al mover). */
  anyDragInProgress?: boolean
  isLocked?: boolean
  onToggleLock?: (stayId: string) => void
  scrollLeft?: number
  dimmed?: boolean
  isInActiveJourney?: boolean
  potentialNoShowWarningHour?: number
  noShowCutoffHour?: number
  /** NS block that collides with an active booking — render as thin stripe */
  isNsStripe?: boolean
  /** Active block that has a NS stripe above it — shift down to avoid overlap */
  hasNsAbove?: boolean
  /** CHECK-IN C3.1 (2026-05-30) — hover-highlight de siblings del mismo
   *  ReservationGroup. TimelineScheduler trackea hoveredGroupId y lo
   *  propaga a cada block; cuando matchea, renderizamos ring emerald
   *  visible para indicar "estos pertenecen al mismo grupo". */
  isInHoveredGroup?: boolean
  /** Disparado al hover entrar/salir del block. Solo si reservationGroupId
   *  está seteado — TimelineScheduler hace el guard. */
  onGroupHover?: (groupId: string | null) => void
  /** GROUP-BADGE (2026-06-01) — agregado del grupo (llegadas) para el tooltip. */
  groupSummary?: GroupSummary
}

const BLOCK_SHADOW = [
  'inset 0 1px 0 rgba(255,255,255,0.55)',
  'inset 1px 0 0 rgba(255,255,255,0.35)',
  'inset -1px 0 0 rgba(0,0,0,0.06)',
  'inset 0 -1px 0 rgba(0,0,0,0.08)',
  '0 1px 2px rgba(0,0,0,0.06)',
  '0 2px 4px rgba(0,0,0,0.04)',
].join(', ')

const DRAG_THRESHOLD = 5
const JOURNEY_DOT_COLOR = '#378ADD'

function JourneyDot({ x, y, side }: { x: number; y: number; side: 'left' | 'right' }) {
  const R = 5 // dot radius px
  return (
    <div
      style={{
        position: 'absolute',
        left: x - R,
        top: y - R,
        width: R * 2,
        height: R * 2,
        pointerEvents: 'none',
        zIndex: 28,
      }}
    >
      {/* Expanding ring — SwiftUI-style pulse */}
      <span
        className="journey-pulse-ring"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          backgroundColor: JOURNEY_DOT_COLOR,
          opacity: 0.55,
        }}
      />
      {/* Solid center dot */}
      <span
        style={{
          position: 'absolute',
          inset: 2,
          borderRadius: '50%',
          backgroundColor: JOURNEY_DOT_COLOR,
          boxShadow: '0 0 0 1.5px white',
        }}
      />
    </div>
  )
}

function BookingBlockInner({
  stay,
  rowIndex,
  calendarStart,
  dayWidth,
  groupHeaderOffsetY,
  staggerIndex,
  onDragStart,
  onExtendStart,
  onActivateJourney,
  onClick,
  onCheckout,
  onNoShow,
  onStartCheckin,
  onRevertNoShow,
  onOpenDetail,
  isDragging = false,
  anyDragInProgress = false,
  isLocked = false,
  onToggleLock,
  scrollLeft = 0,
  dimmed = false,
  isInActiveJourney = false,
  potentialNoShowWarningHour,
  noShowCutoffHour,
  isNsStripe = false,
  hasNsAbove = false,
  isInHoveredGroup = false,
  onGroupHover,
  groupSummary,
}: BookingBlockProps) {
  const forceAbove = stay.hasMultipleSegments === true && stay.isLastSegment !== true
  // Tooltip se desactiva cuando hay un drag global en curso para evitar
  // que el cursor pasando sobre otros bloques al mover dispare popovers.
  const { triggerRef, registerTooltipRef, visible, position, hide } = useTooltip({
    forceAbove,
    enabled: !anyDragInProgress,
  })
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null)
  const didDrag = useRef(false)

  const rect = useMemo(
    () =>
      stayToRect({
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        rowIndex,
        calendarStart,
        dayWidth,
        rowHeight: TIMELINE.ROW_HEIGHT,
      }),
    [stay.checkIn, stay.checkOut, rowIndex, calendarStart, dayWidth],
  )

  // How many px the block extends past the left of the viewport
  const textOffset = useMemo(() => {
    const blockLeft = rect.x + 1 // matches the style `left` below
    if (blockLeft < scrollLeft) {
      return scrollLeft - blockLeft
    }
    return 0
  }, [rect.x, scrollLeft])

  // When the block is clipped on the left, the visible portion width
  const visibleWidth = useMemo(() => {
    return textOffset > 0 ? rect.width - textOffset : rect.width
  }, [rect.width, textOffset])

  const auditHour = noShowCutoffHour ?? 2
  const rawStatus = getStayStatus(stay.checkIn, stay.checkOut, stay.actualCheckout, stay.actualCheckin, stay.noShowAt, auditHour)
  // If this segment has a successor (extension or room move), the guest is still in-house
  // even if checkOut = today — show IN_HOUSE (green) rather than DEPARTING (amber).
  const stayStatus = (rawStatus === 'DEPARTING' && stay.hasMultipleSegments && !stay.isLastSegment)
    ? 'IN_HOUSE'
    : rawStatus
  const isDeparting = stayStatus === 'DEPARTING'
  // Confirmed no-show: noShowAt is set
  const isConfirmedNoShow = !!stay.noShowAt
  // Time-aware potential no-show: only after potentialNoShowWarningHour on arrival day,
  // or in the early-AM window before night audit on the following calendar day.
  const warningHour = potentialNoShowWarningHour ?? 20
  const nowHour = new Date().getHours()
  const todayStart = startOfDay(new Date())
  const arrivalDayStart = startOfDay(stay.checkIn)
  const isArrivalCalendarDay = arrivalDayStart.getTime() === todayStart.getTime()
  const isPrevCalendarDay = arrivalDayStart.getTime() === startOfDay(addDays(new Date(), -1)).getTime()
  const isAfterWarningHour =
    (isArrivalCalendarDay && nowHour >= warningHour) ||
    (isPrevCalendarDay && nowHour < auditHour)
  const isPotentialNoShow =
    (stayStatus === 'IN_HOUSE' || stayStatus === 'UNCONFIRMED') &&
    !stay.noShowAt &&
    isAfterWarningHour
  // Sprint AVAIL-OVERSTAY (2026-05-19) — stay zombie: scheduledCheckout ya pasó
  // pero no hay actualCheckout. Tratado como salido por AvailabilityService;
  // visible aquí con badge "Vencido" para que recepción confirme la salida o
  // gestione el folio pendiente.
  const isOverstayed =
    !stay.actualCheckout &&
    !stay.noShowAt &&
    startOfDay(new Date(stay.checkOut)).getTime() < todayStart.getTime()
  const colors = STAY_STATUS_COLORS[stayStatus as StayStatusKey]
  const otaAccent = OTA_ACCENT_COLORS[stay.source] ?? OTA_ACCENT_COLORS.other
  // Journey block flags: segments whose roomId can be reassigned via drag.
  // - ORIGINAL, EXTENSION_SAME_ROOM, EXTENSION_NEW_ROOM, ROOM_MOVE: draggable
  //   cuando NO están locked (locked=past segment, ya consumido).
  // - SPLIT: click-only (representa historia de split, no movable).
  // Bug fix 2026-05-19: ROOM_MOVE current segment debe permitir re-arrastrar
  // — un guest puede cambiar A1→A2→A3 sin que el sistema se ate las manos
  // después del primer move (el backend opera siempre sobre el último
  // segment unlocked vía getActiveSegment).
  const isJourneyBlock = !!stay.segmentReason
  const isMovableSegment =
    !stay.segmentLocked &&
    (stay.segmentReason === 'ORIGINAL' ||
      stay.segmentReason === 'EXTENSION_SAME_ROOM' ||
      stay.segmentReason === 'EXTENSION_NEW_ROOM' ||
      stay.segmentReason === 'ROOM_MOVE')
  const isMovableExtension =
    stay.segmentReason === 'EXTENSION_SAME_ROOM' ||
    stay.segmentReason === 'EXTENSION_NEW_ROOM'
  // useAvatarOnly: cuando el bloque es demasiado angosto para mostrar texto
  // sin truncar a vacío. Pre 2026-05-19 iter 3 sólo se gateaba por `dayWidth ≤ 20`,
  // pero un bloque 1-night con dayWidth=40-50 también se queda sin espacio
  // útil (padding-right reservado para futuros chips + 7px dot) y mostraba
  // sólo un dot perdido. Apple Calendar / Cloudbeds / Mews: cuando no cabe
  // el nombre, mostrar avatar centrado en lugar de dot fantasma.
  const isCompact = dayWidth <= 20
  const useAvatarOnly = isCompact || rect.width < 56
  const showText = rect.width > TIMELINE.MIN_BLOCK_WIDTH
  const showEdgeLabels = !isCompact && rect.width > 80

  // Progressive density helpers
  const nameParts = stay.guestName.split(/\s+/).filter(Boolean)
  const firstName = nameParts[0] ?? ''
  const lastName = nameParts[nameParts.length - 1] ?? ''
  const firstInitial = (firstName[0] ?? '').toUpperCase()
  const lastInitial = (nameParts.length > 1 ? lastName[0] : '').toUpperCase()
  // Avatar de iniciales (Apple Calendar mini-card pattern):
  // 1 nombre → "A"; 2+ nombres → "AR". Lo usamos para bloques compactos
  // (single-night a zoom out) donde no cabe ni el nombre abreviado.
  const initials = (firstInitial + lastInitial) || firstInitial || '?'
  const showDot = rect.width <= 80
  const dotColor = isDeparting
    ? '#BA7517'
    : stay.segmentReason === 'ROOM_MOVE'
    ? '#378ADD'
    : stay.segmentReason === 'SPLIT'
    ? '#378ADD'
    : stay.segmentReason === 'EXTENSION_SAME_ROOM' || stay.segmentReason === 'EXTENSION_NEW_ROOM'
    ? '#378ADD'
    : '#1D9E75'
  // Writing del nombre — Apple HIG progressive disclosure:
  //   rect.width ≤ 30: blank (compact branch usa avatar de iniciales)
  //   30-50: iniciales "AR"
  //   50-80: "Nombre A." (primer nombre + inicial)
  //   >80: nombre completo
  const displayName =
    rect.width <= 50
      ? initials
      : rect.width <= 80
      ? `${firstName} ${lastInitial}.`.trim()
      : stay.guestName

  // Departed stays are read-only — no drag, no lock, no actions
  const isPast = stayStatus === 'DEPARTED'

  // Segment-derived style flags
  const isSegmentLocked = stay.segmentLocked === true
  const lastSegmentBorder =
    stay.hasMultipleSegments && stay.isLastSegment && stay.segmentReason !== 'ORIGINAL'
      ? '2px solid #1D9E75'
      : undefined

  // Journey edge dots — replace the old +mov/+ext text badges.
  // hasPredecessor: this block is a journey continuation (has something before it).
  // hasSuccessor:   this block has at least one following segment in the journey.
  const hasPredecessor = !!stay.segmentReason && stay.segmentReason !== 'ORIGINAL'
  const hasSuccessor   = !!stay.hasMultipleSegments && !stay.isLastSegment

  if (rect.width < 4) return null

  // NS stripe: render only the diagonal stripes + optional "NS" label.
  // No tooltip, no drag — click opens the detail panel directly.
  if (isNsStripe) {
    const nsStayId = stay.guestStayId ?? stay.id
    const firstName = stay.guestName.split(' ')[0]
    return (
      <div
        title={`No-show: ${stay.guestName}`}
        data-stay-id={stay.id}
        onClick={() => { if (onOpenDetail) { onOpenDetail(nsStayId) } else { onClick() } }}
        className="absolute select-none overflow-hidden transition-opacity"
        style={{
          left:   rect.x + 1,
          top:    rect.y + groupHeaderOffsetY + 1,
          width:  rect.width - 3,
          height: 14,
          background: `repeating-linear-gradient(-45deg, rgba(239,68,68,0.28) 0px, rgba(239,68,68,0.28) 2px, rgba(253,232,232,0.60) 2px, rgba(253,232,232,0.60) 10px)`,
          borderRadius: 4,
          zIndex: dimmed ? 1 : 2,
          // Bug 3 fix: NS stripe respeta dimmed para que al seleccionar otra
          // stay (Carlos Ruiz) los NS también se atenúen junto con el resto.
          opacity: dimmed ? 0.15 : 0.92,
          pointerEvents: dimmed ? 'none' : 'auto',
          cursor: 'pointer',
        }}
      >
        {rect.width > 40 && (
          <div className="absolute inset-0 flex items-center gap-1 px-1.5">
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                lineHeight: 1,
                color: '#ffffff',
                backgroundColor: '#DC2626',
                borderRadius: 3,
                padding: '1px 4px',
                flexShrink: 0,
                letterSpacing: '0.03em',
              }}
            >
              NS
            </span>
            {rect.width > 72 && (
              <span
                className="truncate"
                style={{ fontSize: 10, fontWeight: 500, color: '#7F1D1D', lineHeight: 1 }}
              >
                {firstName}
              </span>
            )}
          </div>
        )}
      </div>
    )
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (isLocked) return
    if (e.button !== 0 || e.ctrlKey || e.metaKey) return
    e.preventDefault()
    e.stopPropagation()

    // Past stays, no-shows, locked journey segments (ORIGINAL with extensions), and
    // ROOM_MOVE segments: click-only. EXTENSION segments are draggable — drop on
    // different row → MoveExtensionConfirmDialog.
    if (isPast || isConfirmedNoShow || isSegmentLocked || (isJourneyBlock && !isMovableSegment)) {
      // Read-only blocks still need drag-threshold detection so a "drag then release
      // outside the block" gesture does NOT trigger onClick (which would open the
      // side panel). Cursor moved beyond threshold = user intent was not a click.
      const startX = e.clientX
      const startY = e.clientY
      let movedPastThreshold = false

      function handleMouseMoveReadOnly(ev: MouseEvent) {
        if (movedPastThreshold) return
        if (
          Math.abs(ev.clientX - startX) > DRAG_THRESHOLD ||
          Math.abs(ev.clientY - startY) > DRAG_THRESHOLD
        ) {
          movedPastThreshold = true
          hide()
        }
      }
      function handleMouseUpReadOnly() {
        window.removeEventListener('mousemove', handleMouseMoveReadOnly)
        window.removeEventListener('mouseup', handleMouseUpReadOnly)
        if (!movedPastThreshold) onClick()
      }
      window.addEventListener('mousemove', handleMouseMoveReadOnly)
      window.addEventListener('mouseup', handleMouseUpReadOnly)
      return
    }

    mouseDownPos.current = { x: e.clientX, y: e.clientY }
    didDrag.current = false

    function handleMouseMove(ev: MouseEvent) {
      if (!mouseDownPos.current) return
      const deltaX = Math.abs(ev.clientX - mouseDownPos.current.x)
      const deltaY = Math.abs(ev.clientY - mouseDownPos.current.y)

      if (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD) {
        if (!didDrag.current) {
          didDrag.current = true
          hide()
          onDragStart(stay.id, ev.clientX, ev.clientY)
        }
      }
    }

    function handleMouseUp() {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)

      if (!didDrag.current) {
        onClick()
      }
      mouseDownPos.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // GROUP-BADGE (2026-06-01) — color de identidad por grupo (opción C).
  // El mismo groupId → mismo hue estable; recolorea badge + ring (canal
  // separado del relleno de estado §31). null si la stay no es de grupo.
  // GROUP-BADGE (2026-06-01) — identidad de grupo SOLO por color de ring (no
  // pastilla). La esquina superior derecha está saturada (candado, flecha ↗,
  // indicador vencido, botón OUT); una pastilla "X/Y" ahí tapaba esos controles.
  // El ring de color vive en el borde → distingue grupos sin chocar con nada.
  // El contador/titular del grupo viven en el tooltip + el sheet de detalle.
  const gc = stay.reservationGroupId ? groupColor(stay.reservationGroupId) : null

  return (
    <>
      <div
        ref={triggerRef}
        role="button"
        tabIndex={0}
        onMouseDown={handleMouseDown}
        onMouseEnter={() => {
          if (stay.reservationGroupId && onGroupHover) {
            onGroupHover(stay.reservationGroupId)
          }
        }}
        onMouseLeave={() => {
          if (stay.reservationGroupId && onGroupHover) {
            onGroupHover(null)
          }
        }}
        // Fallback: si el navegador / input no dispara mousedown→mouseup naturalmente
        // (ciertos trackpads, eventos sintéticos, accesibilidad por teclado), el
        // onClick aquí abre el panel igual. handleMouseDown ya stopPropaga, por lo
        // que en flujo normal este onClick NO se dispara — solo en el caso edge.
        onClick={(e) => {
          // Solo si NO hubo drag y NO se manejó por mousedown
          if (didDrag.current) return
          if (mouseDownPos.current === null && !isDragging) {
            // mousedown no se procesó (caso edge) — abrir panel directamente
            e.stopPropagation()
            onClick()
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick()
          }
        }}
        data-stay-id={stay.id}
        data-journey-id={stay.journeyId}
        data-segment-id={stay.segmentId}
        className={cn(
          'absolute select-none overflow-hidden group',
          'transition-all duration-150 ease-out',
          !isDragging && 'hover:shadow-[0_4px_8px_rgba(0,0,0,0.12),0_8px_16px_rgba(0,0,0,0.08)]',
          !isDragging && 'hover:z-10',
          !isDragging && 'active:scale-[0.995] active:shadow-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
          // Inline cleaning state (CLAUDE.md §54-§57). Subtle pre-attentive
          // cues so the receptionist reads cleaning progress without leaving
          // the calendar. CSS keyframes in index.css. Reduce-motion respected.
          stay.cleaningStatus === 'READY'        && 'hk-state-ready',
          stay.cleaningStatus === 'IN_PROGRESS'  && 'hk-state-in-progress',
          stay.cleaningStatus === 'DONE'         && 'hk-state-done-pending',
          stay.cleaningStatus === 'VERIFIED'     && 'hk-state-verified',
        )}
        style={{
          left: rect.x + 1,
          top: isNsStripe
            ? rect.y + groupHeaderOffsetY + 1
            : hasNsAbove
            ? rect.y + groupHeaderOffsetY + 16
            : rect.y + groupHeaderOffsetY + 3,
          width: rect.width - 3,
          height: isNsStripe
            ? 14
            : hasNsAbove
            ? rect.height - 16
            : rect.height - 4,
          background: isConfirmedNoShow
            ? `repeating-linear-gradient(-45deg, rgba(239,68,68,0.13) 0px, rgba(239,68,68,0.13) 2px, transparent 2px, transparent 8px), ${colors.bg}`
            : colors.bg,
          color: isConfirmedNoShow ? '#7F1D1D' : colors.text,
          boxShadow: isConfirmedNoShow
            ? `inset 0 0 0 1.5px rgba(239,68,68,0.50), ${BLOCK_SHADOW}`
            : stay.channexConflict
            // Sprint CHANNEX-INBOUND + Cert audit C6 fix (2026-05-22):
            // Conflict stays con visual MÁS distintivo — doble ring amber
            // dentro + outside, comunica "tentativo, no committed" mucho
            // mejor que single inset. Click → /channex/conflicts.
            ? `inset 0 0 0 2px rgba(217,119,6,0.85), 0 0 0 2px rgba(217,119,6,0.30), ${BLOCK_SHADOW}`
            : isPotentialNoShow
            ? `inset 0 0 0 1.5px rgba(245,158,11,0.70), ${BLOCK_SHADOW}`
            : isInActiveJourney
            ? `0 0 0 2px #378ADD, 0 4px 12px rgba(55,138,221,0.35), ${BLOCK_SHADOW}`
            : isInHoveredGroup && gc
            // CHECK-IN C3.1 + GROUP-BADGE (2026-06-01) — hover-highlight de
            // siblings del mismo ReservationGroup, ahora con el HUE del grupo
            // (no violeta uniforme) para distinguir grupos entre sí.
            ? `0 0 0 2px ${gc.ring(0.90)}, 0 4px 10px ${gc.ring(0.28)}, ${BLOCK_SHADOW}`
            : stay.reservationGroupId && gc
            // Ring persistente con el hue del grupo (sin hover). El color
            // identifica el grupo de un vistazo (Treisman 1980 pre-attentive).
            // En bloques avatar-only (1 noche, ~45px en vista Mes) el badge se
            // oculta → reforzamos el ring (2px/0.65) para que el color siga
            // siendo el ancla de identidad del grupo. Bloques con badge: 1.5px/0.45.
            ? `0 0 0 ${useAvatarOnly ? 2 : 1.5}px ${gc.ring(useAvatarOnly ? 0.65 : 0.45)}, ${BLOCK_SHADOW}`
            : BLOCK_SHADOW,
          // Sprint AVAIL-OVERSTAY: stroke amber animado vive en overlay div
          // .overstay-stroke (ver más abajo). Lo separamos del boxShadow inline
          // porque las animaciones de box-shadow CSS no se interpolan bien con
          // múltiples sombras inline; un overlay dedicado da más control.
          borderRadius: 6,
          pointerEvents: isDragging ? 'none' : 'auto',
          opacity: isNsStripe
            ? 0.90
            : dimmed
            ? 0.15
            : isDragging
            ? 0.3
            : isInActiveJourney
            ? 1
            : isJourneyBlock && (isSegmentLocked || stayStatus === 'DEPARTED')
            // Past segment de un journey (el huésped ya pasó por aquí pero
            // su trayectoria sigue activa en otro segmento). Antes 0.72
            // sugería "departed"; ahora 0.96 indica "history sutil, no muerto".
            // El segmento ACTUAL/FUTURE de un journey queda a 1.0 (cae al
            // último else) para no atenuar a huéspedes in-house.
            ? 0.96
            : stayStatus === 'DEPARTED' || isConfirmedNoShow
            // Stay standalone (no-journey) realmente DEPARTED → 0.72.
            ? 0.72
            : 1,
          filter: isInActiveJourney ? 'brightness(1.06) saturate(1.08)' : undefined,
          cursor: isLocked
            ? 'default'
            : isPast || isConfirmedNoShow || isJourneyBlock || isSegmentLocked
            ? 'pointer'
            : isDragging
            ? 'grabbing'
            : 'grab',
          borderRight: lastSegmentBorder,
          animationFillMode: 'forwards',
          animationDelay: `${staggerIndex * 20}ms`,
          zIndex: isNsStripe ? 2 : dimmed ? 3 : visible ? 20 : 6,
          // Width + left transitions: animan el "estiramiento" del bloque
          // cuando se confirma una extensión (o cuando un early-checkout lo
          // acorta). 360ms con --ease-spring (CLAUDE.md §Animaciones) — entrada
          // SwiftUI: arranque rápido, desacelera al final. Sin transición durante
          // drag para no pelear con el seguimiento del cursor.
          transition: isDragging
            ? 'none'
            : 'top 220ms cubic-bezier(0.22,1,0.36,1), height 220ms cubic-bezier(0.22,1,0.36,1), width 360ms cubic-bezier(0.22,1,0.36,1), left 360ms cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* OTA accent bar — left border stripe. Wider + brighter red for confirmed no-shows. */}
        <div
          className="absolute left-0 top-0 bottom-0 rounded-l-md"
          style={{
            width: isConfirmedNoShow ? 4 : 3,
            backgroundColor: isConfirmedNoShow ? '#DC2626' : otaAccent,
          }}
        />

        {/* GROUP-BADGE (2026-06-01) — pastilla "👥 X/Y" REMOVIDA por feedback
            owner: tapaba el candado / flecha ↗ en la esquina superior derecha
            (esquina saturada con candado + flecha + vencido + OUT). La identidad
            de grupo se comunica ahora SOLO por el ring de color del bloque (ver
            boxShadow arriba, gc.ring) — distingue grupos de un vistazo sin
            chocar con ningún control. El contador X/Y + titular viven en el
            tooltip (hover) y en la sección Grupo del BookingDetailSheet. */}

        {/* Sprint AVAIL-OVERSTAY — Vencido indicator (rediseño 2026-05-19 iter 2).
            Iter 1 (icono disco amber) chocaba con el journey-extension arrow
            que vive en el mismo `top-1 right-1`. Apple HIG: estado debe
            comunicarse por tratamiento del borde + motion, no por iconos
            apilados. Overlay div con animación de stroke amber (breathing
            entre 2px → 2.5px + halo blur exterior). Tooltip nativo conserva
            el detalle textual. */}
        {isOverstayed && !isDragging && (
          <div
            className="absolute inset-0 rounded-md pointer-events-none overstay-stroke z-[1]"
            title="Salida programada vencida — confirma checkout o gestiona el folio"
          />
        )}

        {useAvatarOnly ? (
          /* Apple Calendar mini-card pattern: bloques angostos muestran
             avatar de iniciales centrado en lugar de un dot perdido o
             texto truncado a vacío. Industry consensus 5/5 PMS (Cloudbeds,
             Mews, Opera, RoomRaccoon, Sirvoy). Apple HIG iPad Calendar
             week view usa el mismo patrón. TooltipPortal entrega info
             completa en hover. */
          <div className="h-full flex items-center justify-center px-1">
            <div
              className="flex items-center justify-center rounded-full bg-white/90 font-semibold tracking-tight tabular-nums shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_1.5px_rgba(0,0,0,0.08)]"
              style={{
                width: Math.min(20, Math.max(12, rect.width - 8)),
                height: Math.min(20, rect.height - 6),
                color: dotColor,
                fontSize: rect.width < 24 ? 8 : 10,
              }}
              aria-label={stay.guestName}
            >
              {rect.width >= 24 ? initials : initials[0]}
            </div>
          </div>
        ) : textOffset > 0 ? (
          /* ── Clipped layout: block starts before the visible viewport ──
             Absolutely position name + OUT side-by-side at the visible left edge,
             so the receptionist always knows whose checkout they're confirming. */
          <>
            {/* Name — anchored to visible left edge */}
            {visibleWidth > 20 && (
              <div
                className="absolute inset-y-0 flex items-center gap-1.5 overflow-hidden"
                style={{
                  left: textOffset + 6,
                  // Reserva derecha 26px para el OUT chip circular (18px + 8px de aire).
                  right: isDeparting && onCheckout && !isDragging && !isSegmentLocked ? 26 : 6,
                }}
              >
                {showDot && (
                  <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0 }} />
                )}
                <span
                  className="text-[11px] font-medium truncate leading-none"
                >
                  {displayName}
                </span>
              </div>
            )}
            {/* OUT button redesign 2026-05-19 — Apple HIG pill chip.
                Glass amber bg + white icon + sutil shadow + hover lift.
                ≥110px ancho del bloque: muestra "Salida"; menor: solo icono. */}
            {!isConfirmedNoShow && isDeparting && onCheckout && !isDragging && !isSegmentLocked && (
              <button
                className="group absolute inset-y-0 right-1.5 my-auto z-20 flex items-center justify-center
                           bg-amber-600/95 hover:bg-amber-700 hover:scale-110 active:scale-95
                           text-white rounded-full h-[18px] w-[18px] shrink-0
                           shadow-[0_1px_2px_rgba(180,83,9,0.45),inset_0_0_0_1.25px_rgba(255,255,255,0.85)]
                           transition-all duration-150"
                onClick={(e) => {
                  e.stopPropagation()
                  onCheckout(stay.id)
                }}
                onMouseDown={(e) => e.stopPropagation()}
                title="Confirmar salida"
                aria-label="Confirmar salida"
              >
                <LogOut className="h-2.5 w-2.5" strokeWidth={2.75} />
              </button>
            )}
          </>
        ) : (
          <div
            className="h-full flex items-center gap-1.5 overflow-hidden relative"
            style={{
              paddingLeft: 8,
              // Reserve right space — nuevo OUT chip circular 18px (2026-05-19 iter 2).
              paddingRight:
                isDeparting && rect.width > 50 && onCheckout && !isDragging && !isSegmentLocked
                  ? 26
                  : isPotentialNoShow && rect.width > 70 && !isDragging && !isSegmentLocked
                  ? 36
                  : !isPast && !isDragging && !isSegmentLocked
                  ? 22
                  : 8,
            }}
          >
            {showDot && (
              <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0 }} />
            )}
            {(showDot || showText) && (
              <span
                className="text-[11px] font-medium truncate leading-none"
              >
                {displayName}
              </span>
            )}

            {/* CONFIRMED NO-SHOW badge — stable pill (no pulse), replaces potential NS */}
            {isConfirmedNoShow && rect.width > 30 && !isDragging && (
              <div
                className="absolute inset-y-0 right-1.5 my-auto flex items-center shrink-0 h-fit"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <span
                  className="inline-flex items-center gap-0.5 font-bold"
                  style={{ backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: 9, padding: '1px 5px', borderRadius: 3, lineHeight: 1.5 }}
                >
                  <UserX style={{ width: 8, height: 8 }} />
                  NS
                </span>
              </div>
            )}

            {/* DEPARTING — Apple HIG pill chip (mismo diseño que clipped layout). */}
            {!isConfirmedNoShow && isDeparting && rect.width > 80 && onCheckout && !isDragging && !isSegmentLocked && (
              <button
                className="group absolute inset-y-0 right-1.5 my-auto z-20 flex items-center justify-center
                           bg-amber-600/95 hover:bg-amber-700 hover:scale-110 active:scale-95
                           text-white rounded-full h-[18px] w-[18px] shrink-0
                           shadow-[0_1px_2px_rgba(180,83,9,0.45),inset_0_0_0_1.25px_rgba(255,255,255,0.85)]
                           transition-all duration-150"
                onClick={(e) => {
                  e.stopPropagation()
                  onCheckout(stay.id)
                }}
                onMouseDown={(e) => e.stopPropagation()}
                title="Confirmar salida"
                aria-label="Confirmar salida"
              >
                <LogOut className="h-2.5 w-2.5" strokeWidth={2.75} />
              </button>
            )}
            {/* POTENTIAL NO-SHOW — badge NS con pulsing dot (only when not yet confirmed) */}
            {isPotentialNoShow && !isConfirmedNoShow && rect.width > 70 && !isDragging && !isSegmentLocked && (
              <div
                className="absolute inset-y-0 right-1.5 my-auto flex items-center shrink-0 h-fit"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <span
                  className="inline-flex items-center gap-0.5 font-bold"
                  style={{ backgroundColor: '#FED7AA', color: '#9A3412', fontSize: 9, padding: '1px 5px', borderRadius: 3, lineHeight: 1.5 }}
                >
                  <UserX style={{ width: 8, height: 8 }} />
                  NS
                </span>
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
              </div>
            )}
            {/* Lock toggle — hidden for past stays, no-shows, and journey blocks */}
            {!isPast && !isConfirmedNoShow && !isJourneyBlock && !isDragging && !isSegmentLocked && !isDeparting && !isPotentialNoShow && (
              <div
                className={cn(
                  'absolute inset-y-0 right-1 my-auto p-0.5 rounded hover:bg-black/10 transition-opacity duration-150 h-fit',
                  isLocked ? 'opacity-70' : 'opacity-0 group-hover:opacity-60',
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleLock?.(stay.id)
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {isLocked
                  ? <Lock className="h-3 w-3" style={{ color: colors.text }} />
                  : <Unlock className="h-3 w-3" style={{ color: colors.text }} />
                }
              </div>
            )}
          </div>
        )}

        {/* Journey continuation indicator — segmentos intermedios de un journey
            (no es el último) muestran un ↗ en la esquina superior-derecha que
            anuncia "este bloque tiene continuación en otro lugar/fecha".
            Patrón Opera Cloud / Mews / Cloudbeds (chain indicator). El hover
            despliega un tooltip explicativo, el click resalta toda la cadena
            del journey (onActivateJourney → setActiveJourneyId). Refs: NN/g H1
            (Visibility of system status), Norman 1988 (Affordances), Treisman
            1980 (pre-attentive features). Solo se renderiza para bloques de
            journey que NO son el último — los terminales no necesitan señalar
            continuación. Se omite en modo compact (dayWidth ≤ 20px) para no
            saturar visualmente cuando los bloques son angostos. */}
        {isJourneyBlock && stay.isLastSegment === false && !isDragging && !useAvatarOnly && (
          <TooltipProvider delayDuration={150}>
            {/* onOpenChange: cuando el tooltip del indicador se abre, dismissamos
                el tooltip del bloque (useTooltip.hide()) para que no se sobrepongan.
                Sin esto el bloque sigue mostrando su tooltip de 320px detrás del
                tooltip de 260px del indicador — caso reportado por usuario. */}
            <Tooltip
              onOpenChange={(open) => {
                if (open) hide()
              }}
            >
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (stay.journeyId && onActivateJourney) onActivateJourney(stay.journeyId)
                  }}
                  className={cn(
                    'absolute top-1 right-1 z-20 flex items-center justify-center',
                    'w-[18px] h-[18px] rounded-full',
                    'bg-white/70 backdrop-blur-sm',
                    'shadow-[0_1px_2px_rgba(0,0,0,0.10),inset_0_0_0_1px_rgba(255,255,255,0.6)]',
                    'transition-all duration-150 ease-out',
                    'hover:bg-white hover:scale-110 hover:shadow-[0_2px_4px_rgba(0,0,0,0.15)]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1',
                    'motion-reduce:transition-none motion-reduce:hover:scale-100',
                  )}
                  aria-label={`Esta estadía continúa en otra habitación. Pulsa para ver el journey completo.`}
                  title=""
                >
                  <ArrowUpRight
                    className="h-3 w-3"
                    strokeWidth={2.5}
                    style={{ color: colors.text }}
                  />
                </button>
              </TooltipTrigger>
              {/* Override del default `inline-flex items-center gap-1.5` del
                  TooltipContent base usando `!flex !flex-col !items-stretch !gap-0`
                  + width fija. Patrón Mews/Cloudbeds: tooltip estrecho (220px),
                  stack vertical, divisor sutil entre body y CTA. Sin íconos en la
                  CTA (decisión NN/g — "Ver journey completo" se entiende solo). */}
              <TooltipContent
                side="top"
                sideOffset={8}
                collisionPadding={12}
                className={cn(
                  '!flex !flex-col !items-stretch !gap-0',
                  'w-[240px] p-0 overflow-hidden',
                  'bg-white text-slate-800 border border-slate-200',
                  'rounded-lg shadow-[0_8px_24px_-4px_rgba(15,23,42,0.16),0_4px_8px_-4px_rgba(15,23,42,0.10)]',
                )}
              >
                {/* Header informacional — tinte azul (Mehrabian-Russell 1974:
                    azul = información neutra, no alarma). Icono Info refuerza
                    el patrón Apple HIG / Material 3 de "callout" informativo. */}
                <div className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-50 border-b border-sky-100">
                  <Info className="h-3.5 w-3.5 text-sky-600" strokeWidth={2.25} />
                  <span className="text-[10px] font-semibold text-sky-700 uppercase tracking-[0.08em]">
                    Bloque movido
                  </span>
                </div>
                <div className="px-3.5 pt-2.5 pb-3">
                  <p className="text-[13px] text-slate-800 leading-[1.35]">
                    <span className="font-semibold">{stay.guestName}</span>
                    {stay.nextSegmentRoomNumber
                      ? <> se cambió a la <span className="font-semibold">hab. {stay.nextSegmentRoomNumber}</span></>
                      : <> tiene otro segmento más adelante</>}
                    {stay.nextSegmentCheckIn && (
                      <> el <span className="font-semibold">{format(stay.nextSegmentCheckIn, "d 'de' MMM", { locale: es })}</span></>)}.
                  </p>
                  <p className="text-[11px] text-slate-500 leading-[1.4] mt-1.5">
                    Extiende o edita la estadía desde ese bloque.
                  </p>
                </div>
                {stay.journeyId && onActivateJourney && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onActivateJourney(stay.journeyId!)
                    }}
                    className={cn(
                      'group/cta w-full px-3.5 py-2.5',
                      'inline-flex items-center justify-center gap-1.5',
                      'text-[12px] font-semibold text-emerald-700',
                      'bg-slate-50 hover:bg-emerald-600 hover:text-white',
                      'border-t border-slate-200',
                      'transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
                      'focus-visible:outline-none focus-visible:bg-emerald-600 focus-visible:text-white',
                      'motion-reduce:transition-none',
                    )}
                  >
                    <span>Ver journey completo</span>
                    <ArrowUpRight
                      className="h-3.5 w-3.5 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5 motion-reduce:transition-none"
                      strokeWidth={2.5}
                    />
                  </button>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Right-edge extend handle. Política:
            - Bloques sin journey (sin segmentReason): siempre mostrar.
            - Bloques de journey: SÓLO en el último segmento. Mostrarlo sobre
              segmentos intermedios (ORIGINAL + EXT_SAME_ROOM cuando ya hubo
              EXT_NEW_ROOM) hace que extendSameRoom valide contra la cola del
              journey y lance "newCheckOut must be after current segment checkOut"
              porque getActiveSegment retorna siempre el último. Caso Amelia 205
              + extensión movida a A2: el usuario arrastra 205 sin saber que la
              extensión real ocurre en A2. */}
        {!isPast && !isConfirmedNoShow && !isLocked && !isDragging && onExtendStart
          && (isJourneyBlock
                ? stay.isLastSegment === true
                : !isSegmentLocked) && (
          <div
            // 2026-05-19 iter 3 — Hit-area refinada. Antes: w-6 -right-2 (16px
            // hacia adentro del bloque) hacía que el handle se empalmara con
            // el OUT button (18px chip a right-1.5). Reportado por el usuario.
            //
            // Ahora: w-2 -right-1 = 8px total (4px fuera + 4px dentro del bloque),
            // centrado exactamente en el borde derecho. Apple/macOS resize-edge
            // pattern (Finder window, Pages, Numbers): 4-6px porque el cursor
            // `ew-resize` da feedback visual claro al acercarse. Sin empalme
            // con el OUT chip (que ahora vive en x=6..24 desde el borde).
            //
            // Fitts 1954: la hit-area de 4px exterior + 4px interior es suficiente
            // si el target es visualmente perceptible. Aquí lo es: el borde del
            // bloque es la affordance.
            className="absolute -right-1 top-0 bottom-0 w-2 z-10"
            style={{ cursor: 'ew-resize' }}
            title="Arrastrar para extender estadía"
            onMouseDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
              onExtendStart(stay.id, stay.roomId, rowIndex, groupHeaderOffsetY, stay.checkOut, e.clientX)
            }}
          />
        )}
      </div>

      {/* Journey edge dots — left (predecessor) and/or right (successor).
          Rendered outside the block div so overflow:hidden doesn't clip them.
          Positioned in the same coordinate space as the block (BookingsLayer container). */}
      {!isCompact && hasPredecessor && isInActiveJourney && (
        <JourneyDot
          x={rect.x + 1}
          y={rect.y + groupHeaderOffsetY + 3 + rect.height / 2}
          side="left"
        />
      )}
      {!isCompact && hasSuccessor && isInActiveJourney && (
        <JourneyDot
          x={rect.x + 1 + rect.width}
          y={rect.y + groupHeaderOffsetY + 3 + rect.height / 2}
          side="right"
        />
      )}

      <TooltipPortal
        stay={stay}
        position={position}
        visible={visible}
        groupSummary={groupSummary}
        registerTooltipRef={registerTooltipRef}
        onNoShow={onNoShow ? (stayId) => { hide(); onNoShow(stayId) } : undefined}
        onStartCheckin={onStartCheckin ? (stayId) => { hide(); onStartCheckin(stayId) } : undefined}
        onRevertNoShow={onRevertNoShow ? (stayId) => { hide(); onRevertNoShow(stayId) } : undefined}
        isPotentialNoShow={isPotentialNoShow}
        roomIsRebooked={hasNsAbove}
      />
    </>
  )
}

// Skip re-render when only callback references change (inline closures in BookingsLayer).
// Data-driven props are the only ones that actually change during drag/scroll:
//   - isDragging: true only for the one block being dragged
//   - dimmed:     changes when journey highlight activates
//   - isLocked:   changes on user toggle
//   - scrollLeft: changes on horizontal scroll
//   - dayWidth:   changes on zoom
//   - stay:       stable React Query reference
export const BookingBlock = memo(BookingBlockInner, (prev, next) =>
  prev.stay === next.stay &&
  prev.rowIndex === next.rowIndex &&
  prev.groupHeaderOffsetY === next.groupHeaderOffsetY &&
  prev.dayWidth === next.dayWidth &&
  prev.isDragging === next.isDragging &&
  prev.isLocked === next.isLocked &&
  prev.scrollLeft === next.scrollLeft &&
  prev.dimmed === next.dimmed &&
  prev.staggerIndex === next.staggerIndex &&
  prev.isInActiveJourney === next.isInActiveJourney &&
  prev.potentialNoShowWarningHour === next.potentialNoShowWarningHour &&
  prev.noShowCutoffHour === next.noShowCutoffHour &&
  prev.isNsStripe === next.isNsStripe &&
  prev.hasNsAbove === next.hasNsAbove &&
  // CHECK-IN C3.1 — re-render cuando el block entra/sale del hovered group.
  prev.isInHoveredGroup === next.isInHoveredGroup &&
  // anyDragInProgress: flag global del drag — sin esto, memo skipea
  // el re-render al iniciar drag y useTooltip(enabled) queda obsoleto,
  // dejando que los tooltips de otros bloques se disparen al hover.
  // Bug regresión observado tras suma de la prop.
  prev.anyDragInProgress === next.anyDragInProgress,
)
