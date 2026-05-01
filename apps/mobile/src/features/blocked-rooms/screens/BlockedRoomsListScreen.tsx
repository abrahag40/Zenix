/**
 * BlockedRoomsListScreen — full list when "Ver todas" is tapped on the
 * dashboard card. Replaces the dashboard modal pattern with a real screen.
 *
 * Why a screen and not a modal:
 *   - Bug fix: the modal pattern showed a blank panel during the close
 *     animation because the content was conditionally rendered against
 *     `selected != null`. Pressing close set selected to null instantly,
 *     unmounting the body before the modal sheet finished sliding down.
 *   - UX: a full screen gives room to group by category, show timelines,
 *     and accommodate >20 rooms without saturating the dashboard card.
 *   - Native back gesture works correctly inside expo-router stacks.
 *
 * Layout:
 *   ‹ Atrás                    Habitaciones bloqueadas
 *
 *   ⚠ 🔧 MANTENIMIENTO  (3)
 *   ┌── BlockedRoomRow ──────────────────┐
 *   ┌── BlockedRoomRow ──────────────────┐
 *   ┌── BlockedRoomRow ──────────────────┐
 *
 *   🎨 RENOVACIÓN  (1)
 *   ┌── BlockedRoomRow ──────────────────┐
 *
 * Privacy:
 *   - Backend will redact `requestedByName`/`approvedByName` for HOUSEKEEPER
 *     role (Sprint 9). For Sprint 8I, mock is already structured this way.
 */

import { useMemo } from 'react'
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
import { ScreenHeader } from '../../navigation/ScreenHeader'
import { dashboardType } from '../../dashboard/typography'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import {
  MOCKS_DASHBOARD_ENABLED,
  MOCK_BLOCKED_ROOMS,
} from '../../dashboard/__mocks__/mockDashboard'
import type { BlockedRoom } from '../../dashboard/components/BlockedRoomsCard'

const CATEGORY_INFO: Record<
  BlockedRoom['category'],
  { fg: string; bg: string; emoji: string; label: string }
> = {
  MAINTENANCE: { fg: '#FBBF24', bg: 'rgba(245,158,11,0.12)', emoji: '🔧', label: 'Mantenimiento' },
  RENOVATION:  { fg: '#A78BFA', bg: 'rgba(168,139,250,0.14)', emoji: '🎨', label: 'Renovación' },
  ADMIN:       { fg: '#60A5FA', bg: 'rgba(59,130,246,0.14)', emoji: '🔒', label: 'Administrativo' },
  OTHER:       { fg: '#9CA3AF', bg: 'rgba(255,255,255,0.06)', emoji: '•',  label: 'Otro' },
}

export function BlockedRoomsListScreen() {
  const list: BlockedRoom[] = MOCKS_DASHBOARD_ENABLED ? MOCK_BLOCKED_ROOMS : []

  const grouped = useMemo(() => {
    const map = new Map<BlockedRoom['category'], BlockedRoom[]>()
    for (const r of list) {
      const arr = map.get(r.category) ?? []
      arr.push(r)
      map.set(r.category, arr)
    }
    const order: BlockedRoom['category'][] = ['MAINTENANCE', 'RENOVATION', 'ADMIN', 'OTHER']
    return order.flatMap((cat) =>
      map.has(cat) ? [{ cat, rooms: map.get(cat)! }] : [],
    )
  }, [list])

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title="Habitaciones bloqueadas" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heroSummary}>
          {list.length === 0
            ? 'Sin bloqueos activos. Todas las habitaciones disponibles para venta.'
            : `${list.length} habitación${list.length !== 1 ? 'es' : ''} bloqueada${list.length !== 1 ? 's' : ''} actualmente`}
        </Text>

        {grouped.map(({ cat, rooms }) => {
          const info = CATEGORY_INFO[cat]
          return (
            <View key={cat} style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupEmoji}>{info.emoji}</Text>
                <Text style={[dashboardType.sectionLabel, { color: info.fg }]}>
                  {info.label.toUpperCase()}
                </Text>
                <Text style={styles.groupCount}>· {rooms.length}</Text>
              </View>

              <View style={styles.rows}>
                {rooms.map((room) => (
                  <BlockedRoomRow key={room.id} room={room} />
                ))}
              </View>
            </View>
          )
        })}
      </ScrollView>
    </SafeAreaView>
  )
}

function BlockedRoomRow({ room }: { room: BlockedRoom }) {
  const info = CATEGORY_INFO[room.category]
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => {
        Haptics.selectionAsync()
        router.push(`/blocked-rooms/${room.id}`)
      }}
    >
      <View style={[styles.roomBadge, { backgroundColor: info.bg, borderColor: info.fg }]}>
        <Text style={[styles.roomBadgeText, { color: info.fg }]}>{room.roomNumber}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={dashboardType.bodyEmphasis} numberOfLines={1}>
          {room.reason}
        </Text>
        <Text style={dashboardType.caption} numberOfLines={1}>
          {room.rangeLabel}
          {room.ticketId ? ` · ${room.ticketId}` : ''}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas.primary,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 22,
  },
  heroSummary: {
    fontSize: 16,
    color: colors.text.secondary,
    lineHeight: 22,
    paddingTop: 4,
  },
  group: {
    gap: 10,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  groupEmoji: {
    fontSize: 14,
  },
  groupCount: {
    fontSize: 11,
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
  },
  rows: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  rowPressed: {
    opacity: 0.65,
  },
  roomBadge: {
    minWidth: 56,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  roomBadgeText: {
    fontSize: 16,
    fontWeight: typography.weight.bold,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  chevron: {
    fontSize: 22,
    color: colors.text.tertiary,
    fontWeight: '300',
  },
})
