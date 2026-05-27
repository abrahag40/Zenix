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
  | 'plan-discount'
  | 'activation'

export type WizardPlanTier = 'STARTER' | 'PRO' | 'ENTERPRISE'
export type WizardBillingCycle = 'monthly' | 'annual'
export type WizardDiscountDuration = 'once' | 'repeating' | 'forever'

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
  /** ID estable del catálogo LATAM. Si null → user escribió libre. */
  cityId?: string | null
  /** Fallback free text si cityId=null (Day 15+ reconcilia con Google Places). */
  cityFreeText?: string
  /** Display name resuelto — sea del catálogo o free text. Para mostrar/audit. */
  cityDisplay?: string
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

  // Step 5 — Inventory template + draft editable
  inventoryTemplate: 'HOSTAL' | 'BOUTIQUE' | 'CABAÑAS' | 'BUSINESS' | 'CUSTOM'
  /** Room types draft — pre-poblado del template seleccionado, editable
   *  por el consultor antes de activar. Backend materializa al activar. */
  inventoryRoomTypes: WizardRoomTypeDraft[]
  /** Rate plans draft — mismo patrón. */
  inventoryRatePlans: WizardRatePlanDraft[]

  // Step 6 — Staff
  orgOwnerEmail: string
  orgOwnerName: string

  // Step 7.5 — Plan + descuento (Sprint BILLING-CORE Day 6)
  planTier: WizardPlanTier
  billingCycle: WizardBillingCycle
  /** Días de trial — 0 = sin trial. Recomendado 14d para piloto. */
  trialDays: number
  /** Sprint DISCOUNT-CODES Day 4 — template pre-configurado del consultor.
   *  Si set, prevalece sobre los campos manuales abajo. Cliente NO ve el
   *  cap del partner tier (solo el código aplicado). */
  discountTemplateId: string | null
  /** Toggle "Configurar descuento manual" — solo se usa cuando NO hay
   *  template seleccionado. Por default collapsed/disabled. */
  discountEnabled: boolean
  /** 5-50%. Cap se valida server-side contra PartnerTier del consultor.
   *  Solo usado en manual override (sin templateId). */
  discountPercentOff: number
  discountDuration: WizardDiscountDuration
  /** Required si discountDuration='repeating' (1-12). */
  discountDurationInMonths: number
  /** Razón visible en audit log (min 20 chars al activar). */
  discountReason: string

  // Mutations
  setStep: (step: WizardStepKey) => void
  markCompleted: (step: WizardStepKey) => void
  setField: <K extends keyof Omit<WizardState, 'completedSteps' | 'setStep' | 'markCompleted' | 'setField' | 'addProperty' | 'removeProperty' | 'updateProperty' | 'addRoomType' | 'updateRoomType' | 'removeRoomType' | 'addRatePlan' | 'updateRatePlan' | 'removeRatePlan' | 'loadInventoryTemplate' | 'reset'>>(
    key: K,
    value: WizardState[K],
  ) => void
  addProperty: (p: Omit<WizardProperty, 'tempId'>) => void
  removeProperty: (tempId: string) => void
  updateProperty: (tempId: string, patch: Partial<WizardProperty>) => void
  addRoomType: (rt: Omit<WizardRoomTypeDraft, 'tempId'>) => void
  updateRoomType: (tempId: string, patch: Partial<WizardRoomTypeDraft>) => void
  removeRoomType: (tempId: string) => void
  addRatePlan: (rp: Omit<WizardRatePlanDraft, 'tempId'>) => void
  updateRatePlan: (tempId: string, patch: Partial<WizardRatePlanDraft>) => void
  removeRatePlan: (tempId: string) => void
  /** Reemplaza inventoryRoomTypes/RatePlans con los defaults del template. */
  loadInventoryTemplate: (template: WizardState['inventoryTemplate']) => void
  reset: () => void
}

export interface WizardRoomTypeDraft {
  tempId: string
  name: string
  count: number
  capacity: number
  /** Base rate sugerido (currency = legalEntityBaseCurrency). Opcional —
   *  cliente puede ajustar después en Nova / Channex / Rate plans. */
  baseRate?: number
}

export interface WizardRatePlanDraft {
  tempId: string
  name: string
  /** Etiqueta corta para descripción (BAR, Advance Purchase, etc.). */
  shortLabel?: string
}

// Templates de inventario — semilla pre-config. El consultor puede editarlos
// inline en Step 5 (add/remove/rename/cambiar capacity/rate) antes de activar.
const INVENTORY_TEMPLATES: Record<
  WizardState['inventoryTemplate'],
  { roomTypes: Omit<WizardRoomTypeDraft, 'tempId'>[]; ratePlans: Omit<WizardRatePlanDraft, 'tempId'>[] }
> = {
  HOSTAL: {
    roomTypes: [
      { name: 'Dorm 8 camas mixto', count: 2, capacity: 8, baseRate: 350 },
      { name: 'Dorm 6 camas femenino', count: 1, capacity: 6, baseRate: 400 },
      { name: 'Privada doble', count: 4, capacity: 2, baseRate: 900 },
      { name: 'Privada con baño', count: 2, capacity: 2, baseRate: 1200 },
    ],
    ratePlans: [
      { name: 'BAR (Best Available)', shortLabel: 'BAR' },
      { name: 'Non-refundable -10%', shortLabel: 'NR' },
    ],
  },
  BOUTIQUE: {
    roomTypes: [
      { name: 'Standard Queen', count: 8, capacity: 2, baseRate: 1800 },
      { name: 'Deluxe King', count: 6, capacity: 2, baseRate: 2400 },
      { name: 'Junior Suite', count: 3, capacity: 3, baseRate: 3500 },
      { name: 'Master Suite', count: 1, capacity: 4, baseRate: 5500 },
    ],
    ratePlans: [
      { name: 'BAR', shortLabel: 'BAR' },
      { name: 'Advance Purchase -15%', shortLabel: 'AP15' },
      { name: 'Direct Member Rate', shortLabel: 'DIRECT' },
    ],
  },
  CABAÑAS: {
    roomTypes: [
      { name: 'Cabaña 2 personas', count: 4, capacity: 2, baseRate: 2200 },
      { name: 'Cabaña familiar 4 personas', count: 3, capacity: 4, baseRate: 3800 },
      { name: 'Tienda glamping', count: 2, capacity: 2, baseRate: 1800 },
    ],
    ratePlans: [
      { name: 'BAR', shortLabel: 'BAR' },
      { name: 'Estancia mínima 2 noches', shortLabel: 'MIN2' },
    ],
  },
  BUSINESS: {
    roomTypes: [
      { name: 'Standard Single', count: 12, capacity: 1, baseRate: 1500 },
      { name: 'Standard Double', count: 10, capacity: 2, baseRate: 1900 },
      { name: 'Executive', count: 6, capacity: 2, baseRate: 2800 },
      { name: 'Suite ejecutiva', count: 2, capacity: 2, baseRate: 4200 },
    ],
    ratePlans: [
      { name: 'BAR', shortLabel: 'BAR' },
      { name: 'Corporate Rate', shortLabel: 'CORP' },
      { name: 'Government Rate', shortLabel: 'GOB' },
      { name: 'Long Stay -20% (7+ noches)', shortLabel: 'LS20' },
    ],
  },
  CUSTOM: {
    roomTypes: [],
    ratePlans: [],
  },
}

function makeDraftId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
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
  inventoryRoomTypes: [] as WizardRoomTypeDraft[],
  inventoryRatePlans: [] as WizardRatePlanDraft[],
  orgOwnerEmail: '',
  orgOwnerName: '',
  planTier: 'PRO' as WizardPlanTier,
  billingCycle: 'monthly' as WizardBillingCycle,
  trialDays: 14,
  discountTemplateId: null as string | null,
  discountEnabled: false,
  discountPercentOff: 15,
  discountDuration: 'repeating' as WizardDiscountDuration,
  discountDurationInMonths: 3,
  discountReason: '',
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

      // ── Inventory drafts (Step 5) ──────────────────────────────────────
      addRoomType: (rt) =>
        set((state) => ({
          inventoryRoomTypes: [
            ...state.inventoryRoomTypes,
            { ...rt, tempId: makeDraftId('rt') },
          ],
        })),

      updateRoomType: (tempId, patch) =>
        set((state) => ({
          inventoryRoomTypes: state.inventoryRoomTypes.map((rt) =>
            rt.tempId === tempId ? { ...rt, ...patch } : rt,
          ),
        })),

      removeRoomType: (tempId) =>
        set((state) => ({
          inventoryRoomTypes: state.inventoryRoomTypes.filter((rt) => rt.tempId !== tempId),
        })),

      addRatePlan: (rp) =>
        set((state) => ({
          inventoryRatePlans: [
            ...state.inventoryRatePlans,
            { ...rp, tempId: makeDraftId('rp') },
          ],
        })),

      updateRatePlan: (tempId, patch) =>
        set((state) => ({
          inventoryRatePlans: state.inventoryRatePlans.map((rp) =>
            rp.tempId === tempId ? { ...rp, ...patch } : rp,
          ),
        })),

      removeRatePlan: (tempId) =>
        set((state) => ({
          inventoryRatePlans: state.inventoryRatePlans.filter((rp) => rp.tempId !== tempId),
        })),

      loadInventoryTemplate: (template) =>
        set(() => {
          const tpl = INVENTORY_TEMPLATES[template]
          return {
            inventoryTemplate: template,
            inventoryRoomTypes: tpl.roomTypes.map((rt) => ({ ...rt, tempId: makeDraftId('rt') })),
            inventoryRatePlans: tpl.ratePlans.map((rp) => ({ ...rp, tempId: makeDraftId('rp') })),
          }
        }),

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
  { key: 'plan-discount', number: 8, label: 'Plan y cobro', hint: 'Plan + descuento opcional' },
  { key: 'activation', number: 9, label: 'Activación', hint: 'Go-live + setup link' },
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
    case 'plan-discount':
      if (!['STARTER', 'PRO', 'ENTERPRISE'].includes(s.planTier))
        return { ok: false, reason: 'Selecciona un plan válido' }
      if (s.discountEnabled) {
        if (s.discountPercentOff < 5 || s.discountPercentOff > 50)
          return { ok: false, reason: 'Descuento debe estar entre 5% y 50%' }
        if (s.discountDuration === 'repeating' && (s.discountDurationInMonths < 1 || s.discountDurationInMonths > 12))
          return { ok: false, reason: 'Duración debe estar entre 1 y 12 meses' }
        if (s.discountReason.trim().length < 20)
          return { ok: false, reason: 'Razón del descuento requerida (mín. 20 caracteres)' }
      }
      return { ok: true }
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
