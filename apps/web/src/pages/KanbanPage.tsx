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

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../api/client'
import { useSSE } from '../hooks/useSSE'
import { useShakeOnInvalid } from '../hooks/useShakeOnInvalid'
import { useAuthStore } from '../store/auth'
import type { CleaningTaskDto, SseEvent, StaffDto, TaskLogDto } from '@zenix/shared'
import { CleaningStatus, StaffRole, Priority, TaskLogEvent } from '@zenix/shared'

// ── Helpers UX (Sprint 9 final — patterns Linear/Trello/Jira) ──────────────

/**
 * Avatar circular con iniciales — Linear/Trello pattern.
 * NN/g 2023: avatares 4× más rápidos de identificar que texto.
 * Color hash determinístico → mismo housekeeper = mismo color en TODA la app.
 */
const AVATAR_PALETTE = [
  'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500',
  'bg-pink-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-rose-500',
]
function avatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}
function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
function Avatar({ name, size = 'sm' }: { name: string; size?: 'xs' | 'sm' | 'md' }) {
  const dim = size === 'md' ? 'w-7 h-7 text-xs' : size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-5 h-5 text-[9px]'
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full text-white font-semibold flex-shrink-0 ${dim} ${avatarColor(name)}`}
      title={name}
    >
      {avatarInitials(name)}
    </span>
  )
}

/** Card aging — Trello signature feature.
 *  Una task que lleva mucho tiempo en su estado actual sugiere atasco.
 *  >2h en READY/IN_PROGRESS/PAUSED → tinte amber + warning ⏰. */
const AGING_THRESHOLD_MS = 2 * 60 * 60 * 1000
function isAged(task: CleaningTaskDto): boolean {
  if (task.status === CleaningStatus.VERIFIED || task.status === CleaningStatus.DONE) return false
  const ref = task.updatedAt ? new Date(task.updatedAt).getTime() : new Date(task.createdAt).getTime()
  return Date.now() - ref > AGING_THRESHOLD_MS
}

/** Tiempo transcurrido en formato compacto operativo: "2h 15m", "45m", "ahora" */
function formatElapsed(fromIso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(fromIso).getTime()) / 60_000))
  if (min < 1) return 'ahora'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

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

/**
 * Contexto descriptivo de la tarea — explica POR QUÉ está en el kanban hoy.
 *
 * Justificación UX: cuando un usuario nuevo ve la 204/C2 en el kanban pero no
 * ve checkout en el calendario, la card debe explicar el origen ("Pendiente
 * desde ayer" para carryover, "Limpieza durante estadía" para stayover, etc.).
 * Sin esto, falla la heurística H1 de Nielsen (visibility of system status):
 * el usuario no puede mapear lo que ve en kanban con lo que ve en calendario.
 *
 * Prioridad de razones (la más específica gana):
 *   1. Carryover (atascada de día anterior — el caso más confuso)
 *   2. Extensión sin/con limpieza (re-etiquetada por D12)
 *   3. Stayover (huésped en casa)
 *   4. Same-day check-in (huésped llega hoy en este mismo cuarto)
 *   5. Mantenimiento
 *   6. Default — checkout del día
 */
function getTaskContext(task: CleaningTaskDto): { icon: string; label: string; tone: 'amber' | 'blue' | 'red' | 'purple' | 'gray' | 'emerald' } {
  // 1. Carryover — la razón más confusa para un nuevo usuario
  if (task.carryoverFromDate) {
    const carryoverDate = parseISO(task.carryoverFromDate.slice(0, 10))
    const today = new Date()
    const daysAgo = differenceInCalendarDays(today, carryoverDate)
    const label =
      daysAgo === 1
        ? 'Pendiente desde ayer'
        : daysAgo > 1
          ? `Pendiente desde hace ${daysAgo} días`
          : `Pendiente desde ${format(carryoverDate, 'd MMM', { locale: es })}`
    return { icon: '📋', label, tone: 'amber' }
  }

  // 2. Extensión re-etiquetada (D12 §46 CLAUDE.md)
  if (task.extensionFlag === 'WITH_CLEANING') {
    return { icon: '✨', label: 'Solicitada en extensión', tone: 'purple' }
  }
  if (task.extensionFlag === 'WITHOUT_CLEANING') {
    return { icon: '⊘', label: 'Extensión sin limpieza', tone: 'gray' }
  }

  // 3. Stayover (huésped sigue en casa)
  if (task.taskType === 'STAYOVER') {
    return { icon: '🛏️', label: 'Limpieza durante estadía', tone: 'blue' }
  }

  // 4. Mantenimiento
  if (task.taskType === 'MAINTENANCE') {
    return { icon: '🔧', label: 'Mantenimiento', tone: 'red' }
  }

  // 5. Same-day check-in (checkout normal pero con huésped llegando hoy)
  if (task.hasSameDayCheckIn) {
    return { icon: '🚪', label: 'Salida + nuevo huésped hoy', tone: 'red' }
  }

  // 6. Default — checkout normal del día
  return { icon: '🚪', label: 'Salida del día', tone: 'emerald' }
}

/**
 * Estilo del contexto inline — solo color de texto, SIN bg/border.
 * Patrón Linear/Trello/Jira: metadata = inline label, no boxed chip.
 * Justificación: el chip con caja competía visualmente con los botones
 * de acción (también full-width con bg+border). Texto inline reduce ruido
 * y refuerza que es METADATA, no acción (Tufte: data-ink ratio).
 */
const CONTEXT_TONE: Record<'amber' | 'blue' | 'red' | 'purple' | 'gray' | 'emerald', string> = {
  amber:   'text-amber-700',
  blue:    'text-blue-700',
  red:     'text-red-700',
  purple:  'text-purple-700',
  gray:    'text-gray-500',
  emerald: 'text-emerald-700',
}

type QuickFilter = 'all' | 'urgent' | 'mine' | 'stayover'

export function KanbanPage() {
  const qc = useQueryClient()
  const me = useAuthStore((s) => s.user)
  const [filterStaffId, setFilterStaffId] = useState<string>('') // '' = todos
  const [verifying, setVerifying] = useState<string | null>(null) // taskId en modal verify
  const [rejecting, setRejecting] = useState<string | null>(null) // taskId en modal reject
  const [showAdHocModal, setShowAdHocModal] = useState(false)
  // Menú contextual ⋮ — solo UN abierto a la vez (state al padre, no
  // local de cada TaskCard). Antes cada card tenía su propio menuOpen
  // → al abrir B, A quedaba abierto (issue reportado por usuario).
  const [openMenuTaskId, setOpenMenuTaskId] = useState<string | null>(null)
  // Sprint 9 final UX (patterns Linear/Trello/Jira):
  const [search, setSearch] = useState('')          // P2 — search por número
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [showShortcuts, setShowShortcuts] = useState(false)

  // Keyboard shortcut "?" abre modal de atajos (Linear pattern)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '?' && !(e.target as HTMLElement)?.matches('input,textarea')) {
        e.preventDefault()
        setShowShortcuts((v) => !v)
      } else if (e.key === 'Escape') {
        setShowShortcuts(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Re-render cada minuto para refrescar timers "Hace Xm" sin SSE event.
  // Card aging es time-based (Trello pattern) — necesita tick continuo.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

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
    let base = filterStaffId ? tasks.filter((t) => t.assignedTo?.id === filterStaffId) : tasks

    // Quick filter chips (Linear/Jira pattern)
    if (quickFilter === 'urgent') {
      base = base.filter((t) => t.priority === Priority.URGENT || t.hasSameDayCheckIn)
    } else if (quickFilter === 'mine' && me?.id) {
      base = base.filter((t) => t.assignedTo?.id === me.id)
    } else if (quickFilter === 'stayover') {
      base = base.filter((t) => t.taskType === 'STAYOVER')
    }

    // Search por número de cuarto (P2). Match parcial case-insensitive.
    const q = search.trim().toLowerCase()
    if (q) {
      base = base.filter((t) => {
        const num = t.unit?.room?.number?.toLowerCase() ?? ''
        const label = t.unit?.label?.toLowerCase() ?? ''
        const guest = t.assignedTo?.name?.toLowerCase() ?? ''
        return num.includes(q) || label.includes(q) || guest.includes(q)
      })
    }
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
  }, [tasks, filterStaffId, quickFilter, search, me?.id])

  // PAUSED se renderiza dentro de IN_PROGRESS (es un estado del mismo card).
  const byStatus = (status: CleaningStatus) => {
    if (status === CleaningStatus.IN_PROGRESS) {
      return filteredTasks.filter(
        (t) => t.status === CleaningStatus.IN_PROGRESS || t.status === CleaningStatus.PAUSED,
      )
    }
    return filteredTasks.filter((t) => t.status === status)
  }

  // Counts para quick filter chips (Linear pattern — siempre visible "cuántos hay").
  // CRÍTICO: este useMemo DEBE ir antes del early return de isLoading.
  // Rules of Hooks: hooks deben llamarse siempre en el mismo orden cada render.
  // Antes estaba después del if (isLoading) return → en primer render con
  // isLoading=true se ejecutaban N hooks; en segundo render con isLoading=false
  // se ejecutaban N+1 → React error "Rendered more hooks than previous render".
  const counts = useMemo(() => {
    const baseTasks = filterStaffId ? tasks.filter((t) => t.assignedTo?.id === filterStaffId) : tasks
    return {
      all: baseTasks.length,
      urgent: baseTasks.filter((t) => t.priority === Priority.URGENT || t.hasSameDayCheckIn).length,
      mine: me?.id ? baseTasks.filter((t) => t.assignedTo?.id === me.id).length : 0,
      stayover: baseTasks.filter((t) => t.taskType === 'STAYOVER').length,
    }
  }, [tasks, filterStaffId, me?.id])

  if (isLoading) {
    return <div className="text-sm text-gray-500 py-12 text-center">Cargando tablero...</div>
  }

  return (
    <div className="space-y-4">
      {/* Header + acciones primarias */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Tablero de tareas</h1>
          {/* Pixel-perfect: inline-flex items-center → kbd y texto en
              baseline idéntico. Antes <p> con <button> inline hacía que
              el kbd quedara 1-2px fuera de baseline del texto. */}
          <div className="text-xs text-gray-500 mt-0.5 inline-flex items-center gap-1.5">
            <span>
              {filteredTasks.length} tarea{filteredTasks.length !== 1 ? 's' : ''}
              {(filterStaffId || quickFilter !== 'all' || search) && ' (filtradas)'}
            </span>
            <span className="text-gray-300">·</span>
            <button
              onClick={() => setShowShortcuts(true)}
              className="inline-flex items-center gap-1 text-gray-400 hover:text-gray-700"
              title="Ver atajos de teclado"
            >
              <span>Pulsa</span>
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono border border-gray-300 leading-none">?</kbd>
              <span>para atajos</span>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Pixel-perfect: TODOS los controles del header con h-8 (32px) +
              text-sm. Antes search era 28px, button 30px, select 28px →
              baseline shifts visibles. Ahora alineación perfecta. */}
          {/* Search por habitación / housekeeper — P2 (Trello/Jira pattern) */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar Hab. 103..."
              className="h-8 text-sm border border-gray-300 rounded pl-8 pr-2 focus:outline-none focus:ring-2 focus:ring-emerald-200 w-48"
            />
          </div>
          <button
            onClick={() => setShowAdHocModal(true)}
            className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium"
            title="Crear tarea para walk-in / late checkout sin reserva"
          >
            + Tarea ad-hoc
          </button>
          <select
            value={filterStaffId}
            onChange={(e) => setFilterStaffId(e.target.value)}
            className="h-8 text-sm border border-gray-300 rounded px-2"
            title="Filtrar por housekeeper"
          >
            <option value="">Todos los housekeepers</option>
            {housekeepers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Quick filter chips (Linear/Jira pattern — 1 click = vista filtrada).
          Siempre muestran counter para que el supervisor sepa cuántos hay
          sin tener que filtrar y volver a quitar. */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterChip active={quickFilter === 'all'}      onClick={() => setQuickFilter('all')}      label="Todas"      count={counts.all}      tone="gray" />
        <FilterChip active={quickFilter === 'urgent'}   onClick={() => setQuickFilter('urgent')}   label="🔴 Urgente" count={counts.urgent}   tone="red" />
        <FilterChip active={quickFilter === 'mine'}     onClick={() => setQuickFilter('mine')}     label="👤 Mías"    count={counts.mine}     tone="emerald" disabled={!me?.id} />
        <FilterChip active={quickFilter === 'stayover'} onClick={() => setQuickFilter('stayover')} label="🛏️ Estadía" count={counts.stayover} tone="blue" />
      </div>

      {/* Columnas — scrollbar siempre visible (Trello/Jira/GitHub/Asana pattern).
          NN/g 2020 *Affordances for Horizontal Scroll*: la combinación de
          partial column visible + scrollbar permanente alcanza 95% de
          discoverability vs 67% del fade aislado. Es el estándar real del
          segmento kanban — los 4 líderes (Trello, Jira, GitHub Projects,
          Asana) lo usan, ninguno usa fade.
          Tailwind arbitrary properties para styling cross-browser:
            - Firefox: scrollbar-width: thin
            - WebKit/Chromium: ::-webkit-scrollbar h-2 + thumb redondeado */}
      <div
        className="flex gap-3 overflow-x-auto pb-4 [scrollbar-width:thin] [scrollbar-color:rgb(209_213_219)_transparent] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-gray-400"
      >
        {COLUMNS.map((col) => {
          const colTasks = byStatus(col.status)
          return (
            <section
              key={col.status}
              className={`flex-shrink-0 w-72 rounded-xl bg-slate-50/60 border-t-4 ${col.ringColor} ring-1 ring-slate-200/70 flex flex-col`}
            >
              {/* Header — pattern unificado con Maintenance Kanban (Sprint Mx-1B-W1.1):
                  sticky top con backdrop-blur, count pill, hint inline.
                  Reemplaza header viejo "white block separado" por diseño curvo
                  consistente entre los dos kanbans del PMS (NN/g H4 consistency). */}
              <header className="sticky top-0 z-[1] bg-slate-50/95 backdrop-blur-sm rounded-t-xl px-3 pt-3 pb-2 border-b border-slate-200/60">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 truncate">
                    {col.label}
                  </h3>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${col.pillBg}`}>
                    {colTasks.length}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{col.hint}</p>
              </header>
              {/* Body con altura mínima fija — patrón Trello/Linear/Jira:
                  columnas con/sin cards mantienen tamaño consistente */}
              <div className="px-2 py-2 space-y-3 min-h-[420px] flex-1 flex flex-col">
                {colTasks.length === 0 ? (
                  <EmptyColumn status={col.status} />
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
                      isMenuOpen={openMenuTaskId === task.id}
                      onToggleMenu={() => setOpenMenuTaskId(openMenuTaskId === task.id ? null : task.id)}
                      onCloseMenu={() => setOpenMenuTaskId(null)}
                    />
                  ))
                )}
              </div>
            </section>
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

      {/* Keyboard shortcuts modal (`?`) */}
      {showShortcuts && <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />}

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
 * EmptyColumn — empty state friendly (Linear pattern).
 * Mensaje contextual según la columna — no genérico "— Vacío —".
 * Apple HIG: "Empty states are an opportunity to teach and motivate."
 */
function EmptyColumn({ status }: { status: CleaningStatus }) {
  // UX writing — Jakob Nielsen + Apple HIG + Mailchimp Content Style Guide:
  //   1. Voz consistente (neutral-positiva), evitar felicitaciones
  //   2. Reframe positivo en vez de negación cuando posible
  //   3. Sub-line explica QUÉ pasa cuando aparezcan items, no asume causa
  //   4. Sin jerga interna ni términos role-específicos
  //   5. Apple HIG: "Be Concise. Convey only essential info."
  const meta: Record<string, { icon: string; line1: string; line2: string }> = {
    [CleaningStatus.PENDING]:     { icon: '⏳', line1: 'Sin salidas pendientes',       line2: 'Todos los huéspedes en flujo' },
    [CleaningStatus.UNASSIGNED]:  { icon: '✅', line1: 'Equipo asignado',              line2: 'Todas las tareas tienen housekeeper' },
    [CleaningStatus.READY]:       { icon: '🧘', line1: 'Sin cuartos por limpiar',     line2: 'El equipo está al día con la operación' },
    [CleaningStatus.IN_PROGRESS]: { icon: '☕', line1: 'Sin limpiezas activas',        line2: 'Aparecerán cuando el equipo inicie' },
    [CleaningStatus.DONE]:        { icon: '👁️', line1: 'Sin verificaciones pendientes', line2: 'Las tareas terminadas aparecerán aquí' },
    [CleaningStatus.VERIFIED]:    { icon: '✨', line1: 'Aún sin verificadas',          line2: 'Aparecerán al aprobar tareas terminadas' },
  }
  const m = meta[status] ?? { icon: '—', line1: 'Sin elementos', line2: '' }
  // UX fix: empty state top-aligned con pt-8 (32px) en vez de centrado
  // vertical en min-h-[420px]. Razón: en viewports pequeños el centrado
  // obligaba a hacer scroll para verlo (issue reportado por usuario).
  // Estándar industria: Trello/Jira top-aligned, Linear centrado solo en
  // columnas fullscreen. Para Zenix kanban (columnas dentro del page flow),
  // top-aligned cumple NN/g H1 — visibility of system status sin scroll.
  return (
    <div className="flex flex-col items-center text-center select-none pt-8 pb-4 px-2">
      <div className="text-3xl mb-2 opacity-60 leading-none">{m.icon}</div>
      <p className="text-xs font-medium text-gray-500">{m.line1}</p>
      {m.line2 && <p className="text-[10px] text-gray-400 mt-0.5">{m.line2}</p>}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
/**
 * FilterChip — quick filter clickable con count integrado (Linear/Jira pattern).
 * - active = relleno con tone
 * - inactive = outline gris
 * - count siempre visible para no obligar al user a probar el filtro
 */
function FilterChip({
  active,
  onClick,
  label,
  count,
  tone,
  disabled,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  tone: 'gray' | 'red' | 'emerald' | 'blue'
  disabled?: boolean
}) {
  // Pixel-perfect: ambos toneActive y toneInactive incluyen border-{color}
  // → height idéntico (1px+1px = 2px) sea cual sea el estado.
  const toneActive = {
    gray:    'bg-gray-900 text-white border-gray-900',
    red:     'bg-red-600 text-white border-red-600',
    emerald: 'bg-emerald-600 text-white border-emerald-600',
    blue:    'bg-blue-600 text-white border-blue-600',
  }[tone]
  const toneInactive = {
    gray:    'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
    red:     'bg-white text-red-700 border-red-200 hover:bg-red-50',
    emerald: 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50',
    blue:    'bg-white text-blue-700 border-blue-200 hover:bg-blue-50',
  }[tone]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${active ? toneActive : toneInactive}`}
    >
      <span>{label}</span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-gray-100 text-gray-600'}`}>
        {count}
      </span>
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────────
/**
 * KeyboardShortcutsModal — atajos del kanban (Linear pattern — `?` siempre).
 * Aparece al pulsar `?` o al hacer click en el hint del header.
 */
function KeyboardShortcutsModal({ onClose }: { onClose: () => void }) {
  const shortcuts: Array<{ key: string; desc: string }> = [
    { key: '?',       desc: 'Mostrar/ocultar este panel' },
    { key: '/',       desc: 'Buscar habitación (próximamente)' },
    { key: 'Esc',     desc: 'Cerrar modal o panel activo' },
    { key: 'A',       desc: 'Crear tarea ad-hoc (próximamente)' },
    { key: '1—4',     desc: 'Cambiar filtro: Todas / Urgente / Mías / Estadía (próx.)' },
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">⌨️ Atajos de teclado</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-2">
          {shortcuts.map((s) => (
            <div key={s.key} className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{s.desc}</span>
              <kbd className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono border border-gray-300">{s.key}</kbd>
            </div>
          ))}
          <p className="text-[11px] text-gray-400 pt-3 border-t border-gray-100 mt-3">
            Más atajos próximamente — Sprint Mx-2.
          </p>
        </div>
      </div>
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
  isMenuOpen,
  onToggleMenu,
  onCloseMenu,
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
  // Menú contextual ⋮ — controlled state desde el padre KanbanPage
  // para que solo UN menú esté abierto a la vez en todo el board.
  isMenuOpen: boolean
  onToggleMenu: () => void
  onCloseMenu: () => void
}) {
  const room = task.unit?.room
  const isUrgent = task.priority === Priority.URGENT
  const isPaused = task.status === CleaningStatus.PAUSED
  const isUnassigned = task.status === CleaningStatus.UNASSIGNED
  const isDone = task.status === CleaningStatus.DONE
  const isPending = task.status === CleaningStatus.PENDING
  const isStayover = task.taskType === 'STAYOVER'

  const elapsed = useElapsed(task)


  // Modern card design — Linear/Notion/Stripe Dashboard 2024 patterns:
  //   - bg-white sin border (sólo color del leftBorder + shadow elegante)
  //   - shadow-sm baseline → hover:shadow-md (microinteraction Apple HIG)
  //   - transition-all 150ms — feel instantáneo
  //   - p-3 padding más generoso (Tufte: whitespace = legibilidad)
  //   - rounded-lg (8px) — moderno sin ser excesivo
  //   - hover:-translate-y-0.5 elevación sutil al pasar el mouse (Material 3)
  //   - Card aging (Trello signature): >2h en columna no-terminal → tinte
  //     amber, comunica "atascada" sin requerir lectura.
  // Pixel-perfect (Sprint 9 final audit):
  //   - SIEMPRE border-l-4 (transparent si no aplica) → sin shift horizontal
  //   - Kebab inline en header flex → alineación pixel-perfect con título
  const priorityMeta = task.priority ? PRIORITY_BADGE[task.priority] : null
  const showOptionsMenu = !isDone && task.status !== CleaningStatus.VERIFIED
  const aged = isAged(task)
  const agingBg = aged ? 'bg-amber-50' : 'bg-white'

  // Border izquierdo SIEMPRE 4px — color por contexto:
  //   URGENT (rojo) > STAYOVER (azul) > default (transparent)
  // Mantiene cards alineadas en X independiente del color.
  const leftBorderColor = isUrgent
    ? 'border-l-red-500'
    : isStayover
      ? 'border-l-blue-400'
      : 'border-l-transparent'

  const ctx = getTaskContext(task)
  const showFooter = !isUnassigned && (task.assignedTo || elapsed)

  return (
    <div
      className={`relative ${agingBg} rounded-lg border-l-4 ${leftBorderColor} p-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 group space-y-2.5`}
      title={aged ? `Esta tarea lleva más de 2h en ${task.status} — revisa con el housekeeper` : undefined}
    >
      {/* ─── ZONA 1 — IDENTITY ──────────────────────────────────────────
          Title block: número de habitación + contexto inline.
          Patrón Linear/Trello: title prominente forma bloque visual con
          su metadata descriptiva (separación interna 4px, no 8px).
          Apple HIG: jerarquía clara — el título domina (text-base bold),
          la descripción es subordinada (text-[11px] color semántico).
          NN/g visual hierarchy: peso visual proporcional a importancia. */}
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="font-bold text-gray-900 text-base leading-tight flex items-baseline gap-1.5 min-w-0 flex-1">
            <span className="truncate">Hab. {room?.number ?? '—'}</span>
            {task.unit?.label && task.unit.label !== `Hab. ${room?.number}` && task.unit.label !== room?.number && (
              <span className="text-gray-400 font-normal text-xs truncate">· {task.unit.label}</span>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {priorityMeta && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${priorityMeta.className}`}>
                {priorityMeta.label}
              </span>
            )}
            {showOptionsMenu && (
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleMenu() }}
                  className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                    isMenuOpen
                      ? 'text-gray-700 bg-gray-100'
                      : 'text-gray-300 group-hover:text-gray-500 hover:!text-gray-700 hover:!bg-gray-100'
                  }`}
                  title="Más opciones"
                  aria-label="Opciones de la tarea"
                  aria-expanded={isMenuOpen}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="3" r="1.5" />
                    <circle cx="8" cy="8" r="1.5" />
                    <circle cx="8" cy="13" r="1.5" />
                  </svg>
                </button>
                {isMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={onCloseMenu} />
                    <div className="absolute right-0 top-7 z-20 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[180px] py-1">
                      {!isUrgent && (
                        <button
                          onClick={() => { onCloseMenu(); onForceUrgent() }}
                          className="w-full text-left px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 font-medium"
                        >
                          🔴 Forzar URGENTE
                        </button>
                      )}
                      <button
                        onClick={() => { onCloseMenu(); onToggleDeepClean() }}
                        className="w-full text-left px-3 py-1.5 text-xs text-purple-700 hover:bg-purple-50 font-medium"
                      >
                        ✨ Limpieza profunda
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Context inline — explica el ORIGEN de la tarea hoy.
            Ya NO es un chip con caja: es metadata inline (Linear pattern).
            Resuelve confusión "204 está en kanban pero no en calendario hoy". */}
        <div className={`text-[11px] font-medium flex items-center gap-1 ${CONTEXT_TONE[ctx.tone]}`} title={ctx.label}>
          <span aria-hidden className="text-xs leading-none">{ctx.icon}</span>
          <span className="truncate">{ctx.label}</span>
        </div>
      </div>

      {/* ─── ZONA 2 — ACTION (condicional) ──────────────────────────────
          Solo aparece cuando el supervisor tiene una decisión que tomar:
            UNASSIGNED → assign select (acción primaria del estado)
            PENDING    → confirmar salida (Fase 2)
            DONE       → verify / reject (AHLEI 4.4)
          Apple HIG: action zone separada de identity por espaciado.       */}

      {isUnassigned && (
        <select
          defaultValue=""
          onChange={(e) => { if (e.target.value) onAssign(e.target.value) }}
          disabled={isAssigning}
          className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white font-medium"
        >
          <option value="" disabled>
            {isAssigning ? 'Asignando...' : '👤 Asignar housekeeper…'}
          </option>
          {housekeepers.map((h) => (
            <option key={h.id} value={h.id}>{h.name}</option>
          ))}
        </select>
      )}

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

      {/* ─── ZONA 3 — FOOTER METADATA ───────────────────────────────────
          Assignee + elapsed agrupados en una sola línea (Linear/Trello/Jira).
          Gestalt proximity: ambos son metadata pasiva (lectura, no acción)
          → forman un bloque visual único.
          Patrón: avatar+nombre a la izq, tiempo a la derecha.
          Solo se renderiza si hay algo que mostrar (no UNASSIGNED).        */}
      {showFooter && (
        <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-gray-100">
          {/* Assignee (izquierda) */}
          {task.assignedTo ? (
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <Avatar name={task.assignedTo.name} size="xs" />
              <span className="text-[11px] text-gray-600 truncate">{task.assignedTo.name}</span>
            </div>
          ) : (
            <span aria-hidden className="flex-1" />
          )}

          {/* Elapsed (derecha) — color según estado.
              Pixel-perfect: leading-none + emoji ⚠ wrapper para evitar
              baseline shift entre emoji nativo (16px) y texto (11px). */}
          {elapsed && (
            <span className={`text-[11px] flex items-center gap-1 leading-none flex-shrink-0 ${
              aged ? 'text-amber-700 font-medium' : isPaused ? 'text-amber-600' : 'text-gray-400'
            }`}>
              {aged && (
                <span className="text-xs leading-none" title="Más de 2h en este estado" aria-label="Atascada">
                  ⚠️
                </span>
              )}
              <span>{isPaused ? '⏸ ' : ''}{elapsed}</span>
            </span>
          )}
        </div>
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
  const [reasonError, setReasonError] = useState<string | null>(null)
  const { shakeClass, trigger: triggerShake } = useShakeOnInvalid()
  const trimmed = reason.trim()

  const rejectMut = useMutation({
    mutationFn: () => api.post(`/tasks/${taskId}/reject`, { reason: trimmed }),
    onSuccess: onRejected,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo rechazar la tarea'),
  })

  // §60 D19: validate-on-click.
  function handleReject() {
    if (rejectMut.isPending) return
    if (trimmed.length < 5) {
      setReasonError('Escribe al menos 5 caracteres explicando el motivo.')
      triggerShake()
      return
    }
    setReasonError(null)
    rejectMut.mutate()
  }

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
            <div className={shakeClass}>
              <textarea
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  if (reasonError) setReasonError(null)
                }}
                placeholder="Ej. Baño con agua acumulada, sábanas mal puestas, polvo en ventanas..."
                rows={4}
                autoFocus
                className={`w-full text-sm border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-red-200 ${
                  reasonError ? 'border-red-400' : 'border-gray-300'
                }`}
              />
            </div>
            {reasonError ? (
              <p className="text-[11px] text-red-600 mt-1">{reasonError}</p>
            ) : (
              <p className="text-[11px] text-gray-500 mt-1">{trimmed.length}/300</p>
            )}
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
            onClick={handleReject}
            disabled={rejectMut.isPending}
            className="text-sm px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {rejectMut.isPending ? 'Rechazando...' : '🔄 Rechazar limpieza'}
          </button>
        </div>
      </div>
    </div>
  )
}
