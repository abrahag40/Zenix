import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import * as crypto from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * La carta de registro firmada — el papel de la caja, sin la caja.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 LAS CUATRO COSAS QUE HAY QUE PODER DEMOSTRAR
 *
 * Son las mismas en papel y en digital. El papel las resuelve mal y el digital
 * las resuelve bien, pero hay que resolverlas TODAS o no sirve de nada:
 *
 *   1. **QUIÉN firmó** → nombre, identificación registrada, y —si se usa— un
 *      código de un solo uso a su correo o teléfono.
 *   2. **QUÉ firmó** → el documento entero, guardado tal cual se le mostró.
 *   3. **CUÁNDO** → la fecha del acto, y opcionalmente una constancia NOM-151
 *      que la vuelve indiscutible.
 *   4. **QUE NO SE HA TOCADO** → la huella SHA-256, que se puede recalcular.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ SE GUARDA EL DOCUMENTO ENTERO Y NO «PLANTILLA + DATOS»
 *
 * Porque si se guardara la plantilla, cambiarla mañana cambiaría lo que parece
 * que el huésped firmó ayer. En una disputa eso no se puede explicar. Lo que
 * firmó es este JSON, y **no se regenera nunca**: se lee.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA BASE LEGAL, EN CORTO
 *
 * · **Código de Comercio 89** — la firma electrónica son los datos asociados a
 *   un mensaje de datos que identifican al firmante y demuestran que aprueba la
 *   información. No exige una tecnología concreta.
 * · **89 bis** — «no se negarán efectos jurídicos, validez o fuerza obligatoria
 *   a cualquier tipo de información por la sola razón de que esté contenida en
 *   un Mensaje de Datos».
 * · **NOM-151-SCFI-2016** — la constancia de conservación la emite un
 *   prestador de servicios de certificación acreditado, con huella, sello de
 *   tiempo RFC 3161 y serial único, y dura **al menos diez años**, que es el
 *   plazo del artículo 49 del Código de Comercio.
 *
 * ⚠️ Esto es ingeniería, no asesoría legal. El texto de la carta y su cláusula
 * de autorización los tiene que revisar un abogado antes de usarse con un
 * huésped real.
 */

export interface DocumentoDeRegistro {
  /** Versión del formato. Si cambia, los viejos se leen con su versión. */
  version: 1
  hotel: { nombre: string; rfc?: string; direccion?: string }
  huesped: { nombre: string; correo?: string; documento?: string }
  estancia: {
    referencia: string
    entrada: string
    salida: string
    noches: number
    habitacion?: string
  }
  importe: { totalCentavos: number; moneda: string; impuestosIncluidos: boolean }
  pago: { pasarela: string; ultimos4?: string; referenciaExterna?: string }
  /** Lo que el huésped acepta al firmar. Literal, no un enlace. */
  clausulas: string[]
}

@Injectable()
export class CartaDeRegistroService {
  private readonly logger = new Logger(CartaDeRegistroService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Canonicaliza y calcula la huella.
   *
   * 🔴 Las claves se ordenan SIEMPRE. `JSON.stringify` conserva el orden de
   * inserción, así que dos objetos con los mismos datos y distinto orden darían
   * huellas distintas y la verificación fallaría sin que nada esté mal. Es el
   * fallo clásico de firmar JSON, y se evita con seis líneas.
   */
  static huellaDe(documento: unknown, firmaUrl: string | null): string {
    const canon = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(canon)
      if (v && typeof v === 'object') {
        return Object.fromEntries(
          Object.keys(v as Record<string, unknown>)
            .sort()
            .map((k) => [k, canon((v as Record<string, unknown>)[k])]),
        )
      }
      return v
    }
    // La firma entra en la huella: sellar sólo el texto dejaría cambiar la
    // imagen de la firma sin que la huella lo note.
    const payload = JSON.stringify({ documento: canon(documento), firmaUrl: firmaUrl ?? null })
    return crypto.createHash('sha256').update(payload, 'utf8').digest('hex')
  }

  /** Guarda la carta firmada. Una por estancia, y no se sobrescribe. */
  async sellar(args: {
    propertyId: string
    guestStayId: string
    documento: DocumentoDeRegistro
    firmaUrl: string | null
    testigoStaffId?: string
    ip?: string
    userAgent?: string
    otp?: { verificado: boolean; canal: string }
  }): Promise<{ id: string; huella: string }> {
    if (!args.firmaUrl && !args.otp?.verificado) {
      // Una carta sin firma y sin código verificado no acredita a nadie: sería
      // un documento que el hotel se escribió a sí mismo. Se para aquí en vez
      // de descubrirlo el día de la disputa.
      throw new BadRequestException(
        'La carta necesita al menos la firma del huésped o un código verificado: ' +
          'sin uno de los dos no acredita quién la aceptó.',
      )
    }

    const ya = await this.prisma.registrationRecord.findUnique({
      where: { guestStayId: args.guestStayId },
      select: { id: true, huella: true },
    })
    if (ya) {
      // 🔴 NO se sobrescribe. Dos cartas para una estancia serían dos versiones
      // de lo que el huésped firmó, y eso en una disputa no se puede explicar.
      // Si de verdad hay que rehacerla, se anula la estancia y se rehace.
      this.logger.warn(`[carta] la estancia ${args.guestStayId} ya tiene carta; no se sobrescribe.`)
      return ya
    }

    const huella = CartaDeRegistroService.huellaDe(args.documento, args.firmaUrl)
    const r = await this.prisma.registrationRecord.create({
      data: {
        propertyId: args.propertyId,
        guestStayId: args.guestStayId,
        documento: args.documento as unknown as object,
        huella,
        firmaUrl: args.firmaUrl,
        firmadoEn: new Date(),
        testigoStaffId: args.testigoStaffId,
        ip: args.ip,
        userAgent: args.userAgent,
        otpVerificado: args.otp?.verificado ?? false,
        otpCanal: args.otp?.canal,
        otpVerificadoEn: args.otp?.verificado ? new Date() : null,
      },
      select: { id: true, huella: true },
    })
    this.logger.log(`[carta] sellada estancia=${args.guestStayId} huella=${huella.slice(0, 12)}…`)
    return r
  }

  /**
   * Comprueba que la carta no se ha tocado desde que se firmó.
   *
   * Es lo que hace que la huella sirva de algo: guardarla y no volver a
   * mirarla nunca es guardar un número.
   */
  async verificar(guestStayId: string): Promise<{
    integra: boolean
    huellaGuardada: string
    huellaRecalculada: string
    conConstanciaNom151: boolean
  }> {
    const r = await this.prisma.registrationRecord.findUnique({ where: { guestStayId } })
    if (!r) throw new NotFoundException('Esa estancia no tiene carta de registro.')
    const recalculada = CartaDeRegistroService.huellaDe(r.documento, r.firmaUrl)
    const integra = recalculada === r.huella
    if (!integra) {
      // Que esto pase significa que alguien tocó la fila. Merece un grito.
      this.logger.error(
        `[carta] 🔴 INTEGRIDAD ROTA en la estancia ${guestStayId}: ` +
          `guardada ${r.huella.slice(0, 12)}… recalculada ${recalculada.slice(0, 12)}…`,
      )
    }
    return {
      integra,
      huellaGuardada: r.huella,
      huellaRecalculada: recalculada,
      conConstanciaNom151: !!r.nom151Serial,
    }
  }
}
