/**
 * PulseStrip — Zona 5 del Command Center.
 *
 * Owner feedback 2026-06-07:
 *   · Gráficas más dinámicas (no sparklines tiny estáticos)
 *   · Tipografía más balanceada (28px max, no 44px)
 *
 * Pattern Linear Insights + Stripe Atlas + Vercel Analytics:
 *   · Area chart con gradient prominent
 *   · Grid lines horizontales sutiles
 *   · Axis dates inferior (primer, medio, último)
 *   · Hover dots per punto + tooltip
 *   · Delta chip semantic
 */
import { useMemo, useState } from 'react'
import type { DashboardSnapshot } from '@/hooks/useDashboardSnapshot'
import { formatMoney } from './format'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface PulseConfig {
  label: string
  accent: string
  bgWash: string
}
const CONFIGS = {
  occ:    { label: 'Ocupación', accent: 'oklch(0.52 0.20 270)', bgWash: 'oklch(0.99 0.005 270)' } as PulseConfig,
  adr:    { label: 'ADR',       accent: 'oklch(0.55 0.15 152)', bgWash: 'oklch(0.99 0.005 152)' } as PulseConfig,
  revpar: { label: 'RevPAR',    accent: 'oklch(0.55 0.16 200)', bgWash: 'oklch(0.99 0.005 200)' } as PulseConfig,
}

const SPANISH_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function shortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${SPANISH_MONTHS[m - 1]}`
}

export function PulseStrip({ pulse }: { pulse: DashboardSnapshot['pulse'] }) {
  const ccy = pulse.baseCurrency ?? 'USD'
  const dates = useMemo(() => pulse.days.map((d) => d.dateIso), [pulse.days])
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
        {last && <span className="zx-meta">Último cierre · {shortDate(last.dateIso)}</span>}
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
        <PulseCard
          config={CONFIGS.occ}
          value={last ? `${last.occupancyPercent.toFixed(0)}%` : '—'}
          delta={delta(last?.occupancyPercent, prev?.occupancyPercent, 'pts')}
          deltaSign={deltaSign(last?.occupancyPercent, prev?.occupancyPercent)}
          series={series.occ}
          dates={dates}
          renderValue={(v) => `${v.toFixed(0)}%`}
        />
        <PulseCard
          config={CONFIGS.adr}
          value={last ? formatMoney(last.adr, ccy) : '—'}
          delta={deltaPct(last?.adr, prev?.adr)}
          deltaSign={deltaSign(last?.adr, prev?.adr)}
          series={series.adr}
          dates={dates}
          renderValue={(v) => formatMoney(v, ccy)}
        />
        <PulseCard
          config={CONFIGS.revpar}
          value={last ? formatMoney(last.revpar, ccy) : '—'}
          delta={deltaPct(last?.revpar, prev?.revpar)}
          deltaSign={deltaSign(last?.revpar, prev?.revpar)}
          series={series.revpar}
          dates={dates}
          renderValue={(v) => formatMoney(v, ccy)}
        />
      </div>
    </section>
  )
}

function PulseCard({
  config, value, delta, deltaSign, series, dates, renderValue,
}: {
  config: PulseConfig
  value: string
  delta: string | null
  deltaSign: 'up' | 'down' | 'flat' | null
  series: number[]
  dates: string[]
  renderValue: (v: number) => string
}) {
  const DeltaIcon = deltaSign === 'up' ? TrendingUp : deltaSign === 'down' ? TrendingDown : Minus
  const deltaColor = deltaSign === 'up' ? 'oklch(0.42 0.13 152)' : deltaSign === 'down' ? 'oklch(0.45 0.18 25)' : 'var(--zx-ink-3)'
  const deltaBg = deltaSign === 'up' ? 'oklch(0.95 0.05 152)' : deltaSign === 'down' ? 'oklch(0.96 0.04 25)' : 'var(--zx-surface-soft)'

  return (
    <div
      className="zx-card"
      style={{
        padding: 18,
        background: config.bgWash,
        borderColor: config.accent.replace(')', ' / 0.15)'),
        display: 'flex', flexDirection: 'column', gap: 12,
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

      <span
        style={{
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: '-0.022em',
          lineHeight: 1,
          color: 'var(--zx-ink-1)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >{value}</span>

      <AreaChart values={series} dates={dates} accent={config.accent} renderValue={renderValue} />
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

const SPANISH_MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function dayLabel(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${SPANISH_MONTHS_SHORT[m - 1]}`
}

/** Area chart con grid + axis dates HTML + hover dots — Linear Insights pattern.
 *  Owner fix 2026-06-07: axis labels eran SVG text scaled (garbled rendering).
 *  Ahora HTML row debajo del SVG con tipografía nativa.
 */
function AreaChart({
  values, dates, accent, renderValue,
}: {
  values: number[]
  dates: string[]
  accent: string
  renderValue: (v: number) => string
}) {
  const [hover, setHover] = useState<number | null>(null)
  if (values.length === 0) {
    return <div style={{ height: 80, background: 'var(--zx-surface-soft)', borderRadius: 8 }} />
  }
  const w = 100
  const chartH = 56
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * w
    const y = chartH - ((v - min) / range) * (chartH - 6) - 3
    return [x, y] as [number, number]
  })
  const linePath = `M${points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' L')}`
  const areaPath = `${linePath} L${w},${chartH} L0,${chartH} Z`
  const gradId = `pulse-${accent.replace(/[^a-z0-9]/gi, '').slice(0, 12)}`
  const gridYs = [chartH * 0.2, chartH * 0.55, chartH * 0.9]

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * w
    const idx = Math.round((x / w) * (values.length - 1))
    if (idx >= 0 && idx < values.length) setHover(idx)
  }

  const hoveredPoint = hover != null ? points[hover] : null
  const hoveredVal = hover != null ? values[hover] : null
  const hoveredDate = hover != null ? dates[hover] : null

  const firstLabel = dates[0] ? dayLabel(dates[0]) : ''
  const midLabel = dates[Math.floor(dates.length / 2)] ? dayLabel(dates[Math.floor(dates.length / 2)]) : ''
  const lastLabel = dates[dates.length - 1] ? dayLabel(dates[dates.length - 1]) : ''

  return (
    <div style={{ position: 'relative' }}>
      <svg
        width="100%"
        height={chartH}
        viewBox={`0 0 ${w} ${chartH}`}
        preserveAspectRatio="none"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        style={{ cursor: 'crosshair', display: 'block' }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridYs.map((y) => (
          <line key={y} x1={0} x2={w} y1={y} y2={y} stroke="oklch(0.88 0.005 240)" strokeWidth="0.3" strokeDasharray="0.7 0.7" />
        ))}
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={linePath} fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="0.8" fill={accent} opacity={0.4} />
        ))}
        {hoveredPoint && (
          <>
            <line x1={hoveredPoint[0]} x2={hoveredPoint[0]} y1={0} y2={chartH} stroke={accent} strokeWidth="0.4" strokeDasharray="0.8 0.8" opacity={0.6} vectorEffect="non-scaling-stroke" />
            <circle cx={hoveredPoint[0]} cy={hoveredPoint[1]} r="2.2" fill={accent} stroke="white" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>

      {/* Axis labels — HTML para evitar SVG text scaling garbage. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 6,
          fontSize: 10,
          color: 'var(--zx-ink-4)',
          letterSpacing: 0,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>{firstLabel}</span>
        <span>{midLabel}</span>
        <span>{lastLabel}</span>
      </div>

      {hover != null && hoveredVal != null && hoveredDate && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: `${(hover / (values.length - 1)) * 100}%`,
            transform: 'translate(-50%, -110%)',
            background: 'var(--zx-surface-deep)',
            color: 'var(--zx-ink-on-deep)',
            padding: '5px 10px',
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: '0 6px 18px oklch(0.13 0.01 240 / 0.18)',
            zIndex: 5,
          }}
        >
          <span style={{ color: accent }}>●</span> {renderValue(hoveredVal)}{' '}
          <span style={{ color: 'oklch(0.70 0.005 240)' }}>· {dayLabel(hoveredDate)}</span>
        </div>
      )}
    </div>
  )
}
