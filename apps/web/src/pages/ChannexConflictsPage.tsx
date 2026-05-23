/*
 * ChannexConflictsPage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Sprint CHANNEX-INBOUND Day 5 — D-CHX5 conflict review queue.
 *
 * Lista reservas marcadas con `channexConflict=true` que llegaron del webhook
 * inbound de Channex y no pudieron auto-procesarse (overlap, room sin mapear,
 * rate plan sin mapear, modify post-checkin con cambios destructivos, etc.).
 *
 * Acciones disponibles por reserva:
 *   - Mover habitación  → reasigna a otra room libre, libera el flag
 *   - Cancelar local    → soft-cancel sin notificar OTA (Channex sigue creyendo activa)
 *   - Cancelar en OTA   → soft-cancel + PUT Channex CRS para propagar al OTA
 *   - Marcar revisado   → solo limpia el flag (manager validó la reserva)
 *
 * Acceso: SUPERVISOR (mismo gate que el endpoint del backend).
 */

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { StaffRole } from '@zenix/shared'
import toast from 'react-hot-toast'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'

interface ConflictListItem {
  stayId: string
  channexBookingId: string | null
  channexOtaName: string | null
  guestName: string
  checkinAt: string
  scheduledCheckout: string
  roomId: string
  roomNumber: string
  roomCategory: string
  totalAmount: string
  currency: string
  paymentModel: string
  notes: string | null
  channexLastSyncAt: string | null
}

interface RoomSuggestion {
  roomId: string
  roomNumber: string
  floor: number | null
  category: string
  capacity: number
  status: string
  roomTypeName: string | null
  roomTypeCode: string | null
  score: number
  reasons: Array<{ kind: string; label: string; weight: number }>
}

type ResolutionKind = 'MOVE_ROOM' | 'CANCEL_LOCAL' | 'CANCEL_AT_OTA' | 'MARK_REVIEWED'

export default function ChannexConflictsPage() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const isSupervisor = user?.role === StaffRole.SUPERVISOR

  const { data: conflicts = [], isLoading } = useQuery<ConflictListItem[]>({
    queryKey: ['channex-conflicts'],
    queryFn: () => api.get('/v1/channex/conflicts'),
    enabled: isSupervisor,
    refetchInterval: 30_000,
  })

  const resolve = useMutation({
    mutationFn: async (args: {
      stayId: string
      kind: ResolutionKind
      newRoomId?: string
      reason?: string
    }) => {
      const { stayId, ...body } = args
      return api.post(`/v1/channex/conflicts/${stayId}/resolve`, body)
    },
    onSuccess: async (data, vars) => {
      await qc.refetchQueries({ queryKey: ['channex-conflicts'] })
      const labels: Record<ResolutionKind, string> = {
        MOVE_ROOM: 'Habitación reasignada',
        CANCEL_LOCAL: 'Cancelada localmente',
        CANCEL_AT_OTA: 'Cancelada y propagada al OTA',
        MARK_REVIEWED: 'Marcada como revisada',
      }
      toast.success(labels[vars.kind])
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message ?? 'No se pudo resolver el conflicto')
    },
  })

  if (!isSupervisor) {
    return (
      <div className="p-6 text-sm text-slate-600">
        Solo los supervisores pueden revisar conflictos de Channex.
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Conflictos Channex</h1>
          <p className="mt-1 text-sm text-slate-600">
            Reservas recibidas por webhook que requieren decisión manual.
          </p>
        </div>
        <a
          href="https://docs.channex.io/api-v.1-documentation/pms-certification-tests"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-slate-500 hover:text-slate-700 underline"
        >
          ¿Qué es esto?
        </a>
      </header>

      {isLoading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Cargando conflictos…
        </div>
      ) : conflicts.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-3">
          {conflicts.map((c) => (
            <ConflictCard
              key={c.stayId}
              conflict={c}
              onResolve={resolve.mutate}
              isPending={resolve.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-8 text-center">
      <div className="text-3xl">✓</div>
      <div className="mt-2 text-sm font-medium text-emerald-900">Sin conflictos pendientes</div>
      <div className="mt-1 text-xs text-emerald-700">
        Todas las reservas Channex se procesaron automáticamente.
      </div>
    </div>
  )
}

function ConflictCard({
  conflict,
  onResolve,
  isPending,
}: {
  conflict: ConflictListItem
  onResolve: (args: {
    stayId: string
    kind: ResolutionKind
    newRoomId?: string
    reason?: string
  }) => void
  isPending: boolean
}) {
  const [open, setOpen] = useState<null | ResolutionKind>(null)
  const [newRoomId, setNewRoomId] = useState('')
  const [reason, setReason] = useState('')

  // Smart suggestions — auto-loaded on mount.
  // Provides ranked alternative rooms so the SUPERVISOR doesn't have to scan
  // a flat dropdown of every room in the hotel.
  const { data: suggestions = [] } = useQuery<RoomSuggestion[]>({
    queryKey: ['channex-suggestions', conflict.stayId],
    queryFn: () => api.get(`/v1/channex/conflicts/${conflict.stayId}/suggestions`),
    staleTime: 30_000,
  })

  const checkin = useMemo(() => new Date(conflict.checkinAt), [conflict.checkinAt])
  const checkout = useMemo(() => new Date(conflict.scheduledCheckout), [conflict.scheduledCheckout])
  const nights = Math.max(1, Math.round((checkout.getTime() - checkin.getTime()) / 86_400_000))

  function pickSuggestion(s: RoomSuggestion) {
    setNewRoomId(s.roomId)
    setReason(`Movido a hab. ${s.roomNumber} (score ${s.score})`)
    setOpen('MOVE_ROOM')
  }

  function submit(kind: ResolutionKind) {
    onResolve({
      stayId: conflict.stayId,
      kind,
      newRoomId: kind === 'MOVE_ROOM' ? newRoomId : undefined,
      reason: reason.trim() || undefined,
    })
    setOpen(null)
  }

  return (
    <li className="rounded-lg border border-amber-200 bg-amber-50/30 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Conflicto
            </span>
            <span className="text-sm font-medium text-slate-900">{conflict.guestName}</span>
            {conflict.channexOtaName && (
              <span className="text-xs text-slate-500">· {conflict.channexOtaName}</span>
            )}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Hab. <strong>{conflict.roomNumber}</strong> · {fmtDate(checkin)} → {fmtDate(checkout)} ·{' '}
            {nights}n · {conflict.currency} {conflict.totalAmount}
          </div>
          {conflict.notes && (
            <pre className="mt-2 max-w-2xl whitespace-pre-wrap text-xs text-slate-500">
              {conflict.notes}
            </pre>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => setOpen('CANCEL_AT_OTA')}
            className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            Cancelar en OTA
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setOpen('CANCEL_LOCAL')}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar local
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => submit('MARK_REVIEWED')}
            className="rounded border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
          >
            Marcar revisado
          </button>
        </div>
      </div>

      {/* Smart suggestions — Day 7 D-CHX5 UX. Loaded automatically; recepción
          escoge entre las top-3 alternativas ranqueadas por similitud. */}
      {suggestions.length > 0 && open !== 'MOVE_ROOM' && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-white p-3">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Alternativas recomendadas
            </h3>
            <span className="text-[10px] text-slate-500">
              Ranqueadas por similitud al cuarto en conflicto
            </span>
          </div>
          <ul className="space-y-2">
            {suggestions.map((s, idx) => (
              <li
                key={s.roomId}
                className={`flex flex-wrap items-center justify-between gap-3 rounded border ${
                  idx === 0 ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50'
                } px-3 py-2`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-900">
                      Hab. {s.roomNumber}
                    </span>
                    {idx === 0 && (
                      <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        Recomendado
                      </span>
                    )}
                    {s.roomTypeName && (
                      <span className="text-xs text-slate-500">· {s.roomTypeName}</span>
                    )}
                    <span className="text-[10px] text-slate-400">score {s.score}/100</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.reasons.map((r) => (
                      <span
                        key={r.kind}
                        className="rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-600 ring-1 ring-slate-200"
                        title={`+${r.weight} pts`}
                      >
                        {r.label}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => pickSuggestion(s)}
                  className="rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  Mover aquí
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {suggestions.length === 0 && open !== 'MOVE_ROOM' && (
        <p className="mt-3 text-xs text-amber-700">
          ⚠ No hay habitaciones alternativas disponibles para estas fechas. Considera cancelar la
          reserva o re-evaluar la política de overbooking.
        </p>
      )}

      {open && (
        <div className="mt-4 rounded border border-slate-200 bg-white p-3">
          {open === 'MOVE_ROOM' && (
            <div className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900">
              <strong>Mover a:</strong>{' '}
              {suggestions.find((s) => s.roomId === newRoomId)?.roomNumber ?? '—'}
            </div>
          )}
          <label className="mt-3 block text-xs font-medium text-slate-700">
            Razón (opcional, visible en audit log)
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
          {open === 'CANCEL_AT_OTA' && (
            <p className="mt-2 text-xs text-amber-700">
              ⚠ Esta acción notifica a Channex que cancele la reserva. La política de reembolso
              del OTA aplica según los términos del contrato.
            </p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isPending || (open === 'MOVE_ROOM' && !newRoomId)}
              onClick={() => submit(open)}
              className="rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              Confirmar
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}
