/**
 * NovaSettingsPage — landing del consultor para configuración del cliente
 * activo (acting org). Muestra acceso a sub-secciones existentes + roadmap
 * de las pendientes.
 *
 * Esta vista NO es WIP — es el hub real donde el consultor configura el
 * workspace del cliente. Las sub-secciones individuales (legal entities,
 * billing, notifications) sí están pendientes de wiring pero el landing
 * funciona y dirige a los flujos disponibles.
 */
import { Link } from 'react-router-dom'
import {
  Building2,
  Receipt,
  Cable,
  Mail,
  ShieldCheck,
  ScrollText,
  Users,
  CreditCard,
  Bell,
  Wrench,
  ChevronRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NovaShell } from '../NovaShell'
import { useNovaStore } from '../../store/nova'
import {
  Section,
  Surface,
  Title,
  Subhead,
  Body,
  Caption,
  Chip,
  EmptyState,
} from '../design-system'

interface SettingsEntry {
  icon: LucideIcon
  label: string
  description: string
  to?: string
  external?: string
  /** Si está disponible HOY (no badge). */
  available: boolean
  /** Texto del badge si no available — e.g. "Próximamente", "Sprint REPORTS-CORE". */
  badge?: string
}

const SETTINGS_CATEGORIES: Array<{
  title: string
  subtitle: string
  entries: SettingsEntry[]
}> = [
  {
    title: 'Cliente',
    subtitle: 'Identidad y datos del workspace activo',
    entries: [
      {
        icon: Building2,
        label: 'Organización',
        description: 'Nombre, slug, país, timezone. Edición restringida — cambios significativos requieren ticket de soporte.',
        available: false,
        badge: 'Próximamente',
      },
      {
        icon: Receipt,
        label: 'Legal Entities',
        description: 'Razones sociales fiscales, PAC, currency base. Multi-país soportado.',
        available: false,
        badge: 'Próximamente',
      },
      {
        icon: Users,
        label: 'Staff y permisos',
        description: 'Invitar SUPERVISOR / RECEPTIONIST / HOUSEKEEPER. Asignación per-property.',
        available: false,
        badge: 'Próximamente',
      },
    ],
  },
  {
    title: 'Integraciones',
    subtitle: 'Sistemas externos conectados al PMS',
    entries: [
      {
        icon: Cable,
        label: 'Channex Command Center',
        description: 'Room types, rate plans, calendar matrix, restrictions, channels, mappings, parity alerts.',
        to: '/nova/channex',
        available: true,
      },
      {
        icon: CreditCard,
        label: 'Stripe / Conekta',
        description: 'Cobros con tarjeta, refunds, payouts. Cuenta Stripe Connect + Conekta MX.',
        available: false,
        badge: 'Sprint PAY-CORE',
      },
      {
        icon: Mail,
        label: 'Email transactional',
        description: 'Resend wiring, dominio verificado, plantillas de welcome / setup / receipts.',
        available: false,
        badge: 'Próximamente',
      },
    ],
  },
  {
    title: 'Auditoría y seguridad',
    subtitle: 'Trazabilidad + compliance',
    entries: [
      {
        icon: ScrollText,
        label: 'Audit log',
        description: 'Toda acción del consultor + impersonation. Append-only, compliance Visa CRR / CFDI 30 CFF.',
        to: '/nova/audit',
        available: true,
      },
      {
        icon: ShieldCheck,
        label: 'Roles y RBAC',
        description: 'Hierarchy 5-tier PLATFORM / PARTNER_ADMIN / PARTNER_MEMBER / ORG_OWNER / ORG_STAFF.',
        available: false,
        badge: 'Próximamente',
      },
      {
        icon: Bell,
        label: 'Notificaciones',
        description: 'Reglas push + email per tipo de evento. Daily digest opt-in.',
        available: false,
        badge: 'Sprint MARKET-INTEL-PRO',
      },
    ],
  },
  {
    title: 'Operación',
    subtitle: 'Configuración operativa del piloto',
    entries: [
      {
        icon: Wrench,
        label: 'Activación de un cliente nuevo',
        description: 'Wizard Zenix Activate — onboarding consultor-led 30 min a 2 semanas según complejidad.',
        to: '/nova/wizard',
        available: true,
      },
    ],
  },
]

export function NovaSettingsPage() {
  const actingOrgId = useNovaStore((s) => s.actingOrgId)
  const actingOrgName = useNovaStore((s) => s.actingOrgName)

  return (
    <NovaShell title="Settings">
      {!actingOrgId ? (
        <Surface variant="raised" radius="lg" padding="lg">
          <EmptyState
            icon={Building2}
            title="Sin cliente seleccionado"
            description="Settings opera sobre el cliente activo. Selecciona uno desde /nova/clientes para comenzar."
            action={
              <Link
                to="/nova/clientes"
                className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium transition-colors"
              >
                Elegir cliente
              </Link>
            }
          />
        </Surface>
      ) : (
        <div className="space-y-7">
          <Surface variant="raised" radius="lg" padding="lg" tone="accent">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-violet-100 text-violet-700 flex-shrink-0">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <Subhead className="font-semibold text-slate-900">
                  Configurando: {actingOrgName ?? 'Cliente seleccionado'}
                </Subhead>
                <Caption tone="tertiary" className="block mt-0.5 leading-relaxed">
                  Todos los cambios afectan únicamente este cliente. Para configuración global de
                  ZaharDev / Partners, abre el menú de PLATFORM_ADMIN.
                </Caption>
              </div>
            </div>
          </Surface>

          {SETTINGS_CATEGORIES.map((cat) => (
            <Section key={cat.title} title={cat.title} subtitle={cat.subtitle}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {cat.entries.map((entry) => (
                  <SettingsCard key={entry.label} entry={entry} />
                ))}
              </div>
            </Section>
          ))}
        </div>
      )}
    </NovaShell>
  )
}

function SettingsCard({ entry }: { entry: SettingsEntry }) {
  const Icon = entry.icon
  const Inner = (
    <div
      className={
        'flex items-start gap-3 p-4 rounded-xl border transition-all ' +
        (entry.available
          ? 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/30 hover:shadow-[0_4px_12px_-4px_rgba(139,92,246,0.15)] cursor-pointer'
          : 'border-slate-200/70 bg-slate-50/50 cursor-not-allowed')
      }
    >
      <div
        className={
          'flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 ' +
          (entry.available ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-500')
        }
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Title className={entry.available ? 'text-slate-900' : 'text-slate-600'}>
            {entry.label}
          </Title>
          {!entry.available && entry.badge && (
            <Chip variant="neutral" intent="subtle" size="sm">
              {entry.badge}
            </Chip>
          )}
        </div>
        <Body
          tone="secondary"
          className={'block mt-1 text-[12px] leading-relaxed ' + (entry.available ? '' : 'text-slate-500')}
        >
          {entry.description}
        </Body>
      </div>
      {entry.available && (
        <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0 mt-2" />
      )}
    </div>
  )

  if (entry.available && entry.to) {
    return (
      <Link to={entry.to} className="block">
        {Inner}
      </Link>
    )
  }
  return Inner
}
