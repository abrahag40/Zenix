import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { TARIFA_CAMBIADA } from '../../public-booking/rate-envelope/rate-envelope.listener'

/**
 * El hotel cambia el precio de un tipo de habitación.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 POR QUÉ HACÍA FALTA, Y POR QUÉ NO EXISTÍA
 *
 * `RoomType.baseRate` es **el número que el motor público cotiza** cuando no
 * hay plan de tarifa publicable — que es el caso de un hotel recién dado de
 * alta, y por tanto el caso normal al empezar. Y `v1/room-types` sólo tenía
 * `@Get()`: se podía LEER el precio y no cambiarlo. El único camino era un
 * script que corre quien despliega.
 *
 * O sea: el hotel podía entrar, ver sus tarifas y sus impuestos, y no podía
 * tocar lo único que de verdad es suyo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LAS TRES COSAS QUE ESTE SERVICIO NO SE SALTA
 *
 * 1. **El inquilino.** Se comprueba que el tipo pertenece a la organización Y
 *    a la propiedad del que pide. Sin eso, cambiar el `:id` de la URL por el
 *    de otro hotel sería cambiarle el precio — *broken object level
 *    authorization*, OWASP API1:2023. La auditoría del 2026-09-22 encontró 338
 *    de 373 rutas sin comprobación de inquilino; ésta no es una de ellas.
 *
 * 2. **El rastro.** Queda escrito quién cambió qué precio, de cuánto a cuánto
 *    y cuándo. Es lo primero que se pregunta cuando un huésped reclama una
 *    tarifa, y sin ello la respuesta es «no sabemos».
 *
 * 3. **El aviso al sitio.** Se emite `rates.changed`, que es lo que dispara el
 *    sobre firmado hacia el sitio del hotel. Sin esa línea, el hotel cambiaría
 *    el precio en Zenix y la web seguiría cotizando el viejo — un fallo
 *    silencioso de los caros, porque el hotel cree que ya está hecho.
 */
@Injectable()
export class PrecioDeTipoService {
  private readonly logger = new Logger(PrecioDeTipoService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventos: EventEmitter2,
  ) {}

  async cambiar(args: {
    roomTypeId: string
    tarifaCentavos: number
    organizationId: string
    propertyId: string
    actorId: string
  }): Promise<{
    roomTypeId: string
    nombre: string
    anteriorCentavos: number
    nuevaCentavos: number
    moneda: string
  }> {
    // 🔴 El `where` lleva organización Y propiedad, no sólo el id. Filtrar
    // después, en código, dejaría una ventana en la que el objeto ya se leyó.
    const tipo = await this.prisma.roomType.findFirst({
      where: {
        id: args.roomTypeId,
        organizationId: args.organizationId,
        propertyId: args.propertyId,
        deletedAt: null,
      },
      select: { id: true, name: true, baseRate: true, currency: true },
    })
    // Mismo mensaje para «no existe» y «no es tuyo»: distinguirlos permitiría
    // averiguar qué identificadores existen en otros hoteles.
    if (!tipo) throw new NotFoundException('Ese tipo de habitación no existe en esta propiedad.')

    const anteriorCentavos = Math.round(Number(tipo.baseRate) * 100)
    if (anteriorCentavos === args.tarifaCentavos) {
      // Guardar lo mismo no es un error, pero tampoco es un cambio: no se
      // escribe, no se audita y no se avisa al sitio. Un rastro lleno de
      // «cambió de 4000 a 4000» es un rastro que nadie lee.
      return {
        roomTypeId: tipo.id,
        nombre: tipo.name,
        anteriorCentavos,
        nuevaCentavos: anteriorCentavos,
        moneda: tipo.currency,
      }
    }

    const nueva = new Prisma.Decimal(args.tarifaCentavos).dividedBy(100)
    await this.prisma.roomType.update({
      where: { id: tipo.id },
      data: { baseRate: nueva },
    })

    // El rastro se escribe DESPUÉS del cambio y sin bloquearlo: un registro
    // que falle no puede deshacer un precio que el hotel ya dio por guardado.
    // A cambio, si falla, se grita — porque un rastro que no está es peor que
    // uno que falta ruidosamente.
    //
    // 🔴 NO se usa `AuditLogService`, y conviene saber por qué: su
    // `actorRealId` es clave foránea a `User` —la identidad de organización—
    // y quien cambia un precio a diario es `Staff`, la de propiedad. La
    // escritura fallaba SIEMPRE, y como ese servicio se traga sus errores a
    // propósito, fallaba en silencio: cero filas y ninguna queja. Se descubrió
    // contando filas en la base después de una prueba real, no leyendo código.
    try {
      await this.prisma.rateChangeLog.create({
        data: {
          propertyId: args.propertyId,
          roomTypeId: tipo.id,
          staffId: args.actorId,
          beforeCents: anteriorCentavos,
          afterCents: args.tarifaCentavos,
          currency: tipo.currency,
          source: 'panel-del-hotel',
        },
      })
    } catch (e) {
      this.logger.error(
        `[precio] cambio de ${tipo.id} guardado pero SIN RASTRO: ${String(e)}`,
      )
    }

    // 🔴 Sin esto el hotel cambia el precio y la web sigue con el viejo.
    this.eventos.emit(TARIFA_CAMBIADA, {
      propertyId: args.propertyId,
      origen: 'precioDeTipo',
    })

    this.logger.log(
      `[precio] ${tipo.name} ${anteriorCentavos} → ${args.tarifaCentavos} ${tipo.currency} ` +
        `por ${args.actorId}`,
    )

    return {
      roomTypeId: tipo.id,
      nombre: tipo.name,
      anteriorCentavos,
      nuevaCentavos: args.tarifaCentavos,
      moneda: tipo.currency,
    }
  }
}
