import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { X, RotateCcw, User, Building2, Globe, AlertCircle, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCancelledStays, useRestoreStay } from '../../hooks/useGuestStays'
import { useModalDismiss } from '../../hooks/useModalDismiss'

interface CancelledTodayDrawerProps {
  open: boolean
  propertyId: string
  onClose: () => void
}

const INITIATOR_META: Record<string, { label: string; icon: React.ReactNode; chipClass: string; dotClass: string }> = {
  GUEST:       { label: 'Huésped',  icon: <User className="h-3 w-3" />,        chipClass: 'bg-emerald-100 text-emerald-700', dotClass: 'bg-emerald-500' },
  HOTEL:       { label: 'Hotel',    icon: <Building2 className="h-3 w-3" />,   chipClass: 'bg-amber-100 text-amber-700',     dotClass: 'bg-amber-500' },
  OTA:         { label: 'OTA',      icon: <Globe className="h-3 w-3" />,       chipClass: 'bg-violet-100 text-violet-700',   dotClass: 'bg-violet-500' },
  ADMIN_ERROR: { label: 'Admin',    icon: <AlertCircle className="h-3 w-3" />, chipClass: 'bg-orange-100 text-orange-700',   dotClass: 'bg-orange-500' },
  SYSTEM:      { label: 'Sistema',  icon: <AlertCircle className="h-3 w-3" />, chipClass: 'bg-slate-100 text-slate-700',     dotClass: 'bg-slate-500' },
}

const RESTORE_WINDOW_DAYS = 7

type FilterKey = 'ALL' | 'GUEST' | 'HOTEL' | 'OTA' | 'ADMIN_ERROR'

export function CancelledTodayDrawer({ open, propertyId, onClose }: CancelledTodayDrawerProps) {
  const [filter, setFilter] = useState<FilterKey>('ALL')
  const [search, setSearch] = useState('')

  const { onBackdropClick } = useModalDismiss({ isDirty: false, onClose })

  const todayISO = new Date()
  todayISO.setHours(0, 0, 0, 0)
  const { data, isLoading } = useCancelledStays(propertyId, { since: todayISO.toISOString(), limit: 100 })
  const restoreMut = useRestoreStay(propertyId)

  type Row = {
    id: string
    guestName: string
    checkinAt: string
    scheduledCheckout: string
    cancelledAt: string
    cancelInitiator?: string
    cancelReason?: string
    cancelReasonCode?: string
    totalAmount: string | number
    currency: string
    room: { number: string }
  }

  const rawRows = (data?.rows ?? []) as Row[]

  // Counts por initiator para los filter chips
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { ALL: rawRows.length, GUEST: 0, HOTEL: 0, OTA: 0, ADMIN_ERROR: 0 }
    for (const r of rawRows) {
      const k = (r.cancelInitiator ?? 'GUEST') as FilterKey
      if (k in c) c[k]++
    }
    return c
  }, [rawRows])

  const rows = useMemo(() => {
    let list = rawRows
    if (filter !== 'ALL') list = list.filter((r) => (r.cancelInitiator ?? 'GUEST') === filter)
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((r) =>
      r.guestName.toLowerCase().includes(q) ||
      r.room.number.toLowerCase().includes(q) ||
      (r.cancelReason ?? '').toLowerCase().includes(q),
    )
    return list
  }, [rawRows, filter, search])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      onClick={onBackdropClick}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] pointer-events-none" />

      {/* Modal centrado — max-w-2xl mantiene proporción correcta de los rows en
          desktop wide screen. Apple HIG: sheet pattern para subtarea tabular. */}
      <div className="relative z-10 w-full max-w-2xl bg-white rounded-2xl shadow-2xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Top accent stripe — coherente con CancelReservationDialog */}
        <div className="h-1 bg-rose-500/70 flex-shrink-0" />

        {/* Sticky header — Apple HIG navigation bar pattern */}
        <div className="px-5 pb-3 border-b border-slate-100 flex-shrink-0 space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 leading-tight">Canceladas hoy</h2>
              <p className="text-[11px] text-slate-500 leading-tight">
                {rawRows.length} en total{rows.length !== rawRows.length ? ` · ${rows.length} mostradas` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </div>

          {rawRows.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {/* Filter chips */}
              {(['ALL', 'GUEST', 'HOTEL', 'OTA', 'ADMIN_ERROR'] as FilterKey[]).map((k) => {
                if (k !== 'ALL' && counts[k] === 0) return null
                const meta = k === 'ALL' ? { label: 'Todas', dotClass: 'bg-slate-400' } : INITIATOR_META[k]
                const active = filter === k
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFilter(k)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium transition-colors flex-shrink-0 ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {k !== 'ALL' && (
                      <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
                    )}
                    {meta.label}
                    <span className={`tabular-nums ${active ? 'text-white/70' : 'text-slate-400'}`}>
                      {counts[k]}
                    </span>
                  </button>
                )
              })}

              {/* Search — solo aparece si hay 8+ items (NN/g list density) */}
              {rawRows.length >= 8 && (
                <div className="ml-auto flex-shrink-0 relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar"
                    className="pl-6 pr-2 py-1 text-[11px] border border-slate-200 rounded-md focus:border-slate-400 focus:ring-0 w-32"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* List — Apple Mail / Reminders density (2 lines per row, full width).
            Padding bottom 12px asegura espacio respiratorio del último row al borde. */}
        <div className="flex-1 overflow-y-auto py-1.5">
          {isLoading && <div className="text-xs text-slate-400 text-center py-8">Cargando…</div>}

          {!isLoading && rawRows.length === 0 && (
            <div className="text-center py-10 px-6">
              <div className="text-sm text-slate-500 mb-1">No hay cancelaciones hoy</div>
              <div className="text-[11px] text-slate-400">Las cancelaciones del día aparecerán aquí.</div>
            </div>
          )}

          {!isLoading && rawRows.length > 0 && rows.length === 0 && (
            <div className="text-center py-8 px-6">
              <div className="text-xs text-slate-500">Sin resultados para los filtros actuales.</div>
            </div>
          )}

          <ul className="divide-y divide-slate-100">
            {rows.map((row) => {
              const initiator = row.cancelInitiator ?? 'GUEST'
              const meta = INITIATOR_META[initiator] ?? INITIATOR_META.GUEST
              const cancelledAt = new Date(row.cancelledAt)
              const elapsedDays = (Date.now() - cancelledAt.getTime()) / 86_400_000
              const canRestore = (initiator === 'HOTEL' || initiator === 'ADMIN_ERROR') && elapsedDays <= RESTORE_WINDOW_DAYS

              // Notas: el reasonCode (dropdown) viaja en la línea 2 inline.
              // Las notas libres (reason) — si difieren del code — van en línea 3
              // opcional, con truncate. Char limit del input = 140 chars (Twitter
              // pattern, suficiente para "guest llamó al cel +52..., recolocado
              // a hotel hermano") — enforced en el dialog de cancel.
              const inlineReason = row.cancelReasonCode || ''
              const freeNote = (row.cancelReason && row.cancelReason !== row.cancelReasonCode)
                ? row.cancelReason
                : ''

              return (
                <li key={row.id} className="px-5 py-2.5 hover:bg-slate-50 flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dotClass}`} title={meta.label} />

                  <div className="flex-1 min-w-0">
                    {/* Línea 1: nombre — sin time, sin elementos flotando a la derecha */}
                    <div className="text-sm font-medium text-slate-800 truncate">
                      {row.guestName}
                    </div>
                    {/* Línea 2: meta con interpunctos — hora va inline al final (Apple Mail pattern) */}
                    <div className="text-[11px] text-slate-500 tabular-nums truncate">
                      Hab {row.room.number}
                      {' · '}
                      {format(new Date(row.checkinAt), 'd MMM', { locale: es })}–{format(new Date(row.scheduledCheckout), 'd MMM', { locale: es })}
                      {' · '}
                      {row.currency} {Number(row.totalAmount).toLocaleString()}
                      {inlineReason && (
                        <> {' · '} <span className="italic text-slate-400">{inlineReason}</span></>
                      )}
                      <span className="text-slate-400"> · {format(cancelledAt, 'HH:mm')}</span>
                    </div>
                    {freeNote && (
                      <div className="text-[11px] text-slate-400 italic truncate mt-0.5" title={freeNote}>
                        “{freeNote}”
                      </div>
                    )}
                  </div>

                  {/* Acción a la derecha — agrupada visualmente con la fila, sin gap. */}
                  {canRestore && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[11px] h-7 px-2.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex-shrink-0"
                      onClick={() => restoreMut.mutate(row.id)}
                      disabled={restoreMut.isPending}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Restaurar
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
