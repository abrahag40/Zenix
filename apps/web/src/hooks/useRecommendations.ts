/**
 * useRecommendations — genera bullets de "qué hacer hoy" en lenguaje plano.
 *
 * Tier 2 del dashboard plain-language (gap UX detectado 2026-06-06):
 * el manager boutique LATAM no es revenue manager certificado, pero necesita
 * SABER QUÉ HACER. Esta heurística combina data ya existente (pickup, pace,
 * compset, daily-bar) y produce 0-6 bullets categorizados.
 *
 * Diseño:
 *   · Heurísticas simples (no IA, no LLM en v1.0) — auditables y predecibles
 *   · Cada bullet tiene `kind`, `icon` semántico, `title`, `body` plain-language
 *   · Si nada accionable → bullets vacíos → caller muestra empty state positivo
 *   · Orden de prioridad: opportunity > warning > info > positive
 *
 * Referencias usadas (todas datos ya autorizados al SUPERVISOR):
 *   - useDailyBar (mi BAR per noche)
 *   - useCompsetDashboard (rates de competencia)
 *   - usePickup (delta últimas 7d)
 *   - usePace (forward booking 28d para detectar peaks)
 */
import { useMemo } from 'react'
import { useDailyBar } from '@/modules/rooms/hooks/useRates'
import { useCompsetDashboard } from '@/hooks/useCompset'
import { usePickup, usePace } from '@/hooks/useMetrics'

export type RecommendationKind = 'opportunity' | 'warning' | 'info' | 'positive'

export interface Recommendation {
  id: string
  kind: RecommendationKind
  title: string
  body: string
  // Source data tag para debugging — qué señal disparó este bullet
  source: 'compset' | 'pickup' | 'pace' | 'forecast'
}

const SPANISH_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function formatDay(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${SPANISH_MONTHS[m - 1]}`
}
function formatMoney(n: number, ccy: string): string {
  return `${ccy} ${Math.round(n).toLocaleString()}`
}

export function useRecommendations(propertyId: string, enabled: boolean) {
  const { from, to } = useMemo(() => {
    const t = new Date(); t.setUTCHours(0, 0, 0, 0)
    return { from: t, to: new Date(t.getTime() + 14 * 86400000) }
  }, [])

  const dailyBar = useDailyBar(propertyId, from, to)
  const compset = useCompsetDashboard(propertyId, enabled)
  const pickup = usePickup(propertyId, 7, 14, enabled)
  const pace = usePace(propertyId, 28, enabled)

  const isLoading =
    enabled && (dailyBar.isLoading || compset.isLoading || pickup.isLoading || pace.isLoading)

  const recommendations = useMemo<Recommendation[]>(() => {
    if (!enabled) return []
    const recs: Recommendation[] = []

    // ── (1) Compset: noches específicas underpriced ≥15% vs mediana ────
    if (compset.data?.competitors?.length) {
      const myRateByDate = new Map<string, number>()
      for (const r of dailyBar.data ?? []) myRateByDate.set(r.date, r.bar)

      const isos = new Set<string>()
      for (const c of compset.data.competitors) {
        for (const k of Object.keys(c.ratesByDate ?? {})) isos.add(k)
      }
      const dates = Array.from(isos).sort().slice(0, 14)

      const underpriced: Array<{ iso: string; myRate: number; median: number; delta: number }> = []
      for (const iso of dates) {
        const myRate = myRateByDate.get(iso)
        const rates: number[] = []
        for (const c of compset.data.competitors) {
          const r = c.ratesByDate?.[iso]
          if (r && r.lowestRate != null) rates.push(r.lowestRate)
        }
        if (myRate == null || rates.length === 0) continue
        rates.sort((a, b) => a - b)
        const median = rates[Math.floor(rates.length / 2)]
        const deltaPct = ((myRate - median) / median) * 100
        if (deltaPct < -15) {
          underpriced.push({ iso, myRate, median, delta: deltaPct })
        }
      }

      if (underpriced.length > 0) {
        // Reportar la noche con MAYOR oportunidad (delta más negativo)
        underpriced.sort((a, b) => a.delta - b.delta)
        const top = underpriced[0]
        const ccy = compset.data.competitors[0]?.ratesByDate?.[top.iso]?.currency || 'USD'
        recs.push({
          id: `compset-cheap-${top.iso}`,
          kind: 'opportunity',
          source: 'compset',
          title: `Estás barato para el ${formatDay(top.iso)}`,
          body:
            `Tu tarifa ${formatMoney(top.myRate, ccy)} vs mercado ${formatMoney(top.median, ccy)} ` +
            `(${top.delta.toFixed(0)}%). Sube ${formatMoney((top.median - top.myRate) * 0.6, ccy)} para acercarte sin asustar demanda. ` +
            `${underpriced.length > 1 ? `Hay ${underpriced.length - 1} noches más en la misma situación.` : ''}`,
        })
      }
    }

    // ── (2) Pace: caída brusca de pickup vs hace 2 semanas ──────────────
    if (pickup.data?.series && pickup.data.series.length > 0) {
      const totals = pickup.data.series.reduce(
        (acc, r) => ({ rooms: acc.rooms + r.roomsPickup, revenue: acc.revenue + r.revenuePickup }),
        { rooms: 0, revenue: 0 },
      )
      if (totals.rooms < -3) {
        recs.push({
          id: 'pickup-drop',
          kind: 'warning',
          source: 'pickup',
          title: 'Demanda enfriándose',
          body:
            `Tuviste ${Math.abs(totals.rooms)} cancelaciones netas en los últimos 7 días (más cancels que altas). ` +
            `Revisa si fue un OTA específico, una fecha concreta, o un patrón. Considera promoción flash para fin de semana.`,
        })
      } else if (totals.rooms >= 5) {
        recs.push({
          id: 'pickup-strong',
          kind: 'positive',
          source: 'pickup',
          title: 'Demanda al alza',
          body:
            `Entraron ${totals.rooms} habitaciones netas en los últimos 7 días. ` +
            `Si esta tendencia sigue, considera subir tarifa BAR un 5-10% antes del próximo fin de semana.`,
        })
      }
    }

    // ── (3) Forecast peak — noche futura ≥85% con varios días para reaccionar ──
    if (pace.data?.series && pace.data.series.length > 0) {
      // Buscar pico entre 7-28 días en el futuro (suficiente lead time para acción)
      const upcoming = pace.data.series.filter((r) => {
        const d = new Date(r.stayDate)
        const today = new Date()
        const days = (d.getTime() - today.getTime()) / 86400000
        return days >= 7 && days <= 28
      })
      const peak = upcoming.reduce<typeof upcoming[0] | undefined>(
        (best, r) => (best == null || r.occupancyPercent > best.occupancyPercent ? r : best),
        undefined,
      )
      if (peak && peak.occupancyPercent >= 85) {
        recs.push({
          id: `forecast-peak-${peak.stayDate.slice(0, 10)}`,
          kind: 'opportunity',
          source: 'forecast',
          title: `Pico previsto: ${formatDay(peak.stayDate)}`,
          body:
            `${peak.occupancyPercent.toFixed(0)}% ya reservado. Es buen momento para subir tarifa o aplicar restricciones (min-stay 2 noches). ` +
            `Cada cuarto que vendas a precio bajo aquí es revenue perdido.`,
        })
      }
    }

    // ── (4) Forecast valle — semana sin reservas, varios días para reaccionar ──
    if (pace.data?.series && pace.data.series.length > 0) {
      // Identificar la semana 14-28 días adelante con peor ocupación
      const upcoming = pace.data.series.filter((r) => {
        const d = new Date(r.stayDate)
        const today = new Date()
        const days = (d.getTime() - today.getTime()) / 86400000
        return days >= 14 && days <= 28
      })
      if (upcoming.length >= 5) {
        const avgOcc = upcoming.reduce((s, r) => s + r.occupancyPercent, 0) / upcoming.length
        if (avgOcc < 30) {
          recs.push({
            id: 'forecast-valley',
            kind: 'warning',
            source: 'forecast',
            title: 'Próximas semanas flojas',
            body:
              `Las noches 14-28 días adelante están solo a ${avgOcc.toFixed(0)}% de reservas. ` +
              `Considera promoción direct: descuento 10-15% en booking engine, o relajar min-stay para captar últimas reservas.`,
          })
        }
      }
    }

    // Orden de prioridad: opportunity → warning → info → positive
    const priority: Record<RecommendationKind, number> = {
      opportunity: 0,
      warning: 1,
      info: 2,
      positive: 3,
    }
    recs.sort((a, b) => priority[a.kind] - priority[b.kind])

    return recs.slice(0, 6) // cap visual — más de 6 abruma
  }, [enabled, compset.data, dailyBar.data, pickup.data, pace.data])

  return { recommendations, isLoading }
}
