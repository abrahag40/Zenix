/**
 * Wizard API client — Day 16.
 *
 * Surface: /v1/nova/wizard/*
 *
 * Mantiene el contrato alineado con `apps/api/src/nova/wizard/dto/wizard-dto.ts`.
 * Cambios al DTO requieren update simultáneo en ambos lados.
 */
import { api } from '../../api/client'
import type { WizardState } from '../../store/wizard'

export interface HealthCheckResponse {
  status: 'success' | 'warning' | 'error'
  message: string
  latencyMs: number
  detail?: Record<string, unknown>
}

export interface WizardActivateResponse {
  organizationId: string
  legalEntityId: string
  brandId: string | null
  propertyIds: string[]
  orgOwnerUserId: string
  ownerSetupLink: string
  activatedAt: string
  auditLogged: boolean
  /** Day 18 — Resend auto-email del setup link al Org Owner. false si no
   *  hay RESEND_API_KEY configurada O si Resend devolvió error. El frontend
   *  muestra fallback copy-paste del link en ambos casos. */
  emailSent: boolean
}

// ─── Health checks ────────────────────────────────────────────────────

export const wizardClient = {
  healthChannex: (channexPropertyId?: string) =>
    api.post<HealthCheckResponse>('/v1/nova/wizard/health/channex', {
      channexPropertyId,
    }),

  healthStripe: (connectAccountId?: string) =>
    api.post<HealthCheckResponse>('/v1/nova/wizard/health/stripe', {
      connectAccountId,
    }),

  healthPac: (pacAdapter: string, taxId?: string) =>
    api.post<HealthCheckResponse>('/v1/nova/wizard/health/pac', {
      pacAdapter,
      taxId,
    }),

  healthSmtp: (toAddress: string) =>
    api.post<HealthCheckResponse>('/v1/nova/wizard/health/smtp', {
      toAddress,
    }),

  /** Activación transaccional final del wizard. */
  activate: (state: WizardState, pacOverrideAccepted: boolean) =>
    api.post<WizardActivateResponse>('/v1/nova/wizard/activate', {
      // Step 1
      organizationName: state.organizationName,
      organizationSlug: state.organizationSlug,
      organizationCountryCode: state.organizationCountryCode,
      organizationTimezone: state.organizationTimezone,
      // Step 2
      brandEnabled: state.brandEnabled,
      brandName: state.brandName || undefined,
      brandLogoUrl: state.brandLogoUrl || undefined,
      // Step 3
      legalEntityName: state.legalEntityName,
      legalEntityTaxId: state.legalEntityTaxId,
      legalEntityRegime: state.legalEntityRegime,
      legalEntityBaseCurrency: state.legalEntityBaseCurrency,
      legalEntityPacAdapter: state.legalEntityPacAdapter,
      // Step 4 — strip tempId del payload
      properties: state.properties.map((p) => ({
        name: p.name,
        type: p.type,
        timezone: p.timezone,
        cityId: p.cityId ?? undefined,
        cityFreeText: p.cityFreeText || undefined,
        cityDisplay: p.cityDisplay || undefined,
      })),
      // Step 5
      inventoryTemplate: state.inventoryTemplate,
      // Step 6
      orgOwnerEmail: state.orgOwnerEmail,
      orgOwnerName: state.orgOwnerName,
      // Step 7 override
      pacOverrideAccepted,
    }),
}
