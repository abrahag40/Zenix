/**
 * IncomingTaskAlarm — overlay full-screen que aparece cuando llega un
 * `task:ready` por SSE asignado al usuario actual.
 *
 * Pattern de UX:
 *   - Modal full-screen con backdrop oscuro 92% opacity
 *   - Hero: "Habitación lista" + número de habitación gigante
 *   - Pulsing dot rojo (señal de urgencia activa)
 *   - Sub-info: badges de prioridad si aplica (carryover/sameDayCheckIn)
 *   - SlideToAcknowledge en el bottom (zona del pulgar — Hoober 2013)
 *   - Vibración persistente hasta confirmar
 *
 * Justificación neuro:
 *   - Hick's Law: una sola decisión visible (slide). No hay forma de
 *     "ignorar" sin acción intencional → garantiza que el aviso se
 *     procesó conscientemente
 *   - Cortisol controlado: la vibración termina al instante con el
 *     slide → no hay ansiedad sostenida
 *   - Forcing function (Norman 1988): no se puede tappear "Cerrar"
 *     accidentalmente como un toast normal
 *
 * Privacy:
 *   El payload del overlay viene del SSE event — nombre del huésped
 *   redactado por el backend a null para HK. Solo muestra info
 *   operativa (Hab. + status).
 */

import { useEffect } from 'react'
import { View, Text, StyleSheet, Modal } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { dashboardType } from '../../dashboard/typography'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import { SlideToAcknowledge } from './SlideToAcknowledge'
import { useTaskAlarm } from './useTaskAlarm'

export interface IncomingTaskInfo {
  taskId: string
  roomNumber: string
  /** Optional priority hints — drives accent color + badges */
  hasSameDayCheckIn?: boolean
  hasCarryover?: boolean
}

interface IncomingTaskAlarmProps {
  task: IncomingTaskInfo | null
  onAcknowledge: () => void
}

export function IncomingTaskAlarm({ task, onAcknowledge }: IncomingTaskAlarmProps) {
  const isVisible = !!task
  // Vibration loop driven by `active` prop — hook handles all lifecycle
  useTaskAlarm({ active: isVisible })

  // Pulse accent on the dot
  const pulse = useSharedValue(1)
  useEffect(() => {
    if (!isVisible) {
      pulse.value = 1
      return
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.6, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    )
  }, [isVisible, pulse])

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: 2 - pulse.value,
  }))

  if (!task) return null

  const isDoubleUrgent = task.hasCarryover && task.hasSameDayCheckIn
  const accent = isDoubleUrgent ? '#F87171' : task.hasSameDayCheckIn ? '#FBBF24' : '#34D399'

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => { /* prevent Android back from dismissing */ }}
    >
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.body}>
            {/* Section label with pulsing dot */}
            <View style={styles.headerRow}>
              <View style={styles.dotContainer}>
                <Animated.View style={[styles.dotHalo, { backgroundColor: accent + '4D' }, dotStyle]} />
                <View style={[styles.dotCore, { backgroundColor: accent }]} />
              </View>
              <Text style={[dashboardType.sectionLabel, { color: accent }]}>
                HABITACIÓN LISTA PARA LIMPIAR
              </Text>
            </View>

            {/* Hero room number */}
            <View style={styles.hero}>
              <Text style={styles.roomLabel}>Hab.</Text>
              <Text style={styles.roomNumber}>{task.roomNumber}</Text>
            </View>

            {/* Priority badges */}
            {(isDoubleUrgent || task.hasSameDayCheckIn || task.hasCarryover) && (
              <View style={styles.badgeRow}>
                {isDoubleUrgent && (
                  <Badge text="🔴⚠️ Doble urgente" tint="#F87171" />
                )}
                {!isDoubleUrgent && task.hasSameDayCheckIn && (
                  <Badge text="🔴 Hoy entra" tint="#FBBF24" />
                )}
                {!isDoubleUrgent && task.hasCarryover && (
                  <Badge text="⚠️ De ayer" tint="#F59E0B" />
                )}
              </View>
            )}

            {/* Caption */}
            <Text style={styles.caption}>
              Recepción acaba de confirmar la salida del huésped. Cuando estés en
              ruta, desliza abajo para silenciar la alarma.
            </Text>
          </View>

          {/* Slide-to-acknowledge — bottom thumb zone */}
          <View style={styles.slideWrap}>
            <SlideToAcknowledge
              label="Desliza para silenciar"
              primaryColor={accent}
              onConfirm={onAcknowledge}
            />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  )
}

function Badge({ text, tint }: { text: string; tint: string }) {
  return (
    <View style={[styles.badge, { borderColor: tint, backgroundColor: tint + '14' }]}>
      <Text style={[styles.badgeText, { color: tint }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  safe: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingVertical: 24,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
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
  },
  dotCore: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  hero: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
  },
  roomLabel: {
    fontSize: typography.size.title,
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
  },
  roomNumber: {
    fontSize: 96,
    color: colors.text.primary,
    fontWeight: typography.weight.heavy,
    letterSpacing: -3,
    lineHeight: 100,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.4,
  },
  caption: {
    fontSize: typography.size.body,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: typography.size.body * typography.lineHeight.relaxed,
    paddingHorizontal: 12,
  },
  slideWrap: {
    paddingBottom: 8,
  },
})
