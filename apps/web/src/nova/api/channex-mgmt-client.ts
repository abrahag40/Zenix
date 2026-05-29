/**
 * Channex Management API client — Sprint CHANNEX-AUTO-PROVISION Day 5.
 *
 * Surface: /v1/nova/channex/*
 *
 * Mantiene contracts alineados con
 * apps/api/src/nova/wizard/channex-provision.controller.ts.
 *
 * Auth: X-Acting-Organization-Id injectado vía novaHeaders() — debe haber un
 * cliente seleccionado en useNovaStore antes de llamar.
 */
import { api } from '../../api/client'
import { useNovaStore } from '../../store/nova'

// ─────────────────────────────────────────────────────────────────────
// Types — espejo de ChannexProvisionService + DTO
// ─────────────────────────────────────────────────────────────────────

export type ChannexChannelType =
  | 'BookingCom'
  | 'ExpediaCom'
  | 'AirbnbCom'
  | 'AgodaCom'
  | 'GoogleHotelAds'
  | 'VRBOCom'
  | 'OpenChannel'

export type ProvisioningStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'partial'
  | 'failed'
  | null

export type ChannelStatus =
  | 'inactive'
  | 'pending_credentials'
  | 'connected'
  | 'requires_oauth'
  | 'error'

export interface ChannexProvisioningProperty {
  propertyId: string
  propertyName: string
  channexPropertyId: string | null
  provisioningStatus: ProvisioningStatus
  provisioningError: string | null
  lastProvisionedAt: string | null
  channels: Array<{
    id: string
    type: string
    title: string
    status: ChannelStatus | string
  }>
}

export interface ChannexProvisionResult {
  status: 'completed' | 'partial' | 'failed'
  groupId: string | null
  propertiesProvisioned: number
  roomTypesCreated: number
  ratePlansCreated: number
  channelsCreated: number
  channelsRequiringOauth: number
  channelsPendingCredentials: number
  errors: Array<{ step: string; propertyId?: string; message: string }>
}

export interface RetryChannelInput {
  type: ChannexChannelType
  title: string
  credentials?: Record<string, string>
  configureLater: boolean
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function actingOrgHeader(): Record<string, string> {
  const state = useNovaStore.getState()
  if (!state.actingOrgId) {
    throw new Error(
      'Nova: no acting organization seleccionada — ve a /nova/clientes y elige un cliente primero',
    )
  }
  return { 'X-Acting-Organization-Id': state.actingOrgId }
}

// ─────────────────────────────────────────────────────────────────────
// Client surface
// ─────────────────────────────────────────────────────────────────────

export const channexMgmtClient = {
  /** Lista provisioning status de todas las properties de la acting org. */
  listProvisioning: (): Promise<ChannexProvisioningProperty[]> =>
    api.get<ChannexProvisioningProperty[]>('/v1/nova/organizations/provisioning', {
      headers: actingOrgHeader(),
    }),

  /**
   * Re-dispara el provisioning para una Property. Idempotent por default — si
   * la property ya tiene mappings completos, retorna sin tocar Channex.
   *
   * `force=true` → delete + recreate de los channels provistos en BD/Channex
   * (caso: cliente cambió credentials Booking/Expedia y el partner exige
   * re-binding). NO usar cuando el canal está published — perdería reservas
   * en flight.
   */
  retryProvision: (
    propertyId: string,
    channels: RetryChannelInput[] = [],
    opts: { force?: boolean } = {},
  ): Promise<ChannexProvisionResult> =>
    api.post<ChannexProvisionResult>(
      `/v1/nova/properties/${propertyId}/channex/provision`,
      { channels, force: opts.force ?? false },
      { headers: actingOrgHeader() },
    ),

  /**
   * Completa credentials de un Channel pre-existente (status='pending_credentials').
   * Backend cifra AES-256-GCM antes de persistir + propaga a Channex via
   * updateChannel(settings). Si Channex rechaza las credentials, retorna 400.
   * Airbnb → 400 (requiere OAuth handshake en extranet, no admite manual).
   */
  completeChannelCredentials: (
    channelId: string,
    credentials: Record<string, string>,
  ): Promise<{
    id: string
    type: string
    title: string
    status: string
    lastSyncedAt: string | null
  }> =>
    api.post(
      `/v1/nova/channex/channels/${channelId}/credentials`,
      { credentials },
      { headers: actingOrgHeader() },
    ),
}
