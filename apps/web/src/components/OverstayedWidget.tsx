import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronRight, ClockAlert } from 'lucide-react'
import { useState } from 'react'
import { api } from '@/api/client'

interface OverstayedStay {
  id: string
  guestName: string
  roomNumber: string | null
  roomCategory: string | null
  scheduledCheckout: string
  source: string | null
  bookingRef: string | null
  paymentStatus: string
  totalCharges: number
  totalPayments: number
  outstandingBalance: number
  hoursOverdue: number
}

/**
 * OverstayedWidget — Dashboard widget listando reservas zombie.
 *
 * Sprint AVAIL-OVERSTAY (2026-05-19). Counterpart visible del filtro backend
 * en AvailabilityService.check: los stays cuya scheduledCheckout pasó pero
 * sin actualCheckout. Contabilidad usa este listado para ubicar saldos
 * pendientes; ops lo usa para confirmar checkouts olvidados.
 *
 * El widget se renderiza siempre (estado vacío = "Sin pendientes" verde).
 * Cuando hay items: hero count amber + lista expandible top 5.
 */
export function OverstayedWidget() {
  const [expanded, setExpanded] = useState(false)
  const { data, isLoading } = useQuery<OverstayedStay[]>({
    queryKey: ['overstayed'],
    queryFn: () => api.get('/v1/reports/overstayed'),
    staleTime: 60_000,
  })

  // Card shell unificado — patrón canónico top-row dashboard (Apple HIG 2026-06-07).
  // Header siempre: icon + título + meta chip derecha. Border slate (neutro);
  // los tonos amber están SOLO en el interior, comunicando estado del dato.
  const Shell: React.FC<{ children: React.ReactNode; meta?: React.ReactNode }> = ({ children, meta }) => (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 min-h-[280px] flex flex-col">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-gray-800 flex items-center gap-1.5">
          <ClockAlert className="h-4 w-4 text-indigo-600" />
          Salidas vencidas
        </h2>
        {meta}
      </header>
      {children}
    </div>
  )

  if (isLoading || !data) {
    return (
      <Shell>
        <div className="space-y-2 animate-pulse">
          <div className="h-7 w-16 bg-slate-100 rounded" />
          <div className="h-3 w-40 bg-slate-100 rounded" />
        </div>
      </Shell>
    )
  }

  if (data.length === 0) {
    return (
      <Shell meta={<span className="text-[11px] text-emerald-700 font-medium">Al día</span>}>
        <p className="text-[12px] text-gray-500">
          Todos los checkouts del día están confirmados. Sin huéspedes pendientes de salir.
        </p>
      </Shell>
    )
  }

  const totalOutstanding = data.reduce((sum, s) => sum + Math.max(0, s.outstandingBalance), 0)
  const visible = expanded ? data : data.slice(0, 3)

  return (
    <Shell
      meta={
        totalOutstanding > 0 ? (
          <span className="text-[11px] text-gray-400">
            Saldo{' '}
            <span className="font-semibold text-gray-700 tabular-nums">
              ${totalOutstanding.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
            </span>
          </span>
        ) : null
      }
    >
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-amber-700 tabular-nums">{data.length}</span>
        <span className="text-[12px] text-gray-500">
          {data.length === 1 ? 'huésped no salió' : 'huéspedes sin salida confirmada'}
        </span>
      </div>

      {/* Fix 2026-06-07: cap height + overflow-y-auto cuando se expande →
          evita card super largo cuando hay 10+ overstayed.
          Cap visible default (collapsed=3) sin scroll; expanded cap a 18rem (~6 rows). */}
      <ul
        className={`divide-y divide-slate-100 border-t border-slate-100 ${
          expanded ? 'max-h-72 overflow-y-auto pr-1' : ''
        }`}
      >
        {visible.map((s) => {
          const days = Math.floor(s.hoursOverdue / 24)
          const label = days >= 1 ? `${days}d` : `${s.hoursOverdue}h`
          return (
            <li key={s.id} className="py-2 flex items-center justify-between gap-3 text-xs">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-800 truncate">
                  {s.guestName}
                  {s.roomNumber && (
                    <span className="text-slate-400 font-normal"> · Hab. {s.roomNumber}</span>
                  )}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Vencida hace {label}
                  {s.outstandingBalance > 0.01 && (
                    <span className="ml-1.5 text-amber-700 font-medium">
                      · saldo ${s.outstandingBalance.toFixed(2)}
                    </span>
                  )}
                </p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
            </li>
          )
        })}
      </ul>

      {data.length > 3 && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-auto w-full text-[12px] font-medium text-indigo-700 hover:text-indigo-800
                     py-1 transition-colors"
        >
          {expanded ? 'Ver menos' : `Ver ${data.length - 3} más`}
        </button>
      )}
    </Shell>
  )
}
