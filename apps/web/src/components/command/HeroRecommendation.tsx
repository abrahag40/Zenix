/**
 * HeroRecommendation — Zona 4. Rediseño steal-as-artist:
 * card tintada accent (indigo wash) + número de impacto grande +
 * CTA secundario quiet. Pattern Mews Coach + RoomRaccoon Smart Pricing.
 */
import { Sparkles, ArrowRight, CheckCircle2, TrendingUp, AlertTriangle, Info } from 'lucide-react'
import { useRecommendations, type Recommendation } from '@/hooks/useRecommendations'

const KIND_VISUAL: Record<Recommendation['kind'], { icon: typeof TrendingUp; iconFg: string; iconBg: string; tagBg: string; tagFg: string; tagLabel: string }> = {
  opportunity: {
    icon: TrendingUp,
    iconFg: 'oklch(0.40 0.13 152)', iconBg: 'oklch(0.92 0.05 152)',
    tagBg: 'oklch(0.95 0.05 152)', tagFg: 'oklch(0.32 0.10 152)',
    tagLabel: 'Oportunidad',
  },
  warning: {
    icon: AlertTriangle,
    iconFg: 'oklch(0.42 0.16 75)', iconBg: 'oklch(0.94 0.06 75)',
    tagBg: 'oklch(0.96 0.06 75)', tagFg: 'oklch(0.40 0.13 75)',
    tagLabel: 'Atención',
  },
  info: {
    icon: Info,
    iconFg: 'oklch(0.42 0.18 270)', iconBg: 'oklch(0.92 0.05 270)',
    tagBg: 'oklch(0.96 0.04 270)', tagFg: 'oklch(0.40 0.16 270)',
    tagLabel: 'Información',
  },
  positive: {
    icon: CheckCircle2,
    iconFg: 'oklch(0.40 0.13 152)', iconBg: 'oklch(0.92 0.05 152)',
    tagBg: 'oklch(0.95 0.05 152)', tagFg: 'oklch(0.32 0.10 152)',
    tagLabel: 'Buena señal',
  },
}

export function HeroRecommendation({ propertyId, isSupervisor }: { propertyId: string; isSupervisor: boolean }) {
  const { recommendations, isLoading } = useRecommendations(propertyId, isSupervisor)

  if (!isSupervisor) return null
  if (isLoading) {
    return (
      <section className="zx-card" style={{ padding: 24 }}>
        <p className="zx-meta">Analizando tu data…</p>
      </section>
    )
  }

  const [hero, ...rest] = recommendations

  if (!hero) {
    return (
      <section className="zx-card zx-card--positive" style={{ padding: 28, display: 'flex', gap: 20, alignItems: 'center' }}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 56, height: 56, borderRadius: 16,
            background: 'oklch(0.55 0.15 152 / 0.18)',
            color: 'oklch(0.42 0.14 152)',
          }}
        >
          <CheckCircle2 size={28} />
        </span>
        <div>
          <p className="zx-eyebrow" style={{ color: 'oklch(0.42 0.13 152)' }}>Todo bajo control</p>
          <h2 className="zx-display" style={{ marginTop: 4, color: 'oklch(0.28 0.10 152)' }}>
            Sin acciones urgentes hoy
          </h2>
          <p style={{ fontSize: 'var(--zx-text-body)', color: 'oklch(0.36 0.10 152)', marginTop: 6, lineHeight: 1.5 }}>
            Tu tarifa va alineada al mercado, la demanda se mantiene y no hay picos sin atender.
          </p>
        </div>
      </section>
    )
  }

  const visual = KIND_VISUAL[hero.kind]
  const HeroIcon = visual.icon

  return (
    <section
      className="zx-card zx-card--accent"
      style={{
        padding: 28,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 28,
        alignItems: 'center',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="zx-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--zx-accent)' }}>
            <Sparkles size={11} /> Tu siguiente mejor acción
          </span>
          <span
            style={{
              fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600,
              color: visual.tagFg, background: visual.tagBg,
              padding: '2px 8px', borderRadius: 999,
            }}
          >{visual.tagLabel}</span>
        </header>

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 48, height: 48, borderRadius: 14,
              background: visual.iconBg, color: visual.iconFg,
              flexShrink: 0,
            }}
          >
            <HeroIcon size={22} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="zx-display" style={{ margin: 0 }}>{hero.title}</h2>
            <p style={{ marginTop: 6, fontSize: 'var(--zx-text-body)', color: 'var(--zx-ink-2)', lineHeight: 1.55 }}>
              {hero.body}
            </p>
          </div>
        </div>

        {rest.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 12, borderTop: '1px solid var(--zx-line-subtle)' }}>
            <span className="zx-meta">También:</span>
            {rest.slice(0, 3).map((r) => {
              const v = KIND_VISUAL[r.kind]
              return (
                <span
                  key={r.id}
                  title={r.body}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', borderRadius: 999,
                    background: v.tagBg, color: v.tagFg,
                    fontSize: 12, fontWeight: 500, letterSpacing: '-0.005em',
                  }}
                >
                  {r.title}
                </span>
              )
            })}
          </div>
        )}
      </div>

      <button type="button" className="zx-action-primary" style={{ fontSize: 14, padding: '10px 18px' }}>
        Aplicar sugerencia <ArrowRight size={14} />
      </button>
    </section>
  )
}
