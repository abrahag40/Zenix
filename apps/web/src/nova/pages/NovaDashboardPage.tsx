/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 9 placeholder.
 *
 * `/nova/dashboard` — entrada principal una vez seleccionado el cliente.
 *
 * Por ahora Day 9 muestra:
 *   - Banner de bienvenida con cliente activo
 *   - Quick links a las áreas (Channex / Wizard / Audit)
 *   - CTA "Vista cliente PMS" para abrir app.zenix.com con impersonation
 *
 * Days 11-12 llenan widgets reales (CEO Dashboard 4-layers — research ya
 * en docs/research/dashboard-user-research.md).
 */
import { Link } from 'react-router-dom'
import { Building2, Cable, Sparkles, ScrollText, ArrowRight, ExternalLink } from 'lucide-react'
import { NovaShell } from '../NovaShell'
import { useNovaStore } from '../../store/nova'

export function NovaDashboardPage() {
  const actingOrgName = useNovaStore((s) => s.actingOrgName)
  const actingOrgId = useNovaStore((s) => s.actingOrgId)

  // Si no hay org seleccionada, redirect via TenantSwitcher link
  if (!actingOrgId) {
    return (
      <NovaShell title="Dashboard">
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-md mx-auto">
          <Building2 className="h-10 w-10 text-slate-300 mx-auto" />
          <h2 className="mt-3 text-[16px] font-semibold text-slate-900">
            Sin cliente seleccionado
          </h2>
          <p className="mt-1 text-[13px] text-slate-600">
            Para empezar a operar, elige primero un cliente.
          </p>
          <Link
            to="/nova/clientes"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 transition-colors"
          >
            <Building2 className="h-4 w-4" />
            Elegir cliente
          </Link>
        </div>
      </NovaShell>
    )
  }

  return (
    <NovaShell title="Dashboard">
      <div className="space-y-6">
        {/* Welcome banner */}
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200 rounded-xl p-5">
          <div className="text-[12px] uppercase tracking-wider text-emerald-700 font-semibold">
            Cliente activo
          </div>
          <h2 className="mt-1 text-[20px] font-semibold text-slate-900">{actingOrgName}</h2>
          <p className="mt-2 text-[13px] text-slate-700 max-w-2xl">
            Estás operando en el workspace de este cliente. Todas las acciones quedan
            en el audit log con tu identidad real, no la del cliente — para escribir en
            su nombre, abre el flujo de impersonation con razón explícita.
          </p>
        </div>

        {/* Quick links */}
        <div>
          <h3 className="text-[13px] font-semibold text-slate-700 uppercase tracking-wider mb-3">
            Áreas
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <QuickLink
              to="/nova/channex"
              icon={Cable}
              title="Channex Command"
              desc="Room types, rate plans, calendar matrix, restrictions, channels."
              status="Days 10-13"
            />
            <QuickLink
              to="/nova/wizard"
              icon={Sparkles}
              title="Wizard Activate"
              desc="8 pasos para activar un cliente nuevo desde cero."
              status="Days 14-15"
            />
            <QuickLink
              to="/nova/audit"
              icon={ScrollText}
              title="Audit log"
              desc="Historial inmutable de acciones. Filtrable por actor y acción."
              status="Day 13"
            />
          </div>
        </div>

        {/* Cross-link to client PMS */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start gap-4">
          <ExternalLink className="h-5 w-5 text-slate-400 mt-0.5 flex-shrink-0" aria-hidden />
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-semibold text-slate-900">
              Vista cliente — PMS en `app.zenix.com`
            </h3>
            <p className="mt-1 text-[13px] text-slate-600">
              Para ver lo mismo que ve el recepcionista del hotel (calendar, check-in,
              housekeeping), usa el flow de impersonation. Día 14+ wireará el botón
              "Ver como cliente" con generación automática de token short-lived.
            </p>
          </div>
        </div>
      </div>
    </NovaShell>
  )
}

interface QuickLinkProps {
  to: string
  icon: typeof Cable
  title: string
  desc: string
  status?: string
}

function QuickLink({ to, icon: Icon, title, desc, status }: QuickLinkProps) {
  return (
    <Link
      to={to}
      className="group bg-white rounded-xl border border-slate-200 p-4 hover:border-emerald-400 hover:shadow-md transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-slate-100 group-hover:bg-emerald-100 flex items-center justify-center text-slate-600 group-hover:text-emerald-700 transition-colors">
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[14px] font-semibold text-slate-900 truncate group-hover:text-emerald-700 transition-colors">
              {title}
            </h4>
            <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
          </div>
          <p className="mt-1 text-[12px] text-slate-600 line-clamp-2">{desc}</p>
          {status && (
            <div className="mt-2 inline-flex items-center text-[10px] font-medium uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
              {status}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
