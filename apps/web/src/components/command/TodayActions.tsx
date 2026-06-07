/**
 * TodayActions — Zona 3 del Command Center.
 *
 * Pattern Linear inbox + Pitch bento: cada action card tiene su propia
 * micro-personalidad (icon tinte distinto + número grande + chip estado).
 * NO una lista plana de rows — son tiles que se sienten "vivos".
 *
 * Composition: 2x2 micro-bento dentro de un card neutral.
 */
import { ArrowRight, ChevronRight, ClockAlert, BedDouble, LogIn, LogOut, CreditCard } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { DashboardSnapshot } from '@/hooks/useDashboardSnapshot'
import { formatMoney } from './format'

export function TodayActions({ actions, baseCurrency }: { actions: DashboardSnapshot['actions']; baseCurrency: string }) {
  const tiles = [
    actions.arrivals.count > 0 && {
      id: 'arrivals', href: '/calendar',
      icon: LogIn, accent: 'oklch(0.52 0.18 270)' /* indigo */,
      tintBg: 'oklch(0.97 0.012 270)', tintBorder: 'oklch(0.52 0.18 270 / 0.18)',
      title: 'Check-in',
      count: actions.arrivals.count,
      label: actions.arrivals.count === 1 ? 'llegada pendiente' : 'llegadas pendientes',
      hint: previewLine(actions.arrivals.preview),
      urgent: false,
    },
    actions.departures.count > 0 && {
      id: 'departures', href: '/calendar',
      icon: LogOut, accent: 'oklch(0.55 0.16 200)' /* teal */,
      tintBg: 'oklch(0.97 0.012 200)', tintBorder: 'oklch(0.55 0.16 200 / 0.18)',
      title: 'Check-out',
      count: actions.departures.count,
      label: actions.departures.count === 1 ? 'salida pendiente' : 'salidas pendientes',
      hint: previewLine(actions.departures.preview),
      urgent: false,
    },
    actions.housekeeping.count > 0 && {
      id: 'hk', href: '/housekeeping',
      icon: BedDouble, accent: 'oklch(0.55 0.15 152)' /* emerald */,
      tintBg: 'oklch(0.97 0.012 152)', tintBorder: 'oklch(0.55 0.15 152 / 0.18)',
      title: 'Housekeeping',
      count: actions.housekeeping.count,
      label: actions.housekeeping.count === 1 ? 'cuarto activo' : 'cuartos activos',
      hint: 'en proceso · ver kanban',
      urgent: false,
    },
    actions.overstayed.count > 0 && {
      id: 'over', href: '/reports/overstayed',
      icon: ClockAlert, accent: 'oklch(0.58 0.21 25)' /* rose */,
      tintBg: 'oklch(0.98 0.015 25)', tintBorder: 'oklch(0.58 0.21 25 / 0.25)',
      title: 'Vencidas',
      count: actions.overstayed.count,
      label: actions.overstayed.count === 1 ? 'salida no confirmada' : 'salidas no confirmadas',
      hint: actions.overstayed.balance > 0
        ? `Saldo ${formatMoney(actions.overstayed.balance, baseCurrency)} pendiente`
        : 'Confirma checkout o demora',
      urgent: true,
    },
    actions.unpaidArrivals.count > 0 && {
      id: 'unpaid', href: '/calendar',
      icon: CreditCard, accent: 'oklch(0.65 0.17 75)' /* amber */,
      tintBg: 'oklch(0.97 0.018 75)', tintBorder: 'oklch(0.65 0.17 75 / 0.22)',
      title: 'Cobrar al llegar',
      count: actions.unpaidArrivals.count,
      label: actions.unpaidArrivals.count === 1 ? 'reserva con saldo' : 'reservas con saldo',
      hint: 'Evita cargos posteriores',
      urgent: false,
    },
  ].filter(Boolean) as Array<{
    id: string; href: string; icon: typeof LogIn; accent: string;
    tintBg: string; tintBorder: string;
    title: string; count: number; label: string; hint: string; urgent: boolean
  }>

  return (
    <section className="zx-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
        <div>
          <span className="zx-eyebrow">Tu jornada</span>
          <h2 className="zx-card-h" style={{ marginTop: 6 }}>
            {tiles.length === 0 ? 'Sin pendientes' : `${tiles.length} ${tiles.length === 1 ? 'tipo de acción' : 'tipos de acción'}`}
          </h2>
        </div>
        {tiles.length > 0 && (
          <Link to="/calendar" className="zx-action-quiet" style={{ textDecoration: 'none' }}>
            Ver calendario <ArrowRight size={12} />
          </Link>
        )}
      </header>

      {tiles.length === 0 ? (
        <p className="zx-meta">Buen ritmo. Sin tareas urgentes que requieran tu atención ahora.</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 10,
          }}
        >
          {tiles.map((t) => (
            <ActionTile key={t.id} {...t} />
          ))}
        </div>
      )}
    </section>
  )
}

function ActionTile({
  href, icon: Icon, accent, tintBg, tintBorder,
  title, count, label, hint, urgent,
}: {
  href: string; icon: typeof LogIn; accent: string;
  tintBg: string; tintBorder: string;
  title: string; count: number; label: string; hint: string; urgent: boolean
}) {
  return (
    <Link
      to={href}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        padding: 16,
        background: tintBg,
        border: `1px solid ${tintBorder}`,
        borderRadius: 12,
        textDecoration: 'none',
        position: 'relative',
        transition: 'transform var(--zx-dur-fast) var(--zx-ease-spring), box-shadow var(--zx-dur-fast) var(--zx-ease-spring)',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px oklch(0.13 0.01 240 / 0.06)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 10,
            background: 'oklch(1 0 0 / 0.7)', border: `1px solid ${tintBorder}`,
            color: accent,
          }}
        ><Icon size={16} /></span>
        {urgent && (
          <span
            style={{
              fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600,
              color: 'oklch(0.42 0.18 25)', background: 'oklch(0.95 0.04 25)',
              padding: '3px 8px', borderRadius: 999, border: `1px solid ${tintBorder}`,
            }}
          >Urgente</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span
          style={{
            fontSize: 'var(--zx-text-display)',
            fontWeight: 600,
            letterSpacing: '-0.025em',
            lineHeight: 0.95,
            color: 'var(--zx-ink-1)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >{count}</span>
        <span className="zx-meta" style={{ color: 'var(--zx-ink-2)' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--zx-ink-3)', lineHeight: 1.3, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {hint}
        </span>
        <span style={{ fontSize: 11, color: accent, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0, marginLeft: 8 }}>
          {title} <ChevronRight size={12} />
        </span>
      </div>
    </Link>
  )
}

function previewLine(events: { guestName: string }[]): string {
  if (events.length === 0) return ''
  const head = events.slice(0, 2).map((e) => e.guestName.split(' ')[0]).join(', ')
  if (events.length <= 2) return head
  return `${head} +${events.length - 2}`
}
