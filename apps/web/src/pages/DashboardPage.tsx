import { FxRateWidget } from '@/components/FxRateWidget'
import { OverstayedWidget } from '@/components/OverstayedWidget'
import { TodayRecommendations } from '@/components/TodayRecommendations'
import { MetricsOverview } from '@/components/MetricsOverview'
import { ForecastHeatmap } from '@/components/ForecastHeatmap'
import { PickupSection } from '@/components/PickupSection'
import { CompsetCard } from '@/components/CompsetCard'
import { useAuthStore } from '@/store/auth'
import { usePropertyStore } from '@/store/property'
import { StaffRole } from '@zenix/shared'

/**
 * DashboardPage — placeholder landing.
 *
 * Contenido (KPIs, widgets, resúmenes) fuera de alcance de este sprint.
 * Es el punto de entrada post-login y el destino de "volver" desde los
 * módulos de Calendario y Housekeeping.
 */
export function DashboardPage() {
  const isSupervisor = useAuthStore((s) => s.user?.role === StaffRole.SUPERVISOR)
  const propertyId = usePropertyStore((s) => s.activePropertyId) ?? ''

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Panel principal de Zenix.
        </p>
      </header>

      {/* Top row — 3 cards en grid responsivo (fix 2026-06-07 + audit Apple HIG):
          FxRate + Overstayed + TodayRecommendations al MISMO rol semántico.
          Sin `items-start`: el grid default (stretch) iguala alturas al
          contenido más alto del row — Apple HIG Visual Balance. min-h-280
          dentro de cada card sigue siendo el piso (caso 1 sola card en
          mobile). */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FxRateWidget />
        <OverstayedWidget />
        {propertyId && <TodayRecommendations propertyId={propertyId} isSupervisor={isSupervisor} />}
      </section>

      {propertyId && <MetricsOverview propertyId={propertyId} isSupervisor={isSupervisor} />}
      {propertyId && <ForecastHeatmap propertyId={propertyId} isSupervisor={isSupervisor} />}
      {propertyId && <PickupSection propertyId={propertyId} isSupervisor={isSupervisor} />}
      {propertyId && <CompsetCard propertyId={propertyId} isSupervisor={isSupervisor} />}
    </div>
  )
}
