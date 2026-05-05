/**
 * HousekeepingScheduleSection — SettingsPage sub-page for the housekeeping
 * scheduling foundation built in Sprint 8H.
 *
 * Three sub-tabs (URL-state via useSearchParams → /settings/scheduling?subtab=coverage):
 *
 *   1. Horarios   — StaffShift CRUD + StaffShiftException management
 *   2. Cobertura  — StaffCoverage matrix (room × staff, primary + backups)
 *   3. Reglas     — PropertySettings rules (carryover, roster hour, toggles)
 *
 * Design decisions:
 *  - Sub-tab state uses URL searchParam (`subtab`) so reloads and shared links
 *    preserve the active tab — Nielsen H6 "recognition over recall".
 *  - All three views are SUPERVISOR-only (the parent SettingsPage gates write
 *    actions; here we additionally hide the whole section to avoid leaking
 *    schedule data to non-supervisors).
 *  - We re-use the SettingsPage's `btn-primary` / `input` / `form-label`
 *    classes for visual consistency with the rest of the page.
 */
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store/auth'
import { api } from '../../api/client'
import { schedulingApi, type CreateShiftInput } from '../../api/scheduling.api'
import {
  CarryoverPolicy,
  Department,
  HousekeepingRole,
  ShiftExceptionType,
  type PropertySettingsDto,
  type RoomDto,
  type StaffCoverageDto,
  type StaffDto,
  type StaffShiftDto,
  type StaffShiftExceptionDto,
} from '@zenix/shared'

type SubTab = 'shifts' | 'coverage' | 'rules'

const SUBTABS: { key: SubTab; label: string; hint: string }[] = [
  { key: 'shifts',   label: 'Horarios',  hint: 'Turnos semanales y excepciones' },
  { key: 'coverage', label: 'Cobertura', hint: 'Quién cubre qué habitación' },
  { key: 'rules',    label: 'Reglas',    hint: 'Carryover, hora del roster, auto-asignación' },
]

const DEPT_LABEL: Partial<Record<Department, string>> = {
  [Department.MAINTENANCE]: 'Mantenimiento',
  [Department.LAUNDRY]:     'Lavandería',
  [Department.PUBLIC_AREAS]: 'Áreas Comunes',
  [Department.GARDENING]:   'Jardinería',
}

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export function HousekeepingScheduleSection() {
  const user = useAuthStore((s) => s.user)
  const isSupervisor = user?.role === HousekeepingRole.SUPERVISOR
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (searchParams.get('subtab') as SubTab | null) ?? 'shifts'
  const setTab = (key: SubTab) => setSearchParams({ subtab: key }, { replace: true })

  if (!isSupervisor) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm">
        Esta sección está disponible solo para supervisores.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex border-b border-gray-200 gap-0">
        {SUBTABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            title={t.hint}
            className={`px-3 py-2 text-sm border-b-2 transition-colors ${
              tab === t.key
                ? 'border-indigo-600 text-indigo-700 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'shifts'   && <ShiftsPanel />}
      {tab === 'coverage' && <CoveragePanel />}
      {tab === 'rules'    && <RulesPanel />}
    </div>
  )
}

// ─── Horarios (Shifts + Exceptions) ──────────────────────────────────────────

function ShiftsPanel() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [showAbsence, setShowAbsence] = useState(false)

  const shiftsQ = useQuery<StaffShiftDto[]>({
    queryKey: ['scheduling', 'shifts'],
    queryFn: () => schedulingApi.listShifts(),
  })

  const staffQ = useQuery<StaffDto[]>({
    queryKey: ['staff'],
    queryFn: () => api.get('/staff'),
  })

  // Show all HOUSEKEEPER-role staff regardless of department (incl. maintenance techs)
  const housekeepers = useMemo(
    () => (staffQ.data ?? []).filter((s) => s.role === HousekeepingRole.HOUSEKEEPER),
    [staffQ.data],
  )

  const hkCount = housekeepers.filter(
    (s) => !s.department || s.department === Department.HOUSEKEEPING,
  ).length
  const otherCount = housekeepers.length - hkCount

  // ── Group shifts by staff for the table ────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, StaffShiftDto[]>()
    for (const sh of shiftsQ.data ?? []) {
      const arr = map.get(sh.staffId) ?? []
      arr.push(sh)
      map.set(sh.staffId, arr)
    }
    // Sort each staff's shifts Sun→Sat
    for (const arr of map.values()) {
      arr.sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    }
    return map
  }, [shiftsQ.data])

  const deleteMut = useMutation({
    mutationFn: (id: string) => schedulingApi.deleteShift(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scheduling', 'shifts'] })
      toast.success('Turno eliminado')
    },
    onError: () => toast.error('No se pudo eliminar el turno'),
  })

  if (shiftsQ.isLoading || staffQ.isLoading) {
    return <div className="text-sm text-gray-400 py-8 text-center">Cargando...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">
            {(shiftsQ.data ?? []).length} turnos configurados ·{' '}
            {hkCount} recamarista{hkCount !== 1 ? 's' : ''}
            {otherCount > 0 && ` · ${otherCount} otros dept.`}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Los turnos definen cuándo cada persona está disponible para auto-asignación.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAbsence(true)}
            className="text-xs text-amber-700 border border-amber-300 hover:bg-amber-50 rounded-lg px-3 py-1.5"
          >
            ⚠ Marcar ausencia
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            + Agregar Turno
          </button>
        </div>
      </div>

      {showAdd && (
        <AddShiftForm
          staff={housekeepers}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false)
            qc.invalidateQueries({ queryKey: ['scheduling', 'shifts'] })
          }}
        />
      )}

      {showAbsence && (
        <MarkAbsenceForm
          staff={housekeepers}
          onClose={() => setShowAbsence(false)}
          onSaved={() => {
            setShowAbsence(false)
            qc.invalidateQueries({ queryKey: ['scheduling', 'shifts'] })
            qc.invalidateQueries({ queryKey: ['scheduling', 'exceptions'] })
          }}
        />
      )}

      {/* Staff schedule table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {housekeepers.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            No hay housekeepers registrados. Agrega personal en la pestaña "Personal" primero.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">
                  Housekeeper
                </th>
                {DAY_LABELS.map((d) => (
                  <th
                    key={d}
                    className="text-center px-2 py-2 text-xs font-medium text-gray-500 uppercase w-20"
                  >
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {housekeepers.map((s) => {
                const shifts = grouped.get(s.id) ?? []
                const byDay = new Map<number, StaffShiftDto>()
                for (const sh of shifts) byDay.set(sh.dayOfWeek, sh)
                return (
                  <tr key={s.id} className={s.active ? '' : 'opacity-50'}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">{s.name}</p>
                        {s.department && s.department !== Department.HOUSEKEEPING && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            {DEPT_LABEL[s.department] ?? s.department}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">
                        {shifts.length === 0
                          ? 'Sin turnos'
                          : `${shifts.length} día${shifts.length === 1 ? '' : 's'}`}
                      </p>
                    </td>
                    {DAY_LABELS.map((_, dow) => {
                      const sh = byDay.get(dow)
                      return (
                        <td key={dow} className="px-2 py-2 text-center">
                          {sh ? (
                            <button
                              onClick={() => {
                                if (
                                  confirm(
                                    `¿Eliminar turno ${DAY_LABELS[dow]} ${sh.startTime}–${sh.endTime}?`,
                                  )
                                ) {
                                  deleteMut.mutate(sh.id)
                                }
                              }}
                              className="inline-flex flex-col items-center text-xs text-emerald-700 hover:text-red-600 leading-tight group"
                            >
                              <span className="font-medium">{sh.startTime}</span>
                              <span className="text-gray-400 group-hover:text-red-400">
                                {sh.endTime}
                              </span>
                            </button>
                          ) : (
                            <span className="text-gray-200 text-xs">·</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <ExceptionsList />
    </div>
  )
}

function AddShiftForm({
  staff,
  onClose,
  onSaved,
}: {
  staff: StaffDto[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<CreateShiftInput>({
    staffId: staff[0]?.id ?? '',
    dayOfWeek: 1,    // default Monday
    startTime: '08:00',
    endTime: '14:00',
  })

  const mutation = useMutation({
    mutationFn: (dto: CreateShiftInput) => schedulingApi.createShift(dto),
    onSuccess: () => {
      toast.success('Turno creado')
      onSaved()
    },
    onError: (e: Error) =>
      toast.error(e.message || 'Error al crear turno (¿conflicto con otro turno?)'),
  })

  return (
    <div className="bg-white border border-indigo-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-900">Nuevo turno semanal</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">
          ×
        </button>
      </div>
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!form.staffId) return
          if (form.startTime >= form.endTime) {
            toast.error('La hora de inicio debe ser menor a la hora de fin')
            return
          }
          mutation.mutate(form)
        }}
      >
        <div className="col-span-2 sm:col-span-1">
          <label className="form-label">Housekeeper *</label>
          <select
            value={form.staffId}
            onChange={(e) => setForm({ ...form, staffId: e.target.value })}
            className="input"
            required
          >
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="form-label">Día *</label>
          <select
            value={form.dayOfWeek}
            onChange={(e) => setForm({ ...form, dayOfWeek: parseInt(e.target.value) })}
            className="input"
          >
            {DAY_LABELS.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">Hora inicio *</label>
          <input
            type="time"
            required
            value={form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label className="form-label">Hora fin *</label>
          <input
            type="time"
            required
            value={form.endTime}
            onChange={(e) => setForm({ ...form, endTime: e.target.value })}
            className="input"
          />
        </div>
        <div className="col-span-2 flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? 'Creando...' : 'Crear Turno'}
          </button>
        </div>
      </form>
    </div>
  )
}

function MarkAbsenceForm({
  staff,
  onClose,
  onSaved,
}: {
  staff: StaffDto[]
  onClose: () => void
  onSaved: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [staffId, setStaffId] = useState(staff[0]?.id ?? '')
  const [date, setDate] = useState(today)
  const [reason, setReason] = useState('')

  const mutation = useMutation({
    mutationFn: () => schedulingApi.markAbsence({ staffId, date, reason: reason || undefined }),
    onSuccess: () => {
      toast.success('Ausencia registrada — tareas reasignándose')
      onSaved()
    },
    onError: (e: Error) => toast.error(e.message || 'Error al marcar ausencia'),
  })

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-amber-900">⚠ Marcar ausencia</p>
        <button
          onClick={onClose}
          className="text-amber-500 hover:text-amber-700 text-lg leading-none"
        >
          ×
        </button>
      </div>
      <p className="text-xs text-amber-800 mb-3">
        Crea una excepción de tipo OFF y reasigna las tareas pendientes/READY del día a
        backups o round-robin. Tareas IN_PROGRESS no se cancelan (D11).
      </p>
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!staffId) return
          mutation.mutate()
        }}
      >
        <div>
          <label className="form-label">Housekeeper *</label>
          <select
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            className="input"
            required
          >
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">Fecha *</label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
          />
        </div>
        <div className="col-span-2">
          <label className="form-label">Razón (opcional)</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: enfermedad, cita médica…"
            className="input"
            maxLength={120}
          />
        </div>
        <div className="col-span-2 flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="btn-primary !bg-amber-600 hover:!bg-amber-700"
          >
            {mutation.isPending ? 'Guardando...' : 'Marcar ausencia'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ExceptionsList() {
  const qc = useQueryClient()

  // Show next 14 days of exceptions
  const range = useMemo(() => {
    const today = new Date()
    const to = new Date(today)
    to.setDate(today.getDate() + 14)
    return {
      from: today.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    }
  }, [])

  const exceptionsQ = useQuery<StaffShiftExceptionDto[]>({
    queryKey: ['scheduling', 'exceptions', range.from, range.to],
    queryFn: () => schedulingApi.listExceptions(range.from, range.to),
  })

  const staffQ = useQuery<StaffDto[]>({
    queryKey: ['staff'],
    queryFn: () => api.get('/staff'),
  })
  const staffById = useMemo(() => {
    const m = new Map<string, StaffDto>()
    for (const s of staffQ.data ?? []) m.set(s.id, s)
    return m
  }, [staffQ.data])

  const deleteMut = useMutation({
    mutationFn: (id: string) => schedulingApi.deleteException(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scheduling', 'exceptions'] })
      toast.success('Excepción eliminada')
    },
    onError: () => toast.error('No se pudo eliminar la excepción'),
  })

  const list = exceptionsQ.data ?? []

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-900">Excepciones próximas (14 días)</p>
        <p className="text-xs text-gray-400">
          Ausencias, turnos extra y modificaciones puntuales. Tienen precedencia sobre el horario semanal.
        </p>
      </div>
      {exceptionsQ.isLoading ? (
        <div className="px-4 py-6 text-sm text-gray-400 text-center">Cargando...</div>
      ) : list.length === 0 ? (
        <div className="px-4 py-6 text-sm text-gray-400 text-center">
          Sin excepciones programadas.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">
                Fecha
              </th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">
                Housekeeper
              </th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">
                Tipo
              </th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">
                Horario / razón
              </th>
              <th className="px-4 py-2 w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {list
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((ex) => (
                <tr key={ex.id}>
                  <td className="px-4 py-2 text-gray-700">{ex.date.slice(0, 10)}</td>
                  <td className="px-4 py-2 font-medium text-gray-900">
                    {staffById.get(ex.staffId)?.name ?? '—'}
                  </td>
                  <td className="px-4 py-2">
                    <ExceptionTypeBadge type={ex.type} />
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs hidden sm:table-cell">
                    {ex.startTime && ex.endTime
                      ? `${ex.startTime} – ${ex.endTime}`
                      : ex.reason || '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => {
                        if (confirm('¿Eliminar excepción?')) deleteMut.mutate(ex.id)
                      }}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function ExceptionTypeBadge({ type }: { type: ShiftExceptionType }) {
  const config: Record<ShiftExceptionType, { label: string; cls: string }> = {
    [ShiftExceptionType.OFF]:      { label: 'Ausencia',  cls: 'bg-amber-50 text-amber-700' },
    [ShiftExceptionType.EXTRA]:    { label: 'Turno extra', cls: 'bg-emerald-50 text-emerald-700' },
    [ShiftExceptionType.MODIFIED]: { label: 'Modificado', cls: 'bg-blue-50 text-blue-700' },
  }
  const c = config[type]
  return <span className={`text-xs px-2 py-0.5 rounded-full ${c.cls}`}>{c.label}</span>
}

// ─── Cobertura (Coverage) ────────────────────────────────────────────────────

/**
 * Coverage matrix — rooms × staff cells.
 * - Click empty cell → adds backup coverage
 * - Click ★ cell    → demotes to backup (clears primary)
 * - Click ○ cell    → promotes to primary (replaces existing primary for that room)
 * - Click × icon    → removes coverage entirely
 *
 * Visual semantics:
 *   ★ emerald  = PRIMARY  (one per room)
 *   ○ slate    = BACKUP   (any number)
 *   blank      = no coverage
 */
function CoveragePanel() {
  const qc = useQueryClient()

  const coverageQ = useQuery<StaffCoverageDto[]>({
    queryKey: ['scheduling', 'coverage'],
    queryFn: () => schedulingApi.listCoverage(),
  })
  const roomsQ = useQuery<RoomDto[]>({
    queryKey: ['rooms-settings'],
    queryFn: () => api.get('/rooms'),
  })
  const staffQ = useQuery<StaffDto[]>({
    queryKey: ['staff'],
    queryFn: () => api.get('/staff'),
  })

  const housekeepers = useMemo(
    () => (staffQ.data ?? []).filter((s) => s.role === HousekeepingRole.HOUSEKEEPER && s.active),
    [staffQ.data],
  )

  const rooms = useMemo(
    () =>
      [...(roomsQ.data ?? [])].sort((a, b) =>
        a.number.localeCompare(b.number, undefined, { numeric: true }),
      ),
    [roomsQ.data],
  )

  // Map: roomId → staffId → coverage
  const matrix = useMemo(() => {
    const m = new Map<string, Map<string, StaffCoverageDto>>()
    for (const c of coverageQ.data ?? []) {
      let inner = m.get(c.roomId)
      if (!inner) {
        inner = new Map()
        m.set(c.roomId, inner)
      }
      inner.set(c.staffId, c)
    }
    return m
  }, [coverageQ.data])

  const createMut = useMutation({
    mutationFn: (dto: { staffId: string; roomId: string; isPrimary?: boolean }) =>
      schedulingApi.createCoverage(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scheduling', 'coverage'] })
    },
    onError: (e: Error) => toast.error(e.message || 'Error guardando cobertura'),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, isPrimary }: { id: string; isPrimary: boolean }) =>
      schedulingApi.updateCoverage(id, { isPrimary }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scheduling', 'coverage'] })
    },
    onError: (e: Error) => toast.error(e.message || 'Error actualizando'),
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => schedulingApi.deleteCoverage(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scheduling', 'coverage'] })
    },
    onError: (e: Error) => toast.error(e.message || 'Error eliminando'),
  })

  function handleCellClick(roomId: string, staffId: string) {
    const existing = matrix.get(roomId)?.get(staffId)
    if (!existing) {
      createMut.mutate({ roomId, staffId, isPrimary: false })
      return
    }
    if (existing.isPrimary) {
      // Demote primary → backup
      updateMut.mutate({ id: existing.id, isPrimary: false })
      return
    }
    // Promote backup → primary (server enforces single primary per room)
    updateMut.mutate({ id: existing.id, isPrimary: true })
  }

  function handleCellRemove(e: React.MouseEvent, coverageId: string) {
    e.stopPropagation()
    deleteMut.mutate(coverageId)
  }

  if (coverageQ.isLoading || roomsQ.isLoading || staffQ.isLoading) {
    return <div className="text-sm text-gray-400 py-8 text-center">Cargando...</div>
  }

  if (rooms.length === 0 || housekeepers.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm">
        Necesitas tener habitaciones y housekeepers registrados antes de configurar cobertura.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">
            {(coverageQ.data ?? []).length} asignaciones · {rooms.length} habitaciones ·{' '}
            {housekeepers.length} housekeepers
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Click en una celda para alternar entre vacío → backup ○ → primary ★. Hover sobre ★/○ para eliminar.
          </p>
        </div>
        <Legend />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50 z-10 min-w-[140px]">
                Habitación
              </th>
              {housekeepers.map((s) => (
                <th
                  key={s.id}
                  className="text-center px-2 py-2 text-xs font-medium text-gray-500 min-w-[88px]"
                >
                  <div className="truncate" title={s.name}>
                    {s.name.split(' ')[0]}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rooms.map((room) => {
              const inner = matrix.get(room.id)
              return (
                <tr key={room.id}>
                  <td className="px-4 py-2 sticky left-0 bg-white z-10">
                    <p className="text-sm font-medium text-gray-900">Hab. {room.number}</p>
                    {room.floor != null && (
                      <p className="text-xs text-gray-400">Piso {room.floor}</p>
                    )}
                  </td>
                  {housekeepers.map((s) => {
                    const cov = inner?.get(s.id) ?? null
                    return (
                      <td key={s.id} className="px-2 py-1 text-center">
                        <CoverageCell
                          coverage={cov}
                          onClick={() => handleCellClick(room.id, s.id)}
                          onRemove={(e) => cov && handleCellRemove(e, cov.id)}
                          disabled={createMut.isPending || updateMut.isPending}
                        />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CoverageCell({
  coverage,
  onClick,
  onRemove,
  disabled,
}: {
  coverage: StaffCoverageDto | null
  onClick: () => void
  onRemove: (e: React.MouseEvent) => void
  disabled: boolean
}) {
  if (!coverage) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="w-9 h-9 rounded-md border border-dashed border-gray-200 text-gray-300 text-sm hover:border-emerald-400 hover:text-emerald-500 transition-colors"
        aria-label="Asignar cobertura"
      >
        +
      </button>
    )
  }
  const isPrimary = coverage.isPrimary
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group relative w-9 h-9 rounded-md text-sm font-semibold transition-colors ${
        isPrimary
          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
      title={isPrimary ? 'Primary — click para degradar a backup' : 'Backup — click para promover a primary'}
    >
      {isPrimary ? '★' : '○'}
      <span
        onClick={onRemove}
        className="absolute -top-1 -right-1 hidden group-hover:flex items-center justify-center w-4 h-4 bg-red-500 text-white text-[10px] rounded-full shadow"
      >
        ×
      </span>
    </button>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
      <span className="inline-flex items-center gap-1">
        <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center font-semibold">
          ★
        </span>
        Primary
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center font-semibold">
          ○
        </span>
        Backup
      </span>
    </div>
  )
}

// ─── Reglas (PropertySettings rules) ─────────────────────────────────────────

const CARRYOVER_OPTIONS: Array<{ value: CarryoverPolicy; label: string; hint: string }> = [
  {
    value: CarryoverPolicy.REASSIGN_TO_TODAY_SHIFT,
    label: 'Reasignar al turno de hoy',
    hint: 'Si el housekeeper original no está hoy, la tarea va al backup o round-robin (recomendado).',
  },
  {
    value: CarryoverPolicy.KEEP_ORIGINAL_ASSIGNEE,
    label: 'Mantener al housekeeper original',
    hint: 'La tarea sigue asignada al mismo housekeeper aunque hoy no tenga turno.',
  },
  {
    value: CarryoverPolicy.ALWAYS_UNASSIGNED,
    label: 'Dejar sin asignar',
    hint: 'Las tareas de carryover esperan asignación manual del supervisor.',
  },
]

function RulesPanel() {
  const qc = useQueryClient()

  const settingsQ = useQuery<PropertySettingsDto>({
    queryKey: ['property-settings'],
    queryFn: () => api.get('/settings'),
  })

  const [form, setForm] = useState({
    morningRosterHour:     7,
    carryoverPolicy:       CarryoverPolicy.REASSIGN_TO_TODAY_SHIFT,
    autoAssignmentEnabled: true,
    shiftClockingRequired: false,
  })

  // Hydrate from server when data lands. We track a tiny pristine flag so a
  // user mid-edit isn't clobbered by a refetch.
  const [pristine, setPristine] = useState(true)
  if (pristine && settingsQ.data) {
    setForm({
      morningRosterHour:     settingsQ.data.morningRosterHour ?? 7,
      carryoverPolicy:       settingsQ.data.carryoverPolicy ?? CarryoverPolicy.REASSIGN_TO_TODAY_SHIFT,
      autoAssignmentEnabled: settingsQ.data.autoAssignmentEnabled ?? true,
      shiftClockingRequired: settingsQ.data.shiftClockingRequired ?? false,
    })
    setPristine(false)
  }

  const saveMut = useMutation({
    mutationFn: (body: typeof form) => api.patch<PropertySettingsDto>('/settings', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['property-settings'] })
      toast.success('Reglas guardadas')
    },
    onError: () => toast.error('Error al guardar'),
  })

  const runRosterMut = useMutation({
    mutationFn: () => schedulingApi.runRoster(),
    onSuccess: (data) => {
      toast.success(
        `Roster ejecutado — ${data.created} creadas, ${data.carryover} carryover, ${data.assigned} asignadas`,
      )
      qc.invalidateQueries({ queryKey: ['daily-grid'] })
    },
    onError: (e: Error) => toast.error(e.message || 'Error al ejecutar roster'),
  })

  if (settingsQ.isLoading) {
    return <div className="text-sm text-gray-400 py-8 text-center">Cargando...</div>
  }

  return (
    <div className="max-w-2xl space-y-5">
      {/* Morning roster */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Roster matutino</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Cron multi-timezone que genera el roster del día (carryover + predicción de checkouts +
            auto-asignación). Idempotente — corre cada 15 min y sólo procesa una vez por día local.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Hora local del roster</label>
            <select
              value={form.morningRosterHour}
              onChange={(e) =>
                setForm({ ...form, morningRosterHour: parseInt(e.target.value) })
              }
              className="input"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {h.toString().padStart(2, '0')}:00
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Hostels vacacionales: 6 AM · Boutique: 8 AM · Default: 7 AM.
            </p>
          </div>
          <div className="flex items-end justify-end">
            <button
              onClick={() => runRosterMut.mutate()}
              disabled={runRosterMut.isPending}
              className="btn-ghost text-xs"
              title="Ejecuta el roster ahora — útil para testing o disaster recovery"
            >
              {runRosterMut.isPending ? 'Ejecutando...' : '↻ Ejecutar roster ahora'}
            </button>
          </div>
        </div>
      </div>

      {/* Carryover policy */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Política de carryover</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Qué hacer con las tareas que quedaron sin terminar al final del día anterior. Marcadas con
            prioridad URGENT y badge "De ayer" en mobile.
          </p>
        </div>
        <div className="space-y-2">
          {CARRYOVER_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`block rounded-lg border p-3 cursor-pointer transition-colors ${
                form.carryoverPolicy === opt.value
                  ? 'border-indigo-400 bg-indigo-50/50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <input
                  type="radio"
                  checked={form.carryoverPolicy === opt.value}
                  onChange={() => setForm({ ...form, carryoverPolicy: opt.value })}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.hint}</p>
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-1">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Reglas operativas</h3>

        <ToggleRow
          label="Auto-asignación habilitada"
          hint="Si está apagada, todas las tareas nacen UNASSIGNED y requieren asignación manual del supervisor."
          checked={form.autoAssignmentEnabled}
          onChange={(v) => setForm({ ...form, autoAssignmentEnabled: v })}
        />

        <ToggleRow
          label="Clock-in obligatorio en mobile"
          hint="Si está activado, mobile pide marcar entrada al abrir y bloquea acciones hasta hacerlo. Útil para auditoría USALI."
          checked={form.shiftClockingRequired}
          onChange={(v) => setForm({ ...form, shiftClockingRequired: v })}
        />
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => saveMut.mutate(form)}
          disabled={saveMut.isPending}
          className="btn-primary disabled:opacity-50"
        >
          {saveMut.isPending ? 'Guardando...' : 'Guardar reglas'}
        </button>
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-100 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{hint}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
          checked ? 'bg-emerald-500' : 'bg-gray-300'
        }`}
        aria-pressed={checked}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
            checked ? 'translate-x-4.5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}
