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
        // ── 3-D SECURE: LO QUE EVITA EL CONTRACARGO EN VEZ DE DEFENDERLO ──
        //
        // Con 3DS, el huésped autentica el pago con su banco. Si después
        // disputa alegando FRAUDE, la responsabilidad «típicamente se traslada
        // al emisor» —son palabras de Stripe— y el hotel no paga.
        //
        // 🔴 Y AQUÍ VA LA ADVERTENCIA QUE HAY QUE REPETIR SIEMPRE, porque es
        // la propia documentación de Stripe la que insiste: **el traslado de
        // responsabilidad NO ESTÁ GARANTIZADO**. Literal: «Never state or
        // imply that a successful 3D Secure authentication guarantees
        // liability shift». Se puede esperar, no prometer.
        //
        // Y NO CUBRE todo: sólo la categoría de fraude. Una disputa por
        // «servicio no recibido» sigue el proceso normal y se gana con
        // evidencia — de ahí el expediente de contracargo.
        //
        // `any` y no `challenge`: se pide 3DS con preferencia por el flujo sin
        // fricción. Pedir siempre el reto añadiría un paso a cada huésped para
        // ganar poco; el emisor decide igualmente.
        payment_method_options: { card: { request_three_d_secure: 'any' } },
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
              // 🔴 `on_behalf_of` NO ES OPCIONAL, Y NO ES COSMÉTICO.
              //
              // Sin él, en el estado de cuenta del huésped aparece el nombre de
              // ZaharDev. Con él, aparece el del HOTEL. Stripe lo documenta
              // literalmente: el descriptor de la cuenta conectada se usa en
              // «cargos a un destino CON on_behalf_of».
              //
              // Importa porque el motivo número uno de contracargo es que el
              // titular NO RECONOCE el cargo. La propia guía de prevención de
              // Stripe abre con: «verifica que la descripción del cargo sea
              // fácilmente reconocible para tus clientes y refleje el nombre de
              // la empresa que ellos asociarían con su compra».
              //
              // Un huésped que se hospedó en «Azucar Hotel Tulum» y ve
              // «ZAHARDEV» en su estado de cuenta llama al banco. Y una disputa
              // por fraude es de las más difíciles de ganar.
              //
              // Además fija al hotel como comercio de registro para la
              // transacción, que es lo que corresponde: el servicio lo presta
              // él.
              on_behalf_of: datos.cuentaDestino,
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
