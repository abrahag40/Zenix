/**
 * PulseStrip — Zona 5 del Command Center.
 *
 * Pattern Linear Insights + Tufte: cada KPI es un mini-card individual
 * con sparkline gradiente prominente + delta chip semantic. No 3 tiles
 * iguales: cada uno tiene su acento de color.
 */
import { useMemo } from 'react'
import type { DashboardSnapshot } from '@/hooks/useDashboardSnapshot'
import { formatMoney } from './format'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface PulseConfig {
  label: string
  accent: string
  bgWash: string
}
const CONFIGS = {
  occ: { label: 'Ocupación', accent: 'oklch(0.52 0.20 270)', bgWash: 'oklch(0.99 0.005 270)' } as PulseConfig,
  adr: { label: 'ADR',        accent: 'oklch(0.55 0.15 152)', bgWash: 'oklch(0.99 0.005 152)' } as PulseConfig,
  revpar: { label: 'RevPAR',  accent: 'oklch(0.55 0.16 200)', bgWash: 'oklch(0.99 0.005 200)' } as PulseConfig,
}

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
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <span className="zx-eyebrow">Pulso · últimos 14 días</span>
          <h2 className="zx-card-h" style={{ marginTop: 6 }}>Cómo va tu desempeño</h2>
        </div>
        {last && <span className="zx-meta">Último cierre: {last.dateIso}</span>}
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
        <PulseCard
          config={CONFIGS.occ}
          value={last ? `${last.occupancyPercent.toFixed(0)}%` : '—'}
          delta={delta(last?.occupancyPercent, prev?.occupancyPercent, 'pts')}
          deltaSign={deltaSign(last?.occupancyPercent, prev?.occupancyPercent)}
          series={series.occ}
        />
        <PulseCard
          config={CONFIGS.adr}
          value={last ? formatMoney(last.adr, ccy) : '—'}
          delta={deltaPct(last?.adr, prev?.adr)}
          deltaSign={deltaSign(last?.adr, prev?.adr)}
          series={series.adr}
        />
        <PulseCard
          config={CONFIGS.revpar}
          value={last ? formatMoney(last.revpar, ccy) : '—'}
          delta={deltaPct(last?.revpar, prev?.revpar)}
          deltaSign={deltaSign(last?.revpar, prev?.revpar)}
          series={series.revpar}
        />
      </div>
    </section>
  )
}

function PulseCard({
  config,
  value,
  delta,
  deltaSign,
  series,
}: {
  config: PulseConfig
  value: string
  delta: string | null
  deltaSign: 'up' | 'down' | 'flat' | null
  series: number[]
}) {
  const DeltaIcon = deltaSign === 'up' ? TrendingUp : deltaSign === 'down' ? TrendingDown : Minus
  const deltaColor = deltaSign === 'up' ? 'oklch(0.42 0.13 152)' : deltaSign === 'down' ? 'oklch(0.45 0.18 25)' : 'var(--zx-ink-3)'
  const deltaBg = deltaSign === 'up' ? 'oklch(0.95 0.05 152)' : deltaSign === 'down' ? 'oklch(0.96 0.04 25)' : 'var(--zx-surface-soft)'

  return (
    <div
      className="zx-card"
      style={{
        padding: 20,
        background: config.bgWash,
        borderColor: config.accent.replace(')', ' / 0.15)'),
        display: 'flex', flexDirection: 'column', gap: 14, position: 'relative', overflow: 'hidden',
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600,
            color: config.accent,
          }}
        >{config.label}</span>
        {delta && deltaSign && (
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 2,
              padding: '2px 8px', borderRadius: 999,
              background: deltaBg, color: deltaColor,
              fontSize: 11, fontWeight: 500, fontVariantNumeric: 'tabular-nums',
            }}
          >
            <DeltaIcon size={11} />{delta}
          </span>
        )}
      </header>

      <span className="zx-metric" style={{ fontSize: 'var(--zx-text-display-l)', color: 'var(--zx-ink-1)' }}>
        {value}
      </span>

      <Sparkline values={series} height={42} accent={config.accent} />
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
function deltaSign(a: number | undefined, b: number | undefined): 'up' | 'down' | 'flat' | null {
  if (a == null || b == null) return null
  if (a > b) return 'up'
  if (a < b) return 'down'
  return 'flat'
}

function Sparkline({ values, height = 42, accent }: { values: number[]; height?: number; accent: string }) {
  if (values.length === 0) {
    return <div style={{ height, background: 'var(--zx-surface-soft)', borderRadius: 8 }} />
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 100
  const h = height
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * w
    const y = h - ((v - min) / range) * (h - 4) - 2
    return [x, y] as [number, number]
  })
  const linePath = `M${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}`
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`
  const lastPt = points[points.length - 1]
  const gradId = `grad-${accent.replace(/[^a-z0-9]/gi, '')}`

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.30" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={accent} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastPt[0]} cy={lastPt[1]} r="3" fill={accent} stroke="white" strokeWidth="1.5" />
    </svg>
  )
}
