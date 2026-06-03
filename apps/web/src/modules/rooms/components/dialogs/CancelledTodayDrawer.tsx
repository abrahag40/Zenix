import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { X, RotateCcw, User, Building2, Globe, AlertCircle, Search, CalendarMinus, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCancelledStays, useRestoreStay, useRegisterCancelRefund } from '../../hooks/useGuestStays'
import { useModalDismiss } from '../../hooks/useModalDismiss'
import { RegisterCancelRefundDialog } from './RegisterCancelRefundDialog'

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
  // GROUP-BILLING Fase C C3b — registro del reembolso desde el drawer (las
  // canceladas no se ven en el calendario → este es el punto de acceso).
  const registerCancelRefundMut = useRegisterCancelRefund(propertyId)
  const [refundRow, setRefundRow] = useState<Row | null>(null)

  // Unified shape — backend devuelve STAY-level y EXTENSION_SEGMENT mezclados.
  // STAY tiene los campos del folio completo; EXTENSION_SEGMENT tiene previous/new
  // checkOut (lo que cambió por la cancelación de la extensión).
  type Row = {
    id: string
    type?: 'STAY' | 'EXTENSION_SEGMENT'  // opcional para back-compat con backend viejo
    guestStayId?: string
    guestName: string
    bookingRef?: string | null
    roomNumber?: string | null
    cancelledAt: string
    cancelInitiator?: string
    cancelReason?: string | null
    cancelReasonCode?: string
    // STAY-only:
    checkinAt?: string
    scheduledCheckout?: string
    totalAmount?: string | number
    currency?: string
    room?: { number: string }
    // EXTENSION_SEGMENT-only:
    segmentId?: string
    previousCheckOut?: string
    newJourneyCheckOut?: string
    // GROUP-BILLING Fase C C3b — outcome de reembolso (STAY-level).
    cancelRetentionAmount?: string | number | null
    cancelRefundAmount?: string | number | null
    cancelRefundStatus?: 'NONE' | 'PENDING' | 'REFUNDED' | 'WAIVED' | null
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
      (r.roomNumber ?? r.room?.number ?? '').toLowerCase().includes(q) ||
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

        {/* Sticky header — Apple HIG navigation bar pattern.
            Grid 8pt: px-6 (24) · pt-5 (20) · pb-4 (16) · gap-y-3 (12) */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex-shrink-0 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <h2 className="text-base font-semibold text-slate-900 leading-tight">Canceladas hoy</h2>
              <p className="text-xs text-slate-500 leading-tight">
                {rawRows.length} en total{rows.length !== rawRows.length ? ` · ${rows.length} mostradas` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 -mr-1 -mt-1 p-1.5 rounded-md hover:bg-slate-100 transition-colors"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </div>

          {rawRows.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 pb-1">
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
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex-shrink-0 ${
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
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar"
                    className="pl-7 pr-2.5 py-1 text-xs border border-slate-200 rounded-md focus:border-slate-400 focus:ring-0 w-36"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* List — Apple Mail / Reminders density.
            Grid 8pt: py-2 (8) container · row px-6 (24) py-3 (12) · gap-4 (16) */}
        <div className="flex-1 overflow-y-auto py-2">
          {isLoading && <div className="text-xs text-slate-400 text-center py-10">Cargando…</div>}

          {!isLoading && rawRows.length === 0 && (
            <div className="text-center py-12 px-6">
              <div className="text-sm text-slate-600 font-medium mb-1.5">No hay cancelaciones hoy</div>
              <div className="text-xs text-slate-400">Las cancelaciones del día aparecerán aquí.</div>
            </div>
          )}

          {!isLoading && rawRows.length > 0 && rows.length === 0 && (
            <div className="text-center py-10 px-6">
              <div className="text-xs text-slate-500">Sin resultados para los filtros actuales.</div>
            </div>
          )}

          <ul className="divide-y divide-slate-100">
            {rows.map((row) => {
              const initiator = row.cancelInitiator ?? 'GUEST'
              const meta = INITIATOR_META[initiator] ?? INITIATOR_META.GUEST
              const cancelledAt = new Date(row.cancelledAt)
              const elapsedDays = (Date.now() - cancelledAt.getTime()) / 86_400_000
              const isExtension = row.type === 'EXTENSION_SEGMENT'
              // Restore solo aplica a STAY-level (extension cancel = simplemente
              // re-extender si cambia plan; restore no tiene sentido semántico).
              const canRestore = !isExtension
                && (initiator === 'HOTEL' || initiator === 'ADMIN_ERROR')
                && elapsedDays <= RESTORE_WINDOW_DAYS

              const inlineReason = row.cancelReasonCode || ''
              const freeNote = (row.cancelReason && row.cancelReason !== row.cancelReasonCode)
                ? row.cancelReason
                : ''
              const roomNum = row.roomNumber ?? row.room?.number

              return (
                <li
                  key={row.id}
                  className="px-6 py-3 hover:bg-slate-50 flex items-center gap-4 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Dot + tipo badge (extension differs visually del stay) */}
                    {isExtension ? (
                      <span
                        className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0"
                        title="Extensión cancelada"
                      >
                        <CalendarMinus className="h-3 w-3" />
                      </span>
                    ) : (
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dotClass}`}
                        title={meta.label}
                      />
                    )}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      {/* Línea 1: nombre + badge tipo */}
                      <div className="text-sm font-medium text-slate-800 leading-tight truncate flex items-center gap-1.5">
                        {row.guestName}
                        {isExtension && (
                          <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0 rounded">
                            Extensión
                          </span>
                        )}
                      </div>
                      {/* Línea 2: meta según tipo */}
                      {isExtension ? (
                        <div className="text-xs text-slate-500 tabular-nums leading-tight truncate">
                          {row.previousCheckOut && row.newJourneyCheckOut ? (
                            <>
                              Salida: {format(new Date(row.previousCheckOut), 'd MMM', { locale: es })}
                              {' → '}
                              <span className="font-medium text-slate-700">
                                {format(new Date(row.newJourneyCheckOut), 'd MMM', { locale: es })}
                              </span>
                            </>
                          ) : (
                            'Extensión revocada'
                          )}
                          {inlineReason && (
                            <> {' · '} <span className="italic text-slate-400">{inlineReason}</span></>
                          )}
                          <span className="text-slate-400"> · {format(cancelledAt, 'HH:mm')}</span>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 tabular-nums leading-tight truncate">
                          {roomNum && <>Hab {roomNum}{' · '}</>}
                          {row.checkinAt && row.scheduledCheckout && (
                            <>
                              {format(new Date(row.checkinAt), 'd MMM', { locale: es })}
                              –{format(new Date(row.scheduledCheckout), 'd MMM', { locale: es })}
                              {' · '}
                            </>
                          )}
                          {row.currency && row.totalAmount != null && (
                            <>{row.currency} {Number(row.totalAmount).toLocaleString()}</>
                          )}
                          {inlineReason && (
                            <> {' · '} <span className="italic text-slate-400">{inlineReason}</span></>
                          )}
                          <span className="text-slate-400"> · {format(cancelledAt, 'HH:mm')}</span>
                        </div>
                      )}
                      {freeNote && (
                        <div
                          className="text-xs text-slate-400 italic leading-tight truncate pt-0.5"
                          title={freeNote}
                        >
                          “{freeNote}”
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    {canRestore && row.guestStayId && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-8 px-3 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        onClick={() => restoreMut.mutate(row.guestStayId!)}
                        disabled={restoreMut.isPending}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                        Restaurar
                      </Button>
                    )}

                    {/* GROUP-BILLING Fase C C3b — reembolso (solo stay-level). */}
                    {row.type !== 'EXTENSION_SEGMENT' && row.cancelRefundStatus === 'PENDING' && row.guestStayId && (
                      <Button
                        size="sm"
                        className="text-xs h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => setRefundRow(row)}
                      >
                        <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                        Reembolso {row.cancelRefundAmount != null ? `${row.currency ?? ''} ${Number(row.cancelRefundAmount).toLocaleString()}` : ''}
                      </Button>
                    )}
                    {row.cancelRefundStatus === 'REFUNDED' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Reembolsado
                      </span>
                    )}
                    {row.cancelRefundStatus === 'WAIVED' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> No reembolsado
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {/* GROUP-BILLING Fase C C3b — registro del reembolso de la cancelación. */}
      <RegisterCancelRefundDialog
        open={!!refundRow}
        onClose={() => setRefundRow(null)}
        onConfirm={(dto) => {
          if (!refundRow?.guestStayId) return
          registerCancelRefundMut.mutate(
            { stayId: refundRow.guestStayId, payload: dto },
            { onSuccess: () => setRefundRow(null) },
          )
        }}
        isPending={registerCancelRefundMut.isPending}
        guestName={refundRow?.guestName ?? ''}
        refundAmount={refundRow?.cancelRefundAmount != null ? Number(refundRow.cancelRefundAmount) : null}
        retentionAmount={refundRow?.cancelRetentionAmount != null ? Number(refundRow.cancelRetentionAmount) : null}
        currency={refundRow?.currency ?? 'MXN'}
      />
    </div>
  )
}
