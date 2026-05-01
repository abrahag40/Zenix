/**
 * Authenticated app layout — Bottom Tabs (FB / IG / WhatsApp pattern).
 *
 * Why Tabs (not Drawer or Stack):
 *
 *   Apple HIG "Tab Bars": "Use a tab bar to organize information at the
 *   app level. Tab bars are great for switching between different sections
 *   that the user needs to access frequently."
 *
 *   For Zenix, the housekeeper switches between Dashboard ↔ Mi día ↔
 *   Notificaciones constantly. Tabs put each one zero-friction away —
 *   one tap, one cognitive jump (Hick's Law).
 *
 *   Drawer was rejected because:
 *     - Hidden by default (out-of-sight, out-of-mind — user forgets options)
 *     - Discoverability is poor (Nielsen NN/g 2018: drawer menus reduce
 *       feature usage by ~30% vs visible navigation)
 *     - Conflicts with iOS swipe-to-go-back gesture
 *
 *   Stack was rejected for the top-level shell because:
 *     - No "home" — every screen feels like a sub-screen of the previous
 *     - User has to back-out of one section to enter another
 *
 * SwiftUI alignment:
 *   This file is the equivalent of a SwiftUI TabView with 4 tabs and a
 *   custom tabBarStyle. Hidden screens (task/[id]) are declared with
 *   href: null — equivalent to .toolbar(.hidden, for: .tabBar) on a
 *   pushed detail view.
 */

import { Tabs } from 'expo-router'
import { ZenixTabBar } from '../../src/features/navigation/TabBar'

export default function AppTabsLayout() {
  return (
    <Tabs
      // Use our custom branded tab bar instead of the default gray one.
      // The custom bar handles haptics, animated indicator, and badges.
      tabBar={(props) => <ZenixTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // Smooth tab transitions — fade is the iOS default for tab switches
        // (slide is reserved for push-style nav inside a stack).
        animation: 'fade',
      }}
    >
      <Tabs.Screen name="index"          options={{ title: 'Inicio' }} />
      <Tabs.Screen name="trabajo"        options={{ title: 'Mi día' }} />
      <Tabs.Screen name="notificaciones" options={{ title: 'Notif.' }} />
      <Tabs.Screen name="yo"             options={{ title: 'Yo' }} />

      {/* Hidden from the tab bar — pushed via navigate() from inside
          one of the visible tabs (e.g., tapping a task card opens detail). */}
      <Tabs.Screen name="task/[id]" options={{ href: null }} />
      <Tabs.Screen name="reservation/[id]" options={{ href: null }} />
      <Tabs.Screen name="reservas-calendario" options={{ href: null }} />
      <Tabs.Screen name="blocked-rooms/index" options={{ href: null }} />
      <Tabs.Screen name="blocked-rooms/[id]" options={{ href: null }} />
      <Tabs.Screen name="approvals/index" options={{ href: null }} />
      <Tabs.Screen name="approvals/[id]" options={{ href: null }} />
      <Tabs.Screen name="special-requests" options={{ href: null }} />
    </Tabs>
  )
}
