import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useAuthStore } from '../src/store/auth'
import { requestNotificationPermissions, registerForPushNotificationsAsync, setupNotificationListeners } from '../src/notifications'
import { startSyncManager, stopSyncManager } from '../src/syncManager'
import { useGlobalSSEListener } from '../src/api/useGlobalSSEListener'
import { IncomingTaskAlarmHost } from '../src/features/housekeeping/alarm/IncomingTaskAlarmHost'
import { colors } from '../src/design/colors'
import { ErrorBoundary } from '../src/features/errors/ErrorBoundary'
import { installGlobalErrorHandler } from '../src/features/errors/globalErrorHandler'

// Install once, at module-eval time. Idempotent — installGlobalErrorHandler
// guards against double-install.
installGlobalErrorHandler({
  onError: (err, source) => {
    // TODO(sprint-9): forward to Sentry/Bugsnag here.
    if (__DEV__) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[telemetry stub] ${source}: ${msg}`)
    }
  },
})

/**
 * Root layout — SwiftUI-aligned NavigationStack.
 *
 * Wrapping order (top → bottom):
 *   GestureHandlerRootView → SafeAreaProvider → Stack
 *
 *   1. GestureHandlerRootView MUST be at the top
 *      (docs.swmansion.com/react-native-gesture-handler/docs/installation).
 *      Without it, drag/pan/swipe gestures are silently ignored.
 *
 *   2. SafeAreaProvider feeds notch/home-indicator insets via context.
 *      Apple HIG "Layout Guidelines" — content avoids system regions.
 *
 *   3. Stack is expo-router's equivalent of SwiftUI's NavigationStack.
 *      Configured below to mimic SwiftUI defaults (slide push, spring,
 *      no header — we render our own headers per-screen).
 *
 * SwiftUI alignment:
 *
 *   SwiftUI's NavigationStack pushes new screens with:
 *     - slide_from_right transition (iOS default)
 *     - duration ~280ms (Apple HIG implicit value)
 *     - cubic spring physics
 *
 *   Expo Router accepts these via `screenOptions`. We set:
 *     - animation: 'slide_from_right' — matches NavigationStack push
 *     - animationDuration: 280 — matches Apple's implicit spring duration
 *     - contentStyle: dark canvas — no flash-of-white between screens
 *
 *   The unauthenticated → authenticated transition uses `Redirect` from
 *   app/index.tsx, which is the declarative equivalent of SwiftUI's
 *   `if/else` view branching.
 *
 * Routing surface (multi-area shell with FB/IG-style bottom tabs):
 *   /(auth)/login            — unauthenticated entry
 *   /(app)/                  — Dashboard tab (home, default after login)
 *   /(app)/trabajo           — Mi día (housekeeping work hub)
 *   /(app)/notificaciones    — Notifications (Meta-style)
 *   /(app)/yo                — Profile + Settings menu
 *   /(app)/task/[id]         — task detail (pushed from Mi día tab)
 */
export default function RootLayout() {
  const { token } = useAuthStore()
  const segments = useSegments()
  const router = useRouter()

  /**
   * Reactive auth-aware routing.
   *
   * SwiftUI alignment:
   *   In SwiftUI, navigation reacts to @State changes via NavigationStack
   *   path bindings — when auth state changes, the visible screen swaps
   *   automatically. This useEffect emulates that pattern in expo-router:
   *
   *     - If user logs out → route them out of (app) into (auth)/login
   *     - If user logs in  → route them out of (auth) into (app) (Dashboard)
   *
   *   Reading `segments` from useSegments() gives us the current route
   *   stack, so we only redirect when truly needed (no redundant pushes).
   *
   *   Without this, after a successful login the user sits on the login
   *   screen because no code drives the transition (login form clears
   *   loading state but doesn't navigate). The reactive effect closes
   *   that gap.
   */
  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)'
    const inAppGroup = segments[0] === '(app)'

    if (!token && inAppGroup) {
      // Logged out while inside the authenticated app → bounce to login.
      router.replace('/(auth)/login')
    } else if (token && inAuthGroup) {
      // Logged in while still on login screen (or root) → enter the app.
      router.replace('/(app)')
    }
  }, [token, segments])

  // Side effects keyed on auth state — push registration, sync manager,
  // notification deep-linking. Errors are caught inside each helper so
  // a push-token failure can never break the auth flow.
  useEffect(() => {
    if (!token) return
    // Request local notification permissions first — needed for alarm
    // notifications (scheduleNotificationAsync) even in Expo Go where
    // push token registration is skipped.
    requestNotificationPermissions().catch(() => undefined)
    // Push token registration — skipped automatically in Expo Go.
    registerForPushNotificationsAsync().catch(() => undefined)
    startSyncManager()
    const cleanup = setupNotificationListeners(({ taskId }) => {
      if (taskId) router.push(`/(app)/task/${taskId}`)
    })
    return () => {
      cleanup()
      stopSyncManager()
    }
  }, [token])

  // Real-time SSE listener — single connection at the root. Fans out
  // task:* events to the task store, gamification rings, etc. When the
  // recepcionista activates a checkout from web, the housekeeper's
  // mobile reflects it within ~250ms.
  useGlobalSSEListener()

  // logout escape exposed to the ErrorBoundary fallback.
  const logout = useAuthStore((s) => s.logout)

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* ErrorBoundary lives at the root so any render-time exception
            anywhere in the app surfaces a branded fallback (instead of
            React unmounting the whole tree to a blank screen). */}
        <ErrorBoundary onLogout={logout}>
          <Stack
            screenOptions={{
              headerShown: false,
              // SwiftUI NavigationStack push defaults (Apple HIG 2024).
              animation: 'slide_from_right',
              animationDuration: 280,
              // Avoid flash-of-white between screens — dark canvas
              // matches splash + login + (future) hub.
              contentStyle: { backgroundColor: colors.canvas.primary },
            }}
          />
          {/* Incoming task alarm — listens for SSE 'task:ready' events
              addressed to the current user (HOUSEKEEPER only) and
              shows a full-screen vibrating overlay that requires a
              slide-to-silence gesture. After silence, navigates to
              "Mi día". Mounted at root so it appears above any tab. */}
          <IncomingTaskAlarmHost />
        </ErrorBoundary>
        {/* Status bar matches dark canvas — light icons. */}
        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
