import { Injectable, Logger } from '@nestjs/common'
import { PublicBookingService } from '../public-booking.service'
import { PublicReservationsService } from '../public-reservations.service'
import type { CreateReservationDto } from '../dto/create-reservation.dto'
import {
  aEstadoParaElHuesped,
  aNoches,
  aTiposDisponibles,
  contieneFraseProhibida,
  hayPrecioFirme,
  sellar,
  sinConteos,
  type NocheDelCalendario,
  type Respuesta,
  type TipoDisponible,
} from './herramientas'

/**
 * Las herramientas del conserje, cableadas a lo que el motor público ya hace:
 * CUATRO de las cinco del catálogo. La quinta —`estado_de_reserva`— está en
 * `PENDIENTES` con su motivo, y hay una prueba que exige que esa lista y lo
 * implementado coincidan, para que «falta una» sea un dato y no un olvido.
 *
 * 🔴 **Aquí no hay modelo de lenguaje todavía, y es deliberado** (H7.2): primero
 * existe y se prueba lo que el conserje podrá preguntar; el conserje llega
 * después, cuando ya no puede inventarse la respuesta.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESTE SERVICIO NO CONSULTA INVENTARIO POR SU CUENTA
 *
 * Delega en `PublicBookingService` y `PublicReservationsService`, que a su vez
 * pasan por `AvailabilityService` (§35). Es la decisión 6 de CLAUDE.md —«toda
 * validación de inventario pasa por AvailabilityService, nunca consultas
 * directas»— y aquí muerde especialmente: una segunda forma de leer el
 * inventario sería una segunda verdad, o sea el defecto que este conserje
 * existe para no cometer.
 *
 * Lo único que añade esta capa es **traducción y sello**: quitar los conteos,
 * convertir un precio sin respaldo fiscal en «consultar», y envolverlo todo en
 * una procedencia auditable.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 LO QUE ESTA CAPA NO ES
 *
 * No es la garantía. Lo que devuelve es un *consejo* —lo mismo que el
 * calendario del sitio—; la garantía dura sigue siendo el advisory lock de
 * `createReservation`, que desde la auditoría del 2026-09-22 ya toma la MISMA
 * familia de claves que recepción y que Channex (`walk-in:<roomId>`).
 *
 * Consecuencia práctica para quien construya el conserje encima: **un 409 al
 * final no es un fallo, es el sistema funcionando**. Se responde ofreciendo
 * alternativas, nunca como una pantalla de error.
 */
@Injectable()
export class ConserjeHerramientasService {
  private readonly logger = new Logger(ConserjeHerramientasService.name)

  constructor(
    private readonly publicBooking: PublicBookingService,
    private readonly reservations: PublicReservationsService,
  ) {}

  /** ¿Hay sitio entre estas fechas, y a qué precio con impuestos? */
  async consultarDisponibilidad(
    slug: string,
    q: {
      checkIn: string
      checkOut: string
      adults?: number
      children?: number
      roomTypeId?: string
    },
  ): Promise<
    Respuesta<{ checkIn: string; checkOut: string; noches: number; tipos: TipoDisponible[] }>
  > {
    const r = await this.publicBooking.checkAvailability(slug, q)
    const tipos = aTiposDisponibles(r.roomTypes)
    return sellar(
      'consultar_disponibilidad',
      { checkIn: r.checkIn, checkOut: r.checkOut, noches: r.nights, tipos },
      { firme: hayPrecioFirme(tipos) },
    )
  }

  /**
   * Qué noches tienen sitio en un rango. Zenix lo acota a 62 noches por
   * petición y ese límite se respeta tal cual: subirlo aquí sería mover una
   * decisión de carga del sitio equivocado.
   */
  async calendarioDelMes(
    slug: string,
    desde: string,
    hasta: string,
    roomTypeId?: string,
  ): Promise<Respuesta<{ desde: string; hasta: string; noches: NocheDelCalendario[] }>> {
    const r = await this.publicBooking.getAvailabilityCalendar(slug, desde, hasta, roomTypeId)
    return sellar(
      'calendario_del_mes',
      { desde: r.from, hasta: r.to, noches: aNoches(r.days, roomTypeId) },
      // Un calendario no habla de dinero, así que no hay precio que respaldar.
      { firme: false },
    )
  }

  /** Cuánto costaría, con impuestos incluidos — o «consultar». */
  async cotizar(
    slug: string,
    q: {
      checkIn: string
      checkOut: string
      adults?: number
      children?: number
      roomTypeId?: string
    },
  ): Promise<
    Respuesta<{ checkIn: string; checkOut: string; noches: number; tipos: TipoDisponible[] }>
  > {
    const r = await this.publicBooking.checkAvailability(slug, q)
    const tipos = aTiposDisponibles(r.roomTypes)
    return sellar(
      'cotizar',
      { checkIn: r.checkIn, checkOut: r.checkOut, noches: r.nights, tipos },
      { firme: hayPrecioFirme(tipos) },
    )
  }

  /**
   * Apartar. Es la única herramienta que ESCRIBE, y por eso la única que puede
   * fallar con 409 — que aquí se deja subir tal cual: quien llame tiene que
   * distinguir «ya no está» de «se rompió algo», y tragarse esa diferencia
   * convierte la única señal útil en ruido.
   *
   * 🔴 `idempotencyKey` no es opcional por diseño: un conserje que reintenta un
   * turno sin ella crea dos reservas para el mismo huésped.
   *
   * 🔴 Y lo que NO se copia de la respuesta del motor: su campo `message`, que
   * hoy dice «Reserva confirmada…». Ver FRASES_PROHIBIDAS en `herramientas.ts`.
   */
  async apartar(
    slug: string,
    dto: CreateReservationDto,
    idempotencyKey: string,
  ): Promise<Respuesta<{ ref: string; estado: string; politicaDePago: string | null }>> {
    const r = (await this.reservations.createReservationBySlug(slug, dto, idempotencyKey)) as {
      reservationRef?: string
      paymentPolicy?: string | null
    }
    // PAY_AT_HOTEL no retiene nada: la reserva no está apartada, está solicitada.
    const retiene = (r.paymentPolicy ?? 'PAY_AT_HOTEL') !== 'PAY_AT_HOTEL'
    const datos = {
      ref: r.reservationRef ?? '',
      estado: aEstadoParaElHuesped('PENDING', retiene),
      politicaDePago: r.paymentPolicy ?? null,
    }
    this.logger.log(`[conserje] apartar ${slug} -> ${datos.ref} (${datos.estado})`)
    return sellar('apartar', datos, { firme: false })
  }

  /**
   * La red de seguridad, aplicada en el borde. Quien exponga estas herramientas
   * a un modelo pasa la respuesta por aquí.
   *
   * Hace dos cosas y ninguna es cosmética: quita los campos con forma de conteo
   * —para que un campo nuevo del motor no se filtre por herencia descuidada— y
   * **lanza** si detecta una frase prohibida. Lanzar y no limpiar es
   * deliberado: una frase prohibida en el borde significa que algo aguas arriba
   * cambió, y limpiarla en silencio dejaría el cambio sin descubrir. *Fail
   * loudly* (CLAUDE.md §2.3).
   */
  paraElModelo<T>(respuesta: Respuesta<T>): Respuesta<T> {
    const datos = sinConteos(respuesta.datos)
    const frase = contieneFraseProhibida(datos)
    if (frase) {
      throw new Error(
        `[conserje] frase prohibida en la salida de ${respuesta.procedencia.herramienta}: "${frase}". ` +
          'Una reserva sólo es firme cuando está pagada (ADR-0003 §2).',
      )
    }
    return { ...respuesta, datos }
  }
}
