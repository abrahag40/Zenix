/**
 * NovaBillingChannexPage — Sprint CHANNEX-AUTO-PROVISION Day 5 (close).
 *
 * Route: /nova/billing/channex
 *
 * Recovery UI del provisioning Channex. Lista todas las Properties de la
 * acting org con su channexProvisioningStatus. Permite:
 *   · Re-disparar provision para properties failed/partial (idempotent)
 *   · Completar credentials de channels que se crearon con configureLater=true
 *   · Abrir Airbnb extranet para channels requires_oauth (regla regulatoria)
 *   · Ver channels per property con su status (inactive/pending/oauth/error)
 *   · Diagnosticar errors capturados durante el provisioning
 *
 * Pattern: el provisioning corre al activar el wizard (best-effort outside-tx).
 * Si algo falló (Channex caído, KEK no configurada, mapping roto), la property
 * queda con status='failed'|'partial' y el consultor recupera desde aquí sin
 * re-activar al cliente.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Globe2,
  Loader2,
  Lock,
  RefreshCw,
  Settings,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
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

// ─────────────────────────────────────────────────────────────────────────
// Channel field metadata — mismas keys que StepChannels DTO, espejo del
// contrato Channex API per OTA type. NUNCA logger los valores.
// ─────────────────────────────────────────────────────────────────────────

interface FieldSpec {
  key: string
  label: string
  placeholder: string
  secret: boolean
}

const CHANNEL_FIELDS: Record<string, FieldSpec[]> = {
  BookingCom: [
    { key: 'hotel_id', label: 'Hotel ID (Booking)', placeholder: 'e.g. 12345678', secret: false },
    { key: 'username', label: 'Username del extranet', placeholder: 'usuario.hotel', secret: false },
    { key: 'password', label: 'Password del extranet', placeholder: '••••••••', secret: true },
  ],
  ExpediaCom: [
    { key: 'eqc_id', label: 'EQC ID (Expedia)', placeholder: 'e.g. 87654321', secret: false },
    { key: 'username', label: 'Username Expedia PC', placeholder: 'hotel.user', secret: false },
    { key: 'password', label: 'Password Expedia PC', placeholder: '••••••••', secret: true },
  ],
  AgodaCom: [
    { key: 'hotel_id', label: 'Hotel ID (Agoda YCS)', placeholder: 'e.g. 4567890', secret: false },
    { key: 'username', label: 'Username YCS', placeholder: 'hotel.ycs', secret: false },
    { key: 'password', label: 'Password YCS', placeholder: '••••••••', secret: true },
  ],
  VRBOCom: [
    { key: 'vrbo_property_id', label: 'VRBO Property ID', placeholder: 'e.g. 1234567', secret: false },
  ],
  GoogleHotelAds: [
    { key: 'partner_id', label: 'Google Partner ID', placeholder: 'e.g. 123456789', secret: false },
    {
      key: 'booking_link_template',
      label: 'Booking link template',
      placeholder: 'https://book.zenix.com/?hotel={id}',
      secret: false,
    },
  ],
  OpenChannel: [],
  // AirbnbCom NO está aquí — requiere OAuth, no admite manual.
}

/**
 * URL del extranet Airbnb para que el host complete el OAuth handshake.
 * Channex auto-detecta el listing por webhook post-OAuth.
 */
const AIRBNB_EXTRANET_URL = 'https://www.airbnb.com/hosting/listings'

// ─────────────────────────────────────────────────────────────────────────

export function NovaBillingChannexPage() {
  const actingOrgId = useNovaStore((s) => s.actingOrgId)
  const actingOrgName = useNovaStore((s) => s.actingOrgName)
  const qc = useQueryClient()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['channex-provisioning', actingOrgId],
    queryFn: () => channexMgmtClient.listProvisioning(),
    enabled: !!actingOrgId,
  })

  const [completingChannel, setCompletingChannel] = useState<{
    channelId: string
    channelType: string
    channelTitle: string
  } | null>(null)

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

  const completeCredsMutation = useMutation<
    Awaited<ReturnType<typeof channexMgmtClient.completeChannelCredentials>>,
    Error,
    { channelId: string; credentials: Record<string, string> }
  >({
    mutationFn: ({ channelId, credentials }) =>
      channexMgmtClient.completeChannelCredentials(channelId, credentials),
    onSuccess: (result) => {
      toast.success(`${result.title} → ${result.status}`, { duration: 4000 })
      setCompletingChannel(null)
      qc.invalidateQueries({ queryKey: ['channex-provisioning', actingOrgId] })
    },
    onError: (err) => {
      toast.error(err.message ?? 'No se pudieron completar las credenciales', { duration: 7000 })
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
                onCompleteCredentials={(channelId, channelType, channelTitle) =>
                  setCompletingChannel({ channelId, channelType, channelTitle })
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Complete credentials dialog */}
      {completingChannel && (
        <CompleteCredentialsDialog
          channelId={completingChannel.channelId}
          channelType={completingChannel.channelType}
          channelTitle={completingChannel.channelTitle}
          submitting={completeCredsMutation.isPending}
          onSubmit={(credentials) =>
            completeCredsMutation.mutate({
              channelId: completingChannel.channelId,
              credentials,
            })
          }
          onCancel={() => setCompletingChannel(null)}
        />
      )}
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
  { variant: 'success' | 'warning' | 'danger' | 'neutral'; icon: LucideIcon }
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
  onCompleteCredentials,
}: {
  prop: ChannexProvisioningProperty
  retrying: boolean
  onRetry: () => void
  onCompleteCredentials: (channelId: string, channelType: string, channelTitle: string) => void
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

      {/* Channels — rows con actions contextuales per status */}
      {prop.channels.length > 0 && (
        <div className="mt-3 pl-12 space-y-1.5">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
            Canales OTA
          </div>
          <div className="space-y-1.5">
            {prop.channels.map((ch) => (
              <ChannelRow
                key={ch.id}
                channel={ch}
                onCompleteCredentials={() =>
                  onCompleteCredentials(ch.id, ch.type, ch.title)
                }
              />
            ))}
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

function ChannelRow({
  channel,
  onCompleteCredentials,
}: {
  channel: ChannexProvisioningProperty['channels'][number]
  onCompleteCredentials: () => void
}) {
  const meta = CHANNEL_META[channel.status] ?? { variant: 'neutral' as const, icon: Globe2 }
  const ChannelIcon = meta.icon
  const isPendingCreds = channel.status === 'pending_credentials'
  const isOauth = channel.status === 'requires_oauth'

  return (
    <div className="flex items-center justify-between gap-2 py-1.5 px-2.5 rounded-md bg-slate-50/60 border border-slate-100">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <ChannelIcon className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
        <span className="text-[12px] font-medium text-slate-800 truncate">{channel.title}</span>
        <Chip variant={meta.variant} intent="subtle" size="sm">
          {channel.status}
        </Chip>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {isPendingCreds && (
          <Button
            variant="secondary"
            size="xs"
            iconLeft={Settings}
            onClick={onCompleteCredentials}
          >
            Completar credenciales
          </Button>
        )}
        {isOauth && (
          <a
            href={AIRBNB_EXTRANET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
            title="Airbnb requiere OAuth handshake en su portal — Channex auto-detecta el listing post-OAuth"
          >
            Abrir Airbnb extranet
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Complete credentials dialog
// ─────────────────────────────────────────────────────────────────────────

function CompleteCredentialsDialog({
  channelId,
  channelType,
  channelTitle,
  submitting,
  onSubmit,
  onCancel,
}: {
  channelId: string
  channelType: string
  channelTitle: string
  submitting: boolean
  onSubmit: (credentials: Record<string, string>) => void
  onCancel: () => void
}) {
  const fields = useMemo(() => CHANNEL_FIELDS[channelType] ?? [], [channelType])
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, ''])),
  )
  const [showSecrets, setShowSecrets] = useState(false)

  const hasSecretField = fields.some((f) => f.secret)
  const allFieldsFilled = fields.every((f) => values[f.key]?.trim().length > 0)
  const canSubmit = allFieldsFilled && !submitting

  if (fields.length === 0) {
    // Tipo de channel sin campos required (OpenChannel) — no debería abrirse
    // este dialog, pero defense-in-depth.
    return (
      <DialogShell onCancel={onCancel}>
        <Caption>{channelType} no requiere credentials manuales.</Caption>
        <div className="flex justify-end pt-3">
          <Button variant="primary" onClick={onCancel}>
            Cerrar
          </Button>
        </div>
      </DialogShell>
    )
  }

  return (
    <DialogShell onCancel={onCancel}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <Title>{channelTitle}</Title>
          <Caption className="mt-0.5">Completar credenciales del canal</Caption>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 rounded text-slate-400 hover:bg-slate-100"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {hasSecretField && (
        <div className="flex justify-end -mb-2">
          <button
            type="button"
            onClick={() => setShowSecrets((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700"
          >
            {showSecrets ? (
              <>
                <EyeOff className="h-3 w-3" />
                Ocultar secretos
              </>
            ) : (
              <>
                <Eye className="h-3 w-3" />
                Mostrar secretos
              </>
            )}
          </button>
        </div>
      )}

      <div className="space-y-3 mt-2">
        {fields.map((field) => (
          <div key={field.key}>
            <label className="block text-[12px] font-medium text-slate-700 mb-1">
              {field.label}
            </label>
            <input
              type={field.secret && !showSecrets ? 'password' : 'text'}
              value={values[field.key] ?? ''}
              onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
              placeholder={field.placeholder}
              className="w-full px-3 h-9 rounded-md border border-slate-300 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
              autoComplete={field.secret ? 'new-password' : 'off'}
            />
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2 text-[11px] text-slate-500 pt-2 mt-3 border-t border-slate-100">
        <Lock className="h-3 w-3 mt-0.5 flex-shrink-0" />
        <span>
          Las credenciales se cifran AES-256-GCM en el servidor antes de
          persistirse y se propagan a Channex via API. Zenix NUNCA las muestra
          en logs ni audit trail.
        </span>
      </div>

      <div className="flex justify-end gap-2 pt-3">
        <Button variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          iconLeft={submitting ? Loader2 : undefined}
          disabled={!canSubmit}
          onClick={() => onSubmit(values)}
        >
          {submitting ? 'Guardando…' : 'Guardar credenciales'}
        </Button>
      </div>
      {/* SR-only para accessibility */}
      <span className="sr-only">channelId: {channelId}</span>
    </DialogShell>
  )
}

function DialogShell({
  children,
  onCancel,
}: {
  children: React.ReactNode
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-xl shadow-2xl p-5 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
