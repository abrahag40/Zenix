/**
 * DashboardPage — Command Center bento.
 *
 * Rediseño visual 2026-06-07 #2 — applied steal-as-artist patterns:
 *   · Bento layout asimétrico (Apple Keynote / Pitch.com)
 *   · Cards tintadas por categoría (Pitch / Notion)
 *   · Display typography Linear (Inter Display vibe)
 *   · Integrated viz: progress bars, sparklines en cada KPI
 *   · Radial gradient hero (Linear midnight + Vercel Geist accents)
 *
 * Grid 12 cols:
 *   · HeroStrip                full width
 *   · LiveNow (5)              + TodayActions (7)
 *   · HeroRecommendation       full width
 *   · PulseStrip               full width (3 mini-cards internas)
 */
import { useAuthStore } from '@/store/auth'
import { usePropertyStore } from '@/store/property'
import { StaffRole } from '@zenix/shared'
import { useDashboardSnapshot } from '@/hooks/useDashboardSnapshot'
import { HeroStrip } from '@/components/command/HeroStrip'
import { LiveNow } from '@/components/command/LiveNow'
import { TodayActions } from '@/components/command/TodayActions'
import { HeroRecommendation } from '@/components/command/HeroRecommendation'
import { InsightsFeed } from '@/components/command/InsightsFeed'
import { PulseStrip } from '@/components/command/PulseStrip'
import { DetailedAnalysis } from '@/components/command/DetailedAnalysis'

export function DashboardPage() {
  const isSupervisor = useAuthStore((s) => s.user?.role === StaffRole.SUPERVISOR)
  const propertyId = usePropertyStore((s) => s.activePropertyId) ?? ''
  const { data, isLoading, isError } = useDashboardSnapshot()

  if (isLoading && !data) {
    return (
      <div style={{ background: 'var(--zx-canvas)', minHeight: '100vh', padding: '32px 32px' }}>
        <div className="zx-card" style={{ padding: 32 }}>
          <p className="zx-meta">Cargando estado del hotel…</p>
        </div>
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div style={{ background: 'var(--zx-canvas)', minHeight: '100vh', padding: '32px 32px' }}>
        <div className="zx-card" style={{ padding: 32 }}>
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
        padding: '28px 32px 48px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        maxWidth: 1400,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <HeroStrip hero={data.hero} />

      {/* Bento row — LiveNow 5 / Actions 7 */}
      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 7fr)',
        }}
      >
        <LiveNow liveNow={data.liveNow} />
        <TodayActions actions={data.actions} baseCurrency={data.pulse.baseCurrency} />
      </div>

      {/* Bento row — Tu siguiente mejor acción (izq) + Insights feed externo (der).
          alignItems:'stretch' = ambas cards igualan altura. Ambas usan height:100% +
          flex distribution interna (CTA con marginTop:auto) → mismo footprint visual
          incluso cuando el contenido cambia por el stepper. */}
      {propertyId && (
        <div
          style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 5fr)',
            alignItems: 'stretch',
          }}
        >
          <HeroRecommendation propertyId={propertyId} isSupervisor={isSupervisor} />
          <InsightsFeed propertyCity={data.hero.propertyCity ?? undefined} />
        </div>
      )}

      <PulseStrip pulse={data.pulse} />

      {propertyId && <DetailedAnalysis propertyId={propertyId} isSupervisor={isSupervisor} />}
    </div>
  )
}
