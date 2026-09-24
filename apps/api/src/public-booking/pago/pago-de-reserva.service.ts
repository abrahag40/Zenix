import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { BillingService } from '../../billing/billing.service'
import { caducaEn, type MedioDePago } from '../holds/politica-de-retencion'

/**
 * El cobro del huésped: preparar el pago y confirmar la reserva.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 LAS DOS COSAS QUE EL CLIENTE NUNCA DECIDE
 *
 * **Cuánto** y **a dónde**. Las dos se fijan aquí, en el servidor, y al
 * navegador le llega **una sola cosa**: el `client_secret`.
 *
 * Ese secreto no es un dato — es una **capacidad**: ya lleva dentro el
 * importe, la moneda y la cuenta destino, y el cliente puede *usarlo* sin
 * poder *modificarlo* (Dennis & Van Horn, 1966). Es lo que cierra el problema
 * del **diputado confundido** (Hardy, 1988): si el navegador nos dijera a
 * dónde va el dinero, quien controle el navegador controlaría el dinero.
 *
 * Por eso `crearIntento` **no acepta ningún importe**. Ni opcional, ni «por si
 * acaso». El parámetro no existe, que es la única garantía que nadie puede
 * saltarse por descuido — y hay una prueba que lo afirma sobre la firma real.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * AUTORIZAR NO ES COBRAR
 *
 * `capture_method: 'manual'` retiene los fondos sin capturarlos — el patrón
 * que Stripe documenta para hoteles. Sirve para dos cosas a la vez:
 *
 *   1. La reserva no se cobra hasta que es firme.
 *   2. **Retener cuesta una tarjeta válida.** Es lo que rompe la asimetría del
 *      agotamiento de inventario: sin esto, retener es gratis para quien
 *      retiene y caro para el hotel (documento 22 §A).
 */
@Injectable()
export class PagoDeReservaService {
  private readonly logger = new Logger(PagoDeReservaService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  /**
   * Prepara el pago de una reserva ya creada.
   *
   * 🔑 Fíjate en lo que NO recibe: importe, moneda, cuenta destino. Todo eso
   * sale de la reserva que ya está en la base.
   */
  async crearIntento(args: {
    slug: string
    bookingRef: string
    medio?: MedioDePago
  }): Promise<{
    clientSecret: string
    /** Sólo para MOSTRAR. El cobro usa lo que hay dentro del client_secret. */
    importeCentavos: number
    moneda: string
    /** Cuándo caduca la retención, si la hay. */
    expiraEn: string | null
  }> {
    const stripe = this.billing.getStripeClient()
    if (!stripe) throw new BadRequestException('El cobro no está configurado en este entorno.')

    const cfg = await this.prisma.bookingEngineConfig.findUnique({
      where: { slug: args.slug },
      select: { propertyId: true, holdTtlMinutes: true, displayCurrency: true },
    })
    if (!cfg) throw new NotFoundException('Página de reservas no encontrada')

    const reserva = await this.prisma.guestStay.findFirst({
      where: { bookingRef: args.bookingRef, propertyId: cfg.propertyId, cancelledAt: null },
      select: {
        id: true, bookingRef: true, totalAmount: true, currency: true,
        paymentStatus: true, guestEmail: true,
      },
    })
    if (!reserva) throw new NotFoundException('Reserva no encontrada')
    if (reserva.paymentStatus === 'PAID') {
      throw new BadRequestException('Esta reserva ya está pagada.')
    }

    // 🔑 El importe sale de la RESERVA, no de la petición. `totalAmount` lo
    // calculó el motor con el desglose fiscal verificado; recalcularlo aquí
    // sería tener dos verdades sobre el mismo número.
    const importeCentavos = Math.round(Number(reserva.totalAmount) * 100)
    if (!Number.isFinite(importeCentavos) || importeCentavos <= 0) {
      throw new BadRequestException('La reserva no tiene un total cobrable.')
    }
    const moneda = (reserva.currency ?? cfg.displayCurrency ?? 'MXN').toLowerCase()

    const medio: MedioDePago = args.medio ?? 'TARJETA'
    const expira = caducaEn(medio, new Date(), cfg.holdTtlMinutes)

    const intento = await stripe.paymentIntents.create(
      {
        amount: importeCentavos,
        currency: moneda,
        capture_method: 'manual',
        automatic_payment_methods: { enabled: true },
        description: `Reserva ${reserva.bookingRef}`,
        // La referencia viaja en los metadatos para que el webhook sepa qué
        // reserva confirmar sin adivinarlo por importe y fecha.
        metadata: { bookingRef: reserva.bookingRef, propertyId: cfg.propertyId },
        ...(reserva.guestEmail ? { receipt_email: reserva.guestEmail } : {}),
      },
      // Un doble clic no debe crear dos intenciones. La clave es la reserva.
      { idempotencyKey: `pi:${cfg.propertyId}:${reserva.bookingRef}` },
    )

    // La retención empieza cuando hay intención de pagar, no cuando alguien
    // mira fechas. El liberador la suelta si caduca.
    if (expira) {
      await this.prisma.guestStay.update({
        where: { id: reserva.id },
        data: { holdExpiresAt: expira },
      })
    }

    this.logger.log(
      `[pago] intención ref=${reserva.bookingRef} ${importeCentavos} ${moneda} ` +
        `caduca=${expira?.toISOString() ?? 'nunca'}`,
    )

    return {
      clientSecret: intento.client_secret!,
      importeCentavos,
      moneda: moneda.toUpperCase(),
      expiraEn: expira?.toISOString() ?? null,
    }
  }

  /**
   * Confirma la reserva cuando Stripe avisa de que el pago se autorizó.
   *
   * 🔴 **Lo llama el WEBHOOK, nunca el navegador.** Si la confirmación
   * dependiera de que el huésped vuelva a la página de «gracias», bastaría
   * cerrar la pestaña para que exista un pago sin reserva.
   *
   * Idempotente: Stripe reintenta, y el mismo evento dos veces tiene que dar
   * el mismo resultado.
   */
  async confirmarPorPago(args: {
    bookingRef: string
    propertyId: string
    importeCentavos: number
  }): Promise<{ confirmada: boolean; motivo?: string }> {
    const reserva = await this.prisma.guestStay.findFirst({
      where: { bookingRef: args.bookingRef, propertyId: args.propertyId },
      select: { id: true, totalAmount: true, cancelledAt: true, paymentStatus: true },
    })
    if (!reserva) return { confirmada: false, motivo: 'La reserva no existe' }

    // 🔴 Si la retención caducó y el liberador ya canceló, NO se resucita: la
    // habitación puede estar vendida a otro. Se deja cobrado y marcado para
    // devolución — es el desenlace correcto de esa carrera.
    if (reserva.cancelledAt) {
      this.logger.warn(
        `[pago] ref=${args.bookingRef} pagada pero YA CANCELADA. Requiere devolución.`,
      )
      return { confirmada: false, motivo: 'La reserva había caducado; procede devolución' }
    }
    if (reserva.paymentStatus === 'PAID') return { confirmada: true }

    // Lo autorizado tiene que ser lo que la reserva vale. Un desajuste aquí
    // significaría que alguien movió el importe entre medias.
    const esperado = Math.round(Number(reserva.totalAmount) * 100)
    if (args.importeCentavos !== esperado) {
      this.logger.error(
        `[pago] ref=${args.bookingRef} autorizado ${args.importeCentavos} ≠ esperado ${esperado}. NO se confirma.`,
      )
      return { confirmada: false, motivo: 'El importe autorizado no coincide con la reserva' }
    }

    await this.prisma.guestStay.update({
      where: { id: reserva.id },
      data: {
        paymentStatus: 'PAID',
        amountPaid: reserva.totalAmount,
        // Una reserva pagada es firme: deja de caducar.
        holdExpiresAt: null,
      },
    })
    this.logger.log(`[pago] ✓ ref=${args.bookingRef} confirmada por pago`)
    return { confirmada: true }
  }
}
