/**
 * ForecastHeatmap — pronóstico ocupación 28 días.
 *
 * Rediseño 2026-06-07 al design system zx-* del Command Center.
 * Patrón steal-as-artist: Dribbble Calendar Dashboard + GitHub contribution
 * grid + Notion calendar — celdas con tint color-coded por ocupación band,
 * today highlighted, hover panel debajo.
 *
 * Color scale Mehrabian-Russell + §31:
 *   <40% → slate cool (cold)
 *   40-60% → amber (warming)
 *   60-75% → emerald soft (healthy)
 *   75-90% → emerald (strong)
 *   ≥90% → emerald deep (peak)
 */
import { useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { usePace, type PaceRow } from '@/hooks/useMetrics'

const SPANISH_DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const SPANISH_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const HORIZON_DAYS = 28
const WEEKS = 4

interface HeatmapCell {
  date: Date
  isoDate: string
  data: PaceRow | undefined
}

function startOfWeekMonday(d: Date): Date {
  const day = d.getUTCDay()
  const offset = day === 0 ? -6 : 1 - day
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + offset)
  r.setUTCHours(0, 0, 0, 0)
  return r
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + n)
  return r
}
function formatDayMonth(d: Date): string {
  return `${d.getUTCDate()} ${SPANISH_MONTHS[d.getUTCMonth()]}`
}

function tone(occ: number | undefined): { bg: string; text: string; border: string } {
  if (occ == null || occ < 1)
    return { bg: 'oklch(0.97 0.003 240)', text: 'var(--zx-ink-4)', border: 'oklch(0.92 0.005 240)' }
  if (occ < 40)
    return { bg: 'oklch(0.94 0.012 240)', text: 'oklch(0.42 0.020 240)', border: 'oklch(0.86 0.015 240)' }
  if (occ < 60)
    return { bg: 'oklch(0.95 0.05 75)', text: 'oklch(0.40 0.14 75)', border: 'oklch(0.72 0.16 75 / 0.30)' }
  if (occ < 75)
    return { bg: 'oklch(0.92 0.07 152)', text: 'oklch(0.32 0.13 152)', border: 'oklch(0.55 0.15 152 / 0.30)' }
  if (occ < 90)
    return { bg: 'oklch(0.78 0.14 152)', text: 'oklch(0.98 0.02 152)', border: 'oklch(0.55 0.15 152 / 0.50)' }
  return { bg: 'oklch(0.58 0.16 152)', text: 'oklch(0.99 0.02 152)', border: 'oklch(0.42 0.13 152 / 0.60)' }
}

export function ForecastHeatmap({ propertyId, isSupervisor }: { propertyId: string; isSupervisor: boolean }) {
  const { data, isLoading, isError } = usePace(propertyId, HORIZON_DAYS, isSupervisor)
  const [hover, setHover] = useState<HeatmapCell | null>(null)

  if (!isSupervisor || isError) return null
  if (isLoading || !data) {
    return (
      <div className="zx-card" style={{ padding: 20 }}>
        <p className="zx-meta">Cargando forecast…</p>
      </div>
    )
  }

  const byDate = new Map<string, PaceRow>()
  for (const r of data.series) byDate.set(r.stayDate.slice(0, 10), r)

  const asOf = new Date(data.asOfDate)
  const gridStart = startOfWeekMonday(asOf)
  const weeks: HeatmapCell[][] = []
  for (let w = 0; w < WEEKS; w++) {
    const row: HeatmapCell[] = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(gridStart, w * 7 + d)
      const iso = date.toISOString().slice(0, 10)
      row.push({ date, isoDate: iso, data: byDate.get(iso) })
    }
    weeks.push(row)
  }

  const withData = data.series.filter((r) => r.roomsOnBooks > 0)
  const peak = withData.reduce<PaceRow | undefined>(
    (best, r) => (best == null || r.occupancyPercent > best.occupancyPercent ? r : best),
    undefined,
  )
  const avg = data.series.length > 0
    ? data.series.reduce((a, r) => a + r.occupancyPercent, 0) / data.series.length
    : 0

  return (
    <section className="zx-card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18, position: 'relative' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <span className="zx-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CalendarRange size={11} style={{ color: 'var(--zx-accent)' }} /> Forecast · próximas 4 semanas
          </span>
          <h2 className="zx-card-h" style={{ marginTop: 6 }}>
            {avg >= 75 ? 'Demanda sólida' : avg >= 50 ? 'Demanda mediana' : 'Demanda floja'} en las próximas semanas
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 18, fontSize: 12 }}>
          <Stat label="Ocup. promedio" value={`${avg.toFixed(0)}%`} accent="var(--zx-accent)" />
          {peak && <Stat label="Pico" value={`${peak.occupancyPercent.toFixed(0)}%`} sub={formatDayMonth(new Date(peak.stayDate))} accent="oklch(0.55 0.15 152)" />}
        </div>
      </header>

      {/* Day header */}
      <div style={{ display: 'grid', gridTemplateColumns: '54px repeat(7, minmax(0, 1fr))', gap: 6, fontSize: 10, color: 'var(--zx-ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
        <span />
        {SPANISH_DAYS.map((d) => <span key={d} style={{ textAlign: 'center' }}>{d}</span>)}
      </div>

      {/* 4 weeks grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {weeks.map((row, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: '54px repeat(7, minmax(0, 1fr))', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--zx-ink-4)', alignSelf: 'center', textAlign: 'right', paddingRight: 4, fontVariantNumeric: 'tabular-nums' }}>
              {formatDayMonth(row[0].date)}
            </span>
            {row.map((cell) => {
              const occ = cell.data?.occupancyPercent
              const t = tone(occ)
              const isToday = cell.isoDate === asOf.toISOString().slice(0, 10)
              const isPast = cell.date.getTime() < asOf.getTime() && !isToday
              return (
                <button
                  key={cell.isoDate}
                  type="button"
                  onMouseEnter={() => setHover(cell)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(cell)}
                  onBlur={() => setHover(null)}
                  style={{
                    height: 52,
                    background: t.bg,
                    color: t.text,
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    opacity: isPast ? 0.35 : 1,
                    boxShadow: isToday ? `0 0 0 2px var(--zx-accent), 0 0 0 4px oklch(0.52 0.20 270 / 0.18)` : 'none',
                    transition: 'transform var(--zx-dur-fast) var(--zx-ease-spring), box-shadow var(--zx-dur-fast)',
                  }}
                  aria-label={`${formatDayMonth(cell.date)}: ${occ != null ? occ.toFixed(0) + '% ocupado' : 'sin datos'}`}
                  onMouseOver={(e) => { ;(e.currentTarget as HTMLElement).style.transform = 'scale(1.05)' }}
                  onMouseOut={(e) => { ;(e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
                >
                  <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    {cell.date.getUTCDate()}
                  </span>
                  <span style={{ fontSize: 10, marginTop: 3, fontVariantNumeric: 'tabular-nums', opacity: 0.85 }}>
                    {occ != null && occ > 0 ? `${occ.toFixed(0)}%` : '—'}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingTop: 12, borderTop: '1px solid var(--zx-line-subtle)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: 'var(--zx-ink-3)' }}>
          <span style={{ letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>Ocupación</span>
          <LegendDot color="oklch(0.94 0.012 240)" label="<40" />
          <LegendDot color="oklch(0.95 0.05 75)" label="40-60" />
          <LegendDot color="oklch(0.92 0.07 152)" label="60-75" />
          <LegendDot color="oklch(0.78 0.14 152)" label="75-90" />
          <LegendDot color="oklch(0.58 0.16 152)" label="≥90" />
        </div>
        <span className="zx-meta">AS-OF {asOf.toISOString().slice(0, 10)}</span>
      </div>

      {/* Hover detail */}
      {hover && (
        <div
          style={{
            position: 'absolute',
            left: 22,
            right: 22,
            bottom: 16,
            background: 'var(--zx-surface-deep)',
            color: 'var(--zx-ink-on-deep)',
            padding: '8px 14px',
            borderRadius: 10,
            fontSize: 12,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            boxShadow: '0 6px 18px oklch(0.13 0.01 240 / 0.18)',
            pointerEvents: 'none',
          }}
        >
          <strong style={{ fontWeight: 500 }}>{formatDayMonth(hover.date)}</strong>
          {hover.data ? (
            <span style={{ display: 'flex', gap: 14, fontVariantNumeric: 'tabular-nums' }}>
              <span><span style={{ color: 'oklch(0.70 0.005 240)' }}>Hab.</span> {hover.data.roomsOnBooks}</span>
              <span><span style={{ color: 'oklch(0.70 0.005 240)' }}>Ocup.</span> {hover.data.occupancyPercent.toFixed(0)}%</span>
              {hover.data.stlyOccupancyPercent != null && (
                <span><span style={{ color: 'oklch(0.70 0.005 240)' }}>YoY</span> {(hover.data.occupancyPercent - hover.data.stlyOccupancyPercent).toFixed(0)} pts</span>
              )}
            </span>
          ) : (
            <span style={{ color: 'oklch(0.70 0.005 240)' }}>Sin captura forward</span>
          )}
        </div>
      )}
    </section>
  )
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <span style={{ fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--zx-ink-3)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 600, color: accent, letterSpacing: '-0.018em', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      {sub && <span style={{ fontSize: 10, color: 'var(--zx-ink-3)' }}>{sub}</span>}
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, border: '1px solid oklch(0 0 0 / 0.05)' }} />
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{label}</span>
    </span>
  )
}
