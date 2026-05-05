/**
 * FocusBanner — barra inferior alterna que reemplaza al tab bar
 * cuando el HK está en focus mode (limpieza activa).
 *
 * Diseño:
 *   - Replaces the tab bar entirely while focused — no visual conflict
 *   - Single CTA "Volver a la tarea" que navega al detalle de la tarea
 *   - Subtle pulse animation on the dot to indicate "active state"
 *   - Sin tabs, sin notificaciones, sin distractores
 *
 * Filosofía: durante limpieza la app pasa de modo "navigation" a modo
 * "current activity". Apple Watch hace exactly esto en Workouts.
 */

import { useEffect } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

interface FocusBannerProps {
  /** Pre-formatted "Limpiando · Hab. 203". */
  label: string
  /** Task id for navigation. */
  taskId: string
  /** Number of additional tasks queued. Shown as "+2 más" if > 0. */
  additionalCount?: number
}

export function FocusBanner({ label, taskId, additionalCount = 0 }: FocusBannerProps) {
  // Subtle pulse on the dot — Csikszentmihalyi flow signal
  const pulse = useSharedValue(1)
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    )
  }, [pulse])

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: 2 - pulse.value, // fades as it grows
  }))

  return (
    <View style={styles.bar}>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => {
          Haptics.selectionAsync()
          router.push(`/(app)/task/${taskId}`)
        }}
      >
        <View style={styles.dotContainer}>
          <Animated.View style={[styles.dotHalo, dotStyle]} />
          <View style={styles.dotCore} />
        </View>

        <View style={styles.body}>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
          {additionalCount > 0 && (
            <Text style={styles.subline}>
              +{additionalCount} en cola
            </Text>
          )}
        </View>

        <Text style={styles.cta}>Ver tarea →</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: 'rgba(16,185,129,0.06)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(16,185,129,0.20)',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 40,
  },
  rowPressed: {
    opacity: 0.65,
  },
  dotContainer: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotHalo: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(52,211,153,0.30)',
  },
  dotCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34D399',
  },
  body: {
    flex: 1,
  },
  label: {
    fontSize: typography.size.body,
    color: colors.text.primary,
    fontWeight: typography.weight.semibold,
  },
  subline: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
  },
  cta: {
    fontSize: typography.size.small,
    color: colors.brand[400],
    fontWeight: typography.weight.semibold,
  },
})
