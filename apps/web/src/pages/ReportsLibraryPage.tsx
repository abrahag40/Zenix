import { Link } from 'react-router-dom'
import { AlarmClock, ArrowRight, BarChart3, BedDouble, CalendarX, Coins, FileText, Lock, Mail, Receipt, TrendingUp, Wallet } from 'lucide-react'
import { StaffRole } from '@zenix/shared'
import { useAuthStore } from '@/store/auth'

/**
 * Biblioteca de Reportes (Estándar de Reportes, D-REPORT5). Catálogo COMPLETO por
 * área — ver docs/standards/report-catalog.md. Cada reporte declara su estado:
 *  · live      → tabla operable construida (Link).
 *  · dashboard → la data vive como dashboard glanceable (Link a su superficie).
 *  · blocked   → definido pero vacío hasta que aterrice su módulo (PAY-CORE/RATES/
 *                CFDI-CORE); se muestra "Próximamente · depende de X" (NO data falsa).
 */

type ReportStatus = 'live' | 'dashboard' | 'blocked'

interface ReportCard {
  key: string
  title: string
  description: string
  to?: string
  icon: typeof Wallet
  status: ReportStatus
  dependsOn?: string
  supervisorOnly?: boolean
  legacy?: boolean
}

const GROUPS: { area: string; reports: ReportCard[] }[] = [
  {
    area: 'Finanzas / Caja',
    reports: [
      { key: 'cash-shifts', title: 'Turnos de caja', description: 'Arqueo por turno: fondo, esperado, contado, sobrante/faltante, conciliador. Export Excel/CSV.', to: '/reports/cash-shifts', icon: Wallet, status: 'live', supervisorOnly: true },
      { key: 'cash-transactions', title: 'Movimientos de caja', description: 'Cada pago, anticipo y anulación (Transaction Report). Filtros por divisa/método. Export Excel/CSV.', to: '/reports/cash-transactions', icon: Coins, status: 'live', supervisorOnly: true },
      { key: 'cash-summary', title: 'Resumen diario de caja', description: 'Totales del día por método/divisa y por cajero. Export Excel/CSV.', to: '/reports/cash-summary', icon: Coins, status: 'live', supervisorOnly: true },
    ],
  },
  {
    area: 'Comercial / Revenue',
    reports: [
      { key: 'metrics', title: 'Métricas diarias', description: 'Ocupación, ADR y RevPAR por día (USALI) con llegadas, salidas, cancelaciones y no-shows. Export Excel/CSV.', to: '/reports/metrics', icon: BarChart3, status: 'live', supervisorOnly: true },
      { key: 'noshow', title: 'No-shows', description: 'Reservas no presentadas, cargo, estado y quién lo marcó. Export Excel/CSV.', to: '/reports/no-shows', icon: CalendarX, status: 'live', supervisorOnly: true },
      { key: 'stays', title: 'Estadías extendidas', description: 'Quién extendió, noches/ingreso extra y contacto para retención. Export Excel/CSV.', to: '/reports/stays', icon: TrendingUp, status: 'live', supervisorOnly: true },
      { key: 'overstayed', title: 'Saldos vencidos', description: 'Reservas con salida vencida sin checkout (zombie) y su saldo pendiente, para cobro/conciliación. Export Excel/CSV.', to: '/reports/overstayed', icon: AlarmClock, status: 'live', supervisorOnly: true },
      { key: 'channel-production', title: 'Producción por canal y segmento', description: 'Aporte de cada OTA neto de comisión + channel mix. Decide en qué canales invertir.', icon: TrendingUp, status: 'blocked', dependsOn: 'RATES', supervisorOnly: true },
      { key: 'rate-production', title: 'Producción por tarifa', description: 'Ingreso y ADR por rate plan.', icon: BarChart3, status: 'blocked', dependsOn: 'RATES', supervisorOnly: true },
    ],
  },
  {
    area: 'Contabilidad / Fiscal',
    reports: [
      { key: 'fiscal-invoicing', title: 'Facturación fiscal (CFDI / DIAN / NFS-e…)', description: 'Libro de facturación timbrada para el contador: id fiscal, base, IVA e impuesto local desglosados. País-específico según la entidad legal.', icon: Receipt, status: 'blocked', dependsOn: 'CFDI-CORE', supervisorOnly: true },
      { key: 'guest-ledger', title: 'Guest ledger / folios abiertos', description: 'Folios con cargos, pagos y saldo abierto. Quién debe qué ahora mismo.', icon: FileText, status: 'blocked', dependsOn: 'PAY-CORE', supervisorOnly: true },
      { key: 'accounts-receivable', title: 'Cuentas por cobrar (city ledger)', description: 'Saldos a crédito de agencias/empresas con antigüedad.', icon: FileText, status: 'blocked', dependsOn: 'PAY-CORE', supervisorOnly: true },
      { key: 'tax-breakdown', title: 'Impuestos por concepto', description: 'IVA + impuesto turístico (ISH/IIBB/parafiscal) + retenciones desglosados. Columnas dinámicas por país.', icon: Receipt, status: 'blocked', dependsOn: 'CFDI-CORE', supervisorOnly: true },
    ],
  },
  {
    area: 'Operación',
    reports: [
      { key: 'hk', title: 'Desempeño de housekeeping', description: 'Tareas, verificadas y tiempo promedio por recamarista.', to: '/reports/classic?tab=housekeeping', icon: BedDouble, status: 'dashboard', legacy: true },
    ],
  },
  {
    area: 'Grupo (multi-propiedad)',
    reports: [
      { key: 'group-consolidated', title: 'Consolidado de grupo', description: 'Ocupación, ADR/RevPAR e ingreso de todas las propiedades en una divisa de reporte (gerencial, no contable — FX explícito).', icon: TrendingUp, status: 'blocked', dependsOn: 'multi-país', supervisorOnly: true },
    ],
  },
]

export function ReportsLibraryPage() {
  const role = useAuthStore((s) => s.user?.role)
  const isSupervisor = role === StaffRole.SUPERVISOR

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Reportes</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Tablas operables y descargables (Excel/CSV) para administración y contabilidad.
          </p>
        </div>
        {isSupervisor ? (
          <Link to="/reports/scheduled" className="h-9 inline-flex items-center gap-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 text-xs font-medium shrink-0">
            <Mail className="h-3.5 w-3.5" /> Programados
          </Link>
        ) : null}
      </div>

      <div className="space-y-6">
        {GROUPS.map((g) => {
          const visible = g.reports.filter((r) => !r.supervisorOnly || isSupervisor)
          if (visible.length === 0) return null
          return (
            <section key={g.area}>
              <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">{g.area}</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {visible.map((r) => <ReportCardView key={r.key} r={r} />)}
              </div>
            </section>
          )
        })}
      </div>

      <p className="mt-6 text-[11px] text-slate-400 leading-relaxed">
        Los reportes marcados <span className="font-medium text-slate-500">“Próximamente”</span> ya están definidos en el catálogo
        (columnas y usuario), y se activan cuando se complete su módulo (PAY-CORE / RATES / CFDI-CORE). Ver
        <span className="font-mono"> docs/standards/report-catalog.md</span>.
      </p>
    </div>
  )
}

function ReportCardView({ r }: { r: ReportCard }) {
  const Icon = r.icon
  const blocked = r.status === 'blocked'

  const inner = (
    <div className="flex items-start gap-3">
      <div className={`h-9 w-9 rounded-lg grid place-items-center shrink-0 ${blocked ? 'bg-slate-100 text-slate-400' : 'bg-emerald-50 text-emerald-600'}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className={`text-sm font-semibold ${blocked ? 'text-slate-500' : 'text-slate-800'}`}>{r.title}</h3>
          {r.status === 'blocked' ? (
            <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
              <Lock className="h-2.5 w-2.5" /> Próximamente · {r.dependsOn}
            </span>
          ) : r.status === 'dashboard' ? (
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">dashboard</span>
          ) : null}
        </div>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{r.description}</p>
      </div>
      {!blocked ? <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-emerald-500 transition-colors shrink-0" /> : null}
    </div>
  )

  if (blocked || !r.to) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-4 cursor-default" title={`Se activa al completar ${r.dependsOn ?? 'su módulo'}`}>
        {inner}
      </div>
    )
  }
  return (
    <Link to={r.to} className="group rounded-xl border border-slate-200 bg-white p-4 hover:border-emerald-300 hover:shadow-sm transition-all">
      {inner}
    </Link>
  )
}
