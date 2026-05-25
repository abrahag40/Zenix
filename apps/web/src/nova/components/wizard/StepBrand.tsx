/**
 * Step 2 — Brand (opcional skip).
 *
 * Brand es una capa OPCIONAL entre Organization y LegalEntity para
 * cuentas multi-property con marca comercial común (e.g. cadena de
 * hoteles boutique con identidad común pero entidades fiscales separadas).
 *
 * Default: skipped. Solo se activa si el cliente realmente tiene brand
 * separada del Organization (cadenas, no hostal individual).
 */
import { useWizardStore } from '../../../store/wizard'
import { WizardLayout } from './WizardLayout'
import { Surface, Body, Subhead, Caption, Chip } from '../../design-system'

export function StepBrand() {
  const state = useWizardStore()

  return (
    <WizardLayout
      title="Brand (opcional)"
      description="Capa intermedia para cadenas con marca paraguas. Skippable para clientes single-property o sin brand corporate."
    >
      <Surface variant="raised" radius="lg" padding="lg" className="space-y-5">
        <div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={state.brandEnabled}
              onChange={(e) => state.setField('brandEnabled', e.target.checked)}
              className="mt-0.5 rounded text-violet-600 focus:ring-violet-500/30 border-slate-300"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Subhead tone="primary">Habilitar Brand layer</Subhead>
                {!state.brandEnabled && (
                  <Chip variant="neutral" intent="subtle" size="sm">
                    Recomendado skip
                  </Chip>
                )}
              </div>
              <Caption tone="tertiary" className="block mt-1 leading-relaxed">
                Solo activar si el cliente es una cadena con identidad de marca compartida (logo,
                colores, dominio) sobre múltiples LegalEntities. Para boutique single-property,
                desactivar es lo correcto (Brand puede agregarse después sin migración).
              </Caption>
            </div>
          </label>
        </div>

        {state.brandEnabled && (
          <div className="space-y-4 pl-6 border-l-2 border-violet-200">
            <FieldRow label="Nombre del Brand">
              <input
                type="text"
                value={state.brandName}
                onChange={(e) => state.setField('brandName', e.target.value)}
                placeholder='Ej: "Tulum Collection Hotels"'
                className="w-full px-3.5 h-10 rounded-lg border border-slate-300 text-[14px] focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
            </FieldRow>

            <FieldRow label="URL del logo (opcional)">
              <input
                type="url"
                value={state.brandLogoUrl}
                onChange={(e) => state.setField('brandLogoUrl', e.target.value)}
                placeholder="https://..."
                className="w-full px-3.5 h-10 rounded-lg border border-slate-300 text-[14px] font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
              <Caption tone="tertiary" className="block mt-1">
                Subir a R2/CDN luego (Day 14+ wirea uploader real).
              </Caption>
            </FieldRow>
          </div>
        )}

        {!state.brandEnabled && (
          <Surface variant="sunken" radius="md" padding="md">
            <Body tone="secondary" className="text-[12px]">
              <span className="font-semibold text-slate-900">Brand desactivado:</span> la Organization
              creada en Step 1 actuará como root identity. Si más tarde el cliente quiere agregar
              Brand layer, se hace con un{' '}
              <code className="font-mono text-[11px] bg-slate-100 px-1 rounded">UPDATE</code> sin
              data migration.
            </Body>
          </Surface>
        )}
      </Surface>
    </WizardLayout>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <Subhead tone="secondary" className="block mb-1.5">
        {label}
      </Subhead>
      {children}
    </label>
  )
}
