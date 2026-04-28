/**
 * BlocksPage — Gestión centralizada de bloqueos de camas/habitaciones.
 *
 * Dos modos:
 *  📥 Inbox    — bloqueos accionables (PENDING_APPROVAL, APPROVED, ACTIVE).
 *                Acciones inline visibles sin expandir. Default para supervisores.
 *  📋 Historial — todos los bloqueos con filtro por estado. Para auditoría.
 *
 * Decisiones de diseño:
 *  - Acciones inline en la card (no detrás de un accordion) — Ley de Hick-Hyman.
 *  - Contadores en tabs para comunicar urgencia sin leer texto.
 *  - Duración en noches calculada de startDate/endDate.
 *  - Semántica (tipo) y estado son dimensiones visuales distintas.
 *  - Sort: PENDING_APPROVAL primero, luego por startDate desc.
 *  - Color de acción principal: emerald (paleta Zenix), no indigo.
 */
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { differenceInCalendarDays, formatDistanceToNow, parseISO, format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import {
  BlockSemantic,
  BlockStatus,
  BlockReason,
  HousekeepingRole,
  type RoomBlockDto,
  type CreateBlockDto,
} from '@zenix/shared'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import { useSSE } from '../hooks/useSSE'
import { BlockModal } from '../components/blocks/BlockModal'

// ─── Labels ──────────────────────────────────────────────────────────────────

export const SEMANTIC_LABELS: Record<BlockSemantic, string> = {
  [BlockSemantic.OUT_OF_SERVICE]:   'Fuera de servicio',
  [BlockSemantic.OUT_OF_ORDER]:     'Fuera de orden',
  [BlockSemantic.OUT_OF_INVENTORY]: 'Fuera de inventario',
  [BlockSemantic.HOUSE_USE]:        'Uso interno',
}

export const REASON_LABELS: Record<BlockReason, string> = {
  [BlockReason.MAINTENANCE]:   'Mantenimiento',
  [BlockReason.DEEP_CLEANING]: 'Limpieza profunda',
  [BlockReason.INSPECTION]:    'Inspección',
  [BlockReason.PHOTOGRAPHY]:   'Fotografía / Marketing',
  [BlockReason.VIP_SETUP]:     'Preparación VIP',
  [BlockReason.PEST_CONTROL]:  'Control de plagas',
  [BlockReason.WATER_DAMAGE]:  'Daño por agua',
  [BlockReason.ELECTRICAL]:    'Eléctrico',
  [BlockReason.PLUMBING]:      'Plomería',
  [BlockReason.STRUCTURAL]:    'Daño estructural',
  [BlockReason.RENOVATION]:    'Remodelación',
  [BlockReason.OWNER_STAY]:    'Estancia del propietario',
  [BlockReason.STAFF_USE]:     'Uso de personal',
  [BlockReason.OTHER]:         'Otro',
}

const ROLE_LABELS: Record<string, string> = {
  [HousekeepingRole.RECEPTIONIST]: 'Recepción',
  [HousekeepingRole.SUPERVISOR]:   'Supervisor',
  [HousekeepingRole.HOUSEKEEPER]:  'Housekeeping',
}

const STATUS_LABELS: Record<BlockStatus, string> = {
  [BlockStatus.PENDING_APPROVAL]: 'Pendiente',
  [BlockStatus.APPROVED]:         'Aprobado',
  [BlockStatus.ACTIVE]:           'Activo',
  [BlockStatus.EXPIRED]:          'Expirado',
  [BlockStatus.CANCELLED]:        'Cancelado',
  [BlockStatus.REJECTED]:         'Rechazado',
}

// ─── Color tokens ─────────────────────────────────────────────────────────────

const SEMANTIC_COLORS: Record<BlockSemantic, { bar: string; badge: string; badgeText: string }> = {
  [BlockSemantic.OUT_OF_SERVICE]:   { bar: 'bg-amber-400',  badge: 'bg-amber-50',  badgeText: 'text-amber-800' },
  [BlockSemantic.OUT_OF_ORDER]:     { bar: 'bg-red-500',    badge: 'bg-red-50',    badgeText: 'text-red-800'   },
  [BlockSemantic.OUT_OF_INVENTORY]: { bar: 'bg-blue-500',   badge: 'bg-blue-50',   badgeText: 'text-blue-800'  },
  [BlockSemantic.HOUSE_USE]:        { bar: 'bg-violet-400', badge: 'bg-violet-50', badgeText: 'text-violet-800'},
}

const STATUS_COLORS: Record<BlockStatus, string> = {
  [BlockStatus.PENDING_APPROVAL]: 'text-amber-700 bg-amber-50 ring-amber-200',
  [BlockStatus.APPROVED]:         'text-sky-700 bg-sky-50 ring-sky-200',
  [BlockStatus.ACTIVE]:           'text-emerald-700 bg-emerald-50 ring-emerald-200',
  [BlockStatus.EXPIRED]:          'text-gray-500 bg-gray-50 ring-gray-200',
  [BlockStatus.CANCELLED]:        'text-gray-400 bg-gray-50 ring-gray-200',
  [BlockStatus.REJECTED]:         'text-red-600 bg-red-50 ring-red-200',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function blockLocation(b: RoomBlockDto): string {
  if (b.unitId) return `Cama ${(b as any).unit?.label ?? '—'}`
  return `Hab. ${(b as any).room?.number ?? '—'}`
}

function blockNights(b: RoomBlockDto): string {
  if (!b.endDate) return '∞ indefinido'
  const n = differenceInCalendarDays(parseISO(b.endDate), parseISO(b.startDate))
  return n === 1 ? '1 noche' : `${n} noches`
}

function blockDateRange(b: RoomBlockDto): string {
  const start = format(parseISO(b.startDate), 'd MMM', { locale: es })
  const end = b.endDate ? format(parseISO(b.endDate), 'd MMM', { locale: es }) : '∞'
  return `${start} → ${end}`
}

// Sort order for inbox: PENDING first, then ACTIVE, then APPROVED; each group by startDate asc
const STATUS_SORT: Record<BlockStatus, number> = {
  [BlockStatus.PENDING_APPROVAL]: 0,
  [BlockStatus.ACTIVE]:           1,
  [BlockStatus.APPROVED]:         2,
  [BlockStatus.REJECTED]:         3,
  [BlockStatus.EXPIRED]:          4,
  [BlockStatus.CANCELLED]:        5,
}

// ─── BlockCard ────────────────────────────────────────────────────────────────

function BlockCard({
  block,
  isSupervisor,
  onApprove,
  onReject,
  onCancel,
  onRelease,
  working,
}: {
  block: RoomBlockDto
  isSupervisor: boolean
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onCancel: (id: string) => void
  onRelease: (id: string) => void
  working: boolean
}) {
  const [showLogs, setShowLogs] = useState(false)
  const sem = SEMANTIC_COLORS[block.semantic]
  const isPending = block.status === BlockStatus.PENDING_APPROVAL
  const isActive  = block.status === BlockStatus.ACTIVE
  const isApproved = block.status === BlockStatus.APPROVED
  const canAct = isPending || isActive || isApproved

  const requester = (block as any).requestedBy
  const requesterLabel = requester
    ? `${requester.name}${requester.role ? ` · ${ROLE_LABELS[requester.role] ?? requester.role}` : ''}`
    : '—'

  const createdAgo = formatDistanceToNow(parseISO(block.createdAt), { addSuffix: true, locale: es })

  const logs: any[] = (block as any).logs ?? []

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden ${isPending ? 'ring-1 ring-amber-300' : ''}`}>
      {/* Accent bar + body */}
      <div className="flex">
        {/* Semantic accent bar */}
        <div className={`w-1 shrink-0 ${sem.bar}`} />

        <div className="flex-1 min-w-0 px-4 py-3">
          {/* Row 1: location + badges */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="font-semibold text-sm text-gray-900">{blockLocation(block)}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${sem.badge} ${sem.badgeText}`}>
                {SEMANTIC_LABELS[block.semantic]}
              </span>
              {/* Status — solo si no es ACTIVE (el bar ya comunica actividad) */}
              {block.status !== BlockStatus.ACTIVE && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ring-1 ${STATUS_COLORS[block.status]}`}>
                  {STATUS_LABELS[block.status]}
                </span>
              )}
            </div>
            {/* Urgency indicator */}
            {isPending && isSupervisor && (
              <span className="shrink-0 text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded animate-pulse">
                Requiere acción
              </span>
            )}
          </div>

          {/* Row 2: reason + duration + dates */}
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 flex-wrap">
            <span className="font-medium text-gray-700">{REASON_LABELS[block.reason]}</span>
            <span className="text-gray-300">·</span>
            <span className="font-mono">{blockDateRange(block)}</span>
            <span className="text-gray-300">·</span>
            <span className="font-medium">{blockNights(block)}</span>
          </div>

          {/* Row 3: requester + timestamp */}
          <div className="mt-0.5 text-xs text-gray-400">
            {requesterLabel} · {createdAgo}
          </div>

          {/* Notes (if present) */}
          {block.notes && (
            <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5 italic">
              "{block.notes}"
            </div>
          )}

          {/* Inline actions */}
          {canAct && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {isPending && isSupervisor && (
                <>
                  <button
                    disabled={working}
                    onClick={() => onApprove(block.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    ✓ Aprobar
                  </button>
                  <button
                    disabled={working}
                    onClick={() => onReject(block.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-red-300 text-red-600 rounded-md text-xs font-semibold hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    ✕ Rechazar
                  </button>
                </>
              )}
              {isActive && isSupervisor && (
                <button
                  disabled={working}
                  onClick={() => onRelease(block.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-amber-300 text-amber-700 rounded-md text-xs font-semibold hover:bg-amber-50 disabled:opacity-50 transition-colors"
                >
                  🔓 Liberar
                </button>
              )}
              {(isSupervisor || isPending) && canAct && (
                <button
                  disabled={working}
                  onClick={() => onCancel(block.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 text-gray-500 rounded-md text-xs font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  Cancelar
                </button>
              )}
            </div>
          )}

          {/* Log toggle */}
          {logs.length > 0 && (
            <button
              onClick={() => setShowLogs((p) => !p)}
              className="mt-2 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              {showLogs ? '▾ Ocultar historial' : `▸ Ver historial (${logs.length})`}
            </button>
          )}

          {/* Log list */}
          {showLogs && (
            <ul className="mt-2 space-y-1 border-t border-gray-100 pt-2">
              {logs.map((log: any) => (
                <li key={log.id} className="text-[11px] text-gray-500 flex gap-2">
                  <span className="text-gray-300 whitespace-nowrap font-mono">
                    {format(parseISO(log.createdAt), 'dd/MM HH:mm')}
                  </span>
                  <span className="font-medium text-gray-600">{log.event}</span>
                  {log.staff && <span>por {log.staff.name}</span>}
                  {log.note && <span className="italic">— {log.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── BlocksPage ───────────────────────────────────────────────────────────────

type PageMode = 'inbox' | 'history'

const INBOX_STATUSES = new Set([BlockStatus.PENDING_APPROVAL, BlockStatus.APPROVED, BlockStatus.ACTIVE])

export function BlocksPage() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const isSupervisor = user?.role === HousekeepingRole.SUPERVISOR

  const [mode, setMode] = useState<PageMode>(isSupervisor ? 'inbox' : 'history')
  const [historyFilter, setHistoryFilter] = useState<BlockStatus | 'all'>('all')
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Fetch all blocks — filter client-side for counts and modes
  const { data: blocks = [], isLoading } = useQuery<RoomBlockDto[]>({
    queryKey: ['blocks', 'all'],
    queryFn: () => api.get<RoomBlockDto[]>('/blocks'),
    staleTime: 30_000,
  })

  useSSE((event) => {
    if (event.type.startsWith('block:')) qc.invalidateQueries({ queryKey: ['blocks'] })
  })

  // ── Mutations ────────────────────────────────────────────────────────────────
  const approveMut = useMutation({
    mutationFn: (id: string) => api.post(`/blocks/${id}/approve`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['blocks'] }); toast.success('Bloqueo aprobado') },
    onError: (e: any) => toast.error(e?.message ?? 'Error al aprobar'),
  })
  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/blocks/${id}/reject`, { approvalNotes: reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['blocks'] }); toast.success('Bloqueo rechazado') },
    onError: (e: any) => toast.error(e?.message ?? 'Error al rechazar'),
  })
  const cancelMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/blocks/${id}/cancel`, { reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['blocks'] }); toast.success('Bloqueo cancelado') },
    onError: (e: any) => toast.error(e?.message ?? 'Error al cancelar'),
  })
  const releaseMut = useMutation({
    mutationFn: (id: string) => api.post(`/blocks/${id}/release`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['blocks'] }); toast.success('Habitación liberada') },
    onError: (e: any) => toast.error(e?.message ?? 'Error al liberar'),
  })
  const createMut = useMutation({
    mutationFn: (dto: CreateBlockDto) => api.post('/blocks', dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['blocks'] }); toast.success('Bloqueo creado') },
    onError: (e: any) => toast.error(e?.message ?? 'Error al crear bloqueo'),
  })

  const working = approveMut.isPending || rejectMut.isPending || cancelMut.isPending || releaseMut.isPending

  const handleApprove = (id: string) => {
    if (!confirm('¿Aprobar este bloqueo?')) return
    approveMut.mutate(id)
  }
  const handleReject = (id: string) => {
    const reason = prompt('Motivo de rechazo (obligatorio):')
    if (!reason?.trim()) return
    rejectMut.mutate({ id, reason })
  }
  const handleCancel = (id: string) => {
    const reason = prompt('Motivo de cancelación:')
    if (!reason?.trim()) return
    cancelMut.mutate({ id, reason })
  }
  const handleRelease = (id: string) => {
    if (!confirm('¿Liberar anticipadamente? La habitación volverá a estar disponible.')) return
    releaseMut.mutate(id)
  }

  // ── Derived data ──────────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c: Partial<Record<BlockStatus | 'inbox', number>> = { inbox: 0 }
    for (const b of blocks) {
      c[b.status] = (c[b.status] ?? 0) + 1
      if (INBOX_STATUSES.has(b.status)) c.inbox = (c.inbox ?? 0) + 1
    }
    return c
  }, [blocks])

  const inboxBlocks = useMemo(() =>
    blocks
      .filter((b) => INBOX_STATUSES.has(b.status))
      .sort((a, b) => STATUS_SORT[a.status] - STATUS_SORT[b.status] || parseISO(b.startDate).getTime() - parseISO(a.startDate).getTime()),
  [blocks])

  const historyBlocks = useMemo(() => {
    const filtered = historyFilter === 'all' ? blocks : blocks.filter((b) => b.status === historyFilter)
    return [...filtered].sort((a, b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime())
  }, [blocks, historyFilter])

  const cardProps = { isSupervisor, onApprove: handleApprove, onReject: handleReject, onCancel: handleCancel, onRelease: handleRelease, working }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Bloqueos</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-sm"
        >
          + Nuevo bloqueo
        </button>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: 'inbox',   label: 'Inbox',    count: counts.inbox },
          { key: 'history', label: 'Historial', count: blocks.length },
        ] as const).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={[
              'relative px-4 py-2.5 text-sm font-medium transition-colors',
              mode === key
                ? 'text-gray-900 border-b-2 border-gray-900 -mb-px'
                : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {label}
            {count !== undefined && count > 0 && (
              <span className={[
                'ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold',
                mode === key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600',
                key === 'inbox' && (counts[BlockStatus.PENDING_APPROVAL] ?? 0) > 0 ? '!bg-amber-500 !text-white' : '',
              ].join(' ')}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="text-center text-gray-400 py-16">Cargando bloqueos…</div>
      )}

      {/* ── INBOX ── */}
      {!isLoading && mode === 'inbox' && (
        <>
          {inboxBlocks.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-medium text-gray-500">Sin bloqueos activos</p>
              <p className="text-sm">Todas las habitaciones están disponibles</p>
            </div>
          ) : (
            <div className="space-y-2">
              {inboxBlocks.map((b) => (
                <BlockCard key={b.id} block={b} {...cardProps} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── HISTORIAL ── */}
      {!isLoading && mode === 'history' && (
        <>
          {/* Status filter tabs */}
          <div className="flex gap-1.5 flex-wrap">
            {([
              { value: 'all',                       label: 'Todos' },
              { value: BlockStatus.PENDING_APPROVAL, label: 'Pendiente' },
              { value: BlockStatus.ACTIVE,           label: 'Activo' },
              { value: BlockStatus.APPROVED,         label: 'Aprobado' },
              { value: BlockStatus.EXPIRED,          label: 'Expirado' },
              { value: BlockStatus.CANCELLED,        label: 'Cancelado' },
              { value: BlockStatus.REJECTED,         label: 'Rechazado' },
            ] as const).map(({ value, label }) => {
              const cnt = value === 'all' ? blocks.length : (counts[value as BlockStatus] ?? 0)
              const active = historyFilter === value
              return (
                <button
                  key={value}
                  onClick={() => setHistoryFilter(value)}
                  className={[
                    'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    active
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                  ].join(' ')}
                >
                  {label}
                  {cnt > 0 && (
                    <span className={`ml-1.5 ${active ? 'text-gray-300' : 'text-gray-400'}`}>
                      {cnt}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {historyBlocks.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">Sin registros para este filtro</p>
            </div>
          ) : (
            <div className="space-y-2">
              {historyBlocks.map((b) => (
                <BlockCard key={b.id} block={b} {...cardProps} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal creación */}
      <BlockModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={async (dto) => {
          await createMut.mutateAsync(dto)
          setIsModalOpen(false)
        }}
      />
    </div>
  )
}
