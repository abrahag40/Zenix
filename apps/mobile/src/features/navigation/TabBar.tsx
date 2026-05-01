/**
 * Custom Tab Bar — Zenix bottom navigation.
 *
 * Why a custom tab bar (not the default expo-router one):
 *
 *   - Brand consistency: dark canvas + emerald accent + custom motion.
 *     The default tab bar is a generic gray strip — clashes with the
 *     premium feel of the login/Hub.
 *
 *   - Animated active indicator: Reanimated v4 spring animates a pill
 *     under the active tab. Mimics SwiftUI `.matchedGeometryEffect`
 *     and the iOS Music app tab bar.
 *
 *   - Haptic feedback per tap: Apple HIG recommends `selectionAsync`
 *     on tab taps (https://developer.apple.com/design/human-interface-guidelines/playing-haptics).
 *
 *   - Stroke→fill icon transition: outlined icon when inactive, filled
 *     when active. Matches Material 3 + SF Symbols pattern.
 *
 *   - Notification badge support: red dot on tabs with unread items
 *     (Meta apps pattern). Pre-attentive (Treisman 1980): user spots
 *     pending work before reading any text.
 *
 *   - Bottom safe-area aware: the tab bar respects iPhone home indicator
 *     and Android navigation gesture bar via SafeAreaInsets.
 *
 * SwiftUI alignment:
 *   This is the equivalent of:
 *
 *     TabView {
 *       Inicio.tabItem { Label("Inicio", systemImage: "house") }
 *       MiDia.tabItem  { Label("Mi día", systemImage: "bed.double") }
 *       Notif.tabItem  { Label("Notif.",  systemImage: "bell") }
 *       Yo.tabItem     { Label("Yo",     systemImage: "person") }
 *     }
 *     .tint(.emerald)
 *
 *   The `.tint()` color = active label/icon color in our implementation.
 */

import { useEffect } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { Department } from '@zenix/shared'
import { useAuthStore } from '../../store/auth'
import { colors } from '../../design/colors'
import { typography } from '../../design/typography'
import { MOTION } from '../../design/motion'
import { IconHome, IconBed, IconBell, IconUser } from '../../design/icons'
import { IconWrench } from '../maintenance/icons'
import { IconWasher } from '../laundry/icons'
import { IconBuilding } from '../public-areas/icons'
import { IconTree } from '../gardening/icons'
import { IconConcierge } from '../reception/icons'

type IconComponent = (p: { size?: number; color?: string; active?: boolean }) => React.JSX.Element

interface TabConfig {
  label: string
  Icon: IconComponent
  routeName: string
}

/**
 * "Mi día" icon adapts to the user's department (AD-011).
 * Mantenimiento ve llave inglesa, jardinería ve árbol, etc.
 * Reinforces module identity at glance — pre-attentive feature processing.
 */
function pickWorkIcon(department?: Department): IconComponent {
  switch (department) {
    case Department.MAINTENANCE:  return IconWrench
    case Department.LAUNDRY:      return IconWasher
    case Department.PUBLIC_AREAS: return IconBuilding
    case Department.GARDENING:    return IconTree
    case Department.RECEPTION:    return IconConcierge
    case Department.HOUSEKEEPING:
    default:                       return IconBed
  }
}

const STATIC_TABS = {
  index:           { label: 'Inicio',    Icon: IconHome, routeName: 'index' as const },
  notificaciones:  { label: 'Notif.',    Icon: IconBell, routeName: 'notificaciones' as const },
  yo:              { label: 'Yo',        Icon: IconUser, routeName: 'yo' as const },
}

export function ZenixTabBar(props: BottomTabBarProps) {
  const { state, descriptors, navigation } = props
  const insets = useSafeAreaInsets()
  const department = useAuthStore((s) => s.user?.department)

  // Build the per-render config — "Mi día" icon depends on user.department.
  const TAB_CONFIG: Record<string, TabConfig> = {
    index:           STATIC_TABS.index,
    trabajo:         { label: 'Mi día', Icon: pickWorkIcon(department), routeName: 'trabajo' },
    notificaciones:  STATIC_TABS.notificaciones,
    yo:              STATIC_TABS.yo,
  }

  // Filter to only the routes we have configured (skip anything else
  // expo-router auto-discovers — like task/[id] which lives in a stack).
  const tabs = state.routes.filter((r) => r.name in TAB_CONFIG)
  const activeIndex = tabs.findIndex((r) => r.key === state.routes[state.index]?.key)

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom || 12 }]}>
      <View style={styles.bar}>
        {tabs.map((route, idx) => {
          const cfg = TAB_CONFIG[route.name]
          const focused = idx === activeIndex
          const { options } = descriptors[route.key]
          const badgeCount = options.tabBarBadge as number | undefined

          const onPress = () => {
            Haptics.selectionAsync()
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            })
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name)
            }
          }

          return (
            <TabItem
              key={route.key}
              label={cfg.label}
              Icon={cfg.Icon as IconComponent}
              focused={focused}
              onPress={onPress}
              badgeCount={badgeCount}
            />
          )
        })}
      </View>
    </View>
  )
}

// ─── Single tab item with animated press + active state ─────────────────────
interface TabItemProps {
  label: string
  Icon: IconComponent
  focused: boolean
  onPress: () => void
  badgeCount?: number
}

function TabItem({ label, Icon, focused, onPress, badgeCount }: TabItemProps) {
  // Two animated values:
  //   - press: 0 → 1 on tap (scale 0.92), back on release. Tactile feedback.
  //   - active: 0 → 1 when focused. Drives icon color, label color, indicator.
  const press = useSharedValue(1)
  const active = useSharedValue(focused ? 1 : 0)

  useEffect(() => {
    active.value = withSpring(focused ? 1 : 0, MOTION.spring.standard)
  }, [focused])

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }))

  // Indicator pill that grows under the active tab. Uses opacity + scaleY
  // from active.value — animates spring on tab switch.
  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: active.value,
    transform: [{ scaleY: 0.4 + active.value * 0.6 }],
  }))

  const color = focused ? colors.brand[500] : colors.text.tertiary

  return (
    <Pressable
      onPressIn={() => { press.value = withSpring(0.92, MOTION.spring.snappy) }}
      onPressOut={() => { press.value = withSpring(1, MOTION.spring.snappy) }}
      onPress={onPress}
      style={styles.itemPressable}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
    >
      <Animated.View style={[styles.item, containerStyle]}>
        {/* Active indicator (small pill above icon) */}
        <Animated.View style={[styles.indicator, indicatorStyle]} />

        <View style={styles.iconWrap}>
          <Icon size={24} color={color} active={focused} />
          {/* Notification badge — Meta-app pattern. Red dot indicates
              unread, optional count for >0 items (cap at 99+). */}
          {badgeCount !== undefined && badgeCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {badgeCount > 99 ? '99+' : badgeCount}
              </Text>
            </View>
          )}
        </View>

        <Text style={[styles.label, { color }]} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.canvas.primary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.subtle,
  },
  bar: {
    flexDirection: 'row',
    paddingTop: 6,
    paddingHorizontal: 4,
  },
  itemPressable: {
    flex: 1,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 8,
    gap: 4,
  },
  indicator: {
    position: 'absolute',
    top: 0,
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.brand[500],
  },
  iconWrap: {
    position: 'relative',
  },
  // Notification badge (Meta-app style: red circle, top-right of icon)
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.urgent[500],
    paddingHorizontal: 5,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.canvas.primary,  // ring matches container = "cut-out"
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: typography.weight.bold,
    lineHeight: 12,
  },
  label: {
    fontSize: typography.size.micro,
    fontWeight: typography.weight.medium,
    letterSpacing: 0.2,
  },
})
