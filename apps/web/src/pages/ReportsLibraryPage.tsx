import { Link } from 'react-router-dom'
import { ArrowRight, BedDouble, CalendarX, Coins, TrendingUp, Wallet } from 'lucide-react'
import { StaffRole } from '@zenix/shared'
import { useAuthStore } from '@/store/auth'

/**
 * Biblioteca de Reportes (Estándar de Reportes, D-REPORT5). Catálogo agrupado por
 * área; cada reporte abre su vista ReportTable. Los marcados "clásico" aún viven en
 * la vista tabbed previa y se migran al estándar en R3.
 */

interface ReportCard {
  key: string
  title: string
  description: string
  to: string
  icon: typeof Wallet
  supervisorOnly?: boolean
  legacy?: boolean
}

const GROUPS: { area: string; reports: ReportCard[] }[] = [
  {
    area: 'Finanzas / Caja',
    reports: [
      {
        key: 'cash-shifts',
        title: 'Turnos de caja',
        description: 'Arqueo por turno: fondo, esperado, contado, sobrante/faltante, conciliador. Export Excel/CSV.',
        to: '/reports/cash-shifts',
        icon: Wallet,
        supervisorOnly: true,
      },
      {
        key: 'cash-transactions',
        title: 'Movimientos de caja',
        description: 'Cada pago, anticipo y anulación (Transaction Report). Filtros por divisa/método. Export Excel/CSV.',
        to: '/reports/cash-transactions',
        icon: Coins,
        supervisorOnly: true,
      },
      {
        key: 'cash-summary',
        title: 'Resumen diario de caja',
        description: 'Totales del día por método/divisa/cajero. (Se integra al estándar en R3.)',
        to: '/reports/classic?tab=cash',
        icon: Coins,
        supervisorOnly: true,
        legacy: true,
      },
    ],
  },
  {
    area: 'Comercial / Revenue',
    reports: [
      { key: 'noshow', title: 'No-shows', description: 'Reservas no presentadas, cargos e iniciador.', to: '/reports/classic?tab=noshow', icon: CalendarX, legacy: true },
      { key: 'stays', title: 'Estadías extendidas', description: 'Huéspedes que extendieron, con datos de contacto.', to: '/reports/classic?tab=stays', icon: TrendingUp, legacy: true },
    ],
  },
  {
    area: 'Operación',
    reports: [
      { key: 'hk', title: 'Housekeeping', description: 'Desempeño de personal y tendencia diaria.', to: '/reports/classic?tab=housekeeping', icon: BedDouble, legacy: true },
    ],
  },
]

export function ReportsLibraryPage() {
  const role = useAuthStore((s) => s.user?.role)
  const isSupervisor = role === StaffRole.SUPERVISOR

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900">Reportes</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Tablas operables y descargables (Excel/CSV) para administración y contabilidad.
        </p>
      </div>

      <div className="space-y-6">
        {GROUPS.map((g) => {
          const visible = g.reports.filter((r) => !r.supervisorOnly || isSupervisor)
          if (visible.length === 0) return null
          return (
            <section key={g.area}>
              <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">{g.area}</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {visible.map((r) => {
                  const Icon = r.icon
                  return (
                    <Link
                      key={r.key}
                      to={r.to}
                      className="group rounded-xl border border-slate-200 bg-white p-4 hover:border-emerald-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-600 grid place-items-center shrink-0">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-slate-800">{r.title}</h3>
                            {r.legacy ? (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">clásico</span>
                            ) : null}
                          </div>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{r.description}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-emerald-500 transition-colors shrink-0" />
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
