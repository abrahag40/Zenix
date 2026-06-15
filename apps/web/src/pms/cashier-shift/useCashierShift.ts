import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type { CashierShiftDto } from '@zenix/shared'
import { ApiError } from '@/api/client'
import { usePropertyStore } from '@/store/property'
import {
  cashierShiftApi,
  type AddMovementBody,
  type CloseShiftBody,
  type OpenShiftBody,
} from './cashier-shift.api'

/** Turno de caja activo del cajero (o null). Keyed por propiedad activa para
 *  refetch al cambiar de propiedad. `retry:false` — el null es respuesta válida. */
export function useCurrentShift() {
  const propertyId = usePropertyStore((s) => s.activePropertyId)
  return useQuery<CashierShiftDto | null>({
    queryKey: ['cashier-shift', 'current', propertyId],
    queryFn: () => cashierShiftApi.current(),
    staleTime: 30 * 1000,
    retry: false,
  })
}

/** Turno por recibir (gaveta compartida). `enabled` para fetch sólo al abrir el diálogo. */
export function usePendingHandover(enabled = true) {
  const propertyId = usePropertyStore((s) => s.activePropertyId)
  return useQuery({
    queryKey: ['cashier-shift', 'pending-handover', propertyId],
    queryFn: () => cashierShiftApi.pendingHandover(),
    enabled,
    staleTime: 10 * 1000,
    retry: false,
  })
}

export function useOpenShift() {
  const qc = useQueryClient()
  return useMutation<CashierShiftDto, ApiError, OpenShiftBody>({
    mutationFn: (body) => cashierShiftApi.open(body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['cashier-shift'] })
      toast.success('Turno de caja abierto')
    },
    onError: (err) => toast.error(err.message || 'No se pudo abrir el turno'),
  })
}

export function useCloseShift() {
  const qc = useQueryClient()
  return useMutation<{ id: string; status: string }, ApiError, { shiftId: string; body: CloseShiftBody }>({
    mutationFn: ({ shiftId, body }) => cashierShiftApi.close(shiftId, body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['cashier-shift'] })
      // R3 — al cajero NO se le revela el over/short; mensaje neutro.
      toast.success('Turno cerrado')
    },
    onError: (err) => toast.error(err.message || 'No se pudo cerrar el turno'),
  })
}

export function useAddCashMovement() {
  const qc = useQueryClient()
  return useMutation<unknown, ApiError, { shiftId: string; body: AddMovementBody }>({
    mutationFn: ({ shiftId, body }) => cashierShiftApi.addMovement(shiftId, body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['cashier-shift'] })
      toast.success('Movimiento registrado')
    },
    onError: (err) => toast.error(err.message || 'No se pudo registrar el movimiento'),
  })
}
