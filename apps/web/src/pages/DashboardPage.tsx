/**
 * DashboardPage — Command Center.
 *
 * Rediseño 2026-06-07 basado en research cross-industry (Linear/Vercel/Stripe
 * design language) + market research PMS (Cloudbeds/Mews/RoomRaccoon/Little
 * Hotelier).
 *
 * Anatomía:
 *   1. HeroStrip          — saludo + estado del día (3 stats grandes)
 *   2. LiveNow + TodayActions (grid 2 col)
 *   3. HeroRecommendation — 1 acción primaria + chips secundarias
 *   4. PulseStrip         — 3 KPIs con sparklines (Tufte)
 *
 * Las cards anteriores (MetricsOverview, ForecastHeatmap, PickupSection,
 * CompsetCard, FxRateWidget, OverstayedWidget) se preservarán como vistas
 * de detalle en /reports/* — fuera de scope este sprint.
 */
import { useAuthStore } from '@/store/auth'
import { usePropertyStore } from '@/store/property'
import { StaffRole } from '@zenix/shared'
import { useDashboardSnapshot } from '@/hooks/useDashboardSnapshot'
import { HeroStrip } from '@/components/command/HeroStrip'
import { LiveNow } from '@/components/command/LiveNow'
import { TodayActions } from '@/components/command/TodayActions'
import { HeroRecommendation } from '@/components/command/HeroRecommendation'
import { PulseStrip } from '@/components/command/PulseStrip'

export function DashboardPage() {
  const isSupervisor = useAuthStore((s) => s.user?.role === StaffRole.SUPERVISOR)
  const propertyId = usePropertyStore((s) => s.activePropertyId) ?? ''
  const { data, isLoading, isError } = useDashboardSnapshot()

  if (isLoading && !data) {
    return (
      <div style={{ background: 'var(--zx-canvas)', minHeight: '100vh', padding: 'var(--zx-s7) var(--zx-s8)' }}>
        <div className="zx-card" style={{ padding: 'var(--zx-s7)' }}>
          <p className="zx-meta">Cargando estado del hotel…</p>
        </div>
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div style={{ background: 'var(--zx-canvas)', minHeight: '100vh', padding: 'var(--zx-s7) var(--zx-s8)' }}>
        <div className="zx-card" style={{ padding: 'var(--zx-s7)' }}>
          <p className="zx-meta">No pudimos cargar el dashboard. Revisa la conexión.</p>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        background: 'var(--zx-canvas)',
        minHeight: '100vh',
        padding: 'var(--zx-s7) var(--zx-s7) var(--zx-s8)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--zx-s5)',
        maxWidth: 1400,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <HeroStrip hero={data.hero} />

      <div
        style={{
          display: 'grid',
          gap: 'var(--zx-s5)',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        }}
      >
        <LiveNow liveNow={data.liveNow} />
        <TodayActions actions={data.actions} baseCurrency={data.pulse.baseCurrency} />
      </div>

      {propertyId && <HeroRecommendation propertyId={propertyId} isSupervisor={isSupervisor} />}

      <PulseStrip pulse={data.pulse} />
    </div>
  )
}
