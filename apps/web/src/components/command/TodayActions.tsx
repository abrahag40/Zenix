/**
 * TodayActions — "Tu jornada".
 *
 * Owner 2026-06-07 iter 4: rediseñar por UX más organizada — el grid 2x2
 * de tiles era "bento bonito" pero no priorizaba. Nueva organización:
 *
 *   · Summary header: total + lo más urgente
 *   · Lista priorizada (urgent → action → flow) con iconos coloreados,
 *     título, valor grande, descripción, CTA
 *   · Pattern Linear inbox + Stripe Atlas tasks + Vercel team activity
 */
import { ArrowRight, ChevronRight, ClockAlert, BedDouble, LogIn, LogOut, CreditCard } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { DashboardSnapshot } from '@/hooks/useDashboardSnapshot'
import { formatMoney } from './format'

type Tier = 'urgent' | 'action' | 'flow'

interface TileSpec {
  id: string
  tier: Tier
  href: string
  icon: typeof LogIn
  accent: string
  tintBg: string
  tintBorder: string
  title: string
  count: number
  hint: string
  detail: string
}

const TIER_LABEL: Record<Tier, { label: string; color: string }> = {
  urgent: { label: 'Atender ahora', color: 'oklch(0.45 0.18 25)' },
  action: { label: 'Próximas acciones', color: 'oklch(0.42 0.16 75)' },
  flow:   { label: 'En curso',          color: 'var(--zx-ink-3)' },
}

export function TodayActions({ actions, baseCurrency }: { actions: DashboardSnapshot['actions']; baseCurrency: string }) {
  const tiles: TileSpec[] = [
    actions.overstayed.count > 0 && {
      id: 'over', tier: 'urgent' as Tier, href: '/reports/overstayed',
      icon: ClockAlert, accent: 'oklch(0.58 0.21 25)',
      tintBg: 'oklch(0.98 0.015 25)', tintBorder: 'oklch(0.58 0.21 25 / 0.20)',
      title: 'Salidas vencidas',
      count: actions.overstayed.count,
      hint: actions.overstayed.count === 1 ? 'sin checkout confirmado' : 'sin checkout confirmado',
      detail: actions.overstayed.balance > 0
        ? `Saldo ${formatMoney(actions.overstayed.balance, baseCurrency)} pendiente`
        : 'Confirma checkout o regístrale demora',
    },
    actions.unpaidArrivals.count > 0 && {
      id: 'unpaid', tier: 'action' as Tier, href: '/calendar',
      icon: CreditCard, accent: 'oklch(0.65 0.17 75)',
      tintBg: 'oklch(0.97 0.018 75)', tintBorder: 'oklch(0.65 0.17 75 / 0.20)',
      title: 'Cobrar al llegar',
      count: actions.unpaidArrivals.count,
      hint: actions.unpaidArrivals.count === 1 ? 'reserva con saldo' : 'reservas con saldo',
      detail: 'Evita arrastrar cargos al checkout',
    },
    actions.arrivals.count > 0 && {
      id: 'arr', tier: 'action' as Tier, href: '/calendar',
      icon: LogIn, accent: 'oklch(0.52 0.18 270)',
      tintBg: 'oklch(0.97 0.012 270)', tintBorder: 'oklch(0.52 0.18 270 / 0.18)',
      title: 'Check-in',
      count: actions.arrivals.count,
      hint: actions.arrivals.count === 1 ? 'llegada por procesar' : 'llegadas por procesar',
      detail: previewLine(actions.arrivals.preview),
    },
    actions.departures.count > 0 && {
      id: 'dep', tier: 'action' as Tier, href: '/calendar',
      icon: LogOut, accent: 'oklch(0.55 0.16 200)',
      tintBg: 'oklch(0.97 0.012 200)', tintBorder: 'oklch(0.55 0.16 200 / 0.18)',
      title: 'Check-out',
      count: actions.departures.count,
      hint: actions.departures.count === 1 ? 'salida por confirmar' : 'salidas por confirmar',
      detail: previewLine(actions.departures.preview),
    },
    actions.housekeeping.count > 0 && {
      id: 'hk', tier: 'flow' as Tier, href: '/housekeeping',
      icon: BedDouble, accent: 'oklch(0.55 0.15 152)',
      tintBg: 'oklch(0.97 0.012 152)', tintBorder: 'oklch(0.55 0.15 152 / 0.18)',
      title: 'Housekeeping',
      count: actions.housekeeping.count,
      hint: actions.housekeeping.count === 1 ? 'cuarto en proceso' : 'cuartos en proceso',
      detail: 'Limpieza en curso · ver kanban',
    },
  ].filter(Boolean) as TileSpec[]

  const totalCount = tiles.reduce((s, t) => s + t.count, 0)
  const topUrgent = tiles.find((t) => t.tier === 'urgent')

  // Group por tier
  const grouped: Record<Tier, TileSpec[]> = {
    urgent: tiles.filter((t) => t.tier === 'urgent'),
    action: tiles.filter((t) => t.tier === 'action'),
    flow:   tiles.filter((t) => t.tier === 'flow'),
  }
  const tierOrder: Tier[] = ['urgent', 'action', 'flow']

  return (
    <section className="zx-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <span className="zx-eyebrow">Tu jornada</span>
          <h2 className="zx-card-h" style={{ marginTop: 6 }}>
            {tiles.length === 0 ? 'Sin pendientes' : `${totalCount} ${totalCount === 1 ? 'tarea' : 'tareas'} a tu cargo`}
          </h2>
          {topUrgent && (
            <p style={{ fontSize: 12, color: 'oklch(0.45 0.18 25)', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ClockAlert size={12} /> <strong>{topUrgent.count}</strong> {topUrgent.hint} requieren atención
            </p>
          )}
        </div>
        {tiles.length > 0 && (
          <Link to="/calendar" className="zx-action-quiet" style={{ textDecoration: 'none' }}>
            Calendario <ArrowRight size={12} />
          </Link>
        )}
      </header>

      {tiles.length === 0 ? (
        <p className="zx-meta">Buen ritmo. Sin tareas urgentes que requieran tu atención ahora.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tierOrder.map((tier) => {
            const items = grouped[tier]
            if (items.length === 0) return null
            const tl = TIER_LABEL[tier]
            return (
              <div key={tier} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      width: 6, height: 6, borderRadius: 999,
                      background: tl.color, flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase',
                      color: tl.color, fontWeight: 600,
                    }}
                  >{tl.label}</span>
                  <span style={{ flex: 1, height: 1, background: 'var(--zx-line-subtle)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {items.map((t) => <ActionRow key={t.id} {...t} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function ActionRow({ href, icon: Icon, accent, tintBg, tintBorder, title, count, hint, detail }: TileSpec) {
  return (
    <Link
      to={href}
      style={{
        display: 'grid',
        gridTemplateColumns: '40px 64px minmax(0, 1fr) auto',
        gap: 14,
        alignItems: 'center',
        padding: '12px 14px',
        background: tintBg,
        border: `1px solid ${tintBorder}`,
        borderRadius: 12,
        textDecoration: 'none',
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
      {/* Icon box */}
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, borderRadius: 10,
          background: 'oklch(1 0 0 / 0.7)', border: `1px solid ${tintBorder}`,
          color: accent, flexShrink: 0,
        }}
      ><Icon size={18} /></span>

      {/* Count grande */}
      <span
        style={{
          fontSize: 26, fontWeight: 600, letterSpacing: '-0.022em',
          color: 'var(--zx-ink-1)', fontVariantNumeric: 'tabular-nums',
          lineHeight: 1, textAlign: 'left',
        }}
      >{count}</span>

      {/* Title + hint + detail */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--zx-ink-1)', letterSpacing: '-0.005em' }}>
          {title} <span style={{ color: 'var(--zx-ink-3)', fontWeight: 400 }}>— {hint}</span>
        </span>
        <span style={{ fontSize: 11, color: 'var(--zx-ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {detail}
        </span>
      </div>

      <ChevronRight size={14} style={{ color: accent, flexShrink: 0 }} />
    </Link>
  )
}

function previewLine(events: { guestName: string }[]): string {
  if (events.length === 0) return ''
  const head = events.slice(0, 2).map((e) => e.guestName.split(' ')[0]).join(', ')
  if (events.length <= 2) return head
  return `${head} +${events.length - 2} más`
}
