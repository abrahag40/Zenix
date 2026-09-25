import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import * as crypto from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { UploadsService } from '../../uploads/uploads.service'
import { CartaDeRegistroService, type DocumentoDeRegistro } from '../contracargos/carta-de-registro.service'
import { RecepcionService } from './recepcion.service'
import { clausulasDeRegistro } from './clausulas'

/**
 * Firmar la carta desde la tableta: sube la firma, la sella y la guarda.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 EL SERVIDOR RECALCULA EL HASH. NO SE FÍA DEL NAVEGADOR.
 *
 * La tableta calcula el hash del PNG y lo manda — está bien, sirve para
 * detectar corrupción en el camino. Pero **la verdad es la del servidor**:
 * aquí se leen los bytes ya guardados y se vuelve a calcular.
 *
 * Si no se hiciera, un cliente manipulado podría mandar el hash de una imagen
 * y subir otra: la huella sellaría algo que no es lo que está guardado, y la
 * carta quedaría rota desde el primer día sin que nadie lo notara. Es el mismo
 * error que sellar la URL, un piso más arriba.
 *
 * Es la regla de siempre: **nada que venga del cliente es un hecho**.
 */
@Injectable()
export class FirmarCartaService {
  private readonly logger = new Logger(FirmarCartaService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly cartas: CartaDeRegistroService,
    private readonly recepcion: RecepcionService,
  ) {}

  async firmar(args: {
    propertyId: string
    estanciaId: string
    firmaBase64: string
    /** El que calculó la tableta. Se usa para CONTRASTAR, no para confiar. */
    hashDelCliente?: string
    otp?: string
    testigoStaffId?: string
    ip?: string
    userAgent?: string
  }): Promise<{ id: string; huella: string; otpVerificado: boolean }> {
    const e = await this.prisma.guestStay.findFirst({
      where: { id: args.estanciaId, propertyId: args.propertyId, cancelledAt: null },
      select: {
        id: true, bookingRef: true, guestName: true, guestEmail: true,
        documentType: true, documentNumber: true,
        checkinAt: true, scheduledCheckout: true,
        totalAmount: true, currency: true,
      },
    })
    if (!e) throw new NotFoundException('No existe esa estancia en este hotel.')

    // `GuestStay` no declara la relación con `Property`, así que se consulta
    // aparte. El nombre del hotel va DENTRO del documento firmado: sin él, la
    // carta no dice ante quién se firmó.
    const prop = await this.prisma.property.findUnique({
      where: { id: args.propertyId },
      select: { name: true },
    })
    const nombreHotel = prop?.name ?? 'el hotel'

    // 1 · Guardar la imagen.
    const subida = await this.uploads.processBase64(args.firmaBase64, 'firmas')

    // 2 · 🔴 Recalcular el hash desde lo GUARDADO, no desde lo recibido.
    const bytes = await this.uploads.leerBytes(subida.url)
    if (!bytes) {
      throw new BadRequestException('La firma se subió pero no se pudo releer para sellarla.')
    }
    const firmaHash = crypto.createHash('sha256').update(bytes).digest('hex')

    if (args.hashDelCliente && args.hashDelCliente !== firmaHash) {
      // No es necesariamente un ataque —puede ser corrupción en el camino—
      // pero en cualquiera de los dos casos hay que enterarse, y el que vale
      // es el del servidor.
      this.logger.warn(
        `[carta] el hash del cliente no coincide con el de lo guardado ` +
          `(estancia ${args.estanciaId}). Se sella el del servidor.`,
      )
    }

    // 3 · El código de un solo uso, si se usó.
    const otp = args.otp ? this.recepcion.verificarOtp(args.estanciaId, args.otp) : { ok: false }
    if (args.otp && !otp.ok) {
      throw new BadRequestException('El código no es correcto o ya caducó. Pide uno nuevo.')
    }

    // 4 · El documento. Se construye AQUÍ y con los datos de la base: si
    // viniera del navegador, el hotel podría hacerle firmar cualquier cosa.
    const noches = Math.max(
      1,
      Math.round((e.scheduledCheckout.getTime() - e.checkinAt.getTime()) / 86_400_000),
    )
    const total = new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: e.currency,
    }).format(Number(e.totalAmount))

    const documento: DocumentoDeRegistro = {
      version: 1,
      hotel: { nombre: nombreHotel },
      huesped: {
        nombre: e.guestName ?? '',
        correo: e.guestEmail ?? undefined,
        // Sólo la terminación, también dentro del documento firmado: no hace
        // falta el número entero para acreditar que se presentó.
        documento:
          e.documentType && e.documentNumber
            ? `${e.documentType} ••••${e.documentNumber.slice(-4)}`
            : undefined,
      },
      estancia: {
        referencia: e.bookingRef ?? args.estanciaId,
        entrada: e.checkinAt.toISOString().slice(0, 10),
        salida: e.scheduledCheckout.toISOString().slice(0, 10),
        noches,
      },
      importe: {
        totalCentavos: Math.round(Number(e.totalAmount) * 100),
        moneda: e.currency,
        impuestosIncluidos: true,
      },
      pago: { pasarela: 'stripe' },
      clausulas: clausulasDeRegistro({
        hotel: nombreHotel,
        totalFormateado: total,
        moneda: e.currency,
      }),
    }

    const r = await this.cartas.sellar({
      propertyId: args.propertyId,
      guestStayId: e.id,
      documento,
      firmaUrl: subida.url,
      firmaHash,
      testigoStaffId: args.testigoStaffId,
      ip: args.ip,
      userAgent: args.userAgent,
      otp: otp.ok ? { verificado: true, canal: otp.canal! } : undefined,
    })

    // La estancia también guarda la referencia, que es lo que mira el
    // expediente de contracargo sin tener que cruzar tablas.
    await this.prisma.guestStay.update({
      where: { id: e.id },
      data: { checkinSignatureUrl: subida.url, checkinSignedAt: new Date() },
    })

    return { ...r, otpVerificado: otp.ok }
  }
}
