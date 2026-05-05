/**
 * WalkInModal — D15 / Sprint 9 / OperationalOverridesPage.
 *
 * Crea GuestStay + CleaningTask atómicamente para huéspedes que llegan
 * sin reserva previa y se van el mismo día.
 *
 * Flujo:
 *   1. Recepción selecciona habitación + cama (auto-pick si privada)
 *   2. Captura: nombre del huésped, tarifa, hora estimada de salida
 *   3. POST /tasks/walk-in → backend crea stay PAID/WALK_IN + tarea PENDING
 *   4. Toast éxito + invalida grid del día → la cama aparece como "salida pendiente"
 *
 * Justificación UX (CLAUDE.md §32 — confirmación obligatoria para mutaciones):
 *   - Forcing function: revisar nombre, tarifa, y hora antes de confirmar
 *   - Si la habitación es shared (dorm), el selector de cama es obligatorio
 *   - Hora de salida default: hoy a las 8 PM (operativamente típico para walk-in)
 */
import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { tasksOverridesApi, type WalkInPayload } from '../../api/tasks-overrides.api'
import { api } from '../../api/client'

interface RoomOption {
  id: string
  number: string
  category: 'PRIVATE' | 'SHARED'
  units: { id: string; label: string }[]
}

interface Props {
  open: boolean
  onClose: () => void
}

export function WalkInModal({ open, onClose }: Props) {
  const qc = useQueryClient()

  const [roomId, setRoomId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [guestName, setGuestName] = useState('')
  const [ratePerNight, setRate] = useState<string>('')
  const [currency, setCurrency] = useState('USD')
  const [checkoutTime, setCheckoutTime] = useState('20:00')
  const [paxCount, setPaxCount] = useState('1')

  // Reset cuando el modal abre
  useEffect(() => {
    if (open) {
      setRoomId('')
      setUnitId('')
      setGuestName('')
      setRate('')
      setCheckoutTime('20:00')
      setPaxCount('1')
    }
  }, [open])

  const { data: rooms = [] } = useQuery<RoomOption[]>({
    queryKey: ['rooms-with-units'],
    queryFn: async () => {
      // Endpoint existente que regresa rooms con units
      const all = await api.get<any[]>('/rooms?includeUnits=true')
      return all.map((r) => ({
        id: r.id,
        number: r.number,
        category: r.category ?? 'PRIVATE',
        units: (r.units ?? []).map((u: any) => ({ id: u.id, label: u.label ?? u.number ?? u.id })),
      }))
    },
    enabled: open,
  })

  const selectedRoom = rooms.find((r) => r.id === roomId)
  const isShared = selectedRoom?.category === 'SHARED'
  const needsUnitPick = isShared && (selectedRoom?.units.length ?? 0) > 1

  const mutation = useMutation({
    mutationFn: (payload: WalkInPayload) => tasksOverridesApi.walkIn(payload),
    onSuccess: () => {
      toast.success('Walk-in creado · cama lista para checkout', { duration: 5000 })
      qc.invalidateQueries({ queryKey: ['daily-grid'] })
      qc.invalidateQueries({ queryKey: ['guest-stays'] })
      qc.invalidateQueries({ queryKey: ['rooms'] })
      onClose()
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'No se pudo crear el walk-in')
    },
  })

  function buildPayload(): WalkInPayload | null {
    if (!roomId || !guestName.trim() || !ratePerNight) return null
    const rate = Number(ratePerNight)
    if (!Number.isFinite(rate) || rate <= 0) return null

    // Construye scheduledCheckout combinando fecha actual + hora seleccionada
    const today = new Date()
    const [hh, mm] = checkoutTime.split(':').map(Number)
    today.setHours(hh, mm, 0, 0)
    return {
      roomId,
      unitId: needsUnitPick ? unitId : (selectedRoom?.units[0]?.id),
      guestName: guestName.trim(),
      ratePerNight: rate,
      currency,
      scheduledCheckout: today.toISOString(),
      paxCount: Number(paxCount) || 1,
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = buildPayload()
    if (!payload) {
      toast.error('Completa los campos requeridos')
      return
    }
    if (needsUnitPick && !unitId) {
      toast.error('Selecciona la cama del dorm')
      return
    }
    mutation.mutate(payload)
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="walkin-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm motion-reduce:backdrop-blur-none"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 animate-[modal-spring-in_280ms_var(--ease-spring)] motion-reduce:animate-none">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 id="walkin-title" className="text-lg font-semibold text-gray-900">
              + Walk-in checkout
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Huésped sin reserva previa que se va hoy
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none -mt-1"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="form-label">Habitación</label>
            <select
              className="input"
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value)
                setUnitId('')
              }}
              required
            >
              <option value="">Selecciona habitación...</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  Hab. {r.number} {r.category === 'SHARED' ? `· dorm (${r.units.length} camas)` : '· privada'}
                </option>
              ))}
            </select>
          </div>

          {needsUnitPick && (
            <div>
              <label className="form-label">Cama (dorm compartido)</label>
              <select
                className="input"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                required
              >
                <option value="">Selecciona cama...</option>
                {selectedRoom!.units.map((u) => (
                  <option key={u.id} value={u.id}>{u.label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="form-label">Nombre del huésped</label>
            <input
              className="input"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Ej. Carlos Méndez"
              required
              minLength={2}
              maxLength={120}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Tarifa</label>
              <input
                type="number"
                className="input"
                value={ratePerNight}
                onChange={(e) => setRate(e.target.value)}
                placeholder="80"
                min="0"
                step="0.01"
                required
              />
            </div>
            <div>
              <label className="form-label">Moneda</label>
              <select
                className="input"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="USD">USD</option>
                <option value="MXN">MXN</option>
                <option value="COP">COP</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Hora de salida</label>
              <input
                type="time"
                className="input"
                value={checkoutTime}
                onChange={(e) => setCheckoutTime(e.target.value)}
                required
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Hoy {format(new Date(), 'd MMM')} · debe ser futura · máx 24h
              </p>
            </div>
            <div>
              <label className="form-label">Huéspedes</label>
              <input
                type="number"
                className="input"
                value={paxCount}
                onChange={(e) => setPaxCount(e.target.value)}
                min="1"
                max="20"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
              disabled={mutation.isPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Creando...' : 'Crear walk-in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
