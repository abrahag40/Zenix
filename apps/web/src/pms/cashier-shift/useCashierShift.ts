import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type { CashDailySummaryDto, CashierShiftDto, CashierShiftReportDto } from '@zenix/shared'
import { ApiError } from '@/api/client'
import { usePropertyStore } from '@/store/property'
import {
  cashierShiftApi,
  type AddMovementBody,
  type CloseShiftBody,
  type OpenShiftBody,
  type ReconcileBody,
  type RecordSpotCountBody,
  type ShiftListParams,
  type ShiftsReportParams,
  type ShiftsReportResponse,
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

export function useShiftList(params?: ShiftListParams) {
  const propertyId = usePropertyStore((s) => s.activePropertyId)
  return useQuery<CashierShiftDto[]>({
    queryKey: ['cashier-shift', 'list', propertyId, params?.from, params?.to, params?.status],
    queryFn: () => cashierShiftApi.list(params),
    staleTime: 30 * 1000,
  })
}

export function useShiftReport(shiftId: string | null) {
  return useQuery<CashierShiftReportDto>({
    queryKey: ['cashier-shift', 'report', shiftId],
    queryFn: () => cashierShiftApi.shiftReport(shiftId!),
    enabled: !!shiftId,
    staleTime: 30 * 1000,
  })
}

export function useCashSummary(date: string, filter?: string) {
  const propertyId = usePropertyStore((s) => s.activePropertyId)
  return useQuery<CashDailySummaryDto>({
    queryKey: ['cashier-shift', 'summary', propertyId, date, filter],
    queryFn: () => cashierShiftApi.cashSummary(propertyId!, date, filter),
    enabled: !!propertyId,
    staleTime: 30 * 1000,
  })
}

export function useShiftsReport(params: ShiftsReportParams) {
  const propertyId = usePropertyStore((s) => s.activePropertyId)
  return useQuery<ShiftsReportResponse>({
    queryKey: ['cashier-shift', 'shifts-report', propertyId, params],
    queryFn: () => cashierShiftApi.shiftsReport(params),
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev, // mantiene la tabla mientras cambian filtros/página
  })
}

export function useReconcileShift() {
  const qc = useQueryClient()
  return useMutation<CashierShiftDto, ApiError, { shiftId: string; body: ReconcileBody }>({
    mutationFn: ({ shiftId, body }) => cashierShiftApi.reconcile(shiftId, body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['cashier-shift'] })
      toast.success('Turno conciliado')
    },
    onError: (err) => toast.error(err.message || 'No se pudo conciliar'),
  })
}

export function useRecordSpotCount() {
  const qc = useQueryClient()
  return useMutation<
    { withinTolerance: boolean; variance: Record<string, number> },
    ApiError,
    { shiftId: string; body: RecordSpotCountBody }
  >({
    mutationFn: ({ shiftId, body }) => cashierShiftApi.recordSpotCount(shiftId, body),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ['cashier-shift'] })
      toast.success(res.withinTolerance ? 'Arqueo registrado — cuadra' : 'Arqueo registrado — hay diferencia')
    },
    onError: (err) => toast.error(err.message || 'No se pudo registrar el arqueo'),
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
