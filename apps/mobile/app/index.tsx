/**
 * Root index — entrypoint resolver.
 *
 * SwiftUI-aligned pattern (justification):
 *
 *   In SwiftUI, the root scene is a SINGLE View that branches on auth
 *   state, exactly like:
 *
 *     @main struct ZenixApp: App {
 *       @StateObject var auth = AuthStore()
 *       var body: some Scene {
 *         WindowGroup {
 *           if auth.isLoading { BrandLoader() }
 *           else if auth.token == nil { LoginScreen() }
 *           else { MainTabView() }
 *         }
 *       }
 *     }
 *
 *   Expo Router achieves the same pattern with this file. The `<Redirect>`
 *   is declarative — equivalent to SwiftUI's conditional view return.
 *
 *   Why this matters for UX:
 *     - Apple HIG "Launching Your App" (2024): the user should never see
 *       a blank or "unmatched route" between splash and first interactive
 *       screen.
 *     - The previous version had no /index route, so a deep-link launch
 *       (`exp://.../--/`) bounced through the root layout's useEffect-based
 *       redirect, which races with the router's first render.
 *     - This file resolves synchronously: token present → app, absent →
 *       login, hydrating → BrandLoader.
 */

import { useEffect, useState } from 'react'
import { Redirect } from 'expo-router'
import { useAuthStore } from '../src/store/auth'
import { BrandLoader } from '../src/features/loader/BrandLoader'

export default function RootIndex() {
  const token = useAuthStore((s) => s.token)
  // Zustand persists via AsyncStorage. On cold start it briefly returns null
  // before hydration completes. Show the brand loader until hydration ticks.
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    // One frame is enough for zustand persist to populate from AsyncStorage.
    // Using requestAnimationFrame keeps the splash → loader transition smooth.
    const id = requestAnimationFrame(() => setHydrated(true))
    return () => cancelAnimationFrame(id)
  }, [])

  if (!hydrated) {
    return <BrandLoader caption="Cargando Zenix" />
  }

  if (!token) {
    return <Redirect href="/(auth)/login" />
  }

  // After login, land on the Dashboard tab (index of the (app) group).
  // The Tabs layout takes over from there.
  return <Redirect href="/(app)" />
}
