import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../../prisma/prisma.service'
import { CompsetService } from './compset.service'

/**
 * CompsetRefreshScheduler — Fase 3 chunk 2 (D-COMPSET3).
 *
 * Cron diario 04:00 UTC. Para cada property con ≥1 competidor activo, dispara
 * `CompsetService.refreshSnapshots` que es fail-soft per competidor (1 hotel
 * caído no bloquea los demás).
 *
 * **Adapter usado hoy:** StubCompsetAdapter (chunk 1) — produce datos sintéticos
 * deterministas. El swap a `ScraperDiyCompsetAdapter` Playwright vive en chunk 3
 * por riesgo legal del scraping (D-COMPSET5 requiere user-agent declarado,
 * robots.txt respect, rate limit estricto, no rotating proxies).
 */
@Injectable()
export class CompsetRefreshScheduler {
  private readonly logger = new Logger(CompsetRefreshScheduler.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly compset: CompsetService,
  ) {}

  @Cron('0 4 * * *', { name: 'compset-daily-refresh' })
  async run(): Promise<void> {
    // Sólo properties con ≥1 competidor activo. Evita correr para clientes que
    // aún no configuraron compset.
    const props = await this.prisma.competitor.groupBy({
      by: ['propertyId'],
      where: { isActive: true },
      _count: { _all: true },
    })
    let ok = 0
    let failed = 0
    let totalCompetitors = 0
    for (const row of props) {
      try {
        const res = await this.compset.refreshSnapshots(row.propertyId, 30)
        ok += res.ok
        failed += res.failed
        totalCompetitors += row._count._all
      } catch (err) {
        this.logger.error(
          `[Compset] refresh failed property=${row.propertyId}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
    this.logger.log(
      `[Compset] daily refresh — ${ok}/${totalCompetitors} snapshots ok, ${failed} failed across ${props.length} properties`,
    )
  }
}
