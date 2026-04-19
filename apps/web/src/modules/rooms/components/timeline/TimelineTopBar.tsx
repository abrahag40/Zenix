import { Search, Plus, Calendar, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { AppDrawer } from '@/components/AppDrawer'
import { PropertySwitcher } from '@/components/PropertySwitcher'
import { UserMenu } from '@/components/UserMenu'

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

function NotificationBell({ count = 0 }: { count?: number }) {
  const hasNew = count > 0

  return (
    <button
      className={cn(
        'relative flex items-center justify-center',
        'w-9 h-9 rounded-lg',
        'text-slate-500 hover:text-slate-700',
        'hover:bg-slate-100 transition-colors duration-150',
      )}
      aria-label="Notificaciones"
    >
      <Bell className="h-5 w-5" strokeWidth={1.75} />

      {hasNew && (
        <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span
            className="absolute w-9 h-9 rounded-lg bg-red-400/20"
            style={{ animation: 'radar1 2.5s ease-out infinite' }}
          />
          <span
            className="absolute w-9 h-9 rounded-lg bg-red-400/15"
            style={{ animation: 'radar2 2.5s ease-out 0.6s infinite' }}
          />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />
        </span>
      )}
    </button>
  )
}

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

        <NotificationBell count={3} />

        <UserMenu />
      </div>
    </div>
  )
}
