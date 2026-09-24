import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../../prisma/prisma.service'
import { AvailabilityService } from '../../pms/availability/availability.service'

/**
 * Libera las retenciones que caducaron.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 SIN ESTO, LA RETENCIÓN NO ES UNA RETENCIÓN: ES UNA FUGA
 *
 * Una habitación retenida ocupa inventario de verdad —ése es el punto—. Si
 * nadie la suelta, cada carrito abandonado se lleva una habitación para
 * siempre. El liberador no es el remate del trabajo: es la mitad que lo vuelve
 * seguro.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CÓMO EVITA MATAR UNA RESERVA QUE SÍ SE PAGÓ
 *
 * Hay una carrera real: el aviso del pago llega mientras el liberador está
 * corriendo. Se resuelve con **concurrencia optimista**, no con un cerrojo:
 *
 *   UPDATE … WHERE id = ? AND hold_expires_at < ? AND cancelled_at IS NULL
 *
 * Confirmar un pago pone `holdExpiresAt = NULL`. Si el pago ganó, la condición
 * ya no casa, se actualizan **cero filas** y la reserva sobrevive. Si ganó el
 * liberador, el confirmador encontrará la reserva cancelada y devolverá el
 * dinero, que es el desenlace correcto de esa carrera. En ningún orden se
 * pierde dinero ni se vende dos veces.
 *
 * **La gracia de un minuto** no es para esa carrera —ya está resuelta—, sino
 * para el reloj: los relojes de la aplicación y de la base no son el mismo, y
 * una pasarela puede tardar segundos en avisar de un pago que ya ocurrió.
 * Cobrar un minuto de inventario por esa incertidumbre es barato; cancelarle
 * la habitación a alguien que acaba de pagar, no.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * **Antipatrón evitado:** borrar la reserva. Una retención caducada es
 * historia del negocio —dice que alguien intentó reservar y no completó el
 * pago—, y es la materia prima para saber si la caducidad está bien puesta.
 * Se cancela, no se borra.
 */
@Injectable()
export class LiberadorDeRetencionesService {
  private readonly logger = new Logger(LiberadorDeRetencionesService.name)

  /** Ver el bloque de arriba: es holgura de reloj, no de carrera. */
  private static readonly GRACIA_MS = 60_000

  /** Techo por pasada: el trabajo periódico nunca monopoliza la base. */
  private static readonly MAXIMO_POR_PASADA = 200

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async correr(): Promise<void> {
    try {
      const liberadas = await this.liberarCaducadas()
      if (liberadas > 0) this.logger.log(`[retenciones] liberadas ${liberadas}`)
    } catch (e) {
      // Un fallo del trabajo periódico no puede tumbar el proceso. La próxima
      // pasada vuelve a intentarlo: las retenciones caducadas siguen ahí.
      this.logger.error(`[retenciones] pasada fallida: ${e instanceof Error ? e.message : e}`)
    }
  }

  /**
   * Libera lo caducado y devuelve cuántas. Público para poder ejecutarlo a
   * mano desde una prueba o un runbook sin esperar al reloj.
   */
  async liberarCaducadas(ahora: Date = new Date()): Promise<number> {
    const corte = new Date(ahora.getTime() - LiberadorDeRetencionesService.GRACIA_MS)

    const candidatas = await this.prisma.guestStay.findMany({
      where: {
        holdExpiresAt: { not: null, lt: corte },
        cancelledAt: null,
        actualCheckin: null, // quien ya entró no tiene una retención que soltar
      },
      select: {
        id: true, roomId: true, checkinAt: true, scheduledCheckout: true,
        bookingRef: true, holdExpiresAt: true,
      },
      take: LiberadorDeRetencionesService.MAXIMO_POR_PASADA,
      orderBy: { holdExpiresAt: 'asc' }, // la más vencida primero
    })
    if (candidatas.length === 0) return 0

    let liberadas = 0
    for (const c of candidatas) {
      // Una por una y no en lote: si una falla, las demás se liberan igual.
      // En lote, un solo error dejaría retenido todo lo del grupo.
      try {
        const cancelada = await this.prisma.$transaction(async (tx) => {
          // 🔑 La condición vuelve a comprobar `holdExpiresAt`: si el pago se
          // confirmó entre la lectura de arriba y este momento, casa cero
          // filas y la reserva sobrevive intacta.
          const r = await tx.guestStay.updateMany({
            where: { id: c.id, holdExpiresAt: { not: null, lt: corte }, cancelledAt: null },
            data: {
              cancelledAt: ahora,
              holdExpiresAt: null,
              cancelReason: 'Retención caducada: no se completó el pago a tiempo.',
            },
          })
          if (r.count === 0) return false

          // El segmento es lo que ocupa inventario y lo que vigila la
          // restricción de exclusión. Dejarlo PENDING mantendría la habitación
          // bloqueada aunque la reserva figure cancelada.
          await tx.staySegment.updateMany({
            where: { guestStayId: c.id, status: { in: ['PENDING', 'ACTIVE'] } },
            data: { status: 'CANCELLED' },
          })
          return true
        })

        if (!cancelada) continue
        liberadas++

        // Se libera inventario: el sitio del hotel tiene que enterarse para
        // volver a poner esas noches a la venta.
        this.availability.anunciarCambioDeInventario(
          c.roomId,
          c.checkinAt,
          c.scheduledCheckout,
          'hold_expired',
        )
      } catch (e) {
        this.logger.warn(
          `[retenciones] no se pudo liberar ${c.bookingRef ?? c.id}: ${e instanceof Error ? e.message : e}`,
        )
      }
    }
    return liberadas
  }
}
