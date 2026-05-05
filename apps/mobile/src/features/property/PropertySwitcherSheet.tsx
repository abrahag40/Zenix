/**
 * PropertySwitcherSheet
 *
 * Bottom sheet that lists all properties in the organization and lets
 * SUPERVISOR / RECEPTIONIST switch the active property.
 *
 * UX principles:
 *   - Apple HIG Action Sheet pattern: list of options, clearly labeled,
 *     current selection highlighted.
 *   - BrandLoader covers the screen while the new JWT is fetched —
 *     same pattern as login (SwiftUI-equivalent conditional view swap).
 *   - Haptic feedback on selection (Haptics.impactAsync MEDIUM) signals
 *     a meaningful context switch, not a trivial navigation.
 *   - Error surfaces as Alert (not silent) per CLAUDE.md §33.
 */

import { useEffect, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useAuthStore } from '../../store/auth'
import { api } from '../../api/client'
import { colors } from '../../design/colors'
import { typography } from '../../design/typography'
import { MOTION } from '../../design/motion'
import { createLogger } from '../../logger'

const log = createLogger('property-switcher')

interface PropertyOption {
  id: string
  name: string
  type: string
  isCurrent: boolean
}

interface Props {
  visible: boolean
  onClose: () => void
}

export function PropertySwitcherSheet({ visible, onClose }: Props) {
  const user = useAuthStore((s) => s.user)
  const switchProperty = useAuthStore((s) => s.switchProperty)

  const [properties, setProperties] = useState<PropertyOption[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [switching, setSwitching] = useState(false)

  // Slide-up animation for the sheet
  const sheetY = useSharedValue(400)
  const backdropOpacity = useSharedValue(0)

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }))
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  useEffect(() => {
    if (visible) {
      sheetY.value = withSpring(0, MOTION.spring.standard)
      backdropOpacity.value = withTiming(1, { duration: 250 })
      void fetchProperties()
    } else {
      sheetY.value = withSpring(400, MOTION.spring.standard)
      backdropOpacity.value = withTiming(0, { duration: 200 })
    }
  }, [visible])

  async function fetchProperties() {
    setLoadingList(true)
    try {
      const data = await api.get<PropertyOption[]>('/auth/properties')
      setProperties(data)
      log.info('properties loaded', { count: data.length })
    } catch (err) {
      log.error('failed to load properties', err)
      Alert.alert('Error', 'No se pudieron cargar las sucursales')
      onClose()
    } finally {
      setLoadingList(false)
    }
  }

  async function handleSelect(property: PropertyOption) {
    if (property.isCurrent) {
      onClose()
      return
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setSwitching(true)
    try {
      await switchProperty(property.id)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      log.info('switched to property', { id: property.id, name: property.name })
      onClose()
    } catch (err: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      const msg = err instanceof Error ? err.message : 'Error al cambiar sucursal'
      log.error('switch failed', err)
      Alert.alert('No se pudo cambiar', msg)
    } finally {
      setSwitching(false)
    }
  }

  // Full-screen loader while switching — same SwiftUI pattern as login
  if (switching) {
    return (
      <Modal visible transparent animationType="none">
        <View style={styles.switchingOverlay}>
          <ActivityIndicator size="large" color={colors.brand[500]} />
          <Text style={styles.switchingText}>Cambiando sucursal…</Text>
        </View>
      </Modal>
    )
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Animated.View style={[styles.backdrop, backdropStyle]} />
      </Pressable>

      {/* Sheet */}
      <Animated.View style={[styles.sheetContainer, sheetStyle]}>
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          <Text style={styles.title}>Cambiar sucursal</Text>
          <Text style={styles.subtitle}>
            Conectado como {user?.name ?? '—'}
          </Text>

          {loadingList ? (
            <View style={styles.listLoading}>
              <ActivityIndicator color={colors.brand[500]} />
            </View>
          ) : (
            <View style={styles.list}>
              {properties.map((p) => (
                <PropertyRow
                  key={p.id}
                  property={p}
                  onPress={() => handleSelect(p)}
                />
              ))}
            </View>
          )}

          <Pressable onPress={onClose} style={styles.cancelBtn}>
            <Text style={styles.cancelLabel}>Cancelar</Text>
          </Pressable>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function PropertyRow({ property, onPress }: { property: PropertyOption; onPress: () => void }) {
  const scale = useSharedValue(1)
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  return (
    <Pressable
      onPressIn={() => { scale.value = withSpring(0.98, MOTION.spring.snappy) }}
      onPressOut={() => { scale.value = withSpring(1, MOTION.spring.snappy) }}
      onPress={onPress}
    >
      <Animated.View
        style={[
          styles.propertyRow,
          property.isCurrent && styles.propertyRowActive,
          animStyle,
        ]}
      >
        {/* Hotel icon placeholder — letter in a circle */}
        <View style={[styles.hotelIcon, property.isCurrent && styles.hotelIconActive]}>
          <Text style={[styles.hotelIconLetter, property.isCurrent && styles.hotelIconLetterActive]}>
            {property.name[0]}
          </Text>
        </View>

        <View style={styles.propertyInfo}>
          <Text style={[styles.propertyName, property.isCurrent && styles.propertyNameActive]}>
            {property.name}
          </Text>
          <Text style={styles.propertyType}>
            {typeLabel(property.type)}
          </Text>
        </View>

        {property.isCurrent && (
          <View style={styles.currentBadge}>
            <Text style={styles.currentBadgeText}>Actual</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  )
}

function typeLabel(type: string): string {
  switch (type) {
    case 'HOTEL':            return 'Hotel'
    case 'HOSTAL':           return 'Hostal'
    case 'VACATION_RENTAL':  return 'Renta vacacional'
    default:                 return type
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    backgroundColor: colors.canvas.secondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: colors.border.subtle,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.default,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: typography.size.titleLg,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    letterSpacing: typography.letterSpacing.title,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
    marginBottom: 20,
  },
  listLoading: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  list: {
    gap: 8,
    marginBottom: 8,
  },
  propertyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.canvas.tertiary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  propertyRowActive: {
    borderColor: colors.brand[500],
    backgroundColor: `${colors.brand[500]}12`,
  },
  hotelIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hotelIconActive: {
    backgroundColor: colors.brand[500],
    borderColor: colors.brand[500],
  },
  hotelIconLetter: {
    fontSize: 18,
    fontWeight: typography.weight.bold,
    color: colors.text.secondary,
  },
  hotelIconLetterActive: {
    color: colors.text.inverse,
  },
  propertyInfo: {
    flex: 1,
    gap: 2,
  },
  propertyName: {
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  propertyNameActive: {
    color: colors.brand[400],
  },
  propertyType: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
  },
  currentBadge: {
    backgroundColor: colors.brand[500],
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  currentBadgeText: {
    fontSize: typography.size.micro,
    color: colors.text.inverse,
    fontWeight: typography.weight.semibold,
  },
  cancelBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelLabel: {
    fontSize: typography.size.body,
    color: colors.text.secondary,
    fontWeight: typography.weight.medium,
  },
  // Switching overlay (full screen loader during property switch)
  switchingOverlay: {
    flex: 1,
    backgroundColor: colors.canvas.primary,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  switchingText: {
    fontSize: typography.size.body,
    color: colors.text.secondary,
    fontWeight: typography.weight.medium,
  },
})
