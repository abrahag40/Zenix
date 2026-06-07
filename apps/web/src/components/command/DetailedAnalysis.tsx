/**
 * DetailedAnalysis — sección "Análisis del desempeño" del Command Center.
 *
 * Owner 2026-06-07 iter 3: NO collapsable. Always visible con separador visual.
 * Razón: el operador puede querer escanear desempeño sin click extra.
 *
 * Contiene los 4 reportes profundos:
 *   · MetricsOverview     — KPIs detallados (ADR/RevPAR/Ingreso/canales)
 *   · ForecastHeatmap     — pronóstico 28 días color-coded
 *   · PickupSection       — pickup últimos 7-30d + pace YoY
 *   · CompsetCard         — mi tarifa vs mercado
 *
 * Los componentes hijos serán refactorizados al design system zx-* en
 * commits subsiguientes (tasks #92-#95) para coherencia con el Command Center.
 */
import { BarChart3 } from 'lucide-react'
import { MetricsOverview } from '@/components/MetricsOverview'
import { ForecastHeatmap } from '@/components/ForecastHeatmap'
import { PickupSection } from '@/components/PickupSection'
import { CompsetCard } from '@/components/CompsetCard'

export function DetailedAnalysis({ propertyId, isSupervisor }: { propertyId: string; isSupervisor: boolean }) {
  if (!isSupervisor) return null

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 8 }}>
      {/* Section divider — eyebrow + título visual */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          paddingTop: 18,
          borderTop: '1px solid var(--zx-line)',
        }}
      >
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 10,
            background: 'var(--zx-surface-accent)',
            color: 'var(--zx-accent)',
            flexShrink: 0,
          }}
        >
          <BarChart3 size={16} />
        </span>
        <div>
          <span className="zx-eyebrow">Análisis del desempeño</span>
          <p style={{ fontSize: 13, color: 'var(--zx-ink-3)', marginTop: 2 }}>
            KPIs detallados · Forecast · Pickup · Comparativa de mercado
          </p>
        </div>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <MetricsOverview propertyId={propertyId} isSupervisor={isSupervisor} />
        <ForecastHeatmap propertyId={propertyId} isSupervisor={isSupervisor} />
        <PickupSection propertyId={propertyId} isSupervisor={isSupervisor} />
        <CompsetCard propertyId={propertyId} isSupervisor={isSupervisor} />
      </div>
    </section>
  )
}
