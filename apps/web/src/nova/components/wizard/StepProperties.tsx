/**
 * Step 4 — Properties (§77 Inventory templates pre-step).
 *
 * Add/remove properties. Cada Property tendrá su channexPropertyId (pre-saved
 * via Channex API call) — Day 15 wirea el endpoint que llama al Channex
 * gateway createProperty(). Por ahora capturamos metadata + agregamos via UI.
 */
import { useState } from 'react'
import { Plus, Trash2, Hotel, Home, Mountain, Trees, Leaf, Building2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useWizardStore, type WizardProperty } from '../../../store/wizard'
import { WizardLayout } from './WizardLayout'
import {
  Surface,
  Subhead,
  Caption,
  Body,
  Title,
  Button,
  Chip,
  EmptyState,
} from '../../design-system'
import { CityPicker } from './CityPicker'
import { findCityById } from '../../data/latam-cities'

const TYPE_OPTIONS: Array<{
  value: WizardProperty['type']
  label: string
  icon: LucideIcon
  description: string
}> = [
  { value: 'HOTEL', label: 'Hotel', icon: Hotel, description: 'Habitaciones privadas, recepción 24/7' },
  { value: 'HOSTAL', label: 'Hostal', icon: Home, description: 'Mixto: privadas + dorm compartidos' },
  { value: 'BOUTIQUE', label: 'Boutique', icon: Building2, description: 'Hotel pequeño identidad propia' },
  { value: 'GLAMPING', label: 'Glamping', icon: Trees, description: 'Camping de lujo, tiendas/yurts' },
  { value: 'ECO_LODGE', label: 'Eco-lodge', icon: Leaf, description: 'Lodge ecológico, naturaleza' },
  { value: 'VACATION_RENTAL', label: 'Vacation Rental', icon: Mountain, description: 'Casas/depas tipo Airbnb' },
]

export function StepProperties() {
  const state = useWizardStore()
  const [showAddForm, setShowAddForm] = useState(state.properties.length === 0)

  return (
    <WizardLayout
      title="Properties del cliente"
      description="Una o más propiedades del cliente. Cada Property tendrá su mapping Channex (creado al activar). Multi-property aceptado — agrega todas las que el cliente opere bajo esta LegalEntity."
    >
      <div className="space-y-4">
        {/* Lista actual */}
        {state.properties.length > 0 && (
          <Surface variant="raised" radius="lg" className="overflow-hidden">
            {state.properties.map((p, idx) => (
              <PropertyRow
                key={p.tempId}
                property={p}
                idx={idx}
                onUpdate={(patch) => state.updateProperty(p.tempId, patch)}
                onRemove={() => state.removeProperty(p.tempId)}
              />
            ))}
          </Surface>
        )}

        {state.properties.length === 0 && !showAddForm && (
          <Surface variant="raised" radius="lg">
            <EmptyState
              icon={Hotel}
              title="Sin properties aún"
              description="Agrega al menos una property para continuar al siguiente paso."
              action={
                <Button variant="primary" onClick={() => setShowAddForm(true)} iconLeft={Plus}>
                  Agregar property
                </Button>
              }
            />
          </Surface>
        )}

        {/* Add form */}
        {showAddForm && (
          <AddPropertyForm
            defaultTimezone={state.organizationTimezone}
            defaultCountryCode={state.organizationCountryCode}
            onSubmit={(data) => {
              state.addProperty(data)
              setShowAddForm(false)
            }}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {state.properties.length > 0 && !showAddForm && (
          <div className="flex justify-end">
            <Button variant="secondary" size="sm" iconLeft={Plus} onClick={() => setShowAddForm(true)}>
              Agregar otra property
            </Button>
          </div>
        )}
      </div>
    </WizardLayout>
  )
}

// ─── Property row in list ──────────────────────────────────────────

function PropertyRow({
  property,
  idx,
  onUpdate,
  onRemove,
}: {
  property: WizardProperty
  idx: number
  onUpdate: (patch: Partial<WizardProperty>) => void
  onRemove: () => void
}) {
  const opt = TYPE_OPTIONS.find((o) => o.value === property.type) ?? TYPE_OPTIONS[0]
  const Icon = opt.icon
  return (
    <div
      className={
        'flex items-center gap-3 p-4 ' + (idx > 0 ? 'border-t border-slate-100' : '')
      }
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-violet-100/80 text-violet-700 flex-shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <input
          type="text"
          value={property.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Nombre de la property"
          className="w-full bg-transparent text-[14px] font-semibold text-slate-900 focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
        />
        <div className="flex items-center gap-2 mt-0.5">
          <Chip variant="neutral" intent="subtle" size="sm">
            {opt.label}
          </Chip>
          <Caption tone="tertiary" className="font-mono">
            {property.timezone}
          </Caption>
        </div>
      </div>
      <Button variant="ghost" size="sm" iconLeft={Trash2} onClick={onRemove}>
        Quitar
      </Button>
    </div>
  )
}

// ─── Add form ──────────────────────────────────────────────────────

function AddPropertyForm({
  defaultTimezone,
  defaultCountryCode,
  onSubmit,
  onCancel,
}: {
  defaultTimezone: string
  defaultCountryCode: string
  onSubmit: (p: Omit<WizardProperty, 'tempId'>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<WizardProperty['type']>('BOUTIQUE')
  const [timezone, setTimezone] = useState(defaultTimezone)
  const [cityId, setCityId] = useState<string | null | undefined>(undefined)
  const [cityFreeText, setCityFreeText] = useState('')
  const [cityDisplay, setCityDisplay] = useState('')

  const canSubmit = name.trim().length > 0

  return (
    <Surface variant="raised" radius="lg" padding="lg" tone="accent" className="space-y-5">
      <div>
        <Title>Nueva property</Title>
        <Caption tone="tertiary" className="block mt-0.5">
          Datos básicos. Inventario detallado en Step 5.
        </Caption>
      </div>

      {/* Type selector — visual cards */}
      <div>
        <Subhead tone="secondary" className="block mb-2">
          Tipo de propiedad
        </Subhead>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {TYPE_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const selected = type === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={
                  'flex items-start gap-2.5 p-3 rounded-lg border transition-all text-left ' +
                  (selected
                    ? 'border-violet-300 bg-violet-50/60 ring-1 ring-violet-200'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 bg-white')
                }
              >
                <div
                  className={
                    'flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0 ' +
                    (selected ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600')
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-slate-900 leading-tight">
                    {opt.label}
                  </div>
                  <Caption tone="tertiary" className="block mt-0.5 leading-tight">
                    {opt.description}
                  </Caption>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nombre">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='Ej: "Hotel Tulum Centro"'
            autoFocus
            className="w-full px-3 h-10 rounded-lg border border-slate-300 text-[14px] focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          />
        </Field>

        <div>
          <CityPicker
            countryCode={defaultCountryCode}
            cityId={cityId ?? undefined}
            freeText={cityFreeText}
            onSelect={(c) => {
              setCityId(c.cityId)
              setCityFreeText(c.freeText)
              setCityDisplay(c.displayName)
              // Auto-timezone: el callback ya resuelve TZ tanto del catálogo
              // (curado IANA) como de Nominatim (derivado country+state).
              // Si no viene, conservamos la TZ actual (consultor edita manual).
              if (c.timezone) {
                setTimezone(c.timezone)
              } else {
                // Fallback al catálogo local por id por backward-compat
                const cityRow = c.cityId ? findCityById(c.cityId) : null
                if (cityRow?.timezone) setTimezone(cityRow.timezone)
              }
            }}
          />
        </div>

        <Field label="Timezone">
          <input
            type="text"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-3 h-10 rounded-lg border border-slate-300 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          />
        </Field>
      </div>

      <Surface variant="sunken" radius="md" padding="md">
        <Body tone="secondary" className="text-[12px]">
          <span className="font-semibold text-slate-900">¿Qué pasa al activar?</span>{' '}
          Esta propiedad se conectará automáticamente con los canales de venta del cliente
          (Booking.com, Expedia, Airbnb, etc.) a través del channel manager. Antes de activar
          verificamos que la conexión funciona — si algo falla, te avisaremos en el último paso.
        </Body>
      </Surface>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          disabled={!canSubmit}
          onClick={() =>
            onSubmit({
              name: name.trim(),
              type,
              timezone,
              cityId: cityId ?? null,
              cityFreeText: cityFreeText || undefined,
              cityDisplay: cityDisplay || undefined,
            })
          }
        >
          Agregar property
        </Button>
      </div>
    </Surface>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <Subhead tone="secondary" className="block mb-1.5">
        {label}
      </Subhead>
      {children}
    </label>
  )
}
