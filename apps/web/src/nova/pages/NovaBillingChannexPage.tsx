/**
 * NovaBillingChannexPage — Sprint CHANNEX-AUTO-PROVISION Day 5.
 *
 * Route: /nova/billing/channex
 *
 * Recovery UI del provisioning Channex. Lista todas las Properties de la
 * acting org con su channexProvisioningStatus. Permite:
 *   · Re-disparar provision para properties failed/partial (idempotent)
 *   · Ver channels per property con su status (inactive/pending/oauth/error)
 *   · Diagnosticar errors capturados durante el provisioning
 *
 * Pattern: el provisioning corre al activar el wizard (best-effort outside-tx).
 * Si algo falló (Channex caído, KEK no configurada, mapping roto), la property
 * queda con status='failed'|'partial' y el consultor recupera desde aquí sin
 * re-activar al cliente.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Globe2,
  Loader2,
  Lock,
  RefreshCw,
  Settings,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { NovaShell } from '../NovaShell'
import {
  Body,
  Button,
  Caption,
  Chip,
  Eyebrow,
  Headline,
  Surface,
  Title,
} from '../design-system'
import {
  channexMgmtClient,
  type ChannexProvisioningProperty,
  type ChannexProvisionResult,
} from '../api/channex-mgmt-client'
import { useNovaStore } from '../../store/nova'

export function NovaBillingChannexPage() {
  const actingOrgId = useNovaStore((s) => s.actingOrgId)
  const actingOrgName = useNovaStore((s) => s.actingOrgName)
  const qc = useQueryClient()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['channex-provisioning', actingOrgId],
    queryFn: () => channexMgmtClient.listProvisioning(),
    enabled: !!actingOrgId,
  })

  const retryMutation = useMutation<ChannexProvisionResult, Error, string>({
    mutationFn: (propertyId: string) => channexMgmtClient.retryProvision(propertyId),
    onSuccess: (result) => {
      if (result.status === 'completed') {
        toast.success(
          `Provision OK · ${result.roomTypesCreated} room types · ${result.channelsCreated} channels`,
          { duration: 5000 },
        )
      } else if (result.status === 'partial') {
        toast(`Provision parcial · ${result.errors.length} errors restantes`, {
          duration: 7000,
          icon: '⚠️',
        })
      } else {
        toast.error(
          `Provision falló · ${result.errors[0]?.message ?? 'error desconocido'}`,
          { duration: 7000 },
        )
      }
      qc.invalidateQueries({ queryKey: ['channex-provisioning', actingOrgId] })
    },
    onError: (err) => {
      toast.error(err.message ?? 'Retry falló', { duration: 6000 })
    },
  })

  return (
    <NovaShell>
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Breadcrumb back */}
        <Link
          to="/nova/billing"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500 hover:text-emerald-700 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Billing
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700">
                <Globe2 className="h-4 w-4" />
              </div>
              <div>
                <Eyebrow>Channex provisioning</Eyebrow>
                <Headline as="h1">Recovery & retry</Headline>
              </div>
            </div>
            <Caption className="mt-2 max-w-2xl">
              Estado del push a Channex per property
              {actingOrgName ? ` · ${actingOrgName}` : ''}. Re-dispara las properties
              que fallaron al activar el wizard. El retry es idempotente — si la
              property ya tiene mappings, no se duplica nada.
            </Caption>
          </div>
          <Button
            variant="secondary"
            size="sm"
            iconLeft={RefreshCw}
            onClick={() => refetch()}
          >
            Refrescar
          </Button>
        </div>

        {/* No acting org */}
        {!actingOrgId && (
          <Surface variant="raised" radius="lg" padding="lg" tone="warning">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />
              <Body>
                Selecciona un cliente en{' '}
                <Link to="/nova/clientes" className="text-emerald-700 underline">
                  /nova/clientes
                </Link>{' '}
                primero. La página de Channex provisioning solo opera sobre la org
                activa.
              </Body>
            </div>
          </Surface>
        )}

        {/* Loading */}
        {actingOrgId && isLoading && (
          <Surface variant="raised" radius="lg" padding="lg">
            <div className="flex items-center gap-2 text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              <Body>Cargando estado de provisioning…</Body>
            </div>
          </Surface>
        )}

        {/* Error */}
        {actingOrgId && isError && (
          <Surface variant="raised" radius="lg" padding="lg" tone="danger">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5" />
              <Body className="text-red-900">
                No se pudo cargar el estado: {error instanceof Error ? error.message : 'error desconocido'}
              </Body>
            </div>
          </Surface>
        )}

        {/* Empty */}
        {actingOrgId && data && data.length === 0 && (
          <Surface variant="raised" radius="lg" padding="lg">
            <Caption>
              Este cliente no tiene properties. Activa el wizard primero desde{' '}
              <Link to="/nova/wizard" className="text-emerald-700 underline">
                /nova/wizard
              </Link>
              .
            </Caption>
          </Surface>
        )}

        {/* Properties list */}
        {actingOrgId && data && data.length > 0 && (
          <div className="space-y-4">
            {data.map((prop) => (
              <PropertyProvisioningCard
                key={prop.propertyId}
                prop={prop}
                retrying={
                  retryMutation.isPending && retryMutation.variables === prop.propertyId
                }
                onRetry={() => retryMutation.mutate(prop.propertyId)}
              />
            ))}
          </div>
        )}
      </div>
    </NovaShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────

const STATUS_META = {
  completed: { label: 'Completado', variant: 'success' as const, icon: CheckCircle2 },
  partial: { label: 'Parcial', variant: 'warning' as const, icon: AlertTriangle },
  failed: { label: 'Falló', variant: 'danger' as const, icon: AlertTriangle },
  in_progress: { label: 'En curso', variant: 'info' as const, icon: Loader2 },
  pending: { label: 'Pendiente', variant: 'neutral' as const, icon: Globe2 },
  none: { label: 'Sin provisionar', variant: 'neutral' as const, icon: Globe2 },
} as const

const CHANNEL_META: Record<
  string,
  { variant: 'success' | 'warning' | 'danger' | 'neutral'; icon: typeof CheckCircle2 }
> = {
  connected: { variant: 'success', icon: CheckCircle2 },
  inactive: { variant: 'neutral', icon: Globe2 },
  pending_credentials: { variant: 'warning', icon: Settings },
  requires_oauth: { variant: 'neutral', icon: Lock },
  error: { variant: 'danger', icon: AlertTriangle },
}

function PropertyProvisioningCard({
  prop,
  retrying,
  onRetry,
}: {
  prop: ChannexProvisioningProperty
  retrying: boolean
  onRetry: () => void
}) {
  const statusKey = (prop.provisioningStatus ?? 'none') as keyof typeof STATUS_META
  const statusMeta = STATUS_META[statusKey] ?? STATUS_META.none
  const StatusIcon = statusMeta.icon
  const canRetry =
    prop.provisioningStatus === 'failed' ||
    prop.provisioningStatus === 'partial' ||
    prop.provisioningStatus === null

  return (
    <Surface variant="raised" radius="lg" padding="lg">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex-shrink-0">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <Title>{prop.propertyName}</Title>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <Chip variant={statusMeta.variant} intent="subtle" size="sm" icon={StatusIcon}>
                {statusMeta.label}
              </Chip>
              {prop.channexPropertyId && (
                <span className="text-[11px] font-mono text-slate-500">
                  channex: {prop.channexPropertyId.slice(0, 8)}…
                </span>
              )}
              {prop.lastProvisionedAt && (
                <span className="text-[11px] text-slate-500">
                  último: {new Date(prop.lastProvisionedAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>
        {canRetry && (
          <Button
            variant="primary"
            size="sm"
            iconLeft={retrying ? Loader2 : RefreshCw}
            onClick={onRetry}
            disabled={retrying}
          >
            {retrying ? 'Reintentando…' : 'Reintentar'}
          </Button>
        )}
      </div>

      {/* Channels */}
      {prop.channels.length > 0 && (
        <div className="mt-3 pl-12">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">
            Canales OTA
          </div>
          <div className="flex flex-wrap gap-1.5">
            {prop.channels.map((ch) => {
              const chMeta =
                CHANNEL_META[ch.status] ?? ({ variant: 'neutral' as const, icon: Globe2 })
              return (
                <Chip
                  key={ch.id}
                  variant={chMeta.variant}
                  intent="subtle"
                  size="sm"
                  icon={chMeta.icon}
                >
                  {ch.title} · {ch.status}
                </Chip>
              )
            })}
          </div>
        </div>
      )}

      {/* Error detail */}
      {prop.provisioningError && (
        <details className="mt-3 pl-12">
          <summary className="cursor-pointer text-[12px] font-medium text-red-700">
            Ver error del último provisioning
          </summary>
          <pre className="mt-2 p-2.5 rounded bg-red-50 border border-red-100 text-[11px] text-red-900 whitespace-pre-wrap font-mono overflow-x-auto">
            {prop.provisioningError}
          </pre>
        </details>
      )}
    </Surface>
  )
}
