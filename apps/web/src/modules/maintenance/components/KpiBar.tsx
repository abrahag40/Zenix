/**
 * KpiBar.tsx — Sprint Mx-1B-W1
 *
 * Barra de KPIs adaptativa por rol (§37 CLAUDE.md). Cada KPI es un botón
 * clickeable que aplica el filtro correspondiente al Kanban. Patrón Stripe
 * Dashboard (KPI bar = primary navigation cuando el contenido es visual
 * suficiente — Apple HIG "Information Hierarchy").
 *
 * Reglas:
 *   · Hide-on-zero para KPIs con `hideOnZero: true` (Sweller — sin ruido).
 *   · Color semántico por urgencia (Treisman 1980 pre-attentive).
 *   · Click toggle: si el filtro ya está activo, lo limpia.
 *   · Animación de transición sutil 200ms (Apple HIG: feedback inmediato).
 */
import type { KpiCard } from '../hooks/useMaintenanceKpis'
import { KPI_COLOR_CLASSES } from '../hooks/useMaintenanceKpis'

interface Props {
  kpis: KpiCard[]
  activeKpiId: string | null
  onToggle: (kpi: KpiCard | null) => void
}

export function KpiBar({ kpis, activeKpiId, onToggle }: Props) {
  if (kpis.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {kpis.map((kpi) => {
        const isActive = kpi.id === activeKpiId
        return (
          <button
            key={kpi.id}
            type="button"
            onClick={() => onToggle(isActive ? null : kpi)}
            className={[
              'group inline-flex items-center gap-2 rounded-xl px-3 py-2',
              'transition-all duration-200 motion-reduce:transition-none',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              KPI_COLOR_CLASSES[kpi.color],
              isActive ? 'shadow-sm scale-[1.02]' : 'hover:shadow-sm',
            ].join(' ')}
            aria-pressed={isActive}
          >
            <span className="text-base leading-none" aria-hidden>
              {kpi.emoji}
            </span>
            <span className="flex flex-col items-start leading-tight">
              <span className="text-lg font-bold tabular-nums">{kpi.count}</span>
              <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">
                {kpi.label}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
