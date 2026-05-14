import { Search, Plus, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { AppDrawer } from '@/components/AppDrawer'
import { PropertySwitcher } from '@/components/PropertySwitcher'
import { UserMenu } from '@/components/UserMenu'
import { NotificationBell } from '@/components/NotificationBell'

/**
 * TimelineTopBar — sticky header for the PMS timeline.
 *
 * Final layout (Cloudbeds reference + NN/G utility-nav guidance):
 *
 *   ┌──┬────────────────┬────────────┬────────────────────────────────┐
 *   │☰ │ Hotel Tulum ⌄  │  🔍 search │  [+] [📅] [🔔] [👤]             │
 *   └──┴────────────────┴────────────┴────────────────────────────────┘
 *     │         │                          │    │    │    │
 *     │         │                          │    │    │    └ UserMenu
 *     │         │                          │    │    │      (profile,
 *     │         │                          │    │    │       config,
 *     │         │                          │    │    │       version,
 *     │         │                          │    │    │       logout)
 *     │         │                          │    │    └ NotificationBell
 *     │         │                          │    └ Jump-to-date (stub)
 *     │         │                          └ New reservation
 *     │         └ PropertySwitcher (active hotel + dropdown)
 *     └ AppDrawer (hamburger → module nav)
 */

/**
 * NotificationBell antes era un stub decorativo en este archivo (sin onClick,
 * count hardcoded a 3, no abría panel). Ahora importa el componente real
 * de `@/components/NotificationBell` que se conecta al NotificationCenter
 * y abre el panel deslizante con todas las notificaciones reales.
 *
 * Bug 2026-05-13: el usuario reportaba "click en la campana no hace nada"
 * — porque clickeaba el stub. Fix: extracted to shared component used in
 * both Sidebar.tsx and TimelineTopBar.tsx.
 */

interface TimelineTopBarProps {
  onNewReservation?: () => void
}

export function TimelineTopBar({ onNewReservation }: TimelineTopBarProps) {
  return (
    <div className="flex items-center gap-3 px-4 h-14 border-b border-slate-200 bg-white shrink-0">
      {/* Left cluster: nav drawer trigger + property switcher */}
      <AppDrawer />
      <PropertySwitcher />

      {/* Center: search */}
      <div className="flex-1 max-w-md mx-auto relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Buscar reservas, huéspedes..."
          className="pl-9 h-9 bg-slate-50 border-slate-200 text-sm"
        />
      </div>

      {/* Right cluster: actions → user menu */}
      <div className="flex items-center gap-1">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                className="h-8 w-8 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={onNewReservation}
                aria-label="Nueva reserva"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Nueva reserva</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-slate-600"
          aria-label="Ir a fecha"
        >
          <Calendar className="h-4 w-4" />
        </Button>

        <NotificationBell />

        <UserMenu />
      </div>
    </div>
  )
}
