import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { BillingService } from '../../../billing/billing.service'
import { caducaEn } from '../../holds/politica-de-retencion'
import type {
  DatosDelCobro,
  ModoDeConfirmacion,
  PasarelaDePago,
  ResultadoDeCobro,
} from './pasarela'

/**
 * Stripe — la pasarela por omisión de Zenix.
 *
 * Implementa el puerto sin perder nada de lo que ya estaba probado: el importe
 * sale de la reserva, la captura es manual —autorizar no es cobrar— y lo único
 * que baja al navegador es el `client_secret`, que es una **capacidad**: lleva
 * dentro importe, moneda y destino, y el cliente puede usarlo sin poder
 * modificarlo (Dennis & Van Horn, 1966).
 *
 * `confirmacion: 'webhook-firmado'` no es una etiqueta: es lo que le dice al
 * motor que puede fiarse del aviso sin consultar el estado. Una pasarela que
 * sólo devuelva al navegador NO puede declarar esto.
 */
@Injectable()
export class StripePasarela implements PasarelaDePago {
  private readonly logger = new Logger(StripePasarela.name)

  readonly nombre = 'stripe'
  readonly confirmacion: ModoDeConfirmacion = 'webhook-firmado'

  constructor(private readonly billing: BillingService) {}

  // Recibe `propertyId` por el puerto y no lo usa: la configuración de
  // Stripe es del entorno, no de la propiedad. Otras pasarelas —Banorte,
  // que se afilia hotel por hotel— sí lo necesitarán.
  async disponible(_propertyId?: string): Promise<boolean> {
    return !!this.billing.getStripeClient()
  }

  async prepararCobro(datos: DatosDelCobro): Promise<ResultadoDeCobro> {
    const stripe = this.billing.getStripeClient()
    if (!stripe) throw new BadRequestException('El cobro no está configurado en este entorno.')

    const intento = await stripe.paymentIntents.create(
      {
        amount: datos.importeCentavos,
        currency: datos.moneda.toLowerCase(),
        // Autorizar no es cobrar: el patrón que Stripe documenta para hoteles.
        capture_method: 'manual',
        automatic_payment_methods: { enabled: true },
        description: `Reserva ${datos.bookingRef}`,
        metadata: { bookingRef: datos.bookingRef, propertyId: datos.propertyId },
        ...(datos.correoDelHuesped ? { receipt_email: datos.correoDelHuesped } : {}),
        // ── EL DINERO VA A LA CUENTA DEL HOTEL ────────────────────────────
        // *Destination charge* de Stripe Connect: el cargo se hace en la
        // plataforma y los fondos se transfieren a la cuenta conectada,
        // reteniendo `application_fee_amount` para ZaharDev.
        //
        // 🔴 Verificado el 2026-09-24 contra el endpoint de datos de Stripe:
        // México es país-plataforma VÁLIDO y también país de cuenta conectada,
        // con las capacidades `card_payments`, `transfers` y `oxxo_payments`.
        // `transfers` es justo la que permite que el dinero llegue al hotel.
        //
        // Sin `cuentaDestino`, el cargo se queda en la cuenta de ZaharDev — que
        // es el modelo de hoy y el que conviene dejar atrás.
        ...(datos.cuentaDestino
          ? {
              transfer_data: { destination: datos.cuentaDestino },
              ...(datos.comisionCentavos
                ? { application_fee_amount: datos.comisionCentavos }
                : {}),
            }
          : {}),
      },
      // Un doble clic no debe crear dos intenciones. La clave es la reserva.
      { idempotencyKey: `pi:${datos.propertyId}:${datos.bookingRef}` },
    )

    return {
      referenciaExterna: intento.id,
      instruccion: { tipo: 'elementos-incrustados', secretoDeCliente: intento.client_secret! },
    }
  }

  async consultarEstado(referenciaExterna: string) {
    const stripe = this.billing.getStripeClient()
    if (!stripe) throw new BadRequestException('El cobro no está configurado en este entorno.')
    const pi = await stripe.paymentIntents.retrieve(referenciaExterna)
    return {
      // `requires_capture` es AUTORIZADO con captura manual: el dinero está
      // retenido. Tratarlo como «no pagado» dejaría reservas firmes sin
      // confirmar.
      autorizado: pi.status === 'requires_capture' || pi.status === 'succeeded',
      importeCentavos: Number(pi.amount_capturable || pi.amount_received || pi.amount || 0),
      moneda: String(pi.currency ?? '').toUpperCase(),
    }
  }
}

/** Se reexporta para que el servicio no tenga que importar de dos sitios. */
export { caducaEn }
