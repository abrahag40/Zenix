/**
 * TodayRecommendations — Tier 2 del dashboard plain-language (2026-06-06).
 *
 * Card que se renderiza al TOP del dashboard con "qué hacer hoy" en lenguaje
 * accesible. Resuelve el gap detectado por el owner: "veo números pero no sé
 * qué hacer con ellos". Patrón Mews Coach + RoomRaccoon Smart Pricing.
 *
 * Reglas:
 *   · SUPERVISOR-only (caller gates)
 *   · Si hay 0 recomendaciones → muestra empty state positivo ("Todo bajo control hoy")
 *   · Si hay 1+ → ordena opportunity > warning > info > positive
 *   · Cada bullet con icon semántico + título + body 1-2 oraciones
 *
 * Justificación NN/g 2017 "Dashboards Made Useful" — la card de
 * recomendaciones es la sección más usada en el dashboard Mews/RoomRaccoon.
 */
import { Sparkles, TrendingUp, AlertTriangle, Info, CheckCircle2 } from 'lucide-react'
import { useRecommendations, type RecommendationKind } from '@/hooks/useRecommendations'

const ICON_BY_KIND = {
  opportunity: TrendingUp,
  warning: AlertTriangle,
  info: Info,
  positive: CheckCircle2,
}

const TONE_BY_KIND: Record<RecommendationKind, { bg: string; text: string; border: string; iconBg: string }> = {
  opportunity: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-900',
    border: 'border-emerald-200',
    iconBg: 'bg-emerald-100 text-emerald-700',
  },
  warning: {
    bg: 'bg-amber-50',
    text: 'text-amber-900',
    border: 'border-amber-200',
    iconBg: 'bg-amber-100 text-amber-700',
  },
  info: {
    bg: 'bg-sky-50',
    text: 'text-sky-900',
    border: 'border-sky-200',
    iconBg: 'bg-sky-100 text-sky-700',
  },
  positive: {
    bg: 'bg-slate-50',
    text: 'text-slate-800',
    border: 'border-slate-200',
    iconBg: 'bg-slate-100 text-slate-700',
  },
}

export function TodayRecommendations({
  propertyId,
  isSupervisor,
}: {
  propertyId: string
  isSupervisor: boolean
}) {
  const { recommendations, isLoading } = useRecommendations(propertyId, isSupervisor)

  if (!isSupervisor) return null
  if (isLoading) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 min-h-[280px] flex flex-col">
        <header className="flex items-baseline justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-gray-800 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-indigo-600" /> Hoy te recomiendo
          </h2>
        </header>
        <p className="text-[12px] text-gray-400">Analizando datos para sugerencias…</p>
      </section>
    )
  }

  // Patrón canónico unificado con FxRate + Overstayed.
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 min-h-[280px] flex flex-col">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-gray-800 flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-indigo-600" /> Hoy te recomiendo
        </h2>
        <span className="text-[11px] text-gray-400 tabular-nums">
          {recommendations.length} {recommendations.length === 1 ? 'acción' : 'acciones'}
        </span>
      </header>

      {recommendations.length === 0 ? (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3 flex-1">
          <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[13px] font-medium text-emerald-900">Todo bajo control</p>
            <p className="text-[12px] text-emerald-800 leading-relaxed mt-0.5">
              No detectamos acciones urgentes. Tu tarifa está alineada al mercado, la demanda se
              mantiene y no hay picos sin atender. Revisa de nuevo en unas horas.
            </p>
          </div>
        </div>
      ) : (
        // Patrón canónico unificado: card cap altura ~360px (header + 280px contenido).
        // overflow-y-auto cuando hay 4-6 bullets — alineado con Apple HIG Layout
        // Visual Balance del row top.
        <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1 flex-1">
          {recommendations.map((rec) => {
            const Icon = ICON_BY_KIND[rec.kind]
            const tone = TONE_BY_KIND[rec.kind]
            return (
              <div
                key={rec.id}
                className={`rounded-lg ${tone.bg} border ${tone.border} p-3 flex items-start gap-3`}
              >
                <span
                  className={`inline-flex items-center justify-center h-7 w-7 rounded-full ${tone.iconBg} flex-shrink-0`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${tone.text}`}>{rec.title}</p>
                  <p className={`text-[12px] ${tone.text} leading-relaxed mt-0.5 opacity-90`}>{rec.body}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="mt-auto text-[10px] text-gray-400 italic">
        Señales para decidir más rápido — no reemplazan tu criterio comercial.
      </p>
    </section>
  )
}
