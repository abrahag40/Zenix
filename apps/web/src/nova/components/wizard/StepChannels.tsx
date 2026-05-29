/**
 * Step 5.5 — Canales OTA (Sprint CHANNEX-AUTO-PROVISION Day 3).
 *
 * Flow:
 *   1. Master toggle "channexPushEnabled" — si OFF, el step entero queda inerte
 *      y el backend skip provisioning Channex completo. Útil para Activate Lite
 *      bundle (PMS-only) o clientes pre-piloto sin Channex partnership.
 *   2. Multiselect de canales OTA. Click chip → abre dialog per-channel para
 *      capturar credentials (hotel_id + username + password para
 *      Booking/Expedia/Agoda; listing_id para Airbnb; partner_id para Google).
 *   3. Checkbox "Configurar después" en cada dialog: skip credentials capture,
 *      el channel queda creado en Channex pero con status pending_credentials.
 *      El cliente o consultor las completa post-activación en /nova/billing/channex.
 *   4. Airbnb siempre marca status='requires_oauth' (regla regulatoria desde
 *      2022 — no se puede establecer connection programática). UI muestra
 *      banner explicando que el handshake OAuth se hace post-trial en Airbnb
 *      extranet → Channex auto-detecta el listing por webhook.
 *
 * Cert alignment:
 *   · Per-channel credentials NUNCA logged plain text (backend cifra AES-256-GCM).
 *   · Channel creado con is_active=false default — manual activation post
 *     OTA-side onboarding (content moderation Booking, etc.).
 *
 * UX standards:
 *   · Apple HIG forcing function — checkbox "tengo las credentials" enabler
 *     del submit cuando hay un canal con credentials requeridas.
 *   · NN/g progressive disclosure — credentials modal solo al click de chip.
 *   · Hick's law — 7 canales máx visibles, agrupados por popularidad LATAM
 *     (Booking + Airbnb destacados; otros colapsables).
 */
import { useMemo, useState } from 'react'
import { useWizardStore, type WizardChannelState, type WizardChannelType } from '../../../store/wizard'
import { WizardLayout } from './WizardLayout'
import {
  Surface,
  Body,
  Title,
  Subhead,
  Caption,
  Chip,
  Button,
} from '../../design-system'
import {
  Globe2,
  Plane,
  Home,
  Building2,
  TerminalSquare,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Settings,
  Trash2,
  ExternalLink,
  X,
  Eye,
  EyeOff,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface ChannelMeta {
  type: WizardChannelType
  label: string
  icon: LucideIcon
  /** Hint corto sobre auth method y qué credentials pide */
  authHint: string
  /** Si true → UI muestra warning OAuth post-trial. Solo Airbnb. */
  oauthRequired: boolean
  /** Campos required en el credentials dialog. */
  credentialFields: Array<{
    key: string
    label: string
    placeholder: string
    secret: boolean
  }>
  /** Tag de popularidad para sorting. */
  popular: boolean
}

const CHANNELS_META: ChannelMeta[] = [
  {
    type: 'BookingCom',
    label: 'Booking.com',
    icon: Globe2,
    authHint: 'Requiere Hotel ID + credenciales de extranet',
    oauthRequired: false,
    popular: true,
    credentialFields: [
      { key: 'hotel_id', label: 'Hotel ID (Booking ID)', placeholder: 'e.g. 12345678', secret: false },
      { key: 'username', label: 'Username del extranet', placeholder: 'usuario.hotel', secret: false },
      { key: 'password', label: 'Password del extranet', placeholder: '••••••••', secret: true },
    ],
  },
  {
    type: 'AirbnbCom',
    label: 'Airbnb',
    icon: Home,
    authHint: 'OAuth handshake manual post-trial — regla Airbnb 2022',
    oauthRequired: true,
    popular: true,
    credentialFields: [
      {
        key: 'listing_id',
        label: 'Listing ID (opcional — Airbnb lo detecta)',
        placeholder: 'e.g. 42893712',
        secret: false,
      },
    ],
  },
  {
    type: 'ExpediaCom',
    label: 'Expedia',
    icon: Plane,
    authHint: 'Requiere EQC ID + credenciales de partner central',
    oauthRequired: false,
    popular: true,
    credentialFields: [
      { key: 'eqc_id', label: 'EQC ID (Expedia)', placeholder: 'e.g. 87654321', secret: false },
      { key: 'username', label: 'Username Expedia PC', placeholder: 'hotel.user', secret: false },
      { key: 'password', label: 'Password Expedia PC', placeholder: '••••••••', secret: true },
    ],
  },
  {
    type: 'AgodaCom',
    label: 'Agoda',
    icon: Globe2,
    authHint: 'Requiere Hotel ID + credenciales YCS',
    oauthRequired: false,
    popular: false,
    credentialFields: [
      { key: 'hotel_id', label: 'Hotel ID (Agoda YCS)', placeholder: 'e.g. 4567890', secret: false },
      { key: 'username', label: 'Username YCS', placeholder: 'hotel.ycs', secret: false },
      { key: 'password', label: 'Password YCS', placeholder: '••••••••', secret: true },
    ],
  },
  {
    type: 'VRBOCom',
    label: 'VRBO / HomeAway',
    icon: Home,
    authHint: 'Hereda credenciales de Expedia (parent network)',
    oauthRequired: false,
    popular: false,
    credentialFields: [
      { key: 'vrbo_property_id', label: 'VRBO Property ID', placeholder: 'e.g. 1234567', secret: false },
    ],
  },
  {
    type: 'GoogleHotelAds',
    label: 'Google Hotel Ads',
    icon: Building2,
    authHint: 'Requiere Partner ID + Booking Link Template',
    oauthRequired: false,
    popular: false,
    credentialFields: [
      { key: 'partner_id', label: 'Google Partner ID', placeholder: 'e.g. 123456789', secret: false },
      {
        key: 'booking_link_template',
        label: 'Booking link template',
        placeholder: 'https://book.zenix.com/?hotel={id}',
        secret: false,
      },
    ],
  },
  {
    type: 'OpenChannel',
    label: 'Open Channel (sandbox)',
    icon: TerminalSquare,
    authHint: 'Solo testing — sin credentials, recibe reservas de prueba',
    oauthRequired: false,
    popular: false,
    credentialFields: [],
  },
]

export function StepChannels() {
  const channexPushEnabled = useWizardStore((s) => s.channexPushEnabled)
  const channels = useWizardStore((s) => s.channels)
  const setField = useWizardStore((s) => s.setField)
  const addChannel = useWizardStore((s) => s.addChannel)
  const updateChannel = useWizardStore((s) => s.updateChannel)
  const removeChannel = useWizardStore((s) => s.removeChannel)

  const [editingChannel, setEditingChannel] = useState<{
    meta: ChannelMeta
    existing: WizardChannelState | null
  } | null>(null)

  const popularChannels = useMemo(
    () => CHANNELS_META.filter((c) => c.popular),
    [],
  )
  const otherChannels = useMemo(
    () => CHANNELS_META.filter((c) => !c.popular),
    [],
  )

  const selectedTypes = new Set(channels.map((c) => c.type))

  return (
    <WizardLayout
      title="Canales OTA"
      description="Selecciona los canales OTA que el cliente quiere tener activos desde día 1. Backend cifra credentials AES-256-GCM y crea cada uno en Channex automáticamente al activar."
    >
      <div className="space-y-6">

        {/* Master toggle */}
        <Surface className="p-5">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={channexPushEnabled}
              onChange={(e) => setField('channexPushEnabled', e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <div className="flex-1">
              <Subhead>Activar Channel Manager (Channex)</Subhead>
              <Caption className="mt-1">
                Si está activo, Zenix crea Property + Room Types + Rate Plans + canales OTA
                seleccionados en Channex automáticamente al activar el cliente. Desactiva si el
                cliente NO usa Channex (Activate Lite bundle PMS-only).
              </Caption>
            </div>
          </label>
        </Surface>

        {channexPushEnabled && (
          <>
            {/* Canales populares LATAM */}
            <div>
              <Subhead className="mb-3">Canales más populares en LATAM</Subhead>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {popularChannels.map((meta) => (
                  <ChannelCard
                    key={meta.type}
                    meta={meta}
                    existing={channels.find((c) => c.type === meta.type) ?? null}
                    selected={selectedTypes.has(meta.type)}
                    onConfigure={() =>
                      setEditingChannel({
                        meta,
                        existing: channels.find((c) => c.type === meta.type) ?? null,
                      })
                    }
                    onRemove={() => {
                      const ch = channels.find((c) => c.type === meta.type)
                      if (ch) removeChannel(ch.tempId)
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Otros canales */}
            <div>
              <Subhead className="mb-3">Otros canales</Subhead>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {otherChannels.map((meta) => (
                  <ChannelCard
                    key={meta.type}
                    meta={meta}
                    existing={channels.find((c) => c.type === meta.type) ?? null}
                    selected={selectedTypes.has(meta.type)}
                    onConfigure={() =>
                      setEditingChannel({
                        meta,
                        existing: channels.find((c) => c.type === meta.type) ?? null,
                      })
                    }
                    onRemove={() => {
                      const ch = channels.find((c) => c.type === meta.type)
                      if (ch) removeChannel(ch.tempId)
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Resumen */}
            {channels.length > 0 && (
              <Surface className="p-4 border-l-4 border-emerald-400">
                <Caption>
                  <strong>{channels.length}</strong>{' '}
                  {channels.length === 1 ? 'canal seleccionado' : 'canales seleccionados'}.{' '}
                  Backend creará todos en Channex al activar el wizard (Days 1-2 backend cerrados).
                </Caption>
              </Surface>
            )}
          </>
        )}

        {!channexPushEnabled && (
          <Surface className="p-4 border-l-4 border-slate-300">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
              <Caption>
                Channel Manager deshabilitado. Al activar, Zenix NO creará nada en Channex. El
                cliente puede activar Channex después manualmente desde{' '}
                <code className="text-emerald-700">/nova/billing/channex</code>.
              </Caption>
            </div>
          </Surface>
        )}
      </div>

      {/* Credentials dialog */}
      {editingChannel && (
        <ChannelCredentialsDialog
          meta={editingChannel.meta}
          existing={editingChannel.existing}
          onSave={(channelData) => {
            if (editingChannel.existing) {
              updateChannel(editingChannel.existing.tempId, channelData)
            } else {
              addChannel({
                type: editingChannel.meta.type,
                title: editingChannel.meta.label,
                credentials: channelData.credentials ?? {},
                configureLater: channelData.configureLater ?? false,
              })
            }
            setEditingChannel(null)
          }}
          onCancel={() => setEditingChannel(null)}
        />
      )}
    </WizardLayout>
  )
}

// ─────────────────────────────────────────────────────────────────────────

function ChannelCard({
  meta,
  existing,
  selected,
  onConfigure,
  onRemove,
}: {
  meta: ChannelMeta
  existing: WizardChannelState | null
  selected: boolean
  onConfigure: () => void
  onRemove: () => void
}) {
  const Icon = meta.icon
  const status = !existing
    ? 'none'
    : existing.configureLater
      ? 'pending'
      : meta.oauthRequired
        ? 'oauth'
        : 'ready'

  return (
    <div
      className={
        'rounded-xl border-2 p-4 transition-colors ' +
        (selected
          ? 'border-emerald-300 bg-emerald-50/40'
          : 'border-slate-200 bg-white hover:border-slate-300')
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={
            'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ' +
            (selected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600')
          }
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <Body className="font-semibold">{meta.label}</Body>
            {status === 'ready' && (
              <Chip variant="success" size="sm">
                <CheckCircle2 className="h-3 w-3 mr-0.5" />
                Listo
              </Chip>
            )}
            {status === 'pending' && (
              <Chip variant="warning" size="sm">
                Pendiente credenciales
              </Chip>
            )}
            {status === 'oauth' && (
              <Chip variant="neutral" size="sm">
                <Lock className="h-3 w-3 mr-0.5" />
                OAuth post-trial
              </Chip>
            )}
          </div>
          <Caption className="mt-1 line-clamp-2">{meta.authHint}</Caption>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onConfigure}>
              <Settings className="h-3.5 w-3.5 mr-1" />
              {selected ? 'Editar' : 'Configurar'}
            </Button>
            {selected && (
              <Button variant="ghost" size="sm" onClick={onRemove}>
                <Trash2 className="h-3.5 w-3.5 mr-1 text-red-500" />
                Quitar
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────

function ChannelCredentialsDialog({
  meta,
  existing,
  onSave,
  onCancel,
}: {
  meta: ChannelMeta
  existing: WizardChannelState | null
  onSave: (data: Partial<WizardChannelState>) => void
  onCancel: () => void
}) {
  const [credentials, setCredentials] = useState<Record<string, string>>(
    existing?.credentials ?? {},
  )
  const [configureLater, setConfigureLater] = useState(existing?.configureLater ?? false)
  const [showSecrets, setShowSecrets] = useState(false)

  const Icon = meta.icon

  const allFieldsFilled = meta.credentialFields.every(
    (f) => (credentials[f.key] ?? '').trim().length > 0,
  )
  const canSave = configureLater || allFieldsFilled || meta.credentialFields.length === 0

  const handleSave = () => {
    onSave({
      credentials: configureLater ? {} : credentials,
      configureLater,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-3 top-3 p-1.5 rounded text-slate-500 hover:bg-slate-100"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-11 h-11 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <Title>{meta.label}</Title>
              <Caption className="mt-0.5">{meta.authHint}</Caption>
            </div>
          </div>

          {meta.oauthRequired && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <Lock className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />
              <div className="text-[12px] text-amber-900">
                <strong>OAuth post-trial</strong>: por regla regulatoria de Airbnb desde 2022, la
                conexión real se hace en el extranet de Airbnb después que el cliente entre a
                Zenix. El listing se detecta automático vía webhook de Channex.
              </div>
            </div>
          )}

          {/* Credentials form */}
          {meta.credentialFields.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Subhead>Credenciales</Subhead>
                {meta.credentialFields.some((f) => f.secret) && (
                  <button
                    type="button"
                    onClick={() => setShowSecrets((v) => !v)}
                    className="text-[11px] text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
                  >
                    {showSecrets ? (
                      <>
                        <EyeOff className="h-3 w-3" />
                        Ocultar
                      </>
                    ) : (
                      <>
                        <Eye className="h-3 w-3" />
                        Mostrar
                      </>
                    )}
                  </button>
                )}
              </div>
              {meta.credentialFields.map((field) => (
                <div key={field.key}>
                  <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">
                    {field.label}
                  </label>
                  <input
                    type={field.secret && !showSecrets ? 'password' : 'text'}
                    value={credentials[field.key] ?? ''}
                    onChange={(e) =>
                      setCredentials((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    disabled={configureLater}
                    placeholder={field.placeholder}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 text-[14px] disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Configure later toggle */}
          {!meta.oauthRequired && meta.credentialFields.length > 0 && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={configureLater}
                onChange={(e) => setConfigureLater(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <div className="text-[12px] text-slate-700">
                <strong>No tengo las credenciales ahora</strong> — el canal queda creado en Channex
                con status <code>pending_credentials</code>. El consultor o cliente las completa en{' '}
                <code className="text-emerald-700">/nova/billing/channex</code> después.
              </div>
            </label>
          )}

          {/* Privacy note */}
          <div className="flex items-start gap-2 text-[11px] text-slate-500 pt-2 border-t border-slate-100">
            <Lock className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <span>
              Las credenciales se cifran AES-256-GCM en el servidor antes de persistirse. Zenix
              NUNCA las muestra en logs ni audit trail.
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
            <Button variant="primary" disabled={!canSave} onClick={handleSave}>
              {existing ? 'Actualizar canal' : 'Agregar canal'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
