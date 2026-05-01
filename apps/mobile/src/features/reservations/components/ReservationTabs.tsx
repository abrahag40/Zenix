/**
 * ReservationTabs — segmented-control tab picker.
 *
 * iOS Segmented Control pattern (Apple HIG). Equal-weight tabs,
 * pill indicator under the active one. 4 tabs ≤ Hick's Law sweet spot.
 *
 * The animation of the pill indicator could be added with Reanimated
 * shared values + useAnimatedStyle in a polish pass. For Sprint 8I the
 * tab change is instant — feels native, no janky transition.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

export type DetailTab = 'stay' | 'guest' | 'payments' | 'history'

interface Props {
  active: DetailTab
  onChange: (tab: DetailTab) => void
}

const TABS: { key: DetailTab; label: string }[] = [
  { key: 'stay',     label: 'Estadía' },
  { key: 'guest',    label: 'Huésped' },
  { key: 'payments', label: 'Pagos' },
  { key: 'history',  label: 'Historial' },
]

export function ReservationTabs({ active, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      {TABS.map((t) => {
        const isActive = active === t.key
        return (
          <Pressable
            key={t.key}
            onPress={() => {
              Haptics.selectionAsync()
              onChange(t.key)
            }}
            style={[styles.tab, isActive && styles.tabActive]}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {t.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: colors.canvas.secondary,
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 7,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: 'rgba(16,185,129,0.18)',
  },
  label: {
    fontSize: typography.size.small,
    color: colors.text.secondary,
    fontWeight: typography.weight.medium,
  },
  labelActive: {
    color: colors.brand[400],
    fontWeight: typography.weight.semibold,
  },
})
