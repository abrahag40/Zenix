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

import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator } from 'react-native'
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
import { useRouter } from 'expo-router'
import { useApiResource } from '../../src/api/useApiResource'
import { useSSE } from '../../src/api/useSSE'
import { useAuthStore } from '../../src/store/auth'
import {
  notificationsApi,
  CATEGORY_AVATAR,
  parseMaintenanceTicketUrl,
  type AppNotification,
} from '../../src/features/notifications/notifications.api'

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
  | { type: 'row'; data: AppNotification }

export default function NotificacionesScreen() {
  const router = useRouter()
  const propertyId = useAuthStore((s) => s.user?.propertyId) ?? null

  // Conectado al backend real (era MOCK hasta 2026-05-13). El endpoint sigue
  // staleTime-style con poll de 60s + invalidación por SSE.
  const { data: items = [], isLoading, isRefreshing, refetch } = useApiResource<AppNotification[]>(
    propertyId ? `/v1/notification-center?propertyId=${propertyId}&limit=50` : '',
    { enabled: !!propertyId, pollMs: 60_000 },
  )

  // Optimistic local state — cuando el usuario marca leída, no esperamos
  // el roundtrip para ocultar el dot (Apple HIG: feedback inmediato).
  const [readIds, setReadIds] = useState<Set<string>>(new Set())

  // SSE invalida la lista al recibir cualquier evento de notif center.
  useSSE(
    useCallback((event) => {
      if (typeof event.type === 'string' && event.type.startsWith('notification:')) {
        void refetch()
      }
    }, [refetch]),
  )

  // Reset optimistic state cada vez que llegan datos frescos del backend.
  useEffect(() => {
    setReadIds(new Set())
  }, [items])

  const displayItems = useMemo(
    () => (items ?? []).map((n) => ({ ...n, isRead: n.isRead || readIds.has(n.id) })),
    [items, readIds],
  )

  const unreadCount = displayItems.filter((n) => !n.isRead).length
  const [, setRefreshing] = useState(false)
  const refreshing = isRefreshing

  // Sort + group items into a flat list with section headers.
  const listData = useMemo<Item[]>(() => {
    const sorted = [...displayItems].sort(
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
  }, [displayItems])

  function handleMarkAllRead() {
    if (unreadCount === 0 || !propertyId) return
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    // Optimistic: marca todas localmente antes del roundtrip
    setReadIds(new Set(displayItems.map((n) => n.id)))
    notificationsApi.markAllRead(propertyId).then(() => void refetch()).catch(() => {
      // Rollback en error
      setReadIds(new Set())
      void refetch()
    })
  }

  /*
   * W3.7 mobile — paridad con W3.6 web (GlobalMaintenanceDrawer).
   *
   * Tap en notif hace 2 cosas atómicas:
   *   1) Mark as read (optimistic, rollback en error)
   *   2) Navegar al detalle correspondiente segun actionUrl:
   *      · /maintenance?ticketId=X (formato nuevo)  → push /maintenance/ticket/X
   *      · /maintenance/tickets/X  (formato legacy) → push /maintenance/ticket/X
   *      · /reservations/{id}                       → push /reservas/{id} (futuro)
   *      · sin actionUrl                            → solo marca leída
   *
   * iOS native push transition (slide right-to-left) preserva el contexto
   * — el usuario tap-ea atrás para volver a la lista (Apple HIG 2024
   * Navigation: "always offer a way back").
   */
  function handleRowTap(notif: AppNotification) {
    void Haptics.selectionAsync()
    // Optimistic mark-as-read
    setReadIds((prev) => new Set([...prev, notif.id]))
    notificationsApi.markRead(notif.id).catch(() => {
      setReadIds((prev) => {
        const next = new Set(prev)
        next.delete(notif.id)
        return next
      })
    })
    // Navegar al detalle si hay actionUrl
    if (!notif.actionUrl) return
    const ticketId = parseMaintenanceTicketUrl(notif.actionUrl)
    if (ticketId) {
      router.push(`/maintenance/ticket/${ticketId}`)
    }
  }

  function handleRefresh() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setRefreshing(true)
    void refetch().finally(() => setRefreshing(false))
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
      {isLoading && displayItems.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand[400]} />
          <Text style={styles.loadingText}>Cargando notificaciones…</Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => (item.type === 'header' ? `h-${item.group}` : `n-${item.data.id}`)}
          renderItem={({ item }) =>
            item.type === 'header' ? (
              <SectionHeader label={GROUP_LABEL[item.group]} />
            ) : (
              <NotificationRow data={item.data} onPress={() => handleRowTap(item.data)} />
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
      )}
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

function NotificationRow({ data, onPress }: { data: AppNotification; onPress: () => void }) {
  const scale = useSharedValue(1)
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  // Mapping seguro: si el backend agrega una categoría nueva sin actualizar
  // CATEGORY_AVATAR, fallback al ⚙️ SYSTEM en lugar de crashear el render.
  const avatarMeta = CATEGORY_AVATAR[data.category] ?? CATEGORY_AVATAR.SYSTEM
  const avatarBgColor = (() => {
    if (avatarMeta.bg === 'urgent')  return colors.urgent[500]
    if (avatarMeta.bg === 'warning') return colors.warning[500]
    if (avatarMeta.bg === 'system')  return '#A78BFA'
    if (avatarMeta.bg === 'success') return colors.brand[500]
    if (avatarMeta.bg === 'info')    return colors.brand[400]
    return colors.brand[400]
  })()

  return (
    <Pressable
      onPressIn={() => { scale.value = withSpring(0.98, MOTION.spring.snappy) }}
      onPressOut={() => { scale.value = withSpring(1, MOTION.spring.snappy) }}
      onPress={onPress}
    >
      <Animated.View style={[styles.row, !data.isRead && styles.rowUnread, animStyle]}>
        {/* Avatar — emoji deriva de la categoría real del backend */}
        <View style={[styles.avatar, { backgroundColor: avatarBgColor }]}>
          <Text style={styles.avatarText}>{avatarMeta.emoji}</Text>
        </View>

        {/* Body */}
        <View style={styles.rowContent}>
          <Text style={styles.rowTitle} numberOfLines={2}>{data.title}</Text>
          <Text style={styles.rowBody} numberOfLines={2}>{data.body}</Text>
          <Text style={styles.rowTime}>{relativeTime(data.createdAt)}</Text>
        </View>

        {/* Unread dot — patrón Meta 2020+ (persiste hasta interacción explícita) */}
        {!data.isRead && <View style={styles.unreadDot} />}
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
  // Loading state — first load (no data yet)
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
  },
})
