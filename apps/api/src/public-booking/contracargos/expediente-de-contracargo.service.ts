import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * El expediente de un contracargo: la evidencia que Zenix ya tiene, ordenada
 * como Stripe la pide, y —sobre todo— **lo que falta**.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 EL CASO QUE ESTO RESUELVE
 *
 * El huésped se hospeda, todo va bien, se va contento. Semanas después llama a
 * su banco y dice que no reconoce el cargo. El banco le devuelve el dinero de
 * inmediato, se lo quita al hotel, **y encima le cobra una comisión por
 * disputa**. El hotel se entera cuando ya le sacaron el dinero.
 *
 * Se llama *fraude amistoso* (*friendly fraud* o *first-party misuse*), y es la
 * forma de contracargo más común en hotelería precisamente porque el servicio
 * ya se prestó y no queda un paquete que rastrear.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ UN EXPEDIENTE Y NO «ya buscaremos los papeles»
 *
 * Tres hechos, de la documentación de Stripe:
 *
 * 1. **El plazo para responder es de 7 a 21 días** según la red. Quien empieza
 *    a buscar la firma del registro cuando llega el aviso, ya perdió.
 * 2. **Sólo hay UNA oportunidad de responder.** No se puede corregir ni añadir
 *    después. Un expediente incompleto enviado con prisa es un caso perdido.
 * 3. En los servicios futuros —una reserva de hotel lo es— **el plazo del
 *    huésped empieza en la FECHA DE LA ESTANCIA, no en la del pago**. Alguien
 *    puede disputar una reserva hecha en enero para un viaje de agosto… en
 *    diciembre.
 *
 * Por eso esto se arma **cuando se cobra**, no cuando se disputa.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Y LO MÁS ÚTIL: DECIR LO QUE FALTA
 *
 * Un expediente que sólo enseña lo que hay es un informe. Lo que le sirve al
 * hotel es saber que **no tiene la firma del huésped**, y saberlo el día del
 * check-in —cuando aún puede pedirla— y no tres meses después.
 */

/** Los nombres son los de la API de Stripe, a propósito: se mandan tal cual. */
export interface EvidenciaDeDisputa {
  /** Fecha en que empezó el servicio. El check-in real, si lo hay. */
  service_date?: string
  /** Prueba de que el servicio se prestó, legible por un humano. */
  service_documentation?: string
  customer_name?: string
  customer_email_address?: string
  /** Demuestra que la compra salió de un dispositivo real. */
  customer_purchase_ip?: string
  /** 🔴 La pieza que gana el caso del fraude amistoso. */
  customer_signature?: string
  /** Correos y mensajes con el huésped. */
  customer_communication?: string
  /** El argumento, en prosa. Es lo que de verdad lee quien decide. */
  uncategorized_text?: string
}

export interface Expediente {
  bookingRef: string
  evidencia: EvidenciaDeDisputa
  /** Lo que falta, en lenguaje que el hotel entiende. */
  faltantes: string[]
  /** De 0 a 100. No es una probabilidad: es cuánta evidencia hay. */
  solidez: number
}

@Injectable()
export class ExpedienteDeContracargoService {
  private readonly logger = new Logger(ExpedienteDeContracargoService.name)

  constructor(private readonly prisma: PrismaService) {}

  async armar(args: { propertyId: string; bookingRef: string }): Promise<Expediente> {
    const e = await this.prisma.guestStay.findFirst({
      where: { bookingRef: args.bookingRef, propertyId: args.propertyId },
      select: {
        bookingRef: true, guestName: true, guestEmail: true, guestPhone: true,
        documentType: true, documentNumber: true,
        checkinAt: true, actualCheckin: true, actualCheckout: true, scheduledCheckout: true,
        checkinSignatureUrl: true, checkinSignedAt: true, purchaseIp: true,
        totalAmount: true, amountPaid: true, currency: true,
        paymentStatus: true, source: true, cancelledAt: true, createdAt: true,
      },
    })
    if (!e) throw new NotFoundException('No existe esa reserva en esta propiedad.')

    const faltantes: string[] = []
    const ev: EvidenciaDeDisputa = {}

    // ── service_date: la fecha en que el servicio EMPEZÓ ──────────────────
    // Se prefiere el check-in REAL sobre el previsto: lo que hay que probar es
    // que el huésped vino, no que se le esperaba.
    const llegada = e.actualCheckin ?? null
    if (llegada) ev.service_date = llegada.toISOString().slice(0, 10)
    else faltantes.push('No hay check-in registrado: sin eso no se puede probar que el huésped llegó.')

    if (e.guestName) ev.customer_name = e.guestName
    if (e.guestEmail) ev.customer_email_address = e.guestEmail
    else faltantes.push('Falta el correo del huésped.')

    if (e.purchaseIp) ev.customer_purchase_ip = e.purchaseIp
    else faltantes.push('No se guardó la IP desde la que reservó.')

    // ── customer_signature: firma Y/O detalles de la identificación ───────
    // Stripe acepta las dos cosas bajo esta evidencia. Zenix ya guardaba la
    // identificación; la firma es lo que faltaba.
    const partes: string[] = []
    if (e.checkinSignatureUrl) {
      partes.push(`Firma del huésped al registrarse (${e.checkinSignedAt?.toISOString() ?? 'sin fecha'}).`)
    } else {
      faltantes.push('🔴 FALTA LA FIRMA DEL REGISTRO. Es la evidencia más fuerte contra un contracargo por fraude.')
    }
    if (e.documentType && e.documentNumber) {
      // No se escribe el número completo: para la disputa basta acreditar que
      // se presentó y se registró una identificación. Volcarlo entero sería
      // repartir un dato personal en un expediente que va a un banco.
      partes.push(
        `Identificación presentada al registrarse: ${e.documentType}, ` +
          `terminación ${e.documentNumber.slice(-4)}.`,
      )
    } else {
      faltantes.push('No se registró la identificación del huésped.')
    }
    if (partes.length) ev.customer_signature = partes.join(' ')

    // ── service_documentation: la prueba de que el servicio se prestó ─────
    const noches = Math.max(
      1,
      Math.round(
        ((e.actualCheckout ?? e.scheduledCheckout).getTime() - (llegada ?? e.checkinAt).getTime()) /
          86_400_000,
      ),
    )
    ev.service_documentation = [
      `Reserva ${e.bookingRef}.`,
      `Huésped: ${e.guestName}.`,
      `Entrada: ${(llegada ?? e.checkinAt).toISOString().slice(0, 16).replace('T', ' ')}.`,
      e.actualCheckout
        ? `Salida: ${e.actualCheckout.toISOString().slice(0, 16).replace('T', ' ')}.`
        : 'Salida: no registrada.',
      `${noches} noche(s).`,
      `Total ${e.totalAmount} ${e.currency}, pagado ${e.amountPaid}.`,
      e.source ? `Canal: ${e.source}.` : '',
    ].filter(Boolean).join(' ')

    if (!e.actualCheckout) {
      faltantes.push('No hay check-out registrado: debilita la prueba de que la estancia se consumió.')
    }

    // ── uncategorized_text: el argumento. Lo que de verdad lee quien decide ─
    ev.uncategorized_text = this.redactarArgumento({
      ref: e.bookingRef ?? args.bookingRef,
      nombre: e.guestName ?? 'el huésped',
      llegada,
      salida: e.actualCheckout,
      noches,
      cancelada: !!e.cancelledAt,
      tieneFirma: !!e.checkinSignatureUrl,
      tieneIdentificacion: !!(e.documentType && e.documentNumber),
    })

    // La solidez cuenta las piezas que Stripe llama «evidencia convincente»
    // para un servicio fuera de línea. No es una probabilidad de ganar —eso no
    // lo sabe nadie— sino cuánta evidencia hay.
    //
    // 🔴 LA FIRMA CUENTA APARTE DE LA IDENTIFICACIÓN, y lo descubrió una
    // prueba: con sólo los datos del documento, `customer_signature` ya venía
    // relleno y el expediente se daba por completo. Pero Stripe las lista como
    // dos evidencias distintas, y la firma es la fuerte: acredita que ESA
    // persona aceptó el cargo, no sólo que alguien enseñó un papel.
    //
    // Un marcador que dice 100 % cuando falta la pieza que gana el caso es
    // peor que no tener marcador.
    const piezas = [
      !!ev.service_date,
      !!e.checkinSignatureUrl,
      !!(e.documentType && e.documentNumber),
      !!ev.service_documentation,
      !!ev.customer_purchase_ip,
    ]
    const solidez = Math.round((piezas.filter(Boolean).length / piezas.length) * 100)

    return { bookingRef: e.bookingRef ?? args.bookingRef, evidencia: ev, faltantes, solidez }
  }

  /**
   * El argumento en prosa.
   *
   * 🔴 Se escribe en frases cortas y con fechas porque **lo lee una persona en
   * el banco emisor, con minutos por caso**. Stripe es explícito en que no se
   * incluyan enlaces, audio ni vídeo: no los abren. Lo que convence es una
   * cronología clara que contradiga el reclamo.
   */
  private redactarArgumento(d: {
    ref: string
    nombre: string
    llegada: Date | null
    salida: Date | null
    noches: number
    cancelada: boolean
    tieneFirma: boolean
    tieneIdentificacion: boolean
  }): string {
    const f = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : 'sin registro')
    const l: string[] = []
    l.push(`El huésped ${d.nombre} reservó con la referencia ${d.ref}.`)
    if (d.llegada) {
      l.push(`Se presentó en el hotel y se registró el ${f(d.llegada)}.`)
      if (d.tieneIdentificacion) l.push('Presentó identificación oficial, que quedó registrada.')
      if (d.tieneFirma) l.push('Firmó la tarjeta de registro a su llegada.')
    }
    if (d.salida) l.push(`Ocupó la habitación ${d.noches} noche(s) y salió el ${f(d.salida)}.`)
    if (d.cancelada) l.push('La reserva figura cancelada; revisar antes de impugnar.')
    l.push('El servicio se prestó en su totalidad y no hubo reclamación durante la estancia.')
    return l.join(' ')
  }
}
