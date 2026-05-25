/**
 * Step 1 — Customer Account (§171 D-NOVA-13).
 *
 * Captura datos básicos del nuevo cliente: nombre, slug auto-derived,
 * country, timezone.
 */
import { useWizardStore, deriveSlug } from '../../../store/wizard'
import { WizardLayout } from './WizardLayout'
import {
  Surface,
  Subhead,
  Caption,
  Code,
  Body,
} from '../../design-system'

const COUNTRIES = [
  { code: 'MX', label: 'México', tz: 'America/Mexico_City' },
  { code: 'CO', label: 'Colombia', tz: 'America/Bogota' },
  { code: 'CR', label: 'Costa Rica', tz: 'America/Costa_Rica' },
  { code: 'PE', label: 'Perú', tz: 'America/Lima' },
  { code: 'AR', label: 'Argentina', tz: 'America/Argentina/Buenos_Aires' },
  { code: 'GT', label: 'Guatemala', tz: 'America/Guatemala' },
  { code: 'PA', label: 'Panamá', tz: 'America/Panama' },
  { code: 'SV', label: 'El Salvador', tz: 'America/El_Salvador' },
  { code: 'HN', label: 'Honduras', tz: 'America/Tegucigalpa' },
]

const TIMEZONES_MX = [
  'America/Cancun',
  'America/Mexico_City',
  'America/Hermosillo',
  'America/Tijuana',
  'America/Monterrey',
]

export function StepCustomerAccount() {
  const state = useWizardStore()

  return (
    <WizardLayout
      title="Customer Account"
      description="Identidad del cliente Zenix. Esto crea la Organization que será la raíz de la jerarquía (Brand → LegalEntity → Properties)."
    >
      <Surface variant="raised" radius="lg" padding="lg" className="space-y-5">
        <Field
          label="Nombre del cliente"
          hint='Display name visible para el equipo Zenix. Ej: "Hotel Boutique Tulum"'
        >
          <input
            type="text"
            value={state.organizationName}
            onChange={(e) => {
              const value = e.target.value
              state.setField('organizationName', value)
              // Auto-derive slug si el slug actual está vacío o matches el anterior derive
              if (
                !state.organizationSlug ||
                state.organizationSlug === deriveSlug(state.organizationName)
              ) {
                state.setField('organizationSlug', deriveSlug(value))
              }
            }}
            placeholder="Hotel Boutique Tulum"
            className="w-full px-3.5 h-10 rounded-lg border border-slate-300 text-[14px] focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
          />
        </Field>

        <Field
          label="Slug (URL identifier)"
          hint={
            <>
              Único, lowercase, sin espacios. URL final:{' '}
              <Code variant="inline" className="text-[10px]">
                app.zenix.com/org/{state.organizationSlug || 'slug'}
              </Code>
            </>
          }
        >
          <input
            type="text"
            value={state.organizationSlug}
            onChange={(e) =>
              state.setField('organizationSlug', deriveSlug(e.target.value))
            }
            placeholder="hotel-boutique-tulum"
            className="w-full px-3.5 h-10 rounded-lg border border-slate-300 text-[14px] font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="País">
            <select
              value={state.organizationCountryCode}
              onChange={(e) => {
                const country = COUNTRIES.find((c) => c.code === e.target.value)
                state.setField('organizationCountryCode', e.target.value)
                if (country) state.setField('organizationTimezone', country.tz)
              }}
              className="w-full px-3 h-10 rounded-lg border border-slate-300 text-[14px] bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Timezone primario">
            <select
              value={state.organizationTimezone}
              onChange={(e) => state.setField('organizationTimezone', e.target.value)}
              className="w-full px-3 h-10 rounded-lg border border-slate-300 text-[14px] bg-white font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
            >
              {(state.organizationCountryCode === 'MX' ? TIMEZONES_MX : [state.organizationTimezone]).map(
                (tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ),
              )}
            </select>
          </Field>
        </div>

        <Surface variant="sunken" radius="md" padding="md">
          <Body tone="secondary" className="text-[12px]">
            <span className="font-semibold text-slate-900">Preview backend:</span> al activar
            se creará una Organization con id = uuid, slug ={' '}
            <Code variant="inline" className="text-[10px]">
              {state.organizationSlug || '...'}
            </Code>
            , countryCode = {state.organizationCountryCode}, timezone ={' '}
            <Code variant="inline" className="text-[10px]">
              {state.organizationTimezone}
            </Code>
            .
          </Body>
        </Surface>
      </Surface>
    </WizardLayout>
  )
}

// ─── Helper ────────────────────────────────────────────────────────

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
