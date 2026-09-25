import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import * as crypto from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { generarCodigo, normalizar } from './codigo-corto'

const OTP_LARGO = 6
const OTP_VIGENCIA_MS = 10 * 60 * 1000
const OTP_INTENTOS = 3
/** Búsquedas fallidas por sesión antes de cortar. Ver `registrarFallo`. */
const FALLOS_ANTES_DE_CORTAR = 10

interface IntentoOtp {
  hash: string
  expiraEn: number
  intentos: number
  canal: string
}

/**
 * Lo que pasa en la tableta de recepción.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EL FLUJO, QUE ES EL QUE ABRAHAM DESCRIBIÓ
 *
 *   teclear el código → aparece la reserva → confirmar los datos → firmar
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 Y LAS TRES DEFENSAS QUE VAN DENTRO, NO ENCIMA
 *
 * **Acotado a la propiedad.** La búsqueda usa la propiedad de la sesión, nunca
 * una que venga en la petición. Sin esto, un recepcionista podría leer reservas
 * de otro hotel tecleando códigos — y el código es corto a propósito.
 *
 * **El carácter de control se comprueba antes de tocar la base.** Un código mal
 * formado ni se consulta: probar a lo bruto cuesta 29 veces más, y de paso el
 * recepcionista que teclea mal recibe «código inválido» en vez de la reserva de
 * otro huésped.
 *
 * **Límite de fallos por sesión.** Diez búsquedas sin resultado y se corta. No
 * es por la fuerza bruta remota —para eso está la sesión— sino porque un
 * empleado curioso probando códigos es el atacante más probable de todos.
 */
@Injectable()
export class RecepcionService {
  private readonly logger = new Logger(RecepcionService.name)

  /**
   * ⚠️ En memoria, y por tanto por instancia. Sirve mientras Zenix corra en un
   * proceso; con varias réplicas hay que moverlo a Redis. Se dice aquí para
   * que nadie descubra el límite de la defensa el día que escale.
   */
  private readonly otps = new Map<string, IntentoOtp>()
  private readonly fallos = new Map<string, number>()

  constructor(private readonly prisma: PrismaService) {}

  /** Asigna un código libre a una estancia. Reintenta si colisiona. */
  async asignarCodigo(args: { propertyId: string; guestStayId: string }): Promise<string> {
    for (let i = 0; i < 12; i++) {
      const codigo = generarCodigo()
      const ocupado = await this.prisma.guestStay.findFirst({
        where: { propertyId: args.propertyId, shortCode: codigo },
        select: { id: true },
      })
      if (ocupado) continue
      await this.prisma.guestStay.update({
        where: { id: args.guestStayId },
        data: { shortCode: codigo },
      })
      return codigo
    }
    // Con 29^5 combinaciones esto no debería pasar nunca. Si pasa, es señal de
    // que el generador dejó de ser aleatorio — y eso se grita, no se reintenta
    // en bucle.
    this.logger.error(`[recepcion] 12 colisiones seguidas generando código en ${args.propertyId}`)
    throw new BadRequestException('No se pudo asignar un código. Inténtalo de nuevo.')
  }

  /**
   * Busca la reserva por el código tecleado.
   *
   * Devuelve SÓLO lo que el recepcionista necesita confirmar con el huésped
   * delante. Nada de importes internos, ni referencias de pasarela, ni el
   * número de identificación completo.
   */
  async buscar(args: { propertyId: string; sesionId: string; tecleado: string }) {
    const codigo = normalizar(args.tecleado)
    if (!codigo) {
      // 🔴 Ni se consulta la base. El control lo rechaza antes.
      throw new BadRequestException('El código no es válido. Revísalo y vuelve a teclearlo.')
    }
    this.comprobarFallos(args.sesionId)

    const e = await this.prisma.guestStay.findFirst({
      // La propiedad viene de la SESIÓN. Si viniera de la petición, cambiarla
      // sería leer las reservas de otro hotel.
      where: { propertyId: args.propertyId, shortCode: codigo, cancelledAt: null },
      select: {
        id: true, bookingRef: true, shortCode: true,
        guestName: true, guestEmail: true, guestPhone: true,
        documentType: true, documentNumber: true,
        checkinAt: true, scheduledCheckout: true, actualCheckin: true,
        totalAmount: true, currency: true, paymentStatus: true,
        registrationRecord: { select: { id: true, firmadoEn: true } },
      },
    })
    if (!e) {
      this.registrarFallo(args.sesionId)
      throw new NotFoundException('No hay ninguna reserva con ese código en este hotel.')
    }
    this.fallos.delete(args.sesionId)

    return {
      estanciaId: e.id,
      codigo: e.shortCode,
      referencia: e.bookingRef,
      huesped: {
        nombre: e.guestName,
        // Se enseña enmascarado: el recepcionista confirma, no transcribe.
        correo: enmascararCorreo(e.guestEmail),
        telefono: e.guestPhone ? `••••${e.guestPhone.slice(-4)}` : null,
        identificacion:
          e.documentType && e.documentNumber
            ? `${e.documentType} ••••${e.documentNumber.slice(-4)}`
            : null,
      },
      estancia: {
        entrada: e.checkinAt,
        salida: e.scheduledCheckout,
        yaRegistrado: !!e.actualCheckin,
      },
      importe: { total: String(e.totalAmount), moneda: e.currency, estado: e.paymentStatus },
      // Si ya hay carta, la tableta enseña «ya firmada» en vez de ofrecer
      // firmar otra vez: una estancia, una carta.
      cartaFirmadaEn: e.registrationRecord?.firmadoEn ?? null,
    }
  }

  /**
   * Emite el código de un solo uso.
   *
   * 🔴 Se guarda el HASH, no el código. Si alguien lee la memoria o un volcado,
   * no se lleva códigos usables. Es la misma razón por la que no se guardan
   * contraseñas en claro, y aquí vale igual aunque duren diez minutos.
   */
  async emitirOtp(args: { estanciaId: string; canal: 'correo' | 'sms' }): Promise<string> {
    // Seis dígitos. Con tres intentos y diez minutos, adivinarlo es 3 entre un
    // millón; alargarlo molestaría al huésped sin ganar nada real.
    const codigo = String(crypto.randomInt(0, 10 ** OTP_LARGO)).padStart(OTP_LARGO, '0')
    this.otps.set(args.estanciaId, {
      hash: crypto.createHash('sha256').update(codigo).digest('hex'),
      expiraEn: Date.now() + OTP_VIGENCIA_MS,
      intentos: 0,
      canal: args.canal,
    })
    this.logger.log(`[recepcion] OTP emitido para ${args.estanciaId} por ${args.canal}`)
    // Lo devuelve para que el módulo de notificaciones lo envíe. NO se registra.
    return codigo
  }

  /** Comprueba el código que el huésped dictó. Consume el intento. */
  verificarOtp(estanciaId: string, tecleado: string): { ok: boolean; canal?: string } {
    const i = this.otps.get(estanciaId)
    if (!i) return { ok: false }
    if (Date.now() > i.expiraEn) {
      this.otps.delete(estanciaId)
      return { ok: false }
    }
    i.intentos++
    if (i.intentos > OTP_INTENTOS) {
      // Se quema al tercer fallo. Sin esto, seis dígitos son adivinables.
      this.otps.delete(estanciaId)
      this.logger.warn(`[recepcion] OTP de ${estanciaId} quemado por exceso de intentos`)
      return { ok: false }
    }
    const hash = crypto.createHash('sha256').update(tecleado ?? '').digest('hex')
    // Comparación en tiempo constante: comparar cadenas con `===` filtra por
    // dónde difieren. Aquí importa poco, pero es gratis hacerlo bien.
    const ok =
      hash.length === i.hash.length &&
      crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(i.hash))
    if (ok) this.otps.delete(estanciaId)
    return ok ? { ok: true, canal: i.canal } : { ok: false }
  }

  private comprobarFallos(sesionId: string) {
    if ((this.fallos.get(sesionId) ?? 0) >= FALLOS_ANTES_DE_CORTAR) {
      this.logger.warn(`[recepcion] sesión ${sesionId} cortada por búsquedas fallidas`)
      throw new ForbiddenException(
        'Demasiadas búsquedas sin resultado. Espera un momento o pide ayuda.',
      )
    }
  }

  private registrarFallo(sesionId: string) {
    this.fallos.set(sesionId, (this.fallos.get(sesionId) ?? 0) + 1)
  }
}

/** `maria@ejemplo.com` → `ma••••@ejemplo.com`. Bastante para confirmar. */
function enmascararCorreo(c: string | null): string | null {
  if (!c || !c.includes('@')) return null
  const [u, d] = c.split('@')
  return `${u.slice(0, 2)}${'•'.repeat(Math.max(2, u.length - 2))}@${d}`
}
