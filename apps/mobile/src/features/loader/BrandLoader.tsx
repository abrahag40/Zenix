/**
 * BrandLoader — Zenix-branded loading screen.
 *
 * Purpose:
 *   Replaces generic spinners across the app. Reinforces brand identity
 *   on every wait state, however brief. Will be upgraded to an animated
 *   SVG/Lottie of the full Zenix wordmark in a future sprint — for now,
 *   the geometric primitive (rounded square + "Z" letter mark) suffices.
 *
 * Design rationale (competitive analysis):
 *   - Linear: minimal pulsing primitive. Avoids visual fatigue on long waits.
 *   - Apple Pay / watchOS: physics-based "breathing" pulse signals "alive,
 *     processing" — distinct from "stuck" or "frozen".
 *   - Stripe: subtle motion. Brand always visible — no orphan spinner.
 *
 *   Anti-patterns rejected:
 *     - Spinning circle alone — no brand identity, indistinguishable from
 *       any other app (Hick's Law: more cues, faster recognition).
 *     - Bouncing dots — too playful for a B2B operations tool.
 *     - Indeterminate progress bars — imply specific duration, set wrong
 *       expectation when wait length is unpredictable (most auth/data fetches).
 *
 * SwiftUI alignment:
 *   The animation here is the Reanimated v4 equivalent of:
 *
 *     @State private var pulse = false
 *     var body: some View {
 *       RoundedRectangle(cornerRadius: 18)
 *         .fill(.emerald)
 *         .scaleEffect(pulse ? 1.08 : 1.0)
 *         .opacity(pulse ? 1.0 : 0.85)
 *         .animation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true), value: pulse)
 *         .onAppear { pulse = true }
 *
 *   `withRepeat(_, -1, true)` = `.repeatForever(autoreverses: true)`.
 *   `withTiming(_, { duration, easing })` = `.easeInOut(duration:)`.
 *   The animation runs on the UI thread (Reanimated worklet) — equivalent
 *   to SwiftUI's CoreAnimation-backed implicit animations. 60fps guaranteed
 *   even when the JS thread is busy hydrating.
 *
 * Accessibility:
 *   - `accessibilityRole="progressbar"` (Apple AT semantic)
 *   - `accessibilityLabel` reads the caption — VoiceOver users hear context
 *   - motion can be disabled at the system level (TODO: respect AccessibilityInfo.isReduceMotionEnabled)
 */

import { useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { colors } from '../../design/colors'
import { typography } from '../../design/typography'

export interface BrandLoaderProps {
  /** Optional caption shown below the mark. Defaults to none. */
  caption?: string
  /** Override the size in pixels. Default 64 (matches login hero mark). */
  size?: number
  /** When false, renders without the full-screen background. Default true. */
  fullScreen?: boolean
}

export function BrandLoader({ caption, size = 64, fullScreen = true }: BrandLoaderProps) {
  // ── Two coordinated animations:
  //    1. scale: 1.0 → 1.08 → 1.0 — gentle breathing pulse
  //    2. opacity: 0.85 → 1.0 → 0.85 — subtle dimming, layered on the pulse
  // Together they create a sense of "alive" without being attention-stealing.
  const scale = useSharedValue(1)
  const opacity = useSharedValue(0.85)

  useEffect(() => {
    // 1.2s total cycle — slow enough to feel calm (Apple HIG: "Avoid
    // mechanical-looking timing"), fast enough that the user perceives
    // motion within the first frame they see.
    scale.value = withRepeat(
      withTiming(1.08, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,                  // -1 = repeat forever
      true,                // true = reverse on each iteration (autoreverses)
    )
    opacity.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    )
  }, [])

  const markStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }))

  // Z mark proportions — letter mark fits roughly in the center 60% of the square.
  const radius = size * 0.28          // ~18px on a 64px mark — matches login hero
  const letterSize = size * 0.55       // 35px on 64 — bold, dominant

  const content = (
    <View
      style={styles.center}
      accessibilityRole="progressbar"
      accessibilityLabel={caption ?? 'Cargando'}
    >
      <Animated.View
        style={[
          styles.mark,
          {
            width: size,
            height: size,
            borderRadius: radius,
            shadowRadius: size * 0.28,
          },
          markStyle,
        ]}
      >
        <Text style={[styles.letter, { fontSize: letterSize }]}>Z</Text>
      </Animated.View>
      {caption && <Text style={styles.caption}>{caption}</Text>}
    </View>
  )

  if (!fullScreen) return content

  return <View style={styles.root}>{content}</View>
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    alignItems: 'center',
    gap: 20,
  },
  mark: {
    backgroundColor: colors.brand[500],
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.brand[500],
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  letter: {
    color: colors.text.inverse,
    fontWeight: typography.weight.heavy,
    letterSpacing: -2,
  },
  caption: {
    color: colors.text.secondary,
    fontSize: typography.size.body,
    fontWeight: typography.weight.medium,
    letterSpacing: typography.letterSpacing.wide,
  },
})
