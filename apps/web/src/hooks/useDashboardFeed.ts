import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'

export interface DashboardFeedItem {
  id: string
  kind: 'news' | 'event' | 'report' | 'idea'
  title: string
  description: string
  source: string
  publishedAt: string
  href: string
  effectiveDate?: string
  score: number
}

export interface DashboardFeedResponse {
  items: DashboardFeedItem[]
  generatedAt: string
  language: 'es' | 'en' | 'pt'
}

/**
 * Resuelve el idioma del feed:
 *   1. localStorage 'zenix.locale' (si user lo cambió en settings — futuro i18n)
 *   2. navigator.language (browser/OS locale)
 *   3. Default 'es' (LATAM)
 * Solo 'es' | 'en' | 'pt' (los 3 soportados por Zenix).
 */
function resolveLang(): 'es' | 'en' | 'pt' {
  try {
    const stored = localStorage.getItem('zenix.locale')
    if (stored === 'es' || stored === 'en' || stored === 'pt') return stored
  } catch { /* ignore */ }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'es').toLowerCase().slice(0, 2)
  if (nav === 'en' || nav === 'pt') return nav
  return 'es'
}

/**
 * Hook para el InsightsFeed — algoritmo real (no parche).
 * Backend: FeedAggregatorService combina RSS hospitality + NewsData.io
 * + PredictHQ con scoring `sourceWeight × recencyDecay × geoMatch × topicMatch`.
 * Cache server-side 6h per property.
 */
export function useDashboardFeed(propertyId: string | null) {
  const lang = resolveLang()
  return useQuery<DashboardFeedResponse>({
    queryKey: ['dashboard-feed', propertyId, lang],
    queryFn: () => api.get(`/v1/dashboard/feed?propertyId=${propertyId}&lang=${lang}`),
    enabled: !!propertyId,
    staleTime: 5 * 60_000,         // 5 min cliente — el server ya tiene cache 6h
    refetchInterval: 30 * 60_000,  // re-pull cada 30 min
    retry: 1,
  })
}
