/**
 * HeroRecommendation — Zona 4 izq. Stepper carousel auto-rotativo.
 *
 * Iter 7 (2026-06-07) — owner feedback "tamaños no cuadran entre cards":
 *  · Typography unificada con InsightsFeed (verificado en navegador con
 *    preview_inspect): title 17px/1.3, body 12.5px/1.5, eyebrow 10px.
 *  · Padding outer 20px (paridad).
 *  · Height: `height: 100%` + dashboard grid `alignItems: stretch` → matchea
 *    altura exacta con InsightsFeed sin dead space (flex distribution interna).
 *  · Slot fijo en stepper controls + counter width:32px → cero shift on hover.
 *  · Sin chip "Pausado" que causaba reflow al hover.
 */
import { useState, useEffect, useRef } from 'react'
import { Sparkles, ArrowRight, CheckCircle2, TrendingUp, AlertTriangle, Info, ChevronLeft, ChevronRight } from 'lucide-react'
import { useRecommendations, type Recommendation } from '@/hooks/useRecommendations'

const KIND_VISUAL: Record<Recommendation['kind'], { icon: typeof TrendingUp; tagBg: string; tagFg: string; tagLabel: string }> = {
  opportunity: { icon: TrendingUp,    tagBg: 'oklch(0.95 0.05 152)', tagFg: 'oklch(0.32 0.10 152)', tagLabel: 'Oportunidad' },
  warning:     { icon: AlertTriangle, tagBg: 'oklch(0.96 0.06 75)',  tagFg: 'oklch(0.40 0.13 75)',  tagLabel: 'Atención' },
  info:        { icon: Info,          tagBg: 'oklch(0.96 0.04 270)', tagFg: 'oklch(0.40 0.16 270)', tagLabel: 'Información' },
  positive:    { icon: CheckCircle2,  tagBg: 'oklch(0.95 0.05 152)', tagFg: 'oklch(0.32 0.10 152)', tagLabel: 'Buena señal' },
}

const AUTO_ADVANCE_MS = 8000  // paridad con InsightsFeed (8s)

export function HeroRecommendation({ propertyId, isSupervisor }: { propertyId: string; isSupervisor: boolean }) {
  const { recommendations, isLoading } = useRecommendations(propertyId, isSupervisor)
  const [index, setIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const timerRef = useRef<number | null>(null)
  const total = recommendations.length

  useEffect(() => { if (index >= total && total > 0) setIndex(0) }, [total, index])
  useEffect(() => {
    if (total <= 1 || isPaused) return
    timerRef.current = window.setTimeout(() => setIndex((i) => (i + 1) % total), AUTO_ADVANCE_MS)
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current) }
  }, [index, total, isPaused])

  if (!isSupervisor) return null
  if (isLoading) {
    return (
      <section className="zx-card" style={{ padding: 20, height: '100%' }}>
        <p className="zx-meta">Analizando tu data…</p>
      </section>
    )
  }

  if (total === 0) {
    return (
      <section
        className="zx-card zx-card--positive"
        style={{ padding: 20, height: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <span className="zx-eyebrow" style={{ color: 'oklch(0.42 0.13 152)' }}>Todo bajo control</span>
        <h2 className="zx-display" style={{ margin: 0, fontSize: 17, lineHeight: 1.3, color: 'oklch(0.28 0.10 152)' }}>
          Sin acciones urgentes hoy
        </h2>
        <p style={{ margin: 0, fontSize: 12.5, color: 'oklch(0.36 0.10 152)', lineHeight: 1.5 }}>
          Tu tarifa va alineada al mercado, la demanda se mantiene y no hay picos sin atender.
        </p>
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
        padding: 20,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Header — slot fijo, sin "Pausado" chip que causa shift */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 24 }}>
        <span
          className="zx-eyebrow"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--zx-accent)' }}
        >
          <Sparkles size={11} /> Tu siguiente mejor acción
        </span>
        {total > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <StepperButton onClick={() => setIndex((i) => (i - 1 + total) % total)} aria-label="Anterior">
              <ChevronLeft size={13} />
            </StepperButton>
            <span style={{
              fontSize: 11, fontWeight: 500, color: 'var(--zx-ink-2)',
              width: 32, textAlign: 'center', fontVariantNumeric: 'tabular-nums',
            }}>{index + 1} / {total}</span>
            <StepperButton onClick={() => setIndex((i) => (i + 1) % total)} aria-label="Siguiente">
              <ChevronRight size={13} />
            </StepperButton>
          </div>
        )}
      </header>

      {/* Content — typography UNIFICADA con InsightsFeed */}
      <div
        key={current.id}
        style={{
          display: 'flex', flexDirection: 'column', gap: 10, flex: 1,
          animation: 'zx-fade-in var(--zx-dur-med) var(--zx-ease-spring)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600,
              color: visual.tagFg, background: visual.tagBg,
              padding: '3px 9px', borderRadius: 999,
            }}
          ><HeroIcon size={10} /> {visual.tagLabel}</span>
        </div>

        <h2
          className="zx-display"
          style={{
            margin: 0, fontSize: 17, lineHeight: 1.3, color: 'var(--zx-ink-1)',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}
        >{current.title}</h2>

        <p
          style={{
            margin: 0, fontSize: 12.5, color: 'var(--zx-ink-2)', lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}
        >{current.body}</p>

        <div style={{ marginTop: 'auto', paddingTop: 8 }}>
          <button type="button" className="zx-action-primary" style={{ fontSize: 13, padding: '8px 16px' }}>
            Aplicar sugerencia <ArrowRight size={12} />
          </button>
        </div>
      </div>

      {/* Stepper bottom — paridad con InsightsFeed */}
      {total > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <div style={{ height: 2, background: 'var(--zx-line-subtle)', position: 'relative', overflow: 'hidden', borderRadius: 999 }}>
            <div
              key={index + (isPaused ? '-pause' : '')}
              style={{
                position: 'absolute', top: 0, left: 0, height: '100%',
                background: 'var(--zx-accent)', width: '100%',
                transform: 'translateX(-100%)',
                animation: isPaused ? 'none' : `zx-step-progress ${AUTO_ADVANCE_MS}ms linear forwards`,
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 5 }}>
            {recommendations.map((_, i) => (
              <button
                key={i} type="button" onClick={() => setIndex(i)} aria-label={`Sugerencia ${i + 1}`}
                style={{
                  width: i === index ? 18 : 5, height: 5, borderRadius: 999,
                  background: i === index ? 'var(--zx-accent)' : 'var(--zx-line-strong)',
                  border: 'none', cursor: 'pointer', padding: 0,
                  transition: 'width var(--zx-dur-med) var(--zx-ease-spring), background var(--zx-dur-fast)',
                }}
              />
            ))}
          </div>
        </div>
      )}

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
      type="button" onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24, borderRadius: 6,
        background: 'var(--zx-surface)', border: '1px solid var(--zx-line)',
        color: 'var(--zx-ink-2)', cursor: 'pointer',
        transition: 'all var(--zx-dur-fast) var(--zx-ease-spring)',
      }}
      onMouseEnter={(e) => { ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--zx-line-strong)'; ;(e.currentTarget as HTMLElement).style.color = 'var(--zx-ink-1)' }}
      onMouseLeave={(e) => { ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--zx-line)'; ;(e.currentTarget as HTMLElement).style.color = 'var(--zx-ink-2)' }}
      {...rest}
    >{children}</button>
  )
}
