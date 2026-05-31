import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { subDays, addDays, differenceInDays, startOfDay, format, parseISO, differenceInCalendarDays as diffDays } from 'date-fns'
import { useTimelineStore } from '../../stores/timeline.store'
import { TIMELINE } from '../../utils/timeline.constants'
import { getStayStatus } from '../../utils/timeline.utils'
import { useDragDrop } from '../../hooks/useDragDrop'
import { useGuestStays, useCreateGuestStay, useCheckout, useMoveRoom, useSplitMidStay, useSplitReservation, useMarkNoShow, useRevertNoShow, useRoomReadinessTasks, useExtendStay, useExtendSameRoom, useExtendNewRoom, useMoveExtensionRoom, useConfirmCheckin, useCancelStay, useCancelExtensionSegment, useConfirmSegmentMove, useCancelledTodayCount } from '../../hooks/useGuestStays'
import { guestStaysApi } from '../../api/guest-stays.api'
import { useStayJourneys } from '../../hooks/useStayJourneys'
import { useBlocks, useCreateBlock, useReleaseBlock, useCancelBlock } from '../../hooks/useBlocks'
import { useRoomSSE } from '../../hooks/useRoomSSE'
import { useSoftLockSSE } from '@/hooks/useSoftLock'
import { useMaintenanceTickets } from '../../../maintenance/hooks/useMaintenanceTickets'
import { useNavigate } from 'react-router-dom'
import { usePropertySettings } from '@/hooks/usePropertySettings'
import { useDateVirtualizer } from '../../hooks/useDateVirtualizer'
import { TimelineTopBar } from './TimelineTopBar'
import { TimelineSubBar } from './TimelineSubBar'
import { DateHeader } from './DateHeader'
import { RoomColumn } from './RoomColumn'
import { TimelineGrid } from './TimelineGrid'
import { BookingsLayer } from './BookingsLayer'
import { BlocksLayer } from './BlocksLayer'
import { TodayColumnHighlight } from './TodayColumnHighlight'
import { OccupancyFooter } from './OccupancyFooter'
import { DragGhost } from './DragGhost'
import { BookingDetailSheet } from '../dialogs/BookingDetailSheet'
import { useMaintenanceDrawer } from '../../../../store/maintenanceDrawer'
import { CheckInDialog } from '../dialogs/CheckInDialog'
import type { NewStayData } from '../dialogs/CheckInDialog'
import { CheckOutDialog } from '../dialogs/CheckOutDialog'
import { ExtendConfirmDialog } from '../dialogs/ExtendConfirmDialog'
import { MoveRoomDialog } from '../dialogs/MoveRoomDialog'
import { MoveExtensionConfirmDialog } from '../dialogs/MoveExtensionConfirmDialog'
import { CancelReservationDialog } from '../dialogs/CancelReservationDialog'
import { CancelledTodayDrawer } from '../dialogs/CancelledTodayDrawer'
import { BarStrip } from './BarStrip'
import { RateQuoteSheet } from '../dialogs/RateQuoteSheet'
import { useDailyBar } from '../../hooks/useRates'
import { MoveReservationConfirmDialog } from '../dialogs/MoveReservationConfirmDialog'
import { NoShowConfirmModal } from './NoShowConfirmModal'
import { ConfirmCheckinDialog } from '../dialogs/ConfirmCheckinDialog'
import { BlockModal } from '@/components/blocks/BlockModal'
import type { RoomBlockDto } from '@zenix/shared'
import { BlockSemantic, BlockStatus } from '@zenix/shared'
import { SEMANTIC_LABELS, REASON_LABELS } from '@/pages/BlocksPage'
import type {
  FlatRow,
  DropResult,
  ExtendState,
} from '../../types/timeline.types'
import { useRoomGroups } from '../../hooks/useRoomGroups'
import { useAuthStore } from '@/store/auth'
import { usePropertyStore } from '@/store/property'

// ─── Component ──────────────────────────────────────────────

export function TimelineScheduler() {
  const { dayWidth, sheetOpen, sheetStayId, openSheet, closeSheet } = useTimelineStore()

  // Active property comes from the property switcher; falls back to the
  // JWT's home property on first load, before the persisted store or the
  // /properties fetch have had a chance to populate.
  const activeId = usePropertyStore((s) => s.activePropertyId)
  const jwtPropertyId = useAuthStore((s) => s.user?.propertyId) ?? ''
  const currentUserId = useAuthStore((s) => s.user?.id) ?? ''
  const PROPERTY_ID = activeId ?? jwtPropertyId

  const { data: apiGroups = [], isLoading: groupsLoading } = useRoomGroups(PROPERTY_ID)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  // Refs para sincronización scroll horizontal via direct DOM mutation.
  // Apple Calendar / SwiftUI pattern: bypass de React reconciliation en
  // cada scroll event (60+ fires/s) para mantener 60fps fluidos. React
  // state se actualiza solo via rAF debounced para virtualizer/cálculos.
  const dateHeaderInnerRef = useRef<HTMLDivElement>(null)
  const barStripInnerRef = useRef<HTMLDivElement>(null)
  const footerInnerRef = useRef<HTMLDivElement>(null)
  const scrollLeftRef = useRef(0)
  const scrollStateRafRef = useRef<number | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  // ─── Date Virtualizer (infinite horizontal scroll) ─────────
  const {
    virtualColumns,
    totalWidth,
    scrollToDate,
    indexToDate,
    POOL_START,
  } = useDateVirtualizer(PROPERTY_ID, scrollContainerRef, dayWidth)

  // ─── Stable data window — un solo rango grande, queryKey estable ──
  // Solo se expande cuando el viewport está a <14 días del borde.
  const [dataWindow, setDataWindow] = useState(() => {
    const now = new Date()
    return { from: subDays(now, 90), to: addDays(now, 90) }
  })

  const firstVirtIdx = virtualColumns[0]?.index ?? 0
  const lastVirtIdx = virtualColumns[virtualColumns.length - 1]?.index ?? 0
  const expandBucket = Math.floor(firstVirtIdx / 14)

  useEffect(() => {
    if (!virtualColumns.length) return
    const firstDate = indexToDate(firstVirtIdx)
    const lastDate = indexToDate(lastVirtIdx)

    setDataWindow((prev) => {
      let next = prev
      if (differenceInDays(prev.from, firstDate) > -14) {
        next = { ...next, from: subDays(firstDate, 60) }
      }
      if (differenceInDays(lastDate, prev.to) > -14) {
        next = { ...next, to: addDays(lastDate, 60) }
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandBucket])

  // Derive days array from virtual columns (for components that need it)
  const days = useMemo(
    () => virtualColumns.map((vc) => vc.date),
    [virtualColumns],
  )

  // Collapsible groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const groups = useMemo(
    () =>
      apiGroups.map((g) => ({
        ...g,
        collapsed: collapsedGroups.has(g.id),
      })),
    [apiGroups, collapsedGroups],
  )

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }, [])

  // Flatten groups into rows (group headers + visible room rows)
  const flatRows: FlatRow[] = useMemo(() => {
    const rows: FlatRow[] = []
    groups.forEach((group) => {
      rows.push({ type: 'group', id: group.id, group })
      if (!group.collapsed) {
        group.rooms.forEach((room) => {
          rows.push({ type: 'room', id: room.id, groupId: group.id, room })
        })
      }
    })
    return rows
  }, [groups])

  // Total rooms for occupancy calculation
  const totalRooms = useMemo(
    () => groups.reduce((sum, g) => sum + (g.collapsed ? 0 : g.rooms.length), 0),
    [groups],
  )

  // Handle scroll sync — SwiftUI-style fluidity pattern.
  // 1. Capturar scrollLeft en ref (no state) → 0 cost.
  // 2. Aplicar translate3d a 3 inner divs via DOM directo → bypass React,
  //    GPU-composited (will-change: transform), sin reconciliation cost.
  // 3. Actualizar React state (scrollLeft) solo via rAF debounced — el
  //    state lo usan virtualizer + cálculos derivados, no necesita 60fps.
  //
  // Antes: setScrollLeft cada scroll event (60-120/s) → re-render
  // TimelineScheduler + descendants → frame drops + desincronización
  // visible entre header/grid/footer (queja usuario "se ve raro mientras
  // sucede el scroll").
  // Después: 60fps consistentes, sync perfecto entre todos los layers.
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const x = el.scrollLeft
    const y = el.scrollTop
    scrollLeftRef.current = x
    // Direct DOM mutation — GPU-composited transform, 0 React cost
    const tx = `translate3d(${-x}px, 0, 0)`
    if (dateHeaderInnerRef.current) dateHeaderInnerRef.current.style.transform = tx
    if (barStripInnerRef.current)   barStripInnerRef.current.style.transform = tx
    if (footerInnerRef.current)     footerInnerRef.current.style.transform = tx
    // Update state vertical (scrollTop) immediately — afecta render de rows
    setScrollTop(y)
    // Update horizontal state via rAF debounce — solo cuando idle
    if (scrollStateRafRef.current !== null) cancelAnimationFrame(scrollStateRafRef.current)
    scrollStateRafRef.current = requestAnimationFrame(() => {
      setScrollLeft(scrollLeftRef.current)
      scrollStateRafRef.current = null
    })
  }, [])

  // ─── Navigation (wired to virtualizer, not store) ──────────
  const handleNavigate = useCallback(
    (direction: 'prev' | 'next') => {
      if (!virtualColumns.length) return
      const visibleCount = virtualColumns.length
      const step = Math.floor(visibleCount / 2)
      const midDate = virtualColumns[Math.floor(visibleCount / 2)]?.date
      if (!midDate) return
      const target =
        direction === 'next' ? addDays(midDate, step) : subDays(midDate, step)
      scrollToDate(target)
    },
    [virtualColumns, scrollToDate],
  )

  const handleGoToToday = useCallback(() => {
    scrollToDate(subDays(new Date(), 2))
  }, [scrollToDate])

  // ─── Lock/Unlock ───────────────────────────────────────────
  const [lockedStays, setLockedStays] = useState<Set<string>>(
    () => new Set(JSON.parse(localStorage.getItem('lockedStays') ?? '[]') as string[]),
  )

  const toggleLock = useCallback((stayId: string) => {
    setLockedStays(prev => {
      const next = new Set(prev)
      if (next.has(stayId)) next.delete(stayId)
      else next.add(stayId)
      localStorage.setItem('lockedStays', JSON.stringify([...next]))
      return next
    })
  }, [])

  // ─── Guest stays from API ──────────────────────────────────
  const { data: stays = [], isLoading } = useGuestStays(
    PROPERTY_ID,
    dataWindow.from,
    dataWindow.to,
  )
  const createStay      = useCreateGuestStay(PROPERTY_ID)
  const checkoutMut     = useCheckout(PROPERTY_ID)
  const moveRoomMut     = useMoveRoom(PROPERTY_ID)
  const splitMidStayMut = useSplitMidStay(PROPERTY_ID)
  const splitReservationMut = useSplitReservation(PROPERTY_ID)
  const extendStayMut        = useExtendStay(PROPERTY_ID)
  const extendSameRoomMut    = useExtendSameRoom(PROPERTY_ID)
  const extendNewRoomMut     = useExtendNewRoom(PROPERTY_ID)
  const moveExtensionRoomMut = useMoveExtensionRoom(PROPERTY_ID)
  const markNoShowMut   = useMarkNoShow(PROPERTY_ID)
  const revertNoShowMut = useRevertNoShow(PROPERTY_ID)
  const cancelStayMut   = useCancelStay(PROPERTY_ID)
  const cancelExtMut    = useCancelExtensionSegment(PROPERTY_ID)
  const confirmMoveMut  = useConfirmSegmentMove(PROPERTY_ID)
  const { potentialNoShowWarningHour, noShowCutoffHour } = usePropertySettings()

  const { journeyBlocks: rawJourneyBlocks } = useStayJourneys(PROPERTY_ID, dataWindow.from, dataWindow.to)

  // ─── SmartBlock data (ACTIVE + APPROVED + PENDING_APPROVAL) ────────────────
  const { data: roomBlocks = [] } = useBlocks(PROPERTY_ID)
  const createBlockMut  = useCreateBlock(PROPERTY_ID)
  const releaseBlockMut = useReleaseBlock()
  const cancelBlockMut  = useCancelBlock()

  // Propagate `noShowAt` from parent GuestStay to each journey segment block.
  // The journeys endpoint doesn't return this field, but drag/drop conflict
  // detection needs it: a no-show releases inventory (CLAUDE.md §17) — segments
  // belonging to a no-show stay must NOT count as room occupancy.
  const journeyBlocks = useMemo(() => {
    const noShowMap = new Map<string, Date>()
    for (const s of stays) if (s.noShowAt) noShowMap.set(s.id, s.noShowAt)
    if (noShowMap.size === 0) return rawJourneyBlocks
    return rawJourneyBlocks.map((b) =>
      b.guestStayId && noShowMap.has(b.guestStayId)
        ? { ...b, noShowAt: noShowMap.get(b.guestStayId) }
        : b,
    )
  }, [rawJourneyBlocks, stays])

  // SSE: real-time updates when room status changes
  useRoomSSE(PROPERTY_ID)

  // Soft-lock state — Map<roomId, lockedByName> for 🔒 badge in RoomColumn.
  // Populated via SSE events soft:lock:acquired / soft:lock:released.
  // Using useState with functional setter avoids stale closures over the Map.
  const [lockedRooms, setLockedRooms] = useState<Map<string, string>>(new Map())
  useSoftLockSSE(setLockedRooms)

  const navigate = useNavigate()
  void navigate

  // W3.3 + W3.6 — abre el GlobalMaintenanceDrawer (montado en App.tsx)
  // via el store Zustand. Sin acoplar state local con un drawer propio.
  const openMaintenanceDrawer = useMaintenanceDrawer((s) => s.open)

  // W3.1 — Maintenance tickets activos por habitación (badge 🔧 en RoomColumn).
  // Shared query con MaintenancePage + sidebar badge (W3.4) — staleTime 30s + SSE.
  const { data: activeTickets = [] } = useMaintenanceTickets({ activeOnly: true })
  const maintenanceByRoom = useMemo(() => {
    const map = new Map<string, { count: number; highest: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; blocked: boolean }>()
    const priorityRank: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }
    for (const t of activeTickets) {
      if (!t.roomId) continue
      const cur = map.get(t.roomId)
      const next = {
        count: (cur?.count ?? 0) + 1,
        highest: (priorityRank[t.priority] > priorityRank[cur?.highest ?? 'LOW']
          ? t.priority
          : cur?.highest ?? t.priority) as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        blocked: (cur?.blocked ?? false) || !!t.hasAutoBlock,
      }
      map.set(t.roomId, next)
    }
    return map
  }, [activeTickets])

  // Room readiness tasks for visual indicators
  const { data: rawReadinessTasks = [] } = useRoomReadinessTasks(PROPERTY_ID)
  const readinessTasks = useMemo(() =>
    (rawReadinessTasks as Array<Record<string, unknown>>).map((t) => {
      const items = (t.items as Array<Record<string, unknown>>) ?? []
      return {
        roomId: t.roomId as string,
        status: t.status as string,
        itemsDone: items.filter(
          (i) => i.status === 'DONE' || i.status === 'SKIPPED',
        ).length,
        itemsTotal: items.length,
      }
    }),
    [rawReadinessTasks],
  )

  const handleDropSuccess = useCallback((result: DropResult) => {
    // ── Journey segment drag ─────────────────────────────────────────────────
    // ORIGINAL + EXTENSION_SAME/NEW_ROOM + ROOM_MOVE current segment son
    // movables (siempre que NO estén locked = past). El backend
    // `executeMidStayRoomMove` siempre opera sobre el último segment unlocked
    // (ver `getActiveSegment` en stay-journeys.service), así que un segundo
    // move sobre la misma journey funciona naturalmente: A1→A2→A3. Bug fix
    // 2026-05-19: el filtrado anterior excluía ROOM_MOVE incluso si era el
    // segment actual, impidiendo cambios sucesivos legítimos.
    // SPLIT sigue siendo immutable (representa historia de split, no movable).
    const draggedJourneyBlock = journeyBlocks.find(b => b.id === result.stayId)
    const isMovableJourneySegment =
      !draggedJourneyBlock?.segmentLocked &&
      (draggedJourneyBlock?.segmentReason === 'ORIGINAL' ||
        draggedJourneyBlock?.segmentReason === 'EXTENSION_SAME_ROOM' ||
        draggedJourneyBlock?.segmentReason === 'EXTENSION_NEW_ROOM' ||
        draggedJourneyBlock?.segmentReason === 'ROOM_MOVE')

    if (draggedJourneyBlock && isMovableJourneySegment) {
      // IN_HOUSE journey segment: moving the entire segment would shift past nights
      // to the new room — incorrect for BI/marketing history (CLAUDE.md §22/§29).
      // Redirect to the split dialog, pre-selecting the target room for part 2.
      const segStatus = getStayStatus(draggedJourneyBlock.checkIn, draggedJourneyBlock.checkOut, draggedJourneyBlock.actualCheckout)
      if (segStatus === 'IN_HOUSE') {
        setMoveRoomDialog({ stayId: draggedJourneyBlock.id, preselectedNewRoomId: result.newRoomId })
        return
      }
      const newRoomRow = flatRows.find(r => r.id === result.newRoomId && r.type === 'room')
      setMoveExtensionConfirm({
        segmentId: draggedJourneyBlock.segmentId!,
        journeyId: draggedJourneyBlock.journeyId!,
        newRoomId: result.newRoomId,
        newRoomNumber: newRoomRow?.room?.number ?? result.newRoomId.slice(0, 8),
        nights: diffDays(draggedJourneyBlock.checkOut, draggedJourneyBlock.checkIn),
        checkIn: draggedJourneyBlock.checkIn,
        checkOut: draggedJourneyBlock.checkOut,
        // Solo es "extensión" si el journey tiene >1 segmento. Toda reserva
        // crea automáticamente un StayJourney + ORIGINAL segment; un journey
        // single-segment NO es una extensión, es una reserva normal.
        isExtension: !!draggedJourneyBlock.hasMultipleSegments,
      })
      return
    }

    // ── Plain GuestStay drag ─────────────────────────────────────────────────
    const draggedStay = stays.find(s => s.id === result.stayId) ?? null
    if (!draggedStay) return

    // IN_HOUSE plain stay: block full-block move for the same reason as above.
    // Open MoveRoomDialog in split mode with the target room pre-selected.
    const stayStatus = getStayStatus(draggedStay.checkIn, draggedStay.checkOut, draggedStay.actualCheckout)
    if (stayStatus === 'IN_HOUSE') {
      setMoveRoomDialog({ stayId: draggedStay.id, preselectedNewRoomId: result.newRoomId })
      return
    }

    // ARRIVING / DEPARTING — simple full-block move with confirmation dialog
    // (non-negotiable — see CLAUDE.md §32).
    const newRoomRow = flatRows.find(r => r.id === result.newRoomId && r.type === 'room')
    const fromRoomRow = flatRows.find(r => r.id === draggedStay.roomId && r.type === 'room')
    setMoveReservationConfirm({
      stayId: draggedStay.id,
      guestName: draggedStay.guestName,
      fromRoomId: draggedStay.roomId,
      fromRoomNumber: fromRoomRow?.room?.number,
      newRoomId: result.newRoomId,
      newRoomNumber: newRoomRow?.room?.number ?? result.newRoomId.slice(0, 8),
      nights: Math.max(1, diffDays(draggedStay.checkOut, draggedStay.checkIn)),
      checkIn: draggedStay.checkIn,
      checkOut: draggedStay.checkOut,
    })
  }, [journeyBlocks, flatRows, stays])

  // ─── No-show filter toggle (§34 — default visible) ──────────────────────────
  const [hideNoShows, setHideNoShows] = useState(true)

  // ─── Journey highlight (lifted from BookingsLayer for cross-component sync) ──
  const [activeJourneyId, setActiveJourneyId] = useState<string | null>(null)
  // CHECK-IN C3.1 (2026-05-30) — group hover-highlight. Cuando recepción
  // hover sobre un block que es parte de un ReservationGroup, propagamos
  // el groupId a BookingsLayer para que TODOS los siblings del grupo
  // muestren ring violet. Patrón Linear/Asana "related items highlight".
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null)

  // Clearing the journey also closes the sheet — single click to reset everything
  const handleSetActiveJourneyId = useCallback((id: string | null) => {
    setActiveJourneyId(id)
    if (id === null) closeSheet()
  }, [closeSheet])

  // ── Perf: memo de la prop `stay` pasada al BookingDetailSheet. ──────────
  // Sin memo, el spread `{ ...raw, roomNumber }` creaba un objeto nuevo en
  // cada render del TimelineScheduler (scroll, SSE, hover...). Eso disparaba
  // re-effects en el sheet (useSoftLock acquire/release, queries...) y la
  // animación Radix Sheet acumulaba lag al abrir/cerrar varias reservas
  // seguidas. Con esta memo, la prop solo cambia si cambió la reserva
  // seleccionada o su roomNumber resuelto.
  const sheetStay = useMemo(() => {
    if (!sheetStayId) return null
    const raw = stays.find(s => s.id === sheetStayId)
            ?? journeyBlocks.find(s => s.id === sheetStayId)
            ?? null
    if (!raw) return null
    if (raw.roomNumber) return raw
    const roomRow = flatRows.find(r => r.id === raw.roomId && r.type === 'room')
    return { ...raw, roomNumber: roomRow?.room?.number }
  }, [sheetStayId, stays, journeyBlocks, flatRows])

  // ─── Dialogs ────────────────────────────────────────────────
  const [checkInDialog, setCheckInDialog] = useState<{
    open: boolean; roomId?: string; roomNumber?: string; checkIn?: Date;
    /** CHECK-IN C2.3 — fast-path walk-in: cuando true, el dialog pre-marca
     *  checkInNow + defaultea fechas hoy/mañana. Activado por el botón
     *  Walk-in del TimelineTopBar. */
    walkIn?: boolean
  }>({ open: false })

  const [checkOutDialog, setCheckOutDialog] = useState<{
    open: boolean; stayId: string | null
  }>({ open: false, stayId: null })

  const [noShowDialog, setNoShowDialog] = useState<{ stayId: string } | null>(null)
  const [cancelDialog, setCancelDialog] = useState<{ stayId: string } | null>(null)
  const [cancelledTodayOpen, setCancelledTodayOpen] = useState(false)
  const [rateQuoteOpen, setRateQuoteOpen] = useState(false)
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
  const { data: cancelledTodayCount = 0 } = useCancelledTodayCount(PROPERTY_ID, browserTz)

  // Sprint Rates 2026-05-16: BAR strip + Rate Quote Sheet
  const { data: dailyBar } = useDailyBar(PROPERTY_ID, dataWindow.from, dataWindow.to)

  const [checkinDialog, setCheckinDialog] = useState<{ stayId: string } | null>(null)
  const confirmCheckinMut = useConfirmCheckin(PROPERTY_ID)
  const noShowTarget = noShowDialog
    ? ([...stays, ...journeyBlocks].find((s) => s.id === noShowDialog.stayId) ?? null)
    : null

  // ─── Block modal ───────────────────────────────────────────────
  const [blockModal, setBlockModal] = useState<{
    roomId?: string
    startDate?: string
    endDate?: string
  } | null>(null)

  const [blockDetail, setBlockDetail] = useState<RoomBlockDto | null>(null)

  // ─── Extend stay by drag ───────────────────────────────────────
  const [extendState, setExtendState] = useState<ExtendState | null>(null)
  const [extendConfirm, setExtendConfirm] = useState<{
    stayId: string
    journeyId?: string
    originalCheckOut: Date
    newCheckOut: Date
    roomConflict?: boolean
    availableRooms?: import('../dialogs/ExtendConfirmDialog').RoomOption[]
  } | null>(null)

  // ─── Move room dialog ──────────────────────────────────────────
  const [moveRoomDialog, setMoveRoomDialog] = useState<{
    stayId: string
    /** Pre-selects part 2 room when opened via drag-and-drop to a specific target */
    preselectedNewRoomId?: string
  } | null>(null)
  const moveRoomTarget = moveRoomDialog
    ? (stays.find(s => s.id === moveRoomDialog.stayId) ?? journeyBlocks.find(s => s.id === moveRoomDialog.stayId) ?? null)
    : null

  // ─── Move reservation confirm (drag plain stay block to another row) ──
  const [moveReservationConfirm, setMoveReservationConfirm] = useState<{
    stayId: string
    guestName: string
    fromRoomId: string
    fromRoomNumber?: string
    newRoomId: string
    newRoomNumber: string
    nights: number
    checkIn: Date
    checkOut: Date
  } | null>(null)

  // ─── Move extension confirm (drag +ext block to another row) ──
  const [moveExtensionConfirm, setMoveExtensionConfirm] = useState<{
    segmentId: string
    journeyId: string
    newRoomId: string
    newRoomNumber: string
    nights: number
    checkIn: Date
    checkOut: Date
    isExtension: boolean
  } | null>(null)

  // ─── Drag & Drop ────────────────────────────────────────────
  // Ghost position is updated via direct DOM mutation (not state) so moving
  // the cursor doesn't trigger a React re-render every frame.
  const ghostRef = useRef<HTMLDivElement | null>(null)

  // GuestStay blocks whose journey is tracked via StayJourney segments are
  // replaced visually by the ORIGINAL + extension/move segments. Hide them
  // from the rendered layer so the original room row is not double-occupied.
  // Excluye stays cancelled (Sprint CANCEL-ARCHIVE): paridad industria
  // (Cloudbeds, Mews, Opera, RoomRaccoon, Little Hotelier liberan el slot
  // visual del calendar; aparecen solo en el drawer/archive).
  const staysWithoutJourneys = useMemo(
    () => stays.filter((s) => !s.journeyId && !s.cancelledAt),
    [stays],
  )

  // NS collision detection — computed from COMPLETE unfiltered data so el result
  // is independent of the hideNoShows toggle. nsStripeIds marks which NS blocks
  // to render as thin stripes; nsCollisionRanges tells active blocks to shift down.
  //
  // Comparación DAY-LEVEL en UTC: Laura checkout 15T12:00Z y pAAA checkin 15T05:00Z
  // serían overlap por timestamp pero NO operativamente (same-day turnover legítimo).
  // Mismo bug pattern arreglado en AvailabilityService (commit 7d13724).
  const { nsStripeIds, nsCollisionRanges } = useMemo(() => {
    const utcDay = (d: Date) =>
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    const allBlocks = [...staysWithoutJourneys, ...journeyBlocks]
    const noShows   = allBlocks.filter((b) => !!b.noShowAt)
    const activos   = allBlocks.filter((b) => !b.noShowAt)
    const stripeIds = new Set<string>()
    const ranges: Array<{ roomId: string; checkIn: Date; checkOut: Date }> = []
    for (const ns of noShows) {
      const nsInDay  = utcDay(ns.checkIn)
      const nsOutDay = utcDay(ns.checkOut)
      const collides = activos.some((a) => {
        if (ns.roomId !== a.roomId) return false
        const aInDay  = utcDay(a.checkIn)
        const aOutDay = utcDay(a.checkOut)
        return nsInDay < aOutDay && nsOutDay > aInDay
      })
      if (collides) {
        stripeIds.add(ns.id)
        ranges.push({ roomId: ns.roomId, checkIn: ns.checkIn, checkOut: ns.checkOut })
      }
    }
    return { nsStripeIds: stripeIds, nsCollisionRanges: ranges }
  }, [staysWithoutJourneys, journeyBlocks])

  // Merge journeyBlocks into conflict detection so dragging a stay
  // can't overwrite a pre-planned ROOM_MOVE/EXTENSION segment.
  // Use staysWithoutJourneys to avoid double-counting: stays with a journey
  // are already represented by their segments in journeyBlocks. Including the
  // raw GuestStay too marks phantom occupancy when stay.roomId differs from
  // a segment.roomId (e.g. post ROOM_MOVE), making rooms appear falsely busy
  // in MoveRoomDialog / drag-drop conflict checks.
  const allBlocksForDragCheck = useMemo(
    () => [...staysWithoutJourneys, ...journeyBlocks],
    [staysWithoutJourneys, journeyBlocks],
  )

  // Pre-built occupancy Set for O(1) per-cell lookup in TimelineGrid.
  // Without this, isOccupied scans all blocks on every cell × every render,
  // costing O(rooms × days × blocks) when dragTargetRoomId changes.
  //
  // Iteramos por DÍA UTC (no por incremento de 86_400_000 ms desde el timestamp
  // exacto). Sin esto, Abraham Aaa con checkOut 2026-05-17T17:00Z producía un
  // step en 2026-05-17T05:00Z que es < checkOut → marcaba el día 17 como
  // ocupado y la celda PM del 17 quedaba blocked → sin ghost ni click para
  // crear reserva same-day turnover. Bug paralelo al fix de availability:
  // ambos paths necesitan day-level UTC comparison, no timestamp arithmetic.
  const occupancySet = useMemo(() => {
    const set = new Set<string>()
    const MS_DAY = 86400000
    // Sprint AVAIL-OVERSTAY (2026-05-19) — stays con scheduledCheckout vencido
    // pero sin actualCheckout (zombies) NO ocupan celdas. Espejo del filtro
    // backend en AvailabilityService.check (§128).
    const todayUtc = new Date()
    const zombieCutoffMs = Date.UTC(
      todayUtc.getUTCFullYear(),
      todayUtc.getUTCMonth(),
      todayUtc.getUTCDate(),
    )
    for (const block of allBlocksForDragCheck) {
      if (block.actualCheckout) continue // departed — not an active occupancy
      if (block.noShowAt) continue       // no-show releases inventory (CLAUDE.md §17)
      const endDayMs = Date.UTC(
        block.checkOut.getUTCFullYear(),
        block.checkOut.getUTCMonth(),
        block.checkOut.getUTCDate(),
      )
      // Zombie filter: scheduled checkout strictly before today's UTC start.
      if (endDayMs < zombieCutoffMs) continue
      const startDayMs = Date.UTC(
        block.checkIn.getUTCFullYear(),
        block.checkIn.getUTCMonth(),
        block.checkIn.getUTCDate(),
      )
      for (let t = startDayMs; t < endDayMs; t += MS_DAY) {
        const d = new Date(t)
        set.add(`${block.roomId}:${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`)
      }
    }
    return set
  }, [allBlocksForDragCheck])

  // Block occupancy set — ACTIVE/APPROVED blocks mark cells as non-interactive
  // so the ghost block and check-in click don't fire on blocked dates.
  const blockOccupancySet = useMemo(() => {
    const set = new Set<string>()
    const MS_DAY = 86400000
    for (const block of roomBlocks) {
      if (!block.roomId) continue
      if (block.status !== 'ACTIVE' && block.status !== 'APPROVED') continue
      const start = new Date(block.startDate).getTime()
      const end   = block.endDate ? new Date(block.endDate).getTime() : start + MS_DAY * 365
      for (let t = start; t < end; t += MS_DAY) {
        const d = new Date(t)
        set.add(`${block.roomId}:${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`)
      }
    }
    return set
  }, [roomBlocks])

  const isOccupied = useCallback((roomId: string, date: Date) => {
    const d = startOfDay(date)
    const key = `${roomId}:${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
    return occupancySet.has(key) || blockOccupancySet.has(key)
  }, [occupancySet, blockOccupancySet])

  const {
    dragState,
    handleDragStart: rawDragStart,
    handleDragMove,
    handleDragEnd,
    handleDragCancel,
  } = useDragDrop({
    flatRows,
    stays: allBlocksForDragCheck,
    onDropSuccess: handleDropSuccess,
    onDropInvalid: (reason) => toast.error(reason),
  })

  const handleDragStartWithPosition = useCallback((stayId: string, clientX: number, clientY: number) => {
    if (ghostRef.current) {
      ghostRef.current.style.transform = `translate(${clientX - 20}px, ${clientY - TIMELINE.ROW_HEIGHT / 2}px)`
    }
    rawDragStart(stayId, clientX)
  }, [rawDragStart])

  const handleExtendStart = useCallback((
    stayId: string,
    roomId: string,
    rowIndex: number,
    groupHeaderOffsetY: number,
    originalCheckOut: Date,
    clientX: number,
  ) => {
    const stayRef = stays.find(s => s.id === stayId) ?? journeyBlocks.find(s => s.id === stayId)
    setExtendState({
      stayId,
      journeyId: stayRef?.journeyId,
      roomId,
      rowIndex,
      groupHeaderOffsetY,
      originalCheckOut,
      previewCheckOut: originalCheckOut,
      startClientX: clientX,
    })
  }, [stays, journeyBlocks])

  // isDraggingActive flips only when drag starts/ends — NOT on every mousemove.
  // This prevents the effect from re-subscribing event listeners every frame.
  const isDraggingActive = !!dragState

  useEffect(() => {
    if (!isDraggingActive) return

    function onMouseMove(e: MouseEvent) {
      // Move ghost via GPU-composited transform — zero React re-renders.
      if (ghostRef.current) {
        ghostRef.current.style.transform = `translate(${e.clientX - 20}px, ${e.clientY - TIMELINE.ROW_HEIGHT / 2}px)`
      }

      const container = scrollContainerRef.current
      if (!container) return

      const containerRect = container.getBoundingClientRect()
      const gridY = e.clientY - containerRect.top + container.scrollTop

      handleDragMove(e.clientX, gridY)
    }

    function onMouseUp() {
      handleDragEnd()
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleDragCancel()
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('keydown', onKeyDown)
    }
  // handleDragMove/End/Cancel are now stable ([] deps in useDragDrop via refs).
  // isDraggingActive changes only on drag start/end, not on every mousemove.
  }, [isDraggingActive, handleDragMove, handleDragEnd, handleDragCancel])

  const draggedStay = dragState
    ? stays.find(s => s.id === dragState.stayId) ?? journeyBlocks.find(s => s.id === dragState.stayId) ?? null
    : null

  // ─── Extend drag global listeners ─────────────────────────────
  useEffect(() => {
    if (!extendState) return

    function onMouseMove(e: MouseEvent) {
      setExtendState(prev => {
        if (!prev) return null
        // Math.floor: trigger at the MID of each next column (where the block
        // endpoint visually lives — stayToRect places checkOut at dayWidth/2).
        // Math.round triggered at the column boundary, half a cell too early.
        const deltaDays = Math.max(0, Math.floor((e.clientX - prev.startClientX) / dayWidth))
        const newCO = startOfDay(addDays(prev.originalCheckOut, deltaDays))
        return { ...prev, previewCheckOut: newCO }
      })
    }

    function onMouseUp() {
      setExtendState(prev => {
        if (!prev) return null
        const added = diffDays(prev.previewCheckOut, prev.originalCheckOut)
        if (added >= 1) {
          const snap = { ...prev }
          // Pre-flight: check if the original room is available for the extension dates.
          // If the room has a conflict, offer alternative rooms with availability.
          guestStaysApi.checkAvailability(snap.roomId, snap.originalCheckOut, snap.previewCheckOut)
            .then((result) => {
              if (result.available) {
                setExtendConfirm({
                  stayId: snap.stayId,
                  journeyId: snap.journeyId,
                  originalCheckOut: snap.originalCheckOut,
                  newCheckOut: snap.previewCheckOut,
                })
              } else {
                // Room unavailable — collect alternatives from flatRows and filter
                // by same roomTypeId, excluding the conflicting room itself.
                const conflictingRoomRow = flatRows.find(r => r.type === 'room' && r.id === snap.roomId)
                const roomTypeId = conflictingRoomRow?.room?.roomTypeId
                const alternatives = flatRows
                  .filter(r => r.type === 'room' && r.id !== snap.roomId && (!roomTypeId || r.room?.roomTypeId === roomTypeId))
                  .map(r => ({ id: r.id, number: r.room?.number ?? r.id, type: r.room?.roomTypeId ?? '' }))

                setExtendConfirm({
                  stayId: snap.stayId,
                  journeyId: snap.journeyId,
                  originalCheckOut: snap.originalCheckOut,
                  newCheckOut: snap.previewCheckOut,
                  roomConflict: true,
                  availableRooms: alternatives,
                })
              }
            })
            .catch(() => {
              // On network error, fall back to same-room extension and let the server validate.
              setExtendConfirm({
                stayId: snap.stayId,
                journeyId: snap.journeyId,
                originalCheckOut: snap.originalCheckOut,
                newCheckOut: snap.previewCheckOut,
              })
            })
        }
        return null
      })
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setExtendState(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [extendState, dayWidth])

  if (groupsLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <div className="animate-spin w-4 h-4 border-2 border-slate-200 border-t-slate-500 rounded-full" />
          Cargando...
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <TimelineTopBar
        onNewReservation={() => setCheckInDialog({ open: true })}
        onWalkIn={() => setCheckInDialog({ open: true, walkIn: true })}
      />
      <TimelineSubBar
        onNavigate={handleNavigate}
        onGoToToday={handleGoToToday}
        hideNoShows={hideNoShows}
        onToggleHideNoShows={() => setHideNoShows((v) => !v)}
        onOpenRateQuote={() => setRateQuoteOpen(true)}
      />

      <div className="flex flex-col flex-1 overflow-hidden relative">
        {/* ── Top row: corner + DateHeader (FUERA del scroll container) ── */}
        <div className="flex flex-shrink-0 border-b border-slate-200 bg-white z-20">
          {/* Esquina superior izquierda — alineada con RoomColumn */}
          <div
            className="border-r border-slate-200 bg-slate-50 flex items-end px-3 pb-2"
            style={{ width: TIMELINE.COLUMN_WIDTH, height: TIMELINE.HEADER_HEIGHT, flexShrink: 0 }}
          >
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Habitaciones
            </span>
          </div>

          {/* DateHeader — sync vía DOM mutation directa (innerRef).
              No usa scrollLeft state — el ref se actualiza en cada scroll
              event sin pasar por React. Inicialmente en 0 (sin transform). */}
          <div className="flex-1 overflow-hidden">
            <div
              ref={dateHeaderInnerRef}
              style={{ width: totalWidth, willChange: 'transform' }}
            >
              <DateHeader
                virtualColumns={virtualColumns}
                totalWidth={totalWidth}
                dayWidth={dayWidth}
              />
            </div>
          </div>
        </div>

        {/* Nivel 1 — BAR strip ambient. Solo se muestra cuando NO hay
            grouping (caso STR / Airbnb 1 listing / villas flat) — para
            propiedades con groups, el BAR vive por-grupo en el TimelineGrid
            row del grupo. Esto evita el bug "$70 fijo" cuando hay tipos con
            precios distintos (queja usuario 2026-05-16). */}
        {flatRows.filter(r => r.type === 'group').length <= 1 && (
          <BarStrip
            virtualColumns={virtualColumns}
            innerRef={barStripInnerRef}
            columnWidth={TIMELINE.COLUMN_WIDTH}
            dayWidth={dayWidth}
            data={dailyBar}
            onClickStrip={() => setRateQuoteOpen(true)}
          />
        )}

        {/* ── Body: scroll horizontal + vertical en un solo contenedor ── */}
        <div
          ref={scrollContainerRef}
          className="flex flex-1 overflow-auto"
          onScroll={handleScroll}
        >
          {/* RoomColumn — sticky left, z-[25] > booking block max z-20 */}
          <div
            className="sticky left-0 z-[25] bg-white border-r border-slate-200"
            style={{ width: TIMELINE.COLUMN_WIDTH, flexShrink: 0 }}
          >
            <RoomColumn
              embedded
              flatRows={flatRows}
              groups={groups}
              onToggleGroup={toggleGroup}
              readinessTasks={readinessTasks}
              lockedRooms={lockedRooms}
              maintenanceByRoom={maintenanceByRoom}
              onBlockRequest={(roomId) => setBlockModal({ roomId })}
            />
          </div>

          {/* Grid + bookings — z-0 creates an isolated stacking context so the
              sticky room column (z-[25]) always paints above booking blocks. */}
          <div className="relative flex-shrink-0 z-0" style={{ width: totalWidth }}>
            <TimelineGrid
              virtualColumns={virtualColumns}
              totalWidth={totalWidth}
              dayWidth={dayWidth}
              flatRows={flatRows}
              dragTargetRoomId={dragState?.currentRoomId}
              dragIsValid={dragState?.isValid ?? true}
              isDragging={!!dragState || !!extendState}
              onCellClick={(roomId, date) => {
                if (isOccupied(roomId, date)) return
                const roomRow = flatRows.find(r => r.id === roomId && r.type === 'room')
                setCheckInDialog({ open: true, roomId, roomNumber: roomRow?.room?.number ?? roomId.slice(0, 8), checkIn: date })
              }}
              onCellContextMenu={(roomId, date) => {
                setBlockModal({
                  roomId,
                  startDate: format(date, 'yyyy-MM-dd'),
                })
              }}
              isOccupied={isOccupied}
              getRoomRate={(roomId) => {
                const group = groups.find(g => g.rooms.some(r => r.id === roomId))
                if (!group) return undefined
                return { rate: group.baseRate, currency: group.currency }
              }}
            />
            <TodayColumnHighlight
              days={days}
              dayWidth={dayWidth}
              flatRows={flatRows}
              poolStart={POOL_START}
            />
            {/* Extend drag preview overlay
                originLeft aligns with the block's right edge: stayToRect places
                checkOut at (checkOutDays * dayWidth + dayWidth/2), so we offset
                by dayWidth/2 to avoid overlapping the original block. */}
            {extendState && (() => {
              const daysAdded = diffDays(extendState.previewCheckOut, extendState.originalCheckOut)
              const topY = extendState.rowIndex * TIMELINE.ROW_HEIGHT + extendState.groupHeaderOffsetY
              const originLeft = differenceInDays(extendState.originalCheckOut, POOL_START) * dayWidth + dayWidth / 2

              // Engagement indicator: shown immediately on mousedown before crossing
              // the first column mid (Djajadiningrat 2004 — gesture must have instant echo).
              if (daysAdded <= 0) {
                return (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: originLeft,
                      top: topY + 3,
                      width: 6,
                      height: TIMELINE.ROW_HEIGHT - 6,
                      background: 'rgba(16,185,129,0.45)',
                      borderLeft: '3px solid rgba(16,185,129,0.85)',
                      borderRadius: '0 3px 3px 0',
                      zIndex: 15,
                    }}
                  />
                )
              }

              const previewWidth = daysAdded * dayWidth
              const showLabel = previewWidth > 28
              return (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: originLeft,
                    top: topY + 3,
                    width: previewWidth - 2,
                    height: TIMELINE.ROW_HEIGHT - 6,
                    background: 'rgba(16,185,129,0.10)',
                    borderLeft: '3px solid rgba(16,185,129,0.70)',
                    borderTop: '1px solid rgba(16,185,129,0.25)',
                    borderBottom: '1px solid rgba(16,185,129,0.25)',
                    borderRight: '1px solid rgba(16,185,129,0.25)',
                    borderRadius: '0 5px 5px 0',
                    boxShadow: '0 2px 8px rgba(16,185,129,0.12), inset 0 1px 0 rgba(255,255,255,0.4)',
                    zIndex: 15,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 8,
                    overflow: 'hidden',
                  }}
                >
                  {showLabel && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(4,120,87,0.88)', letterSpacing: '-0.02em', lineHeight: 1, whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
                      +{daysAdded}n
                    </span>
                  )}
                </div>
              )
            })()}

            <BlocksLayer
              blocks={roomBlocks}
              flatRows={flatRows}
              dayWidth={dayWidth}
              calendarStart={POOL_START}
              calendarEnd={dataWindow.to}
              totalWidth={totalWidth}
              onBlockClick={(block) => {
                // W3.3 — Si el bloque fue auto-creado por un ticket CRITICAL,
                // abrir el TicketDetailDrawer in-place sobre el calendario
                // (mantiene contexto — Apple HIG 2024 + NN/g 2020). El
                // BlockModal sigue cubriendo bloqueos no-de-mantenimiento.
                if (block.maintenanceTicketId) {
                  openMaintenanceDrawer(block.maintenanceTicketId)
                  return
                }
                setBlockDetail(block)
              }}
            />
            <BookingsLayer
              stays={hideNoShows ? staysWithoutJourneys.filter((s) => !s.noShowAt) : staysWithoutJourneys}
              nsStripeIds={hideNoShows ? undefined : nsStripeIds}
              nsCollisionRanges={hideNoShows ? undefined : nsCollisionRanges}
              flatRows={flatRows}
              days={days}
              dayWidth={dayWidth}
              calendarStart={POOL_START}
              totalWidth={totalWidth}
              dragState={dragState}
              onDragStart={handleDragStartWithPosition}
              onExtendStart={handleExtendStart}
              onStayClick={(stayId) => {
                // 2026-05-15 — click en cualquier bloque que sea parte de un
                // journey activa el journey highlight (foto 3 del feedback).
                // Esto dim los demás bloques al 0.15 y muestra el SVG arrow
                // entre segmentos. Si el stay no tiene journey, solo abre
                // el sheet (comportamiento previo). El sheet se abre siempre.
                const block = stays.find((s) => s.id === stayId)
                  ?? journeyBlocks.find((s) => s.id === stayId)
                if (block?.journeyId) {
                  setActiveJourneyId(block.journeyId)
                }
                openSheet(stayId)
              }}
              onCheckout={(stayId) => {
                closeSheet()
                setActiveJourneyId(null)
                setCheckOutDialog({ open: true, stayId })
              }}
              onNoShow={(stayId) => {
                setNoShowDialog({ stayId })
              }}
              onStartCheckin={(stayId) => {
                closeSheet()
                setCheckinDialog({ stayId })
              }}
              onRevertNoShow={(stayId) => {
                revertNoShowMut.mutate(stayId)
              }}
              onOpenDetail={openSheet}
              potentialNoShowWarningHour={potentialNoShowWarningHour}
              noShowCutoffHour={noShowCutoffHour}
              lockedStays={lockedStays}
              onToggleLock={toggleLock}
              scrollLeft={scrollLeft}
              journeyStays={hideNoShows ? journeyBlocks.filter((s) => !s.noShowAt) : journeyBlocks}
              activeJourneyId={activeJourneyId}
              onSetActiveJourneyId={handleSetActiveJourneyId}
              onActivateJourney={handleSetActiveJourneyId}
              selectedStayId={sheetOpen ? sheetStayId : null}
              hoveredGroupId={hoveredGroupId}
              onGroupHover={setHoveredGroupId}
              // C3.1 v8 — group del stay seleccionado: sus siblings no se
              // atenúan + reciben ring violet. Mantiene visibilidad del grupo
              // al abrir el sheet de un miembro.
              selectedGroupId={sheetOpen ? (sheetStay?.reservationGroupId ?? null) : null}
            />
          </div>
        </div>

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-20 pointer-events-none">
            <div className="flex gap-2 items-center text-sm text-slate-400">
              <div className="animate-spin w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full" />
              Cargando reservas...
            </div>
          </div>
        )}
      </div>

      {/* Occupancy footer — sticky at bottom, sync vía innerRef */}
      <OccupancyFooter
        virtualColumns={virtualColumns}
        stays={stays}
        totalRooms={totalRooms}
        dayWidth={dayWidth}
        columnWidth={TIMELINE.COLUMN_WIDTH}
        innerRef={footerInnerRef}
        readinessTasks={readinessTasks}
        cancelledTodayCount={cancelledTodayCount}
        onOpenCancelledToday={() => setCancelledTodayOpen(true)}
      />

      <CancelledTodayDrawer
        open={cancelledTodayOpen}
        propertyId={PROPERTY_ID}
        onClose={() => setCancelledTodayOpen(false)}
      />

      {/* Nivel 3 — Rate Quote Sheet (side panel desde la derecha) */}
      <RateQuoteSheet
        open={rateQuoteOpen}
        propertyId={PROPERTY_ID}
        onClose={() => setRateQuoteOpen(false)}
      />

      {/* Drag ghost — position updated via DOM ref (no React re-render per frame).
          GPU-composited translate keeps this on the compositor thread. */}
      {dragState && draggedStay && createPortal(
        <div
          ref={ghostRef}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            transform: 'translate(-9999px, -9999px)', // off-screen until first mousemove
            pointerEvents: 'none',
            zIndex: 9998,
            willChange: 'transform',
          }}
        >
          <DragGhost
            dragState={dragState}
            stay={draggedStay}
            dayWidth={dayWidth}
          />
        </div>,
        document.body,
      )}

      {/* ─── Dialogs ─────────────────────────────────────────── */}
      {noShowDialog && noShowTarget && (
        <NoShowConfirmModal
          guestName={noShowTarget.guestName}
          roomNumber={noShowTarget.roomNumber ?? (() => {
            const row = flatRows.find(r => r.id === noShowTarget.roomId && r.type === 'room')
            return row?.room?.number
          })()}
          checkIn={noShowTarget.checkIn}
          checkOut={noShowTarget.checkOut}
          source={noShowTarget.source}
          otaName={noShowTarget.otaName}
          isPending={markNoShowMut.isPending}
          onClose={() => setNoShowDialog(null)}
          onConfirm={() => {
            markNoShowMut.mutate(
              { stayId: noShowDialog.stayId },
              { onSettled: () => setNoShowDialog(null) },
            )
          }}
        />
      )}

      <BookingDetailSheet
        stay={sheetStay}
        open={sheetOpen}
        onClose={() => {
          setActiveJourneyId(null)
          closeSheet()
        }}
        onCheckout={(stayId) => {
          closeSheet()
          setActiveJourneyId(null)
          setCheckOutDialog({ open: true, stayId })
        }}
        onMoveRoom={(stayId) => {
          setMoveRoomDialog({ stayId })
          setActiveJourneyId(null)
          closeSheet()
        }}
        onNoShow={(stayId, opts) => {
          markNoShowMut.mutate({ stayId, ...opts })
        }}
        onRevertNoShow={(stayId) => {
          revertNoShowMut.mutate(stayId)
        }}
        onStartCheckin={(stayId) => {
          closeSheet()
          setCheckinDialog({ stayId })
        }}
        onCancelReservation={(stayId) => {
          closeSheet()
          setActiveJourneyId(null)
          setCancelDialog({ stayId })
        }}
        onConfirmSegmentMove={(segmentId) => {
          confirmMoveMut.mutate({ segmentId })
        }}
        confirmMovePending={confirmMoveMut.isPending}
        onOpenMaintenanceTicket={(id) => openMaintenanceDrawer(id)}
        propertyId={PROPERTY_ID}
        // CHECK-IN C3.1 v2 — group siblings (excluye al stay actual) +
        // callback para saltar a un hermano. Resuelve el caso off-screen.
        // Cada sibling se enriquece con roomNumber resuelto via flatRows
        // (mismo patrón que sheetStay memoizado arriba).
        groupSiblings={
          sheetStay?.reservationGroupId
            ? stays
                .filter(
                  (s) =>
                    s.reservationGroupId === sheetStay.reservationGroupId &&
                    s.id !== sheetStay.id,
                )
                .map((s) => {
                  if (s.roomNumber) return s
                  const roomRow = flatRows.find((r) => r.id === s.roomId && r.type === 'room')
                  return { ...s, roomNumber: roomRow?.room?.number }
                })
            : undefined
        }
        onOpenSibling={(stayId) => {
          // Cierra journey highlight + abre el otro stay. La key del sheet
          // no cambia (mismo componente), pero el `stay` prop sí — sheet
          // re-renderiza con la data del sibling.
          setActiveJourneyId(null)
          openSheet(stayId)
        }}
      />

      <CheckInDialog
        // CHECK-IN C2.3 (2026-05-29) — key fuerza remount cuando cambia
        // de modo (walk-in vs nueva reserva). Sin key, el state interno
        // (paso, checkInNow inicial, defaults) sobrevive entre aperturas.
        key={`checkin-${checkInDialog.walkIn ? 'walkin' : 'new'}-${checkInDialog.open ? 'open' : 'closed'}`}
        open={checkInDialog.open}
        initialRoomId={checkInDialog.roomId}
        roomNumber={checkInDialog.roomNumber}
        initialCheckIn={checkInDialog.checkIn}
        initialCheckInNow={checkInDialog.walkIn ?? false}
        propertyId={PROPERTY_ID}
        onClose={() => setCheckInDialog({ open: false })}
        onConfirm={async (data: NewStayData) => {
          setCheckInDialog({ open: false })
          // CHECK-IN C1.5 walk-in fast-path (2026-05-29) — si el consultor
          // marcó "Hacer check-in ahora" (solo disponible cuando checkIn=today),
          // esperamos a que la creación termine + abrimos ConfirmCheckinDialog
          // con el stayId nuevo. Sin esto, recepcionista debía cazar el bloque
          // del calendario después de crear (2 steps para 1 objetivo).
          try {
            const created = await createStay.mutateAsync({ ...data, propertyId: PROPERTY_ID }) as { id?: string } | undefined
            if (data.checkInNow && created?.id) {
              // Pequeño delay para que la cache se refresque y el bloque
              // aparezca renderizado antes de abrir el siguiente modal.
              setTimeout(() => setCheckinDialog({ stayId: created.id! }), 150)
            }
          } catch {
            // El error ya fue manejado por useCreateGuestStay (toast).
            // No reabrimos checkInDialog para no perder el feedback de error.
          }
        }}
      />

      {/* ─── Confirm check-in dialog (Sprint 8 · CHECK-IN-α §5) ─────────── */}
      {checkinDialog && (() => {
        const raw = [...stays, ...journeyBlocks].find(s => s.id === checkinDialog.stayId) ?? null
        if (!raw) return null
        // Guard: si la stay ya tiene actualCheckin la cache local fue refrescada
        // (SSE checkin.confirmed) entre el momento del click y este render.
        // No abrimos el dialog — auto-cierre + toast informativo. NN/g H1:
        // estado del sistema siempre visible. CLAUDE.md §99 sugerido.
        if (raw.actualCheckin) {
          setTimeout(() => {
            toast('Esta reserva ya está checked-in.', { icon: 'ℹ️' })
            setCheckinDialog(null)
          }, 0)
          return null
        }
        const roomRow = flatRows.find(r => r.id === raw.roomId && r.type === 'room')
        const stay = raw.roomNumber ? raw : { ...raw, roomNumber: roomRow?.room?.number }
        return (
          <ConfirmCheckinDialog
            stay={stay}
            roomLabel={stay.roomNumber ? `Hab. ${stay.roomNumber}` : 'Habitación'}
            open={true}
            onClose={() => setCheckinDialog(null)}
            onConfirm={(data) => {
              // Journey segments tienen id=segmentId; el backend confirmCheckin
              // opera sobre GuestStay parent. Sprint CHECK-IN-α fix Amelia
              // Robinson (seg-tul-205-amelia-2 → guestStayId).
              const realStayId = stay.guestStayId ?? checkinDialog.stayId
              confirmCheckinMut.mutate(
                { stayId: realStayId, data },
                { onSettled: () => setCheckinDialog(null) },
              )
            }}
            isPending={confirmCheckinMut.isPending}
          />
        )
      })()}

      <CheckOutDialog
        stay={(() => {
          // Buscar en stays + journeyBlocks (mismo patrón que BookingDetailSheet
          // line 951). Sin fallback a journeyBlocks, los stays con segments
          // (extensions, room moves) clickeados desde su botón OUT NO abrían
          // el dialog porque viven en journeyBlocks, no en stays.
          const raw =
            stays.find(s => s.id === checkOutDialog.stayId) ??
            journeyBlocks.find(s => s.id === checkOutDialog.stayId) ??
            null
          if (!raw) return null
          if (raw.roomNumber) return raw
          const roomRow = flatRows.find(r => r.id === raw.roomId && r.type === 'room')
          return { ...raw, roomNumber: roomRow?.room?.number }
        })()}
        open={checkOutDialog.open}
        onClose={() => setCheckOutDialog({ open: false, stayId: null })}
        onConfirm={(stayId, _payment) => {
          // Para journey segments, el `stay.id` es el segment id; el endpoint
          // requiere el GuestStay id. Lo recuperamos del bloque para evitar
          // POST /checkout con un id inexistente (404).
          const block =
            stays.find(s => s.id === stayId) ??
            journeyBlocks.find(s => s.id === stayId)
          const realStayId = block?.guestStayId ?? stayId
          checkoutMut.mutate(realStayId)
          setCheckOutDialog({ open: false, stayId: null })
        }}
      />

      {/* ─── Extend confirm dialog ──────────────────────────── */}
      {extendConfirm && (() => {
        const stay = stays.find(s => s.id === extendConfirm.stayId)
          ?? journeyBlocks.find(s => s.id === extendConfirm.stayId)
        if (!stay) return null
        const roomRow = flatRows.find(r => r.id === stay.roomId && r.type === 'room')
        return (
          <ExtendConfirmDialog
            guestName={stay.guestName}
            roomNumber={stay.roomNumber ?? roomRow?.room?.number}
            originalCheckOut={extendConfirm.originalCheckOut}
            newCheckOut={extendConfirm.newCheckOut}
            ratePerNight={stay.ratePerNight}
            originalTotal={stay.totalAmount}
            currency={stay.currency}
            source={stay.source}
            otaName={stay.otaName}
            roomConflict={extendConfirm.roomConflict}
            availableRooms={extendConfirm.availableRooms}
            isPending={extendStayMut.isPending || extendSameRoomMut.isPending || extendNewRoomMut.isPending}
            onClose={() => setExtendConfirm(null)}
            onConfirmNewRoom={(newRoomId) => {
              if (!extendConfirm.journeyId) return
              extendNewRoomMut.mutate(
                { journeyId: extendConfirm.journeyId, newRoomId, newCheckOut: extendConfirm.newCheckOut },
                { onSettled: () => setExtendConfirm(null) },
              )
            }}
            onConfirm={() => {
              if (extendConfirm.journeyId) {
                // Journey-aware path: creates EXTENSION_SAME_ROOM segment → +ext block appears
                extendSameRoomMut.mutate(
                  { journeyId: extendConfirm.journeyId, newCheckOut: extendConfirm.newCheckOut },
                  { onSettled: () => setExtendConfirm(null) },
                )
              } else {
                // Legacy fallback: no journeyId, update GuestStay directly
                extendStayMut.mutate(
                  { stayId: extendConfirm.stayId, newCheckOut: extendConfirm.newCheckOut },
                  { onSettled: () => setExtendConfirm(null) },
                )
              }
            }}
          />
        )
      })()}

      {/* ─── Move room dialog ────────────────────────────────── */}
      {moveRoomDialog && moveRoomTarget && (() => {
        const stayWithRoom = moveRoomTarget.roomNumber
          ? moveRoomTarget
          : { ...moveRoomTarget, roomNumber: flatRows.find(r => r.id === moveRoomTarget.roomId && r.type === 'room')?.room?.number }
        const stayStatus = getStayStatus(moveRoomTarget.checkIn, moveRoomTarget.checkOut, moveRoomTarget.actualCheckout)
        const isInHouse = stayStatus === 'IN_HOUSE'
        const isBusy = isInHouse
          ? (splitMidStayMut.isPending || splitReservationMut.isPending)
          : (moveRoomMut.isPending || splitReservationMut.isPending)

        return (
          <MoveRoomDialog
            stay={stayWithRoom}
            groups={groups}
            flatRows={flatRows}
            stays={allBlocksForDragCheck}
            isInHouse={isInHouse}
            isPending={isBusy}
            initialNewRoomId={moveRoomDialog.preselectedNewRoomId}
            // Antes: drag IN_HOUSE + preselectedNewRoomId activaba split-mode
            // automáticamente, forzando al usuario a fijar boundaries de N partes
            // y disparando validación "primera parte debe mantener la habitación
            // actual" cuando no lo hacían. Caso Amelia 205→202.
            // Ahora: abre en modo simple → onConfirm route a executeMidStayRoomMove
            // (segmento ROOM_MOVE con effectiveDate) que preserva historia 205 +
            // futuro 202 sin necesidad de pelearse con split. Si el usuario quiere
            // dividir en >2 partes puede activar el toggle "Dividir en varias
            // habitaciones" manualmente.
            initialSplitMode={false}
            onClose={() => setMoveRoomDialog(null)}
            onConfirm={(newRoomId, effectiveDate) => {
              if (isInHouse && moveRoomTarget.journeyId) {
                // IN_HOUSE: route to stay-journeys endpoint to create ROOM_MOVE segment
                splitMidStayMut.mutate(
                  {
                    journeyId: moveRoomTarget.journeyId,
                    newRoomId,
                    effectiveDate: effectiveDate ?? startOfDay(new Date()),
                    actorId: currentUserId,
                  },
                  { onSettled: () => setMoveRoomDialog(null) },
                )
              } else {
                // ARRIVING (no journey yet): simple moveRoom
                moveRoomMut.mutate(
                  { stayId: moveRoomDialog.stayId, newRoomId },
                  { onSettled: () => setMoveRoomDialog(null) },
                )
              }
            }}
            onSplit={(parts) => {
              if (!moveRoomTarget.journeyId) {
                toast.error('No se puede dividir: la reserva no tiene journey asociado')
                return
              }
              splitReservationMut.mutate(
                { journeyId: moveRoomTarget.journeyId, parts },
                { onSettled: () => setMoveRoomDialog(null) },
              )
            }}
          />
        )
      })()}
      {moveReservationConfirm && (
        <MoveReservationConfirmDialog
          guestName={moveReservationConfirm.guestName}
          fromRoomNumber={moveReservationConfirm.fromRoomNumber}
          toRoomNumber={moveReservationConfirm.newRoomNumber}
          nights={moveReservationConfirm.nights}
          checkIn={moveReservationConfirm.checkIn}
          checkOut={moveReservationConfirm.checkOut}
          isPending={moveRoomMut.isPending}
          onClose={() => setMoveReservationConfirm(null)}
          onConfirm={() => {
            moveRoomMut.mutate(
              { stayId: moveReservationConfirm.stayId, newRoomId: moveReservationConfirm.newRoomId },
              { onSettled: () => setMoveReservationConfirm(null) },
            )
          }}
        />
      )}
      {moveExtensionConfirm && (
        <MoveExtensionConfirmDialog
          newRoomNumber={moveExtensionConfirm.newRoomNumber}
          nights={moveExtensionConfirm.nights}
          checkIn={moveExtensionConfirm.checkIn}
          checkOut={moveExtensionConfirm.checkOut}
          isExtension={moveExtensionConfirm.isExtension}
          isPending={moveExtensionRoomMut.isPending}
          onClose={() => setMoveExtensionConfirm(null)}
          onConfirm={() => {
            moveExtensionRoomMut.mutate(
              { segmentId: moveExtensionConfirm.segmentId, newRoomId: moveExtensionConfirm.newRoomId },
              { onSettled: () => setMoveExtensionConfirm(null) },
            )
          }}
        />
      )}

      {/* Cancel-Archive dialog (Sprint 2026-05-16) +
          Cancel-Extension (Sprint 2026-05-17): si el bloque es un segmento
          FUTURO de un journey con checkin ya hecho, NO es una cancelación
          de stay completa — es revocar una extensión planeada. Routing
          condicional al endpoint correcto (cancelExtensionSegment vs cancelStay).
          Justificación: 5/5 PMS (Mews/Cloudbeds/Opera/RR/LH) tratan estos
          casos como operaciones distintas; forzar early checkout aquí es
          un anti-pattern que genera audit erróneo + housekeeping prematuro. */}
      {cancelDialog && (() => {
        const stay = stays.find(s => s.id === cancelDialog.stayId)
          ?? journeyBlocks.find(s => s.id === cancelDialog.stayId)
        if (!stay) return null
        const roomRow = flatRows.find(r => r.id === stay.roomId && r.type === 'room')

        // Detección: ¿es un segmento de extensión futuro? Criterios:
        //   - tiene segmentId (es journey block, no stay standalone)
        //   - segment.checkIn > now (futuro, guest no ha entrado a este tramo)
        //   - NO es el primer segmento (si es first y futuro, es la reserva
        //     original sin checkin → cancel-stay normal aplica)
        const now = new Date()
        const isFutureExtensionSegment = !!stay.segmentId
          && stay.checkIn > now
          && !stay.isFirstSegment
        const isPending = isFutureExtensionSegment ? cancelExtMut.isPending : cancelStayMut.isPending

        return (
          <CancelReservationDialog
            stay={{ ...stay, roomNumber: stay.roomNumber ?? roomRow?.room?.number }}
            isPending={isPending}
            onClose={() => setCancelDialog(null)}
            onConfirm={(data) => {
              if (isFutureExtensionSegment && stay.segmentId) {
                cancelExtMut.mutate(
                  { segmentId: stay.segmentId, reason: data.reason },
                  { onSettled: () => setCancelDialog(null) },
                )
              } else {
                cancelStayMut.mutate(
                  { stayId: stay.guestStayId ?? stay.id, data },
                  { onSettled: () => setCancelDialog(null) },
                )
              }
            }}
          />
        )
      })()}

      {/* W3.6 — Drawer local removido. Ahora vive en App.tsx como
          GlobalMaintenanceDrawer leyendo del store useMaintenanceDrawer.
          Cualquier componente puede abrirlo sin acoplar state. */}

      {/* ─── BlockModal — create new block ──────────────────── */}
      <BlockModal
        isOpen={!!blockModal}
        onClose={() => setBlockModal(null)}
        prefillRoomId={blockModal?.roomId}
        prefillStartDate={blockModal?.startDate}
        prefillEndDate={blockModal?.endDate}
        onSubmit={async (dto) => {
          await createBlockMut.mutateAsync(dto)
          setBlockModal(null)
        }}
      />

      {/* ─── Block detail sheet ──────────────────────────────── */}
      {blockDetail && (() => {
        const BLOCK_COLORS: Record<BlockSemantic, { accent: string; bg: string; pill: string; pillText: string }> = {
          [BlockSemantic.OUT_OF_SERVICE]:   { accent: '#f59e0b', bg: 'rgba(245,158,11,0.07)',  pill: 'bg-amber-100',  pillText: 'text-amber-800'  },
          [BlockSemantic.OUT_OF_ORDER]:     { accent: '#ef4444', bg: 'rgba(239,68,68,0.07)',   pill: 'bg-red-100',    pillText: 'text-red-800'    },
          [BlockSemantic.OUT_OF_INVENTORY]: { accent: '#3b82f6', bg: 'rgba(59,130,246,0.07)',  pill: 'bg-blue-100',   pillText: 'text-blue-800'   },
          [BlockSemantic.HOUSE_USE]:        { accent: '#a855f7', bg: 'rgba(168,85,247,0.07)',  pill: 'bg-purple-100', pillText: 'text-purple-800' },
        }
        const SEMANTIC_ICONS: Record<BlockSemantic, string> = {
          [BlockSemantic.OUT_OF_SERVICE]:   '🔧',
          [BlockSemantic.OUT_OF_ORDER]:     '🚫',
          [BlockSemantic.OUT_OF_INVENTORY]: '📦',
          [BlockSemantic.HOUSE_USE]:        '🏠',
        }

        const c = BLOCK_COLORS[blockDetail.semantic]
        const roomNum = (blockDetail.room as any)?.number
        const startD  = parseISO(blockDetail.startDate)
        const endD    = blockDetail.endDate ? parseISO(blockDetail.endDate) : null
        const nights  = endD ? diffDays(endD, startD) : null
        const fmtDate = (d: Date) => format(d, 'dd/MM/yyyy')
        const isPending = blockDetail.status === BlockStatus.PENDING_APPROVAL
        const isApproved = blockDetail.status === BlockStatus.APPROVED
        const canRelease = blockDetail.status === BlockStatus.ACTIVE
        const canCancel  = isPending || isApproved
        const isWorking  = releaseBlockMut.isPending || cancelBlockMut.isPending

        return (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30"
            onClick={() => setBlockDetail(null)}
          >
            <div
              className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:w-[380px] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Accent top bar */}
              <div style={{ height: 4, background: c.accent }} />

              {/* Header */}
              <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3" style={{ background: c.bg }}>
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-slate-900 leading-tight">
                    {roomNum ? `Habitación ${roomNum}` : 'Bloqueo'}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${c.pill} ${c.pillText}`}>
                      {SEMANTIC_ICONS[blockDetail.semantic]} {SEMANTIC_LABELS[blockDetail.semantic]}
                    </span>
                    {isPending && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        ⏳ Pendiente de aprobación
                      </span>
                    )}
                    {isApproved && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        ✓ Aprobado
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setBlockDetail(null)}
                  className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-black/5 transition-colors text-base leading-none mt-0.5"
                >✕</button>
              </div>

              {/* Body */}
              <div className="px-5 py-4 space-y-2.5">
                {/* Reason */}
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-slate-400 shrink-0">Motivo</span>
                  <span className="text-sm text-slate-800 font-medium text-right">{REASON_LABELS[blockDetail.reason]}</span>
                </div>

                {/* Duration */}
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-slate-400 shrink-0">Duración</span>
                  <span className="text-sm text-slate-800 font-medium text-right">
                    {nights !== null ? `${nights} ${nights === 1 ? 'noche' : 'noches'}` : 'Indefinida'}
                  </span>
                </div>

                {/* Dates */}
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-slate-400 shrink-0">Inicio</span>
                  <span className="text-sm text-slate-800 font-mono">{fmtDate(startD)}</span>
                </div>
                {endD && (
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-slate-400 shrink-0">Fin</span>
                    <span className="text-sm text-slate-800 font-mono">{fmtDate(endD)}</span>
                  </div>
                )}

                {/* Creator */}
                {(blockDetail as any).requestedBy?.name && (
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-slate-400 shrink-0">Creado por</span>
                    <span className="text-sm text-slate-800 font-medium text-right">{(blockDetail as any).requestedBy.name}</span>
                  </div>
                )}
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-slate-400 shrink-0">Registrado</span>
                  <span className="text-sm text-slate-800 font-mono">{fmtDate(parseISO(blockDetail.createdAt))}</span>
                </div>

                {/* Notes */}
                {blockDetail.notes && (
                  <div className="mt-1 pt-2.5 border-t border-slate-100">
                    <p className="text-xs text-slate-400 mb-1">Instrucciones</p>
                    <p className="text-sm text-slate-700 leading-snug">{blockDetail.notes}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="px-5 pb-5 pt-1 flex flex-col gap-2">
                {canRelease && (
                  <button
                    disabled={isWorking}
                    onClick={async () => {
                      try {
                        await releaseBlockMut.mutateAsync(blockDetail.id)
                        setBlockDetail(null)
                        toast.success('Habitación liberada')
                      } catch {
                        toast.error('No se pudo liberar la habitación')
                      }
                    }}
                    className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {releaseBlockMut.isPending ? 'Liberando…' : 'Liberar habitación ahora'}
                  </button>
                )}
                {canCancel && (
                  <button
                    disabled={isWorking}
                    onClick={async () => {
                      try {
                        await cancelBlockMut.mutateAsync({ blockId: blockDetail.id, reason: 'Cancelado desde el calendario' })
                        setBlockDetail(null)
                        toast.success('Bloqueo cancelado')
                      } catch {
                        toast.error('No se pudo cancelar el bloqueo')
                      }
                    }}
                    className="w-full py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {cancelBlockMut.isPending ? 'Cancelando…' : 'Cancelar solicitud'}
                  </button>
                )}
                <button
                  className="w-full py-1.5 text-xs text-slate-400 hover:text-indigo-600 transition-colors"
                  onClick={() => { setBlockDetail(null); window.location.href = '/blocks' }}
                >
                  Ver todos los bloqueos →
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
