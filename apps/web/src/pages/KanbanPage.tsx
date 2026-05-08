/**
 * KanbanPage — Vista del supervisor para operar housekeeping.
 *
 * Columnas (estados):
 *   UNASSIGNED → READY → IN_PROGRESS / PAUSED → DONE → VERIFIED
 *
 * Capacidades:
 *   - Cards con habitación, housekeeper, tiempo transcurrido, prioridad,
 *     badge "🔴 Hoy entra" cuando hasSameDayCheckIn=true.
 *   - Asignación inline en cards UNASSIGNED (<select> de staff).
 *   - Verificación de DONE con visor de checklist (lo que el housekeeper marcó).
 *   - Filtros por housekeeper.
 *   - Real-time: SSE invalida queries en cualquier task:* event.
 *
 * Diseño UX:
 *   - Cognitive Load (Sweller 1988): solo 5 columnas + datos esenciales por card.
 *   - Pre-attentive attention (Treisman 1980): color por prioridad + accent
 *     vertical en URGENT.
 *   - Heurística H1 Nielsen (visibility): tiempo transcurrido en cada card.
 */

import { useCallback, useMemo, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '../api/client'
import { useSSE } from '../hooks/useSSE'
import type { CleaningTaskDto, SseEvent, StaffDto, TaskLogDto } from '@zenix/shared'
import { CleaningStatus, StaffRole, Priority, TaskLogEvent } from '@zenix/shared'

/**
 * Subtítulos en cada columna (NN/g H6 "Recognition over recall"):
 * personal nuevo entiende el flujo sin entrenamiento. Patrón Linear/Trello.
 */
const COLUMNS: {
  status: CleaningStatus
  label: string
  hint: string
  ringColor: string
  pillBg: string
}[] = [
  { status: CleaningStatus.PENDING,      label: 'Esperando salida', hint: 'Huésped aún en habitación', ringColor: 'border-t-slate-400',  pillBg: 'bg-slate-100 text-slate-600' },
  { status: CleaningStatus.UNASSIGNED,   label: 'Sin asignar',      hint: 'Asigna a una recamarista', ringColor: 'border-t-red-400',     pillBg: 'bg-red-100 text-red-700' },
  { status: CleaningStatus.READY,        label: 'Lista',            hint: 'Cuarto sucio, listo para limpiar', ringColor: 'border-t-amber-400',   pillBg: 'bg-amber-100 text-amber-700' },
  { status: CleaningStatus.IN_PROGRESS,  label: 'En progreso',      hint: 'Recamarista limpiando', ringColor: 'border-t-blue-400',    pillBg: 'bg-blue-100 text-blue-700' },
  { status: CleaningStatus.DONE,         label: 'Hecha',            hint: 'Esperando verificación del supervisor', ringColor: 'border-t-emerald-400', pillBg: 'bg-emerald-100 text-emerald-700' },
  { status: CleaningStatus.VERIFIED,     label: 'Verificada',       hint: 'Aprobada — habitación disponible', ringColor: 'border-t-indigo-400',  pillBg: 'bg-indigo-100 text-indigo-700' },
]

/**
 * Priority badges — solo se muestran las EXCEPCIONES (no MEDIUM que es default).
 * Tufte 2001 *Visual Display of Quantitative Information*: "Surface the exceptional,
 * hide the default — reduce noise."
 *
 * Etiquetas en español (consistencia con el resto del sistema). MEDIUM intencional-
 * mente no aparece para no añadir badge a cada card. URGENT y LOW siempre visibles
 * (extremos críticos); HIGH visible (advertencia operativa).
 */
const PRIORITY_BADGE: Partial<Record<Priority, { label: string; className: string }>> = {
  [Priority.URGENT]: { label: '🔴 URGENTE', className: 'bg-red-100 text-red-700 font-semibold' },
  [Priority.HIGH]:   { label: 'ALTA',       className: 'bg-orange-50 text-orange-700' },
  [Priority.LOW]:    { label: 'BAJA',       className: 'bg-gray-100 text-gray-500' },
  // MEDIUM omitido a propósito — es el default. No mostrar evita ruido visual.
}

export function KanbanPage() {
  const qc = useQueryClient()
  const [filterStaffId, setFilterStaffId] = useState<string>('') // '' = todos
  const [verifying, setVerifying] = useState<string | null>(null) // taskId en modal verify
  const [rejecting, setRejecting] = useState<string | null>(null) // taskId en modal reject
  const [showAdHocModal, setShowAdHocModal] = useState(false)

  const { data: tasks = [], isLoading } = useQuery<CleaningTaskDto[]>({
    queryKey: ['kanban-tasks'],
    queryFn: () =>
      api.get('/tasks?status=PENDING,UNASSIGNED,READY,IN_PROGRESS,PAUSED,DONE,VERIFIED'),
    staleTime: 30_000,
  })

  const { data: staff = [] } = useQuery<StaffDto[]>({
    queryKey: ['kanban-staff'],
    queryFn: () => api.get('/staff'),
    staleTime: 5 * 60_000,
  })
  const housekeepers = useMemo(
    () => staff.filter((s) => s.role === StaffRole.HOUSEKEEPER && s.active),
    [staff],
  )

  const assignMutation = useMutation({
    mutationFn: (vars: { taskId: string; assignedToId: string }) =>
      api.patch(`/tasks/${vars.taskId}/assign`, { assignedToId: vars.assignedToId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kanban-tasks'] })
      toast.success('Asignación guardada')
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'No se pudo asignar'),
  })

  // ── Mutations Sprint 9 — acciones de override migradas desde /overrides ──
  // Confirma salida física: PENDING → READY (Fase 2 §4 CLAUDE.md)
  const confirmDepartMutation = useMutation({
    mutationFn: ({ checkoutId, unitId }: { checkoutId: string; unitId: string }) =>
      api.post(`/checkouts/${checkoutId}/depart`, { unitId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kanban-tasks'] })
      toast.success('Salida confirmada — limpieza activada')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo confirmar la salida'),
  })

  const forceUrgentMutation = useMutation({
    mutationFn: (taskId: string) => api.post(`/tasks/${taskId}/force-urgent`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kanban-tasks'] })
      toast.success('Tarea marcada URGENT')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo cambiar prioridad'),
  })

  const deepCleanMutation = useMutation({
    mutationFn: (taskId: string) => api.post(`/tasks/${taskId}/toggle-deep-clean`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kanban-tasks'] })
      toast.success('Limpieza profunda activada')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo activar deep clean'),
  })

  const handleSSE = useCallback(
    (event: SseEvent) => {
      if (event.type.startsWith('task:')) {
        qc.invalidateQueries({ queryKey: ['kanban-tasks'] })
      }
    },
    [qc],
  )
  useSSE(handleSSE)

  const filteredTasks = useMemo(() => {
    const base = filterStaffId ? tasks.filter((t) => t.assignedTo?.id === filterStaffId) : tasks
    // Sort prioritario consistente entre kanban (web) y mobile useTasks:
    //   1. URGENT primero (Priority enum) — captura "doble urgente" automáticamente
    //   2. hasSameDayCheckIn (checkout + checkin mismo día) — la más crítica
    //   3. taskType CLEANING (checkout regular) > STAYOVER (in-house diaria)
    //   4. createdAt ASC — FIFO en empates
    // Justificación AHLEI sec. 4.2: same-day-checkin es prioridad máxima
    // (cuarto debe estar listo antes que llegue el huésped); checkouts >
    // stayovers porque libera inventario vendible.
    return [...base].sort((a, b) => {
      // 1. Priority enum (URGENT > HIGH > MEDIUM > LOW)
      const prioRank = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as Record<string, number>
      const dPrio = (prioRank[a.priority] ?? 99) - (prioRank[b.priority] ?? 99)
      if (dPrio !== 0) return dPrio
      // 2. Same-day check-in primero
      if (a.hasSameDayCheckIn !== b.hasSameDayCheckIn) {
        return a.hasSameDayCheckIn ? -1 : 1
      }
      // 3. Tipo de tarea: CLEANING (checkout) antes que STAYOVER
      const typeRank = { CLEANING: 0, STAYOVER: 1, MAINTENANCE: 2, INSPECTION: 3 } as Record<string, number>
      const dType = (typeRank[a.taskType] ?? 99) - (typeRank[b.taskType] ?? 99)
      if (dType !== 0) return dType
      // 4. FIFO
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })
  }, [tasks, filterStaffId])

  // PAUSED se renderiza dentro de IN_PROGRESS (es un estado del mismo card).
  const byStatus = (status: CleaningStatus) => {
    if (status === CleaningStatus.IN_PROGRESS) {
      return filteredTasks.filter(
        (t) => t.status === CleaningStatus.IN_PROGRESS || t.status === CleaningStatus.PAUSED,
      )
    }
    return filteredTasks.filter((t) => t.status === status)
  }

  if (isLoading) {
    return <div className="text-sm text-gray-500 py-12 text-center">Cargando tablero...</div>
  }

  return (
    <div className="space-y-4">
      {/* Header + filtros */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Tablero de tareas</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {filteredTasks.length} tarea{filteredTasks.length !== 1 ? 's' : ''}
            {filterStaffId && ' (filtradas)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAdHocModal(true)}
            className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium"
            title="Crear tarea para walk-in / late checkout sin reserva"
          >
            + Tarea ad-hoc
          </button>
          <label className="text-xs text-gray-600">Housekeeper</label>
          <select
            value={filterStaffId}
            onChange={(e) => setFilterStaffId(e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="">Todos</option>
            {housekeepers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Columnas */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const colTasks = byStatus(col.status)
          return (
            <div
              key={col.status}
              className={`flex-shrink-0 w-72 bg-gray-50 rounded-b-lg border-t-4 ${col.ringColor} flex flex-col`}
            >
              {/* Header con label + subtítulo (NN/g H6 — explicar, no obligar a memorizar) */}
              <div className="px-3 py-2.5 border-b border-gray-200 bg-white">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-800 uppercase tracking-wide truncate">
                    {col.label}
                  </span>
                  <span className={`text-xs font-medium rounded-full px-2 py-0.5 flex-shrink-0 ${col.pillBg}`}>
                    {colTasks.length}
                  </span>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{col.hint}</p>
              </div>
              {/* Body con altura mínima fija — patrón Trello/Linear/Jira:
                  columnas con/sin cards mantienen tamaño consistente */}
              <div className="p-2 space-y-2 min-h-[420px] flex-1">
                {colTasks.length === 0 ? (
                  <p className="text-xs text-gray-300 text-center py-12">— Vacío —</p>
                ) : (
                  colTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      housekeepers={housekeepers}
                      onAssign={(staffId) =>
                        assignMutation.mutate({ taskId: task.id, assignedToId: staffId })
                      }
                      onVerifyClick={() => setVerifying(task.id)}
                      onRejectClick={() => setRejecting(task.id)}
                      onConfirmDepart={() => {
                        if (!task.checkoutId) {
                          toast.error('No hay checkout asociado a esta tarea')
                          return
                        }
                        confirmDepartMutation.mutate({
                          checkoutId: task.checkoutId,
                          unitId: task.unitId,
                        })
                      }}
                      onForceUrgent={() => forceUrgentMutation.mutate(task.id)}
                      onToggleDeepClean={() => deepCleanMutation.mutate(task.id)}
                      isAssigning={assignMutation.isPending && assignMutation.variables?.taskId === task.id}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal de verificación con checklist viewer */}
      {verifying && (
        <VerifyTaskModal
          taskId={verifying}
          onClose={() => setVerifying(null)}
          onVerified={() => {
            setVerifying(null)
            qc.invalidateQueries({ queryKey: ['kanban-tasks'] })
          }}
        />
      )}

      {/* Modal Rechazar — Sprint 9 G1 */}
      {rejecting && (
        <RejectTaskModal
          taskId={rejecting}
          onClose={() => setRejecting(null)}
          onRejected={() => {
            setRejecting(null)
            qc.invalidateQueries({ queryKey: ['kanban-tasks'] })
            toast.success('Limpieza rechazada — housekeeper notificado')
          }}
        />
      )}

      {/* Modal Tarea Ad-hoc (Sprint 9 — walk-in / late checkout sin reserva) */}
      {showAdHocModal && (
        <AdHocTaskModal
          onClose={() => setShowAdHocModal(false)}
          onCreated={() => {
            setShowAdHocModal(false)
            qc.invalidateQueries({ queryKey: ['kanban-tasks'] })
          }}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
/**
 * AdHocTaskModal — crea CleaningTask sin checkout previo (walk-in / late
 * checkout sin reserva). Migrado desde /overrides para que el supervisor
 * tenga vista única de operaciones (CLAUDE.md §55 Fase 1).
 */
function AdHocTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [unitId, setUnitId] = useState('')
  const [priority, setPriority] = useState<Priority>(Priority.MEDIUM)
  const [reason, setReason] = useState('')

  // Fetch rooms (con units anidadas) para el selector — el endpoint /units
  // no expone "all per property", solo per-room. /rooms incluye units.
  const { data: rooms = [] } = useQuery<Array<{ id: string; number: string; units: Array<{ id: string; label: string }> }>>({
    queryKey: ['rooms-for-adhoc'],
    queryFn: () => api.get('/rooms'),
    staleTime: 5 * 60_000,
  })
  const units = useMemo(() => {
    const flat: Array<{ id: string; label: string; room: { number: string } }> = []
    for (const r of rooms) {
      for (const u of r.units || []) {
        flat.push({ id: u.id, label: u.label, room: { number: r.number } })
      }
    }
    return flat.sort((a, b) => a.room.number.localeCompare(b.room.number))
  }, [rooms])

  const createMut = useMutation({
    mutationFn: () =>
      api.post('/tasks', {
        unitId,
        priority,
        notes: reason || undefined,
      }),
    onSuccess: () => {
      toast.success('Tarea ad-hoc creada')
      onCreated()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo crear la tarea'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Crear tarea ad-hoc</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-600">
            Para casos no previstos por el cron: walk-in con checkout mismo día,
            late checkout sin reserva, limpieza extraordinaria.
          </p>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Habitación / Unidad</label>
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            >
              <option value="">Selecciona unidad...</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  Hab. {u.room?.number ?? '?'} {u.label && u.label !== `Hab. ${u.room?.number}` ? `· ${u.label}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Prioridad</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            >
              <option value={Priority.LOW}>Baja</option>
              <option value={Priority.MEDIUM}>Media</option>
              <option value={Priority.HIGH}>Alta</option>
              <option value={Priority.URGENT}>🔴 URGENT (entra hoy)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Motivo / Notas (opcional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. Walk-in 1 noche, late checkout 4pm aprobado, etc."
              rows={3}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 resize-none"
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 text-gray-700 hover:bg-gray-50 rounded"
          >
            Cancelar
          </button>
          <button
            onClick={() => createMut.mutate()}
            disabled={!unitId || createMut.isPending}
            className="text-sm px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createMut.isPending ? 'Creando...' : 'Crear tarea'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
function TaskCard({
  task,
  housekeepers,
  onAssign,
  onVerifyClick,
  onRejectClick,
  onConfirmDepart,
  onForceUrgent,
  onToggleDeepClean,
  isAssigning,
}: {
  task: CleaningTaskDto
  housekeepers: StaffDto[]
  onAssign: (staffId: string) => void
  onVerifyClick: () => void
  onRejectClick: () => void
  onConfirmDepart: () => void
  onForceUrgent: () => void
  onToggleDeepClean: () => void
  isAssigning: boolean
}) {
  const room = task.unit?.room
  const isUrgent = task.priority === Priority.URGENT
  const isPaused = task.status === CleaningStatus.PAUSED
  const isUnassigned = task.status === CleaningStatus.UNASSIGNED
  const isDone = task.status === CleaningStatus.DONE
  const isPending = task.status === CleaningStatus.PENDING
  const isStayover = task.taskType === 'STAYOVER'
  const [menuOpen, setMenuOpen] = useState(false)

  const elapsed = useElapsed(task)

  // Borde izquierdo según prioridad operativa:
  //   URGENT (rojo)         → checkout + same-day check-in (la más crítica)
  //   STAYOVER (azul)       → limpieza in-house, baja prioridad
  //   default (transparente) → checkout regular
  const leftBorder = isUrgent
    ? 'border-l-4 border-l-red-500'
    : isStayover
      ? 'border-l-4 border-l-blue-400'
      : ''

  // Modern card design — Linear/Notion/Stripe Dashboard 2024 patterns:
  //   - bg-white sin border (sólo color del leftBorder + shadow elegante)
  //   - shadow-sm baseline → hover:shadow-md (microinteraction Apple HIG)
  //   - transition-all 150ms — feel instantáneo
  //   - p-3 padding más generoso (Tufte: whitespace = legibilidad)
  //   - rounded-lg (8px) — moderno sin ser excesivo
  //   - hover:-translate-y-0.5 elevación sutil al pasar el mouse (Material 3)
  const priorityMeta = task.priority ? PRIORITY_BADGE[task.priority] : null
  const showOptionsMenu = !isDone && task.status !== CleaningStatus.VERIFIED

  return (
    <div
      className={`relative bg-white rounded-lg ${leftBorder} p-3 text-xs space-y-2 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 group`}
    >
      {/* Kebab menu top-right — Material Design 3 + Apple HIG.
          Sin label "Opciones" — el ⋮ es self-explanatory globally.
          group-hover muestra solo cuando user pasa por encima (Linear pattern). */}
      {showOptionsMenu && (
        <div className="absolute top-2 right-2 z-10">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Más opciones"
            aria-label="Opciones de la tarea"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="8" cy="13" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-7 z-20 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[180px] py-1">
                {!isUrgent && (
                  <button
                    onClick={() => { setMenuOpen(false); onForceUrgent() }}
                    className="w-full text-left px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 font-medium"
                  >
                    🔴 Forzar URGENTE
                  </button>
                )}
                <button
                  onClick={() => { setMenuOpen(false); onToggleDeepClean() }}
                  className="w-full text-left px-3 py-1.5 text-xs text-purple-700 hover:bg-purple-50 font-medium"
                >
                  ✨ Limpieza profunda
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Header: room + priority badge (sin MEDIUM — solo excepciones) */}
      <div className="flex items-center justify-between gap-2 pr-7">
        <div className="font-semibold text-gray-900 text-sm flex items-center gap-1.5 min-w-0">
          <span className="truncate">Hab. {room?.number ?? '—'}</span>
          {task.unit?.label && task.unit.label !== `Hab. ${room?.number}` && task.unit.label !== room?.number && (
            <span className="text-gray-400 font-normal text-xs truncate">· {task.unit.label}</span>
          )}
        </div>
        {priorityMeta && (
          <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide flex-shrink-0 ${priorityMeta.className}`}>
            {priorityMeta.label}
          </span>
        )}
      </div>

      {/* Badges: same-day check-in + tipo de tarea (stayover).
          Apple HIG pre-attentive: color + emoji = lectura <250ms. */}
      {(task.hasSameDayCheckIn || isStayover) && (
        <div className="flex flex-wrap gap-1">
          {task.hasSameDayCheckIn && (
            <span className="text-[10px] font-semibold text-red-700 bg-red-50 rounded px-1.5 py-0.5">
              🔴 Hoy entra
            </span>
          )}
          {isStayover && (
            <span
              className="text-[10px] font-semibold text-blue-700 bg-blue-50 rounded px-1.5 py-0.5"
              title="Limpieza de estadía — huésped sigue en casa"
            >
              🛏️ Estadía
            </span>
          )}
        </div>
      )}

      {/* Assignment row */}
      {isUnassigned ? (
        <div className="pt-1">
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) onAssign(e.target.value)
            }}
            disabled={isAssigning}
            className="w-full text-xs border border-gray-300 rounded px-1.5 py-1 bg-white"
          >
            <option value="" disabled>
              {isAssigning ? 'Asignando...' : 'Asignar housekeeper...'}
            </option>
            {housekeepers.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </div>
      ) : task.assignedTo ? (
        <p className="text-gray-500 truncate">
          👤 {task.assignedTo.name}
        </p>
      ) : null}

      {/* Elapsed time + state hint */}
      {elapsed && (
        <p className={`text-[11px] ${isPaused ? 'text-amber-600' : 'text-gray-400'}`}>
          {isPaused ? '⏸ Pausada · ' : ''}{elapsed}
        </p>
      )}

      {/* Confirmar salida — solo en PENDING (Fase 2 §4 CLAUDE.md).
          Migrado desde /overrides "Real-Time" tab — recepción confirma que
          el huésped salió físicamente → PENDING transiciona a READY + push */}
      {isPending && task.checkoutId && (
        <button
          onClick={onConfirmDepart}
          className="w-full text-center bg-emerald-50 text-emerald-700 rounded py-1.5 hover:bg-emerald-100 font-medium text-xs border border-emerald-200"
          title="Confirma que el huésped salió físicamente — activa la limpieza"
        >
          ✓ Confirmar salida
        </button>
      )}

      {/* Verify + Reject CTAs en DONE — Sprint 9 G1.
          AHLEI sec. 4.4 *Quality Inspection Cycle*: el supervisor decide
          aprobar (Verificar) o rechazar (re-clean). UI side-by-side, verde
          a la izquierda (acción positiva esperada — Apple HIG), gris-rojo
          a la derecha (acción correctiva — menos prominente). */}
      {isDone && (
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={onVerifyClick}
            className="col-span-2 text-center bg-indigo-50 text-indigo-700 rounded py-1.5 hover:bg-indigo-100 font-medium text-xs"
          >
            Verificar →
          </button>
          <button
            onClick={onRejectClick}
            className="text-center bg-red-50 text-red-700 rounded py-1.5 hover:bg-red-100 font-medium text-xs"
            title="Rechazar limpieza — el housekeeper debe limpiar de nuevo"
          >
            🔄 Rechazar
          </button>
        </div>
      )}

      {/* Menú de overrides ahora vive en el kebab top-right de la card */}
    </div>
  )
}

function useElapsed(task: CleaningTaskDto): string | null {
  // Calcula tiempo desde el evento más relevante:
  //   - In progress / paused / done: desde startedAt → ahora (o finishedAt)
  //   - Ready / unassigned: desde createdAt → ahora ("hace X min")
  if (task.startedAt) {
    const end = task.finishedAt ? new Date(task.finishedAt).getTime() : Date.now()
    const min = Math.max(0, Math.round((end - new Date(task.startedAt).getTime()) / 60_000))
    return task.finishedAt ? `Limpiada en ${min} min` : `${min} min en curso`
  }
  if (task.createdAt) {
    const min = Math.max(0, Math.round((Date.now() - new Date(task.createdAt).getTime()) / 60_000))
    if (min < 1) return 'Hace instantes'
    if (min < 60) return `Hace ${min} min`
    const h = Math.round(min / 60)
    return `Hace ${h} h`
  }
  return null
}

// ────────────────────────────────────────────────────────────────────────────
/**
 * VerifyTaskModal — abre sobre la tarea DONE, fetcha logs (incluye
 * metadata.checklist) y permite verificar con un click. El supervisor
 * ve qué pasos marcó/no marcó el housekeeper antes de confirmar.
 */
function VerifyTaskModal({
  taskId,
  onClose,
  onVerified,
}: {
  taskId: string
  onClose: () => void
  onVerified: () => void
}) {
  const { data: task, isLoading } = useQuery<
    CleaningTaskDto & { logs: TaskLogDto[]; notes?: Array<{ id: string }> }
  >({
    queryKey: ['task-detail', taskId],
    queryFn: () => api.get(`/tasks/${taskId}`),
  })

  const verifyMutation = useMutation({
    mutationFn: () => api.patch(`/tasks/${taskId}/verify`),
    onSuccess: () => {
      toast.success('Tarea verificada')
      onVerified()
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Error al verificar'),
  })

  // Extraer checklist del log COMPLETED (si existe)
  const checklist = useMemo(() => {
    if (!task?.logs) return null
    const completedLog = task.logs.find((l) => l.event === TaskLogEvent.COMPLETED)
    const meta = completedLog?.metadata as { checklist?: Array<{ id: string; label: string; completed: boolean }> } | null
    return meta?.checklist ?? null
  }, [task?.logs])

  const totalDuration = useMemo(() => {
    if (!task?.startedAt || !task?.finishedAt) return null
    const min = Math.round(
      (new Date(task.finishedAt).getTime() - new Date(task.startedAt).getTime()) / 60_000,
    )
    return `${min} min`
  }, [task?.startedAt, task?.finishedAt])

  const pauseCount = useMemo(() => {
    if (!task?.logs) return 0
    return task.logs.filter((l) => l.event === TaskLogEvent.PAUSED).length
  }, [task?.logs])

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Verificar tarea</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
            ×
          </button>
        </div>

        {isLoading || !task ? (
          <div className="p-8 text-center text-gray-400 text-sm">Cargando...</div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Resumen */}
            <div className="space-y-1">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Habitación</p>
              <p className="text-base font-semibold text-gray-900">
                {task.unit?.room?.number ?? '—'}
                {task.unit?.label && (
                  <span className="text-gray-400 font-normal ml-2">· {task.unit.label}</span>
                )}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <Stat label="Housekeeper" value={task.assignedTo?.name ?? '—'} />
              <Stat label="Duración" value={totalDuration ?? '—'} />
              <Stat label="Pausas" value={String(pauseCount)} />
              <Stat label="Notas" value={String(task.notes?.length ?? 0)} />
            </div>

            {/* Checklist viewer */}
            <div>
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Checklist registrado
              </p>
              {checklist && checklist.length > 0 ? (
                <ul className="space-y-1.5 border border-gray-200 rounded-lg p-3 bg-gray-50">
                  {checklist.map((item) => (
                    <li key={item.id} className="flex items-start gap-2 text-xs">
                      <span
                        className={`inline-block w-4 h-4 rounded flex items-center justify-center text-white text-[10px] flex-shrink-0 mt-0.5 ${
                          item.completed ? 'bg-emerald-500' : 'bg-gray-300'
                        }`}
                      >
                        {item.completed ? '✓' : ''}
                      </span>
                      <span className={item.completed ? 'text-gray-700' : 'text-gray-400 line-through'}>
                        {item.label}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-400 italic">
                  No se registró checklist (tarea cerrada antes de Sprint 8K, o
                  el housekeeper no marcó pasos).
                </p>
              )}
            </div>

            {/* Acciones */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={onClose}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => verifyMutation.mutate()}
                disabled={verifyMutation.isPending}
                className="flex-1 px-3 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 font-medium"
              >
                {verifyMutation.isPending ? 'Verificando...' : '✓ Verificar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded p-2">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-gray-900 font-medium truncate">{value}</p>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
/**
 * RejectTaskModal — Sprint 9 G1.
 *
 * Modal forcing-function (§32 CLAUDE.md) para rechazar inspección.
 * Backend exige razón mínima 5 char. UI valida client-side antes de POST.
 *
 * Patrón Apple HIG "Destructive Actions Require Confirmation":
 *   - Botón rojo solo se habilita con razón válida
 *   - Texto explica consecuencia: "el housekeeper deberá limpiar de nuevo"
 */
function RejectTaskModal({
  taskId,
  onClose,
  onRejected,
}: {
  taskId: string
  onClose: () => void
  onRejected: () => void
}) {
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  const isValid = trimmed.length >= 5

  const rejectMut = useMutation({
    mutationFn: () => api.post(`/tasks/${taskId}/reject`, { reason: trimmed }),
    onSuccess: onRejected,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo rechazar la tarea'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">🔄 Rechazar limpieza</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900">
            <strong>⚠️ Acción correctiva.</strong> El housekeeper recibirá una alerta
            y deberá volver a limpiar la habitación. Esta acción queda en el
            audit trail con tu razón.
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">
              Razón del rechazo <span className="text-red-600">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. Baño con agua acumulada, sábanas mal puestas, polvo en ventanas..."
              rows={4}
              autoFocus
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-red-200"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Mínimo 5 caracteres ({trimmed.length}/5)
            </p>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 text-gray-700 hover:bg-gray-50 rounded"
          >
            Cancelar
          </button>
          <button
            onClick={() => rejectMut.mutate()}
            disabled={!isValid || rejectMut.isPending}
            className="text-sm px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {rejectMut.isPending ? 'Rechazando...' : '🔄 Rechazar limpieza'}
          </button>
        </div>
      </div>
    </div>
  )
}
