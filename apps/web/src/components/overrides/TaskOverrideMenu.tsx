/**
 * TaskOverrideMenu — popover por tarea con las 3 acciones que NO requieren
 * crear una entidad nueva (esos van por modal):
 *   - 🚨 Forzar URGENT
 *   - 🧽 Limpieza profunda (toggle)
 *   - ⏸ Pausar limpieza / ▶️ Liberar hold
 *
 * Patrón: dropdown anclado al trigger button. CLAUDE.md §32 — toda mutación
 * destructiva requiere confirmación. Para acciones reversibles (toggle) basta
 * el toast de feedback. Para hold pedimos razón inline (forcing function).
 */
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { tasksOverridesApi } from '../../api/tasks-overrides.api'

interface Props {
  taskId: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  deepClean: boolean
  holdReason: string | null
  status: string
  onClose: () => void
}

export function TaskOverrideMenu({
  taskId,
  priority,
  deepClean,
  holdReason,
  status,
  onClose,
}: Props) {
  const qc = useQueryClient()
  const [holdInputOpen, setHoldInputOpen] = useState(false)
  const [holdReasonInput, setHoldReasonInput] = useState('')

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ['daily-grid'] })
    qc.invalidateQueries({ queryKey: ['guest-stays'] })
    qc.invalidateQueries({ queryKey: ['tasks'] })
  }

  const forceUrgentM = useMutation({
    mutationFn: () => tasksOverridesApi.forceUrgent(taskId),
    onSuccess: () => {
      toast.success('Prioridad cambiada a URGENT')
      invalidateAll()
      onClose()
    },
    onError: (e: any) => toast.error(e?.message ?? 'Error'),
  })

  const deepCleanM = useMutation({
    mutationFn: () => tasksOverridesApi.toggleDeepClean(taskId),
    onSuccess: (data: any) => {
      toast.success(data?.deepClean ? 'Marcada como limpieza profunda' : 'Limpieza profunda removida')
      invalidateAll()
      onClose()
    },
    onError: (e: any) => toast.error(e?.message ?? 'Error'),
  })

  const holdM = useMutation({
    mutationFn: (reason: string) => tasksOverridesApi.hold(taskId, reason),
    onSuccess: () => {
      toast.success('Limpieza en hold')
      invalidateAll()
      onClose()
    },
    onError: (e: any) => toast.error(e?.message ?? 'Error'),
  })

  const releaseM = useMutation({
    mutationFn: () => tasksOverridesApi.releaseHold(taskId),
    onSuccess: () => {
      toast.success('Hold liberado')
      invalidateAll()
      onClose()
    },
    onError: (e: any) => toast.error(e?.message ?? 'Error'),
  })

  const isInProgress = status === 'IN_PROGRESS'
  const isFinalized = status === 'DONE' || status === 'VERIFIED' || status === 'CANCELLED'
  const isHeld = !!holdReason

  return (
    <div
      role="menu"
      aria-label="Acciones de override"
      className="absolute right-0 top-full mt-1 z-30 w-60 bg-white rounded-lg shadow-lg border border-gray-200 py-1.5 animate-[modal-spring-in_180ms_var(--ease-spring)] motion-reduce:animate-none"
    >
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
        Ajustes operativos
      </div>

      {/* Force URGENT */}
      <button
        type="button"
        role="menuitem"
        disabled={priority === 'URGENT' || isFinalized}
        onClick={() => forceUrgentM.mutate()}
        className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
      >
        <span className="text-base">🚨</span>
        <span className="flex-1">Forzar URGENT</span>
        {priority === 'URGENT' && <span className="text-[10px] text-gray-400">Activo</span>}
      </button>

      {/* Deep clean toggle */}
      <button
        type="button"
        role="menuitem"
        disabled={isInProgress || isFinalized}
        onClick={() => deepCleanM.mutate()}
        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
      >
        <span className="text-base">🧽</span>
        <span className="flex-1">{deepClean ? 'Quitar limpieza profunda' : 'Limpieza profunda'}</span>
        {deepClean && <span className="text-[10px] text-blue-600">●</span>}
      </button>

      {/* Hold / Release */}
      {!isHeld && (
        <>
          {!holdInputOpen ? (
            <button
              type="button"
              role="menuitem"
              disabled={isInProgress || isFinalized}
              onClick={() => setHoldInputOpen(true)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <span className="text-base">⏸</span>
              <span className="flex-1">Pausar limpieza</span>
            </button>
          ) : (
            <div className="px-3 py-2 border-t border-gray-100">
              <p className="text-[11px] text-gray-500 mb-1.5">Razón del hold</p>
              <input
                className="input text-xs py-1.5"
                placeholder="Ej. Huésped pidió extender"
                value={holdReasonInput}
                onChange={(e) => setHoldReasonInput(e.target.value)}
                autoFocus
                minLength={3}
                maxLength={200}
              />
              <div className="flex gap-1.5 mt-2">
                <button
                  type="button"
                  className="btn-secondary text-xs px-2 py-1 flex-1"
                  onClick={() => {
                    setHoldInputOpen(false)
                    setHoldReasonInput('')
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-primary text-xs px-2 py-1 flex-1"
                  disabled={holdReasonInput.trim().length < 3}
                  onClick={() => holdM.mutate(holdReasonInput.trim())}
                >
                  Confirmar
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {isHeld && (
        <button
          type="button"
          role="menuitem"
          onClick={() => releaseM.mutate()}
          className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 flex items-center gap-2"
        >
          <span className="text-base">▶️</span>
          <span className="flex-1">Liberar hold</span>
          <span className="text-[10px] text-amber-600 italic truncate max-w-[80px]">{holdReason}</span>
        </button>
      )}
    </div>
  )
}
