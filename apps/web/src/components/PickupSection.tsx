/**
 * PickupSection — Pickup + Pace YoY.
 *
 * Rediseño 2026-06-07 al design system zx-* del Command Center.
 * Pattern Linear Insights: hero stats + bar chart por noche + serie YoY pills.
 */
import { useState } from 'react'
import { TrendingUp, TrendingDown, History, Info, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { usePickup, usePace, type PickupRow } from '@/hooks/useMetrics'

const DAYS_AGO_PRESETS = [1, 3, 7, 14, 30]
const SPANISH_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function formatDay(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${SPANISH_MONTHS[m - 1]}`
}
function formatMoney(n: number, ccy: string): string {
  return `${ccy} ${Math.round(n).toLocaleString()}`
}

export function PickupSection({ propertyId, isSupervisor }: { propertyId: string; isSupervisor: boolean }) {
  const [daysAgo, setDaysAgo] = useState(7)
  const { data, isLoading, isError } = usePickup(propertyId, daysAgo, 14, isSupervisor)
  const pace = usePace(propertyId, 30, isSupervisor)

  if (!isSupervisor || isError) return null
  if (isLoading || !data) {
    return (
      <div className="zx-card" style={{ padding: 20 }}>
        <p className="zx-meta">Cargando pickup…</p>
      </div>
    )
  }
  if (data.series.length === 0) {
    return (
      <section className="zx-card" style={{ padding: 20 }}>
        <span className="zx-eyebrow">Pickup &amp; Pace</span>
        <p style={{ fontSize: 13, color: 'var(--zx-ink-3)', marginTop: 6 }}>
          Sin captura forward aún. El cron nocturno la generará automáticamente.
        </p>
      </section>
    )
  }

  const totals = data.series.reduce((acc, r) => ({ rooms: acc.rooms + r.roomsPickup, revenue: acc.revenue + r.revenuePickup }), { rooms: 0, revenue: 0 })
  const ccy = data.series[0]?.baseCurrency ?? 'USD'
  const sameAsOf = data.asOfDate.slice(0, 10) === data.comparedTo.slice(0, 10)
  const rowsWithSales = data.series.filter((r) => r.roomsOnBooks > 0)
  const histShallow = rowsWithSales.length > 0 && rowsWithSales.every((r) => r.roomsPickup === r.roomsOnBooks)
  const paceHasStly = (pace.data?.series ?? []).some((r) => r.stlyRoomsOnBooks != null)

  // Max for bar chart scaling
  const maxAbs = Math.max(1, ...data.series.map((r) => Math.abs(r.roomsPickup)))

  return (
    <section className="zx-card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <span className="zx-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <TrendingUp size={11} style={{ color: 'var(--zx-accent)' }} /> Pickup &amp; Pace
          </span>
          <h2 className="zx-card-h" style={{ marginTop: 6 }}>
            {totals.rooms > 0 ? `+${totals.rooms} habitaciones netas en últimos ${daysAgo}d` : totals.rooms < 0 ? `${totals.rooms} reservas netas (más cancels)` : `Sin movimiento últimos ${daysAgo}d`}
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {DAYS_AGO_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setDaysAgo(n)}
              style={{
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 500,
                borderRadius: 6,
                background: daysAgo === n ? 'var(--zx-accent)' : 'transparent',
                color: daysAgo === n ? 'var(--zx-accent-ink)' : 'var(--zx-ink-2)',
                border: '1px solid',
                borderColor: daysAgo === n ? 'var(--zx-accent)' : 'var(--zx-line)',
                cursor: 'pointer',
                fontVariantNumeric: 'tabular-nums',
                transition: 'all var(--zx-dur-fast)',
              }}
            >{n}d</button>
          ))}
        </div>
      </header>

      {(sameAsOf || histShallow) && (
        <div
          style={{
            display: 'flex', gap: 8, padding: '10px 14px',
            background: 'oklch(0.97 0.03 75)',
            border: '1px solid oklch(0.72 0.16 75 / 0.20)',
            borderRadius: 10,
            fontSize: 12,
            color: 'oklch(0.42 0.13 75)',
            lineHeight: 1.5,
          }}
        >
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{sameAsOf
            ? 'Aún no hay snapshot del período comparado (es el primer día de captura). El delta empieza a ser real desde mañana.'
            : 'Histórico aún insuficiente. Hoy el delta refleja todo lo on-the-books — los días por venir mostrarán el incremento real.'}</span>
        </div>
      )}

      {/* Hero stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <HeroStat
          icon={<ArrowUpRight size={14} />}
          label={`Hab. nuevas · últimos ${daysAgo}d`}
          value={`${totals.rooms >= 0 ? '+' : ''}${totals.rooms}`}
          accent="oklch(0.55 0.15 152)"
          tintBg="oklch(0.99 0.005 152)"
          positive={totals.rooms > 0}
        />
        <HeroStat
          icon={<ArrowUpRight size={14} />}
          label={`Revenue nuevo · últimos ${daysAgo}d`}
          value={`${totals.revenue >= 0 ? '+' : ''}${formatMoney(totals.revenue, ccy)}`}
          accent="oklch(0.55 0.16 200)"
          tintBg="oklch(0.99 0.005 200)"
          positive={totals.revenue > 0}
        />
      </div>

      {/* Bar chart pickup por noche — 14 cols */}
      <div>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span className="zx-eyebrow">Pickup por noche · próximas 14</span>
          <span className="zx-meta">delta hab. nuevas</span>
        </header>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 64 }}>
          {data.series.map((r) => {
            const sign = r.roomsPickup > 0 ? 'pos' : r.roomsPickup < 0 ? 'neg' : 'zero'
            const ratio = Math.abs(r.roomsPickup) / maxAbs
            const h = Math.max(2, ratio * 26)
            return (
              <div key={r.stayDate} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', position: 'relative', cursor: 'help' }} title={`${formatDay(r.stayDate)} · ${r.roomsPickup >= 0 ? '+' : ''}${r.roomsPickup} hab · ${formatMoney(r.revenuePickup, ccy)}`}>
                <div style={{ width: '100%', maxWidth: 18, height: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  {sign === 'pos' && (
                    <div style={{ width: '100%', height: `${h}px`, background: 'linear-gradient(to top, oklch(0.55 0.15 152), oklch(0.70 0.15 145))', borderRadius: '3px 3px 0 0' }} />
                  )}
                </div>
                <div style={{ width: '100%', height: 1, background: 'var(--zx-line)' }} />
                <div style={{ width: '100%', maxWidth: 18, height: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
                  {sign === 'neg' && (
                    <div style={{ width: '100%', height: `${h}px`, background: 'linear-gradient(to bottom, oklch(0.58 0.21 25), oklch(0.65 0.18 30))', borderRadius: '0 0 3px 3px' }} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          {data.series.map((r, i) => (
            <span key={r.stayDate} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--zx-ink-4)', fontVariantNumeric: 'tabular-nums' }}>
              {i % 2 === 0 ? formatDay(r.stayDate).split(' ')[0] : ''}
            </span>
          ))}
        </div>
      </div>

      {/* Pace YoY pills (or empty state) */}
      <div style={{ borderTop: '1px solid var(--zx-line-subtle)', paddingTop: 16 }}>
        <span className="zx-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <History size={11} /> Pace YoY · vs mismo momento año anterior
        </span>
        {paceHasStly ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
            {(pace.data?.series ?? []).slice(0, 7).map((r) => {
              const occ = r.occupancyPercent
              const stly = r.stlyOccupancyPercent ?? 0
              const diff = occ - stly
              const bg = diff > 0 ? 'oklch(0.95 0.05 152)' : diff < 0 ? 'oklch(0.96 0.04 25)' : 'var(--zx-surface-soft)'
              const fg = diff > 0 ? 'oklch(0.32 0.10 152)' : diff < 0 ? 'oklch(0.40 0.18 25)' : 'var(--zx-ink-3)'
              return (
                <div key={r.stayDate} style={{ padding: '8px 6px', background: bg, borderRadius: 8, textAlign: 'center' }}>
                  <p style={{ fontSize: 10, color: 'var(--zx-ink-3)', fontWeight: 500 }}>{formatDay(r.stayDate)}</p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--zx-ink-1)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{occ.toFixed(0)}%</p>
                  <p style={{ fontSize: 10, color: fg, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{diff > 0 ? '+' : ''}{diff.toFixed(0)} pts</p>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, padding: '10px 14px', background: 'var(--zx-surface-soft)', border: '1px solid var(--zx-line)', borderRadius: 10, fontSize: 12, color: 'var(--zx-ink-2)', lineHeight: 1.5 }}>
            <Info size={14} style={{ flexShrink: 0, marginTop: 1, color: 'var(--zx-ink-4)' }} />
            <span>Pace YoY requiere ≥365 días de captura forward. Se activa automáticamente al cumplir 1 año desde el primer captura ({pace.data?.stlyAsOfDate?.slice(0, 10)}).</span>
          </div>
        )}
      </div>
    </section>
  )
}

function HeroStat({ icon, label, value, accent, tintBg, positive }: { icon: React.ReactNode; label: string; value: string; accent: string; tintBg: string; positive: boolean }) {
  return (
    <div style={{ padding: 14, background: tintBg, border: `1px solid ${accent.replace(')', ' / 0.15)')}`, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: accent, fontWeight: 500, letterSpacing: '0.02em' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: 'oklch(1 0 0 / 0.7)', color: accent }}>{icon}</span>
        {label}
      </span>
      <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.022em', color: positive ? accent : 'var(--zx-ink-1)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {value}
      </span>
    </div>
  )
}
// Avoid TS unused import warning
void TrendingDown
