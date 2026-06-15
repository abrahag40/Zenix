import { Plus, Calendar, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GuestSearchBox } from './GuestSearchBox'
import type { GuestSearchResult } from '../../api/guest-stays.api'
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
import { ShiftBadge } from '@/pms/cashier-shift/ShiftBadge'

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
  /** CHECK-IN C2.3 (2026-05-29) — botón Walk-in fast-path. Para huéspedes
   *  que llegan sin reservación previa (común en hostal LATAM backpacker /
   *  last-minute). Abre CheckInDialog con checkInNow=true pre-marcado +
   *  fechas hoy/mañana → tras crear auto-abre ConfirmCheckinDialog.
   *  Flow end-to-end "Llegó cliente → tiene cuarto" en <60s. */
  onWalkIn?: () => void
  /** Búsqueda global → el padre navega el calendario a la reserva + abre su ficha. */
  onSelectStay?: (result: GuestSearchResult) => void
}

export function TimelineTopBar({ onNewReservation, onWalkIn, onSelectStay }: TimelineTopBarProps) {
  return (
    <div className="flex items-center gap-3 px-4 h-14 border-b border-slate-200 bg-white shrink-0">
      {/* Left cluster: nav drawer trigger + property switcher */}
      <AppDrawer />
      <PropertySwitcher />

      {/* Center: search (global de reservas por nombre/teléfono/ID OTA) */}
      <GuestSearchBox onSelect={(r) => onSelectStay?.(r)} />

      {/* Right cluster: actions → user menu */}
      <div className="flex items-center gap-1.5">
        <TooltipProvider delayDuration={300}>
          {/* CHECK-IN C2.3 — Walk-in fast-path button. Botón pill con label
              porque es acción frecuente en hostal LATAM (Pareto ~30-40%
              de check-ins son walk-in según AHLEI benchmark hostal 2023).
              Icon-only sería frictionful — necesita label visible. */}
          {onWalkIn && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 hover:text-emerald-800 text-xs font-semibold"
                  onClick={onWalkIn}
                  aria-label="Walk-in — huésped ya llegó"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  Walk-in
                </Button>
              </TooltipTrigger>
              <TooltipContent>Walk-in — huésped ya llegó, crea reserva + check-in</TooltipContent>
            </Tooltip>
          )}

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

        <ShiftBadge />

        <NotificationBell />

        <UserMenu />
      </div>
    </div>
  )
}
