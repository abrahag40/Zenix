/**
 * Step 6 — Staff inicial (Org Owner) (§174 D-NOVA-16).
 *
 * Captura el Org Owner que recibirá credenciales SOLO al finalizar Step 8.
 * El consultor NO crea staff adicional aquí — eso se hace post-activación
 * por el propio Org Owner desde Nova / Settings / Staff.
 *
 * Forcing function: este es el único usuario que se crea durante el wizard.
 * Mantenemos el wizard rápido — staff adicional es trabajo post-launch.
 */
import { useWizardStore } from '../../../store/wizard'
import { WizardLayout } from './WizardLayout'
import { Surface, Body, Subhead, Caption, Chip, Title } from '../../design-system'
import { Mail, User, ShieldCheck, KeyRound, Clock } from 'lucide-react'

// Email validation — RFC 5322 simplified (covers 99% real-world cases)
const EMAIL_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i

export function StepStaff() {
  const state = useWizardStore()
  const emailValid = EMAIL_REGEX.test(state.orgOwnerEmail.trim())
  const nameValid = state.orgOwnerName.trim().length >= 2

  return (
    <WizardLayout
      title="Org Owner del cliente"
      description="Capturas la persona dueña de la cuenta del cliente. Recibirá credenciales únicas al finalizar el wizard (Step 8). Personal adicional se invita después desde Nova / Settings / Staff."
    >
      <div className="space-y-4">
        <Surface variant="raised" radius="lg" padding="lg" className="space-y-5">
          <div>
            <Title>Datos del Org Owner</Title>
            <Caption tone="tertiary" className="block mt-0.5">
              Tendrá rol{' '}
              <code className="font-mono text-[11px] bg-slate-100 px-1 rounded">
                ORG_OWNER
              </code>{' '}
              en la jerarquía 5-tier (§160 D-NOVA-2). Acceso completo al workspace del cliente
              dentro de <code className="font-mono text-[11px] bg-slate-100 px-1 rounded">app.zenix.com</code>.
            </Caption>
          </div>

          <Field
            label="Nombre completo"
            icon={User}
            hint="Tal como aparecerá en el welcome email y audit logs."
          >
            <input
              type="text"
              value={state.orgOwnerName}
              onChange={(e) => state.setField('orgOwnerName', e.target.value)}
              placeholder='Ej: "María Fernández"'
              autoFocus
              className={
                'w-full px-3.5 h-10 rounded-lg border text-[14px] focus:outline-none focus:ring-2 transition-colors ' +
                (state.orgOwnerName.length === 0
                  ? 'border-slate-300 focus:ring-violet-500/30'
                  : nameValid
                    ? 'border-emerald-300 focus:ring-emerald-500/30'
                    : 'border-amber-300 focus:ring-amber-500/30')
              }
            />
          </Field>

          <Field
            label="Email corporativo"
            icon={Mail}
            hint="Llegará el setup link único de 72h. Verifica que el email exista y sea accesible HOY."
          >
            <input
              type="email"
              value={state.orgOwnerEmail}
              onChange={(e) => state.setField('orgOwnerEmail', e.target.value.toLowerCase().trim())}
              placeholder="maria@hotelboutique.com"
              autoComplete="email"
              className={
                'w-full px-3.5 h-10 rounded-lg border text-[14px] focus:outline-none focus:ring-2 transition-colors ' +
                (state.orgOwnerEmail.length === 0
                  ? 'border-slate-300 focus:ring-violet-500/30'
                  : emailValid
                    ? 'border-emerald-300 focus:ring-emerald-500/30'
                    : 'border-amber-300 focus:ring-amber-500/30')
              }
            />
            {state.orgOwnerEmail.length > 4 && !emailValid && (
              <Caption tone="tertiary" className="block mt-1 text-amber-700">
                Email inválido — verifica el formato (ej: nombre@dominio.com).
              </Caption>
            )}
          </Field>
        </Surface>

        {/* Qué sucede cuando activamos */}
        <Surface variant="raised" radius="lg" padding="lg" tone="info">
          <Subhead className="block mb-3 font-semibold text-slate-900">
            ¿Qué pasa al finalizar el wizard (Step 8)?
          </Subhead>
          <ul className="space-y-2.5">
            <li className="flex items-start gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-sky-100 text-sky-700 flex-shrink-0">
                <Mail className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <Body className="text-[13px] text-slate-900 font-medium">
                  Email automático al Org Owner
                </Body>
                <Caption tone="secondary" className="block leading-tight mt-0.5">
                  Setup link único single-use, expira en 72 horas. El cliente NO puede acceder
                  antes de eso — el workspace queda en <code className="font-mono text-[11px] bg-white px-1 rounded">status=ONBOARDING</code>{' '}
                  hasta que active el link.
                </Caption>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-emerald-100 text-emerald-700 flex-shrink-0">
                <KeyRound className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <Body className="text-[13px] text-slate-900 font-medium">
                  Password reset forzado al primer login
                </Body>
                <Caption tone="secondary" className="block leading-tight mt-0.5">
                  El setup link contiene un token temporal. Al hacer click, el Org Owner define su
                  propia contraseña — Zenix NUNCA conoce el password final del cliente.
                </Caption>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-violet-100 text-violet-700 flex-shrink-0">
                <ShieldCheck className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <Body className="text-[13px] text-slate-900 font-medium">
                  2FA mandatory en el primer login (post v1.0.x)
                </Body>
                <Caption tone="secondary" className="block leading-tight mt-0.5">
                  Pattern Cognito / Okta. Roadmap v1.0.4 SEC-β — durante v1.0.0 piloto 2FA es
                  recomendado pero no enforced. El Org Owner puede activarlo manualmente.
                </Caption>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-amber-100 text-amber-700 flex-shrink-0">
                <Clock className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <Body className="text-[13px] text-slate-900 font-medium">
                  Link expira en 72 horas
                </Body>
                <Caption tone="secondary" className="block leading-tight mt-0.5">
                  Si el cliente no activa en 72h, el consultor puede re-emitir desde{' '}
                  <code className="font-mono text-[11px] bg-white px-1 rounded">
                    Nova / Clientes / {state.organizationName || 'el cliente'} / Reenviar setup link
                  </code>
                  . El link viejo se invalida automáticamente.
                </Caption>
              </div>
            </li>
          </ul>
        </Surface>

        {/* Staff adicional */}
        <Surface variant="sunken" radius="md" padding="md">
          <div className="flex items-start gap-2">
            <Chip variant="neutral" intent="subtle" size="sm">
              Post-activación
            </Chip>
            <Body tone="secondary" className="text-[12px] flex-1">
              <span className="font-semibold text-slate-900">¿Y el resto del staff?</span> Una vez
              que el Org Owner active su cuenta, podrá invitar SUPERVISOR / RECEPTIONIST /
              HOUSEKEEPER desde Nova / Settings / Staff. Cada invite es 1-click + email. No es
              parte del wizard porque el cliente conoce mejor su roster que el consultor.
            </Body>
          </div>
        </Surface>
      </div>
    </WizardLayout>
  )
}

function Field({
  label,
  icon: Icon,
  hint,
  children,
}: {
  label: string
  icon?: typeof Mail
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <Subhead tone="secondary" className="flex items-center gap-1.5 mb-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-slate-500" />}
        {label}
      </Subhead>
      {children}
      {hint && (
        <Caption tone="tertiary" className="block mt-1">
          {hint}
        </Caption>
      )}
    </label>
  )
}
