import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Mail, Plus, Send, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { scheduledReportsApi, type CreateScheduledReportInput, type ScheduledReport } from './scheduled-reports.api'

const REPORT_OPTIONS = [
  { key: 'metrics', label: 'Métricas diarias' },
  { key: 'no-shows', label: 'No-shows' },
  { key: 'stays', label: 'Estadías extendidas' },
  { key: 'overstayed', label: 'Saldos vencidos' },
] as const

const FREQ_LABEL: Record<string, string> = { DAILY: 'Diario', WEEKLY: 'Semanal', MONTHLY: 'Mensual' }
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const STATUS_LABEL: Record<string, string> = {
  sent: 'Enviado', 'no-key': 'Pendiente (sin email config)', 'api-error': 'Error de envío',
  network: 'Error de red', error: 'Error', 'no-data': 'Sin datos', 'no-recipients': 'Sin destinatarios',
}

function reportLabel(key: string) {
  return REPORT_OPTIONS.find((r) => r.key === key)?.label ?? key
}

/** Reportes programados por email (P4a, Estándar de Reportes §2 DESEA). */
export function ScheduledReportsPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const { data, isLoading } = useQuery({ queryKey: ['scheduled-reports'], queryFn: scheduledReportsApi.list })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['scheduled-reports'] })
  const removeM = useMutation({
    mutationFn: scheduledReportsApi.remove,
    onSuccess: () => { invalidate(); toast.success('Envío programado eliminado') },
  })
  const toggleM = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => scheduledReportsApi.update(id, { active }),
    onSuccess: invalidate,
  })
  const runM = useMutation({
    mutationFn: scheduledReportsApi.runNow,
    onSuccess: (r) => {
      if (r.sent) toast.success(`Reporte enviado (${r.rowCount} registros)`)
      else if (r.reason === 'no-key') toast(`Reporte generado (${r.rowCount} registros) — el envío real requiere configurar Resend (RESEND_API_KEY)`, { icon: '📄', duration: 6000 })
      else toast.error(`No se pudo enviar: ${r.reason}`)
    },
    onError: () => toast.error('No se pudo generar el reporte'),
  })

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <Link to="/reports" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
        <ChevronLeft className="h-3.5 w-3.5" /> Reportes
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Mail className="h-4 w-4 text-emerald-600" /> Reportes programados</h3>
            <p className="text-xs text-slate-500 mt-0.5">Recibe tus reportes por email automáticamente (diario, semanal o mensual), adjuntos en Excel/CSV. Sin entrar a buscarlos.</p>
          </div>
          <button onClick={() => setShowForm((s) => !s)} className="h-8 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-3 text-xs font-medium shrink-0">
            <Plus className="h-3.5 w-3.5" /> Nuevo
          </button>
        </div>

        {showForm ? <CreateForm onDone={() => { setShowForm(false); invalidate() }} /> : null}

        <div className="divide-y divide-slate-50">
          {isLoading ? (
            <div className="py-8 text-center text-slate-400 text-sm">Cargando…</div>
          ) : (data?.length ?? 0) === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">
              Sin envíos programados. Crea uno con “Nuevo” para recibir un reporte por email automáticamente.
            </div>
          ) : (
            data!.map((r: ScheduledReport) => (
              <div key={r.id} className="p-4 flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{reportLabel(r.reportKey)}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{FREQ_LABEL[r.frequency]}</span>
                    {!r.active ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">Pausado</span> : null}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {scheduleLabel(r)} · a las {String(r.sendHour).padStart(2, '0')}:00 · {r.recipients.join(', ')} · {r.format.toUpperCase()}
                  </div>
                  {r.lastRunStatus ? (
                    <div className="text-[11px] text-slate-400 mt-0.5">Último: {STATUS_LABEL[r.lastRunStatus] ?? r.lastRunStatus}{r.lastRunDate ? ` · ${r.lastRunDate}` : ''}</div>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => runM.mutate(r.id)} disabled={runM.isPending} className="h-8 inline-flex items-center gap-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 px-2.5 text-xs font-medium disabled:opacity-50" title="Enviar ahora">
                    <Send className="h-3.5 w-3.5" /> Enviar ahora
                  </button>
                  <label className="inline-flex items-center cursor-pointer" title={r.active ? 'Pausar' : 'Activar'}>
                    <input type="checkbox" checked={r.active} onChange={(e) => toggleM.mutate({ id: r.id, active: e.target.checked })} className="sr-only peer" />
                    <span className="w-9 h-5 bg-slate-200 peer-checked:bg-emerald-500 rounded-full relative transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:h-4 after:w-4 after:rounded-full after:transition-transform peer-checked:after:translate-x-4" />
                  </label>
                  <button onClick={() => removeM.mutate(r.id)} className="h-8 w-8 grid place-items-center rounded-md border border-slate-200 text-rose-500 hover:bg-rose-50" title="Eliminar">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function scheduleLabel(r: ScheduledReport): string {
  const window = r.rangeDays === 1 ? 'último día' : `últimos ${r.rangeDays} días`
  if (r.frequency === 'WEEKLY') return `Cada ${WEEKDAYS[(r.weekday ?? 1) - 1]} · ${window}`
  if (r.frequency === 'MONTHLY') return `Día ${r.monthday ?? 1} de cada mes · ${window}`
  return `Cada día · ${window}`
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState<CreateScheduledReportInput>({
    reportKey: 'metrics', frequency: 'DAILY', sendHour: 7, rangeDays: 1, recipients: [], format: 'xlsx',
  })
  const [recipientsRaw, setRecipientsRaw] = useState('')

  const createM = useMutation({
    mutationFn: scheduledReportsApi.create,
    onSuccess: () => { toast.success('Envío programado creado'); onDone() },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'No se pudo crear'),
  })

  const recipients = recipientsRaw.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean)
  const valid = recipients.length > 0 && recipients.every((r) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r))

  return (
    <div className="p-4 border-b border-slate-100 bg-slate-50/60 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-xs text-slate-500 flex flex-col gap-1">
          Reporte
          <select value={form.reportKey} onChange={(e) => setForm({ ...form, reportKey: e.target.value })} className="h-8 rounded-md border border-slate-200 px-2 text-xs">
            {REPORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500 flex flex-col gap-1">
          Frecuencia
          <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as CreateScheduledReportInput['frequency'] })} className="h-8 rounded-md border border-slate-200 px-2 text-xs">
            <option value="DAILY">Diario</option>
            <option value="WEEKLY">Semanal</option>
            <option value="MONTHLY">Mensual</option>
          </select>
        </label>
        {form.frequency === 'WEEKLY' ? (
          <label className="text-xs text-slate-500 flex flex-col gap-1">
            Día de la semana
            <select value={form.weekday ?? 1} onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })} className="h-8 rounded-md border border-slate-200 px-2 text-xs">
              {WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
            </select>
          </label>
        ) : null}
        {form.frequency === 'MONTHLY' ? (
          <label className="text-xs text-slate-500 flex flex-col gap-1">
            Día del mes (1-28)
            <input type="number" min={1} max={28} value={form.monthday ?? 1} onChange={(e) => setForm({ ...form, monthday: Number(e.target.value) })} className="h-8 rounded-md border border-slate-200 px-2 text-xs" />
          </label>
        ) : null}
        <label className="text-xs text-slate-500 flex flex-col gap-1">
          Hora de envío (local)
          <input type="number" min={0} max={23} value={form.sendHour} onChange={(e) => setForm({ ...form, sendHour: Number(e.target.value) })} className="h-8 rounded-md border border-slate-200 px-2 text-xs" />
        </label>
        <label className="text-xs text-slate-500 flex flex-col gap-1">
          Ventana de datos (días hacia atrás)
          <input type="number" min={1} max={366} value={form.rangeDays} onChange={(e) => setForm({ ...form, rangeDays: Number(e.target.value) })} className="h-8 rounded-md border border-slate-200 px-2 text-xs" />
        </label>
        <label className="text-xs text-slate-500 flex flex-col gap-1">
          Formato
          <select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value as 'xlsx' | 'csv' })} className="h-8 rounded-md border border-slate-200 px-2 text-xs">
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV</option>
          </select>
        </label>
      </div>
      <label className="text-xs text-slate-500 flex flex-col gap-1">
        Destinatarios (emails separados por coma)
        <input value={recipientsRaw} onChange={(e) => setRecipientsRaw(e.target.value)} placeholder="contador@hotel.com, gerencia@hotel.com" className="h-8 rounded-md border border-slate-200 px-2 text-xs" />
      </label>
      <div className="flex items-center justify-end gap-2">
        <button onClick={onDone} className="h-8 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 text-xs font-medium">Cancelar</button>
        <button
          onClick={() => createM.mutate({ ...form, recipients })}
          disabled={!valid || createM.isPending}
          className="h-8 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-3 text-xs font-medium disabled:opacity-50"
        >
          {createM.isPending ? 'Creando…' : 'Crear envío'}
        </button>
      </div>
    </div>
  )
}
