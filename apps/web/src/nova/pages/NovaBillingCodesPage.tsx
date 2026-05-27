/**
 * NovaBillingCodesPage — CRUD de discount codes pre-configurados.
 *
 * Sprint BILLING-DISCOUNT-CODES Day 3.
 *
 * Pattern Salesforce CPQ: el consultor crea códigos en PRIVADO antes de
 * la reunión con el cliente. Durante el wizard, solo aplica el código
 * (sin exponer el slider del cap del partner tier).
 *
 * Ruta: /nova/billing/codigos
 *
 * Características:
 *   · Lista de templates del current consultor (filtrada por consultorId)
 *   · Filter chips: Todos / Favoritos
 *   · CTA "+ Crear código"
 *   · Modal CreateDiscountCodeDialog
 *   · Row actions: copiar nombre · marcar favorito · eliminar
 *   · Empty state cuando no hay códigos
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Star,
  Trash2,
  Copy,
  Tag,
  Calendar,
  Infinity as InfinityIcon,
  Sparkles,
  ArrowLeft,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { NovaShell } from '../NovaShell'
import {
  Surface,
  Section,
  Headline,
  Title,
  Body,
  Callout,
  Caption,
  Eyebrow,
  Chip,
  Button,
} from '../design-system'
import {
  billingClient,
  type DiscountCodeTemplate,
  type DiscountDuration,
} from '../api/billing-client'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────

export function NovaBillingCodesPage() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<'all' | 'favorites'>('all')
  const [createOpen, setCreateOpen] = useState(false)

  const { data: templates = [], isLoading, isError } = useQuery<DiscountCodeTemplate[]>({
    queryKey: ['billing', 'codes'],
    queryFn: billingClient.listTemplates,
  })

  const filtered =
    filter === 'favorites' ? templates.filter((t) => t.isFavorite) : templates

  const deleteMutation = useMutation({
    mutationFn: (id: string) => billingClient.deleteTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing', 'codes'] })
      toast.success('Código eliminado')
    },
    onError: (err: Error) => toast.error(err.message || 'Error al eliminar'),
  })

  const copyName = (name: string) => {
    navigator.clipboard.writeText(name).then(
      () => toast.success(`"${name}" copiado al portapapeles`),
      () => toast.error('No se pudo copiar'),
    )
  }

  return (
    <NovaShell title="Códigos de descuento">
      <div className="space-y-5">
        {/* Breadcrumb back */}
        <Link
          to="/nova/billing"
          className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a Billing
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <Eyebrow tone="tertiary" className="text-violet-700">
              Nova → Billing → Códigos
            </Eyebrow>
            <Headline as="h1" className="mt-1">
              Códigos de descuento pre-configurados
            </Headline>
            <Body tone="secondary" className="mt-1.5 max-w-2xl">
              Crea códigos ANTES de la reunión con el cliente. Durante el wizard solo aplicas el
              código — el cliente NO ve el cap de tu partner tier.
            </Body>
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={() => setCreateOpen(true)}
            iconLeft={Plus}
          >
            Crear código
          </Button>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2">
          <FilterChip selected={filter === 'all'} onClick={() => setFilter('all')}>
            Todos ({templates.length})
          </FilterChip>
          <FilterChip
            selected={filter === 'favorites'}
            onClick={() => setFilter('favorites')}
          >
            <Star className="h-3 w-3 inline mr-1" />
            Favoritos ({templates.filter((t) => t.isFavorite).length})
          </FilterChip>
        </div>

        {/* List */}
        {isLoading && (
          <Surface variant="raised" radius="lg" padding="lg">
            <Caption tone="tertiary">Cargando códigos…</Caption>
          </Surface>
        )}

        {isError && (
          <Surface variant="raised" radius="lg" padding="lg" tone="danger">
            <Title className="text-red-900">Error cargando códigos</Title>
            <Callout tone="secondary" className="mt-1">
              Intenta recargar la página. Si persiste, contacta soporte.
            </Callout>
          </Surface>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <Surface variant="raised" radius="lg" padding="lg">
            <div className="flex flex-col items-center text-center py-8">
              <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-violet-50 text-violet-700 mb-3">
                <Tag className="h-6 w-6" />
              </div>
              <Title>
                {filter === 'favorites' ? 'No tienes favoritos aún' : 'No has creado códigos'}
              </Title>
              <Callout tone="tertiary" className="mt-1.5 max-w-md">
                {filter === 'favorites'
                  ? 'Marca códigos como favoritos para acceder a ellos más rápido durante el wizard.'
                  : 'Crea tu primer código de descuento. Lo usarás en el wizard sin exponer el cap al cliente.'}
              </Callout>
              {filter === 'all' && (
                <Button
                  variant="primary"
                  size="md"
                  className="mt-4"
                  onClick={() => setCreateOpen(true)}
                  iconLeft={Plus}
                >
                  Crear primer código
                </Button>
              )}
            </div>
          </Surface>
        )}

        {!isLoading && !isError && filtered.length > 0 && (
          <div className="space-y-2">
            {filtered.map((tpl) => (
              <CodeRow
                key={tpl.id}
                template={tpl}
                onCopy={() => copyName(tpl.name)}
                onDelete={() => {
                  if (
                    window.confirm(
                      `¿Eliminar el código "${tpl.name}"? Esta acción no se puede deshacer.`,
                    )
                  ) {
                    deleteMutation.mutate(tpl.id)
                  }
                }}
              />
            ))}
          </div>
        )}

        {/* Footer help */}
        <Surface variant="sunken" radius="md" padding="md">
          <div className="flex items-start gap-3">
            <Sparkles className="h-4 w-4 text-violet-600 flex-shrink-0 mt-0.5" />
            <div>
              <Body className="text-[13px] font-medium">
                ¿Cómo aplicas un código durante el wizard?
              </Body>
              <Caption tone="tertiary" className="block mt-1">
                En el Step 7.5 (Plan y cobro) del wizard, expande "Descuento negociado" y selecciona
                tu código del dropdown. El cliente solo ve "Código aplicado" — no ve el porcentaje
                máximo que puedes ofrecer.
              </Caption>
            </div>
          </div>
        </Surface>
      </div>

      {/* Create Dialog */}
      {createOpen && (
        <CreateDiscountCodeDialog
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['billing', 'codes'] })
            setCreateOpen(false)
          }}
        />
      )}
    </NovaShell>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

function FilterChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors',
        selected
          ? 'bg-violet-100 text-violet-900 ring-1 ring-violet-200'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
      )}
    >
      {children}
    </button>
  )
}

function CodeRow({
  template,
  onCopy,
  onDelete,
}: {
  template: DiscountCodeTemplate
  onCopy: () => void
  onDelete: () => void
}) {
  const durationLabel =
    template.duration === 'once'
      ? 'Una vez'
      : template.duration === 'repeating'
        ? `${template.durationInMonths ?? '?'} meses`
        : 'Permanente'

  const DurationIcon =
    template.duration === 'forever' ? InfinityIcon : Calendar

  return (
    <Surface variant="raised" radius="lg" padding="md" className="group">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Icon */}
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-violet-50 text-violet-700 flex-shrink-0">
          <Tag className="h-4 w-4" />
        </div>

        {/* Name + metadata */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Body className="text-[14px] font-semibold text-slate-900 truncate">
              {template.name}
            </Body>
            {template.isFavorite && (
              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400 flex-shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <Chip variant="accent" intent="subtle" size="sm">
              -{template.percentOff}%
            </Chip>
            <Caption tone="tertiary" className="inline-flex items-center gap-1">
              <DurationIcon className="h-3 w-3" />
              {durationLabel}
            </Caption>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onCopy}
            className="p-2 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            title="Copiar nombre del código"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-2 rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
            title="Eliminar código"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </Surface>
  )
}

// ─────────────────────────────────────────────────────────────────────
// CreateDiscountCodeDialog
// ─────────────────────────────────────────────────────────────────────

function CreateDiscountCodeDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [percentOff, setPercentOff] = useState(15)
  const [duration, setDuration] = useState<DiscountDuration>('repeating')
  const [durationInMonths, setDurationInMonths] = useState(3)
  const [isFavorite, setIsFavorite] = useState(false)

  const isValid = name.trim().length >= 2 && percentOff >= 5 && percentOff <= 50

  const createMutation = useMutation({
    mutationFn: () =>
      billingClient.createTemplate({
        name: name.trim(),
        percentOff,
        duration,
        durationInMonths: duration === 'repeating' ? durationInMonths : undefined,
        isFavorite,
      }),
    onSuccess: () => {
      toast.success(`Código "${name}" creado`)
      onCreated()
    },
    onError: (err: Error) => toast.error(err.message || 'Error al crear código'),
  })

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <Title className="mb-1">Crear código de descuento</Title>
        <Callout tone="tertiary" className="mb-5">
          Este código es privado para ti. Lo aplicarás en el wizard sin exponer el cap.
        </Callout>

        <div className="space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-[12px] font-medium text-slate-700 mb-1.5">
              Nombre interno
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: PILOTO-TULUM-Q3-2026"
              className="w-full px-3 h-10 rounded-lg border border-slate-300 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              autoFocus
            />
            <Caption tone="tertiary" className="block mt-1">
              Solo tú lo verás. Usa naming descriptivo para encontrarlo rápido.
            </Caption>
          </div>

          {/* Percent off */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[12px] font-medium text-slate-700">
                Porcentaje de descuento
              </label>
              <div className="text-[18px] font-bold text-violet-700 tabular-nums">
                {percentOff}%
              </div>
            </div>
            <input
              type="range"
              min={5}
              max={50}
              step={5}
              value={percentOff}
              onChange={(e) => setPercentOff(Number(e.target.value))}
              className="w-full accent-violet-600"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1 tabular-nums">
              <span>5%</span>
              <span>50%</span>
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-[12px] font-medium text-slate-700 mb-2">
              Duración del descuento
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['once', 'repeating', 'forever'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-[12px] font-medium transition-colors',
                    duration === d
                      ? 'border-violet-500 bg-violet-50 text-violet-900'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700',
                  )}
                >
                  {d === 'once' ? 'Una vez' : d === 'repeating' ? 'N meses' : 'Permanente'}
                </button>
              ))}
            </div>

            {duration === 'repeating' && (
              <div className="mt-3 flex items-center gap-3 px-3 py-2 rounded-md bg-slate-50">
                <Caption tone="secondary">Duración:</Caption>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={durationInMonths}
                  onChange={(e) => setDurationInMonths(Number(e.target.value))}
                  className="w-16 h-8 px-2 rounded-md border border-slate-300 text-[13px] text-center focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                />
                <Caption tone="secondary">meses (1 – 12)</Caption>
              </div>
            )}
          </div>

          {/* Favorite toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isFavorite}
              onChange={(e) => setIsFavorite(e.target.checked)}
              className="rounded border-slate-300 text-violet-600 focus:ring-violet-500/30"
            />
            <Body className="text-[13px]">Marcar como favorito</Body>
          </label>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => createMutation.mutate()}
            disabled={!isValid || createMutation.isPending}
          >
            {createMutation.isPending ? 'Creando…' : 'Crear código'}
          </Button>
        </div>
      </div>
    </div>
  )
}
