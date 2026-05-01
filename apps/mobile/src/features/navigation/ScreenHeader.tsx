/**
 * ScreenHeader — OS-adaptive header with back button.
 *
 * Why a custom component:
 *   Hidden tab routes in expo-router don't auto-render a back arrow,
 *   and the gesture-back inside a Tabs context is unreliable across
 *   iOS / Android. A predictable, custom header guarantees:
 *
 *     - Visible "back" target on every detail screen
 *     - iOS: chevron + thumb-zone left position (HIG)
 *     - Android: arrow icon + Material guidelines
 *     - Hardware-back on Android: handled globally by expo-router
 *     - Swipe-back on iOS: enabled where the underlying nav is a Stack
 *
 * This component intentionally does NOT use Stack.Screen options because
 * that fights with the Tabs context our screens are nested in.
 *
 * Layout:
 *   [‹ Back]    [center title]    [right slot]
 */

import { View, Text, Pressable, StyleSheet, Platform } from 'react-native'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { colors } from '../../design/colors'
import { typography } from '../../design/typography'

interface ScreenHeaderProps {
  title?: string
  /** Optional override — defaults to router.back(). */
  onBack?: () => void
  /** Right-side slot (e.g., overflow menu, action button). */
  rightSlot?: React.ReactNode
  /** Defaults to "Atrás" on iOS, omitted on Android. */
  backLabel?: string
}

export function ScreenHeader({ title, onBack, rightSlot, backLabel }: ScreenHeaderProps) {
  const handleBack = () => {
    Haptics.selectionAsync()
    if (onBack) onBack()
    else if (router.canGoBack()) router.back()
    else router.replace('/(app)')
  }

  // iOS shows chevron + label; Android shows only the arrow icon (Material).
  const isIOS = Platform.OS === 'ios'
  const arrow = isIOS ? '‹' : '←'
  const showLabel = isIOS && (backLabel ?? 'Atrás')

  return (
    <View style={styles.bar}>
      <Pressable
        onPress={handleBack}
        hitSlop={12}
        style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel={backLabel ?? 'Volver'}
      >
        <Text style={styles.arrow}>{arrow}</Text>
        {showLabel && <Text style={styles.backLabel}>{showLabel}</Text>}
      </Pressable>

      {title && (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      )}

      <View style={styles.rightSlot}>{rightSlot}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    minHeight: 44,
    backgroundColor: colors.canvas.primary,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 44,
  },
  backBtnPressed: {
    opacity: 0.5,
  },
  arrow: {
    fontSize: Platform.OS === 'ios' ? 28 : 22,
    color: colors.brand[400],
    fontWeight: '300',
    lineHeight: Platform.OS === 'ios' ? 30 : 24,
  },
  backLabel: {
    fontSize: typography.size.body,
    color: colors.brand[400],
    fontWeight: typography.weight.medium,
    marginLeft: 4,
  },
  title: {
    flex: 1,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
    textAlign: 'center',
  },
  rightSlot: {
    minWidth: 44,
    alignItems: 'flex-end',
  },
})
