/**
 * CancellationPoliciesSection — Settings → Políticas de cancelación.
 * Sprint GROUP-BILLING Fase C C5 (D-GRP-C1, 2026-06-02).
 *
 * Modelo alineado con la competencia (Cloudbeds Smart Policies / Mews / OPERA /
 * Little Hotelier): la política es un OBJETO REUTILIZABLE con nombre + ventana
 * gratuita + tramos de penalización. El hotel parte de un preset (Flexible /
 * Moderada / Estricta / No-reembolsable) y lo personaliza — así "cada hotel
 * expresa su propia política" y no se siente encajonado.
 *
 * Diferenciador: SIMULADOR EN DINERO ("si un huésped cancela ahora se le cobra
 * $X") en la propia pantalla de config — ningún competidor lo muestra ahí.
 */
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Trash2, Pencil, Check, Star, Calculator } from 'lucide-react'
import { usePropertyStore } from '../../store/property'
import {
  cancellationPoliciesApi, computeOutcomePreview, tierLabel, POLICY_PRESETS,
  type CancellationPolicy, type PolicyTier, type ChargeType,
} from '../../api/cancellation-policies'

const CHARGE_TYPES: { value: ChargeType; label: string }[] = [
  { value: 'NIGHTS',  label: 'Noches' },
  { value: 'PERCENT', label: '% del total' },
  { value: 'FIXED',   label: 'Monto fijo' },
]

function hoursHint(h: number): string {
  if (h >= 1_000_000) return 'siempre'
  if (h === 0) return 'check-in'
  if (h % 24 === 0) return `${h / 24} día${h / 24 === 1 ? '' : 's'}`
  return `${h} h`
}

// ── List ────────────────────────────────────────────────────────────────────
export function CancellationPoliciesSection({ isSupervisor }: { isSupervisor: boolean }) {
  const propertyId = usePropertyStore((s) => s.activePropertyId) ?? ''
  const [editing, setEditing] = useState<CancellationPolicy | 'new' | null>(null)

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ['cancellation-policies', propertyId],
    queryFn: () => cancellationPoliciesApi.list(propertyId),
    enabled: !!propertyId,
  })

  if (isLoading) return <p className="text-sm text-slate-400 py-4">Cargando políticas…</p>

  if (editing) {
    return (
      <PolicyEditor
        propertyId={propertyId}
        policy={editing === 'new' ? null : editing}
        onDone={() => setEditing(null)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Políticas de cancelación</h2>
          <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
            Define las reglas de tu hotel: hasta cuándo se cancela gratis y cuánto se cobra
            según la anticipación. La política marcada como predeterminada se aplica a las
            reservas nuevas. El sistema calcula solo la retención y el reembolso al cancelar.
          </p>
        </div>
        {isSupervisor && (
          <button
            onClick={() => setEditing('new')}
            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
          >
            <Plus className="h-3.5 w-3.5" /> Nueva política
          </button>
        )}
      </div>

      {policies.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center">
          <p className="text-sm text-slate-500">Aún no hay políticas configuradas.</p>
          <p className="text-xs text-slate-400 mt-1">
            Mientras tanto, el sistema usa una política por defecto conservadora
            (gratis ≥48 h, 1 noche 48–24 h, 100% &lt;24 h).
          </p>
          {isSupervisor && (
            <button
              onClick={() => setEditing('new')}
              className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-indigo-600 text-white text-xs font-semibold"
            >
              <Plus className="h-3.5 w-3.5" /> Crear la primera
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {policies.map((p) => (
            <PolicyCard key={p.id} policy={p} isSupervisor={isSupervisor} onEdit={() => setEditing(p)} />
          ))}
        </div>
      )}
    </div>
  )
}

function PolicyCard({ policy, isSupervisor, onEdit }: {
  policy: CancellationPolicy; isSupervisor: boolean; onEdit: () => void
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">{policy.name}</span>
          {policy.isDefault && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">
              <Star className="h-3 w-3" /> Predeterminada
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Gratis hasta <strong>{hoursHint(policy.freeWindowHours)}</strong> antes del check-in.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {policy.tiers.map((t, i) => (
            <span key={i} className="text-[11px] text-slate-600 bg-slate-100 rounded px-1.5 py-0.5">
              {hoursHint(t.fromHours)}–{hoursHint(t.toHours)} → {tierLabel(t)}
            </span>
          ))}
        </div>
      </div>
      {isSupervisor && (
        <button onClick={onEdit} className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs">
          <Pencil className="h-3.5 w-3.5" /> Editar
        </button>
      )}
    </div>
  )
}

// ── Editor ──────────────────────────────────────────────────────────────────
function PolicyEditor({ propertyId, policy, onDone }: {
  propertyId: string; policy: CancellationPolicy | null; onDone: () => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(policy?.name ?? '')
  const [isDefault, setIsDefault] = useState(policy?.isDefault ?? false)
  const [freeUnit, setFreeUnit] = useState<'days' | 'hours'>(
    policy && policy.freeWindowHours % 24 !== 0 ? 'hours' : 'days',
  )
  const [freeVal, setFreeVal] = useState(
    policy ? (policy.freeWindowHours % 24 === 0 ? policy.freeWindowHours / 24 : policy.freeWindowHours) : 2,
  )
  const [tiers, setTiers] = useState<PolicyTier[]>(
    policy?.tiers ?? [{ fromHours: 48, toHours: 0, chargeType: 'PERCENT', value: 100 }],
  )

  // Simulador
  const [simPaid, setSimPaid] = useState(2000)
  const [simRate, setSimRate] = useState(1000)

  const freeWindowHours = freeUnit === 'days' ? freeVal * 24 : freeVal

  function applyPreset(key: string) {
    const p = POLICY_PRESETS.find((x) => x.key === key)
    if (!p) return
    setName((n) => n || p.name)
    setFreeUnit(p.freeWindowHours % 24 === 0 ? 'days' : 'hours')
    setFreeVal(p.freeWindowHours % 24 === 0 ? p.freeWindowHours / 24 : p.freeWindowHours)
    setTiers(p.tiers.map((t) => ({ ...t })))
  }

  function updateTier(i: number, patch: Partial<PolicyTier>) {
    setTiers((ts) => ts.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
  }
  function addTier() {
    const last = tiers[tiers.length - 1]
    setTiers((ts) => [...ts, { fromHours: last?.toHours ?? 24, toHours: 0, chargeType: 'PERCENT', value: 50 }])
  }
  function removeTier(i: number) {
    setTiers((ts) => ts.filter((_, idx) => idx !== i))
  }

  const mut = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), freeWindowHours, tiers, isDefault }
      return policy
        ? cancellationPoliciesApi.update(policy.id, payload)
        : cancellationPoliciesApi.create({ propertyId, ...payload })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cancellation-policies', propertyId] })
      toast.success(policy ? 'Política actualizada' : 'Política creada')
      onDone()
    },
    onError: (e: Error) => toast.error(e.message ?? 'No se pudo guardar la política'),
  })

  const valid = name.trim().length >= 2 && tiers.length > 0 &&
    tiers.every((t) => t.fromHours > t.toHours && t.value >= 0)

  // Escenarios del simulador
  const scenarios = useMemo(() => {
    const sample = { totalAmount: simPaid, amountPaid: simPaid, ratePerNight: simRate }
    const points = [
      { label: '10 días antes', h: 240 },
      { label: '3 días antes',  h: 72 },
      { label: '1 día antes',   h: 24 },
      { label: '6 h antes',     h: 6 },
      { label: 'No llegó (no-show)', h: -1 },
    ]
    return points.map((pt) => ({ ...pt, out: computeOutcomePreview({ freeWindowHours, tiers }, sample, pt.h) }))
  }, [freeWindowHours, tiers, simPaid, simRate])

  return (
    <div className="space-y-5 max-w-3xl">
      <button onClick={onDone} className="text-xs text-slate-500 hover:text-slate-700">← Volver a la lista</button>

      <div>
        <h2 className="text-sm font-semibold text-slate-800">
          {policy ? 'Editar política' : 'Nueva política de cancelación'}
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Parte de un preset y ajústalo. El simulador de abajo muestra exactamente cuánto se cobraría.
        </p>
      </div>

      {/* Presets */}
      <div>
        <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Empezar desde un preset</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-1.5">
          {POLICY_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              title={p.description}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left hover:border-indigo-300 hover:bg-indigo-50/40"
            >
              <span className="block text-xs font-medium text-slate-700">{p.name}</span>
              <span className="block text-[10px] text-slate-400 leading-tight mt-0.5 line-clamp-2">{p.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Nombre + default */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Nombre</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Flexible temporada baja"
            className="mt-1 w-full h-9 rounded-md border border-slate-200 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
          />
        </div>
        <label className="flex items-center gap-2 h-9 cursor-pointer">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
          <span className="text-xs text-slate-600">Predeterminada (reservas nuevas)</span>
        </label>
      </div>

      {/* Ventana gratuita */}
      <div>
        <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Cancelación gratis hasta</label>
        <div className="flex items-center gap-2 mt-1">
          <input
            type="number" min={0} value={freeVal}
            onChange={(e) => setFreeVal(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-24 h-9 rounded-md border border-slate-200 px-2.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <select value={freeUnit} onChange={(e) => setFreeUnit(e.target.value as 'days' | 'hours')}
            className="h-9 rounded-md border border-slate-200 px-2 text-sm">
            <option value="days">días</option>
            <option value="hours">horas</option>
          </select>
          <span className="text-xs text-slate-500">antes del check-in</span>
        </div>
      </div>

      {/* Tramos */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Tramos de penalización (más cerca del check-in = mayor cargo)
          </label>
          <button onClick={addTier} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700">
            <Plus className="h-3.5 w-3.5" /> Agregar tramo
          </button>
        </div>
        <div className="space-y-1.5 mt-1.5">
          {tiers.map((t, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50/60 px-2.5 py-2">
              <span className="text-[11px] text-slate-500">Entre</span>
              <input type="number" min={0} value={t.fromHours}
                onChange={(e) => updateTier(i, { fromHours: Math.max(0, parseInt(e.target.value) || 0) })}
                className="w-20 h-8 rounded border border-slate-200 px-2 text-xs tabular-nums" />
              <span className="text-[11px] text-slate-500">y</span>
              <input type="number" min={0} value={t.toHours}
                onChange={(e) => updateTier(i, { toHours: Math.max(0, parseInt(e.target.value) || 0) })}
                className="w-20 h-8 rounded border border-slate-200 px-2 text-xs tabular-nums" />
              <span className="text-[11px] text-slate-500">h antes → cobrar</span>
              <input type="number" min={0} value={t.value}
                onChange={(e) => updateTier(i, { value: Math.max(0, parseFloat(e.target.value) || 0) })}
                className="w-20 h-8 rounded border border-slate-200 px-2 text-xs tabular-nums" />
              <select value={t.chargeType} onChange={(e) => updateTier(i, { chargeType: e.target.value as ChargeType })}
                className="h-8 rounded border border-slate-200 px-1.5 text-xs">
                {CHARGE_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <span className="text-[10px] text-slate-400">({hoursHint(t.fromHours)}–{hoursHint(t.toHours)})</span>
              {tiers.length > 1 && (
                <button onClick={() => removeTier(i)} className="ml-auto text-slate-400 hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          "0 h" significa hasta el check-in / no-show. El cargo nunca excede el total de la reserva.
        </p>
      </div>

      {/* Simulador en dinero */}
      <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3.5">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-indigo-600" />
          <h3 className="text-sm font-semibold text-slate-800">Simulador — ¿cuánto se cobraría?</h3>
        </div>
        <div className="flex flex-wrap items-end gap-3 mt-2">
          <label className="text-xs text-slate-600">
            Pagado
            <input type="number" min={0} value={simPaid}
              onChange={(e) => setSimPaid(Math.max(0, parseFloat(e.target.value) || 0))}
              className="block w-28 h-8 rounded border border-slate-200 px-2 text-sm tabular-nums mt-0.5" />
          </label>
          <label className="text-xs text-slate-600">
            Tarifa/noche
            <input type="number" min={0} value={simRate}
              onChange={(e) => setSimRate(Math.max(0, parseFloat(e.target.value) || 0))}
              className="block w-28 h-8 rounded border border-slate-200 px-2 text-sm tabular-nums mt-0.5" />
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-1.5 mt-3">
          {scenarios.map((s) => (
            <div key={s.label} className="rounded-md bg-white border border-slate-200 px-2 py-1.5 text-center">
              <p className="text-[10px] text-slate-500 leading-tight">{s.label}</p>
              {s.out.free ? (
                <p className="text-[11px] font-semibold text-emerald-700 mt-1">Gratis</p>
              ) : (
                <>
                  <p className="text-[11px] font-semibold text-amber-700 mt-1">Retiene {s.out.retention.toLocaleString()}</p>
                  <p className="text-[10px] text-emerald-700">Reemb. {s.out.refund.toLocaleString()}</p>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-2 pt-1">
        <button onClick={onDone} className="h-9 px-3 rounded-md border border-slate-200 text-slate-600 text-xs hover:bg-slate-50">
          Cancelar
        </button>
        <button
          onClick={() => mut.mutate()}
          disabled={!valid || mut.isPending}
          className="h-9 px-4 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" /> {mut.isPending ? 'Guardando…' : policy ? 'Guardar cambios' : 'Crear política'}
        </button>
      </div>
    </div>
  )
}
