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
    api.get<ChannexProvisioningProperty[]>('/v1/nova/channex/provisioning', {
      headers: actingOrgHeader(),
    }),

  /**
   * Re-dispara el provisioning para una Property. Idempotent — si la property
   * ya tiene mappings completos, retorna sin tocar Channex. Si no se proveen
   * channels, solo re-intenta property + room types + rate plans existentes.
   */
  retryProvision: (
    propertyId: string,
    channels: RetryChannelInput[] = [],
  ): Promise<ChannexProvisionResult> =>
    api.post<ChannexProvisionResult>(
      `/v1/nova/channex/provision/${propertyId}`,
      { channels },
      { headers: actingOrgHeader() },
    ),
}
