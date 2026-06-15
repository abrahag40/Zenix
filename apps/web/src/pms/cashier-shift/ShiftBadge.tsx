import { useState } from 'react'
import { ArrowDownUp, LogOut, Wallet } from 'lucide-react'
import { StaffRole } from '@zenix/shared'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth'
import { CashDialogShell } from './CashDialogShell'
import { OpenShiftDialog } from './OpenShiftDialog'
import { CloseShiftDialog } from './CloseShiftDialog'
import { CashMovementDialog } from './CashMovementDialog'
import { useCurrentShift } from './useCashierShift'

const CASH_ROLES: StaffRole[] = [StaffRole.SUPERVISOR, StaffRole.RECEPTIONIST]

type View = 'none' | 'open' | 'panel' | 'close' | 'movement'

function fmtFloat(rec: Record<string, number> | null | undefined): string {
  if (!rec || Object.keys(rec).length === 0) return '—'
  return Object.entries(rec)
    .map(([c, n]) => `${c} ${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    .join(' · ')
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

/**
 * Badge de caja para el top-bar (Sprint 4). Solo RECEPTIONIST/SUPERVISOR.
 * Sin turno → "Abrir caja"; con turno → panel con fondo de apertura + acciones
 * (movimiento / cerrar). Un solo diálogo abierto a la vez (sin nesting).
 */
export function ShiftBadge() {
  const user = useAuthStore((s) => s.user)
  const { data: shift, isLoading } = useCurrentShift()
  const [view, setView] = useState<View>('none')

  if (!user || !CASH_ROLES.includes(user.role)) return null

  const hasShift = !!shift

  return (
    <>
      <button
        type="button"
        onClick={() => setView(hasShift ? 'panel' : 'open')}
        title="Caja / turno"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-2.5 h-8 text-xs font-medium border transition-colors',
          hasShift
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
        )}
      >
        <Wallet className="h-3.5 w-3.5" />
        {isLoading ? 'Caja…' : hasShift ? 'Caja abierta' : 'Abrir caja'}
      </button>

      <OpenShiftDialog open={view === 'open'} onOpenChange={(o) => setView(o ? 'open' : 'none')} />

      {shift ? (
        <>
          <CashDialogShell
            open={view === 'panel'}
            onOpenChange={(o) => setView(o ? 'panel' : 'none')}
            title="Caja del turno"
            subtitle={`Abierto a las ${fmtTime(shift.openedAt)}`}
          >
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Fondo de apertura
                </p>
                <p className="text-sm tabular-nums text-slate-800">{fmtFloat(shift.openingFloat)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
                <Button variant="outline" className="h-9 text-xs" onClick={() => setView('movement')}>
                  <ArrowDownUp className="h-3.5 w-3.5 mr-1.5" /> Movimiento
                </Button>
                <Button
                  className="h-9 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => setView('close')}
                >
                  <LogOut className="h-3.5 w-3.5 mr-1.5" /> Cerrar turno
                </Button>
              </div>
            </div>
          </CashDialogShell>

          <CloseShiftDialog open={view === 'close'} onOpenChange={(o) => setView(o ? 'close' : 'none')} shift={shift} />
          <CashMovementDialog open={view === 'movement'} onOpenChange={(o) => setView(o ? 'movement' : 'none')} shift={shift} />
        </>
      ) : null}
    </>
  )
}
