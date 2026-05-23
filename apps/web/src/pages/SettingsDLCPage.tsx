/**
 * SettingsDLCPage.tsx — Sprint LEARNING-CORE Fase 1.1
 *
 * Settings de Add-Ons / DLCs del tenant. Permite:
 *   - Ver qué DLCs están ACTIVE / SUSPENDED / ARCHIVED
 *   - Activar Zenix Learning (DLC LEARNING_CORE)
 *   - Cancelar un DLC (data preserved §141)
 *   - Reactivar desde cualquier status (§141)
 *
 * Tu caso de uso: cliente con 4 hoteles que en Activate dijo "no" al LMS,
 * llega 6 meses después y quiere activarlo. Aquí lo hace en 3 clicks.
 * Doc 14 §2.1 detalla el flujo.
 *
 * Route: /settings/dlc (también accesible vía /settings con sub-section)
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  AlertCircle,
  Archive,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useDLCs, useActivateDLC, useCancelDLC } from '../modules/learning/hooks/useLearning'
import { DLCScopeEditor } from '../modules/learning/components/DLCScopeEditor'
import type {
  DLCCode,
  DLCStatus,
  TenantDLC,
} from '../modules/learning/api/learning.api'

// Catalog of DLCs disponibles para activación
const DLC_CATALOG: Array<{
  code: DLCCode
  name: string
  description: string
  priceMonth: number
  billingMode: 'PER_STAFF_ACTIVE' | 'FLAT_MONTHLY'
  available: boolean
}> = [
  {
    code: 'LEARNING_CORE',
    name: 'Zenix Learning Core',
    description:
      'LMS embebido + DC-3 STPS + 3 cursos compliance (Distintivo H + NOM-035, Front Office AHLEI, Housekeeping). Mobile offline + audio-first para housekeeping.',
    priceMonth: 7,
    billingMode: 'PER_STAFF_ACTIVE',
    available: true,
  },
  {
    code: 'LEARNING_PRO',
    name: 'Zenix Learning Pro',
    description:
      'Todo lo de Core + SCORM/xAPI player + course authoring + cursos AHLEI/eHotelier importables.',
    priceMonth: 12,
    billingMode: 'PER_STAFF_ACTIVE',
    available: false, // Fase 2 v1.1.x
  },
  {
    code: 'BOOKING_ENGINE',
    name: 'Zenix Booking Engine',
    description:
      'Direct Booking + Widget embebible + WordPress plugin + REST API público.',
    priceMonth: 12,
    billingMode: 'FLAT_MONTHLY',
    available: false, // Sprint BOOKING-ENGINE
  },
]

export function SettingsDLCPage() {
  const navigate = useNavigate()
  const { data: dlcs, isLoading } = useDLCs()
  const activateMut = useActivateDLC()
  const cancelMut = useCancelDLC()

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/settings')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver a Settings
        </Button>

        <header className="mt-6">
          <h1 className="text-2xl font-semibold text-slate-900">Add-Ons / DLCs</h1>
          <p className="mt-1 text-sm text-slate-600">
            Activa o cancela módulos opcionales. Tu data se preserva si cancelas — puedes reactivar cuando quieras (hasta 5 años, LFT compliance).
          </p>
        </header>

        {isLoading ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {DLC_CATALOG.map((catalog) => {
              const existing = dlcs?.find((d) => d.dlcCode === catalog.code)
              return (
                <DLCCard
                  key={catalog.code}
                  catalog={catalog}
                  existing={existing}
                  onActivate={() =>
                    activateMut.mutate({
                      dlcCode: catalog.code,
                      billingMode: catalog.billingMode,
                      pricePerUnit: catalog.priceMonth,
                    })
                  }
                  onCancel={(reason) =>
                    cancelMut.mutate({ dlcCode: catalog.code, reason })
                  }
                  isActivating={activateMut.isPending && activateMut.variables?.dlcCode === catalog.code}
                  isCancelling={cancelMut.isPending && cancelMut.variables?.dlcCode === catalog.code}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── DLC Card ──────────────────────────────────────────────────────────────

function DLCCard(props: {
  catalog: (typeof DLC_CATALOG)[number]
  existing: TenantDLC | undefined
  onActivate: () => void
  onCancel: (reason: string) => void
  isActivating: boolean
  isCancelling: boolean
}) {
  const { catalog, existing } = props
  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [showScopeEditor, setShowScopeEditor] = useState(false)

  const status = existing?.status

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-medium text-slate-900">{catalog.name}</h2>
            <DLCStatusBadge status={status} available={catalog.available} />
          </div>
          <p className="mt-2 text-sm text-slate-600">{catalog.description}</p>
          <p className="mt-2 text-xs text-slate-500">
            ${catalog.priceMonth} USD
            {catalog.billingMode === 'PER_STAFF_ACTIVE'
              ? ' / staff activo / mes'
              : ' / mes'}
          </p>
          {existing && existing.scopedPropertyIds.length > 0 && (
            <p className="mt-1 text-xs text-amber-700">
              Scope limitado a {existing.scopedPropertyIds.length} properties
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {!catalog.available && (
            <Badge variant="outline" className="text-slate-500">
              Disponible próximamente
            </Badge>
          )}

          {catalog.available && !existing && (
            <Button
              onClick={props.onActivate}
              disabled={props.isActivating}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {props.isActivating ? 'Activando…' : 'Activar'}
            </Button>
          )}

          {catalog.available && existing?.status === 'ACTIVE' && !showCancel && (
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowScopeEditor(true)}
              >
                Configurar scope
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCancel(true)}
              >
                Cancelar
              </Button>
            </div>
          )}

          {catalog.available && existing && existing.status !== 'ACTIVE' && (
            <Button
              onClick={props.onActivate}
              disabled={props.isActivating}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {props.isActivating ? 'Reactivando…' : 'Reactivar'}
            </Button>
          )}
        </div>
      </div>

      {/* Info adicional según status */}
      {existing && (
        <DLCStatusDetail dlc={existing} />
      )}

      {/* Cancel form */}
      {showCancel && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            ¿Estás seguro de cancelar?
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Tu data (cursos, enrollments, certificados, audit logs) se preserva 5 años. Puedes reactivar en cualquier momento.
          </p>
          <textarea
            className="mt-3 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
            rows={2}
            placeholder="Razón de cancelación (opcional)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowCancel(false)
                setCancelReason('')
              }}
              disabled={props.isCancelling}
            >
              No, mantener
            </Button>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700"
              disabled={props.isCancelling}
              onClick={() => {
                props.onCancel(cancelReason || 'Sin razón provista')
                setShowCancel(false)
                setCancelReason('')
              }}
            >
              {props.isCancelling ? 'Cancelando…' : 'Sí, cancelar'}
            </Button>
          </div>
        </div>
      )}

      {/* §147 — Scope editor modal */}
      {existing && existing.status === 'ACTIVE' && (
        <DLCScopeEditor
          open={showScopeEditor}
          onOpenChange={setShowScopeEditor}
          dlc={existing}
        />
      )}
    </div>
  )
}

function DLCStatusBadge(props: { status?: DLCStatus; available: boolean }) {
  if (!props.available) return null
  if (!props.status) {
    return <Badge variant="outline">Sin activar</Badge>
  }
  switch (props.status) {
    case 'ACTIVE':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Activo
        </Badge>
      )
    case 'SUSPENDED':
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
          <Clock className="mr-1 h-3 w-3" />
          Suspendido
        </Badge>
      )
    case 'GRACE_PERIOD':
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
          <AlertCircle className="mr-1 h-3 w-3" />
          Grace period
        </Badge>
      )
    case 'ARCHIVED':
      return (
        <Badge className="bg-slate-200 text-slate-700 hover:bg-slate-200">
          <Archive className="mr-1 h-3 w-3" />
          Archivado
        </Badge>
      )
    case 'PURGED':
      return (
        <Badge variant="outline" className="text-slate-500">
          Purgado
        </Badge>
      )
    default:
      return <Badge variant="outline">{props.status}</Badge>
  }
}

function DLCStatusDetail(props: { dlc: TenantDLC }) {
  const d = props.dlc
  if (d.status === 'ACTIVE') {
    return (
      <p className="mt-3 text-xs text-slate-500">
        Activo desde {new Date(d.activatedAt).toLocaleDateString('es-MX')}
        {d.reactivatedAt && ` (reactivado ${new Date(d.reactivatedAt).toLocaleDateString('es-MX')})`}
      </p>
    )
  }
  if (d.status === 'SUSPENDED' && d.gracePeriodEndsAt) {
    const daysLeft = Math.ceil(
      (new Date(d.gracePeriodEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
    )
    return (
      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
        <p className="font-medium text-amber-900">
          Suspendido {d.suspendedAt && new Date(d.suspendedAt).toLocaleDateString('es-MX')}
        </p>
        <p className="mt-1 text-amber-800">
          {daysLeft > 0
            ? `Tu data se archivará en ${daysLeft} días si no reactivas. Pero sigue preservada — reactivación posible en cualquier momento (hasta 5 años).`
            : 'Grace period vencido. Data archivada.'}
        </p>
        {d.cancellationReason && (
          <p className="mt-2 text-amber-700">Razón: {d.cancellationReason}</p>
        )}
      </div>
    )
  }
  if (d.status === 'ARCHIVED') {
    return (
      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
        <p className="font-medium text-slate-700">
          Archivado {d.archivedAt && new Date(d.archivedAt).toLocaleDateString('es-MX')}
        </p>
        <p className="mt-1 text-slate-600">
          Tu data está preservada por compliance LFT (5 años). Reactiva para recuperar acceso completo.
        </p>
      </div>
    )
  }
  return null
}
