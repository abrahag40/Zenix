/**
 * RatesManagerSection — Settings → Tarifas (RATES-METRICS-COMPSET-CORE Fase 1).
 *
 * Dos sub-tabs:
 *  · Planes  — CRUD de RatePlan + temporadas (multiplicador/precio fijo por rango).
 *  · Calendario — grid RoomType × fecha con la tarifa resuelta (D-RATES2) del plan
 *    seleccionado + bulk-override con preview obligatorio (NN/g H5).
 *
 * Reusa los hooks de `modules/rooms/hooks/useRates` (extendidos, no duplicados).
 */
import { useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, Calendar, Tag, Check, AlertTriangle } from 'lucide-react'
import { usePropertyStore } from '../../store/property'
import {
  useRatePlans, useSaveRatePlan, useDeactivateRatePlan, useSeasonMutations, useSetDayOfWeek,
  useRateQuoteGrid, useBulkOverride, type RatePlan, type BulkOverridePreviewRow,
} from '../../modules/rooms/hooks/useRates'

const DOW_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

type Tab = 'plans' | 'calendar'

export function RatesManagerSection({ isSupervisor }: { isSupervisor: boolean }) {
  const propertyId = usePropertyStore((s) => s.activePropertyId) ?? ''
  const [tab, setTab] = useState<Tab>('plans')

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">Tarifas</h2>
        <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
          Define planes de tarifa (BAR, no-reembolsable, anticipada…), temporadas y precios
          por día. El sistema resuelve el precio de cada noche al instante: override manual →
          temporada × día de semana → tarifa base del plan.
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {([['plans', 'Planes', Tag], ['calendar', 'Calendario de tarifas', Calendar]] as const).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px ${
              tab === k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === 'plans' ? (
        <PlansTab propertyId={propertyId} isSupervisor={isSupervisor} />
      ) : (
        <CalendarTab propertyId={propertyId} isSupervisor={isSupervisor} />
      )}
    </div>
  )
}

// ── Planes ────────────────────────────────────────────────────────────────────
function PlansTab({ propertyId, isSupervisor }: { propertyId: string; isSupervisor: boolean }) {
  const { data: plans = [], isLoading } = useRatePlans(propertyId)
  const [editing, setEditing] = useState<RatePlan | 'new' | null>(null)

  if (isLoading) return <p className="text-sm text-slate-400 py-4">Cargando planes…</p>
  if (editing) {
    return <PlanEditor propertyId={propertyId} plan={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
  }

  return (
    <div className="space-y-3">
      {isSupervisor && (
        <div className="flex justify-end">
          <button onClick={() => setEditing('new')} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold">
            <Plus className="h-3.5 w-3.5" /> Nuevo plan
          </button>
        </div>
      )}
      {plans.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Aún no hay planes de tarifa. El calendario usa la tarifa base de cada tipo de habitación.
        </div>
      ) : (
        plans.map((p) => <PlanCard key={p.id} plan={p} isSupervisor={isSupervisor} onEdit={() => setEditing(p)} />)
      )}
    </div>
  )
}

function strategyLabel(p: RatePlan): string {
  if (p.baseStrategy === 'FIXED') return `Precio fijo ${p.baseRate ?? ''}`
  if (p.baseStrategy === 'MULTIPLIER') return `BAR × ${p.baseMultiplier ?? ''}`
  return 'BAR (tarifa base)'
}

function PlanCard({ plan, isSupervisor, onEdit }: { plan: RatePlan; isSupervisor: boolean; onEdit: () => void }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${plan.isActive ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">{plan.name}</span>
            <span className="text-[10px] font-mono text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">{plan.code}</span>
            {!plan.isActive && <span className="text-[10px] text-slate-500 bg-slate-200 rounded-full px-1.5 py-0.5">Inactivo</span>}
          </div>
          <p className="text-xs text-slate-500 mt-1">{strategyLabel(plan)}</p>
          {plan.seasons.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {plan.seasons.map((s) => (
                <span key={s.id} className="text-[11px] text-slate-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                  {s.name}: {s.overrideRate ? `$${s.overrideRate}` : `×${s.multiplier}`}
                </span>
              ))}
            </div>
          )}
        </div>
        {isSupervisor && (
          <button onClick={onEdit} className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs">
            <Pencil className="h-3.5 w-3.5" /> Editar
          </button>
        )}
      </div>
    </div>
  )
}

function PlanEditor({ propertyId, plan, onDone }: { propertyId: string; plan: RatePlan | null; onDone: () => void }) {
  const save = useSaveRatePlan(propertyId)
  const seasons = useSeasonMutations(propertyId)
  const dowMut = useSetDayOfWeek(propertyId)
  // Reglas por día de semana — 7 multiplicadores (1 = sin ajuste).
  const [dow, setDow] = useState<number[]>(() => {
    const arr = Array(7).fill(1)
    plan?.dayOfWeekRules.forEach((r) => { arr[r.dayOfWeek] = Number(r.multiplier) })
    return arr
  })
  const [code, setCode] = useState(plan?.code ?? '')
  const [name, setName] = useState(plan?.name ?? '')
  const [strategy, setStrategy] = useState<RatePlan['baseStrategy']>(plan?.baseStrategy ?? 'BAR')
  const [baseRate, setBaseRate] = useState(plan?.baseRate ?? '')
  const [baseMultiplier, setBaseMultiplier] = useState(plan?.baseMultiplier ?? '')

  // Season inline form
  const [seasonName, setSeasonName] = useState('')
  const [seasonFrom, setSeasonFrom] = useState('')
  const [seasonTo, setSeasonTo] = useState('')
  const [seasonMode, setSeasonMode] = useState<'multiplier' | 'override'>('multiplier')
  const [seasonValue, setSeasonValue] = useState('')

  const valid = code.trim().length >= 1 && name.trim().length >= 2 &&
    (strategy !== 'FIXED' || Number(baseRate) >= 0) &&
    (strategy !== 'MULTIPLIER' || Number(baseMultiplier) > 0)

  function handleSave() {
    save.mutate({
      planId: plan?.id,
      dto: {
        code: code.trim(), name: name.trim(), baseStrategy: strategy,
        baseRate: strategy === 'FIXED' ? Number(baseRate) : null,
        baseMultiplier: strategy === 'MULTIPLIER' ? Number(baseMultiplier) : null,
      },
    }, { onSuccess: () => { if (!plan) onDone() } })
  }

  function addSeason() {
    if (!plan) return
    if (seasonName.trim().length < 1 || !seasonFrom || !seasonTo || !seasonValue) return
    seasons.create.mutate({
      ratePlanId: plan.id, name: seasonName.trim(), startDate: seasonFrom, endDate: seasonTo,
      ...(seasonMode === 'multiplier' ? { multiplier: Number(seasonValue) } : { overrideRate: Number(seasonValue) }),
    }, { onSuccess: () => { setSeasonName(''); setSeasonFrom(''); setSeasonTo(''); setSeasonValue('') } })
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <button onClick={onDone} className="text-xs text-slate-500 hover:text-slate-700">← Volver a planes</button>
      <h2 className="text-sm font-semibold text-slate-800">{plan ? `Editar — ${plan.name}` : 'Nuevo plan de tarifa'}</h2>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Código</label>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BAR, ADV15, NONREF"
            disabled={!!plan}
            className="mt-1 w-full h-9 rounded-md border border-slate-200 px-2.5 text-sm font-mono disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tarifa anticipada 15 días"
            className="mt-1 w-full h-9 rounded-md border border-slate-200 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
      </div>

      <div>
        <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Estrategia base</label>
        <div className="grid grid-cols-3 gap-1.5 mt-1">
          {([['BAR', 'BAR (tarifa base)'], ['MULTIPLIER', 'Múltiplo de BAR'], ['FIXED', 'Precio fijo']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setStrategy(k)}
              className={`rounded-md border px-2 py-1.5 text-xs ${strategy === k ? 'border-indigo-400 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
              {label}
            </button>
          ))}
        </div>
        {strategy === 'MULTIPLIER' && (
          <div className="mt-2">
            <label className="text-[11px] text-slate-500">Multiplicador (ej. 0.8 = −20%, 1.2 = +20%)</label>
            <input type="number" step="0.01" min={0} value={baseMultiplier} onChange={(e) => setBaseMultiplier(e.target.value)}
              className="mt-1 w-32 h-9 rounded-md border border-slate-200 px-2.5 text-sm tabular-nums" />
          </div>
        )}
        {strategy === 'FIXED' && (
          <div className="mt-2">
            <label className="text-[11px] text-slate-500">Precio fijo por noche</label>
            <input type="number" step="0.01" min={0} value={baseRate} onChange={(e) => setBaseRate(e.target.value)}
              className="mt-1 w-32 h-9 rounded-md border border-slate-200 px-2.5 text-sm tabular-nums" />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={onDone} className="h-9 px-3 rounded-md border border-slate-200 text-slate-600 text-xs hover:bg-slate-50">Cancelar</button>
        <button onClick={handleSave} disabled={!valid || save.isPending}
          className="h-9 px-4 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
          <Check className="h-3.5 w-3.5" /> {save.isPending ? 'Guardando…' : plan ? 'Guardar' : 'Crear plan'}
        </button>
      </div>

      {/* Seasons — solo al editar un plan existente */}
      {plan && (
        <div className="border-t border-slate-100 pt-4">
          <h3 className="text-xs font-semibold text-slate-700 mb-2">Temporadas</h3>
          {plan.seasons.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {plan.seasons.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-xs">
                  <span><strong>{s.name}</strong> · {s.startDate.slice(0, 10)} → {s.endDate.slice(0, 10)} · {s.overrideRate ? `$${s.overrideRate} fijo` : `×${s.multiplier}`}</span>
                  <button onClick={() => seasons.remove.mutate(s.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2 rounded-md bg-slate-50 border border-slate-200 px-3 py-2">
            <input value={seasonName} onChange={(e) => setSeasonName(e.target.value)} placeholder="Nombre (Dic Alta)" className="h-8 w-36 rounded border border-slate-200 px-2 text-xs" />
            <input type="date" value={seasonFrom} onChange={(e) => setSeasonFrom(e.target.value)} className="h-8 rounded border border-slate-200 px-2 text-xs" />
            <input type="date" value={seasonTo} onChange={(e) => setSeasonTo(e.target.value)} className="h-8 rounded border border-slate-200 px-2 text-xs" />
            <select value={seasonMode} onChange={(e) => setSeasonMode(e.target.value as 'multiplier' | 'override')} className="h-8 rounded border border-slate-200 px-1.5 text-xs">
              <option value="multiplier">× multiplicador</option>
              <option value="override">precio fijo</option>
            </select>
            <input type="number" step="0.01" min={0} value={seasonValue} onChange={(e) => setSeasonValue(e.target.value)} placeholder={seasonMode === 'multiplier' ? '1.5' : '300'} className="h-8 w-20 rounded border border-slate-200 px-2 text-xs tabular-nums" />
            <button onClick={addSeason} className="h-8 px-2.5 rounded-md bg-slate-700 text-white text-xs inline-flex items-center gap-1"><Plus className="h-3 w-3" /> Agregar</button>
          </div>

          {/* Reglas por día de semana */}
          <h3 className="text-xs font-semibold text-slate-700 mb-2 mt-4">Ajuste por día de semana</h3>
          <p className="text-[11px] text-slate-400 mb-2">Multiplicador por día (1 = sin ajuste; 1.2 = +20% fines de semana).</p>
          <div className="flex flex-wrap items-end gap-2">
            {DOW_LABELS.map((label, i) => (
              <label key={i} className="text-[11px] text-slate-500 text-center">
                {label}
                <input type="number" step="0.05" min={0} value={dow[i]}
                  onChange={(e) => setDow((prev) => prev.map((v, idx) => idx === i ? (parseFloat(e.target.value) || 0) : v))}
                  className="block w-16 h-8 rounded border border-slate-200 px-1.5 text-xs tabular-nums text-center mt-0.5" />
              </label>
            ))}
            <button
              onClick={() => dowMut.mutate({ planId: plan.id, rules: dow.map((m, d) => ({ dayOfWeek: d, multiplier: m })).filter((r) => r.multiplier !== 1) })}
              disabled={dowMut.isPending}
              className="h-8 px-2.5 rounded-md bg-slate-700 text-white text-xs inline-flex items-center gap-1 disabled:opacity-50">
              <Check className="h-3 w-3" /> {dowMut.isPending ? 'Guardando…' : 'Guardar días'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Calendario de tarifas ──────────────────────────────────────────────────────
function CalendarTab({ propertyId, isSupervisor }: { propertyId: string; isSupervisor: boolean }) {
  const { data: plans = [] } = useRatePlans(propertyId)
  const [planId, setPlanId] = useState<string>('')
  const from = useMemo(() => { const d = new Date(); d.setUTCHours(12, 0, 0, 0); return d }, [])
  const to = useMemo(() => { const d = new Date(from); d.setUTCDate(d.getUTCDate() + 13); return d }, [from])
  const { data: grid, isLoading } = useRateQuoteGrid(propertyId, from, to, planId || undefined)
  const bulk = useBulkOverride(propertyId)

  const [newRate, setNewRate] = useState('')
  const [preview, setPreview] = useState<BulkOverridePreviewRow[] | null>(null)

  function runPreview() {
    if (!grid || !newRate) return
    bulk.mutate(
      { roomTypeIds: grid.roomTypes.map((r) => r.id), ratePlanId: planId || undefined, from: from.toISOString(), to: to.toISOString(), newRate: Number(newRate), dryRun: true },
      { onSuccess: (res) => setPreview(res.preview) },
    )
  }
  function applyBulk() {
    if (!grid || !newRate) return
    bulk.mutate(
      { roomTypeIds: grid.roomTypes.map((r) => r.id), ratePlanId: planId || undefined, from: from.toISOString(), to: to.toISOString(), newRate: Number(newRate), dryRun: false },
      { onSuccess: () => setPreview(null) },
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-slate-600">Plan:</label>
        <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-xs">
          <option value="">Tarifa base (sin plan)</option>
          {plans.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span className="text-[11px] text-slate-400">Próximos 14 días · {grid?.currency ?? ''}</span>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400 py-4">Cargando tarifas…</p>
      ) : !grid || grid.roomTypes.length === 0 ? (
        <p className="text-sm text-slate-400 py-4">No hay tipos de habitación.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="text-xs">
            <thead>
              <tr className="bg-slate-50">
                <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200">Habitación</th>
                {grid.dates.map((d) => (
                  <th key={d} className="px-2 py-2 text-center font-medium text-slate-500 tabular-nums whitespace-nowrap">{d.slice(5)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.roomTypes.map((rt) => (
                <tr key={rt.id} className="border-t border-slate-100">
                  <td className="sticky left-0 bg-white px-3 py-1.5 font-medium text-slate-700 border-r border-slate-200 whitespace-nowrap">{rt.name}</td>
                  {grid.dates.map((d) => (
                    <td key={d} className="px-2 py-1.5 text-center tabular-nums text-slate-800">{grid.grid[rt.id]?.[d] ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk override */}
      {isSupervisor && grid && grid.roomTypes.length > 0 && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
          <h3 className="text-xs font-semibold text-slate-700">Cambiar tarifa en bloque (14 días, todas las habitaciones)</h3>
          <div className="flex flex-wrap items-end gap-2 mt-2">
            <label className="text-xs text-slate-600">Nuevo precio
              <input type="number" step="0.01" min={0} value={newRate} onChange={(e) => { setNewRate(e.target.value); setPreview(null) }}
                className="block w-28 h-8 rounded border border-slate-200 px-2 text-sm tabular-nums mt-0.5" />
            </label>
            <button onClick={runPreview} disabled={!newRate || bulk.isPending}
              className="h-8 px-3 rounded-md border border-indigo-300 bg-white text-indigo-700 text-xs font-medium disabled:opacity-50">
              Previsualizar
            </button>
          </div>

          {preview && (
            <div className="mt-3">
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800">
                  Vas a sobrescribir <strong>{preview.length}</strong> tarifas (override manual, gana sobre temporadas).
                  Ejemplo: {preview.slice(0, 3).map((p) => `${p.roomTypeName} ${p.date.slice(5)}: ${p.current}→${p.next}`).join(' · ')}…
                </p>
              </div>
              <button onClick={applyBulk} disabled={bulk.isPending}
                className="h-8 px-4 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold disabled:opacity-50">
                {bulk.isPending ? 'Aplicando…' : `Aplicar a ${preview.length} tarifas`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
