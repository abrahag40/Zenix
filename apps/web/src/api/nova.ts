/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 9.
 *
 * API helpers para los endpoints Nova. Todos pasan por `api.*` (client.ts)
 * que ya inyecta Bearer token + timeouts.
 *
 * Headers Nova específicos:
 *   - X-Acting-Organization-Id   → set por NovaClient automáticamente desde useNovaStore
 *   - X-On-Behalf-Of-User-Id     → solo cuando hay impersonation activa
 *   - X-Impersonation-Reason     → REQUIRED si el header anterior está presente
 *
 * Endpoints expuestos:
 *   - listClients()                          → GET /v1/nova/clients
 *   - getRateCalendar(propertyId, from, to)  → Day 6 endpoint
 *   - bulkUpdateRateCalendar(propertyId, entries)
 *   - listMappingsProposal(propertyId)
 *   - bulkUpdateMappings(propertyId, mappings)
 *   - listChannelPauses(propertyId)
 *   - pauseChannel(propertyId, channelId, name, reason)
 *   - unpauseChannel(propertyId, pauseId, reason)
 */
import { api } from './client'
import { useNovaStore } from '../store/nova'

export interface NovaClientRow {
  id: string
  name: string
  slug: string
  subtitle: string
  assignmentScope?: string | null
  status: string
  activatedAt: string | null
}

/**
 * Builds extra headers per-request usando el state actual de la store.
 * Llamado por cada helper. Cada request "viaja" con el contexto actual
 * de impersonation/acting-org.
 */
function novaHeaders(opts: { requireActingOrg?: boolean } = {}): Record<string, string> {
  const state = useNovaStore.getState()
  const headers: Record<string, string> = {}
  if (state.actingOrgId) {
    headers['X-Acting-Organization-Id'] = state.actingOrgId
  } else if (opts.requireActingOrg) {
    throw new Error(
      'Nova: no acting organization seleccionada — ve a /nova/clientes y elige un cliente primero',
    )
  }
  if (state.onBehalfOfUserId) {
    headers['X-On-Behalf-Of-User-Id'] = state.onBehalfOfUserId
    if (!state.impersonationReason) {
      throw new Error(
        'Nova: impersonation activa pero sin razón — re-confirma motivo o detén impersonation',
      )
    }
    headers['X-Impersonation-Reason'] = state.impersonationReason
  }
  return headers
}

// ── Endpoints ──────────────────────────────────────────────────────────────

export function listClients(): Promise<NovaClientRow[]> {
  // /clients NO requiere actingOrgId — es justamente el endpoint que se
  // consulta antes de tener uno.
  return api.get<NovaClientRow[]>('/v1/nova/clients')
}

// ── Properties (de la org en scope) ───────────────────────────────────────

export interface PropertyRow {
  id: string
  name: string
  type: string | null
}

/** Lista properties de la actingOrg (consultor) o de la propia org (ORG_OWNER). */
export function listPropertiesOfActingOrg(): Promise<PropertyRow[]> {
  // El backend ya filtra por organizationId via TenantContext middleware.
  // Para Nova consultor, el header X-Acting-Organization-Id setea el scope.
  return api.get<PropertyRow[]>('/v1/properties', {
    headers: novaHeaders({ requireActingOrg: true }),
  })
}

// ── Channex Status (admin overview) ───────────────────────────────────────

export interface ChannexStatusOverview {
  propertyId: string
  outboxQueueDepth?: { kind: string; status: string; count: number }[]
  webhookLastReceivedAt?: string | null
  webhookCount24h?: number
  feedSchedulerLastRunAt?: string | null
  fullSyncLastRunAt?: string | null
  fullSyncNextEligibleAt?: string | null
  deadLetterCount?: number
  tokenBucketSnapshot?: { kind: string; remaining: number; capacity: number }[]
  [key: string]: unknown // backend puede ir agregando campos
}

export function getChannexStatus(propertyId: string): Promise<ChannexStatusOverview> {
  return api.get<ChannexStatusOverview>(
    `/v1/admin/channex/status/${propertyId}`,
    { headers: novaHeaders({ requireActingOrg: true }) },
  )
}

// ── Room Types CRUD ───────────────────────────────────────────────────────

export interface ChannexRoomTypeRow {
  id: string
  title: string
  count_of_rooms: number
  occ_adults: number
  occ_children: number
  occ_infants: number
  default_occupancy: number
  room_kind?: string
}

export function listRoomTypes(propertyId: string): Promise<ChannexRoomTypeRow[]> {
  return api.get<ChannexRoomTypeRow[]>(
    `/v1/nova/channex/properties/${propertyId}/room-types`,
    { headers: novaHeaders({ requireActingOrg: true }) },
  )
}

export function createRoomType(
  propertyId: string,
  input: {
    title: string
    countOfRooms: number
    occAdults: number
    occChildren?: number
    occInfants?: number
    defaultOccupancy?: number
    roomKind?: 'room' | 'dorm'
  },
): Promise<ChannexRoomTypeRow> {
  return api.post<ChannexRoomTypeRow>(
    `/v1/nova/channex/properties/${propertyId}/room-types`,
    input,
    { headers: novaHeaders({ requireActingOrg: true }) },
  )
}

export function deleteRoomType(
  propertyId: string,
  channexRoomTypeId: string,
  opts: { force?: boolean } = {},
): Promise<{ deleted: true }> {
  const qs = opts.force ? '?force=true' : ''
  return api.delete<{ deleted: true }>(
    `/v1/nova/channex/properties/${propertyId}/room-types/${channexRoomTypeId}${qs}`,
    { headers: novaHeaders({ requireActingOrg: true }) },
  )
}

// ── Rate Plans CRUD ───────────────────────────────────────────────────────

export interface ChannexRatePlanRow {
  id?: string
  mappingId?: string
  channexRatePlanId?: string
  channexRoomTypeId: string
  title: string
  currency: string
  sellMode?: string
  rateMode?: string
  defaultRate?: number
  defaultOccupancy?: number
  isActive?: boolean
}

export function listRatePlans(propertyId: string): Promise<ChannexRatePlanRow[]> {
  return api.get<ChannexRatePlanRow[]>(
    `/v1/nova/channex/properties/${propertyId}/rate-plans`,
    { headers: novaHeaders({ requireActingOrg: true }) },
  )
}

export function createRatePlan(
  propertyId: string,
  input: {
    roomTypeId: string
    title: string
    currency: string
    rateCents: number
    occupancy?: number
    sellMode?: 'per_room' | 'per_person'
    rateMode?: 'manual' | 'derived'
  },
): Promise<ChannexRatePlanRow> {
  return api.post<ChannexRatePlanRow>(
    `/v1/nova/channex/properties/${propertyId}/rate-plans`,
    input,
    { headers: novaHeaders({ requireActingOrg: true }) },
  )
}

export function deleteRatePlan(
  propertyId: string,
  channexRatePlanId: string,
): Promise<{ deleted: true }> {
  return api.delete<{ deleted: true }>(
    `/v1/nova/channex/properties/${propertyId}/rate-plans/${channexRatePlanId}`,
    { headers: novaHeaders({ requireActingOrg: true }) },
  )
}

// ── Rate Calendar types (mirror del backend Day 6) ─────────────────────────

export interface RateCalendarCell {
  date: string
  ratePlanId: string
  rate: number | null
  rateSource: 'CHANNEX' | 'DEFAULT' | 'UNSET'
  minStayArrival?: number
  minStayThrough?: number
  maxStay?: number
  closedToArrival?: boolean
  closedToDeparture?: boolean
  stopSell?: boolean
  capViolation?: boolean
}

export interface RateCalendarRatePlanRow {
  ratePlanId: string
  channexRatePlanId: string
  channexRoomTypeId: string
  title: string
  currency: string
  defaultRate: number
  defaultOccupancy: number
  rateCapMin: number | null
  rateCapMax: number | null
  rateCapReason: string | null
  cells: RateCalendarCell[]
}

export interface RateCalendarParityIssue {
  date: string
  channexRoomTypeId: string
  spreadPct: number
  minRate: number
  maxRate: number
  ratePlanIds: string[]
}

export interface RateCalendarMatrix {
  propertyId: string
  dateFrom: string
  dateTo: string
  currency: string
  parityThresholdPct: number
  fromChannex: boolean
  ratePlans: RateCalendarRatePlanRow[]
  parityIssues: RateCalendarParityIssue[]
}

export interface RateCalendarBulkEntry {
  ratePlanId: string
  date: string
  rate?: number
  minStayArrival?: number
  minStayThrough?: number
  maxStay?: number
  closedToArrival?: boolean
  closedToDeparture?: boolean
  stopSell?: boolean
}

export interface BulkUpdateResult {
  accepted: number
  rejected: { entry: RateCalendarBulkEntry; reason: string }[]
}

export function getRateCalendar(
  propertyId: string,
  from: string,
  to: string,
): Promise<RateCalendarMatrix> {
  return api.get<RateCalendarMatrix>(
    `/v1/nova/channex/properties/${propertyId}/rate-calendar?from=${from}&to=${to}`,
    { headers: novaHeaders({ requireActingOrg: true }) },
  )
}

export function bulkUpdateRateCalendar(
  propertyId: string,
  entries: RateCalendarBulkEntry[],
  reason?: string,
): Promise<BulkUpdateResult> {
  return api.patch<BulkUpdateResult>(
    `/v1/nova/channex/properties/${propertyId}/rate-calendar/bulk`,
    { entries, reason },
    { headers: novaHeaders({ requireActingOrg: true }) },
  )
}

export function expandTemplate(
  propertyId: string,
  template: {
    ratePlanId: string
    dateFrom: string
    dateTo: string
    weekdayRates: Partial<Record<'mo' | 'tu' | 'we' | 'th' | 'fr' | 'sa' | 'su', number>>
  },
): Promise<{ entries: RateCalendarBulkEntry[] }> {
  return api.post<{ entries: RateCalendarBulkEntry[] }>(
    `/v1/nova/channex/properties/${propertyId}/rate-calendar/expand-template`,
    template,
    { headers: novaHeaders({ requireActingOrg: true }) },
  )
}

export function listMappingsProposal(propertyId: string): Promise<any> {
  return api.get(`/v1/nova/channex/properties/${propertyId}/mappings/proposal`, {
    headers: novaHeaders({ requireActingOrg: true }),
  })
}

export function getMappingsHealth(propertyId: string): Promise<any> {
  return api.get(`/v1/nova/channex/properties/${propertyId}/mappings/health`, {
    headers: novaHeaders({ requireActingOrg: true }),
  })
}

export function bulkUpdateMappings(
  propertyId: string,
  mappings: Array<{ roomId: string; channexRoomTypeId: string | null }>,
  reason?: string,
): Promise<any> {
  return api.patch(
    `/v1/nova/channex/properties/${propertyId}/mappings/rooms`,
    { mappings, reason },
    { headers: novaHeaders({ requireActingOrg: true }) },
  )
}

export function listChannelPauses(propertyId: string): Promise<any> {
  return api.get(`/v1/nova/channex/properties/${propertyId}/channel-pauses`, {
    headers: novaHeaders({ requireActingOrg: true }),
  })
}

export function pauseChannel(
  propertyId: string,
  channexChannelId: string,
  channelName: string,
  pauseReason?: string,
): Promise<any> {
  return api.post(
    `/v1/nova/channex/properties/${propertyId}/channel-pauses`,
    { channexChannelId, channelName, pauseReason },
    { headers: novaHeaders({ requireActingOrg: true }) },
  )
}

export function unpauseChannel(
  propertyId: string,
  pauseId: string,
  unpauseReason?: string,
): Promise<any> {
  return api.post(
    `/v1/nova/channex/properties/${propertyId}/channel-pauses/${pauseId}/unpause`,
    { unpauseReason },
    { headers: novaHeaders({ requireActingOrg: true }) },
  )
}
