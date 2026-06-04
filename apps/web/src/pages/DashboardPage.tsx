import { FxRateWidget } from '@/components/FxRateWidget'
import { OverstayedWidget } from '@/components/OverstayedWidget'
import { MetricsOverview } from '@/components/MetricsOverview'
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

      {propertyId && <MetricsOverview propertyId={propertyId} isSupervisor={isSupervisor} />}
      {propertyId && <PickupSection propertyId={propertyId} isSupervisor={isSupervisor} />}
      {propertyId && <CompsetCard propertyId={propertyId} isSupervisor={isSupervisor} />}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FxRateWidget />
        <OverstayedWidget />
      </section>
    </div>
  )
}
