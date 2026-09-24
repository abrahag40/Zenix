import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { calculateTaxes } from '../pms/fiscal/tax-calculator'
import { resolveFiscalPolicyForProfile, type LodgingKind } from '../pms/fiscal/fiscal-policies'
import { CATALOGO_POR_ESTADO } from '../pms/fiscal/tax-catalog'

/**
 * La política de publicación de una propiedad — lo que decide QUÉ NÚMERO VE EL
 * HUÉSPED cuando el hotel escribe una tarifa.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 POR QUÉ ESTO EXISTE, Y POR QUÉ NO ES UN FORMULARIO MÁS
 *
 * Hasta hoy, para saber si la tarifa cargada llevaba impuestos dentro había que
 * PREGUNTARLE AL HOTEL POR CORREO. Un correo que puede tardar semanas, y
 * mientras tanto el sitio no publica precio.
 *
 * Peor: la respuesta llegaba fuera de contexto. «¿Sus tarifas incluyen
 * impuestos?» es una pregunta abstracta para quien la lee un martes entre otras
 * cosas. **Enseñarle su propio total lo vuelve obvio.**
 *
 *   Tarifa 5 950 · IVA 16 % · ISH 5 %  →  el huésped verá 7 199.50
 *
 * Nadie se equivoca mirando el precio final de su propio hotel. Por eso la
 * previsualización no es un adorno: es el mecanismo entero.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTA PANTALLA **NO** PUEDE ARREGLAR
 *
 * Que el hotel elija mal. Si marca «sin impuestos» y publicamos un neto como si
 * fuera el total, hemos publicado el número que la LFPC art. 7 BIS no permite
 * —el proveedor debe exhibir el MONTO TOTAL A PAGAR—. Una interfaz no convierte
 * una respuesta equivocada en correcta; sólo hace muy difícil equivocarse.
 *
 * Y dos cosas siguen sin poder contestarse aquí, porque no son configuración
 * sino hechos externos: si las plataformas entregan la constancia de retención,
 * y cuánto cobra el municipio por saneamiento ambiental.
 */

export interface LineaFiscal {
  /**
   * Clave estable para la pantalla. NO basta el `code`: en Quintana Roo hay dos
   * IVA en el catálogo —el general del 16 % y el fronterizo sur del 8 %—, y dos
   * filas con la misma clave se pisan al renderizar y al marcar.
   */
  id: string
  code: string
  label: string
  /** Fracción decimal, para mostrar: 0.16. */
  rate: number
  base: 'ROOM' | 'ROOM_AND_SERVICES'
  /** true = la propiedad la tiene activa hoy. */
  activa: boolean
  /** Hasta cuándo rige (ISO). El estímulo fronterizo caduca el 2026-12-31. */
  vigenteHasta?: string | null
  /** Si sólo aplica cuando la propiedad declara un régimen, cuál. */
  requiereAlta?: string
  /** El fundamento, para que el hotel vea de dónde sale y no se lo tenga que creer. */
  fundamento?: string
}

export interface PoliticaDePublicacion {
  propertyId: string
  moneda: string
  /** true = la tarifa que el hotel escribe YA lleva impuestos dentro. */
  tarifaIncluyeImpuestos: boolean
  jurisdiccion: { estado: string | null; nombreEstado: string | null; municipio: string | null }
  tipoDeEstablecimiento: LodgingKind
  /** Regímenes declarados, p. ej. el estímulo fronterizo. */
  regimenes: string[]
  /** false = la ley de ese estado no está verificada; no se puede publicar precio firme. */
  verificada: boolean
  lineas: LineaFiscal[]
  avisos: string[]
}

/** Configuración hipotética: lo que el hotel está probando sin guardar. */
export interface Tentativa {
  tarifaIncluyeImpuestos?: boolean
  regimenes?: string[]
  municipio?: string | null
  ocupantes?: number
}

/** Lo que el huésped vería para una tarifa concreta. Centavos enteros. */
export interface VistaPrevia {
  netoCentavos: number
  impuestosCentavos: number
  totalCentavos: number
  desglose: Array<{ code: string; label: string; importeCentavos: number }>
  /** false = con esta configuración NO se publica precio, se publica «Consultar». */
  publicable: boolean
  motivo?: string
  /**
   * Supuestos que la vista previa tuvo que asumir. Un impuesto por persona por
   * noche no se puede previsualizar sin saber cuántas personas: el número
   * mostrado depende de un supuesto, y callarlo lo volvería un dato falso.
   */
  supuestos?: string[]
}

/** Misma normalización que el resolutor del catálogo: sin acentos, sin caja. */
const normalizaMunicipio = (s: string | null | undefined): string =>
  (s ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

@Injectable()
export class PoliticaDePublicacionService {
  constructor(private readonly prisma: PrismaService) {}

  private async cargar(propertyId: string) {
    const prop = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true, city: true, regionCode: true, taxMunicipality: true,
        lodgingKind: true, taxOptIns: true,
        legalEntity: { select: { countryCode: true, baseCurrency: true } },
        bookingEngineConfig: { select: { ratesIncludeTaxes: true, displayCurrency: true } },
      },
    })
    if (!prop) throw new NotFoundException('Propiedad no encontrada')
    return prop
  }

  /** El estado actual + TODAS las líneas que su jurisdicción permite, activas o no. */
  async leer(propertyId: string): Promise<PoliticaDePublicacion> {
    const prop = await this.cargar(propertyId)
    const estado = prop.regionCode?.split('-').pop() ?? null
    const lodgingKind = (prop.lodgingKind === 'PRIVATE_RENTAL' ? 'PRIVATE_RENTAL' : 'HOTEL') as LodgingKind

    const resuelta = resolveFiscalPolicyForProfile({
      countryCode: prop.legalEntity?.countryCode ?? 'MX',
      stateCode: estado,
      municipality: prop.taxMunicipality,
      city: prop.city,
      lodgingKind,
      optIns: prop.taxOptIns ?? [],
    })
    const activas = new Set(resuelta.rules.map((r) => r.code))

    // Se ofrecen TODAS las del catálogo de su estado, no sólo las activas: si
    // el hotel no ve la casilla del estímulo fronterizo, no puede activarla, y
    // acabaríamos otra vez preguntando por correo.
    const entrada = estado ? CATALOGO_POR_ESTADO.get(estado) : undefined
    // `flatMap` y no `filter().map()` a propósito: el filtro no estrecha la
    // unión discriminada, así que `appliesTo` —que sólo existe en la variante
    // porcentual— no sería visible. Es el mismo error que TS ya nos cobró
    // antes al hacer spread de una variante sobre otra.
    const hoy = new Date().toISOString().slice(0, 10)
    const muni = normalizaMunicipio(prop.taxMunicipality ?? prop.city)
    const lineas: LineaFiscal[] = (entrada?.rules ?? []).flatMap((r) => {
      if (!r.lodgingKinds.includes(lodgingKind)) return []
      // Una casilla que el hotel no puede activar —porque su municipio no está
      // en el supuesto, o porque la regla ya caducó— no es información: es una
      // trampa. Se omite.
      if (r.onlyInMunicipalities && !r.onlyInMunicipalities.some((m) => normalizaMunicipio(m) === muni)) return []
      if (r.exceptInMunicipalities?.some((m) => normalizaMunicipio(m) === muni)) return []
      if (r.validFrom > hoy) return []
      if (r.validUntil && r.validUntil < hoy) return []
      const regla = r.rule
      if (regla.kind !== 'PERCENT_OF_BASE') return []
      return [
        {
          id: `${regla.code}-${regla.rateBp}`,
          code: regla.code,
          label: regla.label,
          rate: regla.rateBp / 10000,
          base: (regla.appliesTo === 'LODGING_ONLY' ? 'ROOM' : 'ROOM_AND_SERVICES') as LineaFiscal['base'],
          activa:
            activas.has(regla.code) &&
            resuelta.rules.some(
              (a) => a.code === regla.code && a.kind === 'PERCENT_OF_BASE' && a.rateBp === regla.rateBp,
            ),
          vigenteHasta: r.validUntil,
          requiereAlta: r.requiresOptIn,
          fundamento: r.provenance.legalBasis,
        },
      ]
    })

    const avisos: string[] = []
    if (resuelta.note) avisos.push(resuelta.note)
    if (resuelta.inferred) {
      avisos.push('El estado fiscal se dedujo del nombre de la ciudad. Confírmalo antes de publicar.')
    }

    return {
      propertyId,
      moneda: prop.bookingEngineConfig?.displayCurrency ?? prop.legalEntity?.baseCurrency ?? 'MXN',
      tarifaIncluyeImpuestos: prop.bookingEngineConfig?.ratesIncludeTaxes ?? true,
      jurisdiccion: {
        estado, nombreEstado: resuelta.jurisdiction.stateName, municipio: prop.taxMunicipality,
      },
      tipoDeEstablecimiento: lodgingKind,
      regimenes: prop.taxOptIns ?? [],
      verificada: resuelta.verified,
      lineas,
      avisos,
    }
  }

  /**
   * Qué vería el huésped con la configuración actual —o con una hipotética—.
   *
   * 🔑 Acepta una configuración TENTATIVA para que la pantalla pueda enseñar el
   * resultado ANTES de guardar. Marcar una casilla y ver el total cambiar en el
   * momento es lo que convierte una pregunta fiscal abstracta en una decisión
   * evidente.
   */
  /**
   * Qué vería el huésped con la configuración actual —o con una hipotética—.
   *
   * 🔑 Acepta una configuración TENTATIVA para que la pantalla pueda enseñar el
   * resultado ANTES de guardar. Marcar una casilla y ver el total cambiar en el
   * momento es lo que convierte una pregunta fiscal abstracta en una decisión
   * evidente.
   */
  async previsualizar(
    propertyId: string,
    importeCentavos: number,
    tentativa?: Tentativa,
  ): Promise<VistaPrevia> {
    const [una] = await this.previsualizarVarios(propertyId, [importeCentavos], tentativa)
    return una
  }

  /**
   * Varios importes de golpe: la pantalla tiene una fila por tipo de
   * habitación y las quiere todas.
   *
   * La jurisdicción se resuelve UNA vez para el lote. Hacerlo por fila eran N
   * lecturas idénticas de la misma propiedad — el clásico N+1 disfrazado de
   * «una llamada por fila» en el cliente.
   */
  async previsualizarVarios(
    propertyId: string,
    importesCentavos: number[],
    tentativa?: Tentativa,
  ): Promise<VistaPrevia[]> {
    const prop = await this.cargar(propertyId)
    const estado = prop.regionCode?.split('-').pop() ?? null
    const lodgingKind = (prop.lodgingKind === 'PRIVATE_RENTAL' ? 'PRIVATE_RENTAL' : 'HOTEL') as LodgingKind

    const policy = resolveFiscalPolicyForProfile({
      countryCode: prop.legalEntity?.countryCode ?? 'MX',
      stateCode: estado,
      municipality: tentativa?.municipio !== undefined ? tentativa.municipio : prop.taxMunicipality,
      city: prop.city,
      lodgingKind,
      optIns: tentativa?.regimenes ?? prop.taxOptIns ?? [],
    })

    const incluye = tentativa?.tarifaIncluyeImpuestos ?? prop.bookingEngineConfig?.ratesIncludeTaxes ?? true
    const moneda = prop.bookingEngineConfig?.displayCurrency ?? prop.legalEntity?.baseCurrency ?? 'MXN'
    const ocupantes = tentativa?.ocupantes && tentativa.ocupantes > 0 ? Math.floor(tentativa.ocupantes) : 2

    // Si la jurisdicción cobra por persona, el total depende de un supuesto.
    // Se declara; no se esconde detrás de un número con aspecto de certeza.
    const supuestos: string[] = []
    if (policy.rules.some((x) => x.kind === 'FIXED_PER_PERSON_NIGHT')) {
      supuestos.push(`El total asume ${ocupantes} huéspedes por noche: esta jurisdicción cobra por persona.`)
    }

    return importesCentavos.map((importeCentavos) => {
      const r = calculateTaxes({
        lodgingCents: importeCentavos,
        mode: incluye ? 'INCLUSIVE' : 'EXCLUSIVE',
        nights: 1,
        occupants: ocupantes,
        currency: moneda,
        policy,
      })

      // La MISMA regla que usa el puerto público: `firm`. Si la pantalla usara
      // otra, el hotel vería «se publicará 7 199.50» y su web diría «Consultar».
      const publicable = r.configured && policy.verified
      return {
        netoCentavos: r.lodgingBaseCents,
        impuestosCentavos: r.totalTaxesCents,
        totalCentavos: r.totalCents,
        desglose: r.lines.map((l) => ({ code: l.code, label: l.label, importeCentavos: l.amountCents })),
        publicable,
        supuestos: supuestos.length ? supuestos : undefined,
        motivo: publicable
          ? undefined
          : !r.configured
            ? 'Falta configurar la jurisdicción fiscal de esta propiedad.'
            : 'El impuesto estatal de esta jurisdicción no está verificado contra su ley.',
      }
    })
  }

  /** Guarda la política. Lo que el hotel elige aquí decide lo que publica su web. */
  async guardar(
    propertyId: string,
    dto: {
      tarifaIncluyeImpuestos?: boolean
      regimenes?: string[]
      municipio?: string | null
      tipoDeEstablecimiento?: LodgingKind
    },
  ): Promise<PoliticaDePublicacion> {
    const prop = await this.cargar(propertyId)

    // No se hace upsert: `BookingEngineConfig.slug` es único global y
    // obligatorio. Inventarle un slug a una propiedad desde una pantalla de
    // impuestos es crear silenciosamente una URL pública — un efecto que
    // nadie pidió. Se falla con un mensaje que dice qué hacer.
    if (dto.tarifaIncluyeImpuestos !== undefined && !prop.bookingEngineConfig) {
      throw new BadRequestException(
        'Esta propiedad todavía no tiene motor de reservas configurado; no hay dónde guardar si la tarifa incluye impuestos.',
      )
    }

    if (dto.municipio !== undefined || dto.regimenes || dto.tipoDeEstablecimiento) {
      await this.prisma.property.update({
        where: { id: propertyId },
        data: {
          ...(dto.municipio !== undefined ? { taxMunicipality: dto.municipio } : {}),
          ...(dto.regimenes ? { taxOptIns: dto.regimenes } : {}),
          ...(dto.tipoDeEstablecimiento ? { lodgingKind: dto.tipoDeEstablecimiento } : {}),
        },
      })
    }
    if (dto.tarifaIncluyeImpuestos !== undefined) {
      await this.prisma.bookingEngineConfig.update({
        where: { propertyId },
        data: { ratesIncludeTaxes: dto.tarifaIncluyeImpuestos },
      })
    }
    return this.leer(propertyId)
  }
}
