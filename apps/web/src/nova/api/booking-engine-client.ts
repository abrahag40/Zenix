/**
 * Booking Engine Management API client — BOOKING-ENGINE B4.
 *
 * Surface: /v1/nova/booking-engine/*
 * Espejo de apps/api/src/public-booking/booking-engine-management.controller.ts.
 *
 * Auth: X-Acting-Organization-Id vía actingOrgHeader() — debe haber un cliente
 * seleccionado en useNovaStore antes de llamar.
 */
import { api } from '../../api/client'
import { useNovaStore } from '../../store/nova'

function actingOrgHeader(): Record<string, string> {
  const state = useNovaStore.getState()
  if (!state.actingOrgId) {
    throw new Error('Nova: elige un cliente en /nova/clientes primero')
  }
  return { 'X-Acting-Organization-Id': state.actingOrgId }
}

export interface BookingEnginePropertyRow {
  propertyId: string
  propertyName: string
  city: string | null
  configured: boolean
  enabled: boolean
  slug: string | null
}

export interface BookingEngineBranding {
  logoUrl: string | null
  primaryColor: string | null
  accentColor: string | null
  fontFamily: string | null
}

export interface BookingEngineConfigView {
  slug: string
  paymentPolicy: string
  heroTitle: string | null
  heroSubtitle: string | null
  termsUrl: string | null
  defaultLanguage: string
  displayCurrency: string | null
  marketplaceListingEnabled: boolean
  branding: BookingEngineBranding
  publicUrl: string
}

export interface BookingEngineApiKeyRow {
  id: string
  keyPrefix: string
  label: string
  environment: string
  allowedOrigins: string[]
  lastUsedAt: string | null
  createdAt: string
}

export interface BookingEngineWebhookRow {
  id: string
  url: string
  events: string[]
  active: boolean
  failureCount: number
  lastDeliveryAt: string | null
  createdAt: string
}

export interface BookingEngineState {
  propertyId: string
  propertyName: string | null
  enabled: boolean
  configured: boolean
  config: BookingEngineConfigView | null
  apiKeys: BookingEngineApiKeyRow[]
  webhooks: BookingEngineWebhookRow[]
}

const base = '/v1/nova/booking-engine'

export const bookingEngineClient = {
  list: (): Promise<BookingEnginePropertyRow[]> =>
    api.get(base, { headers: actingOrgHeader() }),

  get: (propertyId: string): Promise<BookingEngineState> =>
    api.get(`${base}/${propertyId}`, { headers: actingOrgHeader() }),

  toggle: (propertyId: string, enabled: boolean): Promise<BookingEngineState> =>
    api.post(`${base}/${propertyId}/toggle`, { enabled }, { headers: actingOrgHeader() }),

  updateConfig: (
    propertyId: string,
    body: Partial<{ slug: string; heroTitle: string; heroSubtitle: string; termsUrl: string; displayCurrency: string; marketplaceListingEnabled: boolean; branding: Partial<BookingEngineBranding> }>,
  ): Promise<BookingEngineState> =>
    api.put(`${base}/${propertyId}`, body, { headers: actingOrgHeader() }),

  generateApiKey: (
    propertyId: string,
    body: { label: string; environment?: 'live' | 'test'; allowedOrigins?: string[] },
  ): Promise<{ id: string; plaintextKey: string; keyPrefix: string }> =>
    api.post(`${base}/${propertyId}/api-keys`, body, { headers: actingOrgHeader() }),

  revokeApiKey: (propertyId: string, keyId: string): Promise<{ id: string; revoked: boolean }> =>
    api.delete(`${base}/${propertyId}/api-keys/${keyId}`, { headers: actingOrgHeader() }),

  createWebhook: (
    propertyId: string,
    body: { url: string; events?: string[] },
  ): Promise<{ id: string; url: string; events: string[]; secret: string }> =>
    api.post(`${base}/${propertyId}/webhooks`, body, { headers: actingOrgHeader() }),

  toggleWebhook: (propertyId: string, id: string, active: boolean): Promise<{ id: string; active: boolean }> =>
    api.post(`${base}/${propertyId}/webhooks/${id}/toggle`, { active }, { headers: actingOrgHeader() }),
}
