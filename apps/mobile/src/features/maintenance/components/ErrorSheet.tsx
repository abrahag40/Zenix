/**
 * ErrorSheet — modal de error branded, reusable.
 *
 * Sustituye `Alert.alert()` nativo para errores donde queremos comunicar
 * más contexto (tipografía + jerarquía + colores semánticos). Apple HIG
 * "Alerts": para errores informativos extensos, una sheet personalizada
 * tiene mejor presencia que el Alert system, que está pensado para
 * confirmaciones simples.
 *
 * Patrón inspirado en:
 *   · Apple Music — error sheets con tipografía propia
 *   · Linear iOS app — modal con icono + título + body + actions
 *   · Stripe Dashboard mobile — error states con CTA secundaria
 *
 * Diseño:
 *   · Backdrop semi-transparente (0.6 opacity)
 *   · Card centrada, max-width 420 (Apple HIG iPad scaling)
 *   · Animación: fade-in del backdrop + spring-up de la card (300ms)
 *   · Ícono ⚠ amber para warnings · 🚫 red para errores
 *   · Título 17pt semibold · body 15pt regular · CTAs 17pt semibold
 *   · Touch targets ≥44pt
 *
 * El componente es controlled (open/onClose props) para que el caller
 * decida cuándo mostrar/ocultar.
 */
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { useEffect, useRef } from 'react'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

export type ErrorSheetTone = 'warning' | 'error' | 'info'

export interface ErrorSheetAction {
  label: string
  onPress: () => void
  tone?: 'primary' | 'secondary' | 'destructive'
}

interface Props {
  open: boolean
  tone?: ErrorSheetTone
  icon?: string
  title: string
  body: string
  primaryAction: ErrorSheetAction
  secondaryAction?: ErrorSheetAction
  onClose: () => void
}

const TONE_ICON: Record<ErrorSheetTone, string> = {
  warning: '⚠️',
  error: '🚫',
  info: 'ℹ️',
}

const TONE_ACCENT: Record<ErrorSheetTone, string> = {
  warning: '#FBBF24',
  error: '#F87171',
  info: '#60A5FA',
}

export function ErrorSheet({
  open,
  tone = 'error',
  icon,
  title,
  body,
  primaryAction,
  secondaryAction,
  onClose,
}: Props) {
  const { width } = useWindowDimensions()
  const backdropOpacity = useRef(new Animated.Value(0)).current
  const cardScale = useRef(new Animated.Value(0.92)).current
  const cardOpacity = useRef(new Animated.Value(0)).current

  // Apple HIG "Motion": spring-style entry, sharp exit (mismo patrón §13b).
  useEffect(() => {
    if (open) {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(cardScale, {
          toValue: 1,
          tension: 70,
          friction: 9,
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start()
    } else {
      backdropOpacity.setValue(0)
      cardScale.setValue(0.92)
      cardOpacity.setValue(0)
    }
  }, [open, backdropOpacity, cardScale, cardOpacity])

  const displayIcon = icon ?? TONE_ICON[tone]
  const accent = TONE_ACCENT[tone]

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[
            styles.card,
            { maxWidth: Math.min(420, width - 48), opacity: cardOpacity, transform: [{ scale: cardScale }] },
          ]}
        >
          <View style={[styles.iconCircle, { backgroundColor: `${accent}22`, borderColor: `${accent}55` }]}>
            <Text style={styles.iconText}>{displayIcon}</Text>
          </View>
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
  iconText: { fontSize: 28 },
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
