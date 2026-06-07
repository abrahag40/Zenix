/**
 * HeroRecommendation — Zona 4. Stepper carousel auto-rotativo.
 *
 * Owner 2026-06-07 iter 4: agregar stepper que recorra recomendaciones
 * como datos informativos. Pattern Linear changelog + Stripe insights:
 *   · 1 card visible a la vez
 *   · Auto-advance cada 7s
 *   · Pause on hover (NN/g UX)
 *   · Dots indicators + prev/next manuales
 *   · Transición sutil opacity + slide
 */
import { useState, useEffect, useRef } from 'react'
import { Sparkles, ArrowRight, CheckCircle2, TrendingUp, AlertTriangle, Info, ChevronLeft, ChevronRight, Pause } from 'lucide-react'
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

const AUTO_ADVANCE_MS = 7000

export function HeroRecommendation({ propertyId, isSupervisor }: { propertyId: string; isSupervisor: boolean }) {
  const { recommendations, isLoading } = useRecommendations(propertyId, isSupervisor)
  const [index, setIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const timerRef = useRef<number | null>(null)
  const total = recommendations.length

  // Reset index si la lista cambia tamaño
  useEffect(() => {
    if (index >= total && total > 0) setIndex(0)
  }, [total, index])

  // Auto-advance
  useEffect(() => {
    if (total <= 1 || isPaused) return
    timerRef.current = window.setTimeout(() => {
      setIndex((i) => (i + 1) % total)
    }, AUTO_ADVANCE_MS)
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [index, total, isPaused])

  if (!isSupervisor) return null
  if (isLoading) {
    return (
      <section className="zx-card" style={{ padding: 24 }}>
        <p className="zx-meta">Analizando tu data…</p>
      </section>
    )
  }

  if (total === 0) {
    return (
      <section className="zx-card zx-card--positive" style={{ padding: 28, display: 'flex', gap: 20, alignItems: 'center' }}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 56, height: 56, borderRadius: 16,
            background: 'oklch(0.55 0.15 152 / 0.18)',
            color: 'oklch(0.42 0.14 152)',
            flexShrink: 0,
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

  const current = recommendations[index]
  const visual = KIND_VISUAL[current.kind]
  const HeroIcon = visual.icon

  return (
    <section
      className="zx-card zx-card--accent"
      style={{
        padding: 0,
        overflow: 'hidden',
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Header sticky con stepper controls */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '20px 28px 0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            className="zx-eyebrow"
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--zx-accent)' }}
          >
            <Sparkles size={11} /> Tu siguiente mejor acción
          </span>
          <span
            style={{
              fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600,
              color: visual.tagFg, background: visual.tagBg,
              padding: '2px 8px', borderRadius: 999,
            }}
          >{visual.tagLabel}</span>
        </div>

        {total > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isPaused && (
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 10, color: 'var(--zx-ink-3)', letterSpacing: '0.02em',
                }}
              >
                <Pause size={10} /> Pausado
              </span>
            )}
            <StepperButton onClick={() => setIndex((i) => (i - 1 + total) % total)} aria-label="Anterior">
              <ChevronLeft size={14} />
            </StepperButton>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--zx-ink-2)', minWidth: 32, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
              {index + 1} / {total}
            </span>
            <StepperButton onClick={() => setIndex((i) => (i + 1) % total)} aria-label="Siguiente">
              <ChevronRight size={14} />
            </StepperButton>
          </div>
        )}
      </header>

      {/* Content card */}
      <div
        key={current.id}
        style={{
          padding: '20px 28px 24px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          gap: 28,
          alignItems: 'center',
          animation: 'zx-fade-in var(--zx-dur-med) var(--zx-ease-spring)',
        }}
      >
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
            <h2 className="zx-display" style={{ margin: 0 }}>{current.title}</h2>
            <p style={{ marginTop: 6, fontSize: 'var(--zx-text-body)', color: 'var(--zx-ink-2)', lineHeight: 1.55 }}>
              {current.body}
            </p>
          </div>
        </div>

        <button type="button" className="zx-action-primary" style={{ fontSize: 14, padding: '10px 18px' }}>
          Aplicar sugerencia <ArrowRight size={14} />
        </button>
      </div>

      {/* Dots indicators + progress bar */}
      {total > 1 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            background: 'var(--zx-surface)',
            borderTop: '1px solid var(--zx-line-subtle)',
          }}
        >
          {/* Auto-advance progress bar */}
          <div style={{ height: 2, background: 'var(--zx-line-subtle)', position: 'relative', overflow: 'hidden' }}>
            <div
              key={index + (isPaused ? '-pause' : '')}
              style={{
                position: 'absolute', top: 0, left: 0, height: '100%',
                background: 'var(--zx-accent)',
                width: '100%',
                transform: 'translateX(-100%)',
                animation: isPaused ? 'none' : `zx-step-progress ${AUTO_ADVANCE_MS}ms linear forwards`,
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '12px 0' }}>
            {recommendations.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Sugerencia ${i + 1}`}
                style={{
                  width: i === index ? 24 : 6,
                  height: 6,
                  borderRadius: 999,
                  background: i === index ? 'var(--zx-accent)' : 'var(--zx-line-strong)',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'width var(--zx-dur-med) var(--zx-ease-spring), background var(--zx-dur-fast)',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* keyframes locales via <style> tag para fade+stepper sin tocar global */}
      <style>{`
        @keyframes zx-fade-in {
          from { opacity: 0.4; transform: translateY(4px); }
          to   { opacity: 1;   transform: translateY(0); }
        }
        @keyframes zx-step-progress {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0%); }
        }
      `}</style>
    </section>
  )
}

function StepperButton({ children, onClick, ...rest }: { children: React.ReactNode; onClick: () => void } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 8,
        background: 'var(--zx-surface)',
        border: '1px solid var(--zx-line)',
        color: 'var(--zx-ink-2)',
        cursor: 'pointer',
        transition: 'all var(--zx-dur-fast) var(--zx-ease-spring)',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--zx-line-strong)'
        ;(e.currentTarget as HTMLElement).style.color = 'var(--zx-ink-1)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--zx-line)'
        ;(e.currentTarget as HTMLElement).style.color = 'var(--zx-ink-2)'
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
