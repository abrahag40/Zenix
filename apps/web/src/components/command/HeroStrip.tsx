/**
 * HeroStrip — Zona 1 del Command Center.
 *
 * Pattern Linear "midnight command deck": superficie deep con
 * radial gradients sutiles (warm violet + cool teal), un único hero
 * por screen, jerarquía tipográfica Display + tabular numbers.
 *
 * Composition: greeting big + property city chip + reloj mono.
 * Bottom strip: 3 KPIs con icon + número grande + label + microbar.
 */
import type { DashboardSnapshot } from '@/hooks/useDashboardSnapshot'
import { greeting, formatLongDate, formatClockHM, formatInteger } from './format'
import { ArrowDownRight, ArrowUpRight, BedDouble } from 'lucide-react'

export function HeroStrip({ hero }: { hero: DashboardSnapshot['hero'] }) {
  const now = new Date(hero.nowIso)
  const date = formatLongDate(hero.nowIso, hero.timezone)
  const clock = formatClockHM(hero.nowIso, hero.timezone)
  const occupancy = hero.totalRooms > 0 ? Math.round((hero.inHouseCount / hero.totalRooms) * 100) : 0

  return (
    <section
      className="zx-card zx-card--deep"
      style={{
        padding: '36px 40px 32px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top row: greeting + location chip + reloj */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {hero.propertyCity && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: 'oklch(1 0 0 / 0.06)',
                  border: '1px solid oklch(1 0 0 / 0.10)',
                  fontSize: 11,
                  letterSpacing: '0.04em',
                  color: 'oklch(0.85 0.01 240)',
                  textTransform: 'uppercase',
                  fontWeight: 500,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 999, background: 'oklch(0.78 0.18 152)', boxShadow: '0 0 8px oklch(0.78 0.18 152 / 0.6)' }} />
                {hero.propertyName} · {hero.propertyCity}
              </span>
            </div>
          )}
          <h1
            style={{
              fontSize: 'var(--zx-text-display-l)',
              fontWeight: 600,
              letterSpacing: '-0.03em',
              color: 'var(--zx-ink-on-deep)',
              lineHeight: 1.05,
              margin: 0,
            }}
          >
            {greeting(now)}, {hero.userName}
          </h1>
          <p
            style={{
              marginTop: 4,
              fontSize: 'var(--zx-text-body)',
              color: 'oklch(0.72 0.005 240)',
              textTransform: 'capitalize',
              letterSpacing: '-0.005em',
            }}
          >
            {date}
          </p>
        </div>

        {/* Reloj grande, mono */}
        <div
          style={{
            fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, monospace',
            fontSize: 32,
            fontWeight: 500,
            color: 'var(--zx-ink-on-deep)',
            letterSpacing: '0.04em',
            fontVariantNumeric: 'tabular-nums',
            background: 'oklch(1 0 0 / 0.04)',
            padding: '8px 16px',
            borderRadius: 12,
            border: '1px solid oklch(1 0 0 / 0.08)',
          }}
        >
          {clock}
        </div>
      </div>

      {/* Bottom — 3 stat blocks con personality */}
      <div
        style={{
          marginTop: 32,
          paddingTop: 24,
          borderTop: '1px solid oklch(1 0 0 / 0.08)',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 32,
        }}
      >
        <HeroStatBlock
          icon={<BedDouble size={16} />}
          value={hero.inHouseCount}
          label="huéspedes en casa"
          progressPct={occupancy}
          subline={`${occupancy}% ocupación · ${hero.totalRooms} cuartos`}
        />
        <HeroStatBlock
          icon={<ArrowDownRight size={16} />}
          value={hero.arrivalsCount}
          label={hero.arrivalsCount === 1 ? 'llegada esperada hoy' : 'llegadas esperadas hoy'}
          tint="emerald"
        />
        <HeroStatBlock
          icon={<ArrowUpRight size={16} />}
          value={hero.departuresCount}
          label={hero.departuresCount === 1 ? 'salida pendiente hoy' : 'salidas pendientes hoy'}
          tint="amber"
        />
      </div>
    </section>
  )
}

function HeroStatBlock({
  icon,
  value,
  label,
  progressPct,
  subline,
  tint,
}: {
  icon: React.ReactNode
  value: number
  label: string
  progressPct?: number
  subline?: string
  tint?: 'emerald' | 'amber'
}) {
  const iconBg = tint === 'emerald' ? 'oklch(0.55 0.16 152 / 0.18)'
    : tint === 'amber' ? 'oklch(0.68 0.17 75 / 0.20)'
    : 'oklch(1 0 0 / 0.08)'
  const iconColor = tint === 'emerald' ? 'oklch(0.78 0.18 152)'
    : tint === 'amber' ? 'oklch(0.82 0.18 78)'
    : 'oklch(0.85 0.01 240)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 8,
            background: iconBg,
            color: iconColor,
          }}
        >
          {icon}
        </span>
        <span
          style={{
            fontSize: 11,
            letterSpacing: '0.04em',
            color: 'oklch(0.70 0.005 240)',
            textTransform: 'uppercase',
            fontWeight: 500,
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span
          style={{
            fontSize: 'var(--zx-text-display-l)',
            fontWeight: 600,
            letterSpacing: '-0.035em',
            color: 'var(--zx-ink-on-deep)',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatInteger(value)}
        </span>
      </div>
      {progressPct != null && (
        <div className="zx-progress" style={{ background: 'oklch(1 0 0 / 0.10)', height: 5 }}>
          <div
            className="zx-progress__fill"
            style={{
              width: `${Math.min(100, progressPct)}%`,
              background: 'linear-gradient(90deg, oklch(0.75 0.18 152), oklch(0.82 0.18 180))',
            }}
          />
        </div>
      )}
      {subline && (
        <p style={{ fontSize: 11, color: 'oklch(0.62 0.005 240)', letterSpacing: 0 }}>{subline}</p>
      )}
    </div>
  )
}
