/**
 * AnimatedBedIcon — cama "haciéndose y deshaciéndose" en bucle.
 *
 * SVG curated:
 *  · Pies y cabecera proporcionales (8pt grid)
 *  · Colchón con apoyo de cojines visible
 *  · Manta plegada al pie
 *  · Stroke 1.75 (consistente con el resto del icon set)
 *
 * Animación (testing T-bed-animate):
 *  · La manta se "estira" (escala X 0.55 → 1) en 1.6s
 *  · Los cojines hacen un mini bounce (translateY -1.5 → 0) cuando la manta
 *    termina de estirarse — like fluffing pillows
 *  · Después la manta se "dobla" (escala X 1 → 0.55) — efecto loop
 *
 * Reglas:
 *  · No debe distraer — easing easeInOut, period 3-4s
 *  · Spring solo en el momento del "fluff" (los cojines)
 *  · Color del trace cambia muy sutilmente con la fase (opacity 0.85 → 1)
 *    indicando "en proceso"
 *
 * Apple HIG "Motion": "Animations should serve a purpose and never distract".
 * El bucle aquí refuerza el contexto "cama" + transmite acción ("la habitación
 * está siendo ocupada — espera").
 */
import { useEffect } from 'react'
import Svg, { Path, G, Rect } from 'react-native-svg'
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  withDelay,
  interpolate,
} from 'react-native-reanimated'

const AnimatedG = Animated.createAnimatedComponent(G)
const AnimatedPath = Animated.createAnimatedComponent(Path)
const AnimatedRect = Animated.createAnimatedComponent(Rect)

interface Props {
  color?: string
  size?: number
}

export function AnimatedBedIcon({ color = '#FBBF24', size = 28 }: Props) {
  // Progress 0 → 1: manta extendiéndose
  const blanket = useSharedValue(0.55)
  // Spring momentum para los cojines
  const pillowBounce = useSharedValue(0)
  // Sutil opacity en stroke para fase
  const phaseOpacity = useSharedValue(0.85)

  useEffect(() => {
    // Loop perpetuo: 1.6s extender → 200ms pillow fluff → 1.4s doblar →
    // 800ms reposo. Total ~4s.
    blanket.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.cubic) }),
        withDelay(200, withTiming(1, { duration: 0 })), // hold
        withTiming(0.55, { duration: 1400, easing: Easing.inOut(Easing.cubic) }),
        withDelay(800, withTiming(0.55, { duration: 0 })), // rest
      ),
      -1,
      false,
    )

    // El pillow bounce ocurre cuando la manta termina de extenderse (~1.6s in)
    pillowBounce.value = withRepeat(
      withSequence(
        withDelay(1500, withSpring(1, { damping: 6, stiffness: 220, mass: 0.4 })),
        withDelay(200, withSpring(0, { damping: 14, stiffness: 180 })),
        withDelay(2300, withTiming(0, { duration: 0 })), // reset
      ),
      -1,
      false,
    )

    phaseOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.cubic) }),
        withTiming(0.85, { duration: 1600, easing: Easing.inOut(Easing.cubic) }),
        withDelay(800, withTiming(0.85, { duration: 0 })),
      ),
      -1,
      false,
    )
  }, [blanket, pillowBounce, phaseOpacity])

  // ── La manta: rect que escala desde la izquierda
  const blanketProps = useAnimatedProps(() => ({
    transform: [{ scaleX: blanket.value }],
    opacity: interpolate(blanket.value, [0.55, 0.7, 1], [0.4, 0.6, 0.85]),
  }))

  // ── Los cojines: spring bounce vertical
  const pillowProps = useAnimatedProps(() => ({
    transform: [
      { translateY: interpolate(pillowBounce.value, [0, 1], [0, -1.4]) },
    ],
  }))

  // ── Stroke phase opacity sutil
  const frameProps = useAnimatedProps(() => ({
    strokeOpacity: phaseOpacity.value,
  }))

  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* ── Frame estructural — cabecera + pies + base */}
      <AnimatedG animatedProps={frameProps}>
        {/* Patas izquierda y derecha */}
        <Path
          d="M4 23v3M28 23v3"
          stroke={color}
          strokeWidth={1.75}
          strokeLinecap="round"
        />
        {/* Cabecera (izquierda) + base */}
        <Path
          d="M4 23V11M4 23h24M28 23v-6"
          stroke={color}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </AnimatedG>

      {/* ── La manta — rect que escala desde el pie hacia la cabecera */}
      <AnimatedRect
        x={6}
        y={17}
        width={20}
        height={6}
        rx={1.5}
        fill={color}
        animatedProps={blanketProps}
        // origin de la escala desde la derecha (cabecera)
        originX={26}
        originY={20}
      />

      {/* ── Línea superior del colchón (siempre visible) */}
      <Path
        d="M4 17h24"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />

      {/* ── Cojines — 2 cojines pegados a la cabecera, con spring fluff */}
      <AnimatedG animatedProps={pillowProps}>
        {/* Cojín 1 */}
        <Path
          d="M6 14a2 2 0 0 1 2-2h2.5a2 2 0 0 1 2 2v3"
          stroke={color}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={`${color}22`}
        />
        {/* Cojín 2 */}
        <Path
          d="M13 14a2 2 0 0 1 2-2h2.5a2 2 0 0 1 2 2v3"
          stroke={color}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={`${color}22`}
        />
      </AnimatedG>
    </Svg>
  )
}
