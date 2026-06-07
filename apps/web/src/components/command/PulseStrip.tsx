/**
 * PulseStrip — Command Center zona 5.
 *
 * 4 KPIs core (Ocupación / ADR / RevPAR / Ingreso) con SPARKLINES inline
 * — Tufte information design + Mews Coach pattern.
 *
 * Lo crucial: NO mostrar números aislados, mostrar la TENDENCIA mini.
 * El sparkline lo dice todo en 12px de altura.
 *
 * Click → ruta de detalle (futuro /reports/desempeño).
 */
import { useMemo } from 'react'
import type { DashboardSnapshot } from '@/hooks/useDashboardSnapshot'
import { formatMoney } from './format'

export function PulseStrip({ pulse }: { pulse: DashboardSnapshot['pulse'] }) {
  const ccy = pulse.baseCurrency ?? 'USD'
  const series = useMemo(
    () => ({
      occ: pulse.days.map((d) => d.occupancyPercent),
      adr: pulse.days.map((d) => d.adr),
      revpar: pulse.days.map((d) => d.revpar),
    }),
    [pulse.days],
  )
  const last = pulse.days[pulse.days.length - 1]
  const prev = pulse.days[pulse.days.length - 2]

  return (
    <section className="zx-card" style={{ padding: 'var(--zx-s5)', display: 'flex', flexDirection: 'column', gap: 'var(--zx-s4)' }}>
      <header className="zx-eyebrow-row">
        <span className="zx-eyebrow">Pulso · últimos 14 días</span>
        <span className="zx-meta">{pulse.days.length > 0 ? `Último cierre ${last?.dateIso ?? ''}` : 'Sin datos'}</span>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--zx-s4)' }}>
        <PulseTile
          label="Ocupación"
          value={last ? `${last.occupancyPercent.toFixed(0)}%` : '—'}
          delta={delta(last?.occupancyPercent, prev?.occupancyPercent, 'pts')}
          series={series.occ}
        />
        <PulseTile
          label="ADR"
          value={last ? formatMoney(last.adr, ccy) : '—'}
          delta={deltaPct(last?.adr, prev?.adr)}
          series={series.adr}
        />
        <PulseTile
          label="RevPAR"
          value={last ? formatMoney(last.revpar, ccy) : '—'}
          delta={deltaPct(last?.revpar, prev?.revpar)}
          series={series.revpar}
        />
      </div>
    </section>
  )
}

function PulseTile({ label, value, delta, series }: { label: string; value: string; delta: string | null; series: number[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="zx-meta">{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--zx-s2)' }}>
        <span className="zx-metric" style={{ fontSize: 'var(--zx-text-display)' }}>{value}</span>
        {delta ? <span className="zx-meta" style={{ color: 'var(--zx-ink-2)' }}>{delta}</span> : null}
      </div>
      <Sparkline values={series} height={28} />
    </div>
  )
}

function delta(a: number | undefined, b: number | undefined, unit: string): string | null {
  if (a == null || b == null || isNaN(a) || isNaN(b)) return null
  const diff = a - b
  const sign = diff > 0 ? '+' : ''
  return `${sign}${diff.toFixed(0)} ${unit}`
}
function deltaPct(a: number | undefined, b: number | undefined): string | null {
  if (a == null || b == null || !b) return null
  const pct = ((a - b) / b) * 100
  if (!isFinite(pct)) return null
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(0)}%`
}

/** Inline sparkline — 1 SVG, sin dependencias. */
function Sparkline({ values, height = 24 }: { values: number[]; height?: number }) {
  if (values.length === 0) {
    return <div style={{ height, background: 'var(--zx-surface-soft)', borderRadius: 4 }} />
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 100
  const h = height
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1 || 1)) * w
      const y = h - ((v - min) / range) * (h - 3) - 1.5
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  // Soft area under the line for sense of momentum
  const areaPath = `M0,${h} L${points.split(' ').join(' L')} L${w},${h} Z`

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <path d={areaPath} fill="var(--zx-accent)" opacity="0.08" />
      <polyline
        points={points}
        fill="none"
        stroke="var(--zx-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {values.length > 0 && (
        <circle
          cx={w}
          cy={h - ((values[values.length - 1] - min) / range) * (h - 3) - 1.5}
          r="2"
          fill="var(--zx-accent)"
        />
      )}
    </svg>
  )
}
