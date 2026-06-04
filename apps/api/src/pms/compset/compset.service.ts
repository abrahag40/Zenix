import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { StubCompsetAdapter } from './stub-compset.adapter'
import type { HotelSearchResult, ICompsetAdapter } from './compset-adapter.interface'

const MAX_COMPETITORS_PER_PROPERTY = 7
const MIN_COMPETITORS_HINT = 3 // soft hint UI; backend permite 1+

/**
 * CompsetService — Fase 3 RATES-METRICS-COMPSET (D-COMPSET1..7).
 *
 * Reglas no-negociables aplicadas:
 *   · D-COMPSET2: max 7 hoteles por property (boutique compite por posicionamiento,
 *     no por proximidad — no auto-radius en MVP).
 *   · D-COMPSET4: CompsetSnapshot es APPEND-ONLY. Nunca update — re-correr scrape
 *     crea row nueva. Histórico permite trend analysis.
 *   · D-COMPSET6: visibility RBAC ya está aplicada en el controller (SUPERVISOR+).
 *     Aquí asumimos que el caller ya validó el rol.
 *   · D-COMPSET7: el dashboard card adjunta `disclaimer` permanente — caller
 *     responsable de mostrarlo (la UI ya tiene el copy estándar).
 */
@Injectable()
export class CompsetService {
  private readonly logger = new Logger(CompsetService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly stubAdapter: StubCompsetAdapter,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Adapter resolution
  // ──────────────────────────────────────────────────────────────────

  /**
   * Resuelve el adapter para una property vía `LegalEntity.compsetProvider`.
   * Chunk 1: siempre StubCompsetAdapter mientras Playwright se construye.
   * Chunk 2: switch real entre ScraperDiy / Lighthouse / Rategain.
   */
  async getAdapterForProperty(propertyId: string): Promise<ICompsetAdapter> {
    const prop = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { legalEntity: { select: { compsetProvider: true } } },
    })
    if (!prop) throw new NotFoundException(`Property ${propertyId} not found`)
    const provider = prop.legalEntity?.compsetProvider ?? 'SCRAPER_DIY'
    // Chunk 1: todo cae al stub. Chunk 2 ramifica.
    switch (provider) {
      case 'SCRAPER_DIY':
      case 'LIGHTHOUSE':
      case 'RATEGAIN':
      default:
        return this.stubAdapter
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Competitor CRUD (D-COMPSET2: max 7, manual pin)
  // ──────────────────────────────────────────────────────────────────

  async listCompetitors(propertyId: string) {
    return this.prisma.competitor.findMany({
      where: { propertyId, isActive: true },
      orderBy: { createdAt: 'asc' },
    })
  }

  async addCompetitor(propertyId: string, addedById: string, input: AddCompetitorInput) {
    const activeCount = await this.prisma.competitor.count({ where: { propertyId, isActive: true } })
    if (activeCount >= MAX_COMPETITORS_PER_PROPERTY) {
      throw new BadRequestException(
        `Compset llegó al máximo (${MAX_COMPETITORS_PER_PROPERTY}). Desactiva uno antes de agregar otro.`,
      )
    }
    if (!input.name?.trim()) throw new BadRequestException('Nombre del competidor es requerido.')
    return this.prisma.competitor.create({
      data: {
        propertyId,
        addedById,
        name: input.name.trim(),
        externalId: input.externalId ?? null,
        externalSource: input.externalSource ?? null,
        externalUrl: input.externalUrl ?? null,
        latitude: input.latitude,
        longitude: input.longitude,
        address: input.address ?? null,
        starRating: input.starRating ?? null,
        guestRating: input.guestRating ?? null,
        reviewCount: input.reviewCount ?? null,
        roomCount: input.roomCount ?? null,
      },
    })
  }

  async deactivateCompetitor(propertyId: string, competitorId: string) {
    const c = await this.prisma.competitor.findUnique({ where: { id: competitorId } })
    if (!c || c.propertyId !== propertyId) throw new NotFoundException(`Competitor ${competitorId} not found`)
    return this.prisma.competitor.update({ where: { id: competitorId }, data: { isActive: false } })
  }

  // ──────────────────────────────────────────────────────────────────
  // Hotel search (via adapter — Google Places / Booking Affiliate)
  // ──────────────────────────────────────────────────────────────────

  async searchHotel(propertyId: string, query: string, near?: { lat: number; lng: number }): Promise<HotelSearchResult[]> {
    if (!query?.trim()) return []
    const adapter = await this.getAdapterForProperty(propertyId)
    return adapter.searchHotel(query.trim(), near)
  }

  // ──────────────────────────────────────────────────────────────────
  // Refresh snapshots (cron-friendly + manual)
  // ──────────────────────────────────────────────────────────────────

  /**
   * Trae rates de cada competidor activo y persiste 1 CompsetSnapshot per uno.
   * Fail-soft per competidor (D-COMPSET3): si 1 falla, los demás continúan.
   */
  async refreshSnapshots(propertyId: string, horizonDays = 30): Promise<{ ok: number; failed: number }> {
    const competitors = await this.listCompetitors(propertyId)
    if (competitors.length === 0) return { ok: 0, failed: 0 }
    const adapter = await this.getAdapterForProperty(propertyId)
    const from = startOfUtcDay(new Date())
    const to = new Date(from.getTime() + horizonDays * 86400000)

    let ok = 0
    let failed = 0
    for (const c of competitors) {
      try {
        const result = await adapter.fetchRates({
          competitorId: c.id,
          externalId: c.externalId,
          externalSource: c.externalSource,
          externalUrl: c.externalUrl,
          fromDate: from,
          toDate: to,
        })
        await this.prisma.compsetSnapshot.create({
          data: {
            competitorId: c.id,
            propertyId,
            source: adapter.source,
            ratesByDate: result.ratesByDate as any,
            ratingSnapshot: (result.ratingSnapshot ?? undefined) as any,
            durationMs: result.durationMs,
            warnings: result.warnings,
          },
        })
        ok += 1
      } catch (err) {
        failed += 1
        this.logger.error(
          `[Compset] refresh failed competitor=${c.id} property=${propertyId}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
    return { ok, failed }
  }

  // ──────────────────────────────────────────────────────────────────
  // Manual rate entry — alternativa legalmente segura al scraping OTA.
  // El supervisor captura los rates observados manualmente (e.g. lunes 9am
  // revisando Booking.com + STAR Report semanal STR). Misma forma que un
  // CompsetSnapshot de scraping → downstream pipeline funciona idéntico.
  // ──────────────────────────────────────────────────────────────────

  /**
   * Bulk-submit de rates manuales. Crea 1 CompsetSnapshot por competidor con
   * source='MANUAL'. Ignora silenciosamente entries con `ratesByDate` vacío.
   */
  async submitManualSnapshot(
    propertyId: string,
    entries: ManualSnapshotEntry[],
  ): Promise<{ created: number; skipped: number }> {
    if (entries.length === 0) return { created: 0, skipped: 0 }
    const competitorIds = entries.map((e) => e.competitorId)
    // Verifica que TODOS los competitorId pertenezcan a esta property — defense
    // contra IDOR cross-property en el bulk.
    const competitors = await this.prisma.competitor.findMany({
      where: { id: { in: competitorIds }, propertyId },
      select: { id: true },
    })
    const valid = new Set(competitors.map((c) => c.id))
    let created = 0
    let skipped = 0
    for (const e of entries) {
      if (!valid.has(e.competitorId)) {
        skipped += 1
        continue
      }
      const filtered = Object.fromEntries(
        Object.entries(e.ratesByDate).filter(([_, v]) => v != null && Number(v.lowestRate) >= 0),
      )
      if (Object.keys(filtered).length === 0) {
        skipped += 1
        continue
      }
      await this.prisma.compsetSnapshot.create({
        data: {
          competitorId: e.competitorId,
          propertyId,
          source: 'MANUAL',
          ratesByDate: filtered as any,
          ratingSnapshot: undefined as any,
          durationMs: 0,
          warnings: [],
        },
      })
      created += 1
    }
    return { created, skipped }
  }

  // ──────────────────────────────────────────────────────────────────
  // Dashboard card data
  // ──────────────────────────────────────────────────────────────────

  /**
   * Card data para el dashboard. Trae el snapshot más reciente per competidor y
   * lo proyecta como matrix `[competitor × date]` para que la UI haga heatmap +
   * mi-rate-vs-mediana.
   */
  async getDashboardCard(propertyId: string, horizonDays = 14): Promise<CompsetDashboardCard> {
    const competitors = await this.listCompetitors(propertyId)
    if (competitors.length === 0) {
      return {
        propertyId,
        competitors: [],
        latestSnapshotAt: null,
        horizonDays,
        disclaimer: 'Sin compset configurado. Agrega 3-7 competidores en Settings → Compset.',
      }
    }

    const latestSnapshots = await Promise.all(
      competitors.map((c) =>
        this.prisma.compsetSnapshot.findFirst({
          where: { competitorId: c.id },
          orderBy: { scrapedAt: 'desc' },
        }),
      ),
    )

    const enriched: CompsetCompetitorCard[] = competitors.map((c, i) => {
      const snap = latestSnapshots[i]
      return {
        id: c.id,
        name: c.name,
        starRating: c.starRating ? Number(c.starRating) : null,
        guestRating: c.guestRating ? Number(c.guestRating) : null,
        roomCount: c.roomCount,
        latestScrapeAt: snap?.scrapedAt ?? null,
        source: snap?.source ?? null,
        ratesByDate: (snap?.ratesByDate as Record<string, { lowestRate: number | null; currency: string; availability: boolean } | null>) ?? {},
        warnings: snap?.warnings ?? [],
      }
    })
    const latestSnapshotAt = enriched.map((e) => e.latestScrapeAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null

    return {
      propertyId,
      competitors: enriched,
      latestSnapshotAt,
      horizonDays,
      disclaimer: 'Datos best-effort, refresh diario. Precios públicos. ' +
        (latestSnapshotAt ? `Última actualización: ${humanizeAgo(latestSnapshotAt)}.` : 'Sin captura aún.'),
    }
  }
}

export interface AddCompetitorInput {
  name: string
  externalId?: string | null
  externalSource?: string | null
  externalUrl?: string | null
  latitude: number
  longitude: number
  address?: string | null
  starRating?: number | null
  guestRating?: number | null
  reviewCount?: number | null
  roomCount?: number | null
}

export interface ManualSnapshotEntry {
  competitorId: string
  /** Map ISO "YYYY-MM-DD" → { lowestRate, currency, availability }. */
  ratesByDate: Record<string, { lowestRate: number; currency: string; availability: boolean }>
}

export interface CompsetCompetitorCard {
  id: string
  name: string
  starRating: number | null
  guestRating: number | null
  roomCount: number | null
  latestScrapeAt: Date | null
  source: string | null
  ratesByDate: Record<string, { lowestRate: number | null; currency: string; availability: boolean } | null>
  warnings: string[]
}
export interface CompsetDashboardCard {
  propertyId: string
  competitors: CompsetCompetitorCard[]
  latestSnapshotAt: Date | null
  horizonDays: number
  disclaimer: string
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0))
}
function humanizeAgo(d: Date): string {
  const diff = Date.now() - d.getTime()
  const hours = Math.round(diff / 3600000)
  if (hours < 1) return 'hace minutos'
  if (hours < 24) return `hace ${hours}h`
  const days = Math.round(hours / 24)
  return `hace ${days}d`
}
