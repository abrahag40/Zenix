/**
 * Notificaciones — Tab 3 (Meta-style notification feed).
 *
 * Design rationale (competitive analysis with citation):
 *
 *   Pattern source: Facebook, Instagram, WhatsApp, LinkedIn — all
 *   converged on the same notification feed layout. Why:
 *
 *   1. Single chronological list, newest first
 *      - Easiest mental model (NN/g 2018 mobile-list studies).
 *      - Pull-to-refresh updates without losing scroll position.
 *
 *   2. Category-grouped sections (Hoy / Esta semana / Más antiguas)
 *      - Reduces cognitive load via temporal anchors (Ebbinghaus
 *        spacing effect — recent items are easier to recall).
 *      - Empty groups are simply omitted, never shown as "0 items".
 *
 *   3. Each row: avatar + title + body + timestamp + unread dot
 *      - Avatar (icon or emoji) communicates category at-a-glance —
 *        pre-attentive (Treisman 1980) before reading text.
 *      - Title bold, body regular, timestamp tertiary — visual hierarchy
 *        per Material Design 3 typography scale.
 *      - Unread = small emerald dot on the right edge. Removed once
 *        the row is tapped or "Marcar todo como leído" is pressed.
 *
 *   4. Action: "Marcar todo como leído"
 *      - Always visible at the top right (Apple HIG: persistent
 *        actions, never hidden in submenus).
 *
 *   5. Empty state with brand
 *      - When zero notifications, a friendly illustration + copy.
 *      - Apple HIG empty states: "Communicate value, not absence."
 *
 *   Reference for grouping by relative time:
 *     - WhatsApp groups by "Today / Yesterday / older"
 *     - Apple Mail uses "Today / Yesterday / Last 7 days"
 *     - We use "Hoy / Esta semana / Más antiguas" — matches Spanish
 *       conventions.
 */

import { useMemo, useState } from 'react'
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated'
import { colors } from '../../src/design/colors'
import { typography } from '../../src/design/typography'
import { MOTION } from '../../src/design/motion'
import {
  MOCK_NOTIFICATIONS,
  type MockNotification,
} from '../../src/features/notifications/mockData'

// ─── Time grouping helpers (matches WhatsApp / Apple Mail patterns) ─────────
type Group = 'today' | 'thisWeek' | 'older'

function groupOf(iso: string): Group {
  const ms = Date.now() - new Date(iso).getTime()
  const hours = ms / (1000 * 60 * 60)
  if (hours < 24) return 'today'
  if (hours < 24 * 7) return 'thisWeek'
  return 'older'
}

const GROUP_LABEL: Record<Group, string> = {
  today: 'Hoy',
  thisWeek: 'Esta semana',
  older: 'Más antiguas',
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `hace ${d}d`
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

// ─── List item shape (header or row) ────────────────────────────────────────
type Item =
  | { type: 'header'; group: Group }
  | { type: 'row'; data: MockNotification }

export default function NotificacionesScreen() {
  const [items, setItems] = useState(MOCK_NOTIFICATIONS)
  const [refreshing, setRefreshing] = useState(false)

  const unreadCount = items.filter((n) => !n.read).length

  // Sort + group items into a flat list with section headers.
  const listData = useMemo<Item[]>(() => {
    const sorted = [...items].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    const result: Item[] = []
    let lastGroup: Group | null = null
    for (const n of sorted) {
      const g = groupOf(n.createdAt)
      if (g !== lastGroup) {
        result.push({ type: 'header', group: g })
        lastGroup = g
      }
      result.push({ type: 'row', data: n })
    }
    return result
  }, [items])

  function handleMarkAllRead() {
    if (unreadCount === 0) return
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  function handleRowTap(id: string) {
    Haptics.selectionAsync()
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  function handleRefresh() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setRefreshing(true)
    // Simulate network — in prod this is a useQuery refetch.
    setTimeout(() => setRefreshing(false), 800)
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* ── Header ───────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Notificaciones</Text>
          {unreadCount > 0 && (
            <Text style={styles.unreadCount}>
              {unreadCount} sin leer
            </Text>
          )}
        </View>
        <Pressable
          onPress={handleMarkAllRead}
          hitSlop={10}
          disabled={unreadCount === 0}
          style={({ pressed }) => [
            styles.markAllBtn,
            unreadCount === 0 && styles.markAllBtnDisabled,
            pressed && unreadCount > 0 && { opacity: 0.7 },
          ]}
        >
          <Text style={[styles.markAllText, unreadCount === 0 && styles.markAllTextDisabled]}>
            Marcar todo
          </Text>
        </Pressable>
      </View>

      {/* ── List ─────────────────────────────────────────────────── */}
      <FlatList
        data={listData}
        keyExtractor={(item) => (item.type === 'header' ? `h-${item.group}` : `n-${item.data.id}`)}
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <SectionHeader label={GROUP_LABEL[item.group]} />
          ) : (
            <NotificationRow data={item.data} onPress={() => handleRowTap(item.data.id)} />
          )
        }
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={<EmptyState />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand[400]}
          />
        }
      />
    </SafeAreaView>
  )
}

// ─── Subcomponents ─────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{label}</Text>
    </View>
  )
}

function NotificationRow({ data, onPress }: { data: MockNotification; onPress: () => void }) {
  const scale = useSharedValue(1)
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const avatarBgColor = (() => {
    if (data.avatarBg === 'urgent') return colors.urgent[500]
    if (data.avatarBg === 'warning') return colors.warning[500]
    if (data.avatarBg === 'system') return '#A78BFA'
    return colors.brand[data.avatarBg]
  })()

  return (
    <Pressable
      onPressIn={() => { scale.value = withSpring(0.98, MOTION.spring.snappy) }}
      onPressOut={() => { scale.value = withSpring(1, MOTION.spring.snappy) }}
      onPress={onPress}
    >
      <Animated.View style={[styles.row, !data.read && styles.rowUnread, animStyle]}>
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: avatarBgColor }]}>
          <Text style={styles.avatarText}>{data.avatar}</Text>
        </View>

        {/* Body */}
        <View style={styles.rowContent}>
          <Text style={styles.rowTitle} numberOfLines={2}>{data.title}</Text>
          <Text style={styles.rowBody} numberOfLines={2}>{data.body}</Text>
          <Text style={styles.rowTime}>{relativeTime(data.createdAt)}</Text>
        </View>

        {/* Unread dot — small emerald disc on the right edge */}
        {!data.read && <View style={styles.unreadDot} />}
      </Animated.View>
    </Pressable>
  )
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Text style={styles.emptyIconText}>🔔</Text>
      </View>
      <Text style={styles.emptyTitle}>Todo al día</Text>
      <Text style={styles.emptyBody}>
        No tienes notificaciones nuevas. Cuando algo requiera tu atención, aparecerá aquí.
      </Text>
    </View>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas.primary,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: typography.size.titleLg,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    letterSpacing: typography.letterSpacing.title,
  },
  unreadCount: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  markAllBtn: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  markAllBtnDisabled: {
    opacity: 0.4,
  },
  markAllText: {
    fontSize: typography.size.small,
    color: colors.brand[400],
    fontWeight: typography.weight.semibold,
  },
  markAllTextDisabled: {
    color: colors.text.tertiary,
  },
  // Section header
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  sectionHeaderText: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
    fontWeight: typography.weight.semibold,
  },
  // List
  listContent: {
    paddingBottom: 32,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.subtle,
    marginLeft: 76,        // align with content (skip past avatar)
  },
  // Row
  row: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
    backgroundColor: 'transparent',
  },
  rowUnread: {
    backgroundColor: 'rgba(16,185,129,0.04)',  // very subtle emerald tint for unread
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 22,
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
    lineHeight: typography.size.body * typography.lineHeight.normal,
  },
  rowBody: {
    fontSize: typography.size.small,
    color: colors.text.secondary,
    lineHeight: typography.size.small * typography.lineHeight.relaxed,
    marginTop: 2,
  },
  rowTime: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand[500],
    alignSelf: 'center',
  },
  // Empty state
  empty: {
    paddingTop: 80,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.canvas.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  emptyIconText: {
    fontSize: 32,
  },
  emptyTitle: {
    fontSize: typography.size.title,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: typography.size.body,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: typography.size.body * typography.lineHeight.relaxed,
    maxWidth: 320,
  },
})
