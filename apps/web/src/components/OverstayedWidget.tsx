import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronRight } from 'lucide-react'
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

  if (isLoading || !data) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 animate-pulse">
        <div className="h-3 w-32 bg-slate-100 rounded mb-3" />
        <div className="h-6 w-16 bg-slate-100 rounded mb-2" />
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-2">
          Salidas vencidas
        </p>
        <p className="text-sm text-emerald-700 font-medium">
          Sin pendientes
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Todos los checkouts están confirmados al día.
        </p>
      </div>
    )
  }

  const totalOutstanding = data.reduce((sum, s) => sum + Math.max(0, s.outstandingBalance), 0)
  const visible = expanded ? data : data.slice(0, 3)

  return (
    <div className="bg-white border border-amber-200 rounded-xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium text-amber-700 uppercase tracking-wide flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            Salidas vencidas
          </p>
          <p className="text-2xl font-bold text-amber-800 mt-1">{data.length}</p>
        </div>
        {totalOutstanding > 0 && (
          <div className="text-right">
            <p className="text-[10px] text-slate-500">Saldo pendiente</p>
            <p className="text-sm font-semibold text-slate-800">
              ${totalOutstanding.toLocaleString('es-MX', { maximumFractionDigits: 2 })}
            </p>
          </div>
        )}
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
          className="w-full text-[11px] font-medium text-amber-700 hover:text-amber-800
                     py-1 transition-colors"
        >
          {expanded ? 'Ver menos' : `Ver ${data.length - 3} más`}
        </button>
      )}
    </div>
  )
}
