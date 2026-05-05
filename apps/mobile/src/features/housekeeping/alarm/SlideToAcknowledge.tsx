/**
 * SlideToAcknowledge — gesto "deslizar para confirmar" estilo
 * Tinder/iPhone "slide to unlock" / Telegram voice send.
 *
 * Por qué este pattern y no un botón normal:
 *   La alarma de tarea entrante despierta al usuario (vibración +
 *   sonido) — un tap accidental podría descartarla sin que la persona
 *   esté realmente consciente. El pattern slide-to-unlock garantiza
 *   intencionalidad: el cerebro tiene que coordinar pulgar + dirección
 *   + distancia, lo cual exige consciencia mínima de Sistema 2
 *   (Kahneman 2011).
 *
 *   Patrones de referencia:
 *     - iPhone "Slide to unlock" (legacy)
 *     - Telegram voice message send
 *     - Apple Wallet "Slide to pay"
 *     - Robinhood "Swipe to invest"
 *
 * Visual:
 *   ┌────────────────────────────────────────┐
 *   │  [▶▶]   Desliza para confirmar      → │
 *   └────────────────────────────────────────┘
 *           ↑ thumb que arrastras hacia la derecha
 *
 * Comportamiento:
 *   - Thumb arranca a la izquierda
 *   - Drag hacia la derecha mueve el thumb + va llenando el track
 *     con un overlay del color primary
 *   - Si el dedo recorre >70% del track con velocidad positiva,
 *     onConfirm() dispara y el thumb completa el viaje
 *   - Si suelta antes, snap-back con spring al inicio
 *   - Haptic selection durante el drag continuo
 *   - Haptic notification:Success al confirmar
 */

import { useCallback } from 'react'
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import * as Haptics from 'expo-haptics'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

interface SlideToAcknowledgeProps {
  /** Pre-formatted instruction text — "Desliza para confirmar". */
  label?: string
  /** Color of the thumb + filled track. Default emerald. */
  primaryColor?: string
  /** Fired when the user completes the slide. */
  onConfirm: () => void
}

const HEIGHT = 64
const THUMB_SIZE = 56
const HORIZONTAL_PAD = 4
const TRIGGER_RATIO = 0.70

export function SlideToAcknowledge({
  label = 'Desliza para confirmar',
  primaryColor = '#34D399',
  onConfirm,
}: SlideToAcknowledgeProps) {
  const trackWidth = useSharedValue(0)
  const offset = useSharedValue(0)

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidth.value = e.nativeEvent.layout.width
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const triggerHaptic = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  }

  const handleConfirm = () => {
    triggerHaptic()
    onConfirm()
  }

  const pan = Gesture.Pan()
    .activeOffsetX([5, 999]) // require horizontal intent before claiming
    .onUpdate((e) => {
      'worklet'
      const max = Math.max(0, trackWidth.value - THUMB_SIZE - HORIZONTAL_PAD * 2)
      offset.value = Math.max(0, Math.min(max, e.translationX))
    })
    .onEnd((e) => {
      'worklet'
      const max = Math.max(0, trackWidth.value - THUMB_SIZE - HORIZONTAL_PAD * 2)
      const ratio = max === 0 ? 0 : offset.value / max
      if (ratio >= TRIGGER_RATIO && e.velocityX >= -100) {
        // Complete the slide visually before firing
        offset.value = withTiming(max, { duration: 120 }, (finished) => {
          'worklet'
          if (finished) runOnJS(handleConfirm)()
        })
      } else {
        // Snap back with spring
        offset.value = withSpring(0, { damping: 18, stiffness: 200 })
      }
    })

  // ── Animated styles
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }))

  const fillStyle = useAnimatedStyle(() => {
    const max = Math.max(1, trackWidth.value - HORIZONTAL_PAD * 2)
    return {
      width: offset.value + THUMB_SIZE,
      opacity: interpolate(offset.value, [0, max], [0.55, 1], Extrapolation.CLAMP),
    }
  })

  const labelStyle = useAnimatedStyle(() => {
    const max = Math.max(1, trackWidth.value - THUMB_SIZE - HORIZONTAL_PAD * 2)
    // Fade the label as the thumb advances — it's the visual cue of progress
    return {
      opacity: interpolate(offset.value, [0, max * 0.6], [1, 0.2], Extrapolation.CLAMP),
    }
  })

  return (
    <View style={styles.track} onLayout={onTrackLayout}>
      {/* Filled overlay grows with the slide */}
      <Animated.View
        style={[
          styles.fill,
          { backgroundColor: primaryColor + '33', borderColor: primaryColor },
          fillStyle,
        ]}
        pointerEvents="none"
      />

      {/* Instruction label — centered, fades during slide */}
      <Animated.Text style={[styles.label, labelStyle]} pointerEvents="none">
        {label}  →
      </Animated.Text>

      {/* Thumb — the draggable element */}
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.thumb,
            { backgroundColor: primaryColor },
            thumbStyle,
          ]}
        >
          <Text style={styles.thumbGlyph}>▶▶</Text>
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    height: HEIGHT,
    borderRadius: HEIGHT / 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    paddingHorizontal: HORIZONTAL_PAD,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: HORIZONTAL_PAD,
    top: HORIZONTAL_PAD,
    height: HEIGHT - HORIZONTAL_PAD * 2,
    borderRadius: (HEIGHT - HORIZONTAL_PAD * 2) / 2,
    borderWidth: 1,
  },
  label: {
    fontSize: typography.size.body,
    color: colors.text.secondary,
    fontWeight: typography.weight.semibold,
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  thumb: {
    position: 'absolute',
    left: HORIZONTAL_PAD,
    top: HORIZONTAL_PAD,
    width: THUMB_SIZE,
    height: HEIGHT - HORIZONTAL_PAD * 2,
    borderRadius: (HEIGHT - HORIZONTAL_PAD * 2) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  thumbGlyph: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: typography.weight.bold,
    letterSpacing: 1,
  },
})
