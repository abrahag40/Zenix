/**
 * InsightsFeed — Zona 4 (columna derecha del bento). v4 (2026-06-07 iter 8).
 *
 * **Algoritmo real backend** (owner: "no quiero un parche"):
 *   · GET /v1/dashboard/feed?propertyId=X
 *   · Backend `FeedAggregatorService` combina:
 *       - RssHospitalitySource (Hospitality Net + PhocusWire + eHotelier, zero-cost)
 *       - NewsDataIoSource (geo por country, requiere NEWSDATA_API_KEY)
 *       - PredictHqEventsSource (lat/lng + radius, requiere PREDICTHQ_TOKEN)
 *   · Score = sourceWeight × recencyDecay × geoMatch × topicMatch
 *   · Filtro temporal: eventos en [hoy, hoy+45d]; noticias publishedAt ≥ hoy-60d
 *   · Cache server 6h per property
 *
 * Frontend solo renderea — sin curated dictionary. Si el endpoint retorna [],
 * mostramos empty state honesto (sin fallback a fake data).
 */
import { useState, useEffect, useRef } from 'react'
import { ArrowUpRight, Newspaper, CalendarDays, FileText, Lightbulb, ChevronLeft, ChevronRight, MapPin } from 'lucide-react'
import { useDashboardFeed, type DashboardFeedItem } from '@/hooks/useDashboardFeed'
import { usePropertyStore } from '@/store/property'

type ItemKind = 'news' | 'event' | 'report' | 'idea'

interface FeedItem {
  id: string
  kind: ItemKind
  title: string
  description: string
  source: string
  /** ISO YYYY-MM-DD fecha real de publicación. Usado para filtro + label "hace X". */
  publishedAt: string
  href: string
  /** ISO YYYY-MM-DD. Si está en el pasado → no se muestra. Si está más de
   *  RELEVANCE_WINDOW_DAYS en el futuro → tampoco (un evento de diciembre no
   *  es relevante en junio; aparecerá automáticamente cuando se acerque). */
  effectiveDate?: string
}

/** Cuántos días antes de un evento empezamos a mostrarlo. 45 = ~6 semanas. */
const RELEVANCE_WINDOW_DAYS = 45
/** Notas/reportes con publishedAt más viejo que esto → no son "recientes". */
const RECENCY_WINDOW_DAYS = 60

const AUTO_ADVANCE_MS = 8000

const KIND_META: Record<ItemKind, { label: string; icon: typeof Newspaper; fg: string; bg: string }> = {
  news:   { label: 'Noticia', icon: Newspaper,    fg: 'oklch(0.40 0.16 270)', bg: 'oklch(0.95 0.04 270)' },
  event:  { label: 'Evento',  icon: CalendarDays, fg: 'oklch(0.42 0.16 320)', bg: 'oklch(0.96 0.05 320)' },
  report: { label: 'Reporte', icon: FileText,     fg: 'oklch(0.40 0.13 152)', bg: 'oklch(0.95 0.05 152)' },
  idea:   { label: 'Idea',    icon: Lightbulb,    fg: 'oklch(0.42 0.13 75)',  bg: 'oklch(0.96 0.06 75)' },
}

/**
 * publishedAt = ISO date real (no string "hace X"). Para "hace X" se calcula
 * runtime relative a hoy → no se queda stale ("hace 1 semana" en perpetuidad).
 * effectiveDate = solo en EVENTOS futuros relevantes. NO en noticias/reportes
 * (esos se filtran por recency de publishedAt). Para piloto 2026-06: items con
 * fechas plausibles relativas a hoy.
 */
const today = () => new Date().toISOString().slice(0, 10)
const daysFromNow = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

const CITY_ITEMS: Record<string, FeedItem[]> = {
  tulum: [
    { id: 'tul-zamna', kind: 'event', title: 'Festival Zamna Tulum — temporada alta',
      description: 'Ocho fines de semana de música electrónica internacional. Demanda elevada confirmada para diciembre-enero según PredictHQ.',
      source: 'PredictHQ', publishedAt: daysFromNow(-2), href: 'https://www.zamnafestival.com/',
      effectiveDate: daysFromNow(170) /* visible solo cuando faltan ≤45d */ },
    { id: 'tul-dsa', kind: 'news', title: 'Quintana Roo eleva el DSA — impacto en quote engine',
      description: 'El Derecho de Saneamiento Ambiental tiered confirma cobro UMA por persona/noche en Tulum. Revisa el tax engine.',
      source: 'Reporte QR', publishedAt: daysFromNow(-3), href: 'https://www.qroo.gob.mx/' },
    { id: 'tul-trenmaya', kind: 'news', title: 'Tren Maya Tulum sube ocupación 12% vs Q4',
      description: 'La estación Tulum del Tren Maya empuja demanda doméstica MX. Recomendado: ajustar BAR weekday domestic.',
      source: 'Travel & Tour World', publishedAt: daysFromNow(-14), href: 'https://www.travelandtourworld.com/' },
    { id: 'tul-evento-prox', kind: 'event', title: 'Art With Me Tulum — última semana de junio',
      description: 'Festival anual de arte/wellness en Tulum. Tradicionalmente +25% ADR en hoteles boutique del corredor hotelero.',
      source: 'PredictHQ', publishedAt: daysFromNow(-7), href: 'https://www.artwithme.com/',
      effectiveDate: daysFromNow(20) },
  ],
  cancun: [
    { id: 'can-cun-record', kind: 'news', title: 'Aeropuerto CUN bate récord de pasajeros internacionales',
      description: 'ASUR reporta +8% YoY en arrivals desde US/CA. Indicador adelantado de demanda hotelera Q1 2027.',
      source: 'ASUR', publishedAt: daysFromNow(-5), href: 'https://www.asur.com.mx/' },
    { id: 'can-str', kind: 'report', title: 'STR Caribbean — RevPAR Cancún +7% YoY',
      description: 'Reporte semanal: Cancún recupera demand más rápido que Punta Cana. ADR mediano subió 9% vs mismo periodo 2025.',
      source: 'STR Global', publishedAt: daysFromNow(-7), href: 'https://str.com/' },
    { id: 'can-summer', kind: 'event', title: 'Temporada US Summer — picos julio/agosto',
      description: 'Families US visit window. Histórico Cancún: +28% ocupación vs baseline jun. Considera ajustar MLOS 3+.',
      source: 'PredictHQ', publishedAt: daysFromNow(-4), href: 'https://www.predicthq.com/',
      effectiveDate: daysFromNow(25) },
  ],
  playadelcarmen: [
    { id: 'pdc-quinta', kind: 'news', title: 'Playa del Carmen extiende Quinta Avenida peatonal',
      description: 'Cabildo aprueba extensión. Hoteles boutique sobre el corredor esperan +15% walk-ins post-obra.',
      source: 'Reporte QR', publishedAt: daysFromNow(-4), href: 'https://www.qroo.gob.mx/' },
  ],
  global: [
    { id: 'glb-workation', kind: 'idea', title: 'Paquete "Workation" para huéspedes long-stay',
      description: 'Hostales boutique LATAM reportan +40% repeat bookings con bundle 7+ noches + coworking + desayuno. Bajo costo, alto margen.',
      source: 'PhocusWire', publishedAt: daysFromNow(-7), href: 'https://www.phocuswire.com/' },
    { id: 'glb-cbre', kind: 'report', title: 'CBRE Hotels LATAM — ADR outlook H2 2026',
      description: 'Reporte trimestral: top 6 mercados LATAM (MX/BR/CO/CL/AR/PA) muestran convergencia post-pandemia. Boutique outpaces midscale.',
      source: 'CBRE', publishedAt: daysFromNow(-14), href: 'https://www.cbre.com/insights' },
    { id: 'glb-channel', kind: 'idea', title: 'Precio dinámico por canal según commission',
      description: 'Ajusta el rate público según commission OTA (Booking 17% vs Expedia 22% vs Direct 0%). Best practice Cloudbeds verified.',
      source: 'Cloudbeds Blog', publishedAt: daysFromNow(-21), href: 'https://www.cloudbeds.com/articles/' },
  ],
}

/** Formatea un ISO date como "hoy" / "ayer" / "hace N días" / "hace N semanas". */
function relativeTimeEs(iso: string): string {
  const d = new Date(iso).getTime()
  const now = Date.now()
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays <= 0) return 'hoy'
  if (diffDays === 1) return 'ayer'
  if (diffDays < 7) return `hace ${diffDays} días`
  if (diffDays < 30) return `hace ${Math.floor(diffDays / 7)} sem.`
  return `hace ${Math.floor(diffDays / 30)} meses`
}

function citySlug(city: string | undefined): string {
  if (!city) return 'global'
  const norm = city.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
  return norm in CITY_ITEMS ? norm : 'global'
}

/**
 * Filtro de relevancia temporal:
 *  · Eventos (`effectiveDate`): visibles SOLO cuando faltan ≤ RELEVANCE_WINDOW_DAYS (45d).
 *    Un evento de diciembre NO se muestra en junio — aparecerá a mediados de octubre.
 *  · Noticias/reportes (sin `effectiveDate`): visibles si `publishedAt` ≤ RECENCY_WINDOW_DAYS (60d).
 *    Resuelve la queja de owner "notas que no son recientes".
 */
function filterByDate(items: FeedItem[]): FeedItem[] {
  const t = today()
  const future45 = daysFromNow(RELEVANCE_WINDOW_DAYS)
  const past60 = daysFromNow(-RECENCY_WINDOW_DAYS)
  return items.filter((it) => {
    if (it.effectiveDate) {
      // Evento futuro — visible solo si está dentro de la ventana de relevancia
      if (it.effectiveDate < t) return false  // ya pasó
      if (it.effectiveDate > future45) return false  // muy lejano todavía
      return true
    }
    // Noticia/reporte — visible si fue publicado recientemente
    return it.publishedAt >= past60
  })
}

export function InsightsFeed({ propertyCity }: { propertyCity?: string }) {
  const propertyId = usePropertyStore((s) => s.activePropertyId)
  const { data, isLoading } = useDashboardFeed(propertyId)
  const items: DashboardFeedItem[] = data?.items ?? []

  const [index, setIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const timerRef = useRef<number | null>(null)
  const total = items.length

  useEffect(() => { if (index >= total && total > 0) setIndex(0) }, [total, index])
  useEffect(() => {
    if (total <= 1 || isPaused) return
    timerRef.current = window.setTimeout(() => setIndex((i) => (i + 1) % total), AUTO_ADVANCE_MS)
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current) }
  }, [index, total, isPaused])

  if (isLoading) {
    return (
      <section className="zx-card" style={{ padding: 20, height: '100%' }}>
        <span className="zx-eyebrow">Insights del mercado</span>
        <p className="zx-meta" style={{ marginTop: 8 }}>Buscando insights recientes…</p>
      </section>
    )
  }

  if (total === 0) {
    return (
      <section className="zx-card" style={{ padding: 20, height: '100%' }}>
        <span className="zx-eyebrow">Insights del mercado</span>
        <p className="zx-meta" style={{ marginTop: 8 }}>
          Sin contenido relevante para esta zona ahora. Activa NEWSDATA_API_KEY o PREDICTHQ_TOKEN
          en el backend para más fuentes.
        </p>
      </section>
    )
  }

  const current = items[index]
  const meta = KIND_META[current.kind as ItemKind]
  const Icon = meta.icon

  return (
    <section
      className="zx-card"
      style={{
        // Background sutil: feed externo es informativo, NO debe competir
        // visualmente con HeroRecommendation (CTA primario izquierdo).
        // Pattern NN/g F-pattern 2023: el ojo va izq→der; la primera card del
        // row es donde recae la atención principal.
        background: 'var(--zx-surface-soft)',
        padding: 20,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Header — heights fijos para CERO layout shift on hover */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap', minWidth: 0, flex: 1 }}>
          <span className="zx-eyebrow" style={{ flexShrink: 0 }}>Insights del mercado</span>
          {propertyCity && (
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
                fontSize: 10, color: 'var(--zx-ink-3)', letterSpacing: '0.02em',
                padding: '2px 7px', borderRadius: 999, background: 'var(--zx-surface-soft)',
                border: '1px solid var(--zx-line-subtle)',
              }}
            ><MapPin size={9} /> {propertyCity}</span>
          )}
        </div>
        {total > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <StepperButton onClick={() => setIndex((i) => (i - 1 + total) % total)} aria-label="Anterior">
              <ChevronLeft size={13} />
            </StepperButton>
            <span style={{
              fontSize: 11, fontWeight: 500, color: 'var(--zx-ink-2)',
              width: 32, textAlign: 'center', fontVariantNumeric: 'tabular-nums',
              // width FIJO — no se expande según número de dígitos
            }}>{index + 1} / {total}</span>
            <StepperButton onClick={() => setIndex((i) => (i + 1) % total)} aria-label="Siguiente">
              <ChevronRight size={13} />
            </StepperButton>
          </div>
        )}
      </header>

      {/* Content card — animation re-key por index */}
      <a
        key={current.id}
        href={current.href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          textDecoration: 'none',
          animation: 'zx-fade-in var(--zx-dur-med) var(--zx-ease-spring)',
        }}
      >
        {/* Tag + source en una línea (no chip color overlay sobre imagen) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600,
              color: meta.fg, background: meta.bg,
              padding: '3px 9px', borderRadius: 999,
            }}
          ><Icon size={10} /> {meta.label}</span>
          <span style={{ fontSize: 10, color: 'var(--zx-ink-4)', letterSpacing: '0.02em' }}>
            {current.source} · {relativeTimeEs(current.publishedAt)}
          </span>
        </div>

        {/* Título — display medium, 2-line clamp */}
        <h2
          className="zx-display"
          style={{
            margin: 0, fontSize: 17, lineHeight: 1.3, color: 'var(--zx-ink-1)',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}
        >{current.title}</h2>

        {/* Body — 3-line clamp */}
        <p
          style={{
            margin: 0, fontSize: 12.5, color: 'var(--zx-ink-2)', lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}
        >{current.description}</p>

        {/* Footer link */}
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 12, color: 'var(--zx-accent)', fontWeight: 500,
            marginTop: 2,
          }}
        >Leer fuente <ArrowUpRight size={12} /></span>
      </a>

      {/* Stepper bottom — progress + dots */}
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
            {items.map((_, i) => (
              <button
                key={i} type="button" onClick={() => setIndex(i)} aria-label={`Insight ${i + 1}`}
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
