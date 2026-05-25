/**
 * Step 3 — LegalEntity (§64-§89).
 *
 * Razón social fiscal + PAC adapter selection + currency base.
 * Esto driveá toda la emisión CFDI/DIAN/SUNAT futura (§89 IFiscalAdapter
 * Strategy pattern).
 */
import { useWizardStore } from '../../../store/wizard'
import { WizardLayout } from './WizardLayout'
import { Surface, Body, Subhead, Caption, Code, Chip } from '../../design-system'
import { CheckCircle2, AlertCircle } from 'lucide-react'

// ─── Tax ID validation per country ────────────────────────────────────
// SAT México NO expone API pública para validar RFC contra padrón
// (requiere e.firma del propio contribuyente). PACs comerciales sí
// validan al timbrar (Step 7 health check). Por ahora: regex format.
//
// Formato RFC (Art. 18 RMF):
//   Persona Moral:  3 letras + 6 dígitos fecha + 3 alfanuméricos = 12 chars
//   Persona Física: 4 letras + 6 dígitos + 3 alfanuméricos       = 13 chars
//   Generic XAXX010101000 (extranjero) válido para hospedaje turístico.

const RFC_PATTERNS: Record<string, { regex: RegExp; expectedLength: number; hint: string }> = {
  MX: {
    regex: /^([A-ZÑ&]{3,4})\d{6}[A-Z0-9]{3}$/,
    expectedLength: 13,
    hint: 'Formato MX: 3-4 letras + 6 dígitos fecha (YYMMDD) + 3 alfanuméricos',
  },
  CO: {
    regex: /^\d{8,10}-?\d?$/,
    expectedLength: 9,
    hint: 'Formato CO NIT: 8-10 dígitos con dígito de verificación',
  },
  PE: {
    regex: /^\d{11}$/,
    expectedLength: 11,
    hint: 'Formato PE RUC: 11 dígitos exactos',
  },
  CR: {
    regex: /^\d{9,12}$/,
    expectedLength: 10,
    hint: 'Formato CR cédula jurídica: 10 dígitos',
  },
}

function validateTaxId(taxId: string, countryCode: string): { valid: boolean; reason?: string } {
  const pattern = RFC_PATTERNS[countryCode]
  if (!pattern) return { valid: taxId.length > 0 } // Países sin regex específica
  const trimmed = taxId.trim().toUpperCase()
  if (trimmed.length === 0) return { valid: false }
  if (!pattern.regex.test(trimmed)) {
    return { valid: false, reason: pattern.hint }
  }
  return { valid: true }
}

// PAC adapters disponibles (sub-modulo §89 + §171 D-NOVA-13 Step 7 health check)
const PAC_ADAPTERS: Record<string, { label: string; description: string }[]> = {
  MX: [
    { label: 'MX_FACTURAMA', description: 'Facturama (default, sandbox + prod ready)' },
    { label: 'MX_SW_SAPIEN', description: 'SW Sapien (alternativa Facturama)' },
  ],
  CO: [{ label: 'CO_DIAN', description: 'DIAN UBL 2.1' }],
  CR: [{ label: 'CR_HACIENDA', description: 'Tribu-CR Costa Rica' }],
  PE: [{ label: 'PE_SUNAT', description: 'SUNAT FE Perú' }],
}

const REGIMES_MX = [
  { code: 'PERSONA_MORAL', label: 'Persona Moral (S.A. de C.V., etc.)' },
  { code: 'PERSONA_FISICA_ACTIVIDAD', label: 'Persona Física con Actividad Empresarial' },
  { code: 'PERSONA_FISICA_REGIMEN_INC', label: 'Persona Física Régimen Incorporación' },
  { code: 'COORDINADO', label: 'Coordinado (transporte/agrícola)' },
]

const CURRENCIES = ['MXN', 'USD', 'EUR', 'COP', 'CRC', 'PEN', 'ARS']

export function StepLegalEntity() {
  const state = useWizardStore()
  const adapters = PAC_ADAPTERS[state.organizationCountryCode] ?? PAC_ADAPTERS.MX

  return (
    <WizardLayout
      title="Legal Entity (razón social)"
      description="Entidad fiscal que emitirá CFDIs / facturas. Si el cliente tiene múltiples razones sociales (multi-property con entidades distintas), agregaremos más LegalEntities después del wizard."
    >
      <Surface variant="raised" radius="lg" padding="lg" className="space-y-5">
        <Field label="Razón social legal" hint='Ej: "Tulum Boutique Hospitality S.A. de C.V."'>
          <input
            type="text"
            value={state.legalEntityName}
            onChange={(e) => state.setField('legalEntityName', e.target.value)}
            placeholder="Razón social completa"
            className="w-full px-3.5 h-10 rounded-lg border border-slate-300 text-[14px] focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          />
        </Field>

        {(() => {
          const validation = validateTaxId(
            state.legalEntityTaxId,
            state.organizationCountryCode,
          )
          const showFeedback = state.legalEntityTaxId.length >= 3
          const taxIdLabel =
            state.organizationCountryCode === 'MX'
              ? 'RFC (México)'
              : state.organizationCountryCode === 'CO'
                ? 'NIT (Colombia)'
                : state.organizationCountryCode === 'PE'
                  ? 'RUC (Perú)'
                  : state.organizationCountryCode === 'CR'
                    ? 'Cédula jurídica (Costa Rica)'
                    : 'Tax ID'
          return (
            <Field
              label={taxIdLabel}
              hint={
                <span className="space-y-0.5 block">
                  <span className="block">
                    {RFC_PATTERNS[state.organizationCountryCode]?.hint ??
                      'Formato según país. Validación final al timbrar (Step 7).'}
                  </span>
                  <span className="block text-[10px] text-slate-400">
                    Nota: SAT/DIAN/SUNAT NO exponen API pública gratuita para validar contra padrón.
                    Validación final al timbrar test CFDI en Step 7.
                  </span>
                </span>
              }
            >
              <div className="relative">
                <input
                  type="text"
                  value={state.legalEntityTaxId}
                  onChange={(e) =>
                    state.setField('legalEntityTaxId', e.target.value.toUpperCase().slice(0, 14))
                  }
                  placeholder={
                    state.organizationCountryCode === 'MX'
                      ? 'TBH240501ABC'
                      : state.organizationCountryCode === 'CO'
                        ? '900123456-7'
                        : state.organizationCountryCode === 'PE'
                          ? '20123456789'
                          : 'Tax ID'
                  }
                  className={
                    'w-full px-3.5 pr-10 h-10 rounded-lg border text-[14px] font-mono uppercase focus:outline-none focus:ring-2 transition-colors ' +
                    (!showFeedback
                      ? 'border-slate-300 focus:ring-violet-500/30'
                      : validation.valid
                        ? 'border-emerald-300 focus:ring-emerald-500/30 bg-emerald-50/30'
                        : 'border-amber-300 focus:ring-amber-500/30 bg-amber-50/30')
                  }
                />
                {showFeedback && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {validation.valid ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-amber-600" aria-hidden />
                    )}
                  </div>
                )}
              </div>
              {showFeedback && !validation.valid && validation.reason && (
                <Caption tone="tertiary" className="block mt-1 text-amber-700">
                  {validation.reason}
                </Caption>
              )}
            </Field>
          )
        })()}

        {state.organizationCountryCode === 'MX' && (
          <Field label="Régimen fiscal">
            <select
              value={state.legalEntityRegime}
              onChange={(e) => state.setField('legalEntityRegime', e.target.value)}
              className="w-full px-3 h-10 rounded-lg border border-slate-300 text-[14px] bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            >
              {REGIMES_MX.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Currency base (ISO 4217)">
            <select
              value={state.legalEntityBaseCurrency}
              onChange={(e) => state.setField('legalEntityBaseCurrency', e.target.value)}
              className="w-full px-3 h-10 rounded-lg border border-slate-300 text-[14px] bg-white font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <Caption tone="tertiary" className="block mt-1">
              Currency en la que se emite CFDI. Diferente de display currency en booking
              engine (multi-currency display soportado §83).
            </Caption>
          </Field>

          <Field label="PAC Adapter (proveedor de timbrado)">
            <select
              value={state.legalEntityPacAdapter}
              onChange={(e) => state.setField('legalEntityPacAdapter', e.target.value)}
              className="w-full px-3 h-10 rounded-lg border border-slate-300 text-[14px] bg-white font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            >
              {adapters.map((a) => (
                <option key={a.label} value={a.label}>
                  {a.label}
                </option>
              ))}
            </select>
            <Caption tone="tertiary" className="block mt-1">
              {adapters.find((a) => a.label === state.legalEntityPacAdapter)?.description ?? ''}
            </Caption>
          </Field>
        </div>

        <Surface variant="sunken" radius="md" padding="md" tone="info">
          <div className="flex items-start gap-2">
            <Chip variant="info" intent="subtle" size="sm">
              Step 7
            </Chip>
            <Body tone="secondary" className="text-[12px] flex-1">
              <span className="font-semibold text-slate-900">Health check pendiente:</span> en
              Step 7 (Integrations) validaremos contra el PAC adapter elegido enviando un CFDI
              mock al sandbox. Si falla, el wizard NO permite activar.
            </Body>
          </div>
        </Surface>
      </Surface>
    </WizardLayout>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <Subhead tone="secondary" className="block mb-1.5">
        {label}
      </Subhead>
      {children}
      {hint && (
        <Caption tone="tertiary" className="block mt-1">
          {hint}
        </Caption>
      )}
    </label>
  )
}
