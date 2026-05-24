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

export function getRateCalendar(
  propertyId: string,
  from: string,
  to: string,
): Promise<any> {
  return api.get(
    `/v1/nova/channex/properties/${propertyId}/rate-calendar?from=${from}&to=${to}`,
    { headers: novaHeaders({ requireActingOrg: true }) },
  )
}

export function bulkUpdateRateCalendar(
  propertyId: string,
  entries: any[],
  reason?: string,
): Promise<any> {
  return api.patch(
    `/v1/nova/channex/properties/${propertyId}/rate-calendar/bulk`,
    { entries, reason },
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
