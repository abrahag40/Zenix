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
import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useAuthStore } from '../src/store/auth'
import { colors } from '../src/design/colors'

export default function RootLayoutWeb() {
  const { token } = useAuthStore()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)'
    const inAppGroup = segments[0] === '(app)'
    if (!token && inAppGroup) router.replace('/(auth)/login')
    else if (token && inAuthGroup) router.replace('/(app)')
  }, [token, segments])

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
