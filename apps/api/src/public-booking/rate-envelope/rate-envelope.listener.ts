import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { RateEnvelopeService } from './rate-envelope.service'

/** Evento que emite el módulo de tarifas cuando el precio publicable cambió. */
export const TARIFA_CAMBIADA = 'rates.changed'

export interface TarifaCambiadaEvent {
  propertyId: string
  /** Para la traza: qué operación lo provocó. */
  origen: string
}

/**
 * Cierra el lazo: cambiar una tarifa en Zenix hace que el sitio del hotel se
 * entere, sin que nadie pulse nada.
 *
 * ── POR QUÉ UN EVENTO Y NO UNA LLAMADA DIRECTA ────────────────────────────
 * `RatesService` no debe saber que existe un motor público, ni un sobre, ni un
 * sitio web. Sabe de tarifas. Acoplarlo al emisor haría que el módulo de
 * precios dependiera del de publicación, y mañana también del de Channex, y
 * del de informes. El emisor ya existía en el proyecto (`EventEmitter2`) y se
 * usa para lo mismo con Channex.
 *
 * ── POR QUÉ UN SOBRE POR OPERACIÓN Y NO POR FILA ──────────────────────────
 * Un cambio masivo de tarifas sobre 90 noches y 8 tipos escribe 720 filas. Si
 * el evento saliera por fila, saldrían 720 sobres y el sitio del hotel se
 * reconstruiría 720 veces. El evento se emite al terminar la OPERACIÓN, que es
 * la unidad que el gerente reconoce como «un cambio». La coalescencia sale
 * gratis por elegir bien dónde poner el evento.
 */
@Injectable()
export class RateEnvelopeListener {
  private readonly logger = new Logger(RateEnvelopeListener.name)

  constructor(private readonly envelopes: RateEnvelopeService) {}

  @OnEvent(TARIFA_CAMBIADA, { async: true })
  async alCambiarTarifa(evento: TarifaCambiadaEvent): Promise<void> {
    const r = await this.envelopes.publishForProperty(evento.propertyId)
    if (r) {
      this.logger.log(`Sobre ${r.envelopeId} emitido por ${evento.origen} (${r.roomTypes} tipos)`)
    }
  }
}
