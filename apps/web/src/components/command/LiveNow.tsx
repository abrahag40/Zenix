/**
 * LiveNow — Command Center zona 2.
 *
 * "Quién está activo en mi hotel AHORA mismo".
 * Pulsing live dot (Apple HIG H1 Status Visibility).
 *
 * Contenido:
 *   · Staff activo con dot verde pulsante
 *   · Próxima llegada / próxima salida con time relative
 *   · Sense of motion sin requerir scroll
 */
import type { DashboardSnapshot } from '@/hooks/useDashboardSnapshot'
import { roleLabel, timeRelative } from './format'

export function LiveNow({ liveNow }: { liveNow: DashboardSnapshot['liveNow'] }) {
  const occupancy = liveNow.totalRooms > 0
    ? Math.round((liveNow.inHouseCount / liveNow.totalRooms) * 100)
    : 0

  return (
    <section className="zx-card" style={{ padding: 'var(--zx-s5)', display: 'flex', flexDirection: 'column', gap: 'var(--zx-s4)' }}>
      <header className="zx-eyebrow-row">
        <span className="zx-eyebrow">Ahora en el hotel</span>
        <span className="zx-meta">Ocup. <strong style={{ color: 'var(--zx-ink-1)', fontVariantNumeric: 'tabular-nums' }}>{occupancy}%</strong></span>
      </header>

      {/* Staff activo */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--zx-s2)' }}>
        {liveNow.activeStaff.length > 0 ? (
          liveNow.activeStaff.slice(0, 4).map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--zx-s2)' }}>
              <span className="zx-live-dot" aria-label="Activa ahora" />
              <span style={{ fontSize: 'var(--zx-text-body)', color: 'var(--zx-ink-1)', fontWeight: 500 }}>
                {s.name}
              </span>
              <span className="zx-meta">· {roleLabel(s.role)}</span>
            </div>
          ))
        ) : (
          <p className="zx-meta">Sin actividad operativa en este momento.</p>
        )}
      </div>

      <hr className="zx-divider" />

      {/* Próximos eventos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--zx-s3)' }}>
        <NextEvent
          label="Próxima llegada"
          event={liveNow.nextArrival}
          emptyMsg="Sin llegadas inminentes"
        />
        <NextEvent
          label="Próxima salida"
          event={liveNow.nextDeparture}
          emptyMsg="Sin salidas próximas"
        />
      </div>
    </section>
  )
}

function NextEvent({
  label,
  event,
  emptyMsg,
}: {
  label: string
  event: DashboardSnapshot['liveNow']['nextArrival']
  emptyMsg: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--zx-s2)' }}>
      <span className="zx-meta">{label}</span>
      {event ? (
        <span style={{ fontSize: 'var(--zx-text-caption)', color: 'var(--zx-ink-1)', textAlign: 'right' }}>
          <strong style={{ fontWeight: 500 }}>{event.guestName}</strong>
          {event.roomNumber ? <span style={{ color: 'var(--zx-ink-3)' }}> · Hab. {event.roomNumber}</span> : null}
          <br />
          <span className="zx-meta">{timeRelative(event.scheduledIso)}</span>
        </span>
      ) : (
        <span className="zx-meta">{emptyMsg}</span>
      )}
    </div>
  )
}
