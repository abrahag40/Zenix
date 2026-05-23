/**
 * useDLCActive — verifica si un DLC está ACTIVE para la org del actor,
 * respetando `scopedPropertyIds` (§147).
 *
 * Caso típico: el tab "Aprende" en (app)/_layout.tsx debe aparecer solo
 * cuando `LEARNING_CORE` está activo Y la property del staff está en el
 * scope. Si scopedPropertyIds = [] → activo en TODAS las properties.
 *
 * Cache: React Query con staleTime 60s. Invalidation manual cuando el
 * usuario activa/cancela un DLC (raro en mobile — usualmente lo hace el
 * admin desde web).
 *
 * Fail-soft: si la query falla (sin red, 401, etc.), retorna false →
 * el tab se oculta. Una vez recuperada conexión, el tab aparece.
 */
import { useQuery } from '@tanstack/react-query'
import { dlcApi, type DLCCode, type TenantDLC } from '../api/learning.api'
import { useAuthStore } from '../../../store/auth'

export function useDLCStatus() {
  return useQuery<TenantDLC[]>({
    queryKey: ['dlcs'],
    queryFn: () => dlcApi.listMine(),
    staleTime: 60_000,
    retry: 1,
  })
}

export function useDLCActive(dlcCode: DLCCode): {
  isActive: boolean
  isLoading: boolean
  dlc: TenantDLC | null
} {
  const propertyId = useAuthStore((s) => s.user?.propertyId)
  const { data, isLoading } = useDLCStatus()

  const dlc = data?.find((d) => d.dlcCode === dlcCode) ?? null

  if (!dlc) return { isActive: false, isLoading, dlc: null }
  if (dlc.status !== 'ACTIVE') return { isActive: false, isLoading, dlc }

  // §147 — scope selectivo per-property
  if (dlc.scopedPropertyIds.length > 0 && propertyId) {
    const isInScope = dlc.scopedPropertyIds.includes(propertyId)
    return { isActive: isInScope, isLoading, dlc }
  }

  return { isActive: true, isLoading, dlc }
}
