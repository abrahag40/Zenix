/**
 * DayProgress — contador bold de habitaciones completadas.
 *
 * Reemplaza los ActivityRings (3 anillos concéntricos) por un bloque
 * de lectura inmediata:
 *
 *   3  de 8 habitaciones
 *   ████████░░░░░░  38%
 *
 * Principio: un número grande + barra horizontal es legible en <1 s
 * sin requerir interpretación de leyendas (Krug 2000 "Don't Make Me
 * Think"). Los anillos concéntricos son un patrón de fitness de consumo
 * entrenado en usuarios con alta exposición a Apple Watch — no aplica
 * para recamaristas con distinta curva de familiarización tecnológica.
 *
 * El archivo se llama ActivityRings.tsx para no romper imports existentes.
 */

import { useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import { IconCheckCircle } from '../../../design/icons'

interface RingData {
  pct: number
  value: number
  target: number
}

interface ActivityRingsProps {
  tasks: RingData
  minutes: RingData    // kept for interface compat — not rendered
  verified: RingData   // kept for interface compat — not rendered
  allClosed: boolean
  size?: number        // kept for interface compat — not used
}

export function ActivityRings({ tasks, allClosed }: ActivityRingsProps) {
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = 0
    progress.value = withTiming(tasks.pct / 100, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.pct])

  const barStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%` as any,
  }))

  // Dynamic counter color (Mehrabian-Russell 1974):
  //   0 tasks  → tertiary gray ("día no iniciado" — neutral, no anxiety signal)
  //   progress → brand emerald ("en marcha" — positive reinforcement)
  //   complete → bright green (celebration)
  const countColor = allClosed
    ? '#34D399'
    : tasks.value === 0
      ? colors.text.tertiary
      : colors.brand[400]

  return (
    <View style={styles.container}>
      {/* Counter row */}
      <View style={styles.countRow}>
        {allClosed ? (
          <View style={styles.countIcon}>
            <IconCheckCircle size={40} color={countColor} />
          </View>
        ) : (
          <Text style={[styles.countBig, { color: countColor }]}>
            {tasks.value}
          </Text>
        )}
        <Text style={styles.countLabel}>
          {allClosed
            ? 'Día completo'
            : `de ${tasks.target} habitacion${tasks.target === 1 ? '' : 'es'}`}
        </Text>
      </View>

      {/* Progress bar — hidden when all done (the ✓ says it all) */}
      {!allClosed && (
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, barStyle]} />
        </View>
      )}

      {/* Sub-label */}
      <Text style={[styles.subLabel, allClosed && styles.subLabelDone]}>
        {allClosed
          ? '¡Excelente trabajo hoy! 🎉'
          : `${tasks.target - tasks.value} pendiente${tasks.target - tasks.value === 1 ? '' : 's'}`}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countIcon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  countBig: {
    fontSize: 42,
    fontWeight: typography.weight.bold,
    lineHeight: 46,
    letterSpacing: -1,
  },
  countLabel: {
    fontSize: typography.size.bodyLg,
    color: colors.text.secondary,
    fontWeight: typography.weight.medium,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.brand[500],
  },
  subLabel: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
  },
  subLabelDone: {
    color: '#34D399',
  },
})

// Re-export for cohesion with existing imports
export { dashboardType } from '../../dashboard/typography'
