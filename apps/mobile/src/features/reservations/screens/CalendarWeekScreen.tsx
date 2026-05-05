/**
 * CalendarWeekScreen — secondary inspection view (Research #4 §5.1, §5.2 #6).
 *
 * NOT the landing screen — the list is. This view answers a single
 * type of question that the list answers poorly: "is room X free on
 * Friday?" — a 7-day occupancy snapshot per room.
 *
 * Design rules:
 *   - 7 columns (días), scroll horizontal por semana — no infinito
 *   - Filas de habitaciones, scroll vertical
 *   - Bloques compactos (color por estado, sin texto interno)
 *   - SOLO LECTURA: tap → ReservationDetailScreen. Sin drag, sin resize.
 *   - Hoy resaltado con columna verde tenue (consistente con web PMS)
 *
 * NOT implemented (Sprint 9+):
 *   - Filtro por piso
 *   - Tooltip on long-press
 *   - Pinch-to-zoom (NN/g 2023: laggy en RN; rechazado)
 */

import { useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import { ScreenHeader } from '../../navigation/ScreenHeader'
import {
  MOCK_RESERVATIONS_LIST,
  MOCKS_RES_ENABLED,
} from '../__mocks__/mockReservations'
import type { ReservationListItem, ReservationStatus } from '../types'

const COL_WIDTH = 60
const ROW_HEIGHT = 44
const ROOM_COL_WIDTH = 72

const STATUS_BG: Record<ReservationStatus, string> = {
  UNCONFIRMED: 'rgba(245,158,11,0.30)',
  IN_HOUSE:    'rgba(16,185,129,0.30)',
  DEPARTING:   'rgba(59,130,246,0.30)',
  UPCOMING:    'rgba(255,255,255,0.10)',
  NO_SHOW:     'rgba(239,68,68,0.20)',
  DEPARTED:    'rgba(255,255,255,0.06)',
  CANCELLED:   'rgba(255,255,255,0.06)',
}
const STATUS_BORDER: Record<ReservationStatus, string> = {
  UNCONFIRMED: '#FBBF24',
  IN_HOUSE:    '#34D399',
  DEPARTING:   '#60A5FA',
  UPCOMING:    '#9CA3AF',
  NO_SHOW:     '#F87171',
  DEPARTED:    '#9CA3AF',
  CANCELLED:   '#9CA3AF',
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function buildDays(anchor: Date): Date[] {
  const start = startOfDay(anchor)
  return Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 86_400_000))
}

const DAY_NAME = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

function spansDay(item: ReservationListItem, day: Date): boolean {
  const dayStart = startOfDay(day).getTime()
  const dayEnd = dayStart + 86_400_000
  const checkin = new Date(item.checkinAt).getTime()
  const checkout = new Date(item.scheduledCheckout).getTime()
  // Overlap test: stay overlaps day if checkin < dayEnd && checkout > dayStart
  return checkin < dayEnd && checkout > dayStart
}

interface RoomRow {
  number: string
  cells: { item: ReservationListItem | null; isStart: boolean; isEnd: boolean; spanLength: number }[]
}

function buildRows(items: ReservationListItem[], days: Date[]): RoomRow[] {
  const byRoom = new Map<string, ReservationListItem[]>()
  for (const it of items) {
    if (!it.roomNumber) continue
    const list = byRoom.get(it.roomNumber) ?? []
    list.push(it)
    byRoom.set(it.roomNumber, list)
  }
  const rows: RoomRow[] = []
  const sortedRoomNumbers = Array.from(byRoom.keys()).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  for (const number of sortedRoomNumbers) {
    const itemsInRoom = byRoom.get(number)!
    const cells = days.map((day) => {
      const overlap = itemsInRoom.find((it) => spansDay(it, day)) ?? null
      const isStart =
        overlap && startOfDay(new Date(overlap.checkinAt)).getTime() === startOfDay(day).getTime()
      const isEnd =
        overlap && startOfDay(new Date(overlap.scheduledCheckout)).getTime() === startOfDay(day).getTime()
      return { item: overlap, isStart: !!isStart, isEnd: !!isEnd, spanLength: 1 }
    })
    rows.push({ number, cells })
  }
  return rows
}

export function CalendarWeekScreen() {
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()))
  const days = useMemo(() => buildDays(anchor), [anchor])
  const items = MOCKS_RES_ENABLED ? MOCK_RESERVATIONS_LIST : []
  const rows = useMemo(() => buildRows(items, days), [items, days])

  const todayKey = startOfDay(new Date()).getTime()

  const goPrev = () => {
    Haptics.selectionAsync()
    setAnchor(new Date(anchor.getTime() - 7 * 86_400_000))
  }
  const goNext = () => {
    Haptics.selectionAsync()
    setAnchor(new Date(anchor.getTime() + 7 * 86_400_000))
  }
  const goToday = () => {
    Haptics.selectionAsync()
    setAnchor(startOfDay(new Date()))
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Calendario semanal" />
      {/* Page title + week navigator */}
      <View style={styles.headerWrap}>
        <View style={styles.navRow}>
          <Pressable onPress={goPrev} style={styles.navBtn}>
            <Text style={styles.navBtnText}>‹</Text>
          </Pressable>
          <Pressable onPress={goToday} style={[styles.navBtn, styles.navBtnPrimary]}>
            <Text style={[styles.navBtnText, styles.navBtnTextPrimary]}>Hoy</Text>
          </Pressable>
          <Pressable onPress={goNext} style={styles.navBtn}>
            <Text style={styles.navBtnText}>›</Text>
          </Pressable>
        </View>
        <Text style={styles.rangeLabel}>
          {days[0].toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} —{' '}
          {days[6].toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
        </Text>
      </View>

      {/* Day header (sticky) + grid */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Day header row */}
          <View style={styles.headerRow}>
            <View style={[styles.roomCell, styles.headerRoomCell]}>
              <Text style={styles.headerRoomLabel}>HAB.</Text>
            </View>
            {days.map((d) => {
              const isToday = startOfDay(d).getTime() === todayKey
              return (
                <View
                  key={d.toISOString()}
                  style={[styles.dayHeaderCell, isToday && styles.dayHeaderToday]}
                >
                  <Text style={[styles.dayHeaderName, isToday && styles.dayHeaderTextToday]}>
                    {DAY_NAME[d.getDay()]}
                  </Text>
                  <Text style={[styles.dayHeaderNum, isToday && styles.dayHeaderTextToday]}>
                    {d.getDate()}
                  </Text>
                </View>
              )
            })}
          </View>

          {/* Body — scroll vertical */}
          <ScrollView showsVerticalScrollIndicator={false}>
            {rows.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>📅</Text>
                <Text style={styles.emptyText}>Sin reservas en esta semana</Text>
              </View>
            ) : (
              rows.map((row) => (
                <View key={row.number} style={styles.gridRow}>
                  <View style={[styles.roomCell, styles.bodyRoomCell]}>
                    <Text style={styles.roomNumber}>{row.number}</Text>
                  </View>
                  {row.cells.map((cell, idx) => {
                    const day = days[idx]
                    const isToday = startOfDay(day).getTime() === todayKey
                    if (!cell.item) {
                      return (
                        <View
                          key={idx}
                          style={[
                            styles.dayCell,
                            isToday && styles.dayCellToday,
                          ]}
                        />
                      )
                    }
                    const tint = STATUS_BG[cell.item.status]
                    const border = STATUS_BORDER[cell.item.status]
                    return (
                      <Pressable
                        key={idx}
                        style={[styles.dayCell, isToday && styles.dayCellToday]}
                        onPress={() => {
                          Haptics.selectionAsync()
                          router.push(`/reservation/${cell.item!.id}`)
                        }}
                      >
                        <View
                          style={[
                            styles.block,
                            { backgroundColor: tint, borderColor: border },
                            cell.isStart && styles.blockStart,
                            cell.isEnd && styles.blockEnd,
                          ]}
                        />
                      </Pressable>
                    )
                  })}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas.primary,
  },
  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 10,
  },
  title: {
    fontSize: typography.size.hero,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    letterSpacing: typography.letterSpacing.hero,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    minWidth: 44,
    alignItems: 'center',
  },
  navBtnPrimary: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderColor: colors.brand[400],
  },
  navBtnText: {
    fontSize: typography.size.body,
    color: colors.text.primary,
    fontWeight: typography.weight.semibold,
  },
  navBtnTextPrimary: {
    color: colors.brand[400],
  },
  rangeLabel: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: colors.canvas.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  roomCell: {
    width: ROOM_COL_WIDTH,
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.border.subtle,
  },
  headerRoomCell: {
    backgroundColor: colors.canvas.tertiary,
  },
  bodyRoomCell: {
    backgroundColor: colors.canvas.secondary,
  },
  headerRoomLabel: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wide,
  },
  roomNumber: {
    fontSize: typography.size.small,
    color: colors.text.primary,
    fontWeight: typography.weight.semibold,
  },
  dayHeaderCell: {
    width: COL_WIDTH,
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.border.subtle,
  },
  dayHeaderToday: {
    backgroundColor: 'rgba(16,185,129,0.10)',
  },
  dayHeaderName: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    fontWeight: typography.weight.bold,
  },
  dayHeaderNum: {
    fontSize: typography.size.body,
    color: colors.text.primary,
    fontWeight: typography.weight.bold,
  },
  dayHeaderTextToday: {
    color: colors.brand[400],
  },
  gridRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  dayCell: {
    width: COL_WIDTH,
    height: ROW_HEIGHT,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border.subtle,
    padding: 4,
  },
  dayCellToday: {
    backgroundColor: 'rgba(16,185,129,0.04)',
  },
  block: {
    flex: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderRightWidth: 0,
  },
  blockStart: {
    borderLeftWidth: 3,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    marginLeft: 2,
  },
  blockEnd: {
    borderRightWidth: 3,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    marginRight: 2,
  },
  emptyState: {
    paddingVertical: 80,
    alignItems: 'center',
    gap: 8,
  },
  emptyEmoji: {
    fontSize: 48,
  },
  emptyText: {
    fontSize: typography.size.body,
    color: colors.text.secondary,
  },
})
