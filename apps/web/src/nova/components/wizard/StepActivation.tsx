/**
 * Step 8 — Activación (§80, §174 D-NOVA-16).
 *
 * Summary review de toda la captura del wizard + botón "Activar cliente".
 * Pattern SAP Activate "Realize Phase Report" — el consultor REVISA antes
 * de presionar el commit final.
 *
 * Al confirmar:
 *   1. POST /v1/nova/wizard/activate (transactional create — Day 16 backend)
 *   2. Server crea Organization + Brand + LegalEntity + Properties + RoomTypes
 *      + RatePlans (del template) + ORG_OWNER + setupLink 72h en una sola tx.
 *   3. Email automático al ORG_OWNER con setup link.
 *   4. Activation Report PDF (Puppeteer) attached al email.
 *   5. Redirect a /nova/clientes con toast "✓ Cliente activado".
 *
 * Day 15: solo UI summary + stub call. Day 16 wirea endpoint backend real.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWizardStore, WIZARD_STEPS, canCompleteStep } from '../../../store/wizard'
import { useNovaStore } from '../../../store/nova'
import { wizardClient, type WizardActivateResponse } from '../../api/wizard-client'
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
import { findCityById } from '../../data/latam-cities'
import toast from 'react-hot-toast'
import {
  Rocket,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Mail,
  Building2,
  Receipt,
  Briefcase,
  Users,
  Sparkles,
  Loader2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export function StepActivation() {
  const navigate = useNavigate()
  const state = useWizardStore()
  const wizardReset = useWizardStore((s) => s.reset)
  const clearActingOrg = useNovaStore((s) => s.clearActingOrg)
  const [activating, setActivating] = useState(false)
  const [activated, setActivated] = useState(false)
  const [activationError, setActivationError] = useState<string | null>(null)
  const [response, setResponse] = useState<WizardActivateResponse | null>(null)

  // Pre-flight: validar que cada step previo pase su validation
  const preflightIssues = WIZARD_STEPS.slice(0, -1)
    .map((step) => {
      const check = canCompleteStep(step.key, state)
      return check.ok ? null : { step: step.label, reason: check.reason ?? 'Incompleto' }
    })
    .filter((x): x is { step: string; reason: string } => x !== null)

  const canActivate = preflightIssues.length === 0 && !activating

  const handleActivate = async () => {
    setActivating(true)
    setActivationError(null)
    try {
      // pacOverrideAccepted: si el consultor llegó hasta acá y validation pasó,
      // asumimos que aceptó el override en Step 7 (en producción, Step 7 escribiría
      // el flag en el wizard store; Day 17 expone esa pieza explícita).
      const res = await wizardClient.activate(state, /* pacOverrideAccepted */ true)
      setResponse(res)
      setActivated(true)
      toast.success(`${state.organizationName} activado · setup link generado`, {
        duration: 6000,
      })

      // Dar tiempo al usuario a ver el success state + copiar setup link
      setTimeout(() => {
        wizardReset()
        clearActingOrg()
        navigate('/nova/clientes', { replace: true })
      }, 8000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido en la activación'
      setActivationError(msg)
      toast.error(`Activación falló: ${msg.slice(0, 120)}`, { duration: 8000 })
    } finally {
      setActivating(false)
    }
  }

  // Construye el city display para preview de cada property
  const propertyCityDisplay = (p: (typeof state.properties)[number]) => {
    if (p.cityDisplay) return p.cityDisplay
    if (p.cityId) {
      const row = findCityById(p.cityId)
      return row ? `${row.name}, ${row.region}` : p.cityId
    }
    return p.cityFreeText || '—'
  }

  return (
    <WizardLayout
      title="Revisión final + Activación"
      description={
        activated
          ? '✓ Cliente activado. Redirigiendo a Nova / Clientes…'
          : 'Última verificación antes de presionar el botón mágico. Una vez activado, el cliente recibe credenciales y queda listo para operar.'
      }
      primaryAction={
        <Button
          variant="primary"
          size="md"
          iconLeft={activating ? Loader2 : activated ? CheckCircle2 : Rocket}
          onClick={handleActivate}
          disabled={!canActivate || activated}
        >
          {activated
            ? 'Cliente activado ✓'
            : activating
              ? 'Activando…'
              : `Activar ${state.organizationName || 'cliente'}`}
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Pre-flight issues */}
        {preflightIssues.length > 0 && (
          <Surface variant="raised" radius="lg" padding="lg" tone="danger">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-red-100 text-red-700 flex-shrink-0">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <Subhead className="font-semibold text-slate-900">
                  Hay {preflightIssues.length} paso{preflightIssues.length === 1 ? '' : 's'}{' '}
                  incompleto{preflightIssues.length === 1 ? '' : 's'}
                </Subhead>
                <ul className="mt-2 space-y-1">
                  {preflightIssues.map((issue) => (
                    <li key={issue.step}>
                      <Caption tone="secondary" className="text-[12px] text-red-900">
                        <span className="font-semibold">{issue.step}:</span> {issue.reason}
                      </Caption>
                    </li>
                  ))}
                </ul>
                <Caption tone="secondary" className="block mt-2 text-[12px]">
                  Regresa al paso correspondiente desde el sidebar izquierdo y complétalo
                  antes de activar.
                </Caption>
              </div>
            </div>
          </Surface>
        )}

        {/* Summary cards */}
        <SummarySection icon={Building2} title="Cliente">
          <KV k="Razón comercial" v={state.organizationName} />
          <KV k="Slug" v={state.organizationSlug} mono />
          <KV k="País" v={state.organizationCountryCode} />
          <KV k="Timezone" v={state.organizationTimezone} mono />
        </SummarySection>

        {state.brandEnabled && (
          <SummarySection icon={Sparkles} title="Brand">
            <KV k="Nombre" v={state.brandName} />
            {state.brandLogoUrl && <KV k="Logo URL" v={state.brandLogoUrl} mono truncate />}
          </SummarySection>
        )}

        <SummarySection icon={Receipt} title="Legal Entity (fiscal)">
          <KV k="Razón social" v={state.legalEntityName} />
          <KV k="Tax ID" v={state.legalEntityTaxId} mono />
          {state.organizationCountryCode === 'MX' && (
            <KV k="Régimen" v={state.legalEntityRegime} mono />
          )}
          <KV k="Currency base" v={state.legalEntityBaseCurrency} mono />
          <KV k="PAC adapter" v={state.legalEntityPacAdapter} mono />
        </SummarySection>

        <SummarySection
          icon={Briefcase}
          title={`Properties (${state.properties.length})`}
        >
          {state.properties.length === 0 ? (
            <Caption tone="tertiary" className="text-[12px]">
              Sin properties. Vuelve a Step 4.
            </Caption>
          ) : (
            <ul className="space-y-2 mt-2">
              {state.properties.map((p) => (
                <li
                  key={p.tempId}
                  className="p-2.5 rounded-md bg-white border border-slate-100"
                >
                  <div className="flex items-start gap-2 flex-wrap">
                    <Body className="text-[13px] font-semibold text-slate-900">{p.name}</Body>
                    <Chip variant="neutral" intent="subtle" size="sm">
                      {p.type}
                    </Chip>
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <Caption tone="tertiary" className="text-[11px]">
                      📍 {propertyCityDisplay(p)}
                    </Caption>
                    <Caption tone="tertiary" className="text-[11px] font-mono">
                      🕒 {p.timezone}
                    </Caption>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SummarySection>

        <SummarySection icon={Sparkles} title="Inventory template">
          <KV k="Template" v={state.inventoryTemplate} mono />
          <Caption tone="tertiary" className="block mt-1 text-[11px]">
            RoomTypes + RatePlans del template se cargarán como semilla. Customización en
            Settings / Inventory post-activación.
          </Caption>
        </SummarySection>

        <SummarySection icon={Users} title="Org Owner">
          <KV k="Nombre" v={state.orgOwnerName} />
          <KV k="Email" v={state.orgOwnerEmail} mono />
        </SummarySection>

        {/* What happens next */}
        {!activated && canActivate && (
          <Surface variant="raised" radius="lg" padding="lg" tone="info">
            <Subhead className="block mb-3 font-semibold text-slate-900">
              Al presionar "Activar":
            </Subhead>
            <ol className="space-y-2 list-decimal pl-5 marker:text-violet-600 marker:font-semibold">
              <li>
                <Body className="text-[13px] text-slate-800">
                  Se crea <code className="font-mono text-[11px] bg-white px-1 rounded">Organization</code>{' '}
                  + LegalEntity + Properties + RoomTypes/RatePlans del template + Org Owner en{' '}
                  <span className="font-semibold">una sola transacción Postgres</span> (todo-o-nada).
                </Body>
              </li>
              <li>
                <Body className="text-[13px] text-slate-800">
                  Se genera <strong>Activation Report PDF</strong> con toda la configuración
                  (consultoría handoff document, pattern SAP Activate).
                </Body>
              </li>
              <li>
                <Body className="text-[13px] text-slate-800">
                  Se envía email a <code className="font-mono text-[11px] bg-white px-1 rounded">{state.orgOwnerEmail}</code>{' '}
                  con setup link <strong>single-use, 72h de vigencia</strong> + el PDF adjunto.
                </Body>
              </li>
              <li>
                <Body className="text-[13px] text-slate-800">
                  AuditLog universal registra{' '}
                  <code className="font-mono text-[11px] bg-white px-1 rounded">
                    ORGANIZATION_ACTIVATED
                  </code>{' '}
                  con tu identidad como consultor + organizationId target (append-only, §165).
                </Body>
              </li>
              <li>
                <Body className="text-[13px] text-slate-800">
                  Regresas a <code className="font-mono text-[11px] bg-white px-1 rounded">/nova/clientes</code>{' '}
                  — el cliente aparece con status{' '}
                  <Chip variant="warning" intent="subtle" size="sm">
                    PENDING_OWNER_ACTIVATION
                  </Chip>{' '}
                  hasta que el Org Owner haga click en el setup link.
                </Body>
              </li>
            </ol>
          </Surface>
        )}

        {/* Activation error */}
        {activationError && !activated && (
          <Surface variant="raised" radius="lg" padding="lg" tone="danger">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-red-100 text-red-700 flex-shrink-0">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <Subhead className="font-semibold text-slate-900">Activación falló</Subhead>
                <Body tone="secondary" className="block mt-1 text-[13px] text-red-900">
                  {activationError}
                </Body>
                <Caption tone="secondary" className="block mt-2 text-[12px]">
                  Si el slug o email ya existían, ajusta el dato en el step correspondiente y
                  reintenta. Si fue un error de red, presiona "Activar" otra vez — la operación
                  es transaccional (todo-o-nada), no quedó nada parcial en la BD.
                </Caption>
              </div>
            </div>
          </Surface>
        )}

        {/* Activation success state */}
        {activated && response && (
          <Surface variant="raised" radius="lg" padding="lg" tone="success">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-700 text-white flex-shrink-0 shadow-[0_4px_12px_-4px_rgba(16,185,129,0.5)]">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <Title className="text-emerald-900">¡Cliente activado!</Title>
                <Body tone="secondary" className="block mt-1 text-[13px]">
                  {state.organizationName} ya existe en Zenix · {response.propertyIds.length}{' '}
                  {response.propertyIds.length === 1 ? 'property creada' : 'properties creadas'} ·{' '}
                  organizationId{' '}
                  <code className="font-mono text-[11px] bg-white px-1.5 py-0.5 rounded">
                    {response.organizationId.slice(0, 8)}…
                  </code>
                </Body>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {response.auditLogged && (
                    <Chip variant="success" intent="subtle" size="sm" icon={FileText}>
                      AuditLog ORGANIZATION_ACTIVATED
                    </Chip>
                  )}
                  {response.emailSent ? (
                    <Chip variant="success" intent="subtle" size="sm" icon={Mail}>
                      Email enviado a {state.orgOwnerEmail}
                    </Chip>
                  ) : (
                    <Chip variant="warning" intent="subtle" size="sm" icon={AlertTriangle}>
                      Email no enviado — usa el link manual
                    </Chip>
                  )}
                </div>

                {/* Setup link — siempre visible como fallback (incluso si email se envió),
                    así el consultor puede copiarlo y mandarlo por WhatsApp/Slack si el
                    cliente reporta que no le llegó al correo. */}
                <div className="mt-4 p-3 rounded-md bg-white border border-emerald-200">
                  <Caption tone="tertiary" className="block uppercase tracking-wider font-semibold text-[10px] mb-1.5">
                    Setup link · {response.emailSent ? 'Backup manual' : 'COPIA Y ENVÍA AL CLIENTE'} · expira en 72h
                  </Caption>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={response.ownerSetupLink}
                      className="flex-1 px-2.5 h-8 rounded border border-slate-200 text-[12px] font-mono bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(response.ownerSetupLink)
                        toast.success('Setup link copiado al portapapeles', { duration: 2500 })
                      }}
                      className="px-3 h-8 rounded bg-emerald-600 text-white text-[12px] font-medium hover:bg-emerald-700 transition-colors"
                    >
                      Copiar
                    </button>
                  </div>
                  <Caption tone="tertiary" className="block mt-2 text-[11px]">
                    {response.emailSent
                      ? 'El cliente ya recibió este link por email. Disponible aquí como respaldo si reporta que no le llegó (WhatsApp/Slack).'
                      : 'Resend no está configurado o falló — el link NO se envió por email. Copia y mándalo manualmente al cliente.'}
                  </Caption>
                </div>
              </div>
            </div>
          </Surface>
        )}
      </div>
    </WizardLayout>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────

function SummarySection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children: React.ReactNode
}) {
  return (
    <Surface variant="raised" radius="lg" padding="lg">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-violet-100 text-violet-700">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <Subhead className="font-semibold text-slate-900">{title}</Subhead>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">{children}</dl>
    </Surface>
  )
}

function KV({
  k,
  v,
  mono = false,
  truncate = false,
}: {
  k: string
  v: string
  mono?: boolean
  truncate?: boolean
}) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <dt className="text-[12px] text-slate-500 font-medium flex-shrink-0">{k}</dt>
      <dd
        className={
          'text-[13px] text-slate-900 min-w-0 ' +
          (mono ? 'font-mono text-[12px] ' : '') +
          (truncate ? 'truncate' : 'break-words')
        }
      >
        {v || <span className="text-slate-300">—</span>}
      </dd>
    </div>
  )
}
