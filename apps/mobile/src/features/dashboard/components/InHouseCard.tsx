/**
 * InHouseCard v3 — tappable expand with fixed-height scroll.
 *
 * v2 had: tap → navigate to list. User feedback: "El texto del div padre
 * es muy plano, el detalle luce exactamente igual" + "considerar darle un
 * heigth fijo a ese div desplegado con un scroll interno".
 *
 * v3 design (mobile dashboard expand pattern):
 *
 *   ┌─ EN CASA  ────────────────  19 huéspedes ─┐
 *   │ Hab. 11 ocupadas · 4 llegan · 3 salieron  │
 *   │                                            │  ← collapsed (default)
 *   └────────────────────────────────────────────┘
 *
 *   ┌─ EN CASA  ────────────────  19 huéspedes ‹┐
 *   │ ─────────────────────────                  │
 *   │ ┌────────────────────────────────────────┐ │
 *   │ │ Hab. 203 · María García                │ │
 *   │ │ sale mañana 12:00 · 2 pax              │ │
 *   │ ├────────────────────────────────────────┤ │  ← scrollable, fixed h
 *   │ │ Hab. 210 · Sebastián Torres            │ │
 *   │ │ sale mañana 12:00 · 2 pax              │ │
 *   │ ├────────────────────────────────────────┤ │
 *   │ │ Hab. 312 · Sofía Ramírez               │ │
 *   │ │ ...                                     │ │
 *   │ └────────────────────────────────────────┘ │
 *   │ Ver todos los 11 →                        │
 *   └────────────────────────────────────────────┘
 *
 * Why fixed-height scroll instead of flowing list:
 *   - Apple Health "Highlights" widget pattern: 4 rows visible → scroll.
 *   - Stripe Dashboard "Recent activity" card: 5 rows + "View all".
 *   - Prevents the dashboard scroll from becoming unmanageable when one
 *     card has many items.
 *   - User can compare top items without re-finding their scroll position.
 *
 * Sizing decisions (justified):
 *   - Row height: 52px (room number + name on line 1 + meta on line 2,
 *     each at the readable size from `dashboardType`).
 *   - Expanded container height: 240px = 4.6 rows visible. The .6 of a
 *     row is intentional — it reveals there is more to scroll, exactly
 *     the "scroll affordance" pattern (NN/g 2014).
 *   - "Ver todas" CTA appears when count > 4. Tapping navigates to the
 *     reservation list filtered to status=IN_HOUSE.
 */

import { useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  LayoutAnimation,
  UIManager,
  Platform,
  type LayoutChangeEvent,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated'
import { dashboardType } from '../typography'
import { useAuthStore } from '../../../store/auth'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import { MOTION } from '../../../design/motion'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

export interface InHouseRoomItem {
  id: string
  roomNumber: string
  /** Backend redacts to null for HOUSEKEEPER. */
  guestName: string | null
  /** Pre-formatted "sale mañana 12:00 · 2 pax". */
  metaLabel: string
  /** Optional status flair (e.g. "VIP", "Late checkout"). */
  flair?: string | null
}

interface InHouseCardProps {
  guestCount?: number | null
  roomsOccupied?: number | null
  arrivalsToday?: number | null
  departuresToday?: number | null
  /** List of in-house rooms. The card shows them in the expanded section. */
  rooms?: InHouseRoomItem[]
  /**
   * Called AFTER the card finishes expanding, with the layout y-coordinate
   * of the card relative to the parent ScrollView. The dashboard uses this
   * to scroll the parent so the expanded section is fully visible.
   *
   * Without this, the user feedback was: "si quiero seguir bajando en el
   * scroll del div padre y no el div de las habitaciones desplegado, se
   * me dificulta" — the expansion happens below current scroll position
   * and the user has to scroll past their own scroll-attempt area.
   */
  onExpanded?: (cardOffsetY: number, cardHeight: number) => void
}

const EXPANDED_HEIGHT = 240   // 4-5 rows visible (justified above)
const VIEW_ALL_THRESHOLD = 4  // show "Ver todas" CTA above this count

export function InHouseCard({
  guestCount,
  roomsOccupied,
  arrivalsToday,
  departuresToday,
  rooms = [],
  onExpanded,
}: InHouseCardProps) {
  const [expanded, setExpanded] = useState(false)
  const role = useAuthStore((s) => s.user?.role)
  const isHK = role === 'HOUSEKEEPER'

  // Stash the card's layout coords so we can hand them to the parent
  // when the user expands, without forcing a layout pass on every render.
  const layoutRef = useRef<{ y: number; height: number }>({ y: 0, height: 0 })

  const display = guestCount == null ? '—' : guestCount
  const isInteractive = guestCount != null && guestCount > 0 && rooms.length > 0

  const breakdown: string[] = []
  if (roomsOccupied != null && roomsOccupied > 0) {
    breakdown.push(`${roomsOccupied} hab. ocupadas`)
  }
  if (arrivalsToday != null && arrivalsToday > 0) {
    breakdown.push(`${arrivalsToday} llegaron hoy`)
  }
  if (departuresToday != null && departuresToday > 0) {
    breakdown.push(`${departuresToday} salieron`)
  }

  const chevronAngle = useSharedValue(0)
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronAngle.value}deg` }],
  }))

  const toggle = () => {
    if (!isInteractive) return
    Haptics.selectionAsync()
    LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'))
    chevronAngle.value = withSpring(expanded ? 0 : 90, MOTION.spring.snappy)
    const willExpand = !expanded
    setExpanded(willExpand)

    // After the layout transition finishes, ask the parent to scroll the
    // card into a comfortable read position. Delay matches the
    // LayoutAnimation duration so the new height is already laid out.
    if (willExpand && onExpanded) {
      setTimeout(() => {
        onExpanded(layoutRef.current.y, layoutRef.current.height + EXPANDED_HEIGHT)
      }, 240)
    }
  }

  const onCardLayout = (e: LayoutChangeEvent) => {
    layoutRef.current = {
      y: e.nativeEvent.layout.y,
      height: e.nativeEvent.layout.height,
    }
  }

  const showViewAll = rooms.length > VIEW_ALL_THRESHOLD

  return (
    <View style={styles.card} onLayout={onCardLayout}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.headerRow, pressed && isInteractive && styles.pressed]}
      >
        {/* L2 micro label */}
        <View style={styles.headerLeft}>
          <Text style={dashboardType.sectionLabel}>EN CASA</Text>
          {breakdown.length > 0 && (
            <Text style={[dashboardType.caption, { marginTop: 4 }]} numberOfLines={1}>
              {breakdown.join(' · ')}
            </Text>
          )}
        </View>

        {/* L0 hero number */}
        <View style={styles.headerRight}>
          <View style={styles.numRow}>
            <Text style={dashboardType.display}>{display}</Text>
            {guestCount != null && (
              <Text style={dashboardType.caption}>
                {guestCount === 1 ? 'huésped' : 'huéspedes'}
              </Text>
            )}
          </View>
          {isInteractive && (
            <Animated.Text style={[styles.chevron, chevronStyle]}>›</Animated.Text>
          )}
        </View>
      </Pressable>

      {/* Expanded section — fixed height, internal scroll */}
      {expanded && (
        <View style={styles.expandedWrap}>
          <View style={styles.divider} />
          <ScrollView
            style={[styles.expandedScroll, { maxHeight: EXPANDED_HEIGHT }]}
            showsVerticalScrollIndicator
            persistentScrollbar
          >
            {rooms.map((r) => (
              <View key={r.id} style={styles.roomRow}>
                <View style={styles.roomBadge}>
                  <Text style={styles.roomBadgeText}>{r.roomNumber}</Text>
                </View>
                <View style={styles.roomBody}>
                  <View style={styles.roomTopRow}>
                    {/* Name redacted for HK */}
                    {!isHK && r.guestName ? (
                      <Text style={dashboardType.bodyEmphasis} numberOfLines={1}>
                        {r.guestName}
                      </Text>
                    ) : (
                      <Text style={dashboardType.bodyEmphasis} numberOfLines={1}>
                        Habitación ocupada
                      </Text>
                    )}
                    {r.flair && (
                      <View style={styles.flairChip}>
                        <Text style={styles.flairText}>{r.flair}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={dashboardType.caption} numberOfLines={1}>
                    {r.metaLabel}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {showViewAll && (
            <Pressable
              style={styles.viewAllBtn}
              onPress={() => {
                Haptics.selectionAsync()
                router.push('/trabajo?status=IN_HOUSE')
              }}
            >
              <Text style={[dashboardType.action, { color: colors.brand[400] }]}>
                Ver todos ({rooms.length}) →
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.7,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    gap: 12,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  numRow: {
    alignItems: 'flex-end',
    gap: 0,
  },
  chevron: {
    fontSize: 26,
    color: colors.text.tertiary,
    fontWeight: '300',
    lineHeight: 30,
  },
  expandedWrap: {
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginBottom: 8,
  },
  expandedScroll: {
    flexGrow: 0,
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border.subtle,
  },
  roomBadge: {
    minWidth: 48,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(167,139,250,0.14)',
    borderWidth: 1,
    borderColor: '#A78BFA',
    alignItems: 'center',
  },
  roomBadgeText: {
    fontSize: 14,
    color: '#A78BFA',
    fontWeight: typography.weight.bold,
  },
  roomBody: {
    flex: 1,
    gap: 2,
  },
  roomTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flairChip: {
    backgroundColor: 'rgba(245,158,11,0.16)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  flairText: {
    fontSize: 10,
    color: '#FBBF24',
    fontWeight: typography.weight.bold,
    letterSpacing: 0.4,
  },
  viewAllBtn: {
    paddingTop: 12,
    paddingBottom: 4,
    alignItems: 'flex-start',
  },
})
