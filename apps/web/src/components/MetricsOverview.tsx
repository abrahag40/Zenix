/**
 * MetricsOverview — KPIs del último cierre + tendencia 14d + channel mix.
 *
 * Rediseño 2026-06-07 al design system zx-* del Command Center (owner pidió
 * coherencia visual cross-card). Patrón Behance "KPI cards con sparkline + chart":
 *   · 4 KPI tiles top (Ocupación / ADR / RevPAR / Ingreso)
 *   · Bar chart 14d ocupación
 *   · Channel mix donut
 *
 * SUPERVISOR-only (revenue). El endpoint además responde 403 a no-supervisores.
 * Honesto: son métricas de ACTUALS (días cerrados), no "hoy en vivo".
 */
import { useMemo } from 'react'
import { TrendingUp } from 'lucide-react'
import { useMetricsRange, type MetricsSnapshot } from '@/hooks/useMetrics'
import { InfoTooltip } from '@/components/InfoTooltip'

function formatSnapshotDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${d} ${months[m - 1]} ${y}`
}
function shortDay(iso: string): string {
  const [, , d] = iso.slice(0, 10).split('-').map(Number)
  return String(d)
}

export function MetricsOverview({ propertyId, isSupervisor }: { propertyId: string; isSupervisor: boolean }) {
  const { from, to } = useMemo(() => {
    const t = new Date(); t.setUTCHours(0, 0, 0, 0)
    const f = new Date(t.getTime() - 13 * 86400000)
    return { from: f, to: t }
  }, [])
  const { data = [], isLoading, isError } = useMetricsRange(propertyId, from, to, isSupervisor)

  if (!isSupervisor) return null
  if (isError) return null
  if (isLoading) {
    return (
      <div className="zx-card" style={{ padding: 20 }}>
        <p className="zx-meta">Cargando métricas…</p>
      </div>
    )
  }
  if (data.length === 0) {
    return (
      <div className="zx-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="zx-eyebrow">Desempeño</span>
        <p style={{ fontSize: 13, color: 'var(--zx-ink-3)' }}>
          Aún no hay snapshots diarios. El cron nocturno los genera; el supervisor puede reconstruir el
          histórico desde Configuración.
        </p>
      </div>
    )
  }

  const latest = data[data.length - 1]
  const ccy = latest.baseCurrency
  const money = (n: string | number) =>
    `${ccy} ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  const maxOcc = Math.max(...data.map((d) => Number(d.occupancyPercent)), 1)
  const latestOcc = Number(latest.occupancyPercent)
  const histAvg = data.length > 1
    ? data.slice(0, -1).reduce((s, d) => s + Number(d.occupancyPercent), 0) / (data.length - 1)
    : null
  const histDelta = histAvg != null ? latestOcc - histAvg : null
  const narrativeBand =
    histDelta == null ? 'sin histórico para comparar todavía.'
    : histDelta >= 5 ? `por encima de tu promedio (${histAvg!.toFixed(0)}% últimas 2 semanas).`
    : histDelta <= -5 ? `por debajo de tu promedio (${histAvg!.toFixed(0)}% últimas 2 semanas).`
    : `en línea con tu promedio (${histAvg!.toFixed(0)}% últimas 2 semanas).`

  return (
    <section className="zx-card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <span className="zx-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <TrendingUp size={11} style={{ color: 'var(--zx-accent)' }} /> Desempeño
          </span>
          <h2 className="zx-card-h" style={{ marginTop: 6 }}>Cómo cerró tu último día</h2>
          <p style={{ fontSize: 13, color: 'var(--zx-ink-2)', marginTop: 6, lineHeight: 1.5 }}>
            Vendiste <strong style={{ color: 'var(--zx-ink-1)' }}>{latest.roomsSold} de {latest.totalRoomsAvailable}</strong> cuartos ({latestOcc.toFixed(0)}%) — {narrativeBand}
          </p>
        </div>
        <span className="zx-meta">Último cierre · {formatSnapshotDate(latest.date)}</span>
      </header>

      {/* 4 KPI tiles — pattern Behance dashboard cards top row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        <KpiTile
          label="Ocupación"
          value={`${latestOcc.toFixed(0)}%`}
          hint={`${latest.roomsSold}/${latest.totalRoomsAvailable} hab.`}
          accent="oklch(0.52 0.20 270)"
          tintBg="oklch(0.99 0.005 270)"
          info="Porcentaje de habitaciones vendidas vs. disponibles. Fórmula USALI: vendidas ÷ disponibles × 100."
        />
        <KpiTile
          label="ADR"
          value={money(latest.adr)}
          hint="tarifa promedio"
          accent="oklch(0.55 0.15 152)"
          tintBg="oklch(0.99 0.005 152)"
          info="Average Daily Rate (USALI). Tarifa promedio cobrada por habitación vendida esa noche."
        />
        <KpiTile
          label="RevPAR"
          value={money(latest.revpar)}
          hint="ingreso ÷ hab. disp."
          accent="oklch(0.55 0.16 200)"
          tintBg="oklch(0.99 0.005 200)"
          info="Revenue Per Available Room. KPI maestro: ADR × ocupación. Combina precio y demanda."
        />
        <KpiTile
          label="Ingreso hab."
          value={money(latest.roomRevenue)}
          hint="esa noche"
          accent="oklch(0.62 0.17 75)"
          tintBg="oklch(0.99 0.005 75)"
          info="Suma de tarifas de la noche cerrada. No incluye impuestos ni cargos extra."
        />
      </div>

      {/* Tendencia de ocupación 14 días — bar chart con grid */}
      <div>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span className="zx-eyebrow">Tendencia ocupación · 14 días</span>
          <span className="zx-meta">máx {maxOcc.toFixed(0)}%</span>
        </header>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 72, padding: '4px 0' }}>
          {data.map((d) => {
            const occ = Number(d.occupancyPercent)
            const h = Math.max(3, (occ / maxOcc) * 64)
            const isLast = d.date === latest.date
            return (
              <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, position: 'relative', cursor: 'help' }} title={`${formatSnapshotDate(d.date)} · ${occ.toFixed(0)}% · ${money(d.revpar)} RevPAR`}>
                <div
                  style={{
                    width: '100%',
                    maxWidth: 22,
                    height: `${h}px`,
                    background: isLast
                      ? 'linear-gradient(to top, oklch(0.52 0.20 270), oklch(0.65 0.18 250))'
                      : 'linear-gradient(to top, oklch(0.72 0.08 270 / 0.65), oklch(0.78 0.06 270 / 0.45))',
                    borderRadius: '4px 4px 0 0',
                    transition: 'opacity var(--zx-dur-fast)',
                  }}
                />
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          {data.map((d) => (
            <span key={d.date} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--zx-ink-4)', fontVariantNumeric: 'tabular-nums' }}>
              {shortDay(d.date)}
            </span>
          ))}
        </div>
      </div>

      {/* Channel mix */}
      <ChannelMix latest={latest} />
    </section>
  )
}

function KpiTile({
  label, value, hint, accent, tintBg, info,
}: { label: string; value: string; hint: string; accent: string; tintBg: string; info: string }) {
  return (
    <div
      className="zx-card"
      style={{
        padding: 14,
        background: tintBg,
        borderColor: accent.replace(')', ' / 0.15)'),
        display: 'flex', flexDirection: 'column', gap: 8,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: accent }}>
          {label}
        </span>
        <InfoTooltip text={info} position="bottom" />
      </div>
      <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.022em', lineHeight: 1, color: 'var(--zx-ink-1)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
      <span style={{ fontSize: 11, color: 'var(--zx-ink-3)' }}>{hint}</span>
    </div>
  )
}

function ChannelMix({ latest }: { latest: MetricsSnapshot }) {
  const entries = Object.entries(latest.channelMix || {}).sort((a, b) => b[1] - a[1])
  const total = entries.reduce((a, [, n]) => a + n, 0)
  if (total === 0) return null
  const colors = [
    'oklch(0.52 0.20 270)', // indigo
    'oklch(0.55 0.15 152)', // emerald
    'oklch(0.65 0.17 75)',  // amber
    'oklch(0.55 0.16 200)', // teal
    'oklch(0.58 0.18 320)', // pink
    'oklch(0.58 0.21 25)',  // rose
  ]

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span className="zx-eyebrow">Mix por canal · último cierre</span>
        <span className="zx-meta">{total} reservas</span>
      </header>
      <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', background: 'var(--zx-surface-soft)' }}>
        {entries.map(([ch, n], i) => (
          <div
            key={ch}
            style={{
              width: `${(n / total) * 100}%`,
              background: colors[i % colors.length],
            }}
            title={`${ch}: ${n}`}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 12 }}>
        {entries.map(([ch, n], i) => (
          <span key={ch} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--zx-ink-2)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: colors[i % colors.length] }} />
            <strong style={{ color: 'var(--zx-ink-1)', fontWeight: 500 }}>{ch}</strong>
            <span style={{ color: 'var(--zx-ink-3)', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
