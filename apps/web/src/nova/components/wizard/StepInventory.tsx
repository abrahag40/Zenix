/**
 * Step 5 — Inventory templates (§77-§78).
 *
 * Selecciona uno de 4 templates pre-cargados con RoomTypes razonables, o
 * CUSTOM para empezar vacío. El template define semilla inicial — el
 * cliente puede customizar post-activación en Settings.
 *
 * Pattern Salesforce "Industry Solutions": templates por tipo de operación
 * con valores por defecto razonables para reducir time-to-value.
 */
import { useWizardStore, type WizardState } from '../../../store/wizard'
import { WizardLayout } from './WizardLayout'
import {
  Surface,
  Body,
  Caption,
  Subhead,
  Title,
  Chip,
} from '../../design-system'
import { Home, Building2, Trees, Briefcase, Settings2, Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface InventoryTemplate {
  value: WizardState['inventoryTemplate']
  label: string
  icon: LucideIcon
  description: string
  roomTypes: { name: string; count: number; capacity: number }[]
  ratePlans: string[]
  bestFor: string
}

const TEMPLATES: InventoryTemplate[] = [
  {
    value: 'HOSTAL',
    label: 'Hostal',
    icon: Home,
    description: 'Dorms compartidos + privadas. Beds individuales con per-bed cleaning.',
    roomTypes: [
      { name: 'Dorm 8 camas mixto', count: 2, capacity: 8 },
      { name: 'Dorm 6 camas femenino', count: 1, capacity: 6 },
      { name: 'Privada doble', count: 4, capacity: 2 },
      { name: 'Privada con baño', count: 2, capacity: 2 },
    ],
    ratePlans: ['BAR (Best Available)', 'Non-refundable -10%'],
    bestFor: 'Backpacker / community-driven properties',
  },
  {
    value: 'BOUTIQUE',
    label: 'Boutique Hotel',
    icon: Building2,
    description: 'Habitaciones privadas con identidad. Mix de categorías.',
    roomTypes: [
      { name: 'Standard Queen', count: 8, capacity: 2 },
      { name: 'Deluxe King', count: 6, capacity: 2 },
      { name: 'Junior Suite', count: 3, capacity: 3 },
      { name: 'Master Suite', count: 1, capacity: 4 },
    ],
    ratePlans: ['BAR', 'Advance Purchase -15%', 'Direct Member Rate'],
    bestFor: 'Hoteles 18-30 habitaciones, identidad propia',
  },
  {
    value: 'CABAÑAS',
    label: 'Cabañas / Eco-lodge',
    icon: Trees,
    description: 'Unidades independientes en naturaleza. Cada una privada.',
    roomTypes: [
      { name: 'Cabaña 2 personas', count: 4, capacity: 2 },
      { name: 'Cabaña familiar 4 personas', count: 3, capacity: 4 },
      { name: 'Tienda glamping', count: 2, capacity: 2 },
    ],
    ratePlans: ['BAR', 'Estancia mínima 2 noches'],
    bestFor: 'Glamping, eco-lodges, cabañas turísticas',
  },
  {
    value: 'BUSINESS',
    label: 'Business Hotel',
    icon: Briefcase,
    description: 'Hotel corporativo. Standard + ejecutivo + tarifas negociadas.',
    roomTypes: [
      { name: 'Standard Single', count: 12, capacity: 1 },
      { name: 'Standard Double', count: 10, capacity: 2 },
      { name: 'Executive', count: 6, capacity: 2 },
      { name: 'Suite ejecutiva', count: 2, capacity: 2 },
    ],
    ratePlans: ['BAR', 'Corporate Rate', 'Government Rate', 'Long Stay -20% (7+ noches)'],
    bestFor: 'Hoteles ciudad, viajeros corporativos',
  },
  {
    value: 'CUSTOM',
    label: 'Empezar vacío (custom)',
    icon: Settings2,
    description: 'Sin template. Configurarás RoomTypes y Rate Plans desde cero post-activación.',
    roomTypes: [],
    ratePlans: [],
    bestFor: 'Operación atípica o si ya tienes inventario definido por el consultor',
  },
]

export function StepInventory() {
  const state = useWizardStore()
  const selected = TEMPLATES.find((t) => t.value === state.inventoryTemplate)

  return (
    <WizardLayout
      title="Template de inventario"
      description="Elige un template pre-configurado para acelerar el setup. Podrás customizar RoomTypes, capacidad y rate plans después de activar — esto solo siembra valores razonables."
    >
      <div className="space-y-4">
        {/* Template grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TEMPLATES.map((t) => {
            const Icon = t.icon
            const isSelected = state.inventoryTemplate === t.value
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => state.setField('inventoryTemplate', t.value)}
                className={
                  'relative flex items-start gap-3 p-4 rounded-xl border transition-all text-left ' +
                  (isSelected
                    ? 'border-violet-300 bg-violet-50/50 ring-2 ring-violet-200/60 shadow-[0_4px_12px_-4px_rgba(139,92,246,0.25)]'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60')
                }
              >
                <div
                  className={
                    'flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 ' +
                    (isSelected
                      ? 'bg-violet-100 text-violet-700'
                      : 'bg-slate-100 text-slate-600')
                  }
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Subhead className="font-semibold text-slate-900">{t.label}</Subhead>
                    {isSelected && (
                      <Chip variant="success" intent="subtle" size="sm" icon={Check}>
                        Seleccionado
                      </Chip>
                    )}
                  </div>
                  <Caption tone="secondary" className="block mt-1 leading-tight">
                    {t.description}
                  </Caption>
                  {t.roomTypes.length > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <Caption tone="tertiary" className="text-[11px]">
                        {t.roomTypes.reduce((sum, rt) => sum + rt.count, 0)} unidades ·
                      </Caption>
                      <Caption tone="tertiary" className="text-[11px]">
                        {t.roomTypes.length} tipos ·
                      </Caption>
                      <Caption tone="tertiary" className="text-[11px]">
                        {t.ratePlans.length} rate plans
                      </Caption>
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Preview del template seleccionado */}
        {selected && selected.roomTypes.length > 0 && (
          <Surface variant="raised" radius="lg" padding="lg" tone="accent">
            <div className="flex items-center gap-2 mb-3">
              <Title>Preview · {selected.label}</Title>
              <Chip variant="neutral" intent="subtle" size="sm">
                {selected.bestFor}
              </Chip>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Caption tone="tertiary" className="block mb-2 font-semibold uppercase tracking-wider">
                  Room types ({selected.roomTypes.length})
                </Caption>
                <ul className="space-y-1.5">
                  {selected.roomTypes.map((rt, idx) => (
                    <li
                      key={idx}
                      className="flex items-center justify-between gap-2 p-2 rounded-md bg-white border border-slate-100"
                    >
                      <Body className="text-[13px] text-slate-800">{rt.name}</Body>
                      <div className="flex items-center gap-2">
                        <Caption tone="tertiary" className="font-mono text-[11px]">
                          ×{rt.count}
                        </Caption>
                        <Caption tone="tertiary" className="font-mono text-[11px]">
                          cap {rt.capacity}
                        </Caption>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <Caption tone="tertiary" className="block mb-2 font-semibold uppercase tracking-wider">
                  Rate plans ({selected.ratePlans.length})
                </Caption>
                <ul className="space-y-1.5">
                  {selected.ratePlans.map((rp, idx) => (
                    <li
                      key={idx}
                      className="flex items-center gap-2 p-2 rounded-md bg-white border border-slate-100"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                      <Body className="text-[13px] text-slate-800">{rp}</Body>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Surface>
        )}

        {/* Custom — no preview */}
        {selected && selected.value === 'CUSTOM' && (
          <Surface variant="sunken" radius="lg" padding="md" tone="info">
            <Body tone="secondary" className="text-[13px]">
              <span className="font-semibold text-slate-900">Configurarás manualmente:</span> al
              activar, el cliente arrancará con 0 RoomTypes y 0 RatePlans. Necesitarás cargar todo
              desde Nova / Settings / Inventory. Esto solo es recomendado si ya tienes un setup
              externo planeado (ej. migración de otro PMS donde el inventario ya está documentado).
            </Body>
          </Surface>
        )}

        <Surface variant="sunken" radius="md" padding="md">
          <Body tone="secondary" className="text-[12px]">
            <span className="font-semibold text-slate-900">Nota:</span> el template es solo semilla
            inicial. Toda customización (renombrar, cambiar capacidad, agregar/quitar) se hace
            post-activación en{' '}
            <code className="font-mono text-[11px] bg-slate-100 px-1 rounded">
              Settings → Inventory
            </code>
            . Esto reduce el wizard de 30-45 min a ~10-15 min sin perder flexibilidad.
          </Body>
        </Surface>
      </div>
    </WizardLayout>
  )
}
