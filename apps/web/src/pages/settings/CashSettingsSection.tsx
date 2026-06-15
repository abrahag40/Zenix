import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '@/api/client'

interface CashSettings {
  cashShiftRequired: boolean
  cashBlindCount: boolean
  cashVarianceThreshold: number | string
  cashShiftAutoCloseHours: number
  cashBankModel: string
}

const BANK_MODELS = [
  { value: 'SHARED', label: 'Gaveta compartida (se traspasa entre cajeros)' },
  { value: 'PERSONAL_IMPREST', label: 'Banco personal por cajero (imprest)' },
  { value: 'CARRIED_BALANCE', label: 'Saldo encadenado turno a turno' },
]

/**
 * Ajustes de Caja (Sprint CASH-DRAWER-REPORTS S5b). Lee/escribe los campos cash*
 * de PropertySettings vía GET/PATCH /settings. SUPERVISOR edita.
 */
export function CashSettingsSection({ isSupervisor }: { isSupervisor: boolean }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<CashSettings>({
    queryKey: ['settings', 'cash'],
    queryFn: () => api.get('/settings'),
  })

  const [form, setForm] = useState<CashSettings | null>(null)
  useEffect(() => {
    if (data) {
      setForm({
        cashShiftRequired: !!data.cashShiftRequired,
        cashBlindCount: data.cashBlindCount ?? true,
        cashVarianceThreshold: Number(data.cashVarianceThreshold ?? 50),
        cashShiftAutoCloseHours: data.cashShiftAutoCloseHours ?? 24,
        cashBankModel: data.cashBankModel ?? 'SHARED',
      })
    }
  }, [data])

  const mut = useMutation({
    mutationFn: (body: Partial<CashSettings>) => api.patch('/settings', body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Ajustes de caja guardados')
    },
    onError: () => toast.error('No se pudieron guardar los ajustes'),
  })

  if (isLoading || !form) return <p className="text-sm text-slate-400">Cargando…</p>

  const set = <K extends keyof CashSettings>(k: K, v: CashSettings[K]) => setForm({ ...form, [k]: v })
  const save = () =>
    mut.mutate({
      cashShiftRequired: form.cashShiftRequired,
      cashBlindCount: form.cashBlindCount,
      cashVarianceThreshold: Number(form.cashVarianceThreshold),
      cashShiftAutoCloseHours: Number(form.cashShiftAutoCloseHours),
      cashBankModel: form.cashBankModel,
    })

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-800">Caja / Arqueo</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Controla cómo recepción maneja el efectivo por turno y cómo se cuadra al cierre.
        </p>
      </div>

      <Toggle
        label="Exigir turno de caja para cobrar efectivo"
        hint="Si está activo, no se puede registrar un pago en efectivo sin un turno abierto. Actívalo cuando tu staff esté entrenado."
        checked={form.cashShiftRequired}
        disabled={!isSupervisor}
        onChange={(v) => set('cashShiftRequired', v)}
      />
      <Toggle
        label="Conteo a ciegas al cerrar"
        hint="El cajero cuenta sin ver el esperado (control anti-fraude). El sobrante/faltante lo revisa el supervisor."
        checked={form.cashBlindCount}
        disabled={!isSupervisor}
        onChange={(v) => set('cashBlindCount', v)}
      />

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Umbral de diferencia (moneda base)" hint="Diferencia que exige razón + conciliación del supervisor.">
          <input
            type="number"
            min={0}
            step="1"
            value={form.cashVarianceThreshold}
            disabled={!isSupervisor}
            onChange={(e) => set('cashVarianceThreshold', e.target.value)}
            className="w-full h-9 rounded-md border border-slate-200 px-3 text-sm tabular-nums disabled:bg-slate-50"
          />
        </Field>
        <Field label="Alerta de turno abierto (horas)" hint="Avisa al supervisor si un turno queda abierto demasiado tiempo.">
          <input
            type="number"
            min={1}
            max={72}
            value={form.cashShiftAutoCloseHours}
            disabled={!isSupervisor}
            onChange={(e) => set('cashShiftAutoCloseHours', Number(e.target.value))}
            className="w-full h-9 rounded-md border border-slate-200 px-3 text-sm tabular-nums disabled:bg-slate-50"
          />
        </Field>
      </div>

      <Field label="Modelo de manejo de caja" hint="Cómo se traspasa la caja entre turnos.">
        <select
          value={form.cashBankModel}
          disabled={!isSupervisor}
          onChange={(e) => set('cashBankModel', e.target.value)}
          className="w-full h-9 rounded-md border border-slate-200 px-3 text-sm disabled:bg-slate-50"
        >
          {BANK_MODELS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </Field>

      {isSupervisor ? (
        <button
          type="button"
          onClick={save}
          disabled={mut.isPending}
          className="h-9 px-4 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-60"
        >
          {mut.isPending ? 'Guardando…' : 'Guardar ajustes'}
        </button>
      ) : (
        <p className="text-xs text-slate-400">Solo un supervisor puede editar estos ajustes.</p>
      )}
    </div>
  )
}

function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-70' : 'cursor-pointer'}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" />
      <span>
        <span className="text-sm font-medium text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500 mt-0.5">{hint}</span>
      </span>
    </label>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      {children}
      {hint ? <p className="text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  )
}
