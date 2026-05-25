/**
 * Wizard Zenix Activate — state durable cross-session.
 *
 * Sprint NOVA-CHANNEX-COMMAND-CENTER §171-§174.
 *
 * Persist en localStorage scoped por acting org — el consultor puede
 * pausar el wizard, salir, volver mañana, retomar exactamente donde quedó.
 *
 * Pattern SAP Activate "Realize Phase" — wizard durable, no transactional
 * (no se pierde el progreso si el browser crashea).
 *
 * Health checks state (Step 7): NO persiste — cada vez que abres Step 7
 * los re-ejecutas (los external services pueden haber cambiado entre
 * sesiones, e.g. el cliente activó Stripe mientras tanto).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type WizardStepKey =
  | 'customer-account'
  | 'brand'
  | 'legal-entity'
  | 'properties'
  | 'inventory'
  | 'staff'
  | 'integrations'
  | 'activation'

export interface WizardProperty {
  tempId: string // local-only id durante setup
  name: string
  type:
    | 'HOTEL'
    | 'HOSTAL'
    | 'BOUTIQUE'
    | 'GLAMPING'
    | 'ECO_LODGE'
    | 'VACATION_RENTAL'
  timezone: string
  region?: string
  city?: string
  channexPropertyId?: string
}

export interface WizardState {
  // Meta
  startedAt: string | null
  currentStep: WizardStepKey
  completedSteps: Set<WizardStepKey>

  // Step 1 — Customer Account
  organizationName: string
  organizationSlug: string
  organizationCountryCode: string
  organizationTimezone: string

  // Step 2 — Brand (opcional skip)
  brandEnabled: boolean
  brandName: string
  brandLogoUrl: string

  // Step 3 — LegalEntity
  legalEntityName: string
  legalEntityTaxId: string
  legalEntityRegime: string
  legalEntityBaseCurrency: string
  legalEntityPacAdapter: string

  // Step 4 — Properties (N items)
  properties: WizardProperty[]

  // Step 5 — Inventory template
  inventoryTemplate: 'HOSTAL' | 'BOUTIQUE' | 'CABAÑAS' | 'BUSINESS' | 'CUSTOM'

  // Step 6 — Staff
  orgOwnerEmail: string
  orgOwnerName: string

  // Mutations
  setStep: (step: WizardStepKey) => void
  markCompleted: (step: WizardStepKey) => void
  setField: <K extends keyof Omit<WizardState, 'completedSteps' | 'setStep' | 'markCompleted' | 'setField' | 'addProperty' | 'removeProperty' | 'updateProperty' | 'reset'>>(
    key: K,
    value: WizardState[K],
  ) => void
  addProperty: (p: Omit<WizardProperty, 'tempId'>) => void
  removeProperty: (tempId: string) => void
  updateProperty: (tempId: string, patch: Partial<WizardProperty>) => void
  reset: () => void
}

const initialState = {
  startedAt: null,
  currentStep: 'customer-account' as WizardStepKey,
  completedSteps: new Set<WizardStepKey>(),
  organizationName: '',
  organizationSlug: '',
  organizationCountryCode: 'MX',
  organizationTimezone: 'America/Cancun',
  brandEnabled: false,
  brandName: '',
  brandLogoUrl: '',
  legalEntityName: '',
  legalEntityTaxId: '',
  legalEntityRegime: 'PERSONA_MORAL',
  legalEntityBaseCurrency: 'MXN',
  legalEntityPacAdapter: 'MX_FACTURAMA',
  properties: [] as WizardProperty[],
  inventoryTemplate: 'BOUTIQUE' as WizardState['inventoryTemplate'],
  orgOwnerEmail: '',
  orgOwnerName: '',
}

export const useWizardStore = create<WizardState>()(
  persist(
    (set) => ({
      ...initialState,

      setStep: (step) =>
        set((state) => ({
          currentStep: step,
          startedAt: state.startedAt ?? new Date().toISOString(),
        })),

      markCompleted: (step) =>
        set((state) => {
          const next = new Set(state.completedSteps)
          next.add(step)
          return { completedSteps: next }
        }),

      setField: (key, value) => set({ [key]: value } as any),

      addProperty: (p) =>
        set((state) => ({
          properties: [
            ...state.properties,
            { ...p, tempId: `prop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
          ],
        })),

      removeProperty: (tempId) =>
        set((state) => ({
          properties: state.properties.filter((p) => p.tempId !== tempId),
        })),

      updateProperty: (tempId, patch) =>
        set((state) => ({
          properties: state.properties.map((p) => (p.tempId === tempId ? { ...p, ...patch } : p)),
        })),

      reset: () => set({ ...initialState, completedSteps: new Set<WizardStepKey>() }),
    }),
    {
      name: 'nova_wizard',
      // completedSteps es Set — JSON no lo serializa nativo
      partialize: (state: WizardState) => ({
        ...state,
        completedSteps: Array.from(state.completedSteps),
      }),
      onRehydrateStorage: () => (state: WizardState | undefined) => {
        if (state && Array.isArray((state as any).completedSteps)) {
          state.completedSteps = new Set((state as any).completedSteps)
        }
      },
    } as any,
  ),
)

// ─── Step metadata ──────────────────────────────────────────────────

export interface StepMeta {
  key: WizardStepKey
  number: number
  label: string
  hint: string
}

export const WIZARD_STEPS: StepMeta[] = [
  { key: 'customer-account', number: 1, label: 'Customer Account', hint: 'Cuenta del cliente' },
  { key: 'brand', number: 2, label: 'Brand', hint: 'Opcional — marca paraguas' },
  { key: 'legal-entity', number: 3, label: 'Legal Entity', hint: 'Razón social + PAC' },
  { key: 'properties', number: 4, label: 'Properties', hint: 'Propiedades del cliente' },
  { key: 'inventory', number: 5, label: 'Inventory', hint: 'Habitaciones + rate plans' },
  { key: 'staff', number: 6, label: 'Staff', hint: 'Org Owner + equipo' },
  { key: 'integrations', number: 7, label: 'Integrations', hint: '4 health-checks' },
  { key: 'activation', number: 8, label: 'Activación', hint: 'Go-live + setup link' },
]

// ─── Validation helpers (forcing functions per step) ───────────────

export function canCompleteStep(step: WizardStepKey, s: WizardState): { ok: boolean; reason?: string } {
  switch (step) {
    case 'customer-account':
      if (!s.organizationName.trim()) return { ok: false, reason: 'Nombre del cliente requerido' }
      if (s.organizationSlug.length < 3)
        return { ok: false, reason: 'Slug debe tener ≥3 caracteres' }
      return { ok: true }
    case 'brand':
      if (!s.brandEnabled) return { ok: true } // skip
      if (!s.brandName.trim()) return { ok: false, reason: 'Nombre del brand requerido si habilitado' }
      return { ok: true }
    case 'legal-entity':
      if (!s.legalEntityName.trim())
        return { ok: false, reason: 'Razón social requerida' }
      if (!s.legalEntityTaxId.trim()) return { ok: false, reason: 'Tax ID (RFC/RUC/NIT) requerido' }
      return { ok: true }
    case 'properties':
      if (s.properties.length === 0)
        return { ok: false, reason: 'Al menos 1 property requerida' }
      const invalid = s.properties.find((p) => !p.name.trim())
      if (invalid) return { ok: false, reason: 'Todas las properties necesitan nombre' }
      return { ok: true }
    case 'inventory':
      return { ok: true } // diferido a Day 15
    case 'staff':
      if (!s.orgOwnerEmail.includes('@'))
        return { ok: false, reason: 'Email válido del Org Owner requerido' }
      if (!s.orgOwnerName.trim())
        return { ok: false, reason: 'Nombre del Org Owner requerido' }
      return { ok: true }
    case 'integrations':
      return { ok: true } // health checks live, no se persisten
    case 'activation':
      return { ok: true }
  }
}

/** Slug auto-derive de orgName: lowercase + replace spaces/symbols. */
export function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}
