import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
  resolveNightlyRate,
  type BaseStrategy,
  type ResolverDayRule,
  type ResolverSeason,
} from '../pms/rates/rate-resolver'
import { calculateTaxes, type TaxResult } from '../pms/fiscal/tax-calculator'
import { resolveFiscalPolicyForProfile, type LodgingKind } from '../pms/fiscal/fiscal-policies'

/**
 * PublicPricingService — C2 del plan de conexión con el website
 * (docs/vision/18). El puerto público deja de publicar la BAR.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 QUÉ ESTABA MAL
 *
 * `PublicBookingService` publicaba `RoomType.baseRate` — la BAR — con este
 * comentario: *«la resolución fina con RatePlan/temporadas/promociones
 * (rate-resolver D-RATES2) se enchufa en B2/B5»*. Honesto, y con una
 * consecuencia que el documento 18 midió: **el motor publicaba el número
 * equivocado.** Una temporada alta cargada en Zenix no se veía en el sitio; un
 * recargo de fin de semana tampoco; un override manual del gerente tampoco.
 * Y encima iba **sin impuestos**, que en Quintana Roo son 21 puntos.
 *
 * El hueco nunca fue construir el módulo. Era que el módulo publicaba mal.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CÓMO SE ARMA EL PRECIO, EN ORDEN
 *
 *   1. `resolveNightlyRate()` por NOCHE — la precedencia D-RATES2 completa:
 *      override manual > temporada > plan base, y el multiplicador de día de
 *      semana encima. Por noche y no por estancia, porque un fin de semana en
 *      medio de la reserva cambia sólo sus días.
 *   2. Suma en CENTAVOS ENTEROS. La conversión ocurre UNA vez, al salir del
 *      resolvedor, y a partir de ahí no hay flotantes.
 *   3. `calculateTaxes()` — la misma función pura que usa recepción. Una sola
 *      aritmética fiscal en el producto, no dos.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 LO QUE SE NIEGA A ADIVINAR
 *
 * `rate_plans.visible_to_channels` existe en el esquema, se escribe, y **nunca
 * se lee**: no hay convención de cuál plan es «el público». Elegir uno cuando
 * hay varios candidatos sería publicar un precio por sorteo. Así que:
 *
 *   · Si `bookingEngineConfig.publicRatePlanId` apunta a un plan activo → ése.
 *   · Si no, y hay **exactamente un** plan activo visible al canal directo → ése.
 *   · En cualquier otro caso → **se cae a la BAR y se DECLARA** en la respuesta
 *     (`priceSource: 'BAR_FALLBACK'`), con el motivo. El sitio puede decidir
 *     mostrar «desde» en lugar de un precio firme.
 *
 * ANTIPATRÓN EVITADO: *silent fallback*. Degradar está bien; degradar sin
 * decirlo convierte un problema de configuración en un precio equivocado que
 * nadie audita.
 */

export type PriceSource = 'RATE_PLAN' | 'BAR_FALLBACK'

/**
 * De dónde sale la tasa. `stateCode` viene de `Property.regionCode`, que ya es
 * ISO 3166-2; `municipality` decide el estímulo fronterizo; `optIns` es lo que
 * la propiedad DECLARA tener dado de alta ante la autoridad.
 */
export interface FiscalJurisdictionInput {
  countryCode: string
  stateCode: string | null
  municipality: string | null
  city: string | null
  lodgingKind: LodgingKind
  optIns: string[]
}

export interface NightlyBreakdown {
  date: string
  netCents: number
  /** Qué capa fijó el precio de ESA noche — auditable desde fuera. */
  source: string
}

export interface PublicPricing {
  currency: string
  nights: number
  /** Neto de la estancia, en centavos. */
  netCents: number
  taxesCents: number
  /** 🔴 Invariante: === netCents + taxesCents. */
  totalCents: number
  taxes: Array<{ code: string; label: string; rateBp: number | null; amountCents: number }>
  nightly: NightlyBreakdown[]
  priceSource: PriceSource
  /** Código del plan aplicado, o null si se cayó a la BAR. */
  ratePlanCode: string | null
  /** false = la jurisdicción fiscal no está configurada; el total está incompleto. */
  taxesConfigured: boolean
  /** false = el impuesto estatal de esa jurisdicción NO está verificado contra su ley. */
  taxesVerified: boolean
  /** true = el estado se dedujo del nombre de la ciudad. Configuración incompleta. */
  taxesInferred: boolean
  /**
   * 🔴 `true` = este total se puede PUBLICAR como precio firme.
   *
   * Es la regla del proyecto —«el total cotizado incluye impuestos»— reducida a
   * un booleano, y vive AQUÍ a propósito. La página alojada, el sitio del hotel
   * y cualquier otro consumidor futuro tienen que tomar la MISMA decisión; si
   * cada uno la reimplementa, tarde o temprano uno publica un precio que otro
   * no publicaría, y el huésped ve dos números distintos del mismo hotel.
   *
   * Un consumidor puede seguir mostrando la habitación con `firm: false` — lo
   * que no puede es poner una cifra y llamarla total.
   */
  firm: boolean
  /** Por qué el precio o el desglose son incompletos, si lo son. */
  notes: string[]
  /** Fundamento normativo del desglose fiscal. */
  legalBasis?: string
}

interface PlanContext {
  planId: string
  planCode: string
  plan: { baseStrategy: BaseStrategy; baseRate: number | null; baseMultiplier: number | null }
  seasons: ResolverSeason[]
  dayOfWeekRules: ResolverDayRule[]
  overrides: Map<string, number>
}

const DIA_MS = 86_400_000
const utcMidnight = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/**
 * Pesos → centavos, EXACTO. `Math.round(12.34 * 100)` funciona por accidente en
 * la mayoría de los casos y falla en algunos; se redondea sobre la suma para no
 * depender de la representación binaria del flotante que entra.
 */
const aCentavos = (pesos: number): number => Math.round(pesos * 100 + Number.EPSILON * 100)

@Injectable()
export class PublicPricingService {
  private readonly logger = new Logger(PublicPricingService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Precio publicable de UN tipo de habitación para un rango de fechas.
   *
   * `config` y `roomType` llegan ya resueltos por el llamador para no repetir
   * consultas por cada tipo: el contexto del plan se carga UNA vez por petición
   * con `loadPlanContext()`.
   */
  price(args: {
    checkIn: Date
    checkOut: Date
    occupants: number
    currency: string
    bar: number
    roomTypeId: string
    ratesIncludeTaxes: boolean
    jurisdiction: FiscalJurisdictionInput
    ctx: PlanContext | null
    fallbackReason?: string
  }): PublicPricing {
    const desde = utcMidnight(args.checkIn)
    const hasta = utcMidnight(args.checkOut)
    const nights = Math.max(1, Math.round((hasta - desde) / DIA_MS))

    const notes: string[] = []
    if (!args.ctx && args.fallbackReason) notes.push(args.fallbackReason)

    // ── 1. Neto por noche ───────────────────────────────────────────────────
    const nightly: NightlyBreakdown[] = []
    let netCents = 0
    for (let i = 0; i < nights; i++) {
      const ms = desde + i * DIA_MS
      const date = iso(ms)
      let rate: number
      let source: string
      if (args.ctx) {
        const r = resolveNightlyRate({
          date: new Date(ms),
          bar: args.bar,
          roomTypeId: args.roomTypeId,
          plan: args.ctx.plan,
          seasons: args.ctx.seasons,
          dayOfWeekRules: args.ctx.dayOfWeekRules,
          overrideRate: args.ctx.overrides.get(`${args.roomTypeId}|${date}`) ?? null,
        })
        rate = r.rate
        source = r.source
      } else {
        rate = args.bar
        source = 'BAR'
      }
      const cents = aCentavos(rate)
      netCents += cents
      nightly.push({ date, netCents: cents, source })
    }

    // ── 2. Impuestos, con la MISMA función que usa recepción ────────────────
    const policy = resolveFiscalPolicyForProfile({
      countryCode: args.jurisdiction.countryCode,
      stateCode: args.jurisdiction.stateCode,
      municipality: args.jurisdiction.municipality,
      city: args.jurisdiction.city,
      lodgingKind: args.jurisdiction.lodgingKind,
      optIns: args.jurisdiction.optIns,
      // La tasa se fija con la fecha de LLEGADA. Una estancia a caballo de un
      // cambio de tasa es un caso real —el estímulo fronterizo caduca el
      // 31-dic— y se resuelve al facturar, no al publicar.
      on: args.checkIn,
    })

    let fiscal: TaxResult
    try {
      fiscal = calculateTaxes({
        lodgingCents: netCents,
        mode: args.ratesIncludeTaxes ? 'INCLUSIVE' : 'EXCLUSIVE',
        nights,
        occupants: Math.max(1, args.occupants),
        currency: args.currency,
        policy,
      })
    } catch (e) {
      // Un fallo del cálculo fiscal NO puede tumbar la página del hotel: se
      // publica el neto y se dice que falta el desglose. Es lo mismo que hace
      // el conector cuando el sobre caduca — degradar visiblemente.
      this.logger.error(`Cálculo fiscal fallido para ${args.roomTypeId}: ${(e as Error).message}`)
      return {
        currency: args.currency,
        nights,
        netCents,
        taxesCents: 0,
        totalCents: netCents,
        taxes: [],
        nightly,
        priceSource: args.ctx ? 'RATE_PLAN' : 'BAR_FALLBACK',
        ratePlanCode: args.ctx?.planCode ?? null,
        taxesConfigured: false,
        taxesVerified: false,
        taxesInferred: policy.inferred,
        firm: false,
        notes: [...notes, 'El desglose fiscal no se pudo calcular; el total mostrado NO incluye impuestos.'],
      }
    }

    if (fiscal.note) notes.push(fiscal.note)

    return {
      currency: args.currency,
      nights,
      // En modo INCLUSIVE el neto real es la base que devolvió el cálculo, no
      // lo que venía cargado: lo cargado era el total con impuestos dentro.
      netCents: fiscal.lodgingBaseCents,
      taxesCents: fiscal.totalTaxesCents,
      totalCents: fiscal.totalCents,
      taxes: fiscal.lines.map((l) => ({
        code: l.code,
        label: l.label,
        rateBp: l.rateBp,
        amountCents: l.amountCents,
      })),
      nightly,
      priceSource: args.ctx ? 'RATE_PLAN' : 'BAR_FALLBACK',
      ratePlanCode: args.ctx?.planCode ?? null,
      taxesConfigured: fiscal.configured,
      taxesVerified: policy.verified,
      taxesInferred: policy.inferred,
      // Firme sólo si el desglose se pudo calcular Y la jurisdicción está
      // verificada contra su ley. Que falte cualquiera de las dos significa que
      // no podemos garantizar el total, y un total que no se garantiza es la
      // queja de «me cobraron más» esperando fecha.
      firm: fiscal.configured && policy.verified,
      notes,
      legalBasis: fiscal.legalBasis,
    }
  }

  /**
   * Elige el plan público y carga su contexto UNA vez por petición.
   * Devuelve `null` con un motivo legible cuando no hay un plan inequívoco.
   */
  async loadPlanContext(
    propertyId: string,
    publicRatePlanId: string | null,
    from: Date,
    to: Date,
  ): Promise<{ ctx: PlanContext | null; reason?: string }> {
    let plan = null as Awaited<ReturnType<typeof this.findPlan>> | null

    if (publicRatePlanId) {
      plan = await this.findPlan({ id: publicRatePlanId, propertyId, isActive: true })
      if (!plan) {
        return {
          ctx: null,
          reason:
            'El plan de tarifa configurado para el sitio no existe o está inactivo; se publica la tarifa base.',
        }
      }
    } else {
      const candidatos = await this.prisma.ratePlan.findMany({
        where: {
          propertyId,
          isActive: true,
          visibleToChannels: { hasSome: ['ALL', 'DIRECT'] },
        },
        include: { seasons: true, dayOfWeekRules: true },
        orderBy: { code: 'asc' },
      })
      if (candidatos.length === 0) {
        return { ctx: null, reason: 'No hay plan de tarifa publicable; se publica la tarifa base.' }
      }
      if (candidatos.length > 1) {
        // 🔴 Aquí es donde se rompería silenciosamente. No se elige el primero.
        return {
          ctx: null,
          reason: `Hay ${candidatos.length} planes publicables y ninguno marcado como el del sitio; se publica la tarifa base hasta que se elija uno.`,
        }
      }
      plan = candidatos[0]
    }

    // 🔴 C3 — el override SIN plan también cuenta.
    //
    // `POST /v1/rates/overrides` recibe `ratePlanId` OPCIONAL, y la UI lo manda
    // opcional: guardar un override sin plan es un caso real, no un borde. Con
    // el filtro anterior (`ratePlanId: plan.id`) esos overrides eran
    // INVISIBLES para el sitio del hotel — el gerente cambiaba la tarifa, el
    // panel la mostraba, y la web seguía con la anterior. Es exactamente el
    // fallo que este proyecto vino a cerrar: «el panel lo dice» no es
    // «funciona».
    const overrideRows = await this.prisma.rateOverride.findMany({
      where: {
        propertyId,
        // `null` = override que aplica a cualquier plan. Se expresa con OR y no
        // con `in: [id, null]` porque Prisma no admite `null` dentro de `in`.
        OR: [{ ratePlanId: plan.id }, { ratePlanId: null }],
        date: { gte: new Date(utcMidnight(from)), lte: new Date(utcMidnight(to)) },
      },
      select: { roomTypeId: true, date: true, overrideRate: true, ratePlanId: true },
    })

    // Precedencia explícita: el override DEL PLAN gana sobre el genérico. En
    // memoria y no por el orden de la consulta — un precio no puede depender
    // del ORDER BY que el motor decida hoy.
    const overrides = new Map<string, number>()
    const especificos = new Set<string>()
    for (const o of overrideRows) {
      // Defensa en profundidad: si el WHERE se relaja por error, aquí no pasa.
      if (o.ratePlanId != null && o.ratePlanId !== plan.id) continue
      const clave = `${o.roomTypeId}|${o.date.toISOString().slice(0, 10)}`
      const esDelPlan = o.ratePlanId === plan.id
      if (especificos.has(clave) && !esDelPlan) continue
      overrides.set(clave, Number(o.overrideRate))
      if (esDelPlan) especificos.add(clave)
    }

    return {
      ctx: {
        planId: plan.id,
        planCode: plan.code,
        plan: {
          baseStrategy: plan.baseStrategy as BaseStrategy,
          baseRate: plan.baseRate != null ? Number(plan.baseRate) : null,
          baseMultiplier: plan.baseMultiplier != null ? Number(plan.baseMultiplier) : null,
        },
        seasons: plan.seasons.map((s) => ({
          startDate: s.startDate,
          endDate: s.endDate,
          roomTypeId: s.roomTypeId,
          overrideRate: s.overrideRate != null ? Number(s.overrideRate) : null,
          multiplier: s.multiplier != null ? Number(s.multiplier) : null,
        })),
        dayOfWeekRules: plan.dayOfWeekRules.map((r) => ({
          dayOfWeek: r.dayOfWeek,
          multiplier: Number(r.multiplier),
        })),
        overrides,
      },
    }
  }

  private findPlan(where: { id: string; propertyId: string; isActive: boolean }) {
    return this.prisma.ratePlan.findFirst({
      where,
      include: { seasons: true, dayOfWeekRules: true },
    })
  }
}
