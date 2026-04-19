/**
 * Sidebar.tsx — global top bar for routes outside the PMS timeline.
 *
 * The PMS page (/pms) renders <TimelineTopBar /> which embeds the same
 * AppDrawer + PropertySwitcher + UserMenu trio shown here. Every other
 * route is wrapped by <ProtectedLayout /> which pins this bar to the top
 * of the viewport so the navigation UX stays identical across the app.
 *
 * Layout (mirrors TimelineTopBar minus the PMS-specific action icons):
 *
 *   [☰ AppDrawer] [PropertySwitcher]                         [👤 UserMenu]
 *
 * Kept as two exports (Sidebar + MobileNav) for backwards-compat with
 * imports in App.tsx and any mobile-only call sites.
 */
import { AppDrawer } from './AppDrawer'
import { PropertySwitcher } from './PropertySwitcher'
import { UserMenu } from './UserMenu'

function GlobalTopBar() {
  return (
    <div className="fixed top-0 left-0 right-0 z-30 flex items-center gap-3 px-4 h-14 bg-white border-b border-slate-200">
      <AppDrawer />
      <PropertySwitcher />
      <div className="flex-1" />
      <UserMenu />
    </div>
  )
}

export function Sidebar() {
  return <GlobalTopBar />
}

export function MobileNav() {
  // Compatibility shim — unified under GlobalTopBar + AppDrawer.
  return null
}
