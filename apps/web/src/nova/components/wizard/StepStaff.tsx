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
            <Title>Administrador del cliente</Title>
            <Caption tone="tertiary" className="block mt-0.5">
              Esta persona será la dueña de la cuenta con acceso total al PMS — podrá invitar
              recepcionistas, supervisores, recamaristas y configurar todo dentro del workspace
              del cliente.
            </Caption>
          </div>

          <Field
            label="Nombre completo"
            icon={User}
            hint="Aparecerá en el correo de bienvenida y en el historial de auditoría."
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
                  Le llegará un correo de bienvenida
                </Body>
                <Caption tone="secondary" className="block leading-tight mt-0.5">
                  Con un enlace seguro para entrar a Zenix. Hasta que abra el correo, su cuenta
                  no estará activa — nadie del lado del cliente puede iniciar sesión todavía.
                </Caption>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-emerald-100 text-emerald-700 flex-shrink-0">
                <KeyRound className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <Body className="text-[13px] text-slate-900 font-medium">
                  Crea su propia contraseña
                </Body>
                <Caption tone="secondary" className="block leading-tight mt-0.5">
                  Al hacer click en el enlace, el administrador elige una contraseña que solo
                  él conoce. Zenix nunca la ve — guardamos únicamente un hash encriptado.
                </Caption>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-violet-100 text-violet-700 flex-shrink-0">
                <ShieldCheck className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <Body className="text-[13px] text-slate-900 font-medium">
                  Verificación en dos pasos (próximamente)
                </Body>
                <Caption tone="secondary" className="block leading-tight mt-0.5">
                  En esta versión la 2FA es opcional — el administrador puede activarla desde
                  sus preferencias. Será obligatoria en la siguiente versión de seguridad.
                </Caption>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-amber-100 text-amber-700 flex-shrink-0">
                <Clock className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <Body className="text-[13px] text-slate-900 font-medium">
                  El enlace dura 72 horas
                </Body>
                <Caption tone="secondary" className="block leading-tight mt-0.5">
                  Si el cliente no lo usa a tiempo, puedes reenviárselo desde la lista de
                  clientes. El enlace viejo se invalida automáticamente — solo el más reciente
                  funciona.
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
              <span className="font-semibold text-slate-900">¿Y el resto del equipo?</span> Una
              vez que el administrador active su cuenta, podrá invitar a supervisores,
              recepcionistas y recamaristas desde la sección de equipo de su workspace. Cada
              invitación se manda por correo con un click. No lo hacemos desde el wizard
              porque el cliente conoce mejor su roster que tú.
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
