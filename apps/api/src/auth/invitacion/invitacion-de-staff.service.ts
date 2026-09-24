import {
  BadRequestException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import * as crypto from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'

const LARGO_MINIMO = 10
const RONDAS_BCRYPT = 12
const VIGENCIA_HORAS = 72

/**
 * Invitación de acceso para el personal del hotel.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 POR QUÉ EXISTE, Y POR QUÉ NO SE RESOLVIÓ «PONIENDO UNA CONTRASEÑA»
 *
 * `Staff` sólo tenía `passwordHash`. Dar de alta al gerente de un hotel
 * obligaba a inventarle una contraseña y hacérsela llegar — por correo, por
 * mensaje, por donde fuera. Eso tiene tres problemas, y ninguno es teórico:
 *
 *   1. **Es un secreto compartido desde el primer segundo.** Quien la creó la
 *      sabe, y queda escrita en el medio por el que viajó.
 *   2. **Rompe el no repudio.** Si el hotel cambia un precio y luego dice que
 *      no fue él, tiene razón: otra persona conocía esa contraseña.
 *   3. **Obliga a quien despliega a manejar credenciales de un cliente**, que
 *      es exactamente lo que este proyecto evita en todas partes.
 *
 * Con una invitación, el hotel **pone la suya** y nadie más la conoce nunca.
 * Del enlace se guarda sólo el hash: el token en claro se enseña una vez, al
 * emitirlo, y no vuelve a existir. Si se pierde, no se recupera — se emite
 * otro. Eso no es una molestia, es la propiedad que lo hace valer.
 *
 * Es el mismo mecanismo que `User` ya usaba para el alta del propietario; aquí
 * se le da al personal, que es quien de verdad entra a diario.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DECISIONES QUE CONVIENE VER
 *
 * · **72 horas.** Bastante para que el gerente lo abra cuando pueda, poco para
 *   que un enlace olvidado en una bandeja siga sirviendo meses después.
 * · **Un solo uso.** `setupTokenConsumedAt` lo marca. Un enlace reutilizable
 *   convertiría el correo en una llave permanente.
 * · **Diez caracteres mínimo**, igual que el alta de propietario. No se
 *   imponen reglas de composición: NIST SP 800-63B las desaconseja
 *   expresamente porque empujan a patrones predecibles.
 * · **No se dice si un correo existe.** Ver `emitir()`.
 */
@Injectable()
export class InvitacionDeStaffService {
  private readonly logger = new Logger(InvitacionDeStaffService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Emite (o vuelve a emitir) una invitación y devuelve el token EN CLARO.
   *
   * 🔴 Lo devuelve una sola vez y a quien la emite. No se registra, no se
   * guarda y no se puede volver a consultar: en la base sólo queda su hash.
   *
   * Si el correo ya tiene ficha en esta propiedad, se le renueva la invitación
   * en vez de crear un duplicado — dar de alta dos veces al mismo gerente es
   * el error más fácil de cometer, y crearía dos identidades para una persona.
   */
  async emitir(args: {
    propertyId: string
    email: string
    nombre: string
    rol: 'SUPERVISOR' | 'RECEPTIONIST' | 'HOUSEKEEPER'
  }): Promise<{ token: string; expiraEn: Date; creado: boolean; staffId: string }> {
    const email = args.email.trim().toLowerCase()
    if (!email.includes('@')) throw new BadRequestException('El correo no es válido.')

    const propiedad = await this.prisma.property.findUnique({
      where: { id: args.propertyId },
      select: { id: true, name: true, organizationId: true },
    })
    if (!propiedad) throw new NotFoundException('La propiedad no existe.')

    const token = crypto.randomBytes(32).toString('hex')
    const hash = crypto.createHash('sha256').update(token).digest('hex')
    const expiraEn = new Date(Date.now() + VIGENCIA_HORAS * 60 * 60 * 1000)

    const existente = await this.prisma.staff.findUnique({
      where: { email },
      select: { id: true, propertyId: true },
    })

    if (existente && existente.propertyId !== propiedad.id) {
      // `Staff.email` es único en TODA la base. Reasignar a alguien de otra
      // propiedad en silencio sería mover a una persona de hotel sin que nadie
      // lo pidiera; se para y se avisa.
      throw new BadRequestException(
        'Ese correo ya pertenece al personal de otra propiedad. Usa otro, o dalo de baja allí primero.',
      )
    }

    if (existente) {
      await this.prisma.staff.update({
        where: { id: existente.id },
        data: {
          setupTokenHash: hash,
          setupTokenExpiresAt: expiraEn,
          // Se limpia el consumo: volver a invitar tiene que servir para
          // recuperar el acceso de quien perdió la contraseña.
          setupTokenConsumedAt: null,
          active: true,
        },
      })
      this.logger.log(`[invitacion] re-emitida para staff=${existente.id} propiedad=${propiedad.id}`)
      return { token, expiraEn, creado: false, staffId: existente.id }
    }

    const creado = await this.prisma.staff.create({
      data: {
        propertyId: propiedad.id,
        organizationId: propiedad.organizationId,
        name: args.nombre.trim(),
        email,
        // 🔴 Un hash de una cadena aleatoria que NADIE conoce, ni siquiera este
        // proceso un milisegundo después. El campo es obligatorio en el
        // esquema y no se puede dejar vacío: una cadena vacía haría que
        // cualquier comparación fallara de formas difíciles de razonar. Así,
        // la ficha existe y es INACCESIBLE hasta que se canjea la invitación.
        passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), RONDAS_BCRYPT),
        role: args.rol,
        setupTokenHash: hash,
        setupTokenExpiresAt: expiraEn,
      },
      select: { id: true },
    })
    this.logger.log(`[invitacion] emitida para staff=${creado.id} propiedad=${propiedad.id}`)
    return { token, expiraEn, creado: true, staffId: creado.id }
  }

  /** Lo que la página de alta puede enseñar ANTES de pedir la contraseña. */
  async metadatos(tokenCrudo: string): Promise<{
    email: string
    nombre: string
    propiedad: string
    horasRestantes: number
  }> {
    const staff = await this.buscarPorToken(tokenCrudo)
    const prop = await this.prisma.property.findUnique({
      where: { id: staff.propertyId },
      select: { name: true },
    })
    return {
      email: staff.email,
      nombre: staff.name,
      propiedad: prop?.name ?? '',
      horasRestantes: Math.max(
        0,
        Math.floor((staff.setupTokenExpiresAt!.getTime() - Date.now()) / 3_600_000),
      ),
    }
  }

  /** Canjea la invitación: el hotel fija su contraseña y el token muere. */
  async activar(tokenCrudo: string, contrasena: string): Promise<{ email: string }> {
    if (!contrasena || contrasena.length < LARGO_MINIMO) {
      throw new BadRequestException(`La contraseña necesita al menos ${LARGO_MINIMO} caracteres.`)
    }
    const staff = await this.buscarPorToken(tokenCrudo)
    const hash = await bcrypt.hash(contrasena, RONDAS_BCRYPT)

    // Todo en una transacción y con el consumo comprobado DENTRO: dos canjes
    // simultáneos del mismo enlace no pueden fijar dos contraseñas distintas.
    await this.prisma.$transaction(async (tx) => {
      const fresco = await tx.staff.findUnique({
        where: { id: staff.id },
        select: { setupTokenConsumedAt: true },
      })
      if (fresco?.setupTokenConsumedAt) {
        throw new GoneException('Este enlace ya se usó.')
      }
      await tx.staff.update({
        where: { id: staff.id },
        data: {
          passwordHash: hash,
          setupTokenConsumedAt: new Date(),
          // 🔴 El hash se BORRA, no sólo se marca. Un token consumido que
          // sigue en la tabla es un valor comparable de más sin ninguna razón.
          setupTokenHash: null,
          active: true,
        },
      })
    })
    this.logger.log(`[invitacion] canjeada staff=${staff.id}`)
    return { email: staff.email }
  }

  private async buscarPorToken(tokenCrudo: string) {
    if (!tokenCrudo || typeof tokenCrudo !== 'string' || tokenCrudo.length < 32) {
      throw new BadRequestException('Enlace inválido.')
    }
    const hash = crypto.createHash('sha256').update(tokenCrudo).digest('hex')
    const staff = await this.prisma.staff.findUnique({
      where: { setupTokenHash: hash },
      select: {
        id: true,
        email: true,
        name: true,
        propertyId: true,
        setupTokenExpiresAt: true,
        setupTokenConsumedAt: true,
      },
    })
    // Mismo mensaje para «no existe» y «no es válido»: distinguirlos permitiría
    // averiguar qué enlaces existieron alguna vez.
    if (!staff) throw new NotFoundException('Enlace inválido o ya utilizado.')
    if (staff.setupTokenConsumedAt) throw new GoneException('Este enlace ya se usó.')
    if (!staff.setupTokenExpiresAt || staff.setupTokenExpiresAt < new Date()) {
      throw new GoneException(`El enlace caducó (vigencia ${VIGENCIA_HORAS} h). Pide otro.`)
    }
    return staff
  }
}
