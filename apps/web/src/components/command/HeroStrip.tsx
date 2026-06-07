/**
 * HeroStrip — Command Center zona 1.
 *
 * Diseño: superficie oscura (zx-card--deep) que ancla el dashboard.
 * Pattern Linear/Arc: 1 elemento de alto contraste por pantalla = el ojo
 * sabe inmediatamente "esto es el comando central, todo lo demás es soporte".
 *
 * Contenido:
 *   · Saludo personalizado + fecha + hora local
 *   · 3 números grandes: llegadas / salidas / en casa
 *   · Sense of place: nombre del hotel + ciudad
 *
 * Apple HIG: System Status visibility + Sense of Place.
 */
import type { DashboardSnapshot } from '@/hooks/useDashboardSnapshot'
import { greeting, formatLongDate, formatClockHM, formatInteger } from './format'

export function HeroStrip({ hero }: { hero: DashboardSnapshot['hero'] }) {
  const now = new Date(hero.nowIso)
  const date = formatLongDate(hero.nowIso, hero.timezone)
  const clock = formatClockHM(hero.nowIso, hero.timezone)

  return (
    <section className="zx-card zx-card--deep" style={{ padding: 'var(--zx-s7) var(--zx-s7)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--zx-s5)' }}>
        {/* Saludo + reloj */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--zx-s4)' }}>
          <div>
            <h1
              style={{
                fontSize: 'var(--zx-text-hero)',
                fontWeight: 600,
                letterSpacing: '-0.02em',
                color: 'var(--zx-ink-on-deep)',
                lineHeight: 'var(--zx-leading-tight)',
                margin: 0,
              }}
            >
              {greeting(now)}, {hero.userName}
            </h1>
            <p
              style={{
                marginTop: 6,
                fontSize: 'var(--zx-text-body)',
                color: 'oklch(0.75 0.005 240)',
                letterSpacing: '-0.005em',
                textTransform: 'capitalize',
              }}
            >
              {date} · {hero.propertyName}
              {hero.propertyCity ? ` · ${hero.propertyCity}` : ''}
            </p>
          </div>
          <div
            style={{
              fontVariantNumeric: 'tabular-nums',
              fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, monospace',
              fontSize: 'var(--zx-text-display)',
              fontWeight: 500,
              color: 'var(--zx-ink-on-deep)',
              letterSpacing: '0.02em',
            }}
          >
            {clock}
          </div>
        </div>

        {/* 3 stats — los más importantes para la operación AHORA */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--zx-s5)' }}>
          <HeroStat
            value={hero.inHouseCount}
            label="huéspedes en casa"
            subline={`de ${hero.totalRooms} cuartos`}
          />
          <HeroStat
            value={hero.arrivalsCount}
            label={hero.arrivalsCount === 1 ? 'llegada hoy' : 'llegadas hoy'}
          />
          <HeroStat
            value={hero.departuresCount}
            label={hero.departuresCount === 1 ? 'salida hoy' : 'salidas hoy'}
          />
        </div>
      </div>
    </section>
  )
}

function HeroStat({ value, label, subline }: { value: number; label: string; subline?: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 36,
          fontWeight: 600,
          letterSpacing: '-0.03em',
          lineHeight: 1,
          color: 'var(--zx-ink-on-deep)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatInteger(value)}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 'var(--zx-text-caption)',
          color: 'oklch(0.70 0.005 240)',
          letterSpacing: 0,
        }}
      >
        {label}
        {subline ? <span style={{ color: 'oklch(0.55 0.005 240)' }}> · {subline}</span> : null}
      </div>
    </div>
  )
}
