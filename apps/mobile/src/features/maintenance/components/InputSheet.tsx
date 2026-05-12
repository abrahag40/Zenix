/**
 * InputSheet — versión con TextInput del ErrorSheet (Mx-1B-W2 estandarización).
 *
 * Reusa el mismo lenguaje visual y la misma animación spring para mantener
 * consistencia §13 CLAUDE.md. Sustituye los modales custom que pedían texto
 * al usuario (asset input, reject reason, verify-reject reason).
 *
 * §60 D19 CLAUDE.md — Patrón Meta/Apple/Stripe/Linear (Sprint Mx-1B-W3 W3.0):
 *   · Botón primario SIEMPRE habilitado
 *   · Al tap con input < minLength → shake horizontal + haptic error +
 *     mensaje inline. NO se muestra "Faltan X caracteres" proactivamente.
 *   · Eliminado el hint persistente (cognitive load Sweller 1988).
 *
 * Diseño:
 *   · Mismo backdrop + card que ErrorSheet (200ms fade + spring scale)
 *   · Ícono SVG opcional con accent color por tone
 *   · Título + descripción + TextInput (multiline opcional)
 *   · CTAs primary/destructive + secondary
 *   · KeyboardAvoidingView wrappea todo (fix T-18)
 */
import { useEffect, useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native'
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import { useShakeOnInvalid } from '../../../hooks/useShakeOnInvalid'
import type { ErrorSheetTone } from './ErrorSheet'

interface Props {
  open: boolean
  tone?: ErrorSheetTone
  customIcon?: React.ReactNode
  title: string
  description?: string
  placeholder?: string
  initialValue?: string
  multiline?: boolean
  maxLength?: number
  minLength?: number
  primaryLabel: string
  primaryTone?: 'primary' | 'destructive'
  secondaryLabel?: string
  onSubmit: (value: string) => void
  onClose: () => void
}

const TONE_ACCENT: Record<ErrorSheetTone, string> = {
  warning: '#FBBF24',
  error: '#F87171',
  info: '#60A5FA',
  success: '#34D399',
}

export function InputSheet({
  open,
  tone = 'info',
  customIcon,
  title,
  description,
  placeholder = 'Escribe aquí…',
  initialValue = '',
  multiline = false,
  maxLength = 300,
  minLength = 0,
  primaryLabel,
  primaryTone = 'primary',
  secondaryLabel = 'Cancelar',
  onSubmit,
  onClose,
}: Props) {
  const { width } = useWindowDimensions()
  const progress = useSharedValue(0)
  const iconProgress = useSharedValue(0)
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)
  const { shakeStyle, trigger: triggerShake } = useShakeOnInvalid()

  useEffect(() => {
    if (open) {
      setValue(initialValue)
      setError(null)
      progress.value = withSpring(1, { damping: 16, stiffness: 180, mass: 0.6 })
      iconProgress.value = withDelay(
        80,
        withSpring(1, { damping: 9, stiffness: 200, mass: 0.7 }),
      )
    } else {
      progress.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.cubic) })
      iconProgress.value = withTiming(0, { duration: 120 })
    }
  }, [open, initialValue, progress, iconProgress])

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
    transform: [{ scale: interpolate(iconProgress.value, [0, 0.6, 1], [0.3, 1.08, 1]) }],
  }))

  const accent = TONE_ACCENT[tone]

  function handleSubmit() {
    const trimmed = value.trim()
    if (trimmed.length < minLength) {
      // §60 D19: validate-on-click → shake + haptic + mensaje inline.
      // NO disabled, NO hint proactivo. El usuario ve la regla solo al intentar.
      setError(
        minLength === 1
          ? 'Escribe un mensaje antes de continuar.'
          : `Necesitas al menos ${minLength} caracteres.`,
      )
      triggerShake()
      return
    }
    onSubmit(trimmed)
  }

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <Animated.View
            style={[styles.card, cardStyle, { maxWidth: Math.min(420, width - 48) }]}
          >
            {(customIcon ?? null) && (
              <Animated.View
                style={[
                  styles.iconCircle,
                  { backgroundColor: `${accent}22`, borderColor: `${accent}55` },
                  iconStyle,
                ]}
              >
                {customIcon}
              </Animated.View>
            )}
            <Text style={styles.title}>{title}</Text>
            {description && <Text style={styles.body}>{description}</Text>}
            {/* §60 D19: wrapper con shake animation al validar inválido. */}
            <Animated.View style={[styles.inputWrap, shakeStyle]}>
              <TextInput
                autoFocus
                value={value}
                onChangeText={(v) => {
                  setValue(v)
                  if (error) setError(null)
                }}
                placeholder={placeholder}
                placeholderTextColor={colors.text.tertiary}
                style={[styles.input, multiline && styles.inputMulti, error && styles.inputError]}
                multiline={multiline}
                numberOfLines={multiline ? 3 : 1}
                maxLength={maxLength}
                returnKeyType={multiline ? 'default' : 'done'}
                blurOnSubmit={!multiline}
                onSubmitEditing={multiline ? undefined : handleSubmit}
              />
            </Animated.View>
            {error && <Text style={styles.errorText}>{error}</Text>}
            {/* §60 D19: solo char count, sin hint proactivo de minLength. */}
            <View style={styles.hintRow}>
              <Text style={styles.charCount}>
                {value.length}/{maxLength}
              </Text>
            </View>
            <View style={styles.actions}>
              <Pressable
                onPress={onClose}
                style={[styles.btn, styles.btnSecondary]}
              >
                <Text style={styles.btnSecondaryText}>{secondaryLabel}</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                style={[
                  styles.btn,
                  primaryTone === 'destructive' ? styles.btnDestructive : styles.btnPrimary,
                ]}
              >
                <Text
                  style={
                    primaryTone === 'destructive'
                      ? styles.btnDestructiveText
                      : styles.btnPrimaryText
                  }
                >
                  {primaryLabel}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
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
    marginBottom: 18,
  },
  inputWrap: { width: '100%' },
  input: {
    width: '100%',
    backgroundColor: colors.canvas.primary,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text.primary,
    fontSize: typography.size.body,
  },
  inputMulti: { minHeight: 90, textAlignVertical: 'top' },
  inputError: { borderColor: '#F87171' },
  errorText: {
    color: '#FCA5A5',
    fontSize: typography.size.small,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  charCount: {
    color: colors.text.tertiary,
    fontSize: typography.size.micro,
  },
  hintRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    width: '100%',
  },
  minHint: { fontSize: typography.size.micro, fontWeight: '500' },
  minHintPending: { color: '#FBBF24' },
  minHintOk: { color: '#34D399' },
  actions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginTop: 16,
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
