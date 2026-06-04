import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * LocalEventsService — Fase 3 RATES-METRICS-COMPSET (D-COMPSET8, D-COMPSET9).
 *
 * Resolución 4-niveles del scope geográfico (plan §6.4):
 *   1. city           — events con city match a property.city (case-insensitive)
 *   2. regionCode     — events ISO 3166-2 (e.g. MX-ROO) cuando property tiene regionCode
 *   3. countryCode    — events country-wide (sin city/region) match a LegalEntity.countryCode
 *   4. lat/lng radius — events con punto + radiusKm cubriendo property location
 *                       (haversine geo distance, filtrado post-query in-memory)
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
    const orClauses: any[] = []
    if (loc.city) orClauses.push({ city: { equals: loc.city, mode: 'insensitive' as const } })
    if (loc.regionCode) orClauses.push({ regionCode: loc.regionCode, city: null })
    if (loc.countryCode) orClauses.push({ countryCode: loc.countryCode, regionCode: null, city: null })
    // Nivel 4 radius: traemos eventos con punto+radio en la misma country/region, filtramos post-query con haversine.
    if (loc.latitude != null && loc.longitude != null && loc.countryCode) {
      orClauses.push({ countryCode: loc.countryCode, latitude: { not: null }, longitude: { not: null }, radiusKm: { not: null } })
    }
    const baseEvents = orClauses.length
      ? await this.prisma.localEvent.findMany({
          where: { startDate: { lte: to }, endDate: { gte: from }, OR: orClauses },
          orderBy: { startDate: 'asc' },
        })
      : []

    // Nivel 4 (post-filter): radius con haversine. Eventos que ya entraron por city/region/country
    // no se re-filtran (la pertenencia geo ya es exacta). Sólo los que entraron por radius
    // (lat+lng+radiusKm no nulos) se chequean contra la property location.
    const filtered = baseEvents.filter((ev) => {
      if (ev.latitude != null && ev.longitude != null && ev.radiusKm != null) {
        // Match por nombre/region/city ya cubre los demás niveles; si NINGUNO aplica,
        // dependemos del radius para incluirlo.
        const matchedByOtherLevel =
          (loc.city && ev.city && ev.city.toLowerCase() === loc.city.toLowerCase()) ||
          (loc.regionCode && ev.regionCode === loc.regionCode && !ev.city) ||
          (loc.countryCode && ev.countryCode === loc.countryCode && !ev.regionCode && !ev.city)
        if (matchedByOtherLevel) return true
        if (loc.latitude == null || loc.longitude == null) return false
        const distance = haversineKm(loc.latitude, loc.longitude, ev.latitude, ev.longitude)
        return distance <= Number(ev.radiusKm)
      }
      return true
    })

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
    for (const ev of filtered) {
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
      select: {
        city: true,
        region: true,
        regionCode: true,
        latitude: true,
        longitude: true,
        legalEntity: { select: { countryCode: true } },
      },
    })
    if (!p) throw new NotFoundException(`Property ${propertyId} not found`)
    return {
      propertyId,
      city: p.city ?? null,
      regionCode: p.regionCode ?? null,
      countryCode: p.legalEntity?.countryCode ?? null,
      latitude: p.latitude ?? null,
      longitude: p.longitude ?? null,
    }
  }
}

/** Haversine great-circle distance (km). */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
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
