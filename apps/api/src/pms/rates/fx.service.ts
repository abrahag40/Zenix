import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * FxService — gestión de tasas de cambio para Zenix.
 *
 * Doble fuente:
 *   1. BANXICO SF43718 (FIX) — fuente oficial MX, gratuito, 40k req/día.
 *      Publicación DOF post 12:00 CST. Token requerido (BANXICO_TOKEN env).
 *   2. PropertyFxRate — override comercial del hotel (spread sobre oficial
 *      o rate absoluto editable). Editable en Settings.
 *
 * El dashboard widget muestra ambos lado a lado al recepcionista.
 *
 * Endpoints:
 *   - GET /v1/fx/current?propertyId=X    → { official, internal, delta }
 *   - PUT /v1/fx/override                → upsert PropertyFxRate
 *   - POST /v1/fx/refresh-banxico        → manual trigger (admin only)
 *
 * Compliance fiscal:
 *   - CFDI 4.0 Art. 20 CFF usa FIX del día de la operación
 *   - REP usa FIX del día del pago (no de la factura)
 *   - PaymentFxLock (v1.0.1 §81) congela rate al cobro, reconcilia con
 *     payout report (realizedGainLoss) — sembrado pero implementado v1.0.1.
 */
@Injectable()
export class FxService {
  private readonly logger = new Logger(FxService.name)

  // SF43718 = USD/MXN FIX. Banxico docs: https://www.banxico.org.mx/SieAPIRest/service/v1/doc/seriesAPI
  private readonly BANXICO_SF43718 = 'SF43718'
  private readonly BANXICO_API = 'https://www.banxico.org.mx/SieAPIRest/service/v1/series'

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch USD/MXN del FIX más reciente desde Banxico SF43718.
   * Returns { rate, effectiveDate } o null si falla.
   */
  async fetchBanxicoFix(token: string | undefined = process.env.BANXICO_TOKEN): Promise<{ rate: number; effectiveDate: Date } | null> {
    if (!token) {
      this.logger.warn('[FX] BANXICO_TOKEN no configurado — skip fetch oficial')
      return null
    }
    try {
      const url = `${this.BANXICO_API}/${this.BANXICO_SF43718}/datos/oportuno?token=${token}`
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (!res.ok) {
        this.logger.warn(`[FX] Banxico HTTP ${res.status}`)
        return null
      }
      const json = await res.json() as {
        bmx?: { series?: Array<{ datos?: Array<{ fecha: string; dato: string }> }> }
      }
      const last = json.bmx?.series?.[0]?.datos?.[0]
      if (!last) return null
      // Banxico fecha format: "DD/MM/YYYY"
      const [d, m, y] = last.fecha.split('/')
      return {
        rate: Number(last.dato),
        effectiveDate: new Date(`${y}-${m}-${d}T00:00:00.000Z`),
      }
    } catch (err) {
      this.logger.warn(`[FX] fetchBanxicoFix failed: ${(err as Error).message}`)
      return null
    }
  }

  /**
   * Persistir el rate fetcheado en ExchangeRate. Inmutable per día+source.
   */
  async storeRate(opts: {
    organizationId: string
    baseCurrency: string
    quoteCurrency: string
    rate: number
    source: string
    effectiveDate: Date
  }) {
    try {
      return await this.prisma.exchangeRate.create({
        data: {
          organizationId: opts.organizationId,
          baseCurrency:   opts.baseCurrency,
          quoteCurrency:  opts.quoteCurrency,
          rate:           new Prisma.Decimal(opts.rate),
          source:         opts.source,
          effectiveDate:  opts.effectiveDate,
        },
      })
    } catch (err) {
      // Unique violation = ya tenemos ese día. Idempotente.
      if ((err as { code?: string }).code === 'P2002') return null
      throw err
    }
  }

  /**
   * Cron diario 13:00 CST (post-publicación DOF) — fetch + store Banxico.
   * Multi-org: itera todas las organizations activas con countryCode='MX'.
   */
  @Cron('0 13 * * *', { name: 'banxico-fix-daily', timeZone: 'America/Mexico_City' })
  async refreshBanxicoDaily() {
    const fix = await this.fetchBanxicoFix()
    if (!fix) {
      this.logger.warn('[FX] Banxico daily refresh skipped (no data)')
      return
    }

    const orgs = await this.prisma.organization.findMany({
      where: { isActive: true },
      select: { id: true },
    })

    let stored = 0
    for (const org of orgs) {
      const result = await this.storeRate({
        organizationId: org.id,
        baseCurrency:   'USD',
        quoteCurrency:  'MXN',
        rate:           fix.rate,
        source:         'BANXICO_SF43718',
        effectiveDate:  fix.effectiveDate,
      })
      if (result) stored++
    }
    this.logger.log(`[FX] Banxico daily refresh: USD/MXN=${fix.rate} stored=${stored}/${orgs.length}`)
  }

  /**
   * Current rates para el dashboard widget — ambos oficial + interno.
   */
  async getCurrentRates(propertyId: string, organizationId: string, base = 'USD', quote = 'MXN') {
    const [official, internal] = await Promise.all([
      this.prisma.exchangeRate.findFirst({
        where: { organizationId, baseCurrency: base, quoteCurrency: quote, source: 'BANXICO_SF43718' },
        orderBy: { effectiveDate: 'desc' },
      }),
      this.prisma.propertyFxRate.findFirst({
        where: {
          propertyId,
          baseCurrency: base,
          quoteCurrency: quote,
          validFrom: { lte: new Date() },
          OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
        },
        orderBy: { validFrom: 'desc' },
      }),
    ])

    const officialRate = official ? Number(official.rate) : null
    const internalRate = internal ? Number(internal.rate) : null
    const delta = officialRate && internalRate
      ? ((internalRate - officialRate) / officialRate) * 100
      : null

    return {
      base,
      quote,
      official: official && {
        rate: officialRate,
        effectiveDate: official.effectiveDate,
        fetchedAt: official.fetchedAt,
        source: 'Banxico SF43718 (FIX)',
      },
      internal: internal && {
        rate: internalRate,
        validFrom: internal.validFrom,
        spreadFromOfficial: internal.spreadFromOfficial ? Number(internal.spreadFromOfficial) : null,
      },
      deltaPercent: delta,
    }
  }

  /**
   * Upsert override del hotel — admin setting.
   */
  async upsertPropertyFx(propertyId: string, dto: {
    baseCurrency: string
    quoteCurrency: string
    rate: number
    spreadFromOfficial?: number
    validFrom?: Date
    validTo?: Date
    updatedById: string
  }) {
    const validFrom = dto.validFrom ?? new Date()
    return this.prisma.propertyFxRate.create({
      data: {
        propertyId,
        baseCurrency:       dto.baseCurrency,
        quoteCurrency:      dto.quoteCurrency,
        rate:               new Prisma.Decimal(dto.rate),
        spreadFromOfficial: dto.spreadFromOfficial != null ? new Prisma.Decimal(dto.spreadFromOfficial) : null,
        validFrom,
        validTo:            dto.validTo,
        updatedById:        dto.updatedById,
      },
    })
  }
}
