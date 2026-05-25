/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 10.
 *
 * Reemplaza el placeholder `/nova/channex` con el primer frame del
 * Command Center real. 3 tabs base + stubs para Days 11-13.
 *
 * Tabs:
 *   - Status        — overview de outbox queue + webhook activity + full sync.
 *                     Pull de GET /v1/admin/channex/status/:propertyId.
 *   - Room Types    — CRUD wired contra Day 5 endpoints (list + create + delete).
 *   - Rate Plans    — CRUD wired contra Day 5 endpoints.
 *   - Rate Calendar — placeholder Day 11.
 *   - Restrictions  — placeholder Day 13.
 *   - Channels      — placeholder Day 13.
 *   - Mappings      — placeholder Day 13.
 *
 * Property picker en header: el consultor cambia entre properties del cliente.
 * Persiste selección en localStorage scoped por acting org.
 *
 * Decisión destructive actions (per decision-matrix doc 2026-05-24):
 *   - Delete Room Type / Rate Plan → ConfirmDialog tone='destructive' simple.
 *     No type-to-confirm — son acciones de configuración recreable.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Cable,
  Building2,
  Plus,
  Trash2,
  RefreshCw,
  CircleAlert,
  CircleCheck,
  CircleDashed,
} from 'lucide-react'
import { NovaShell } from '../NovaShell'
import { useNovaStore } from '../../store/nova'
import { ConfirmDialog } from '../../modules/rooms/components/shared/ConfirmDialog'
import type { ReactNode } from 'react'
import {
  listPropertiesOfActingOrg,
  getChannexStatus,
  listRoomTypes,
  createRoomType,
  deleteRoomType,
  listRatePlans,
  createRatePlan,
  deleteRatePlan,
  type PropertyRow,
  type ChannexStatusOverview,
  type ChannexRoomTypeRow,
  type ChannexRatePlanRow,
} from '../../api/nova'

type TabKey = 'status' | 'room-types' | 'rate-plans' | 'rate-calendar' | 'restrictions' | 'channels' | 'mappings'

const TABS: { key: TabKey; label: string; badge?: string }[] = [
  { key: 'status', label: 'Status' },
  { key: 'room-types', label: 'Room Types' },
  { key: 'rate-plans', label: 'Rate Plans' },
  { key: 'rate-calendar', label: 'Rate Calendar', badge: 'Day 11' },
  { key: 'restrictions', label: 'Restrictions', badge: 'Day 13' },
  { key: 'channels', label: 'Channels', badge: 'Day 13' },
  { key: 'mappings', label: 'Mappings', badge: 'Day 13' },
]

// ── Helper: persist selected propertyId per acting org ─────────────────────

function propertyStorageKey(orgId: string): string {
  return `nova_channex_selected_property:${orgId}`
}

function loadSelectedProperty(orgId: string | null): string | null {
  if (!orgId) return null
  try {
    return localStorage.getItem(propertyStorageKey(orgId))
  } catch {
    return null
  }
}

function persistSelectedProperty(orgId: string | null, propertyId: string | null): void {
  if (!orgId) return
  try {
    if (propertyId) {
      localStorage.setItem(propertyStorageKey(orgId), propertyId)
    } else {
      localStorage.removeItem(propertyStorageKey(orgId))
    }
  } catch {
    /* noop — quota or disabled storage */
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main page
// ═══════════════════════════════════════════════════════════════════════════

export function NovaChannexPage() {
  const actingOrgId = useNovaStore((s) => s.actingOrgId)
  const actingOrgName = useNovaStore((s) => s.actingOrgName)
  const [activeTab, setActiveTab] = useState<TabKey>('status')
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(() =>
    loadSelectedProperty(actingOrgId),
  )

  const { data: properties = [], isLoading: loadingProps } = useQuery<PropertyRow[]>({
    queryKey: ['nova', 'properties', actingOrgId],
    queryFn: listPropertiesOfActingOrg,
    enabled: !!actingOrgId,
    staleTime: 60_000,
  })

  // Auto-select first property si no hay selección persisted aún
  useEffect(() => {
    if (!selectedPropertyId && properties.length > 0) {
      const first = properties[0].id
      setSelectedPropertyId(first)
      persistSelectedProperty(actingOrgId, first)
    }
  }, [properties, selectedPropertyId, actingOrgId])

  // Re-cargar selection al cambiar org (otro cliente puede tener su propio default)
  useEffect(() => {
    const stored = loadSelectedProperty(actingOrgId)
    setSelectedPropertyId(stored)
  }, [actingOrgId])

  const onSelectProperty = (id: string) => {
    setSelectedPropertyId(id)
    persistSelectedProperty(actingOrgId, id)
  }

  // ── Guards ──────────────────────────────────────────────────────────────

  if (!actingOrgId) {
    return (
      <NovaShell title="Channex Command Center">
        <NoOrgState />
      </NovaShell>
    )
  }

  return (
    <NovaShell title="Channex Command Center">
      <div className="space-y-4">
        {/* Header: property picker + summary */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div>
            <h2 className="text-[16px] font-semibold text-slate-900 flex items-center gap-2">
              <Cable className="h-4 w-4 text-emerald-600" />
              Channex Command Center
            </h2>
            <p className="text-[12px] text-slate-600 mt-0.5">
              Cliente: <span className="font-medium text-slate-900">{actingOrgName}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={selectedPropertyId ?? ''}
              onChange={(e) => onSelectProperty(e.target.value)}
              disabled={loadingProps || properties.length === 0}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 disabled:opacity-50"
            >
              {loadingProps && <option>Cargando properties...</option>}
              {!loadingProps && properties.length === 0 && (
                <option>Sin properties</option>
              )}
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200">
          <nav className="flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={
                  'flex-shrink-0 px-3 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px ' +
                  (activeTab === t.key
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900')
                }
              >
                <span className="inline-flex items-center gap-1.5">
                  {t.label}
                  {t.badge && (
                    <span className="text-[9px] uppercase tracking-wide bg-slate-100 text-slate-500 rounded px-1 py-0.5">
                      {t.badge}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </nav>
        </div>

        {/* Body */}
        {!selectedPropertyId ? (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
            <Building2 className="h-8 w-8 text-slate-300 mx-auto" />
            <div className="mt-2 text-[13px] text-slate-600">Selecciona una property arriba.</div>
          </div>
        ) : (
          <>
            {activeTab === 'status' && <StatusTab propertyId={selectedPropertyId} />}
            {activeTab === 'room-types' && <RoomTypesTab propertyId={selectedPropertyId} />}
            {activeTab === 'rate-plans' && <RatePlansTab propertyId={selectedPropertyId} />}
            {(activeTab === 'rate-calendar' ||
              activeTab === 'restrictions' ||
              activeTab === 'channels' ||
              activeTab === 'mappings') && <ComingSoonTab tab={activeTab} />}
          </>
        )}
      </div>
    </NovaShell>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab: Status
// ═══════════════════════════════════════════════════════════════════════════

function StatusTab({ propertyId }: { propertyId: string }) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<ChannexStatusOverview>({
    queryKey: ['nova', 'channex', 'status', propertyId],
    queryFn: () => getChannexStatus(propertyId),
    refetchInterval: 30_000, // auto-refresh 30s
  })

  if (isLoading) return <SkeletonCard />

  if (isError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-5">
        <div className="flex items-center gap-2 text-red-800 font-semibold text-[13px]">
          <CircleAlert className="h-4 w-4" />
          No se pudo cargar el status
        </div>
        <p className="text-[12px] text-red-700 mt-1">
          Verifica que el property tiene channexPropertyId configurado en settings.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-3 text-[12px] text-red-700 hover:text-red-900 font-medium underline"
        >
          Reintentar
        </button>
      </div>
    )
  }

  const status = data ?? ({} as ChannexStatusOverview)
  const queue = status.outboxQueueDepth ?? []
  const totalPending = queue
    .filter((q) => q.status === 'PENDING' || q.status === 'IN_PROGRESS')
    .reduce((sum, q) => sum + q.count, 0)
  const totalDeadLetter = status.deadLetterCount ?? 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end text-[11px] text-slate-500">
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors"
        >
          <RefreshCw className={'h-3 w-3 ' + (isFetching ? 'animate-spin' : '')} />
          Auto-refresh 30s · refresh now
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="En cola"
          value={totalPending}
          hint="PENDING + IN_PROGRESS"
          tone={totalPending > 100 ? 'amber' : 'emerald'}
        />
        <StatCard
          label="DEAD_LETTER"
          value={totalDeadLetter}
          hint="Acción requerida"
          tone={totalDeadLetter > 0 ? 'red' : 'emerald'}
        />
        <StatCard
          label="Webhooks 24h"
          value={status.webhookCount24h ?? 0}
          hint={
            status.webhookLastReceivedAt
              ? `Último: ${relativeTime(status.webhookLastReceivedAt)}`
              : 'Sin webhooks recientes'
          }
          tone="slate"
        />
        <StatCard
          label="Próximo full-sync"
          value={status.fullSyncNextEligibleAt ? relativeTime(status.fullSyncNextEligibleAt) : '—'}
          hint={
            status.fullSyncLastRunAt
              ? `Último: ${relativeTime(status.fullSyncLastRunAt)}`
              : 'Nunca ejecutado'
          }
          tone="slate"
        />
      </div>

      {/* Token bucket */}
      {(status.tokenBucketSnapshot?.length ?? 0) > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-600 mb-2">
            Rate limit headroom (TokenBucket)
          </h3>
          <ul className="space-y-2">
            {status.tokenBucketSnapshot!.map((b) => {
              const pct = Math.round((b.remaining / b.capacity) * 100)
              return (
                <li key={b.kind} className="flex items-center gap-3">
                  <span className="text-[12px] font-mono text-slate-700 min-w-[150px]">{b.kind}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={
                        'h-full transition-all ' +
                        (pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-500' : 'bg-red-500')
                      }
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] tabular-nums text-slate-600 min-w-[60px] text-right">
                    {b.remaining}/{b.capacity}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Queue breakdown */}
      {queue.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-600 mb-2">
            Outbox queue por status
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-slate-500 text-left">
                  <th className="py-1.5 pr-3 font-medium">Kind</th>
                  <th className="py-1.5 pr-3 font-medium">Status</th>
                  <th className="py-1.5 font-medium text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((q, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3 font-mono text-slate-700">{q.kind}</td>
                    <td className="py-1.5 pr-3">
                      <StatusPill status={q.status} />
                    </td>
                    <td className="py-1.5 text-right tabular-nums font-medium">{q.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {totalDeadLetter > 0 && (
        <Link
          to="/channex/conflicts"
          className="block bg-red-50 border border-red-200 rounded-xl p-4 hover:bg-red-100 transition-colors"
        >
          <div className="flex items-start gap-3">
            <CircleAlert className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-red-900">
                {totalDeadLetter} entries en DEAD_LETTER
              </div>
              <div className="text-[12px] text-red-700 mt-0.5">
                Requieren revisión manual (mapping, rate-limit fatal, credenciales).
                Click para abrir conflicts queue →
              </div>
            </div>
          </div>
        </Link>
      )}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
    IN_PROGRESS: 'bg-blue-50 text-blue-700 border-blue-200',
    SUCCEEDED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    FAILED: 'bg-red-50 text-red-700 border-red-200',
    DEAD_LETTER: 'bg-red-100 text-red-800 border-red-300 font-semibold',
    DEFERRED: 'bg-slate-100 text-slate-600 border-slate-200',
  }
  const cls = map[status] ?? 'bg-slate-50 text-slate-600 border-slate-200'
  return (
    <span className={`inline-flex items-center text-[10px] font-medium uppercase tracking-wide rounded-full border px-2 py-0.5 ${cls}`}>
      {status}
    </span>
  )
}

interface StatCardProps {
  label: string
  value: string | number
  hint?: string
  tone: 'emerald' | 'amber' | 'red' | 'slate'
}

function StatCard({ label, value, hint, tone }: StatCardProps) {
  const toneCls: Record<StatCardProps['tone'], string> = {
    emerald: 'border-emerald-200 bg-emerald-50/50',
    amber: 'border-amber-200 bg-amber-50/50',
    red: 'border-red-200 bg-red-50/50',
    slate: 'border-slate-200 bg-white',
  }
  return (
    <div className={'rounded-xl border p-3 ' + toneCls[tone]}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className="text-[20px] font-semibold text-slate-900 mt-1 leading-tight">{value}</div>
      {hint && <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab: Room Types
// ═══════════════════════════════════════════════════════════════════════════

interface PendingConfirm {
  title: string
  message: ReactNode
  confirmLabel: string
  onConfirm: () => void
}

function RoomTypesTab({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)

  const { data: roomTypes = [], isLoading, isError } = useQuery<ChannexRoomTypeRow[]>({
    queryKey: ['nova', 'channex', 'room-types', propertyId],
    queryFn: () => listRoomTypes(propertyId),
  })

  const createMut = useMutation({
    mutationFn: (input: Parameters<typeof createRoomType>[1]) => createRoomType(propertyId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nova', 'channex', 'room-types', propertyId] })
      setShowCreate(false)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (rt: ChannexRoomTypeRow) => deleteRoomType(propertyId, rt.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nova', 'channex', 'room-types', propertyId] })
    },
  })

  const handleDelete = (rt: ChannexRoomTypeRow) => {
    setPendingConfirm({
      title: `Eliminar room type "${rt.title}"`,
      message: (
        <div className="space-y-2 text-[12px] text-slate-700">
          <p>
            Esto desconecta el room type en Channex. Habitaciones Zenix mapeadas a este
            tipo quedarán sin destino OTA hasta re-mapearse.
          </p>
          <p className="text-slate-500">
            Si tiene rooms mapeadas en Zenix, el backend rechazará (re-intenta con force=true
            desde un endpoint admin, fuera de este flow).
          </p>
        </div>
      ),
      confirmLabel: 'Eliminar room type',
      onConfirm: () => deleteMut.mutate(rt),
    })
  }

  if (isLoading) return <SkeletonCard />
  if (isError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <p className="text-[13px] text-red-800">No se pudieron cargar los room types.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-slate-600">{roomTypes.length} room types en Channex</p>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-medium transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo room type
        </button>
      </div>

      {roomTypes.length === 0 && !showCreate && (
        <EmptyState
          message="Esta property no tiene room types en Channex."
          ctaLabel="Crear el primero"
          onCta={() => setShowCreate(true)}
        />
      )}

      {showCreate && (
        <CreateRoomTypeForm
          onCancel={() => setShowCreate(false)}
          onSubmit={(input) => createMut.mutate(input)}
          isPending={createMut.isPending}
        />
      )}

      {roomTypes.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-slate-600 text-left">
                <th className="px-3 py-2 font-medium">Título</th>
                <th className="px-3 py-2 font-medium text-right">Cuartos</th>
                <th className="px-3 py-2 font-medium text-right">Adultos</th>
                <th className="px-3 py-2 font-medium text-right">Niños</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {roomTypes.map((rt) => (
                <tr key={rt.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{rt.title}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{rt.count_of_rooms}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{rt.occ_adults}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{rt.occ_children}</td>
                  <td className="px-3 py-2 text-slate-600">{rt.room_kind ?? 'room'}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(rt)}
                      disabled={deleteMut.isPending}
                      className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingConfirm}
        title={pendingConfirm?.title ?? ''}
        message={pendingConfirm?.message ?? null}
        confirmLabel={pendingConfirm?.confirmLabel ?? 'Confirmar'}
        tone="destructive"
        isPending={deleteMut.isPending}
        onConfirm={() => {
          pendingConfirm?.onConfirm()
          setPendingConfirm(null)
        }}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  )
}

function CreateRoomTypeForm({
  onCancel,
  onSubmit,
  isPending,
}: {
  onCancel: () => void
  onSubmit: (input: Parameters<typeof createRoomType>[1]) => void
  isPending: boolean
}) {
  const [title, setTitle] = useState('')
  const [countOfRooms, setCountOfRooms] = useState(1)
  const [occAdults, setOccAdults] = useState(2)
  const [occChildren, setOccChildren] = useState(0)
  const [roomKind, setRoomKind] = useState<'room' | 'dorm'>('room')

  const canSubmit = title.trim().length > 0 && countOfRooms > 0 && occAdults > 0 && !isPending

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSubmit) return
        onSubmit({
          title: title.trim(),
          countOfRooms,
          occAdults,
          occChildren,
          defaultOccupancy: occAdults,
          roomKind,
        })
      }}
      className="bg-white rounded-xl border border-emerald-300 p-4 space-y-3"
    >
      <h3 className="text-[13px] font-semibold text-slate-900">Nuevo room type</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FormField label="Título" hint='ej: "Suite con vista al mar"'>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isPending}
            required
            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
          />
        </FormField>
        <FormField label="Tipo">
          <select
            value={roomKind}
            onChange={(e) => setRoomKind(e.target.value as 'room' | 'dorm')}
            disabled={isPending}
            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-[13px] bg-white"
          >
            <option value="room">room (privada)</option>
            <option value="dorm">dorm (compartida)</option>
          </select>
        </FormField>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <FormField label="# de cuartos">
          <input
            type="number"
            min={1}
            value={countOfRooms}
            onChange={(e) => setCountOfRooms(parseInt(e.target.value || '1', 10))}
            disabled={isPending}
            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-[13px]"
          />
        </FormField>
        <FormField label="Adultos">
          <input
            type="number"
            min={1}
            value={occAdults}
            onChange={(e) => setOccAdults(parseInt(e.target.value || '1', 10))}
            disabled={isPending}
            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-[13px]"
          />
        </FormField>
        <FormField label="Niños">
          <input
            type="number"
            min={0}
            value={occChildren}
            onChange={(e) => setOccChildren(parseInt(e.target.value || '0', 10))}
            disabled={isPending}
            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-[13px]"
          />
        </FormField>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="px-3 py-1.5 rounded-md text-[12px] font-medium text-slate-700 hover:bg-slate-100"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-medium disabled:opacity-50"
        >
          {isPending ? 'Creando...' : 'Crear room type'}
        </button>
      </div>
    </form>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab: Rate Plans
// ═══════════════════════════════════════════════════════════════════════════

function RatePlansTab({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)

  const { data: ratePlans = [], isLoading, isError } = useQuery<ChannexRatePlanRow[]>({
    queryKey: ['nova', 'channex', 'rate-plans', propertyId],
    queryFn: () => listRatePlans(propertyId),
  })
  const { data: roomTypes = [] } = useQuery<ChannexRoomTypeRow[]>({
    queryKey: ['nova', 'channex', 'room-types', propertyId],
    queryFn: () => listRoomTypes(propertyId),
  })

  const createMut = useMutation({
    mutationFn: (input: Parameters<typeof createRatePlan>[1]) => createRatePlan(propertyId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nova', 'channex', 'rate-plans', propertyId] })
      setShowCreate(false)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (rp: ChannexRatePlanRow) =>
      deleteRatePlan(propertyId, rp.channexRatePlanId ?? rp.id ?? ''),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nova', 'channex', 'rate-plans', propertyId] })
    },
  })

  const handleDelete = (rp: ChannexRatePlanRow) => {
    setPendingConfirm({
      title: `Eliminar rate plan "${rp.title}"`,
      message: (
        <div className="space-y-2 text-[12px] text-slate-700">
          <p>
            Las OTAs dejarán de poder vender con este rate plan inmediatamente.
            Reservas existentes con este plan NO se ven afectadas (audit trail preservado).
          </p>
          <p className="text-slate-500">
            Si quieres pausarlo temporalmente sin perderlo, usa la opción "stop sell" en
            Restrictions (Day 13) en lugar de eliminar.
          </p>
        </div>
      ),
      confirmLabel: 'Eliminar rate plan',
      onConfirm: () => deleteMut.mutate(rp),
    })
  }

  if (isLoading) return <SkeletonCard />
  if (isError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <p className="text-[13px] text-red-800">No se pudieron cargar los rate plans.</p>
      </div>
    )
  }

  const canCreate = roomTypes.length > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-slate-600">{ratePlans.length} rate plans activos</p>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          disabled={!canCreate}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-[12px] font-medium transition-colors"
          title={!canCreate ? 'Necesitas crear room types primero' : undefined}
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo rate plan
        </button>
      </div>

      {!canCreate && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[12px] text-amber-800">
          Esta property no tiene room types — crea al menos uno en el tab "Room Types"
          antes de agregar rate plans.
        </div>
      )}

      {ratePlans.length === 0 && !showCreate && canCreate && (
        <EmptyState
          message="Sin rate plans configurados."
          ctaLabel="Crear el primero"
          onCta={() => setShowCreate(true)}
        />
      )}

      {showCreate && canCreate && (
        <CreateRatePlanForm
          roomTypes={roomTypes}
          onCancel={() => setShowCreate(false)}
          onSubmit={(input) => createMut.mutate(input)}
          isPending={createMut.isPending}
        />
      )}

      {ratePlans.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-slate-600 text-left">
                <th className="px-3 py-2 font-medium">Título</th>
                <th className="px-3 py-2 font-medium">Room Type</th>
                <th className="px-3 py-2 font-medium">Currency</th>
                <th className="px-3 py-2 font-medium text-right">Rate base</th>
                <th className="px-3 py-2 font-medium">Mode</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {ratePlans.map((rp) => {
                const rtTitle =
                  roomTypes.find((rt) => rt.id === rp.channexRoomTypeId)?.title ?? rp.channexRoomTypeId
                return (
                  <tr key={rp.id ?? rp.mappingId} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-900">{rp.title}</td>
                    <td className="px-3 py-2 text-slate-600 text-[12px]">{rtTitle}</td>
                    <td className="px-3 py-2 font-mono text-[12px]">{rp.currency}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {rp.defaultRate != null ? Number(rp.defaultRate).toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-600">
                      {rp.sellMode ?? 'per_room'} · {rp.rateMode ?? 'manual'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(rp)}
                        disabled={deleteMut.isPending}
                        className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingConfirm}
        title={pendingConfirm?.title ?? ''}
        message={pendingConfirm?.message ?? null}
        confirmLabel={pendingConfirm?.confirmLabel ?? 'Confirmar'}
        tone="destructive"
        isPending={deleteMut.isPending}
        onConfirm={() => {
          pendingConfirm?.onConfirm()
          setPendingConfirm(null)
        }}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  )
}

function CreateRatePlanForm({
  roomTypes,
  onCancel,
  onSubmit,
  isPending,
}: {
  roomTypes: ChannexRoomTypeRow[]
  onCancel: () => void
  onSubmit: (input: Parameters<typeof createRatePlan>[1]) => void
  isPending: boolean
}) {
  const [title, setTitle] = useState('')
  const [roomTypeId, setRoomTypeId] = useState(roomTypes[0]?.id ?? '')
  const [currency, setCurrency] = useState('USD')
  const [rate, setRate] = useState(100)
  const [sellMode, setSellMode] = useState<'per_room' | 'per_person'>('per_room')

  const canSubmit = title.trim() && roomTypeId && rate > 0 && !isPending

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSubmit) return
        onSubmit({
          title: title.trim(),
          roomTypeId,
          currency: currency.toUpperCase(),
          rateCents: Math.round(rate * 100),
          sellMode,
          rateMode: 'manual',
        })
      }}
      className="bg-white rounded-xl border border-emerald-300 p-4 space-y-3"
    >
      <h3 className="text-[13px] font-semibold text-slate-900">Nuevo rate plan</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FormField label="Título">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isPending}
            required
            placeholder='ej: "BAR Standard"'
            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-[13px]"
          />
        </FormField>
        <FormField label="Room type">
          <select
            value={roomTypeId}
            onChange={(e) => setRoomTypeId(e.target.value)}
            disabled={isPending}
            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-[13px] bg-white"
          >
            {roomTypes.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.title}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <FormField label="Currency (ISO)">
          <input
            type="text"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.slice(0, 3).toUpperCase())}
            disabled={isPending}
            maxLength={3}
            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-[13px] font-mono uppercase"
          />
        </FormField>
        <FormField label="Rate base">
          <input
            type="number"
            min={0}
            step={0.01}
            value={rate}
            onChange={(e) => setRate(parseFloat(e.target.value || '0'))}
            disabled={isPending}
            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-[13px] tabular-nums"
          />
        </FormField>
        <FormField label="Sell mode">
          <select
            value={sellMode}
            onChange={(e) => setSellMode(e.target.value as 'per_room' | 'per_person')}
            disabled={isPending}
            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-[13px] bg-white"
          >
            <option value="per_room">per_room</option>
            <option value="per_person">per_person</option>
          </select>
        </FormField>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="px-3 py-1.5 rounded-md text-[12px] font-medium text-slate-700 hover:bg-slate-100"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-medium disabled:opacity-50"
        >
          {isPending ? 'Creando...' : 'Crear rate plan'}
        </button>
      </div>
    </form>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers UI
// ═══════════════════════════════════════════════════════════════════════════

function FormField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
        {label}
      </span>
      {children}
      {hint && <span className="block text-[10px] text-slate-400 mt-0.5">{hint}</span>}
    </label>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
      <CircleDashed className="h-5 w-5 text-slate-400 mx-auto animate-spin" />
      <p className="text-[12px] text-slate-500 mt-2">Cargando...</p>
    </div>
  )
}

function EmptyState({
  message,
  ctaLabel,
  onCta,
}: {
  message: string
  ctaLabel?: string
  onCta?: () => void
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
      <CircleCheck className="h-6 w-6 text-slate-300 mx-auto" />
      <p className="mt-2 text-[13px] text-slate-600">{message}</p>
      {ctaLabel && onCta && (
        <button
          type="button"
          onClick={onCta}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-medium"
        >
          <Plus className="h-3.5 w-3.5" />
          {ctaLabel}
        </button>
      )}
    </div>
  )
}

function NoOrgState() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-10 text-center max-w-md mx-auto">
      <Building2 className="h-8 w-8 text-slate-300 mx-auto" />
      <h2 className="mt-2 text-[15px] font-semibold text-slate-900">Sin cliente seleccionado</h2>
      <p className="mt-1 text-[12px] text-slate-600">
        Channex Command Center es scope cliente — elige un cliente primero.
      </p>
      <Link
        to="/nova/clientes"
        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-medium"
      >
        Elegir cliente
      </Link>
    </div>
  )
}

function ComingSoonTab({ tab }: { tab: string }) {
  const detail: Record<string, { day: string; what: string }> = {
    'rate-calendar': {
      day: 'Day 11',
      what: 'Matriz rate calendar días × rate plans, bulk PATCH, day-of-week template.',
    },
    restrictions: {
      day: 'Day 13',
      what: 'Stop sell, MLOS/MaxLOS, CTA/CTD por rate plan.',
    },
    channels: {
      day: 'Day 13',
      what: 'Pause/unpause channel (Booking, Expedia, etc.), history log.',
    },
    mappings: {
      day: 'Day 13',
      what: 'Wizard de mapeo Zenix Room ↔ Channex Room Type, health check.',
    },
  }
  const d = detail[tab] ?? { day: 'pronto', what: '—' }
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 inline-block">
        {d.day}
      </div>
      <p className="mt-2 text-[13px] text-slate-600">{d.what}</p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function relativeTime(iso: string): string {
  const d = new Date(iso)
  const diff = (Date.now() - d.getTime()) / 1000
  const future = diff < 0
  const abs = Math.abs(diff)
  if (abs < 60) return future ? `en ${Math.round(abs)}s` : `hace ${Math.round(abs)}s`
  if (abs < 3600) return future ? `en ${Math.round(abs / 60)}m` : `hace ${Math.round(abs / 60)}m`
  if (abs < 86400) return future ? `en ${Math.round(abs / 3600)}h` : `hace ${Math.round(abs / 3600)}h`
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}
