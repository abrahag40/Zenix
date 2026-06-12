/**
 * Step 7 — Integrations health-checks (§173 D-NOVA-15).
 *
 * 4 checks obligatorios pre-activación. Estado runtime — NO persiste
 * (cada vez que abres el step los re-ejecutas; los external services
 * pueden haber cambiado entre sesiones, e.g. cliente activó Stripe
 * mientras tanto).
 *
 *   (a) Channex API ping (sandbox staging.channex.io)
 *   (b) Stripe test charge $1 USD + immediate refund
 *   (c) PAC sandbox stamp con CFDI mock
 *   (d) SMTP test email a noreply@zenix.app
 *
 * Cualquier fail bloquea Step 8. "Re-test" button per check.
 * Warning de PAC permite continuar con confirm explícito (DLC opcional
 * para clientes que aún no han contratado PAC — pattern Salesforce
 * "Industry Solutions" donde el PAC adapter es activable post v1.0.0).
 */
import { useState } from 'react'
import { useWizardStore } from '../../../store/wizard'
import { wizardClient } from '../../api/wizard-client'
import { WizardLayout } from './WizardLayout'
import {
  Surface,
  Body,
  Subhead,
  Caption,
  Chip,
  Button,
  Title,
} from '../../design-system'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Plug,
  CreditCard,
  Receipt,
  Mail,
  AlertTriangle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────

type CheckStatus = 'idle' | 'running' | 'success' | 'warning' | 'error'

interface HealthCheck {
  id: 'channex' | 'stripe' | 'pac' | 'smtp'
  label: string
  description: string
  icon: LucideIcon
  status: CheckStatus
  message?: string
  latencyMs?: number
  /** Warning permite continuar con confirm (caso PAC no contratado aún). */
  allowOverride?: boolean
}

const INITIAL_CHECKS: HealthCheck[] = [
  {
    id: 'channex',
    label: 'Canales de venta (Channex)',
    description:
      'Confirma que el cliente puede recibir reservas desde Booking.com, Expedia, Airbnb y demás OTAs conectadas a su channel manager.',
    icon: Plug,
    status: 'idle',
  },
  {
    id: 'stripe',
    label: 'Cobros con tarjeta (Stripe)',
    description:
      'Verifica que la cuenta Stripe del cliente está activa para cobrar tarjetas de crédito y débito sin sorpresas el día 1.',
    icon: CreditCard,
    status: 'idle',
  },
  {
    id: 'pac',
    label: 'Facturación electrónica (CFDI)',
    description:
      'Prueba que el proveedor de facturas del cliente (Facturama o SW Sapien en México) responde con las credenciales configuradas.',
    icon: Receipt,
    status: 'idle',
  },
  {
    id: 'smtp',
    label: 'Envío de correos',
    description:
      'Confirma que Zenix puede enviar al cliente correos automáticos: confirmaciones de reserva, recibos, alertas, etc.',
    icon: Mail,
    status: 'idle',
  },
]

/**
 * Real health-check executor (Day 16 — backend wireado).
 *
 *   POST /v1/nova/wizard/health/channex — REAL ping a Channex (listProperties)
 *   POST /v1/nova/wizard/health/stripe  — STUB success (Day 17 wirea Stripe SDK)
 *   POST /v1/nova/wizard/health/pac     — STUB warning (Day 17 wirea PAC adapters)
 *   POST /v1/nova/wizard/health/smtp    — STUB success (Day 17 wirea Resend)
 *
 * El backend devuelve { status, message, latencyMs, detail? } — el frontend
 * solo mapea a UI. Si network falla → error con message del ApiError.
 */
async function runCheckReal(
  id: HealthCheck['id'],
  ctx: { pacAdapter: string; legalEntityTaxId: string; orgOwnerEmail: string },
): Promise<Partial<HealthCheck>> {
  try {
    const res =
      id === 'channex'
        ? await wizardClient.healthChannex(undefined) // Day 16: sin propertyId — verifica api-key
        : id === 'stripe'
          ? await wizardClient.healthStripe(undefined)
          : id === 'pac'
            ? await wizardClient.healthPac(ctx.pacAdapter, ctx.legalEntityTaxId)
            : await wizardClient.healthSmtp(ctx.orgOwnerEmail || 'noreply@zenix.app')
    return {
      status: res.status as CheckStatus,
      message: res.message,
      latencyMs: res.latencyMs,
      allowOverride: res.status === 'warning', // cualquier integración no configurada (Channex/PAC/etc.) es overridable
    }
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message.length > 180
          ? err.message.slice(0, 180) + '…'
          : err.message
        : 'Network error contacting Zenix API'
    return {
      status: 'error' as CheckStatus,
      message,
      latencyMs: 0,
    }
  }
}

export function StepIntegrations() {
  const state = useWizardStore()
  const [checks, setChecks] = useState<HealthCheck[]>(INITIAL_CHECKS)
  const [override, setOverride] = useState(false)

  const ctx = {
    pacAdapter: state.legalEntityPacAdapter,
    legalEntityTaxId: state.legalEntityTaxId,
    orgOwnerEmail: state.orgOwnerEmail,
  }

  const runCheck = async (id: HealthCheck['id']) => {
    setChecks((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: 'running', message: undefined } : c)),
    )
    const result = await runCheckReal(id, ctx)
    setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...result } : c)))
  }

  const runAll = async () => {
    setChecks((prev) => prev.map((c) => ({ ...c, status: 'running', message: undefined })))
    const results = await Promise.all(INITIAL_CHECKS.map((c) => runCheckReal(c.id, ctx)))
    setChecks((prev) => prev.map((c, idx) => ({ ...c, ...results[idx] })))
  }

  const allTested = checks.every((c) => c.status !== 'idle' && c.status !== 'running')
  const allPassed = checks.every((c) => c.status === 'success')
  const hasError = checks.some((c) => c.status === 'error')
  // Warnings = integraciones no configuradas (Channex/PAC/etc.) — overridables.
  // El cliente activa el PMS ahora y conecta esas integraciones en versiones futuras.
  const warnings = checks.filter((c) => c.status === 'warning')
  const hasWarnings = warnings.length > 0
  const canProceed = allTested && !hasError && (allPassed || (hasWarnings && override))

  // expone a la WizardLayout via nextDisabled
  // (validation también pasa por canCompleteStep que dice ok=true, pero acá
  // forzamos UX bloqueante hasta que el consultor corra los checks)

  return (
    <WizardLayout
      title="Integraciones — health checks"
      description="Verificamos en vivo que las 4 integraciones críticas funcionen con las credenciales del cliente. Cualquier error bloquea activación. El PAC sandbox warning permite activar con confirm explícito (típico cuando el cliente aún no contrata PAC)."
      nextDisabled={!canProceed}
      nextLabel={allPassed ? 'Siguiente' : hasWarnings && override ? 'Activar con integraciones pendientes' : 'Re-ejecutar verificaciones'}
    >
      <div className="space-y-4">
        {/* Run all button */}
        <Surface variant="raised" radius="lg" padding="lg">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <Title>Ejecutar batería de checks</Title>
              <Caption tone="tertiary" className="block mt-0.5">
                Latencia esperada total: ~5-8 segundos. Los 4 checks corren en paralelo.
              </Caption>
            </div>
            <Button
              variant="primary"
              size="md"
              iconLeft={checks.some((c) => c.status === 'running') ? Loader2 : RefreshCw}
              onClick={runAll}
              disabled={checks.some((c) => c.status === 'running')}
            >
              {checks.every((c) => c.status === 'idle')
                ? 'Ejecutar los 4 checks'
                : checks.some((c) => c.status === 'running')
                  ? 'Ejecutando…'
                  : 'Re-ejecutar todos'}
            </Button>
          </div>
        </Surface>

        {/* Individual checks */}
        <Surface variant="raised" radius="lg" className="overflow-hidden">
          {checks.map((c, idx) => (
            <CheckRow
              key={c.id}
              check={c}
              divider={idx > 0}
              onRetry={() => runCheck(c.id)}
            />
          ))}
        </Surface>

        {/* Override de integraciones no configuradas (warnings) */}
        {hasWarnings && (
          <Surface variant="raised" radius="lg" padding="lg" tone="warning">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex-shrink-0">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <Subhead className="font-semibold text-slate-900">
                  Activar con integraciones pendientes
                </Subhead>
                <Caption tone="secondary" className="block mt-1 leading-relaxed">
                  Estas integraciones no están configuradas y quedarán{' '}
                  <strong>inactivas</strong>:{' '}
                  <strong>{warnings.map((w) => w.label).join(' · ')}</strong>. El cliente puede
                  operar el PMS desde ya (calendario, recepción, check-in, housekeeping,
                  reportes). Cada integración se conecta después sin re-activar: el Channel
                  Manager (OTAs) en una versión próxima y la facturación electrónica (CFDI)
                  cuando el cliente contrate su proveedor.{' '}
                  <span className="font-semibold">Recomendación:</span> conectar facturación
                  dentro de los primeros 30 días para no acumular folios pendientes.
                </Caption>

                <label className="mt-3 flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={override}
                    onChange={(e) => setOverride(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500/30"
                  />
                  <Caption tone="secondary" className="text-[12px] text-slate-900">
                    Acepto activar a {state.organizationName || 'el cliente'} con esas
                    integraciones pendientes. El cliente entiende que esas funciones quedan
                    inactivas hasta configurarlas en su workspace.
                  </Caption>
                </label>
              </div>
            </div>
          </Surface>
        )}

        {/* Status summary */}
        {allTested && (
          <Surface
            variant="raised"
            radius="lg"
            padding="lg"
            tone={hasError ? 'danger' : allPassed ? 'success' : 'warning'}
          >
            <div className="flex items-start gap-3">
              <div
                className={
                  'flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 ' +
                  (hasError
                    ? 'bg-red-100 text-red-700'
                    : allPassed
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700')
                }
              >
                {hasError ? (
                  <XCircle className="h-4 w-4" />
                ) : allPassed ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <Subhead className="font-semibold text-slate-900">
                  {hasError
                    ? 'Hay checks que fallaron'
                    : allPassed
                      ? 'Todos los checks pasaron — listo para activar'
                      : 'Checks completados con warnings'}
                </Subhead>
                <Caption tone="secondary" className="block mt-1">
                  {hasError
                    ? 'Resuelve los errores antes de continuar. Reintenta el check específico una vez corregido.'
                    : allPassed
                      ? 'Las 4 integraciones están operativas. En el siguiente paso generaremos el resumen de activación y enviaremos al cliente sus credenciales de acceso.'
                      : 'Acepta la advertencia de facturación para continuar, o revisa las credenciales con el cliente y reintenta.'}
                </Caption>
              </div>
            </div>
          </Surface>
        )}

        {/* Hint en lenguaje de negocio */}
        <Surface variant="sunken" radius="md" padding="md">
          <Body tone="secondary" className="text-[12px]">
            <span className="font-semibold text-slate-900">¿Qué hace cada verificación?</span>{' '}
            Probamos que las credenciales del cliente funcionan <strong>sin</strong> generar
            cargos, reservas reales ni emisiones de factura. Si algo falla, te diremos
            exactamente qué revisar con el cliente antes de seguir.
          </Body>
        </Surface>
      </div>
    </WizardLayout>
  )
}

// ─── Single check row ────────────────────────────────────────────────

function CheckRow({
  check,
  divider,
  onRetry,
}: {
  check: HealthCheck
  divider: boolean
  onRetry: () => void
}) {
  const Icon = check.icon

  const statusColor =
    check.status === 'success'
      ? 'bg-emerald-100 text-emerald-700'
      : check.status === 'error'
        ? 'bg-red-100 text-red-700'
        : check.status === 'warning'
          ? 'bg-amber-100 text-amber-700'
          : check.status === 'running'
            ? 'bg-sky-100 text-sky-700'
            : 'bg-slate-100 text-slate-500'

  const StatusIcon =
    check.status === 'success'
      ? CheckCircle2
      : check.status === 'error'
        ? XCircle
        : check.status === 'warning'
          ? AlertTriangle
          : check.status === 'running'
            ? Loader2
            : null

  return (
    <div
      className={
        'flex items-start gap-3 p-4 ' + (divider ? 'border-t border-slate-100' : '')
      }
    >
      <div className={'flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 ' + statusColor}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Subhead className="font-semibold text-slate-900">{check.label}</Subhead>
          {check.status === 'idle' && (
            <Chip variant="neutral" intent="subtle" size="sm">
              Sin ejecutar
            </Chip>
          )}
          {check.status === 'running' && (
            <Chip variant="info" intent="subtle" size="sm" pulse>
              Ejecutando…
            </Chip>
          )}
          {check.status === 'success' && (
            <Chip variant="success" intent="subtle" size="sm" icon={CheckCircle2}>
              OK · {check.latencyMs}ms
            </Chip>
          )}
          {check.status === 'warning' && (
            <Chip variant="warning" intent="subtle" size="sm" icon={AlertTriangle}>
              Warning · {check.latencyMs}ms
            </Chip>
          )}
          {check.status === 'error' && (
            <Chip variant="danger" intent="subtle" size="sm" icon={XCircle}>
              Error · {check.latencyMs}ms
            </Chip>
          )}
        </div>
        <Caption tone="secondary" className="block mt-0.5 leading-tight">
          {check.description}
        </Caption>
        {check.message && check.status !== 'running' && (
          <Caption
            tone="secondary"
            className={
              'block mt-2 text-[12px] p-2 rounded-md border ' +
              (check.status === 'success'
                ? 'bg-emerald-50/50 border-emerald-100 text-emerald-900'
                : check.status === 'error'
                  ? 'bg-red-50/50 border-red-100 text-red-900'
                  : 'bg-amber-50/50 border-amber-100 text-amber-900')
            }
          >
            {check.message}
          </Caption>
        )}
      </div>
      {check.status !== 'idle' && check.status !== 'running' && (
        <Button
          variant="ghost"
          size="sm"
          iconLeft={RefreshCw}
          onClick={onRetry}
          aria-label={`Reintentar ${check.label}`}
        >
          Re-test
        </Button>
      )}
      {check.status === 'running' && StatusIcon && (
        <div className="pt-1.5">
          <StatusIcon className="h-4 w-4 text-sky-600 animate-spin" />
        </div>
      )}
    </div>
  )
}
