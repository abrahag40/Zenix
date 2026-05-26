/**
 * Step 5 — Inventory templates con edición inline (§77-§78).
 *
 * Flow:
 *   1. Consultor elige template (HOSTAL / BOUTIQUE / CABAÑAS / BUSINESS / CUSTOM)
 *   2. La selección puebla `inventoryRoomTypes` + `inventoryRatePlans` en el
 *      store con valores razonables del template.
 *   3. Consultor edita inline: add / remove / rename / cambiar capacity / rate.
 *   4. Si las necesidades del cliente no caben en el template, switch a CUSTOM
 *      y construye desde cero (o lo deja vacío y configura post-activación).
 *
 * Post-activación:
 *   El cliente edita inventario completo desde Nova / Settings / Inventory
 *   (page pendiente de wiring) o directamente desde Nova / Channex Command
 *   Center / Room Types (CRUD operativo ya implementado, surface visible).
 *
 * UX: NN/g Progressive Disclosure — el template es punto de partida, no
 * cárcel. Pattern Salesforce "Industry Solutions" donde el setup es
 * acelerable con defaults pero 100% editable per cliente.
 */
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useWizardStore, type WizardState } from '../../../store/wizard'
import { WizardLayout } from './WizardLayout'
import {
  Surface,
  Body,
  Caption,
  Subhead,
  Title,
  Chip,
  Button,
} from '../../design-system'
import {
  Home,
  Building2,
  Trees,
  Briefcase,
  Settings2,
  Check,
  Plus,
  Trash2,
  ExternalLink,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface InventoryTemplateMeta {
  value: WizardState['inventoryTemplate']
  label: string
  icon: LucideIcon
  description: string
  bestFor: string
}

const TEMPLATE_META: InventoryTemplateMeta[] = [
  {
    value: 'HOSTAL',
    label: 'Hostal',
    icon: Home,
    description: 'Dorms compartidos + privadas. Beds individuales con per-bed cleaning.',
    bestFor: 'Backpacker / community-driven properties',
  },
  {
    value: 'BOUTIQUE',
    label: 'Boutique Hotel',
    icon: Building2,
    description: 'Habitaciones privadas con identidad. Mix de categorías.',
    bestFor: 'Hoteles 18-30 habitaciones, identidad propia',
  },
  {
    value: 'CABAÑAS',
    label: 'Cabañas / Eco-lodge',
    icon: Trees,
    description: 'Unidades independientes en naturaleza. Cada una privada.',
    bestFor: 'Glamping, eco-lodges, cabañas turísticas',
  },
  {
    value: 'BUSINESS',
    label: 'Business Hotel',
    icon: Briefcase,
    description: 'Hotel corporativo. Standard + ejecutivo + tarifas negociadas.',
    bestFor: 'Hoteles ciudad, viajeros corporativos',
  },
  {
    value: 'CUSTOM',
    label: 'Empezar vacío',
    icon: Settings2,
    description: 'Sin template. Construye RoomTypes + RatePlans desde cero o déjalo vacío para configurar después.',
    bestFor: 'Operación atípica o migración desde otro PMS',
  },
]

export function StepInventory() {
  const state = useWizardStore()

  // Si el state quedó sin inventario (primera visita o reset), poblar desde
  // el template seleccionado por default. Importante: NO clobber cuando el
  // consultor ya ha editado (ambas listas tienen items).
  useEffect(() => {
    if (state.inventoryRoomTypes.length === 0 && state.inventoryRatePlans.length === 0) {
      if (state.inventoryTemplate !== 'CUSTOM') {
        state.loadInventoryTemplate(state.inventoryTemplate)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleTemplateChange = (template: WizardState['inventoryTemplate']) => {
    const hasEdits =
      state.inventoryRoomTypes.length > 0 || state.inventoryRatePlans.length > 0
    if (
      hasEdits &&
      !window.confirm(
        `Cambiar a "${template}" reemplazará el inventario actual con los valores del template. ¿Continuar?`,
      )
    ) {
      return
    }
    state.loadInventoryTemplate(template)
  }

  return (
    <WizardLayout
      title="Inventario del cliente"
      description="Selecciona un template como punto de partida y edita los detalles para que coincidan con la operación real del cliente. Todo es editable después en Nova / Channex Command Center / Room Types."
    >
      <div className="space-y-5">
        {/* Template selector */}
        <div>
          <Subhead className="block mb-2 font-semibold">Template base</Subhead>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {TEMPLATE_META.map((t) => {
              const Icon = t.icon
              const isSelected = state.inventoryTemplate === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => handleTemplateChange(t.value)}
                  className={
                    'flex items-start gap-2.5 p-3 rounded-xl border transition-all text-left ' +
                    (isSelected
                      ? 'border-violet-300 bg-violet-50/50 ring-1 ring-violet-200/60'
                      : 'border-slate-200 bg-white hover:border-slate-300')
                  }
                >
                  <div
                    className={
                      'flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 ' +
                      (isSelected
                        ? 'bg-violet-100 text-violet-700'
                        : 'bg-slate-100 text-slate-600')
                    }
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <div className="text-[13px] font-semibold text-slate-900">{t.label}</div>
                      {isSelected && <Check className="h-3 w-3 text-violet-600 flex-shrink-0" />}
                    </div>
                    <Caption tone="tertiary" className="block mt-0.5 leading-tight text-[11px]">
                      {t.description}
                    </Caption>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Room types editable */}
        <Surface variant="raised" radius="lg" padding="lg">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div>
              <Title>Tipos de habitación</Title>
              <Caption tone="tertiary" className="block mt-0.5">
                {state.inventoryRoomTypes.length === 0
                  ? 'Sin room types — agrega los que aplican a la operación.'
                  : `${state.inventoryRoomTypes.length} ${state.inventoryRoomTypes.length === 1 ? 'tipo' : 'tipos'} · ${state.inventoryRoomTypes.reduce(
                      (sum, rt) => sum + rt.count,
                      0,
                    )} unidades totales`}
              </Caption>
            </div>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={Plus}
              onClick={() =>
                state.addRoomType({ name: 'Nuevo tipo', count: 1, capacity: 2, baseRate: 1000 })
              }
            >
              Agregar tipo
            </Button>
          </div>

          {state.inventoryRoomTypes.length === 0 ? (
            <EmptyInventoryCallout
              text="Aún no hay room types. Elige un template arriba o agrega uno manual."
            />
          ) : (
            <div className="space-y-2">
              {state.inventoryRoomTypes.map((rt) => (
                <RoomTypeRow
                  key={rt.tempId}
                  roomType={rt}
                  currency={state.legalEntityBaseCurrency}
                  onUpdate={(patch) => state.updateRoomType(rt.tempId, patch)}
                  onRemove={() => state.removeRoomType(rt.tempId)}
                />
              ))}
            </div>
          )}
        </Surface>

        {/* Rate plans editable */}
        <Surface variant="raised" radius="lg" padding="lg">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div>
              <Title>Rate plans</Title>
              <Caption tone="tertiary" className="block mt-0.5">
                {state.inventoryRatePlans.length === 0
                  ? 'Sin rate plans — agrega al menos BAR para operar.'
                  : `${state.inventoryRatePlans.length} ${state.inventoryRatePlans.length === 1 ? 'plan' : 'planes'} de tarifa`}
              </Caption>
            </div>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={Plus}
              onClick={() =>
                state.addRatePlan({ name: 'Nuevo rate plan', shortLabel: 'BAR' })
              }
            >
              Agregar plan
            </Button>
          </div>

          {state.inventoryRatePlans.length === 0 ? (
            <EmptyInventoryCallout text="Aún no hay rate plans. Elige un template arriba o agrega uno manual." />
          ) : (
            <div className="space-y-2">
              {state.inventoryRatePlans.map((rp) => (
                <RatePlanRow
                  key={rp.tempId}
                  ratePlan={rp}
                  onUpdate={(patch) => state.updateRatePlan(rp.tempId, patch)}
                  onRemove={() => state.removeRatePlan(rp.tempId)}
                />
              ))}
            </div>
          )}
        </Surface>

        {/* Post-activation guidance — qué hacer si las necesidades cambian */}
        <Surface variant="raised" radius="lg" padding="lg" tone="info">
          <Subhead className="font-semibold text-slate-900 mb-2">
            ¿Y si el cliente necesita ajustes después de activar?
          </Subhead>
          <Body tone="secondary" className="text-[13px] leading-relaxed mb-3">
            Lo que captures aquí es la <strong>configuración inicial</strong>. Una vez activado,
            todo el inventario es editable sin limitaciones desde dos surfaces:
          </Body>
          <ul className="space-y-2">
            <li className="flex items-start gap-2.5">
              <div className="flex items-center justify-center w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 flex-shrink-0 mt-0.5">
                <ExternalLink className="h-3 w-3" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-slate-900">
                  Nova / Channex Command Center / Room Types
                </div>
                <Caption tone="secondary" className="block mt-0.5 leading-relaxed text-[12px]">
                  CRUD pleno de room types + push real-time a Channex (Booking.com / Expedia /
                  Airbnb sincronizan en segundos).{' '}
                  <Link
                    to="/nova/channex"
                    className="text-emerald-700 hover:underline font-medium"
                    target="_blank"
                  >
                    Abrir ahora ↗
                  </Link>
                </Caption>
              </div>
            </li>
            <li className="flex items-start gap-2.5">
              <div className="flex items-center justify-center w-6 h-6 rounded-md bg-violet-100 text-violet-700 flex-shrink-0 mt-0.5">
                <Settings2 className="h-3 w-3" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-slate-900">
                  app.zenix.com (cliente) / Settings / Inventario
                </div>
                <Caption tone="secondary" className="block mt-0.5 leading-relaxed text-[12px]">
                  El Org Owner del cliente puede ajustar capacity, baseRate y agregar/quitar
                  room types desde su propio workspace una vez que active su cuenta.
                </Caption>
              </div>
            </li>
          </ul>
        </Surface>
      </div>
    </WizardLayout>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────

function EmptyInventoryCallout({ text }: { text: string }) {
  return (
    <div className="p-4 rounded-lg bg-slate-50 border border-dashed border-slate-300">
      <Caption tone="secondary" className="text-[12px]">
        {text}
      </Caption>
    </div>
  )
}

function RoomTypeRow({
  roomType,
  currency,
  onUpdate,
  onRemove,
}: {
  roomType: { tempId: string; name: string; count: number; capacity: number; baseRate?: number }
  currency: string
  onUpdate: (patch: Partial<{ name: string; count: number; capacity: number; baseRate: number }>) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white border border-slate-200">
      <input
        type="text"
        value={roomType.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        placeholder="Nombre del tipo"
        className="flex-1 min-w-0 px-2 h-8 rounded-md border border-slate-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-500/30"
      />
      <div className="flex items-center gap-1 flex-shrink-0">
        <Caption tone="tertiary" className="text-[10px] font-medium uppercase">×</Caption>
        <input
          type="number"
          min={1}
          max={500}
          value={roomType.count}
          onChange={(e) => onUpdate({ count: Math.max(1, Number(e.target.value) || 1) })}
          className="w-14 px-1.5 h-8 rounded-md border border-slate-200 text-[12px] font-mono text-center focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        />
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Caption tone="tertiary" className="text-[10px] font-medium uppercase">cap</Caption>
        <input
          type="number"
          min={1}
          max={20}
          value={roomType.capacity}
          onChange={(e) => onUpdate({ capacity: Math.max(1, Number(e.target.value) || 1) })}
          className="w-12 px-1.5 h-8 rounded-md border border-slate-200 text-[12px] font-mono text-center focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        />
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Caption tone="tertiary" className="text-[10px] font-mono">{currency}</Caption>
        <input
          type="number"
          min={0}
          step={50}
          value={roomType.baseRate ?? ''}
          placeholder="0"
          onChange={(e) =>
            onUpdate({ baseRate: e.target.value === '' ? undefined : Number(e.target.value) })
          }
          className="w-20 px-1.5 h-8 rounded-md border border-slate-200 text-[12px] font-mono text-right focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
        aria-label={`Eliminar ${roomType.name}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function RatePlanRow({
  ratePlan,
  onUpdate,
  onRemove,
}: {
  ratePlan: { tempId: string; name: string; shortLabel?: string }
  onUpdate: (patch: Partial<{ name: string; shortLabel: string }>) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white border border-slate-200">
      <Chip variant="neutral" intent="subtle" size="sm">
        <input
          type="text"
          value={ratePlan.shortLabel ?? ''}
          onChange={(e) => onUpdate({ shortLabel: e.target.value.toUpperCase().slice(0, 8) })}
          placeholder="BAR"
          className="w-12 bg-transparent text-[11px] font-mono font-semibold uppercase text-center focus:outline-none"
        />
      </Chip>
      <input
        type="text"
        value={ratePlan.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        placeholder="Nombre del rate plan"
        className="flex-1 min-w-0 px-2 h-8 rounded-md border border-slate-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-500/30"
      />
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
        aria-label={`Eliminar ${ratePlan.name}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
