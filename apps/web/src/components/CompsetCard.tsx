/**
 * CompsetCard — Mi tarifa vs mediana del compset.
 *
 * Rediseño 2026-06-07 al design system zx-* del Command Center.
 * Pattern Behance "competitive analysis" + Linear Insights "table with inline bars":
 *   · Hero summary (n noches comparadas + posición vs mercado)
 *   · Tabla con bar viz inline para cada noche (mi rate / mín / mediana / máx)
 *   · Eventos locales del período como chips
 */
import { useMemo } from 'react'
import { AlertTriangle, Calendar, ArrowUpRight, ArrowDownRight, Minus, BarChart3 } from 'lucide-react'
import { useCompsetDashboard, useLocalEvents } from '@/hooks/useCompset'
import { useDailyBar } from '@/modules/rooms/hooks/useRates'

const SPANISH_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function formatDay(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${SPANISH_MONTHS[m - 1]}`
}

export function CompsetCard({ propertyId, isSupervisor }: { propertyId: string; isSupervisor: boolean }) {
  const { data, isLoading, isError } = useCompsetDashboard(propertyId, isSupervisor)
  const { from, to } = useMemo(() => {
    const t = new Date(); t.setUTCHours(0, 0, 0, 0)
    return { from: t, to: new Date(t.getTime() + 14 * 86400000) }
  }, [])
  const events = useLocalEvents(propertyId, from, to, isSupervisor)
  const myBar = useDailyBar(propertyId, from, to)
  const myRateByDate = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of myBar.data ?? []) m.set(r.date, r.bar)
    return m
  }, [myBar.data])

  if (!isSupervisor || isError) return null
  if (isLoading || !data) {
    return <div className="zx-card" style={{ padding: 20 }}><p className="zx-meta">Cargando compset…</p></div>
  }
  if (data.competitors.length === 0) {
    return (
      <section className="zx-card" style={{ padding: 20 }}>
        <span className="zx-eyebrow">Compset</span>
        <p style={{ fontSize: 13, color: 'var(--zx-ink-3)', marginTop: 6 }}>{data.disclaimer}</p>
      </section>
    )
  }

  const dates = uniqueSortedDates(data.competitors)
  const matrix = dates.map((iso) => {
    const rates: number[] = []
    let availableCount = 0
    for (const c of data.competitors) {
      const r = c.ratesByDate?.[iso]
      if (r && r.lowestRate != null) {
        rates.push(r.lowestRate)
        if (r.availability) availableCount += 1
      }
    }
    rates.sort((a, b) => a - b)
    const median = rates.length ? rates[Math.floor(rates.length / 2)] : null
    return { iso, rates, median, min: rates[0] ?? null, max: rates.length ? rates[rates.length - 1] : null, availableCount }
  })

  const ccy = firstCurrency(data.competitors) ?? 'USD'
  const hasStubWarning = data.competitors.some((c) => c.warnings.some((w) => w.includes('STUB')))

  // Narrative count
  const withDelta = matrix
    .map((m) => {
      const myRate = myRateByDate.get(m.iso)
      if (myRate == null || m.median == null) return null
      return ((myRate - m.median) / m.median) * 100
    })
    .filter((d): d is number => d != null)
  const cheapNights = withDelta.filter((d) => d < -15).length
  const premiumNights = withDelta.filter((d) => d > 15).length

  return (
    <section className="zx-card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <span className="zx-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <BarChart3 size={11} style={{ color: 'var(--zx-accent)' }} /> Compset · próximas 14 noches
          </span>
          <h2 className="zx-card-h" style={{ marginTop: 6 }}>
            {cheapNights > 0 && premiumNights === 0 ? `${cheapNights} noches bajo el mercado`
              : premiumNights > 0 && cheapNights === 0 ? `${premiumNights} noches premium`
              : 'Posicionado vs el mercado'}
          </h2>
        </div>
        <span className="zx-meta">{data.competitors.length} hoteles</span>
      </header>

      {hasStubWarning && (
        <div style={{ display: 'flex', gap: 8, padding: '10px 14px', background: 'oklch(0.97 0.03 75)', border: '1px solid oklch(0.72 0.16 75 / 0.20)', borderRadius: 10, fontSize: 12, color: 'oklch(0.42 0.13 75)', lineHeight: 1.5 }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Datos sintéticos (StubAdapter) — el scraping real Playwright se habilita en chunk 3 post-review legal anti-bot (D-COMPSET5).</span>
        </div>
      )}

      {/* Descripción honesta y plana arriba de la tabla */}
      <p style={{ fontSize: 12, color: 'var(--zx-ink-3)', lineHeight: 1.5, margin: 0 }}>
        Comparativa de <strong style={{ color: 'var(--zx-ink-1)', fontWeight: 500 }}>tu tarifa</strong> contra el
        rango y la mediana de tu compset por noche. La columna
        <strong style={{ color: 'var(--zx-ink-1)', fontWeight: 500 }}> posición</strong> resume si estás bajo, en
        línea o por encima del mercado.
      </p>

      {/* Tabla sin mini-bar (causaba confusión visual cuando MyRate caía fuera del rango).
          6 columnas claras: noche | mi rate | mín | mediana | máx | posición */}
      <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--zx-line)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '70px 100px 100px 100px 100px 1fr',
            gap: 12,
            padding: '10px 14px',
            background: 'var(--zx-surface-soft)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--zx-ink-3)',
          }}
        >
          <span>Noche</span>
          <span style={{ textAlign: 'right' }}>Mi tarifa</span>
          <span style={{ textAlign: 'right' }}>Mín</span>
          <span style={{ textAlign: 'right' }}>Mediana</span>
          <span style={{ textAlign: 'right' }}>Máx</span>
          <span style={{ textAlign: 'right' }}>Posición</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {matrix.map((m, i) => {
            const myRate = myRateByDate.get(m.iso)
            const delta = myRate != null && m.median != null ? ((myRate - m.median) / m.median) * 100 : null
            const pos = positionLabel(myRate, m.min, m.median, m.max)

            return (
              <div
                key={m.iso}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '70px 100px 100px 100px 100px 1fr',
                  gap: 12,
                  padding: '12px 14px',
                  alignItems: 'center',
                  borderTop: i > 0 ? '1px solid var(--zx-line-subtle)' : 'none',
                  fontSize: 12.5,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <span style={{ color: 'var(--zx-ink-3)' }}>{formatDay(m.iso)}</span>
                <span style={{ textAlign: 'right', fontWeight: 600, color: 'var(--zx-ink-1)' }}>
                  {myRate != null ? `${ccy} ${Math.round(myRate)}` : <span style={{ color: 'var(--zx-ink-4)' }}>—</span>}
                </span>
                <span style={{ textAlign: 'right', color: 'var(--zx-ink-3)' }}>
                  {m.min != null ? `${ccy} ${Math.round(m.min)}` : '—'}
                </span>
                <span style={{ textAlign: 'right', color: 'var(--zx-ink-2)', fontWeight: 500 }}>
                  {m.median != null ? `${ccy} ${Math.round(m.median)}` : '—'}
                </span>
                <span style={{ textAlign: 'right', color: 'var(--zx-ink-3)' }}>
                  {m.max != null ? `${ccy} ${Math.round(m.max)}` : '—'}
                </span>
                <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {pos ? (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '3px 10px', borderRadius: 999,
                      background: pos.bg, color: pos.fg,
                      fontSize: 11, fontWeight: 500,
                      whiteSpace: 'nowrap',
                    }}>
                      <pos.Icon size={11} />
                      <span>{pos.label}</span>
                      {delta != null && (
                        <span style={{ opacity: 0.7, paddingLeft: 4, borderLeft: `1px solid ${pos.fg}33` }}>
                          {delta > 0 ? '+' : ''}{delta.toFixed(0)}%
                        </span>
                      )}
                    </span>
                  ) : <span style={{ color: 'var(--zx-ink-4)' }}>—</span>}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Local events */}
      {(events.data?.events ?? []).length > 0 && (
        <div style={{ borderTop: '1px solid var(--zx-line-subtle)', paddingTop: 14 }}>
          <span className="zx-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Calendar size={11} /> Eventos del período
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(events.data?.events ?? []).slice(0, 5).map((ev) => {
              const tone =
                ev.demandImpact === 'EXTREME' ? { bg: 'oklch(0.96 0.04 25)', fg: 'oklch(0.42 0.18 25)' }
                : ev.demandImpact === 'HIGH' ? { bg: 'oklch(0.95 0.06 75)', fg: 'oklch(0.40 0.13 75)' }
                : { bg: 'var(--zx-surface-soft)', fg: 'var(--zx-ink-2)' }
              return (
                <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                  <span style={{ padding: '2px 8px', borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {ev.demandImpact}
                  </span>
                  <span style={{ color: 'var(--zx-ink-1)', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.name}</span>
                  <span style={{ color: 'var(--zx-ink-3)', fontVariantNumeric: 'tabular-nums' }}>{formatDay(ev.startDate)} → {formatDay(ev.endDate)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="zx-meta" style={{ fontSize: 10, fontStyle: 'italic' }}>{data.disclaimer}</p>
    </section>
  )
}

function uniqueSortedDates(competitors: { ratesByDate: Record<string, unknown> | null | undefined }[]): string[] {
  const set = new Set<string>()
  for (const c of competitors) {
    for (const k of Object.keys(c.ratesByDate ?? {})) set.add(k)
  }
  return Array.from(set).sort().slice(0, 14)
}

function firstCurrency(competitors: { ratesByDate: Record<string, { currency?: string } | null> }[]): string | null {
  for (const c of competitors) {
    for (const v of Object.values(c.ratesByDate ?? {})) {
      if (v?.currency) return v.currency
    }
  }
  return null
}

/**
 * Posición vs mercado — categórica clara (5 buckets) que reemplaza al mini-bar
 * confuso (causa: cuando MyRate < Min, el dot quedaba flotando antes del track).
 *
 * Bajo mercado    → MyRate < Min          (oportunidad de subir, posiblemente)
 * Bajo mediana    → Min ≤ MyRate < Mediana
 * En mediana      → ±5% de la mediana
 * Sobre mediana   → Mediana < MyRate ≤ Max
 * Premium         → MyRate > Max          (lider de precio del compset)
 */
function positionLabel(
  myRate: number | undefined,
  min: number | null,
  median: number | null,
  max: number | null,
): { label: string; bg: string; fg: string; Icon: typeof ArrowDownRight } | null {
  if (myRate == null || median == null) return null
  if (max != null && myRate > max) {
    return { label: 'Premium', bg: 'oklch(0.95 0.05 152)', fg: 'oklch(0.32 0.10 152)', Icon: ArrowUpRight }
  }
  if (min != null && myRate < min) {
    return { label: 'Bajo mercado', bg: 'oklch(0.96 0.04 25)', fg: 'oklch(0.40 0.18 25)', Icon: ArrowDownRight }
  }
  const pct = ((myRate - median) / median) * 100
  if (Math.abs(pct) <= 5) {
    return { label: 'En línea', bg: 'var(--zx-surface-soft)', fg: 'var(--zx-ink-2)', Icon: Minus }
  }
  if (pct < 0) {
    return { label: 'Bajo mediana', bg: 'oklch(0.96 0.04 75)', fg: 'oklch(0.42 0.13 75)', Icon: ArrowDownRight }
  }
  return { label: 'Sobre mediana', bg: 'oklch(0.95 0.05 152)', fg: 'oklch(0.32 0.10 152)', Icon: ArrowUpRight }
}

function deltaTone(pct: number | null): { bg: string; fg: string } {
  if (pct == null) return { bg: 'var(--zx-surface-soft)', fg: 'var(--zx-ink-4)' }
  const abs = Math.abs(pct)
  if (abs <= 5) return { bg: 'var(--zx-surface-soft)', fg: 'var(--zx-ink-2)' }
  if (abs <= 15) return { bg: 'oklch(0.96 0.04 75)', fg: 'oklch(0.42 0.13 75)' }
  return pct > 0 ? { bg: 'oklch(0.95 0.05 152)', fg: 'oklch(0.32 0.10 152)' } : { bg: 'oklch(0.96 0.04 25)', fg: 'oklch(0.40 0.18 25)' }
}
