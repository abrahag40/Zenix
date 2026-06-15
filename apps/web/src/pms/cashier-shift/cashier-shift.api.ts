import { api } from '@/api/client'
import type { CashierShiftDto, CashMovementDto } from '@zenix/shared'

/**
 * Cliente HTTP de Caja / Turnos (Sprint CASH-DRAWER-REPORTS S4). El propertyId NO
 * viaja en el body — el backend lo deriva del JWT (tenant context). El cajero opera
 * su turno en la propiedad activa de su sesión.
 */

export interface OpenShiftBody {
  openingFloat: Record<string, number>
  openingSource?: 'FRESH_BANK' | 'SAFE' | 'HANDOVER'
  handoverFromShiftId?: string
}

export interface CloseShiftBody {
  actualClose: Record<string, number>
  witnessId?: string
}

export interface AddMovementBody {
  type: string
  currency: string
  amount: number
  direction?: 'IN' | 'OUT'
  notes?: string
}

export const cashierShiftApi = {
  current: () => api.get<CashierShiftDto | null>('/v1/cashier-shifts/current'),
  open: (body: OpenShiftBody) => api.post<CashierShiftDto>('/v1/cashier-shifts', body),
  close: (shiftId: string, body: CloseShiftBody) =>
    api.post<{ id: string; status: string }>(`/v1/cashier-shifts/${shiftId}/close`, body),
  addMovement: (shiftId: string, body: AddMovementBody) =>
    api.post<CashMovementDto>(`/v1/cashier-shifts/${shiftId}/movements`, body),
}
