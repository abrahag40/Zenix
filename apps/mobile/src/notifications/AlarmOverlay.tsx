/**
 * AlarmOverlay — overlay full-screen genérico para alarmas de cualquier módulo.
 *
 * Recibe un AlarmPayload y renderiza el overlay completo:
 *   - Backdrop oscuro 92%
 *   - Dot pulsante con el color accent del payload
 *   - Hero entityLabel + entityValue (e.g. "Hab. 101")
 *   - Badges opcionales (prioridad, carryover, …)
 *   - Caption descriptivo
 *   - SlideToAcknowledge en la zona del pulgar
 *
 * No contiene lógica de negocio ni de SSE — eso vive en los consumers
 * de cada módulo (useHousekeepingAlarmConsumer, useMaintenanceAlarmConsumer…).
 *
 * Justificación UX:
 *   Hick's Law: una sola decisión visible (slide). No se puede ignorar
 *   sin acción intencional — garantiza que el aviso se procesó
 *   conscientemente (Kahneman Sistema 2, 2011).
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
import { colors } from '../design/colors'
import { typography } from '../design/typography'
import { SlideToAcknowledge } from '../features/housekeeping/alarm/SlideToAcknowledge'
import { useAlarmSensors } from './useAlarmSensors'
import type { AlarmPayload } from './types'

const DEFAULT_ACCENT = '#34D399' // emerald — brand primary

interface AlarmOverlayProps {
  alarm: AlarmPayload | null
  onAcknowledge: () => void
}

export function AlarmOverlay({ alarm, onAcknowledge }: AlarmOverlayProps) {
  const isVisible = !!alarm
  useAlarmSensors({ active: isVisible })

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

  if (!alarm) return null

  const accent = alarm.accent ?? DEFAULT_ACCENT

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

            {/* Dot pulsante + sección label */}
            <View style={styles.headerRow}>
              <View style={styles.dotContainer}>
                <Animated.View
                  style={[styles.dotHalo, { backgroundColor: accent + '4D' }, dotStyle]}
                />
                <View style={[styles.dotCore, { backgroundColor: accent }]} />
              </View>
              <Text style={[styles.sectionLabel, { color: accent }]}>
                {alarm.sectionLabel}
              </Text>
            </View>

            {/* Hero */}
            <View style={styles.hero}>
              <Text style={styles.entityLabel}>{alarm.entityLabel}</Text>
              <Text style={styles.entityValue}>{alarm.entityValue}</Text>
            </View>

            {/* Badges */}
            {!!alarm.badges?.length && (
              <View style={styles.badgeRow}>
                {alarm.badges.map((b) => (
                  <View
                    key={b.text}
                    style={[
                      styles.badge,
                      { borderColor: b.tint, backgroundColor: b.tint + '14' },
                    ]}
                  >
                    <Text style={[styles.badgeText, { color: b.tint }]}>{b.text}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Caption */}
            <Text style={styles.caption}>{alarm.caption}</Text>
          </View>

          {/* Slide-to-acknowledge — zona del pulgar (Hoober 2013) */}
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
  sectionLabel: {
    fontSize: 11,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  hero: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
  },
  entityLabel: {
    fontSize: typography.size.title,
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
  },
  entityValue: {
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
