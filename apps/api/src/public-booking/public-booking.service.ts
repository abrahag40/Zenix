import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AvailabilityService } from '../pms/availability/availability.service'
import { AvailabilityQueryDto } from './dto/availability-query.dto'
import { PublicPricingService } from './public-pricing.service'

/**
 * PublicBookingService — BOOKING-ENGINE B1 (READ).
 *
 * Capa de SOLO LECTURA de la API pública de "Zenix Booking". Resuelve la
 * property por SLUG (nunca por UUID interno — anti-IDOR, §179) y expone info
 * pública + disponibilidad + tarifas para que un website EXTERNO e independiente
 * la consuma vía HTTP. Zenix Booking es headless: el website se adapta a este
 * contrato, no al revés.
 *
 * Toda verificación de inventario delega en AvailabilityService.check (§35) —
 * única fuente de verdad. Cero queries directas a guestStay/staySegment para
 * responder "¿está libre?".
 */
@Injectable()
export class PublicBookingService {
  private readonly logger = new Logger(PublicBookingService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly pricing: PublicPricingService,
  ) {}

  /**
   * Resuelve la BookingEngineConfig + Property por slug, validando que el motor
   * esté publicado. Si el slug no existe O `enabled=false` → 404 (no se filtra
   * que el slug exista pero esté apagado).
   */
  private async resolvePublishedProperty(slug: string) {
    const config = await this.prisma.bookingEngineConfig.findUnique({
      where: { slug },
      include: {
        property: {
          include: { legalEntity: true },
        },
      },
    })
    if (!config || !config.enabled) {
      throw new NotFoundException('Página de reservas no encontrada')
    }
    return config
  }

  private displayCurrency(config: {
    displayCurrency: string | null
    property: { legalEntity: { baseCurrency: string } | null }
  }, fallback: string): string {
    return (
      config.displayCurrency ??
      config.property.legalEntity?.baseCurrency ??
      fallback
    )
  }

  /** Info pública del hotel para la home de la página de reservas. */
  async getPublicProperty(slug: string) {
    const config = await this.resolvePublishedProperty(slug)
    const { property } = config

    const roomTypeCount = await this.prisma.roomType.count({
      where: { propertyId: property.id, isActive: true, deletedAt: null },
    })

    return {
      slug: config.slug,
      name: config.heroTitle ?? property.name,
      heroSubtitle: config.heroSubtitle,
      city: property.city,
      region: property.region,
      currency: this.displayCurrency(config, 'USD'),
      defaultLanguage: config.defaultLanguage,
      branding: {
        logoUrl: config.logoUrl,
        primaryColor: config.primaryColor,
        accentColor: config.accentColor,
        fontFamily: config.fontFamily,
      },
      paymentPolicy: config.paymentPolicy, // PAY_AT_HOTEL en Fase 1 (Opción B)
      termsUrl: config.termsUrl,
      roomTypeCount,
    }
  }

  /** Catálogo público de tipos de habitación. */
  async getRoomTypes(slug: string) {
    const config = await this.resolvePublishedProperty(slug)
    const currency = this.displayCurrency(config, 'USD')

    const roomTypes = await this.prisma.roomType.findMany({
      where: { propertyId: config.property.id, isActive: true, deletedAt: null },
      orderBy: { baseRate: 'asc' },
    })

    return roomTypes.map((rt) => ({
      id: rt.id,
      name: rt.name,
      code: rt.code,
      description: rt.description,
      maxOccupancy: rt.maxOccupancy,
      baseRate: Number(rt.baseRate),
      currency: rt.currency ?? currency,
      amenities: rt.amenities,
    }))
  }

  /**
   * Disponibilidad por tipo de habitación en un rango de fechas.
   *
   * Para cada room type activo: cuenta cuántas de sus habitaciones están libres
   * en [checkIn, checkOut) delegando en AvailabilityService.check (§35, intervalo
   * half-open, excluye no-shows/cancelled/zombies gratis). Filtra por capacidad
   * contra (adults + children).
   *
   * 🔴 C2 (docs/vision/18): el precio ya NO es `RoomType.baseRate`.
   *
   * Antes esto publicaba la BAR con la nota «la resolución fina se enchufa en
   * B2/B5». Esa deuda es la que hacía que una temporada alta cargada en Zenix
   * no se viera en el sitio del hotel. Ahora `PublicPricingService` resuelve
   * noche por noche con la precedencia D-RATES2 completa y le suma el desglose
   * fiscal con la MISMA función pura que usa recepción.
   *
   * `nightlyRate` y `totalRate` se conservan —los consume `BookingPage.tsx`—
   * pero pasan a ser DERIVADOS de `pricing`, que es la fuente de verdad. Dos
   * campos, un solo cálculo: lo contrario es cómo se acaba con dos totales
   * distintos para la misma noche.
   */
  async checkAvailability(slug: string, q: AvailabilityQueryDto) {
    const config = await this.resolvePublishedProperty(slug)
    const propertyId = config.property.id
    const currency = this.displayCurrency(config, 'USD')

    const from = new Date(q.checkIn)
    const to = new Date(q.checkOut)
    const nights = Math.max(
      1,
      Math.round((utcMidnight(to) - utcMidnight(from)) / 86400000),
    )
    const pax = (q.adults ?? 1) + (q.children ?? 0)

    const roomTypes = await this.prisma.roomType.findMany({
      where: {
        propertyId,
        isActive: true,
        deletedAt: null,
        ...(q.roomTypeId ? { id: q.roomTypeId } : {}),
        maxOccupancy: { gte: pax },
      },
      include: {
        rooms: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
    })

    // Contexto de tarifa UNA vez por petición, no una por tipo de habitación.
    const { ctx, reason } = await this.pricing.loadPlanContext(
      propertyId,
      config.publicRatePlanId ?? null,
      from,
      to,
    )

    const results = await Promise.all(
      roomTypes.map(async (rt) => {
        let availableRooms = 0
        for (const room of rt.rooms) {
          const res = await this.availability.check({ roomId: room.id, from, to })
          if (res.available) availableRooms++
        }
        const pricing = this.pricing.price({
          checkIn: from,
          checkOut: to,
          occupants: pax,
          currency: rt.currency ?? currency,
          bar: Number(rt.baseRate),
          roomTypeId: rt.id,
          ratesIncludeTaxes: config.ratesIncludeTaxes,
          jurisdiction: {
            countryCode: config.property.legalEntity?.countryCode ?? 'MX',
            // `regionCode` ya es ISO 3166-2 ("MX-ROO"): se le quita el país.
            stateCode: config.property.regionCode?.split('-').pop() ?? null,
            municipality: config.property.taxMunicipality ?? null,
            city: config.property.city ?? null,
            lodgingKind: config.property.lodgingKind === 'PRIVATE_RENTAL' ? 'PRIVATE_RENTAL' : 'HOTEL',
            optIns: config.property.taxOptIns ?? [],
          },
          ctx,
          fallbackReason: reason,
        })
        return {
          roomTypeId: rt.id,
          name: rt.name,
          maxOccupancy: rt.maxOccupancy,
          availableRooms,
          available: availableRooms > 0,
          // Derivados de `pricing`, por compatibilidad con BookingPage.tsx.
          // El total legacy es el TOTAL CON IMPUESTOS: es el número que la
          // regla del proyecto —y la LFPC art. 7 BIS— obliga a exhibir.
          nightlyRate: pricing.totalCents / 100 / pricing.nights,
          nights,
          totalRate: pricing.totalCents / 100,
          currency: rt.currency ?? currency,
          pricing,
        }
      }),
    )

    return {
      slug: config.slug,
      checkIn: q.checkIn,
      checkOut: q.checkOut,
      nights,
      pax,
      currency,
      roomTypes: results,
    }
  }

  /**
   * Cotización de tarifas por tipo de habitación (sin verificar inventario).
   * Útil para mostrar precios "desde" antes de elegir fechas exactas.
   */
  async getRates(slug: string, q: AvailabilityQueryDto) {
    const avail = await this.checkAvailability(slug, q)
    return {
      slug: avail.slug,
      checkIn: avail.checkIn,
      checkOut: avail.checkOut,
      nights: avail.nights,
      currency: avail.currency,
      rates: avail.roomTypes.map((r) => ({
        roomTypeId: r.roomTypeId,
        name: r.name,
        nightlyRate: r.nightlyRate,
        nights: r.nights,
        totalRate: r.totalRate,
        currency: r.currency,
        pricing: r.pricing,
      })),
    }
  }

  /**
   * Calendario de disponibilidad por noche (BOOKING-ENGINE B3 — feed advisory).
   *
   * Devuelve, para cada día en [from, to), cuántas habitaciones de cada tipo
   * están libres. El date-picker del website lo usa para **pintar en gris las
   * fechas sin cupo ANTES de que el huésped elija** — reduce los callejones sin
   * salida sin reemplazar la garantía dura.
   *
   * ⚠️ ADVISORY: es un agregado cacheable (puede estar levemente desfasado). La
   * garantía REAL anti-overbook es el guard transaccional §35 en POST
   * /reservations (→ 409 al perdedor de la carrera). El webhook
   * `availability.changed` (B3) le avisa al website que invalide este calendario.
   * Bounded a ≤62 noches por request.
   */
  async getAvailabilityCalendar(
    slug: string,
    fromStr: string,
    toStr: string,
    roomTypeId?: string,
  ) {
    const config = await this.resolvePublishedProperty(slug)
    const propertyId = config.property.id

    const fromParsed = new Date(fromStr)
    const toParsed = new Date(toStr)
    if (Number.isNaN(fromParsed.getTime()) || Number.isNaN(toParsed.getTime())) {
      throw new BadRequestException('from/to deben ser fechas válidas (YYYY-MM-DD)')
    }
    const fromDay = utcMidnight(fromParsed)
    const toDay = utcMidnight(toParsed)
    const nights = Math.round((toDay - fromDay) / 86400000)
    if (nights < 1) throw new BadRequestException('Rango de fechas inválido (to debe ser posterior a from)')
    if (nights > 62) throw new BadRequestException('Rango máximo 62 noches')

    const roomTypes = await this.prisma.roomType.findMany({
      where: {
        propertyId,
        isActive: true,
        deletedAt: null,
        ...(roomTypeId ? { id: roomTypeId } : {}),
      },
      include: { rooms: { where: { deletedAt: null }, select: { id: true } } },
    })
    const roomIds = roomTypes.flatMap((rt) => rt.rooms.map((r) => r.id))
    const fromDate = new Date(fromDay)
    const toDate = new Date(toDay)

    // Ocupación: stays + segments + blocks que solapan el rango. Mismas
    // exclusiones que §35 (cancelled/no-show fuera; blocks que retiran cuarto).
    const [stays, segments, blocks] = await Promise.all([
      this.prisma.guestStay.findMany({
        where: {
          propertyId,
          roomId: { in: roomIds },
          deletedAt: null,
          cancelledAt: null,
          noShowAt: null,
          checkinAt: { lt: toDate },
          scheduledCheckout: { gt: fromDate },
        },
        select: { roomId: true, checkinAt: true, scheduledCheckout: true },
      }),
      this.prisma.staySegment.findMany({
        where: {
          roomId: { in: roomIds },
          status: 'ACTIVE',
          checkIn: { lt: toDate },
          checkOut: { gt: fromDate },
        },
        select: { roomId: true, checkIn: true, checkOut: true },
      }),
      this.prisma.roomBlock.findMany({
        where: {
          roomId: { in: roomIds },
          status: { in: ['ACTIVE', 'PENDING_APPROVAL', 'APPROVED'] },
          startDate: { lt: toDate },
          OR: [{ endDate: null }, { endDate: { gt: fromDate } }],
        },
        select: { roomId: true, startDate: true, endDate: true },
      }),
    ])

    // Marca los días ocupados por habitación.
    const occupied = new Map<string, Set<number>>()
    const mark = (roomId: string | null, start: Date, end: Date | null) => {
      if (!roomId) return
      const s = utcMidnight(start)
      const e = end ? utcMidnight(end) : toDay
      let set = occupied.get(roomId)
      if (!set) occupied.set(roomId, (set = new Set()))
      for (let d = Math.max(s, fromDay); d < Math.min(e, toDay); d += 86400000) set.add(d)
    }
    for (const x of stays) mark(x.roomId, x.checkinAt, x.scheduledCheckout)
    for (const x of segments) mark(x.roomId, x.checkIn, x.checkOut)
    for (const x of blocks) mark(x.roomId, x.startDate, x.endDate)

    // Cuenta libres por tipo por noche.
    const days: { date: string; roomTypes: { roomTypeId: string; name: string; available: number; total: number }[] }[] = []
    for (let d = fromDay; d < toDay; d += 86400000) {
      days.push({
        date: new Date(d).toISOString().slice(0, 10),
        roomTypes: roomTypes.map((rt) => {
          const free = rt.rooms.filter((r) => !occupied.get(r.id)?.has(d)).length
          return { roomTypeId: rt.id, name: rt.name, available: free, total: rt.rooms.length }
        }),
      })
    }

    return { slug: config.slug, from: fromStr, to: toStr, nights, advisory: true, days }
  }
}

/** UTC midnight epoch (ms) — TZ-safe para contar noches (§12, §128 pattern). */
function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}
