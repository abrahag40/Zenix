import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { startOfDay } from 'date-fns'
import toast from 'react-hot-toast'
import { api } from '@/api/client'

export interface DailyBar {
  date: string  // YYYY-MM-DD
  bar: number
  currency: string
}

export interface RateQuoteRoomType {
  id: string
  name: string
  code: string
  baseRate: number
  currency: string
  maxOccupancy: number
}

export interface RateQuoteGrid {
  roomTypes: RateQuoteRoomType[]
  dates: string[]
  grid: Record<string, Record<string, number>>  // [roomTypeId][date] = rate
  currency: string
}

export function useDailyBar(propertyId: string, from: Date, to: Date) {
  return useQuery<DailyBar[]>({
    queryKey: [
      'daily-bar',
      propertyId,
      startOfDay(from).toISOString().slice(0, 10),
      startOfDay(to).toISOString().slice(0, 10),
    ],
    queryFn: () =>
      api.get<DailyBar[]>(
        `/v1/rates/daily-bar?propertyId=${propertyId}&from=${from.toISOString()}&to=${to.toISOString()}`,
      ),
    enabled: !!propertyId,
    staleTime: 5 * 60_000,
  })
}

export function useRateQuoteGrid(propertyId: string, from: Date, to: Date, ratePlanId?: string, enabled = true) {
  return useQuery<RateQuoteGrid & { ratePlanId: string | null }>({
    queryKey: [
      'rate-quote',
      propertyId,
      startOfDay(from).toISOString().slice(0, 10),
      startOfDay(to).toISOString().slice(0, 10),
      ratePlanId ?? 'base',
    ],
    queryFn: () =>
      api.get<RateQuoteGrid & { ratePlanId: string | null }>(
        `/v1/rates/quote?propertyId=${propertyId}&from=${from.toISOString()}&to=${to.toISOString()}${ratePlanId ? `&ratePlanId=${ratePlanId}` : ''}`,
      ),
    enabled: enabled && !!propertyId,
    staleTime: 60_000,
  })
}

// ── Rate Plans (RATES-METRICS Fase 1) ────────────────────────────────────────

export interface RateSeason {
  id: string; ratePlanId: string; roomTypeId: string | null; name: string
  startDate: string; endDate: string; overrideRate: string | null; multiplier: string | null
}
export interface RateRestriction {
  id: string; ratePlanId: string | null; roomTypeId: string | null
  validFrom: string; validTo: string; mlos: number | null; maxLos: number | null; cta: boolean; ctd: boolean
}
export interface RatePlan {
  id: string; propertyId: string; code: string; name: string
  baseStrategy: 'BAR' | 'FIXED' | 'MULTIPLIER'
  baseRate: string | null; baseMultiplier: string | null
  cancellationPolicy: string; isActive: boolean; visibleToChannels: string[]
  seasons: RateSeason[]; dayOfWeekRules: { id: string; dayOfWeek: number; multiplier: string }[]
  restrictions: RateRestriction[]
}

export function useRatePlans(propertyId: string) {
  return useQuery<RatePlan[]>({
    queryKey: ['rate-plans', propertyId],
    queryFn: () => api.get<RatePlan[]>(`/v1/rates/plans?propertyId=${propertyId}`),
    enabled: !!propertyId,
  })
}

type PlanInput = {
  code?: string; name?: string; baseStrategy?: 'BAR' | 'FIXED' | 'MULTIPLIER'
  baseRate?: number | null; baseMultiplier?: number | null; cancellationPolicy?: string; isActive?: boolean
}

export function useSaveRatePlan(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ planId, dto }: { planId?: string; dto: PlanInput }) =>
      planId
        ? api.patch(`/v1/rates/plans/${planId}?propertyId=${propertyId}`, dto)
        : api.post(`/v1/rates/plans`, { propertyId, ...dto }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rate-plans', propertyId] })
      toast.success('Plan de tarifa guardado')
    },
    onError: (e: Error) => toast.error(e.message ?? 'No se pudo guardar el plan'),
  })
}

export function useDeactivateRatePlan(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (planId: string) => api.delete(`/v1/rates/plans/${planId}?propertyId=${propertyId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rate-plans', propertyId] })
      toast.success('Plan desactivado')
    },
    onError: (e: Error) => toast.error(e.message ?? 'No se pudo desactivar'),
  })
}

export interface BulkOverridePreviewRow { roomTypeId: string; roomTypeName: string; date: string; current: number; next: number }
export interface BulkOverrideResult { dryRun: boolean; affectedCount: number; preview: BulkOverridePreviewRow[] }

export function useBulkOverride(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: { roomTypeIds: string[]; ratePlanId?: string; from: string; to: string; newRate: number; reason?: string; dryRun: boolean }) =>
      api.post<BulkOverrideResult>(`/v1/rates/overrides/bulk`, { propertyId, ...dto }),
    onSuccess: (res) => {
      if (!res.dryRun) {
        qc.invalidateQueries({ queryKey: ['rate-quote', propertyId] })
        toast.success(`${res.affectedCount} tarifas actualizadas`)
      }
    },
    onError: (e: Error) => toast.error(e.message ?? 'No se pudo aplicar el cambio'),
  })
}

// ── ARI batch (rates + restricciones) → 1 push a Channex ────────────────────
// Una línea por (tipo hab × plan × rango). El backend persiste + emite UN
// evento → el canal manager recibe 1 sola llamada (batching de la cert).
export interface ApplyAriLine {
  roomTypeId: string
  ratePlanId: string
  dateFrom: string // YYYY-MM-DD
  dateTo: string // YYYY-MM-DD
  rate?: number | null
  minStay?: number | null
  maxStay?: number | null
  cta?: boolean | null
  ctd?: boolean | null
  stopSell?: boolean | null
}
export interface ApplyAriResult { ok: true; lines: number; channexEntries: number }

export function useApplyAri(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (updates: ApplyAriLine[]) =>
      api.post<ApplyAriResult>(`/v1/rates/ari/batch`, { propertyId, updates }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['rate-quote', propertyId] })
      const synced = res.channexEntries > 0
        ? `Sincronizado con el canal (${res.channexEntries}).`
        : 'Guardado (sin canal conectado para estas combinaciones).'
      toast.success(`${res.lines} cambio(s) aplicados. ${synced}`)
    },
    onError: (e: Error) => toast.error(e.message ?? 'No se pudieron aplicar las restricciones'),
  })
}

export function useSetDayOfWeek(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ planId, rules }: { planId: string; rules: { dayOfWeek: number; multiplier: number }[] }) =>
      api.put(`/v1/rates/plans/${planId}/day-of-week`, { propertyId, rules }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rate-plans', propertyId] })
      qc.invalidateQueries({ queryKey: ['rate-quote', propertyId] })
      toast.success('Reglas por día guardadas')
    },
    onError: (e: Error) => toast.error(e.message ?? 'No se pudo guardar'),
  })
}

export function useSeasonMutations(propertyId: string) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['rate-plans', propertyId] })
  const create = useMutation({
    mutationFn: (dto: { ratePlanId: string; name: string; startDate: string; endDate: string; roomTypeId?: string; overrideRate?: number; multiplier?: number }) =>
      api.post(`/v1/rates/seasons`, { propertyId, ...dto }),
    onSuccess: () => { invalidate(); toast.success('Temporada creada') },
    onError: (e: Error) => toast.error(e.message ?? 'No se pudo crear la temporada'),
  })
  const remove = useMutation({
    mutationFn: (seasonId: string) => api.delete(`/v1/rates/seasons/${seasonId}?propertyId=${propertyId}`),
    onSuccess: () => { invalidate(); toast.success('Temporada eliminada') },
    onError: (e: Error) => toast.error(e.message ?? 'No se pudo eliminar'),
  })
  return { create, remove }
}
