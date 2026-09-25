import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { StripePasarela } from './stripe.pasarela'
import { BanortePasarela } from './banorte.pasarela'
import type { PasarelaDePago } from './pasarela'

/**
 * Quién cobra en cada propiedad.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 STRIPE ES LA PRIORIDAD, NO UNA OPCIÓN MÁS
 *
 * `paymentGateway` lleva `DEFAULT 'stripe'` en la base y este registro lo
 * resuelve a Stripe cuando no reconoce el valor. Un hotel nuevo no elige
 * pasarela: cobra por Stripe y ya. La posibilidad de elegir existe para el
 * hotel que lo pide —Azucar pide Banorte— y **no debe costarle nada a los
 * demás**.
 *
 * Un producto que obliga a decidir la pasarela en el alta le traslada al
 * cliente una decisión que no tiene por qué tomar, y multiplica por N los
 * caminos que hay que probar. La configurabilidad tiene un precio y se paga
 * sólo donde hace falta.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ UN REGISTRO Y NO UN `if`
 *
 * Con dos pasarelas un `if` basta. Con tres deja de bastar, y para entonces el
 * `if` está copiado en el servicio de cobro, en el webhook y en el de
 * conciliación — el *shotgun surgery* de Fowler, otra vez. El registro es un
 * solo sitio donde saber quién cobra.
 */
@Injectable()
export class RegistroDePasarelas {
  private readonly logger = new Logger(RegistroDePasarelas.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripePasarela,
    private readonly banorte: BanortePasarela,
  ) {}

  /** Todas las conocidas, por nombre. */
  private get porNombre(): Record<string, PasarelaDePago> {
    return { [this.stripe.nombre]: this.stripe, [this.banorte.nombre]: this.banorte }
  }

  /**
   * La pasarela de esta propiedad, más lo que hace falta para cobrarle al
   * huésped y retener la comisión.
   *
   * 🔑 Devuelve la configuración junto con la pasarela **a propósito**: quien
   * cobra necesita las dos cosas y separarlas invita a usar la pasarela de una
   * propiedad con la cuenta destino de otra.
   */
  async para(propertyId: string): Promise<{
    pasarela: PasarelaDePago
    cuentaDestino?: string
    /** Comisión en puntos base. 100 = 1 %. */
    comisionBps?: number
  }> {
    const cfg = await this.prisma.bookingEngineConfig.findUnique({
      where: { propertyId },
      select: {
        paymentGateway: true,
        stripeConnectedAccountId: true,
        platformFeeBps: true,
      },
    })

    const nombre = cfg?.paymentGateway ?? this.stripe.nombre
    const pasarela = this.porNombre[nombre]

    if (!pasarela) {
      // Fail-safe: un valor desconocido en la columna NO cae a Stripe en
      // silencio. Cobrar por una pasarela que el hotel no eligió es meter su
      // dinero en una cuenta que no es la suya.
      this.logger.error(`[pasarelas] propiedad ${propertyId} pide «${nombre}», que no existe.`)
      throw new ServiceUnavailableException(
        `La pasarela configurada para esta propiedad («${nombre}») no está disponible.`,
      )
    }

    if (!(await pasarela.disponible(propertyId))) {
      throw new ServiceUnavailableException(
        `La pasarela «${nombre}» no está configurada en este entorno.`,
      )
    }

    return {
      pasarela,
      cuentaDestino: cfg?.stripeConnectedAccountId ?? undefined,
      comisionBps: cfg?.platformFeeBps ?? undefined,
    }
  }

  /**
   * La comisión en centavos, redondeada UNA vez.
   *
   * 🔴 `Math.floor` y no `round`: ante la duda, la comisión se queda corta y el
   * hotel cobra un centavo de más. El error de redondeo en contra del cliente
   * es el que acaba en una llamada; el que va a su favor, no.
   */
  comisionEnCentavos(importeCentavos: number, comisionBps?: number): number | undefined {
    if (!comisionBps || comisionBps <= 0) return undefined
    return Math.floor((importeCentavos * comisionBps) / 10_000)
  }
}
