/**
 * ErrorSheet — modal de error branded, reusable (Mx-1B-W2 + testing T-modal).
 *
 * Sustituye `Alert.alert()` nativo para mensajes con contexto rico. Apple HIG
 * "Alerts": para errores informativos extensos, una sheet personalizada
 * tiene mejor presencia que el Alert system, que está pensado para
 * confirmaciones simples.
 *
 * Patrón inspirado en:
 *   · Apple Music — error sheets con tipografía propia
 *   · Linear iOS app — modal con icono + título + body + actions
 *   · Stripe Dashboard mobile — error states con CTA secundaria
 *
 * Upgrade testing T-modal-anim:
 *   · Migrado de `Animated` a `react-native-reanimated` v4 (mejor perf,
 *     mainthread driven, mejor jitter en iOS)
 *   · Iconos SVG vectoriales en vez de emoji texto (escalables sin pérdida)
 *   · Animación entrada: spring scale + fade (300-380ms expo-out)
 *   · Animación icono: spring delay 100ms + sutil bounce
 *   · Animación salida: timing sharp-out 220ms (motion design §13b)
 *
 * Diseño:
 *   · Backdrop semi-transparente (0.6 opacity)
 *   · Card centrada, max-width 420 (Apple HIG iPad scaling)
 *   · Ícono circular 56pt con accent color por tone
 *   · Título 17pt semibold · body 15pt regular · CTAs 17pt semibold
 *   · Touch targets ≥48pt
 */
import { useEffect } from 'react'
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path, Circle } from 'react-native-svg'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

export type ErrorSheetTone = 'warning' | 'error' | 'info' | 'success'

export interface ErrorSheetAction {
  label: string
  onPress: () => void
  tone?: 'primary' | 'secondary' | 'destructive'
}

interface Props {
  open: boolean
  tone?: ErrorSheetTone
  /** Si se provee, sobreescribe el icon SVG por uno custom (emoji o ReactNode). */
  customIcon?: React.ReactNode
  title: string
  body: string
  primaryAction: ErrorSheetAction
  secondaryAction?: ErrorSheetAction
  onClose: () => void
}

const TONE_ACCENT: Record<ErrorSheetTone, string> = {
  warning: '#FBBF24',
  error: '#F87171',
  info: '#60A5FA',
  success: '#34D399',
}

// ─── SVG icons por tone (24x24 viewBox, stroke-based) ────────────────────

function IconBed({ color, size = 28 }: { color: string; size?: number }) {
  // Icono cama — semánticamente "habitación ocupada"
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 17V8a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v9M2 17h20M2 17v2M22 17v2M6 13v-2a2 2 0 0 1 2-2h3v4"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function IconWarning({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function IconError({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={1.75} />
      <Path
        d="M15 9l-6 6M9 9l6 6"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </Svg>
  )
}

function IconInfo({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={1.75} />
      <Path
        d="M12 16v-4M12 8h.01"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </Svg>
  )
}

function IconSuccess({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={1.75} />
      <Path
        d="M9 12l2 2 4-4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function pickIcon(tone: ErrorSheetTone, color: string) {
  switch (tone) {
    case 'warning': return <IconWarning color={color} />
    case 'error':   return <IconError color={color} />
    case 'info':    return <IconInfo color={color} />
    case 'success': return <IconSuccess color={color} />
    default:        return <IconError color={color} />
  }
}

/**
 * Permite a callers proveer iconos contextuales más allá de los 4 tones.
 * Ej. el modal "Habitación ocupada" usa el ícono de cama explícito.
 */
export const ErrorSheetIcons = {
  Bed: IconBed,
  Warning: IconWarning,
  Error: IconError,
  Info: IconInfo,
  Success: IconSuccess,
}

export function ErrorSheet({
  open,
  tone = 'error',
  customIcon,
  title,
  body,
  primaryAction,
  secondaryAction,
  onClose,
}: Props) {
  const { width } = useWindowDimensions()
  // Reanimated 3 shared values — mainthread driven (mejor jitter).
  const progress = useSharedValue(0)
  const iconProgress = useSharedValue(0)

  useEffect(() => {
    if (open) {
      // Spring para la card — sensación natural, sin overshoot.
      progress.value = withSpring(1, { damping: 16, stiffness: 180, mass: 0.6 })
      // El ícono entra con delay y un sutil bounce — micro-celebration.
      iconProgress.value = withDelay(
        80,
        withSpring(1, { damping: 9, stiffness: 200, mass: 0.7 }),
      )
    } else {
      // Salida más corta (Apple HIG: exit < enter).
      progress.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.cubic) })
      iconProgress.value = withTiming(0, { duration: 120 })
    }
  }, [open, progress, iconProgress])

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
  }))

  const cardStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.6, 1], [0, 1, 1]),
    transform: [
      { scale: interpolate(progress.value, [0, 1], [0.88, 1]) },
      { translateY: interpolate(progress.value, [0, 1], [16, 0]) },
    ],
  }))

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(iconProgress.value, [0, 0.6, 1], [0.3, 1.08, 1]) },
    ],
  }))

  const accent = TONE_ACCENT[tone]
  const iconNode = customIcon ?? pickIcon(tone, accent)

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[
            styles.card,
            cardStyle,
            { maxWidth: Math.min(420, width - 48) },
          ]}
        >
          <Animated.View
            style={[
              styles.iconCircle,
              { backgroundColor: `${accent}22`, borderColor: `${accent}55` },
              iconStyle,
            ]}
          >
            {iconNode}
          </Animated.View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <View style={styles.actions}>
            {secondaryAction && (
              <Pressable
                onPress={secondaryAction.onPress}
                style={[styles.btn, styles.btnSecondary]}
              >
                <Text style={styles.btnSecondaryText}>{secondaryAction.label}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={primaryAction.onPress}
              style={[
                styles.btn,
                primaryAction.tone === 'destructive' ? styles.btnDestructive : styles.btnPrimary,
              ]}
            >
              <Text
                style={
                  primaryAction.tone === 'destructive'
                    ? styles.btnDestructiveText
                    : styles.btnPrimaryText
                }
              >
                {primaryAction.label}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: colors.canvas.tertiary,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border.default,
    alignItems: 'center',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: typography.size.bodyLg,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  body: {
    fontSize: typography.size.body,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnPrimary: { backgroundColor: colors.brand[500] },
  btnPrimaryText: {
    color: colors.text.inverse,
    fontWeight: '700',
    fontSize: typography.size.bodyLg,
  },
  btnSecondary: {
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  btnSecondaryText: {
    color: colors.text.primary,
    fontWeight: '600',
    fontSize: typography.size.body,
  },
  btnDestructive: {
    backgroundColor: 'rgba(239,68,68,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.45)',
  },
  btnDestructiveText: {
    color: '#FCA5A5',
    fontWeight: '700',
    fontSize: typography.size.body,
  },
})
