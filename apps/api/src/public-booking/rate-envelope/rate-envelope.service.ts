import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { PublicPricingService } from '../public-pricing.service'
import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service'
import {
  SCHEMA_VERSION,
  assertEnvelopeValido,
  nuevoEnvelopeId,
  type EnvelopeRoomType,
  type RateEnvelope,
} from './rate-envelope'

/**
 * RateEnvelopeService — C4: arma el sobre y lo entrega.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ REUSA LA INFRAESTRUCTURA DE WEBHOOKS
 *
 * `WebhookSubscription` ya tiene exactamente lo que el sobre necesita: URL por
 * propiedad, secreto para la firma, `events[]` para filtrar, `active`,
 * `failureCount` y un despachador con reintentos y cola de muertos. Crear una
 * tabla paralela para lo mismo sería el antipatrón que el criterio C-7 de
 * docs/vision/20 nombra: no se reinventa lo que la casa ya resolvió.
 *
 * El evento es `rates.envelope`. Un hotel que sólo quiera precios se suscribe
 * a ése y a ninguno más.
 *
 * 🔴 LO QUE SÍ CAMBIA: la firma. El despachador genérico firma
 * `HMAC(cuerpoCrudo)` sin marca de tiempo, y eso no protege contra el reenvío
 * de una entrega capturada. Contra un receptor que escribe el precio publicado
 * del hotel, un reenvío significa REPONER UNA TARIFA VIEJA cuando al atacante
 * le convenga. Por eso el sobre lleva su propia firma con marca de tiempo,
 * verificable sin depender de la cabecera del transporte.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA VENTANA DE VALIDEZ
 *
 * `validUntil` no es un adorno: es lo que convierte «no llegó el sobre nuevo»
 * en «deja de publicar precio» en lugar de «sigue publicando el viejo para
 * siempre». La ventana por defecto es de 24 h — suficiente para absorber una
 * caída del emisor sin dejar al hotel sin precio, y corta para que una tarifa
 * obsoleta no sobreviva un fin de semana.
 */
@Injectable()
export class RateEnvelopeService {
  private readonly logger = new Logger(RateEnvelopeService.name)

  static readonly EVENTO = 'rates.envelope'
  static readonly VALIDEZ_MS = 24 * 60 * 60 * 1000

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PublicPricingService,
    private readonly dispatcher: WebhookDispatcherService,
  ) {}

  /**
   * Arma el sobre de una propiedad. NO lo entrega — devolverlo aparte permite
   * probarlo, previsualizarlo y firmarlo sin efectos.
   */
  async build(slug: string, opciones?: { ahora?: Date; noches?: number }): Promise<RateEnvelope> {
    const ahora = opciones?.ahora ?? new Date()
    const noches = opciones?.noches ?? 1

    const config = await this.prisma.bookingEngineConfig.findUnique({
      where: { slug },
      include: { property: { include: { legalEntity: true } } },
    })
    if (!config || !config.enabled) throw new NotFoundException('Motor de reservas no publicado')

    const propiedad = config.property
    const moneda = config.displayCurrency ?? propiedad.legalEntity?.baseCurrency ?? 'MXN'

    const roomTypes = await this.prisma.roomType.findMany({
      where: { propertyId: propiedad.id, isActive: true, deletedAt: null },
      orderBy: { baseRate: 'asc' },
    })

    const desde = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()))
    const hasta = new Date(desde.getTime() + noches * 86_400_000)

    const { ctx, reason } = await this.pricing.loadPlanContext(
      propiedad.id,
      config.publicRatePlanId ?? null,
      desde,
      hasta,
    )

    const jurisdiction = {
      countryCode: propiedad.legalEntity?.countryCode ?? 'MX',
      stateCode: propiedad.regionCode?.split('-').pop() ?? null,
      municipality: propiedad.taxMunicipality ?? null,
      city: propiedad.city ?? null,
      lodgingKind: (propiedad.lodgingKind === 'PRIVATE_RENTAL' ? 'PRIVATE_RENTAL' : 'HOTEL') as
        | 'PRIVATE_RENTAL'
        | 'HOTEL',
      optIns: propiedad.taxOptIns ?? [],
    }

    const tipos: EnvelopeRoomType[] = []
    let politica: RateEnvelope['taxPolicy'] | null = null

    for (const rt of roomTypes) {
      const p = this.pricing.price({
        checkIn: desde,
        checkOut: hasta,
        occupants: Math.max(1, rt.maxOccupancy),
        currency: rt.currency ?? moneda,
        bar: Number(rt.baseRate),
        roomTypeId: rt.id,
        ratesIncludeTaxes: config.ratesIncludeTaxes,
        jurisdiction,
        ctx,
        fallbackReason: reason,
      })

      // 🔴 Si no podemos garantizar el total, el tipo NO viaja. Es la regla del
      // hotel piloto —«el total cotizado incluye impuestos»— llevada a su
      // conclusión: un precio sin su fiscalidad es peor que ningún precio,
      // porque el huésped lo descubre en el mostrador.
      if (!p.taxesConfigured) {
        this.logger.warn(`${slug}/${rt.code}: sin desglose fiscal, se excluye del sobre`)
        continue
      }

      politica ??= {
        displayMode: 'TAX_INCLUSIVE',
        lines: p.taxes.map((t) => ({
          code: t.code,
          rate: (t.rateBp ?? 0) / 10000,
          base: t.code === 'IVA' ? ('ROOM_AND_SERVICES' as const) : ('ROOM' as const),
        })),
        verified: p.taxesVerified,
        legalBasis: p.legalBasis,
      }

      tipos.push({
        id: rt.id,
        code: rt.code,
        name: rt.name,
        maxOccupancy: rt.maxOccupancy,
        from: { net: p.netCents, taxes: p.taxesCents, total: p.totalCents },
      })
    }

    const emitido = ahora.toISOString()
    const sobre: RateEnvelope = {
      schemaVersion: SCHEMA_VERSION,
      envelopeId: nuevoEnvelopeId(ahora.getTime()),
      issuedAt: emitido,
      validUntil: new Date(ahora.getTime() + RateEnvelopeService.VALIDEZ_MS).toISOString(),
      propertyId: propiedad.id,
      propertySlug: config.slug,
      currency: moneda,
      taxPolicy: politica ?? {
        displayMode: 'TAX_INCLUSIVE',
        lines: [],
        verified: false,
      },
      roomTypes: tipos,
      bookingUrl: `https://book.zenix.com/${config.slug}`,
    }

    assertEnvelopeValido(sobre)
    return sobre
  }

  /**
   * Emite el sobre de una propiedad por su id, no por su slug.
   *
   * Es la puerta que usa el disparador automático: cuando alguien cambia una
   * tarifa en Zenix sabemos el `propertyId`, no el slug del motor público.
   * Si la propiedad no tiene motor publicado, NO es un error — simplemente no
   * hay a quién mandarle nada.
   */
  async publishForProperty(propertyId: string): Promise<{ envelopeId: string; roomTypes: number } | null> {
    const config = await this.prisma.bookingEngineConfig.findUnique({
      where: { propertyId },
      select: { slug: true, enabled: true },
    })
    if (!config?.enabled) return null
    try {
      return await this.publish(config.slug)
    } catch (e) {
      // 🔴 Emitir el sobre NO puede tumbar el cambio de tarifa que lo disparó.
      // El gerente subió el precio; que el sitio no se entere todavía es un
      // problema menor y recuperable —el siguiente sobre lo arregla— frente a
      // que la subida de precio falle.
      this.logger.error(`No se pudo emitir el sobre de ${propertyId}: ${(e as Error).message}`)
      return null
    }
  }

  /**
   * Arma y encola la entrega a los suscriptores de `rates.envelope`.
   * La entrega en sí —reintentos, cola de muertos— la hace el despachador que
   * ya existe.
   */
  async publish(slug: string): Promise<{ envelopeId: string; roomTypes: number }> {
    const sobre = await this.build(slug)
    await this.dispatcher.enqueue(sobre.propertyId, RateEnvelopeService.EVENTO, sobre as never)
    this.logger.log(`Sobre ${sobre.envelopeId} encolado para ${slug} (${sobre.roomTypes.length} tipos)`)
    return { envelopeId: sobre.envelopeId, roomTypes: sobre.roomTypes.length }
  }
}
