/**
 * TodayActions — Command Center zona 3.
 *
 * "Qué hay que hacer hoy" como lista accionable.
 * Cada row es un action affordance (NN/g) con count + CTA.
 *
 * Pattern Linear/Stripe: jerarquía por urgencia, sin colores ruidosos.
 * Chips de status: positive | warn | urgent | neutral.
 */
import { ArrowRight } from 'lucide-react'
import type { DashboardSnapshot } from '@/hooks/useDashboardSnapshot'
import { formatMoney } from './format'
import { Link } from 'react-router-dom'

interface ActionRowProps {
  href: string
  title: string
  detail: string
  chip?: { label: string; tone: 'positive' | 'warn' | 'urgent' | 'neutral' }
}
function ActionRow({ href, title, detail, chip }: ActionRowProps) {
  return (
    <Link to={href} className="zx-action-row" style={{ textDecoration: 'none' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--zx-s2)' }}>
          <span style={{ fontSize: 'var(--zx-text-body)', color: 'var(--zx-ink-1)', fontWeight: 500 }}>
            {title}
          </span>
          {chip ? <span className={`zx-chip zx-chip--${chip.tone}`}>{chip.label}</span> : null}
        </div>
        <p style={{ marginTop: 2, fontSize: 'var(--zx-text-caption)', color: 'var(--zx-ink-3)', lineHeight: 1.4 }}>
          {detail}
        </p>
      </div>
      <ArrowRight size={14} style={{ color: 'var(--zx-ink-4)', flexShrink: 0 }} />
    </Link>
  )
}

export function TodayActions({ actions, baseCurrency }: { actions: DashboardSnapshot['actions']; baseCurrency: string }) {
  const noActions =
    actions.arrivals.count === 0 &&
    actions.departures.count === 0 &&
    actions.housekeeping.count === 0 &&
    actions.overstayed.count === 0 &&
    actions.unpaidArrivals.count === 0

  return (
    <section className="zx-card" style={{ padding: 'var(--zx-s5)', display: 'flex', flexDirection: 'column', gap: 'var(--zx-s4)' }}>
      <header className="zx-eyebrow-row">
        <span className="zx-eyebrow">Tu jornada</span>
        <span className="zx-meta">{actionsCountLabel(actions)}</span>
      </header>

      {noActions ? (
        <p className="zx-meta">Sin tareas pendientes en este momento. Buen ritmo.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginLeft: 'calc(var(--zx-s4) * -1)', marginRight: 'calc(var(--zx-s4) * -1)' }}>
          {actions.arrivals.count > 0 && (
            <ActionRow
              href="/calendar"
              title={`${actions.arrivals.count} ${actions.arrivals.count === 1 ? 'llegada' : 'llegadas'} pendientes`}
              detail={previewLine(actions.arrivals.preview, 'llegan')}
              chip={{ label: 'Check-in', tone: 'neutral' }}
            />
          )}
          {actions.departures.count > 0 && (
            <ActionRow
              href="/calendar"
              title={`${actions.departures.count} ${actions.departures.count === 1 ? 'salida' : 'salidas'} pendientes`}
              detail={previewLine(actions.departures.preview, 'salen')}
              chip={{ label: 'Check-out', tone: 'neutral' }}
            />
          )}
          {actions.housekeeping.count > 0 && (
            <ActionRow
              href="/housekeeping"
              title={`${actions.housekeeping.count} ${actions.housekeeping.count === 1 ? 'cuarto' : 'cuartos'} en proceso`}
              detail="Estado housekeeping en curso · ver kanban"
              chip={{ label: 'Limpieza', tone: 'neutral' }}
            />
          )}
          {actions.overstayed.count > 0 && (
            <ActionRow
              href="/reports/overstayed"
              title={`${actions.overstayed.count} ${actions.overstayed.count === 1 ? 'salida vencida' : 'salidas vencidas'}`}
              detail={
                actions.overstayed.balance > 0
                  ? `Saldo acumulado ${formatMoney(actions.overstayed.balance, baseCurrency)}`
                  : 'Confirma checkout o registra demora'
              }
              chip={{ label: 'Urgente', tone: 'urgent' }}
            />
          )}
          {actions.unpaidArrivals.count > 0 && (
            <ActionRow
              href="/calendar"
              title={`${actions.unpaidArrivals.count} ${actions.unpaidArrivals.count === 1 ? 'llegada' : 'llegadas'} con saldo`}
              detail="Cobra al check-in para evitar cargos posteriores"
              chip={{ label: 'Cobrar', tone: 'warn' }}
            />
          )}
        </div>
      )}
    </section>
  )
}

function actionsCountLabel(a: DashboardSnapshot['actions']) {
  const total = a.arrivals.count + a.departures.count + a.housekeeping.count + a.overstayed.count + a.unpaidArrivals.count
  if (total === 0) return 'al día'
  return `${total} ${total === 1 ? 'pendiente' : 'pendientes'}`
}

function previewLine(events: { guestName: string; roomNumber: string | null }[], verb: string): string {
  if (events.length === 0) return ''
  const head = events.slice(0, 2).map((e) => e.guestName.split(' ')[0]).join(', ')
  if (events.length <= 2) return `${head} ${verb} hoy`
  return `${head} +${events.length - 2} más ${verb} hoy`
}
