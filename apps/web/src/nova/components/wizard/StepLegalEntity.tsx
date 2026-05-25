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

        <Field
          label={
            state.organizationCountryCode === 'MX'
              ? 'RFC (Mexico)'
              : state.organizationCountryCode === 'CO'
                ? 'NIT (Colombia)'
                : state.organizationCountryCode === 'PE'
                  ? 'RUC (Perú)'
                  : 'Tax ID'
          }
          hint="13 caracteres (RFC) / 9-10 caracteres según país. Case-insensitive, validamos al activar."
        >
          <input
            type="text"
            value={state.legalEntityTaxId}
            onChange={(e) =>
              state.setField('legalEntityTaxId', e.target.value.toUpperCase().slice(0, 13))
            }
            placeholder="TBH240501ABC"
            className="w-full px-3.5 h-10 rounded-lg border border-slate-300 text-[14px] font-mono uppercase focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          />
        </Field>

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
