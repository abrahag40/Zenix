/**
 * HeroRecommendation — Command Center zona 4.
 *
 * 1 sola recomendación destacada como hero card full-width.
 * Pattern Linear "rationed accent": una sola acción primaria por screen.
 *
 * Si hay 0 recomendaciones → empty positivo "Todo bajo control".
 * Si hay 1+ recomendaciones → la PRIMERA es hero, las siguientes 2 son chips.
 *
 * Reusa `useRecommendations` ya existente — solo cambia el render.
 */
import { Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react'
import { useRecommendations, type Recommendation } from '@/hooks/useRecommendations'

const KIND_TONE: Record<Recommendation['kind'], { chip: string; icon: string }> = {
  opportunity: { chip: 'positive', icon: 'oklch(0.58 0.15 152)' },
  warning:     { chip: 'warn',     icon: 'oklch(0.72 0.16 75)' },
  info:        { chip: 'neutral',  icon: 'var(--zx-accent)' },
  positive:    { chip: 'positive', icon: 'oklch(0.58 0.15 152)' },
}

export function HeroRecommendation({ propertyId, isSupervisor }: { propertyId: string; isSupervisor: boolean }) {
  const { recommendations, isLoading } = useRecommendations(propertyId, isSupervisor)

  if (!isSupervisor) return null
  if (isLoading) {
    return (
      <section className="zx-card" style={{ padding: 'var(--zx-s5)' }}>
        <p className="zx-meta">Analizando datos para sugerencias…</p>
      </section>
    )
  }

  const [hero, ...rest] = recommendations

  if (!hero) {
    return (
      <section className="zx-card" style={{ padding: 'var(--zx-s6)', display: 'flex', alignItems: 'center', gap: 'var(--zx-s4)' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: 999,
            background: 'var(--zx-positive-soft)',
            color: 'var(--zx-positive)',
            flexShrink: 0,
          }}
        >
          <CheckCircle2 size={22} />
        </span>
        <div>
          <p style={{ fontSize: 'var(--zx-text-title)', fontWeight: 600, color: 'var(--zx-ink-1)', letterSpacing: '-0.01em', margin: 0 }}>
            Todo bajo control
          </p>
          <p style={{ marginTop: 4, fontSize: 'var(--zx-text-body)', color: 'var(--zx-ink-2)', lineHeight: 1.45 }}>
            No detectamos acciones urgentes. Tu tarifa está alineada al mercado, la demanda se mantiene y no hay picos sin atender.
          </p>
        </div>
      </section>
    )
  }

  const heroTone = KIND_TONE[hero.kind]

  return (
    <section className="zx-card" style={{ padding: 'var(--zx-s6)', display: 'flex', flexDirection: 'column', gap: 'var(--zx-s5)' }}>
      <header className="zx-eyebrow-row">
        <span className="zx-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 'var(--zx-s1)' }}>
          <Sparkles size={11} style={{ color: 'var(--zx-accent)' }} /> Tu siguiente mejor acción
        </span>
        <span className="zx-meta">{recommendations.length} {recommendations.length === 1 ? 'sugerencia' : 'sugerencias'}</span>
      </header>

      <div style={{ display: 'flex', gap: 'var(--zx-s4)', alignItems: 'flex-start' }}>
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: 12,
            background: hero.kind === 'warning' ? 'var(--zx-warn-soft)' : hero.kind === 'opportunity' ? 'var(--zx-positive-soft)' : 'var(--zx-accent-soft)',
            color: heroTone.icon,
            flexShrink: 0,
            fontWeight: 600,
            fontSize: 20,
          }}
        >
          {hero.kind === 'opportunity' ? '↗' : hero.kind === 'warning' ? '!' : '★'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 'var(--zx-text-title)', fontWeight: 600, color: 'var(--zx-ink-1)', letterSpacing: '-0.01em', margin: 0 }}>
            {hero.title}
          </h2>
          <p style={{ marginTop: 6, fontSize: 'var(--zx-text-body)', color: 'var(--zx-ink-2)', lineHeight: 1.5 }}>
            {hero.body}
          </p>
        </div>
      </div>

      {/* Acciones secundarias — chips quiet */}
      {rest.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--zx-s2)', borderTop: '1px solid var(--zx-line-subtle)', paddingTop: 'var(--zx-s4)' }}>
          <span className="zx-meta" style={{ marginRight: 'var(--zx-s2)' }}>También:</span>
          {rest.slice(0, 3).map((r) => (
            <span key={r.id} className={`zx-chip zx-chip--${KIND_TONE[r.kind].chip}`} title={r.body}>
              {r.title}
            </span>
          ))}
        </div>
      )}

      <button type="button" className="zx-action-primary" style={{ alignSelf: 'flex-start' }}>
        Aplicar sugerencia <ArrowRight size={14} />
      </button>
    </section>
  )
}
