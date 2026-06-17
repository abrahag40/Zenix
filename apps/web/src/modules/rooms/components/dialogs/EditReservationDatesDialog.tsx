import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  CalendarClock as CalendarIcon,
  AlertTriangle,
  Check,
  ExternalLink,
  Moon,
  Lock,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DialogActions } from '../shared/DialogActions'
import { resolveOtaDisplay } from '../../utils/timeline.constants'
import { useEditDatesPreview, useEditReservationDates } from '../../hooks/useGuestStays'

interface EditReservationDatesDialogProps {
  stayId: string
  propertyId: string
  guestName: string
  roomNumber?: string
  currentCheckIn: Date
  currentCheckOut: Date
  currency: string
  source?: string | null
  channexOtaName?: string | null
  onClose: () => void
  onSaved?: () => void
}

const money = (n: number, ccy: string) =>
  `${ccy} ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const toDayStr = (d: Date) => format(d, 'yyyy-MM-dd')

/** Construye una Date con el día elegido preservando la hora original del rango. */
function withDay(dayStr: string, originalTime: Date): Date {
  const [y, m, d] = dayStr.split('-').map(Number)
  const nd = new Date(originalTime)
  nd.setFullYear(y, (m ?? 1) - 1, d ?? 1)
  return nd
}

export function EditReservationDatesDialog({
  stayId,
  propertyId,
  guestName,
  roomNumber,
  currentCheckIn,
  currentCheckOut,
  currency,
  source,
  channexOtaName,
  onClose,
  onSaved,
}: EditReservationDatesDialogProps) {
  const [checkInStr, setCheckInStr] = useState(() => toDayStr(currentCheckIn))
  const [checkOutStr, setCheckOutStr] = useState(() => toDayStr(currentCheckOut))
  const [reprice, setReprice] = useState(false)
  const [selectedAltRoomId, setSelectedAltRoomId] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const newCheckIn = useMemo(() => withDay(checkInStr, currentCheckIn), [checkInStr, currentCheckIn])
  const newCheckOut = useMemo(() => withDay(checkOutStr, currentCheckOut), [checkOutStr, currentCheckOut])

  // Debounce de las fechas para el preview — evita un request por cada tecleo.
  const [debIn, setDebIn] = useState(newCheckIn)
  const [debOut, setDebOut] = useState(newCheckOut)
  useEffect(() => {
    const t = setTimeout(() => {
      setDebIn(newCheckIn)
      setDebOut(newCheckOut)
    }, 300)
    return () => clearTimeout(t)
  }, [newCheckIn, newCheckOut])

  // Cambió el rango → la alternativa elegida ya no aplica.
  useEffect(() => {
    setSelectedAltRoomId(null)
  }, [debIn, debOut])

  const { data: preview, isFetching } = useEditDatesPreview(stayId, debIn, debOut)
  const editMut = useEditReservationDates(propertyId)

  const otaMeta = resolveOtaDisplay(channexOtaName, source)
  const isOta = !!preview?.requiresOtaManualAdjust
  const otaName = preview?.otaName ?? otaMeta?.label

  const ineligible = preview && !preview.eligible
  const rangeError = preview?.rangeError ?? null
  const available = preview?.available ?? false
  const alternatives = preview?.alternatives ?? []
  const altNumber = alternatives.find((a) => a.roomId === selectedAltRoomId)?.number

  // Recotizar solo es ofrecible cuando difiere de la tarifa pactada.
  const canReprice =
    !!preview && preview.repricedRate != null && preview.repricedRate !== preview.ratePerNight
  useEffect(() => {
    if (!canReprice && reprice) setReprice(false)
  }, [canReprice, reprice])

  // El nuevo rango no cabe en la habitación actual → hace falta elegir alternativa.
  const needsAltRoom = !!preview && preview.eligible && !available && !rangeError
  const blocked = !preview || isFetching || !!rangeError || !!ineligible
  const canConfirm = !blocked && (available || (needsAltRoom && !!selectedAltRoomId))

  const total = reprice ? preview?.repricedTotal ?? preview?.keptTotal ?? 0 : preview?.keptTotal ?? 0
  const balance = reprice ? preview?.repricedBalance ?? preview?.keptBalance ?? 0 : preview?.keptBalance ?? 0
  const nights = preview?.nights ?? 0
  const nightsDelta = preview?.nightsDelta ?? 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleConfirm() {
    if (!canConfirm) return
    editMut.mutate(
      {
        stayId,
        checkInAt: newCheckIn.toISOString(),
        scheduledCheckout: newCheckOut.toISOString(),
        newRoomId: needsAltRoom && selectedAltRoomId ? selectedAltRoomId : undefined,
        reprice,
        reason: reason.trim() || undefined,
      },
      {
        onSuccess: () => {
          onSaved?.()
          onClose()
        },
      },
    )
  }

  const problem = !!rangeError || !!ineligible || (needsAltRoom && !selectedAltRoomId)
  const todayStr = toDayStr(new Date())

  const confirmLabel = ineligible
    ? 'No editable'
    : needsAltRoom
      ? selectedAltRoomId
        ? `Mover a Hab. ${altNumber}`
        : 'Elige habitación'
      : isOta
        ? 'Guardar y avisar'
        : 'Guardar cambios'

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />

      <div
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden"
        style={{ animation: 'var(--animate-spring-in)' }}
      >
        {/* Header */}
        <div className={cn('px-5 pt-5 pb-4', problem ? 'bg-amber-50' : 'bg-slate-50')}>
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
                problem ? 'bg-amber-100' : 'bg-slate-200/70',
              )}
            >
              {problem ? (
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              ) : (
                <CalendarIcon className="h-5 w-5 text-slate-700" />
              )}
            </div>
            <div>
              <p className="font-bold text-slate-900 text-base leading-tight">Editar fechas</p>
              <p className="text-sm text-slate-500 mt-0.5">
                {guestName}
                {roomNumber && ` · Hab. ${roomNumber}`}
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Date pickers */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-0.5">
                Llegada
              </label>
              <input
                type="date"
                value={checkInStr}
                min={todayStr}
                onChange={(e) => setCheckInStr(e.target.value)}
                className="mt-1 w-full h-9 px-3 text-sm rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent tabular-nums"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-0.5">
                Salida
              </label>
              <input
                type="date"
                value={checkOutStr}
                min={checkInStr}
                onChange={(e) => setCheckOutStr(e.target.value)}
                className="mt-1 w-full h-9 px-3 text-sm rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent tabular-nums"
              />
            </div>
          </div>

          {/* Estado del rango */}
          {!preview ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-slate-400 animate-spin shrink-0" />
              <p className="text-xs text-slate-500">Verificando disponibilidad…</p>
            </div>
          ) : ineligible ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-800">No se puede reprogramar</p>
              <p className="text-[11px] text-amber-700 mt-0.5 leading-snug">
                {preview?.ineligibleReason?.message}
              </p>
            </div>
          ) : rangeError ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-800">{rangeError.message}</p>
            </div>
          ) : available ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              <p className="text-xs text-emerald-800">
                Disponible · {nights} noche{nights !== 1 ? 's' : ''}
                {nightsDelta !== 0 && (
                  <span className="text-emerald-600">
                    {' '}
                    ({nightsDelta > 0 ? '+' : ''}
                    {nightsDelta} vs antes)
                  </span>
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-amber-800">
                  Hab. {roomNumber} ocupada en ese rango
                </p>
                <p className="text-[11px] text-amber-700 mt-0.5 leading-snug">
                  Elige otra habitación del mismo tipo, libre para las nuevas fechas.
                </p>
              </div>
              {alternatives.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-0.5">
                    Habitaciones disponibles
                  </p>
                  {alternatives.map((room) => (
                    <button
                      key={room.roomId}
                      onClick={() => setSelectedAltRoomId(room.roomId)}
                      className={cn(
                        'w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left transition-all',
                        selectedAltRoomId === room.roomId
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300',
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={cn(
                            'w-4 h-4 rounded-full border-2 flex items-center justify-center',
                            selectedAltRoomId === room.roomId ? 'border-emerald-500' : 'border-slate-300',
                          )}
                        >
                          {selectedAltRoomId === room.roomId && (
                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          )}
                        </div>
                        <span className="font-semibold text-sm">Hab. {room.number ?? '—'}</span>
                      </div>
                      {selectedAltRoomId === room.roomId && <Check className="h-4 w-4 text-emerald-600" />}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-red-800">Sin habitaciones del mismo tipo</p>
                  <p className="text-[11px] text-red-700 mt-0.5">
                    No hay alternativas libres para esas fechas. Prueba otro rango.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Tarifa — conservar vs recotizar (solo si difiere) */}
          {!problem && preview && (
            <div className="bg-slate-50 rounded-xl p-3.5 space-y-2 text-sm">
              {canReprice && (
                <div className="flex bg-white rounded-lg p-1 gap-1 border border-slate-200">
                  <button
                    onClick={() => setReprice(false)}
                    className={cn(
                      'flex-1 text-[11px] py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-colors',
                      !reprice ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-400',
                    )}
                  >
                    <Lock className="h-3 w-3" />
                    Conservar tarifa
                  </button>
                  <button
                    onClick={() => setReprice(true)}
                    className={cn(
                      'flex-1 text-[11px] py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-colors',
                      reprice ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-400',
                    )}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Recotizar
                  </button>
                </div>
              )}
              {preview.currentTotal !== total && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Moon className="h-3 w-3 text-slate-300" />
                    Total anterior
                  </span>
                  <span className="font-mono text-slate-400 line-through decoration-slate-300">
                    {money(preview.currentTotal, currency)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-slate-700 font-medium">
                  {nights} noche{nights !== 1 ? 's' : ''} ×{' '}
                  {money(reprice ? preview.repricedRate ?? preview.ratePerNight : preview.ratePerNight, currency)}
                </span>
                <span className="font-bold font-mono text-slate-800">{money(total, currency)}</span>
              </div>
              <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
                <span className="text-slate-500 text-xs font-medium uppercase tracking-wide">
                  {balance < 0 ? 'A favor del huésped' : 'Saldo a cobrar'}
                </span>
                <span className={cn('font-bold font-mono', balance < 0 ? 'text-amber-700' : 'text-slate-800')}>
                  {money(Math.abs(balance), currency)}
                </span>
              </div>
            </div>
          )}

          {/* OTA advisory — anti-overbooking explícito (D-REP-1) */}
          {isOta && !problem && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2.5">
              <ExternalLink className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800">Reserva vía {otaName}</p>
                <p className="text-[11px] text-amber-700 mt-0.5 leading-snug">
                  Al guardar, Zenix libera las fechas anteriores y bloquea las nuevas en{' '}
                  <span className="font-semibold">{otaName}</span> para evitar overbooking. Falta ajustar
                  el registro de la reserva en su extranet — se avisará al supervisor.
                </p>
              </div>
            </div>
          )}

          {/* Motivo (opcional, recomendado) */}
          {!problem && (
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo del cambio (opcional)"
              maxLength={500}
              className="w-full h-9 px-3 text-xs rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          )}
        </div>

        <DialogActions
          onCancel={onClose}
          onConfirm={handleConfirm}
          confirmLabel={confirmLabel}
          confirmPendingLabel="Guardando…"
          tone="info"
          isPending={editMut.isPending}
          confirmDisabled={!canConfirm}
          confirmIcon={CalendarIcon}
          className="px-5 pb-5"
        />
      </div>
    </div>
  )
}
