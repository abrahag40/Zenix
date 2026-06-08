/**
 * LiveNow — Zona 2 del Command Center.
 *
 * Pattern Pitch.com bento: card tintada (positive wash) que se diferencia
 * visualmente del resto. Stack de avatars de staff (steal-as-artist:
 * Notion calendars / Linear members). Integrated next-event timeline mini.
 */
import type { DashboardSnapshot } from '@/hooks/useDashboardSnapshot'
import { roleLabel, timeRelative } from './format'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '·'
}

export function LiveNow({ liveNow }: { liveNow: DashboardSnapshot['liveNow'] }) {
  const occupancy = liveNow.totalRooms > 0
    ? Math.round((liveNow.inHouseCount / liveNow.totalRooms) * 100)
    : 0

  return (
    <section
      className="zx-card zx-card--positive"
      style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}
    >
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <span className="zx-eyebrow" style={{ color: 'oklch(0.42 0.13 152)' }}>Ahora en el hotel</span>
          <h2 className="zx-card-h" style={{ marginTop: 6 }}>
            {liveNow.inHouseCount === 0 ? 'Hotel vacío' : `${liveNow.inHouseCount} huéspedes activos`}
          </h2>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 11, letterSpacing: '0.04em', color: 'oklch(0.45 0.10 152)', textTransform: 'uppercase', fontWeight: 500 }}>Ocupación</p>
          <p className="zx-metric" style={{ fontSize: 28, color: 'oklch(0.32 0.10 152)' }}>{occupancy}%</p>
        </div>
      </header>

      {/* Occupancy progress bar */}
      <div className="zx-progress zx-progress--emerald" style={{ height: 8, background: 'oklch(0.55 0.10 152 / 0.12)' }}>
        <div className="zx-progress__fill" style={{ width: `${occupancy}%` }} />
      </div>

      {/* Staff activo — avatar stack */}
      <div>
        <p className="zx-eyebrow" style={{ marginBottom: 8 }}>Staff activo</p>
        {liveNow.activeStaff.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="zx-avatar-stack">
              {liveNow.activeStaff.slice(0, 4).map((s) => (
                <span
                  key={s.id}
                  className="zx-avatar"
                  title={`${s.name} · ${roleLabel(s.role)}`}
                >
                  {initials(s.name)}
                </span>
              ))}
              {liveNow.activeStaff.length > 4 && (
                <span className="zx-avatar" style={{ background: 'oklch(0.95 0.005 240)', color: 'var(--zx-ink-2)' }}>
                  +{liveNow.activeStaff.length - 4}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 'var(--zx-text-body)', color: 'var(--zx-ink-1)', fontWeight: 500 }}>
                {liveNow.activeStaff[0].name}
              </span>
              <span className="zx-meta">
                {roleLabel(liveNow.activeStaff[0].role)}
                {liveNow.activeStaff.length > 1 ? ` · y ${liveNow.activeStaff.length - 1} más` : ''}
              </span>
            </div>
            <span className="zx-live-dot" style={{ marginLeft: 'auto' }} aria-label="en vivo" />
          </div>
        ) : (
          <p className="zx-meta">Sin actividad operativa en este momento.</p>
        )}
      </div>

      {/* Próximos eventos como timeline mini */}
      <div style={{ borderTop: '1px solid oklch(0.55 0.10 152 / 0.18)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <NextEventRow
          icon={<ArrowDownRight size={14} />}
          label="Próxima llegada"
          event={liveNow.nextArrival}
          tintFg="oklch(0.42 0.13 152)"
          emptyMsg="Sin llegadas inminentes"
        />
        <NextEventRow
          icon={<ArrowUpRight size={14} />}
          label="Próxima salida"
          event={liveNow.nextDeparture}
          tintFg="oklch(0.45 0.13 75)"
          emptyMsg="Sin salidas próximas"
        />
      </div>
    </section>
  )
}

function NextEventRow({
  icon,
  label,
  event,
  tintFg,
  emptyMsg,
}: {
  icon: React.ReactNode
  label: string
  event: DashboardSnapshot['liveNow']['nextArrival']
  tintFg: string
  emptyMsg: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, borderRadius: 8,
          background: 'oklch(1 0 0 / 0.6)', border: '1px solid var(--zx-line-subtle)',
          color: tintFg,
          flexShrink: 0,
        }}
      >{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="zx-meta" style={{ marginBottom: 2 }}>{label}</p>
        {event ? (
          <p style={{ fontSize: 'var(--zx-text-body)', color: 'var(--zx-ink-1)', fontWeight: 500, letterSpacing: '-0.005em' }}>
            {event.guestName}
            {event.roomNumber && <span style={{ color: 'var(--zx-ink-3)', fontWeight: 400 }}> · Hab. {event.roomNumber}</span>}
          </p>
        ) : (
          <p style={{ fontSize: 'var(--zx-text-body)', color: 'var(--zx-ink-3)' }}>{emptyMsg}</p>
        )}
      </div>
      {event && (
        <span
          style={{
            fontSize: 12, fontWeight: 500, color: tintFg, fontVariantNumeric: 'tabular-nums',
            background: 'oklch(1 0 0 / 0.7)', padding: '4px 10px', borderRadius: 999,
            border: `1px solid ${tintFg.replace(')', ' / 0.20)')}`,
          }}
        >
          {timeRelative(event.scheduledIso)}
        </span>
      )}
    </div>
  )
}
