import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { TenantContextService } from '../../common/tenant-context.service'

/**
 * TaxBreakdownService — Sprint 2026-05-20.
 *
 * Computa el desglose fiscal de una estadía SEGÚN la jurisdicción de la
 * propiedad. Es CRÍTICO que el frontend NO hardcodee impuestos: el sistema
 * debe ser correcto para una propiedad en Quintana Roo (IVA federal + ISH
 * estatal) Y para una en otro estado/país que tiene reglas distintas.
 *
 * Estado actual (pre-CFDI-CORE):
 *   · MX (countryCode='MX'): IVA 16% federal universalmente.
 *   · MX/Quintana Roo (inferred from city): + ISH 6% estatal.
 *     - Cities QR: Cancún, Playa del Carmen, Tulum, Cozumel, Chetumal,
 *       Bacalar, Holbox, Akumal, Puerto Morelos, Isla Mujeres.
 *   · Otras jurisdicciones: devuelve `breakdown=null` con nota explicativa.
 *     El catálogo completo (32 estados MX + 8 países LATAM) llega con
 *     v1.0.2 CFDI-CORE usando TaxCatalogEntry + IFiscalAdapter (CLAUDE.md
 *     §89, §91). Hoy NO inventamos rates falsos — es honesto decir
 *     "configuración pendiente" en lugar de aplicar QR rates fuera de QR.
 *
 * Nota: en realidad, ISH no es exclusivo de QR — TODOS los estados mexicanos
 * tienen ISH (con tasas que varían 2-6% según estado). Pero hardcodear los
 * 32 estados con tasas verificadas requiere el rol TAX_CURATOR de v1.0.2 y
 * fuentes oficiales (El Contribuyente / JA Del Río 2026). Para hoy nos
 * limitamos a QR (donde está el piloto Hotel Monica Tulum). Otros estados
 * MX devuelven `note: 'ISH estatal pendiente — configurar con v1.0.2'`.
 */

export interface TaxLineItem {
  code: string                  // 'IVA' | 'ISH' | 'DSA' | ...
  label: string                 // 'IVA (federal MX)' | 'ISH Quintana Roo'
  calculation: 'PERCENT_OF_BASE' | 'FIXED_PER_ROOM_NIGHT' | 'FIXED_PER_PERSON_NIGHT' | 'UMA_MULTIPLIER'
  rate: number                  // 0.16 = 16%
  amount: number                // computed
  detail?: string               // "16% × USD 1,400 = USD 224"
}

export interface TaxBreakdown {
  jurisdiction: {
    country: string             // 'MX'
    countryName: string         // 'México'
    state: string | null        // 'QR' o null
    stateName: string | null    // 'Quintana Roo' o null
    city: string | null
  }
  currency: string
  base: number                  // tarifa × noches (subtotal antes de impuestos)
  lineItems: TaxLineItem[]
  totalTaxes: number
  total: number                 // base + totalTaxes
  /** Si null = jurisdicción no configurada. UI muestra fallback con `note`. */
  configured: boolean
  /** Mensaje contextual: "Catálogo completo MX con v1.0.2 CFDI-CORE", etc. */
  note?: string
}

// Ciudades de Quintana Roo (case-insensitive). Tomado de INEGI municipios QR.
const QR_CITIES = new Set([
  'cancun', 'cancún',
  'playa del carmen',
  'tulum',
  'cozumel',
  'chetumal',
  'bacalar',
  'holbox',
  'akumal',
  'puerto morelos',
  'isla mujeres',
])

function isQuintanaRooCity(city: string | null | undefined): boolean {
  if (!city) return false
  return QR_CITIES.has(city.trim().toLowerCase())
}

const COUNTRY_NAMES: Record<string, string> = {
  MX: 'México',
  CO: 'Colombia',
  CR: 'Costa Rica',
  PE: 'Perú',
  PA: 'Panamá',
  GT: 'Guatemala',
  AR: 'Argentina',
  BR: 'Brasil',
  SV: 'El Salvador',
  HN: 'Honduras',
}

@Injectable()
export class TaxBreakdownService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async computeForStay(stayId: string): Promise<TaxBreakdown> {
    const orgId = this.tenant.getOrganizationId()

    const stay = await this.prisma.guestStay.findUnique({
      where: { id: stayId, organizationId: orgId },
      select: {
        id: true,
        totalAmount: true,
        ratePerNight: true,
        currency: true,
        checkinAt: true,
        scheduledCheckout: true,
        propertyId: true,
      },
    })
    if (!stay) throw new NotFoundException('Estadía no encontrada')

    // GuestStay no tiene relación directa a Property — query separada.
    const property = await this.prisma.property.findUnique({
      where: { id: stay.propertyId },
      select: {
        city: true,
        region: true,
        legalEntity: {
          select: { countryCode: true },
        },
      },
    })

    const country = property?.legalEntity?.countryCode ?? 'MX'
    const city = property?.city ?? null
    const isQR = isQuintanaRooCity(city)
    const stateCode = isQR ? 'QR' : null
    const stateName = isQR ? 'Quintana Roo' : null

    // El `totalAmount` registrado en GuestStay HOY incluye los impuestos
    // (modelo tarifa INCLUSIVA — CLAUDE.md §82 default). Por eso para mostrar
    // el desglose hacemos reverse engineering: dado el total y la tasa
    // efectiva total (IVA + ISH si aplica), derivamos la base.
    //
    // Ejemplo Quintana Roo: total $1,680 → base = 1,680 / (1 + 0.16 + 0.06) = $1,377.05
    //                       IVA = $1,377.05 × 0.16 = $220.33
    //                       ISH = $1,377.05 × 0.06 = $82.62
    //
    // Cuando llegue v1.0.2 CFDI-CORE con TaxCatalogEntry + taxStrategy
    // explícita (INCLUSIVE/EXCLUSIVE) este cálculo se vuelve adapter-driven.
    const totalGross = Number(stay.totalAmount)
    const currency = stay.currency

    const jurisdiction = {
      country,
      countryName: COUNTRY_NAMES[country] ?? country,
      state: stateCode,
      stateName,
      city,
    }

    // No-MX: no breakdown configurado todavía.
    if (country !== 'MX') {
      return {
        jurisdiction,
        currency,
        base: totalGross,
        lineItems: [],
        totalTaxes: 0,
        total: totalGross,
        configured: false,
        note: `Desglose fiscal para ${COUNTRY_NAMES[country] ?? country} pendiente — disponible con v1.0.2 CFDI-CORE.`,
      }
    }

    // MX/Quintana Roo: IVA + ISH
    if (isQR) {
      const ivaRate = 0.16
      const ishRate = 0.06
      const totalRate = ivaRate + ishRate
      const base = +(totalGross / (1 + totalRate)).toFixed(2)
      const iva = +(base * ivaRate).toFixed(2)
      const ish = +(base * ishRate).toFixed(2)
      const total = +(base + iva + ish).toFixed(2)

      return {
        jurisdiction,
        currency,
        base,
        lineItems: [
          {
            code: 'IVA',
            label: 'IVA (federal MX)',
            calculation: 'PERCENT_OF_BASE',
            rate: ivaRate,
            amount: iva,
            detail: `16% × ${currency} ${base.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          },
          {
            code: 'ISH',
            label: 'ISH Quintana Roo',
            calculation: 'PERCENT_OF_BASE',
            rate: ishRate,
            amount: ish,
            detail: `6% × ${currency} ${base.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          },
          // DSA (Derecho de Saneamiento Ambiental) per-night Tulum/Riviera Maya —
          // requiere wizard Activate verification (CLAUDE.md §94, marcado AMBIGUOUS).
          // No se incluye hasta que el cliente confirme modalidad per-room vs per-person.
        ],
        totalTaxes: +(iva + ish).toFixed(2),
        total,
        configured: true,
        note: 'DSA (saneamiento ambiental Riviera Maya) pendiente — requiere confirmación de modalidad per-room vs per-person desde Tesorería Municipal.',
      }
    }

    // MX otros estados: sólo IVA 16% federal. ISH estatal varía 2-6% y
    // requiere TAX_CURATOR de v1.0.2 para catálogo verificado.
    const ivaRate = 0.16
    const base = +(totalGross / (1 + ivaRate)).toFixed(2)
    const iva = +(base * ivaRate).toFixed(2)
    const total = +(base + iva).toFixed(2)

    return {
      jurisdiction,
      currency,
      base,
      lineItems: [
        {
          code: 'IVA',
          label: 'IVA (federal MX)',
          calculation: 'PERCENT_OF_BASE',
          rate: ivaRate,
          amount: iva,
          detail: `16% × ${currency} ${base.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        },
      ],
      totalTaxes: iva,
      total,
      configured: true,
      note: `ISH estatal para ${city ?? 'esta jurisdicción'} pendiente — disponible con v1.0.2 CFDI-CORE (catálogo de 32 estados MX).`,
    }
  }
}
