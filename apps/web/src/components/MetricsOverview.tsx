/**
 * MetricsOverview — sección de KPIs del dashboard (Fase 2 RATES-METRICS).
 *
 * Consume `/v1/metrics/range` (snapshots diarios). Muestra el último cierre como
 * headline (ocupación / ADR / RevPAR / ingreso) + tendencia de ocupación 14 días
 * + mix por canal del último día. SUPERVISOR-only (revenue) — el caller gatea por
 * rol; el endpoint además responde 403 a no-supervisores.
 *
 * Honesto: son métricas de ACTUALS (días cerrados), no "hoy en vivo". Por eso el
 * headline dice "Último cierre", no "Hoy".
 */
import { useMemo } from 'react'
import { TrendingUp, BedDouble, DollarSign, Percent } from 'lucide-react'
import { useMetricsRange, type MetricsSnapshot } from '@/hooks/useMetrics'

export function MetricsOverview({ propertyId, isSupervisor }: { propertyId: string; isSupervisor: boolean }) {
  const { from, to } = useMemo(() => {
    const t = new Date(); t.setUTCHours(0, 0, 0, 0)
    const f = new Date(t.getTime() - 13 * 86400000)
    return { from: f, to: t }
  }, [])
  const { data = [], isLoading, isError } = useMetricsRange(propertyId, from, to, isSupervisor)

  if (!isSupervisor) return null
  if (isError) return null // 403 o sin datos → no romper el dashboard
  if (isLoading) {
    return <div className="bg-white border border-gray-200 rounded-xl p-5 text-sm text-gray-400">Cargando métricas…</div>
  }
  if (data.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm font-medium text-gray-700">Métricas</p>
        <p className="text-xs text-gray-400 mt-1">
          Aún no hay snapshots diarios. Se generan cada noche; el supervisor puede reconstruir el
          histórico desde Configuración.
        </p>
      </div>
    )
  }

  const latest = data[data.length - 1]
  const ccy = latest.baseCurrency
  const money = (n: string | number) => `${ccy} ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  const maxOcc = Math.max(...data.map((d) => Number(d.occupancyPercent)), 1)

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4 text-indigo-600" /> Desempeño
        </h2>
        <span className="text-[11px] text-gray-400">Último cierre · {latest.date.slice(0, 10)}</span>
      </div>

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile icon={Percent} label="Ocupación" value={`${Number(latest.occupancyPercent).toFixed(0)}%`}
          hint={`${latest.roomsSold}/${latest.totalRoomsAvailable} hab.`} tone="indigo" />
        <KpiTile icon={DollarSign} label="ADR" value={money(latest.adr)} hint="tarifa promedio" tone="emerald" />
        <KpiTile icon={TrendingUp} label="RevPAR" value={money(latest.revpar)} hint="ingreso/hab. disp." tone="violet" />
        <KpiTile icon={BedDouble} label="Ingreso hab." value={money(latest.roomRevenue)} hint="esa noche" tone="amber" />
      </div>

      {/* Tendencia de ocupación 14 días */}
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 mb-1.5">Ocupación · últimos 14 días</p>
        <div className="flex items-end gap-1 h-20">
          {data.map((d) => {
            const occ = Number(d.occupancyPercent)
            const h = Math.max(2, (occ / maxOcc) * 72)
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center justify-end group relative">
                <div className="w-full rounded-t bg-indigo-400/80 group-hover:bg-indigo-600 transition-colors" style={{ height: `${h}px` }} />
                <span className="text-[8px] text-gray-400 mt-0.5 tabular-nums">{d.date.slice(8, 10)}</span>
                <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-900 text-white text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap z-10">
                  {d.date.slice(5)} · {occ.toFixed(0)}% · {money(d.revpar)} RevPAR
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Channel mix del último cierre */}
      <ChannelMix latest={latest} />
    </section>
  )
}

function KpiTile({ icon: Icon, label, value, hint, tone }: {
  icon: typeof Percent; label: string; value: string; hint: string
  tone: 'indigo' | 'emerald' | 'violet' | 'amber'
}) {
  const toneCls = {
    indigo: 'bg-indigo-50 text-indigo-700', emerald: 'bg-emerald-50 text-emerald-700',
    violet: 'bg-violet-50 text-violet-700', amber: 'bg-amber-50 text-amber-700',
  }[tone]
  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <div className="flex items-center gap-1.5">
        <span className={`inline-flex items-center justify-center h-6 w-6 rounded ${toneCls}`}><Icon className="h-3.5 w-3.5" /></span>
        <span className="text-[11px] text-gray-500">{label}</span>
      </div>
      <p className="text-xl font-semibold text-gray-900 mt-1.5 tabular-nums">{value}</p>
      <p className="text-[10px] text-gray-400">{hint}</p>
    </div>
  )
}

function ChannelMix({ latest }: { latest: MetricsSnapshot }) {
  const entries = Object.entries(latest.channelMix || {}).sort((a, b) => b[1] - a[1])
  const total = entries.reduce((a, [, n]) => a + n, 0)
  if (total === 0) return null
  const colors = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500', 'bg-sky-500', 'bg-rose-500']
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 mb-1.5">Mix por canal · último cierre</p>
      <div className="flex h-2.5 rounded-full overflow-hidden">
        {entries.map(([ch, n], i) => (
          <div key={ch} className={colors[i % colors.length]} style={{ width: `${(n / total) * 100}%` }} title={`${ch}: ${n}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {entries.map(([ch, n], i) => (
          <span key={ch} className="inline-flex items-center gap-1 text-[11px] text-gray-600">
            <span className={`h-2 w-2 rounded-sm ${colors[i % colors.length]}`} /> {ch} {n}
          </span>
        ))}
      </div>
    </div>
  )
}
