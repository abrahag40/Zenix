/**
 * GroupCancelDialog — Sprint GROUP-BILLING Fase C C4 (D-GRP-C6, 2026-06-02).
 *
 * Cancela habitaciones de un ReservationGroup: parcial (algunas) o total (todas).
 * Cada habitación aplica su propia política de cancelación → el dialog muestra,
 * por miembro, cuánto se retiene y cuánto se reembolsa, y suma las seleccionadas.
 *
 * Reglas clave:
 *  · Solo los miembros "cancelables" (no checked-in/out, no no-show, no cancelados)
 *    son seleccionables.
 *  · Si se seleccionan TODAS las activas → es cancelación TOTAL (el backend marca
 *    el grupo cancelado y, si es OTA, cancela la reserva OTA completa).
 *  · Si quedan activas → es PARCIAL. En grupos OTA, Zenix NO puede modificar la
 *    reserva automáticamente (solo cancelarla entera), así que se avisa al operador
 *    que ajuste la OTA a mano (el backend además levanta una notif al supervisor).
 *
 * Coherente con design system: Radix Dialog primitives (§116) + DialogActions
 * destructive (§123) + tipografía/spacing del sistema + color rojo = destructivo (§31).
 */
import { useEffect, useMemo, useState } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Ban, Users, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DialogActions } from '../shared/DialogActions'
import { useGroupCancellationPreview, useGroupCancel } from '../../hooks/useGuestStays'
import type { GroupCancelMember } from '../../api/guest-stays.api'

type Initiator = 'GUEST' | 'HOTEL' | 'OTA' | 'ADMIN_ERROR'

interface GroupCancelDialogProps {
  open: boolean
  onClose: () => void
  /** Cualquier miembro del grupo — se cargan todos sus hermanos. */
  stayId: string | null
  propertyId: string
  primaryName?: string | null
  /** Preselecciona este miembro al abrir (el que el operador tenía abierto). */
  contextStayId?: string | null
}

const INITIATORS: { value: Initiator; label: string; hint: string }[] = [
  { value: 'GUEST',       label: 'Huésped',     hint: 'El huésped pidió cancelar' },
  { value: 'HOTEL',       label: 'Hotel',       hint: 'Decisión del hotel' },
  { value: 'OTA',         label: 'OTA',         hint: 'Llegó de la agencia' },
  { value: 'ADMIN_ERROR', label: 'Error admin.', hint: 'Reserva creada por error · reembolso total' },
]

function fmtMoney(n: number, ccy: string) {
  return `${ccy} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function GroupCancelDialog({
  open, onClose, stayId, propertyId, primaryName, contextStayId,
}: GroupCancelDialogProps) {
  const { data, isLoading } = useGroupCancellationPreview(stayId, open)
  const cancelMut = useGroupCancel(propertyId)

  const currency = data?.currency ?? 'MXN'
  const cancellable = useMemo<GroupCancelMember[]>(
    () => (data?.members ?? []).filter((m) => m.cancellable),
    [data],
  )
  const totalActive = cancellable.length

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [initiator, setInitiator] = useState<Initiator>('GUEST')
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!open || !data) return
    // Preselecciona el miembro de contexto si es cancelable; si no, ninguno.
    const init = new Set<string>()
    const ctx = cancellable.find((m) => m.stayId === contextStayId)
    if (ctx) init.add(ctx.stayId)
    setSelected(init)
    setInitiator('GUEST')
    setReason('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const allSelected = totalActive > 0 && selected.size === totalActive
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(cancellable.map((m) => m.stayId)))
  }

  // ADMIN_ERROR = reembolso total sin retención (override del motor).
  const isAdminError = initiator === 'ADMIN_ERROR'
  const selRetention = cancellable
    .filter((m) => selected.has(m.stayId))
    .reduce((s, m) => s + (isAdminError ? 0 : m.retention), 0)
  const selRefund = cancellable
    .filter((m) => selected.has(m.stayId))
    .reduce((s, m) => s + (isAdminError ? m.amountPaid : m.refund), 0)

  const isTotal = selected.size > 0 && selected.size === totalActive
  // Aviso OTA solo cuando la cancel ORIGINA en el PMS (HOTEL/ADMIN_ERROR): ahí Zenix
  // tendría que empujar el cambio al canal, pero el "modify" parcial no existe →
  // ajuste manual. GUEST/OTA cancels ya los orquesta el canal (§150).
  const isPmsOriginated = initiator === 'HOTEL' || initiator === 'ADMIN_ERROR'
  const isPartialOta = !isTotal && selected.size > 0 && !!data?.otaName && isPmsOriginated
  const canConfirm = selected.size > 0 && !cancelMut.isPending

  function handleConfirm() {
    if (!canConfirm) return
    cancelMut.mutate(
      { stayIds: [...selected], initiator, reason: reason.trim() || undefined },
      { onSuccess: () => onClose() },
    )
  }

  if (!stayId) return null

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o && !cancelMut.isPending) onClose() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-zenix-modal="true"
          className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px]"
        />
        <DialogPrimitive.Content
          data-zenix-modal="true"
          aria-labelledby="group-cancel-title"
          className="fixed left-1/2 top-1/2 z-[80] -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        >
          <div className="h-1 shrink-0 bg-red-500" />

          <div className="px-5 pt-5 pb-3 shrink-0">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full border bg-red-50 border-red-200 flex items-center justify-center shrink-0">
                <Ban className="h-[18px] w-[18px] text-red-600" />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <DialogPrimitive.Title
                  id="group-cancel-title"
                  className="text-[15px] font-semibold text-slate-900 leading-tight tracking-[-0.005em]"
                >
                  Cancelar grupo{primaryName ? ` · ${primaryName}` : ''}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-[13px] text-slate-600 mt-1.5 leading-relaxed">
                  Elige qué habitaciones cancelar. Cada una aplica su política — verás
                  cuánto se retiene y cuánto se reembolsa.
                </DialogPrimitive.Description>
              </div>
            </div>
          </div>

          <div className="px-5 pb-3 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="py-8 text-center text-[13px] text-slate-500">Cargando grupo…</div>
            ) : totalActive === 0 ? (
              <div className="py-8 text-center text-[13px] text-slate-500">
                No hay habitaciones activas que se puedan cancelar en este grupo.
              </div>
            ) : (
              <>
                {/* Seleccionar todas */}
                <button
                  type="button"
                  onClick={toggleAll}
                  className="mb-2 inline-flex items-center gap-2 text-[12px] font-medium text-slate-600 hover:text-slate-900"
                >
                  <Users className="h-3.5 w-3.5" />
                  {allSelected ? 'Quitar todas' : `Seleccionar todas (${totalActive})`}
                </button>

                <div className="space-y-1.5">
                  {cancellable.map((m) => {
                    const isSel = selected.has(m.stayId)
                    const retention = isAdminError ? 0 : m.retention
                    const refund = isAdminError ? m.amountPaid : m.refund
                    return (
                      <label
                        key={m.stayId}
                        className={cn(
                          'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors',
                          isSel ? 'border-red-300 bg-red-50/60' : 'border-slate-200 bg-white hover:border-slate-300',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggle(m.stayId)}
                          aria-label={`Cancelar Hab. ${m.roomNumber ?? ''}`}
                          className="h-4 w-4 accent-red-600 shrink-0"
                        />
                        <span className="text-[12px] font-bold tabular-nums text-slate-900 shrink-0 w-16">
                          Hab. {m.roomNumber ?? '—'}
                        </span>
                        <span className="flex-1 min-w-0 truncate text-[13px] text-slate-700">{m.guestName}</span>
                        <span className="shrink-0 text-right text-[11px] leading-tight">
                          {refund > 0.001 ? (
                            <span className="text-emerald-700">Reemb. {fmtMoney(refund, currency)}</span>
                          ) : retention > 0.001 ? (
                            <span className="text-amber-700">Retiene {fmtMoney(retention, currency)}</span>
                          ) : (
                            <span className="text-slate-400">Sin cargo</span>
                          )}
                        </span>
                      </label>
                    )
                  })}
                </div>

                {/* Motivo de la cancelación (iniciador) */}
                <div className="mt-4">
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    ¿Quién origina la cancelación?
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {INITIATORS.map((it) => (
                      <button
                        key={it.value}
                        type="button"
                        onClick={() => setInitiator(it.value)}
                        className={cn(
                          'rounded-md border px-2 py-1.5 text-left transition-colors',
                          initiator === it.value
                            ? 'border-red-300 bg-red-50 text-red-800'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                        )}
                      >
                        <span className="block text-[12px] font-medium">{it.label}</span>
                        <span className="block text-[10px] text-slate-400 leading-tight mt-0.5">{it.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Razón */}
                <div className="mt-3">
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Razón <span className="text-slate-400">(opcional, recomendada)</span>
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder="Ej: el huésped pidió cancelar 2 de las 3 habitaciones…"
                    className="w-full resize-none rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                  />
                </div>

                {/* Aviso OTA parcial */}
                {isPartialOta && (
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-800 leading-snug">
                      Cancelación parcial de un grupo de {data?.otaName}. Zenix no puede modificar la
                      reserva en la OTA automáticamente — ajústala en su extranet para liberar solo
                      esas habitaciones. (Se avisará al supervisor.)
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Resumen agregado */}
          {selected.size > 0 && (
            <div className="px-5 py-2.5 shrink-0 border-t border-slate-100 bg-slate-50/60">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-slate-600">
                  {isTotal ? 'Cancelar grupo completo' : `Cancelar ${selected.size} de ${totalActive}`}
                </span>
                <span className="text-slate-800">
                  {selRetention > 0.001 && (
                    <span className="text-amber-700">Retiene {fmtMoney(selRetention, currency)} · </span>
                  )}
                  <span className="text-emerald-700 font-medium">Reembolsa {fmtMoney(selRefund, currency)}</span>
                </span>
              </div>
            </div>
          )}

          <DialogActions
            onCancel={onClose}
            onConfirm={handleConfirm}
            confirmLabel={selected.size > 0 ? `Cancelar (${selected.size})` : 'Cancelar habitaciones'}
            confirmPendingLabel="Cancelando…"
            confirmIcon={Ban}
            tone="destructive"
            isPending={cancelMut.isPending}
            confirmDisabled={!canConfirm}
            className="px-5 pb-4 pt-2 shrink-0 border-t border-slate-100"
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
