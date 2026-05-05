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
import { CleaningStatus, HousekeepingRole, Priority, TaskLogEvent } from '@zenix/shared'

const COLUMNS: { status: CleaningStatus; label: string; ringColor: string; pillBg: string }[] = [
  { status: CleaningStatus.UNASSIGNED,   label: 'Sin asignar',   ringColor: 'border-t-red-400',     pillBg: 'bg-red-100 text-red-700' },
  { status: CleaningStatus.READY,        label: 'Lista',         ringColor: 'border-t-amber-400',   pillBg: 'bg-amber-100 text-amber-700' },
  { status: CleaningStatus.IN_PROGRESS,  label: 'En progreso',   ringColor: 'border-t-blue-400',    pillBg: 'bg-blue-100 text-blue-700' },
  { status: CleaningStatus.DONE,         label: 'Hecha',         ringColor: 'border-t-emerald-400', pillBg: 'bg-emerald-100 text-emerald-700' },
  { status: CleaningStatus.VERIFIED,     label: 'Verificada',    ringColor: 'border-t-indigo-400',  pillBg: 'bg-indigo-100 text-indigo-700' },
]

const PRIORITY_BADGE: Record<Priority, string> = {
  [Priority.LOW]:    'bg-gray-100 text-gray-500',
  [Priority.MEDIUM]: 'bg-blue-50 text-blue-600',
  [Priority.HIGH]:   'bg-orange-50 text-orange-600',
  [Priority.URGENT]: 'bg-red-100 text-red-700 font-semibold',
}

export function KanbanPage() {
  const qc = useQueryClient()
  const [filterStaffId, setFilterStaffId] = useState<string>('') // '' = todos
  const [verifying, setVerifying] = useState<string | null>(null) // taskId en modal verify

  const { data: tasks = [], isLoading } = useQuery<CleaningTaskDto[]>({
    queryKey: ['kanban-tasks'],
    queryFn: () =>
      api.get('/tasks?status=UNASSIGNED,READY,IN_PROGRESS,PAUSED,DONE,VERIFIED'),
    staleTime: 30_000,
  })

  const { data: staff = [] } = useQuery<StaffDto[]>({
    queryKey: ['kanban-staff'],
    queryFn: () => api.get('/staff'),
    staleTime: 5 * 60_000,
  })
  const housekeepers = useMemo(
    () => staff.filter((s) => s.role === HousekeepingRole.HOUSEKEEPER && s.active),
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
    if (!filterStaffId) return tasks
    return tasks.filter((t) => t.assignedTo?.id === filterStaffId)
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
              className={`flex-shrink-0 w-72 bg-gray-50 rounded-b-lg border-t-4 ${col.ringColor}`}
            >
              <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between bg-white rounded-t-none">
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  {col.label}
                </span>
                <span className={`text-xs font-medium rounded-full px-2 ${col.pillBg}`}>
                  {colTasks.length}
                </span>
              </div>
              <div className="p-2 space-y-2 min-h-[200px]">
                {colTasks.length === 0 ? (
                  <p className="text-xs text-gray-300 text-center py-6">—</p>
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
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
function TaskCard({
  task,
  housekeepers,
  onAssign,
  onVerifyClick,
  isAssigning,
}: {
  task: CleaningTaskDto
  housekeepers: StaffDto[]
  onAssign: (staffId: string) => void
  onVerifyClick: () => void
  isAssigning: boolean
}) {
  const room = task.unit?.room
  const isUrgent = task.priority === Priority.URGENT
  const isPaused = task.status === CleaningStatus.PAUSED
  const isUnassigned = task.status === CleaningStatus.UNASSIGNED
  const isDone = task.status === CleaningStatus.DONE

  const elapsed = useElapsed(task)

  return (
    <div
      className={`bg-white rounded-lg border ${
        isUrgent ? 'border-l-4 border-l-red-500 border-gray-200' : 'border-gray-200'
      } p-2.5 text-xs space-y-1.5 shadow-sm`}
    >
      {/* Header: room + priority badge */}
      <div className="flex items-center justify-between">
        <div className="font-semibold text-gray-900 flex items-center gap-1.5">
          <span>{room?.number ?? '—'}</span>
          {task.unit?.label && (
            <span className="text-gray-400 font-normal text-xs">· {task.unit.label}</span>
          )}
        </div>
        {task.priority && (
          <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${PRIORITY_BADGE[task.priority]}`}>
            {task.priority === Priority.URGENT ? '🔴 URG' : task.priority}
          </span>
        )}
      </div>

      {/* Same-day check-in badge */}
      {task.hasSameDayCheckIn && (
        <div className="text-[10px] font-semibold text-red-700 bg-red-50 rounded px-1.5 py-0.5 inline-block">
          🔴 Hoy entra
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

      {/* Verify CTA only on DONE */}
      {isDone && (
        <button
          onClick={onVerifyClick}
          className="w-full text-center bg-indigo-50 text-indigo-700 rounded py-1.5 hover:bg-indigo-100 font-medium text-xs"
        >
          Verificar →
        </button>
      )}
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
