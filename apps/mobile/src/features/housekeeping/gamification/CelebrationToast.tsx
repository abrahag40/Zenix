/**
 * CelebrationToast — overlay efímero para mostrar mensajes celebratorios.
 *
 * Aparece desde arriba con spring suave, vive 2.4s, fade-out.
 * Diferenciado del NotificationCenter: ESTE no se persiste, no tiene
 * historial — es un "feedback in-the-moment" puro.
 *
 * Tono visual:
 *   - SOFT     : pill simple emerald
 *   - WARM     : pill con border + emoji
 *   - CELEBRATORY : pill amber con micro-glow + haptic notification
 */

import { useEffect } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import { MOTION } from '../../../design/motion'
import type { CelebrationMessage } from './celebrationPool'

interface CelebrationToastProps {
  /** When set → shows the toast. When null → hidden. */
  message: CelebrationMessage | null
  onDismiss: () => void
  /** ms visible before auto-dismiss. Default 2400. */
  durationMs?: number
}

const TONE_STYLES = {
  soft: {
    bg: 'rgba(52,211,153,0.14)',
    border: 'rgba(52,211,153,0.30)',
    fg: '#34D399',
  },
  warm: {
    bg: 'rgba(167,139,250,0.14)',
    border: 'rgba(167,139,250,0.34)',
    fg: '#A78BFA',
  },
  celebratory: {
    bg: 'rgba(251,191,36,0.18)',
    border: 'rgba(251,191,36,0.50)',
    fg: '#FBBF24',
  },
}

export function CelebrationToast({
  message,
  onDismiss,
  durationMs = 2400,
}: CelebrationToastProps) {
  const insets = useSafeAreaInsets()
  const opacity = useSharedValue(0)
  const translateY = useSharedValue(-30)
  const scale = useSharedValue(0.94)

  useEffect(() => {
    if (!message) return

    // Haptic per tone
    if (message.tone === 'celebratory') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } else if (message.tone === 'warm') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    } else {
      Haptics.selectionAsync()
    }

    // Enter
    opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) })
    translateY.value = withSpring(0, MOTION.spring.standard)
    scale.value = withSpring(1, MOTION.spring.snappy)

    // Auto-dismiss after durationMs
    opacity.value = withSequence(
      withTiming(1, { duration: 220 }),
      withDelay(
        durationMs,
        withTiming(0, { duration: 220, easing: Easing.in(Easing.cubic) }, (finished) => {
          if (finished) runOnJS(onDismiss)()
        }),
      ),
    )
    translateY.value = withSequence(
      withSpring(0, MOTION.spring.standard),
      withDelay(durationMs, withTiming(-12, { duration: 220 })),
    )
  }, [message, durationMs, onDismiss, opacity, translateY, scale])

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }))

  if (!message) return null
  const tone = TONE_STYLES[message.tone]

  return (
    <Animated.View
      style={[
        styles.wrap,
        { paddingTop: insets.top + 8 },
        animStyle,
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={() => {
          Haptics.selectionAsync()
          onDismiss()
        }}
        style={[
          styles.toast,
          {
            backgroundColor: tone.bg,
            borderColor: tone.border,
          },
        ]}
      >
        {message.emoji && <Text style={[styles.emoji, { color: tone.fg }]}>{message.emoji}</Text>}
        <Text style={[styles.text, { color: tone.fg }]} numberOfLines={2}>
          {message.text}
        </Text>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    alignItems: 'center',
    zIndex: 999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    maxWidth: '92%',
    // Subtle shadow for depth
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  emoji: {
    fontSize: 18,
    fontWeight: typography.weight.bold,
  },
  text: {
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
    flexShrink: 1,
  },
})
