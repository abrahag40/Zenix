/**
 * Web-only root layout — minimal stub so the bundle mounts in the browser
 * for visual smoke-tests of the mobile UI surface (owner-requested 2026-06-08).
 *
 * The native `_layout.tsx` pulls expo-notifications, expo-audio, NetInfo,
 * GestureHandlerRootView side effects, and the alarm host — none of which
 * have full web parity. To avoid a silent stall during bundle eval on web,
 * we ship a minimal Stack with the same auth-aware redirect logic but
 * without the native-only effects.
 *
 * Production target stays mobile-native; this file ONLY runs when bundling
 * for the `web` platform (Expo Router file-routing convention).
 */
import { useEffect, useState } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useAuthStore } from '../src/store/auth'
import { colors } from '../src/design/colors'

export default function RootLayoutWeb() {
  const { token } = useAuthStore()
  const segments = useSegments()
  const router = useRouter()
  // BUG E2E-7 fix (2026-06-08) — expo-router lanza
  // "Attempted to navigate before mounting the Root Layout component"
  // cuando useEffect dispara router.replace en el primer render (antes que
  // el <Stack /> esté efectivamente registrado). `useRootNavigationState`
  // no resuelve el caso en SDK 54. Workaround pragmatico: defer la lógica
  // de redirect a un setTimeout(0) ó al segundo render via state — el Stack
  // ya está montado para entonces.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const inAuthGroup = segments[0] === '(auth)'
    const inAppGroup = segments[0] === '(app)'
    if (!token && inAppGroup) router.replace('/(auth)/login')
    else if (token && inAuthGroup) router.replace('/(app)')
  }, [mounted, token, segments])

  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          animationDuration: 280,
          contentStyle: { backgroundColor: colors.canvas.primary },
        }}
      />
    </SafeAreaProvider>
  )
}
