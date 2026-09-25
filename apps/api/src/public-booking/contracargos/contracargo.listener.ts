import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { CONTRACARGO_ABIERTO, type ContracargoAbierto } from '../../common/events/contracargo'
import { ExpedienteDeContracargoService } from './expediente-de-contracargo.service'

/**
 * Cuando llega un contracargo, arma el expediente **en el acto**.
 *
 * 🔴 POR QUÉ NO ESPERAR A QUE ALGUIEN LO PIDA. El plazo para responder es de 7
 * a 21 días, sólo hay una oportunidad, y el hotel se entera cuando ya le
 * quitaron el dinero. Si el expediente se arma cuando alguien se acuerda, se
 * arma tarde.
 *
 * Y hay un motivo más: **la evidencia caduca antes que el plazo**. La firma del
 * registro, la identificación, el correo de confirmación — todo eso existe el
 * día del check-in y se va perdiendo. Armarlo al recibir el aviso al menos
 * congela lo que hay y **dice lo que falta** mientras aún se puede buscar.
 */
@Injectable()
export class ContracargoListener {
  private readonly logger = new Logger(ContracargoListener.name)

  constructor(private readonly expedientes: ExpedienteDeContracargoService) {}

  @OnEvent(CONTRACARGO_ABIERTO)
  async alAbrirse(c: ContracargoAbierto): Promise<void> {
    try {
      const exp = await this.expedientes.armar({
        propertyId: c.propertyId,
        bookingRef: c.bookingRef,
      })

      // 🔴 `warn` y no `log`: esto tiene que verse. Un contracargo que pasa
      // desapercibido en una línea de registro es dinero perdido en silencio.
      this.logger.warn(
        `[contracargo] ${c.bookingRef} · motivo ${c.motivo} · ` +
          `evidencia ${exp.solidez}% · responder antes de ${c.respondeAntesDe ?? 'FECHA DESCONOCIDA'}`,
      )
      for (const f of exp.faltantes) this.logger.warn(`[contracargo]   falta: ${f}`)

      if (c.estado.startsWith('warning')) {
        // Una solicitud de información NO es todavía un contracargo, y en
        // México es la fase previa habitual. Responderla evita la comisión y
        // evita que escale a un caso que ya no se puede ganar.
        this.logger.warn(
          `[contracargo] ${c.bookingRef} es una SOLICITUD DE INFORMACIÓN: responder aquí ` +
            'evita la comisión y que escale a un contracargo imposible de ganar.',
        )
      }
    } catch (e) {
      // Un fallo armando el expediente no puede tragarse el aviso: el hotel
      // tiene que enterarse del contracargo aunque no haya expediente.
      this.logger.error(
        `[contracargo] ${c.bookingRef} recibido pero NO se pudo armar el expediente: ${String(e)}`,
      )
    }
  }
}
