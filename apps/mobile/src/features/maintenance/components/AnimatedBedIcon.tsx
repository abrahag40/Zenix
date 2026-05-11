/**
 * AnimatedBedIcon — cama dormida con Z's flotando (testing T-bed-v2).
 *
 * Referencia visual: Lucide "bed" (https://lucide.dev/icons/bed) — la
 * silueta canónica de cama side-view más reconocida en design systems.
 *
 *   Lucide bed paths originales (viewBox 24x24):
 *     M2 4 v16              (headboard vertical izquierdo, tall)
 *     M2 8 h18 a2 2 0 0 1 2 2 v10   (top de cama + arc corner + footboard)
 *     M2 17 h20             (base/floor)
 *     M6 8 v9               (separador pillow/blanket)
 *
 * Adaptaciones:
 *   1. ViewBox escalado a 32x32 con padding inicial para que las "Z"s arriba
 *      tengan espacio sin overflow.
 *   2. El "separador" interno se reemplaza por un pillow visible (rect
 *      redondeado) que descansa SOBRE la línea del mattress — no flotante.
 *   3. Blanket animado: rect que escala scaleX para simular "tendiendo".
 *      Origen anclado al footboard (derecha) → crece HACIA el pillow.
 *   4. Z's flotando: 3 letras escalonadas con opacity + translateY loop.
 *
 * Animación (Reanimated 3, mainthread):
 *   · Blanket: 0.25 → 1 → 0.25 en bucle (1.5s + hold + 1.3s + hold = 3.5s)
 *   · Z's: 3 letras secuenciales, cada una con fade-up loop
 *   · Pillow: sutil scaleY pulse (breathing) — opcional, muy sutil
 *
 * Apple HIG "Motion serves purpose": el bucle comunica "cama en uso" sin
 * ser distractor. Los Z's son el lenguaje visual universal de "dormido"
 * (cómics, emoticons, Material Design "sleep" icon).
 */
import { useEffect } from 'react'
import Svg, { Path, Rect, G } from 'react-native-svg'
import Animated, {
  Easing,
  interpolate,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

const AnimatedG = Animated.createAnimatedComponent(G)
const AnimatedRect = Animated.createAnimatedComponent(Rect)

interface Props {
  color?: string
  size?: number
}

export function AnimatedBedIcon({ color = '#FBBF24', size = 36 }: Props) {
  // Blanket extension progress (0.25 = folded at foot, 1 = covers up to pillow)
  const blanket = useSharedValue(0.25)
  // 3 Z's con loops escalonados
  const z1 = useSharedValue(0)
  const z2 = useSharedValue(0)
  const z3 = useSharedValue(0)

  useEffect(() => {
    // Blanket loop: extiende → hold → contrae → hold (period ~3.5s)
    blanket.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.cubic) }),
        withDelay(400, withTiming(1, { duration: 0 })),
        withTiming(0.25, { duration: 1300, easing: Easing.inOut(Easing.cubic) }),
        withDelay(300, withTiming(0.25, { duration: 0 })),
      ),
      -1,
      false,
    )

    // Z's en cascada: cada una nace, sube y se desvanece, con 700ms de offset
    // entre ellas para crear el efecto "z z Z" creciente.
    const zLoop = () =>
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: 200 }),
          withDelay(1000, withTiming(0, { duration: 0 })),
        ),
        -1,
        false,
      )
    z1.value = zLoop()
    z2.value = withDelay(700, zLoop())
    z3.value = withDelay(1400, zLoop())
  }, [blanket, z1, z2, z3])

  // El blanket: scaleX desde el footboard hacia el pillow.
  // En SVG, originX/Y definen el punto de pivote del transform.
  const blanketProps = useAnimatedProps(() => ({
    transform: [{ scaleX: blanket.value }],
    opacity: interpolate(blanket.value, [0.25, 0.5, 1], [0.5, 0.75, 0.95]),
  }))

  // Cada Z: translateY hacia arriba + fade (hooks declarados explícitamente
  // — Rules of Hooks: useAnimatedProps NO puede llamarse en callbacks).
  const z1Props = useAnimatedProps(() => ({
    opacity: interpolate(z1.value, [0, 0.3, 0.8, 1], [0, 0.9, 0.9, 0]),
    transform: [
      { translateY: interpolate(z1.value, [0, 1], [0, -6]) },
      { scale: interpolate(z1.value, [0, 0.4, 1], [0.5, 1, 1.1]) },
    ],
  }))
  const z2Props = useAnimatedProps(() => ({
    opacity: interpolate(z2.value, [0, 0.3, 0.8, 1], [0, 0.9, 0.9, 0]),
    transform: [
      { translateY: interpolate(z2.value, [0, 1], [0, -6]) },
      { scale: interpolate(z2.value, [0, 0.4, 1], [0.5, 1, 1.1]) },
    ],
  }))
  const z3Props = useAnimatedProps(() => ({
    opacity: interpolate(z3.value, [0, 0.3, 0.8, 1], [0, 0.7, 0.7, 0]),
    transform: [
      { translateY: interpolate(z3.value, [0, 1], [0, -8]) },
      { scale: interpolate(z3.value, [0, 0.4, 1], [0.5, 1.05, 1.2]) },
    ],
  }))

  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* ── 3 Z's flotando arriba del pillow ── */}
      {/* Z1 (pequeña, más cerca del pillow) */}
      <AnimatedG animatedProps={z1Props} origin="9 9">
        <Path
          d="M7 6 L10 6 L7 9 L10 9"
          stroke={color}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </AnimatedG>
      {/* Z2 (mediana, arriba) */}
      <AnimatedG animatedProps={z2Props} origin="13 5">
        <Path
          d="M11 2 L15 2 L11 6 L15 6"
          stroke={color}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </AnimatedG>
      {/* Z3 (grande, más arriba aún) — opcional, dim si saturado */}
      <AnimatedG animatedProps={z3Props} origin="18 3">
        <Path
          d="M16 0 L21 0 L16 5 L21 5"
          stroke={color}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity={0.7}
        />
      </AnimatedG>

      {/* ── La cama (basada en Lucide bed) ── */}
      {/* Headboard tall (left) */}
      <Path
        d="M3 14 V28"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      {/* Top frame: across + arc corner + footboard */}
      <Path
        d="M3 19 H25 Q29 19 29 22 V28"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Base/floor */}
      <Path
        d="M3 28 H29"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />

      {/* ── Pillow ── rect redondeado SOBRE el mattress al lado del headboard
           x=5 y=15 width=5 height=4 — descansa con su borde inferior
           justo en la línea del mattress (y=19) */}
      <Rect
        x={5}
        y={15}
        width={5}
        height={4}
        rx={1.5}
        stroke={color}
        strokeWidth={1.5}
        fill={`${color}33`}
      />

      {/* ── Blanket ── rect que cubre desde el footboard hacia el pillow.
           Cuando scaleX=0.25: queda solo un trocito junto al footboard.
           Cuando scaleX=1: extiende todo el ancho útil hasta x=11
           (justo después del pillow).
           OriginX anclado a 26 (footboard side) → escala HACIA la izquierda */}
      <AnimatedRect
        x={11}
        y={20}
        width={15}
        height={2.5}
        rx={1}
        fill={color}
        animatedProps={blanketProps}
        originX={26}
        originY={21}
      />
    </Svg>
  )
}
