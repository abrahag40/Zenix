/**
 * GroupCheckinDialog — Sprint GROUP-BILLING Fase B (D-GRP-B1..B3, 2026-06-01).
 *
 * Check-in BULK de los miembros de un ReservationGroup que llegaron (Modo B
 * del §156). El check-in individual de UNA habitación sigue siendo el
 * ConfirmCheckinDialog normal (Modo A). Aquí el operador:
 *  · ve todas las habitaciones del grupo,
 *  · marca cuáles llegaron (toggle "Llegó") — las ausentes quedan pendientes
 *    para el night audit (§4.3, "no llegó" = skip, no se chequea),
 *  · opcionalmente renombra al huésped real de cada hab (D-GRP-B1/B2 — no
 *    bloqueante; el hotel decide si captura el nombre real),
 *  · atesta identidad UNA vez para el lote (§C1.13 — no bloqueante per-room).
 *
 * Las habitaciones con saldo pendiente (no OTA-collect) NO son chequeables
 * desde aquí: hay que cobrarlas primero (el cobro de grupo vive en el
 * ConfirmCheckinDialog del titular — Fase A "Todo el grupo").
 *
 * Diseño coherente con design system Zenix: Radix Dialog primitives (§116) +
 * StyledInput + DialogActions footer (§123) + tipografía/spacing del sistema.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Users, Check, LogIn } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StyledInput } from '../shared/StyledInput'
import { DialogActions } from '../shared/DialogActions'
import { guestStaysApi } from '../../api/guest-stays.api'
import { useBulkCheckin } from '../../hooks/useGuestStays'

interface GroupCheckinDialogProps {
  open: boolean
  onClose: () => void
  /** Cualquier miembro del grupo (para cargar los balances del grupo). */
  stayId: string | null
  propertyId: string
  /** Nombre del titular OTA, para el header. */
  primaryName?: string | null
}

function fmtMoney(n: number, ccy: string) {
  return `${ccy} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function GroupCheckinDialog({
  open, onClose, stayId, propertyId, primaryName,
}: GroupCheckinDialogProps) {
  const bulkMut = useBulkCheckin(propertyId)

  const { data, isLoading } = useQuery({
    queryKey: ['group-balances', stayId],
    queryFn: () => guestStaysApi.getGroupBalances(stayId!),
    enabled: open && !!stayId,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  })

  // Miembros activos aún no chequeados (los chequeables + los con saldo).
  const pending = useMemo(
    () => (data?.stays ?? []).filter((s) => !s.cancelled && !s.noShow && !s.checkedIn),
    [data],
  )
  const currency = data?.currency ?? 'MXN'
  const covered = (s: { balance: number; paymentModel: string }) =>
    s.balance <= 0.01 || s.paymentModel === 'OTA_COLLECT'

  // Estado local: selección (llegó) + nombres editables. Default: todos los
  // cubiertos seleccionados; los con saldo no son seleccionables.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [names, setNames] = useState<Record<string, string>>({})
  const [docVerified, setDocVerified] = useState(false)

  useEffect(() => {
    if (!open) return
    if (!data) return
    const initSel = new Set<string>()
    const initNames: Record<string, string> = {}
    for (const s of pending) {
      initNames[s.stayId] = s.guestName
      if (covered(s)) initSel.add(s.stayId)
    }
    setSelected(initSel)
    setNames(initNames)
    setDocVerified(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data])

  const selectedCount = selected.size
  const canConfirm = selectedCount > 0 && docVerified && !bulkMut.isPending

  function toggle(stayId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(stayId)) next.delete(stayId)
      else next.add(stayId)
      return next
    })
  }

  function handleConfirm() {
    if (!canConfirm) return
    const members = pending
      .filter((s) => selected.has(s.stayId) && covered(s))
      .map((s) => {
        const edited = (names[s.stayId] ?? '').trim()
        return edited && edited !== s.guestName
          ? { stayId: s.stayId, guestName: edited }
          : { stayId: s.stayId }
      })
    if (members.length === 0) return

    bulkMut.mutate(
      { members, documentVerified: docVerified },
      {
        onSuccess: (res) => {
          const ok = res.checkedIn
          const skipped = res.results.filter((r) => r.status !== 'checked_in').length
          toast.success(
            skipped > 0
              ? `${ok} check-in${ok === 1 ? '' : 's'} confirmado${ok === 1 ? '' : 's'} · ${skipped} omitido${skipped === 1 ? '' : 's'}`
              : `${ok} check-in${ok === 1 ? '' : 's'} de grupo confirmado${ok === 1 ? '' : 's'}`,
          )
          onClose()
        },
        onError: (e: Error) => toast.error(e?.message ?? 'No se pudo completar el check-in del grupo'),
      },
    )
  }

  if (!stayId) return null

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-zenix-modal="true"
          className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px]"
        />
        <DialogPrimitive.Content
          data-zenix-modal="true"
          aria-labelledby="group-checkin-title"
          className="fixed left-1/2 top-1/2 z-[80] -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        >
          <div className="h-1 shrink-0 bg-emerald-500" />

          <div className="px-5 pt-5 pb-3 shrink-0">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full border bg-emerald-50 border-emerald-200 flex items-center justify-center shrink-0">
                <Users className="h-[18px] w-[18px] text-emerald-700" />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <DialogPrimitive.Title
                  id="group-checkin-title"
                  className="text-[15px] font-semibold text-slate-900 leading-tight tracking-[-0.005em]"
                >
                  Check-in del grupo{primaryName ? ` · ${primaryName}` : ''}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-[13px] text-slate-600 mt-1.5 leading-relaxed">
                  Marca las habitaciones que llegaron. Las que no, quedan pendientes.
                  Puedes corregir el nombre del huésped de cada habitación (opcional).
                </DialogPrimitive.Description>
              </div>
            </div>
          </div>

          {/* Lista de miembros */}
          <div className="px-5 pb-3 flex-1 overflow-y-auto space-y-1.5">
            {isLoading ? (
              <div className="py-8 text-center text-[13px] text-slate-500">Cargando grupo…</div>
            ) : pending.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-slate-500">
                No hay habitaciones pendientes de check-in en este grupo.
              </div>
            ) : (
              pending.map((s) => {
                const isCovered = covered(s)
                const isSel = selected.has(s.stayId)
                return (
                  <div
                    key={s.stayId}
                    className={cn(
                      'rounded-lg border px-3 py-2.5',
                      isCovered ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50/50',
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isSel}
                        disabled={!isCovered}
                        onChange={() => toggle(s.stayId)}
                        aria-label={`Marcar Hab. ${s.roomNumber ?? ''} como llegó`}
                        className="h-4 w-4 accent-emerald-600 shrink-0 disabled:opacity-40"
                      />
                      <span className="text-[12px] font-bold tabular-nums text-slate-900 shrink-0">
                        Hab. {s.roomNumber ?? '—'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <StyledInput
                          type="text"
                          value={names[s.stayId] ?? ''}
                          onChange={(e) => setNames((p) => ({ ...p, [s.stayId]: e.target.value }))}
                          placeholder="Nombre del huésped"
                          disabled={!isCovered}
                          className="h-8 text-[13px]"
                        />
                      </div>
                    </div>
                    {!isCovered && (
                      <p className="text-[11px] text-amber-700 mt-1.5 pl-[26px]">
                        Debe {fmtMoney(s.balance, currency)} · cóbrala primero (check-in individual del titular → “Todo el grupo”).
                      </p>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Atestación de identidad (una por lote, §C1.13) */}
          {pending.some((s) => covered(s)) && (
            <label className="px-5 py-2.5 shrink-0 flex items-start gap-2.5 border-t border-slate-100 cursor-pointer">
              <input
                type="checkbox"
                checked={docVerified}
                onChange={(e) => setDocVerified(e.target.checked)}
                className="h-4 w-4 accent-emerald-600 shrink-0 mt-0.5"
              />
              <span className="text-[12px] text-slate-700 leading-snug">
                Verifiqué la identidad de los huéspedes que llegaron.
                <span className="text-slate-400"> (Visa CRR §5.9.2 — evidencia de check-in)</span>
              </span>
            </label>
          )}

          <DialogActions
            onCancel={onClose}
            onConfirm={handleConfirm}
            confirmLabel={selectedCount > 0 ? `Confirmar check-in (${selectedCount})` : 'Confirmar check-in'}
            confirmIcon={LogIn}
            isPending={bulkMut.isPending}
            confirmDisabled={!canConfirm}
            className="px-5 pb-4 pt-2 shrink-0 border-t border-slate-100"
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
