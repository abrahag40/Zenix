/**
 * ErrorScreen — Zenix-branded fallback for catastrophic UI errors.
 *
 * Best practices applied (with citation):
 *
 *   1. NEVER show stack traces to users (Apple HIG, "Error Handling"):
 *      "Avoid technical jargon... Reassure users that the problem is
 *      being handled."
 *      We surface a friendly message and stash the raw stack in
 *      __DEV__-only debug section.
 *
 *   2. ALWAYS offer a recovery action (Nielsen #9 "Help users recover
 *      from errors"): the "Reintentar" button calls a `reset` callback
 *      that the ErrorBoundary owns. The user is not trapped on a dead
 *      screen.
 *
 *   3. Brand-forward (Stripe / Linear pattern): even when something
 *      breaks, the user should still be in "Zenix". Consistent visual
 *      identity reduces panic and builds trust during a failure.
 *
 *   4. Friendly + honest copy (Mailchimp Content Style Guide on errors):
 *      "Be specific. Don't say 'something went wrong' — say what we
 *      did wrong, what to try, and how to reach support."
 *
 *   5. Optional debug toggle for __DEV__ (Sentry SDK pattern): tap-to-reveal
 *      the technical details. Production builds NEVER show the stack.
 *
 *   Anti-patterns rejected:
 *     - Generic "Oops, something went wrong." — Apple HIG explicitly
 *       calls this out as bad copy. Vague, infantilizing.
 *     - Auto-redirect to login on any error — destructive, loses user
 *       state. Better: let user retry first, then offer logout as escape.
 *     - Showing stack traces in production — security risk + scary UX.
 */

import { useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated'
import { colors } from '../../design/colors'
import { typography } from '../../design/typography'
import { MOTION } from '../../design/motion'

export interface ErrorScreenProps {
  /** Optional. Friendly title. Default: "Algo no salió bien". */
  title?: string
  /** Optional. Friendly explanation. Default suggests retry. */
  message?: string
  /** The original error — kept for __DEV__ display + future telemetry. */
  error?: Error
  /** Recovery callback — typically resets the boundary's state. */
  onRetry?: () => void
  /** Secondary escape — typically logs the user out. */
  onLogout?: () => void
}

export function ErrorScreen({
  title = 'Algo no salió bien',
  message = 'Tuvimos un problema al cargar esta pantalla. Por favor intenta de nuevo en unos segundos.',
  error,
  onRetry,
  onLogout,
}: ErrorScreenProps) {
  const [showDebug, setShowDebug] = useState(false)
  const retryScale = useSharedValue(1)
  const retryStyle = useAnimatedStyle(() => ({
    transform: [{ scale: retryScale.value }],
  }))

  function handleRetry() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    onRetry?.()
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Centered hero — calm, not alarming. The brand mark in muted
            warning color signals "we know, we got it" without panic. */}
        <View style={styles.center}>
          <View style={styles.icon}>
            <Text style={styles.iconText}>!</Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.actions}>
            {onRetry && (
              <Pressable
                onPressIn={() => { retryScale.value = withSpring(0.97, MOTION.spring.snappy) }}
                onPressOut={() => { retryScale.value = withSpring(1, MOTION.spring.snappy) }}
                onPress={handleRetry}
              >
                <Animated.View style={[styles.primaryBtn, retryStyle]}>
                  <Text style={styles.primaryBtnLabel}>Reintentar</Text>
                </Animated.View>
              </Pressable>
            )}
            {onLogout && (
              <Pressable onPress={onLogout} hitSlop={12} style={styles.linkBtn}>
                <Text style={styles.linkBtnLabel}>Cerrar sesión</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Debug section — only visible in __DEV__ to avoid leaking stack
            traces to end users. Tap-to-reveal pattern keeps the main
            screen calm while preserving developer access. */}
        {__DEV__ && error && (
          <View style={styles.debugSection}>
            <Pressable onPress={() => setShowDebug((s) => !s)} hitSlop={8}>
              <Text style={styles.debugToggle}>
                {showDebug ? '▾ Ocultar detalles técnicos' : '▸ Ver detalles técnicos (dev)'}
              </Text>
            </Pressable>
            {showDebug && (
              <View style={styles.debugBody}>
                <Text style={styles.debugLabel}>Mensaje</Text>
                <Text style={styles.debugText}>{error.message}</Text>
                {error.stack && (
                  <>
                    <Text style={styles.debugLabel}>Stack</Text>
                    <Text style={styles.debugText} numberOfLines={20}>
                      {error.stack}
                    </Text>
                  </>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas.primary,
  },
  scroll: {
    flexGrow: 1,
    padding: 24,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 400,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.warning[500],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: colors.warning[500],
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  iconText: {
    fontSize: 36,
    fontWeight: typography.weight.heavy,
    color: colors.text.inverse,
  },
  title: {
    fontSize: typography.size.titleLg,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    textAlign: 'center',
    letterSpacing: typography.letterSpacing.title,
    marginBottom: 8,
  },
  message: {
    fontSize: typography.size.body,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: typography.size.body * typography.lineHeight.relaxed,
    paddingHorizontal: 8,
    marginBottom: 32,
    maxWidth: 360,
  },
  actions: {
    width: '100%',
    maxWidth: 320,
    gap: 12,
    alignItems: 'center',
  },
  primaryBtn: {
    backgroundColor: colors.brand[500],
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    minWidth: 200,
    alignItems: 'center',
    shadowColor: colors.brand[500],
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  primaryBtnLabel: {
    color: colors.text.inverse,
    fontSize: typography.size.bodyLg,
    fontWeight: typography.weight.semibold,
  },
  linkBtn: {
    paddingVertical: 8,
  },
  linkBtnLabel: {
    color: colors.text.tertiary,
    fontSize: typography.size.body,
    fontWeight: typography.weight.medium,
  },
  debugSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.default,
  },
  debugToggle: {
    color: colors.text.tertiary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.medium,
    textAlign: 'center',
  },
  debugBody: {
    marginTop: 12,
    padding: 14,
    backgroundColor: colors.canvas.secondary,
    borderRadius: 10,
    gap: 6,
  },
  debugLabel: {
    color: colors.text.tertiary,
    fontSize: typography.size.micro,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
    fontWeight: typography.weight.semibold,
    marginTop: 4,
  },
  debugText: {
    color: colors.text.secondary,
    fontSize: typography.size.micro,
    fontFamily: typography.family.monospace,
    lineHeight: typography.size.micro * 1.5,
  },
})
