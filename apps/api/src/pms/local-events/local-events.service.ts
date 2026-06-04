import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * LocalEventsService — Fase 3 RATES-METRICS-COMPSET (D-COMPSET8, D-COMPSET9).
 *
 * Resolución 4-niveles del scope geográfico (plan §6.4):
 *   1. city           — events con city match a property.city (case-insensitive)
 *   2. regionCode     — events con regionCode ISO 3166-2 (gap: Property no tiene
 *                       regionCode hoy; se agrega en sprint enhancement separado)
 *   3. countryCode    — events country-wide (sin city/region) match a LegalEntity.countryCode
 *   4. lat/lng radius — events con punto + radiusKm cubriendo property location
 *                       (gap: Property no tiene lat/lng hoy; mismo sprint enhancement)
 *
 * Aplica `LocalEventOverride` per-property: `disabled=true` oculta el evento base;
 * customName/customDemandImpact reemplazan los campos del base. Eventos 100% custom
 * (baseEventId=null) son entradas exclusivas de esa property.
 *
 * Cliente NUNCA edita el catálogo base — sólo crea overrides con reason + approvedById.
 * Events Curator (rol interno ZaharDev, analog Tax Curator §91) mantiene el catálogo.
 */
@Injectable()
export class LocalEventsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Eventos aplicables a esta property en la ventana [from, to]. Los overrides
   * se mezclan in-process (custom fields ganan sobre el base; disabled=true filtra).
   */
  async findEventsForProperty(propertyId: string, from: Date, to: Date) {
    const loc = await this.resolvePropertyLocation(propertyId)

    // Eventos del catálogo base que cubran la ventana + match a algún nivel geo.
    const baseEvents = await this.prisma.localEvent.findMany({
      where: {
        startDate: { lte: to },
        endDate: { gte: from },
        OR: [
          // Nivel 1: city match (case-insensitive)
          loc.city ? { city: { equals: loc.city, mode: 'insensitive' as const } } : { id: '__never__' },
          // Nivel 2: regionCode match (skipped si property no tiene regionCode ISO)
          loc.regionCode ? { regionCode: loc.regionCode, city: null } : { id: '__never__' },
          // Nivel 3: country-wide events (sin region ni city)
          loc.countryCode
            ? { countryCode: loc.countryCode, regionCode: null, city: null }
            : { id: '__never__' },
        ],
      },
      orderBy: { startDate: 'asc' },
    })

    // TODO(v1.0.1): Nivel 4 radius — requires Property.latitude/longitude. Skipped today.

    // Overrides de la property (incluyendo customs sin baseEventId).
    const overrides = await this.prisma.localEventOverride.findMany({
      where: { propertyId },
      include: { baseEvent: true },
    })
    const overrideByBase = new Map<string, (typeof overrides)[number]>()
    const customs: typeof overrides = []
    for (const o of overrides) {
      if (o.baseEventId) overrideByBase.set(o.baseEventId, o)
      else customs.push(o)
    }

    const result: ResolvedEvent[] = []
    for (const ev of baseEvents) {
      const ov = overrideByBase.get(ev.id)
      if (ov?.disabled) continue
      result.push({
        id: ev.id,
        name: ov?.customName ?? ev.name,
        description: ev.description,
        category: ev.category,
        startDate: ev.startDate,
        endDate: ev.endDate,
        demandImpact: ov?.customDemandImpact ?? ev.demandImpact,
        expectedAttendance: ev.expectedAttendance,
        source: ev.source,
        sourceUrl: ev.sourceUrl,
        overridden: !!ov,
      })
    }

    // Customs (eventos 100% per-property sin base). Aceptamos ventana basada en
    // baseEvent si baseEventId existió y se borró; los puros customs requieren
    // que customName + customDemandImpact estén presentes (puerta a futuro).
    for (const c of customs) {
      if (!c.customName) continue
      result.push({
        id: c.id,
        name: c.customName,
        description: null,
        category: 'CUSTOM',
        startDate: from, // se asumen aplicables a la ventana entera
        endDate: to,
        demandImpact: c.customDemandImpact ?? 'MEDIUM',
        expectedAttendance: null,
        source: 'CUSTOM_OVERRIDE',
        sourceUrl: null,
        overridden: true,
      })
    }

    return { property: loc, events: result }
  }

  /**
   * Resuelve la ubicación canónica de la property para queries de eventos.
   * countryCode viene de LegalEntity (single source). regionCode + lat/lng son
   * TODO hasta agregar esos campos a Property.
   */
  async resolvePropertyLocation(propertyId: string): Promise<PropertyLocation> {
    const p = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { city: true, region: true, legalEntity: { select: { countryCode: true } } },
    })
    if (!p) throw new NotFoundException(`Property ${propertyId} not found`)
    return {
      propertyId,
      city: p.city ?? null,
      regionCode: null, // TODO v1.0.1: Property.regionCode ISO 3166-2 (p.region es free-text)
      countryCode: p.legalEntity?.countryCode ?? null,
      latitude: null, // TODO v1.0.1
      longitude: null, // TODO v1.0.1
    }
  }
}

export interface ResolvedEvent {
  id: string
  name: string
  description: string | null
  category: string
  startDate: Date
  endDate: Date
  demandImpact: string
  expectedAttendance: number | null
  source: string
  sourceUrl: string | null
  overridden: boolean
}

export interface PropertyLocation {
  propertyId: string
  city: string | null
  regionCode: string | null
  countryCode: string | null
  latitude: number | null
  longitude: number | null
}
