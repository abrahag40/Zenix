/**
 * Zenix — Login screen
 *
 * Design rationale (competitive analysis + UX research):
 *
 *   Hero brand (Zenix wordmark + tagline)
 *     - Linear, Stripe, Mews PMS pattern: brand prominently rendered.
 *     - Pre-attentive recognition (Treisman 1980): user processes brand
 *       identity before form chrome.
 *
 *   Animated entrance (Reanimated v4, UI thread)
 *     - Logo scales 0.92 → 1 + fades (300ms spring) on mount.
 *     - Form rises from below (translateY 24 → 0, 400ms spring).
 *     - Communicates "this app is alive and crafted" — Apple HIG 2024
 *       "Add Polish to Your App With Animation".
 *
 *   Demo user selector (Slack-inspired pattern, adapted)
 *     - Visual picker with avatars + role + property.
 *     - 1-tap = pre-fill + auto-submit. Reduces login friction in
 *       demo/QA from ~15s to <1s.
 *     - Apple HIG "Direct Manipulation" — tap the user, log in as them.
 *
 *   Stepwise inputs (Linear pattern)
 *     - Email field; press Continue → password field appears with motion.
 *     - Reduces simultaneous cognitive load (Hick's Law). Each step is
 *       one decision.
 *     - User can also pre-fill via demo picker and skip the email step.
 *
 *   Dark canvas + emerald accent (Zenix brand)
 *     - WCAG 2.1 AA contrast verified in colors.ts.
 *     - Reduces eye strain during evening shifts (housekeepers often
 *       login pre-dawn or post-dusk).
 *
 *   System safe areas
 *     - SafeAreaView from react-native-safe-area-context — content avoids
 *       notch and home indicator on every device class.
 */

import { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated'
import { useAuthStore } from '../../src/store/auth'
import { api } from '../../src/api/client'
import type { AuthResponse } from '@zenix/shared'
import { colors } from '../../src/design/colors'
import { typography } from '../../src/design/typography'
import { MOTION } from '../../src/design/motion'
import { DEMO_USERS, type DemoUser } from '../../src/features/auth/demoUsers'
import { BrandLoader } from '../../src/features/loader/BrandLoader'

export default function LoginScreen() {
  const insets = useSafeAreaInsets()
  const setAuth = useAuthStore((s) => s.setAuth)

  // ── Form state
  const [step, setStep] = useState<'email' | 'password'>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const passwordRef = useRef<TextInput>(null)

  // ── Mount animations (Reanimated v4)
  const heroOpacity = useSharedValue(0)
  const heroScale = useSharedValue(0.92)
  const formY = useSharedValue(24)
  const formOpacity = useSharedValue(0)
  const pickerOpacity = useSharedValue(0)

  useEffect(() => {
    // Staggered entrance: hero first (300ms), then form (delayed 100ms),
    // then demo picker (delayed 250ms). Apple HIG: "Make Animations Look
    // Cohesive" — sequential reveals reinforce hierarchy.
    heroOpacity.value = withTiming(1, { duration: MOTION.duration.slow, easing: MOTION.ease.spring })
    heroScale.value = withSpring(1, MOTION.spring.standard)
    formY.value = withDelay(100, withSpring(0, MOTION.spring.standard))
    formOpacity.value = withDelay(100, withTiming(1, { duration: 400, easing: MOTION.ease.spring }))
    pickerOpacity.value = withDelay(250, withTiming(1, { duration: 500, easing: MOTION.ease.spring }))
  }, [])

  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroOpacity.value,
    transform: [{ scale: heroScale.value }],
  }))
  const formStyle = useAnimatedStyle(() => ({
    opacity: formOpacity.value,
    transform: [{ translateY: formY.value }],
  }))
  const pickerStyle = useAnimatedStyle(() => ({
    opacity: pickerOpacity.value,
  }))

  // ── Step transition (email → password)
  const stepShake = useSharedValue(0)
  const stepShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: stepShake.value }],
  }))

  function handleContinue() {
    if (!email.trim()) {
      // Inform-before-block (CLAUDE.md §33): shake input + light haptic.
      stepShake.value = withSequence(
        withTiming(-8, { duration: 60 }),
        withTiming(8, { duration: 60 }),
        withTiming(-4, { duration: 60 }),
        withTiming(0, { duration: 60 }),
      )
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      return
    }
    Haptics.selectionAsync()
    setStep('password')
    // Auto-focus password input on next tick.
    setTimeout(() => passwordRef.current?.focus(), 100)
  }

  async function handleLogin(emailOverride?: string, passwordOverride?: string) {
    const e = (emailOverride ?? email).trim()
    const p = passwordOverride ?? password
    if (!e || !p) return

    setLoading(true)
    Haptics.selectionAsync()
    try {
      const data = await api.post<AuthResponse>('/auth/login', { email: e, password: p })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setAuth(data)
      // IMPORTANT: do NOT setLoading(false) on success.
      // The root layout's useEffect reads token from the auth store and
      // redirects to /(app) on the next tick. Turning the loader off here
      // causes a one-frame flicker where the login form renders before
      // the router replaces the route. Leaving `loading=true` keeps the
      // BrandLoader visible until navigation unmounts this screen.
      // SwiftUI equivalent: the `.transition()` of the conditional view
      // is owned by the parent — children don't unset their own state.
    } catch (err: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      const msg = err instanceof Error ? err.message : 'Error de conexión'
      Alert.alert('No pudimos iniciar sesión', msg)
      setLoading(false)
    }
  }

  function handleDemoUserTap(user: DemoUser) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setEmail(user.email)
    setPassword(user.password)
    setStep('password')  // jump to step 2 visually so user sees what's happening
    // Defer login so step transition animation completes (~80ms).
    setTimeout(() => handleLogin(user.email, user.password), 200)
  }

  function handleBack() {
    Haptics.selectionAsync()
    setStep('email')
    setPassword('')
  }

  // Full-screen brand loader while the auth request is in flight.
  // SwiftUI equivalent: `if loading { BrandLoader() } else { form }` —
  // the entire screen swaps, communicating "system is processing your action".
  if (loading) {
    return <BrandLoader caption="Iniciando sesión" />
  }

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Hero brand ─────────────────────────────────────────── */}
          <Animated.View style={[styles.hero, heroStyle]}>
            <View style={styles.brandMark}>
              <Text style={styles.brandLogo}>Z</Text>
            </View>
            <Text style={styles.brandWordmark}>Zenix</Text>
            <Text style={styles.brandTagline}>Property Management System</Text>
          </Animated.View>

          {/* ── Auth form ─────────────────────────────────────────── */}
          <Animated.View style={[styles.formCard, formStyle]}>
            {step === 'email' ? (
              <Animated.View style={stepShakeStyle}>
                <Text style={styles.formTitle}>Inicia sesión</Text>
                <Text style={styles.formSubtitle}>Ingresa tu correo para continuar</Text>
                <TextInput
                  style={styles.input}
                  placeholder="tu@correo.com"
                  placeholderTextColor={colors.text.tertiary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  returnKeyType="next"
                  onSubmitEditing={handleContinue}
                  selectionColor={colors.brand[500]}
                />
                <PrimaryButton label="Continuar" onPress={handleContinue} />
              </Animated.View>
            ) : (
              <View>
                <Pressable onPress={handleBack} hitSlop={12} style={styles.backRow}>
                  <Text style={styles.backArrow}>‹</Text>
                  <Text style={styles.backText}>{email}</Text>
                </Pressable>
                <Text style={styles.formTitle}>Tu contraseña</Text>
                <Text style={styles.formSubtitle}>Para finalizar el acceso</Text>
                <TextInput
                  ref={passwordRef}
                  style={styles.input}
                  placeholder="Contraseña"
                  placeholderTextColor={colors.text.tertiary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  returnKeyType="go"
                  onSubmitEditing={() => handleLogin()}
                  selectionColor={colors.brand[500]}
                />
                <PrimaryButton label="Iniciar sesión" loading={loading} onPress={() => handleLogin()} />
              </View>
            )}
          </Animated.View>

          {/* ── Demo user picker (1-tap login) ────────────────────── */}
          <Animated.View style={[styles.demoSection, pickerStyle]}>
            <View style={styles.demoDivider}>
              <View style={styles.dividerLine} />
              <Text style={styles.demoLabel}>O entra como demo</Text>
              <View style={styles.dividerLine} />
            </View>
            <View style={styles.demoGrid}>
              {DEMO_USERS.map((u) => (
                <DemoUserChip key={u.id} user={u} onPress={() => handleDemoUserTap(u)} />
              ))}
            </View>
            <Text style={styles.demoHint}>Toca un avatar para entrar al instante. Todas las cuentas usan contraseña 123456.</Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────────

function PrimaryButton({ label, loading, onPress }: { label: string; loading?: boolean; onPress: () => void }) {
  // Reanimated v4 — scale on press for tactile feedback (Apple HIG).
  const scale = useSharedValue(1)
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))
  return (
    <Pressable
      onPressIn={() => { scale.value = withSpring(0.97, MOTION.spring.snappy) }}
      onPressOut={() => { scale.value = withSpring(1, MOTION.spring.snappy) }}
      onPress={onPress}
      disabled={loading}
    >
      <Animated.View style={[styles.primaryBtn, loading && styles.primaryBtnDisabled, animStyle]}>
        {loading ? (
          <ActivityIndicator color={colors.text.inverse} />
        ) : (
          <Text style={styles.primaryBtnLabel}>{label}</Text>
        )}
      </Animated.View>
    </Pressable>
  )
}

function DemoUserChip({ user, onPress }: { user: DemoUser; onPress: () => void }) {
  const scale = useSharedValue(1)
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))
  return (
    <Pressable
      onPressIn={() => { scale.value = withSpring(0.94, MOTION.spring.snappy) }}
      onPressOut={() => { scale.value = withSpring(1, MOTION.spring.snappy) }}
      onPress={onPress}
      style={styles.chipPressable}
    >
      <Animated.View style={[styles.chip, animStyle]}>
        <View style={[styles.avatar, { backgroundColor: user.avatarBg }]}>
          <Text style={styles.avatarText}>{user.shortName}</Text>
        </View>
        <Text style={styles.chipName} numberOfLines={1}>{user.name.split(' ')[0]}</Text>
        <Text style={styles.chipRole} numberOfLines={1}>{user.roleLabel}</Text>
      </Animated.View>
    </Pressable>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas.primary,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },

  // Hero
  hero: {
    alignItems: 'center',
    marginBottom: 32,
  },
  brandMark: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.brand[500],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: colors.brand[500],
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  brandLogo: {
    fontSize: 34,
    fontWeight: typography.weight.heavy,
    color: colors.text.inverse,
    letterSpacing: -2,
  },
  brandWordmark: {
    fontSize: typography.size.hero,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    letterSpacing: typography.letterSpacing.hero,
    marginBottom: 4,
  },
  brandTagline: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },

  // Form card
  formCard: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  formTitle: {
    fontSize: typography.size.titleLg,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    letterSpacing: typography.letterSpacing.title,
    marginBottom: 6,
  },
  formSubtitle: {
    fontSize: typography.size.body,
    color: colors.text.secondary,
    marginBottom: 20,
  },
  input: {
    backgroundColor: colors.canvas.tertiary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: typography.size.bodyLg,
    color: colors.text.primary,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  primaryBtn: {
    backgroundColor: colors.brand[500],
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: colors.brand[500],
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnLabel: {
    color: colors.text.inverse,
    fontSize: typography.size.bodyLg,
    fontWeight: typography.weight.semibold,
    letterSpacing: 0.2,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 6,
  },
  backArrow: {
    fontSize: 24,
    color: colors.text.secondary,
    lineHeight: 24,
  },
  backText: {
    fontSize: typography.size.small,
    color: colors.text.secondary,
  },

  // Demo user picker
  demoSection: {
    marginTop: 28,
  },
  demoDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.default,
  },
  demoLabel: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
    fontWeight: typography.weight.medium,
  },
  demoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  chipPressable: {
    width: '31%',
  },
  chip: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.subtle,
    gap: 6,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: typography.weight.bold,
  },
  chipName: {
    color: colors.text.primary,
    fontSize: typography.size.small,
    fontWeight: typography.weight.semibold,
  },
  chipRole: {
    color: colors.text.tertiary,
    fontSize: typography.size.micro,
  },
  demoHint: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    textAlign: 'center',
    marginTop: 14,
    paddingHorizontal: 12,
    lineHeight: typography.size.micro * typography.lineHeight.relaxed,
  },
})

// SafeAreaView import is unused in current layout — using insets directly via hook.
// Keeping the import for forward compat (if we move to SafeAreaView wrapper later).
void SafeAreaView
