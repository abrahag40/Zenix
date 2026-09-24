/**
 * El bucle de conversación del conserje — donde se junta todo lo anterior.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * PUERTOS Y ADAPTADORES, Y POR QUÉ IMPORTA AQUÍ MÁS QUE DE COSTUMBRE
 *
 * Este archivo **no importa el SDK de ningún proveedor**. Habla con un
 * `AdaptadorDeModelo`, que es una interfaz de cuatro líneas. El patrón se llama
 * *ports & adapters* (Cockburn, 2005) y no es decoración:
 *
 *  · los precios de los modelos cambiaron dos veces en 2026 y uno de los
 *    candidatos ya tiene anunciada una subida — el reemplazo no es hipotético;
 *  · **y sobre todo: permite probar el bucle entero sin gastar un peso y sin
 *    llave.** Un adaptador simulado devuelve guiones deterministas, así que las
 *    reglas estructurales de abajo se verifican en el CI, en milisegundos.
 *
 * El adaptador real llega cuando haya llave. Cambiar de proveedor es escribir
 * otro adaptador; nada de este archivo se entera.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 LAS INVARIANTES VIVEN AQUÍ, NO EN EL ADAPTADOR
 *
 * Todo lo que un adaptador —o un modelo— podría saltarse si se le dejara:
 *
 *  1. **Tope de vueltas.** Un modelo puede pedir herramientas en bucle. Sin
 *     techo, eso es una factura abierta y una conversación que nunca contesta.
 *  2. **Tope de llamadas.** Lo mismo, contado de otra forma: diez consultas en
 *     un turno no son diligencia, son un fallo.
 *  3. **La procedencia se ACUMULA aquí**, a partir de lo que devolvieron las
 *     herramientas de verdad. No se le pregunta al modelo si consultó: se sabe.
 *  4. **Los guardarraíles son la última puerta**, y no hay camino que los
 *     rodee. Un `return` que se saltara `revisar()` sería el agujero entero.
 *  5. **Fallar cerrado.** Si el adaptador revienta, si se agota el tope, si una
 *     herramienta lanza — sale el texto seguro, nunca un error crudo ni una
 *     respuesta a medias.
 *
 * Ponerlas en el adaptador las dejaría a merced de quien escriba el siguiente.
 */
import { Injectable, Logger } from '@nestjs/common'
import { ConserjeHerramientasService } from './conserje-herramientas.service'
import {
  HERRAMIENTAS,
  PENDIENTES,
  type NombreDeHerramienta,
  type Procedencia,
  type Respuesta,
} from './herramientas'
import { redactarDatosDeTarjeta, revisar, type Hallazgo } from './guardarrailes'

/** Lo que el modelo consumió. Se acumula para el presupuesto por propiedad. */
export interface Uso {
  entrada: number
  salida: number
  cacheLeida: number
  cacheEscrita: number
}

export interface PeticionAlModelo {
  sistema: string
  mensajes: { rol: 'huesped' | 'conserje' | 'herramienta'; contenido: string }[]
  herramientas: NombreDeHerramienta[]
}

export interface LlamadaPedida {
  id: string
  herramienta: string
  argumentos: Record<string, unknown>
}

export interface RespuestaDelModelo {
  /** Texto final. Si viene vacío y hay `llamadas`, el turno continúa. */
  texto: string
  llamadas: LlamadaPedida[]
  uso: Uso
}

/** El puerto. Cuatro líneas, y todo lo específico de un proveedor cabe detrás. */
export interface AdaptadorDeModelo {
  nombre: string
  responder(peticion: PeticionAlModelo): Promise<RespuestaDelModelo>
}

export interface LimitesDelTurno {
  /** Vueltas al modelo. 4 deja margen para consultar, cotizar y contestar. */
  maxVueltas: number
  /** Llamadas a herramientas en todo el turno. */
  maxLlamadas: number
}

export const LIMITES_POR_OMISION: LimitesDelTurno = { maxVueltas: 4, maxLlamadas: 6 }

export interface ResultadoDelTurno {
  texto: string
  permitido: boolean
  hallazgos: Hallazgo[]
  procedencias: Procedencia[]
  uso: Uso
  vueltas: number
  /** Por qué terminó: contestó, se agotó el tope, o falló algo. */
  cierre: 'contesto' | 'tope' | 'error'
}

const VACIO: Uso = { entrada: 0, salida: 0, cacheLeida: 0, cacheEscrita: 0 }
const sumar = (a: Uso, b: Uso): Uso => ({
  entrada: a.entrada + b.entrada,
  salida: a.salida + b.salida,
  cacheLeida: a.cacheLeida + b.cacheLeida,
  cacheEscrita: a.cacheEscrita + b.cacheEscrita,
})

/** Las herramientas que de verdad se le ofrecen: el catálogo menos lo pendiente. */
export const HERRAMIENTAS_OFRECIDAS: NombreDeHerramienta[] = HERRAMIENTAS.filter(
  (h) => !(h in PENDIENTES),
)

@Injectable()
export class ConversacionService {
  private readonly logger = new Logger(ConversacionService.name)

  constructor(private readonly herramientas: ConserjeHerramientasService) {}

  /**
   * Un turno completo: lo que dice el huésped entra, lo que ve el huésped sale.
   *
   * 🔴 La entrada se redacta ANTES de tocar nada: si el huésped tecleó su
   * tarjeta, no entra al modelo, no entra al registro y no entra al historial.
   * Lo que no guardas no se te filtra — y aquí es la única oportunidad, porque
   * después el dato ya viajó.
   */
  async turno(
    slug: string,
    entradaDelHuesped: string,
    historial: PeticionAlModelo['mensajes'],
    modelo: AdaptadorDeModelo,
    opciones: { sistema: string; idioma?: 'es' | 'en'; limites?: LimitesDelTurno } = {
      sistema: '',
    },
  ): Promise<ResultadoDelTurno> {
    const limites = opciones.limites ?? LIMITES_POR_OMISION
    const { texto: entrada, hubo } = redactarDatosDeTarjeta(entradaDelHuesped)
    if (hubo) {
      // Se registra que OCURRIÓ, nunca el dato. Es lo que el hotel necesita
      // para dejar de pedir la tarjeta por chat.
      this.logger.warn(`[conserje] ${slug}: entrada con datos de tarjeta, redactada`)
    }

    const mensajes: PeticionAlModelo['mensajes'] = [
      ...historial,
      { rol: 'huesped', contenido: entrada },
    ]
    const procedencias: Procedencia[] = []
    let uso = VACIO
    let llamadasHechas = 0
    let vueltas = 0

    while (vueltas < limites.maxVueltas) {
      vueltas++
      let r: RespuestaDelModelo
      try {
        r = await modelo.responder({
          sistema: opciones.sistema,
          mensajes,
          herramientas: HERRAMIENTAS_OFRECIDAS,
        })
      } catch (e) {
        // Fallar cerrado. Y NO se le devuelve el error al modelo como texto:
        // entrenado para ser útil, ante un fallo que puede leer tiende a
        // improvisar una respuesta amable. El turno se corta aquí.
        this.logger.error(`[conserje] ${slug}: el adaptador ${modelo.nombre} falló: ${e}`)
        return this.cerrado('error', procedencias, uso, vueltas, opciones.idioma)
      }
      uso = sumar(uso, r.uso)

      if (r.llamadas.length === 0) {
        const v = revisar(r.texto, { procedencias, idioma: opciones.idioma })
        if (!v.permitido) {
          this.logger.warn(
            `[conserje] ${slug}: respuesta bloqueada — ${v.hallazgos.map((h) => h.regla).join(', ')}`,
          )
        }
        return {
          texto: v.texto,
          permitido: v.permitido,
          hallazgos: v.hallazgos,
          procedencias,
          uso,
          vueltas,
          cierre: 'contesto',
        }
      }

      if (llamadasHechas + r.llamadas.length > limites.maxLlamadas) {
        this.logger.warn(`[conserje] ${slug}: tope de llamadas alcanzado`)
        return this.cerrado('tope', procedencias, uso, vueltas, opciones.idioma)
      }

      for (const llamada of r.llamadas) {
        llamadasHechas++
        const resultado = await this.ejecutar(slug, llamada)
        if (resultado.procedencia) procedencias.push(resultado.procedencia)
        mensajes.push({ rol: 'herramienta', contenido: resultado.contenido })
      }
    }

    // Se agotaron las vueltas con el modelo todavía pidiendo herramientas.
    this.logger.warn(`[conserje] ${slug}: tope de vueltas alcanzado`)
    return this.cerrado('tope', procedencias, uso, vueltas, opciones.idioma)
  }

  /**
   * Ejecuta una herramienta pedida por el modelo.
   *
   * 🔴 Dos cosas que este método NO hace, y son deliberadas:
   *  · no confía en el nombre — una herramienta fuera del catálogo se rechaza
   *    en vez de intentarse; el catálogo es cerrado por eso;
   *  · no deja escapar la excepción — un fallo se le devuelve al modelo como
   *    texto de error CONTROLADO, que es distinto de darle el error crudo: el
   *    modelo puede decir «no pude consultar», no inventar el dato.
   */
  private async ejecutar(
    slug: string,
    llamada: LlamadaPedida,
  ): Promise<{ contenido: string; procedencia?: Procedencia }> {
    if (!(HERRAMIENTAS_OFRECIDAS as string[]).includes(llamada.herramienta)) {
      return { contenido: JSON.stringify({ error: 'herramienta no disponible' }) }
    }
    const a = llamada.argumentos as Record<string, string>
    try {
      // `Respuesta<unknown>`: las tres herramientas devuelven formas distintas y
      // aqui sólo se serializan. Fijar el tipo en la union obligaria a un
      // `switch` exhaustivo que no aporta nada — lo que importa del resultado
      // es su sello, y ése sí es del mismo tipo en las tres.
      const r: Respuesta<unknown> =
        llamada.herramienta === 'calendario_del_mes'
          ? await this.herramientas.calendarioDelMes(slug, a.desde, a.hasta, a.roomTypeId)
          : llamada.herramienta === 'cotizar'
            ? await this.herramientas.cotizar(slug, a as never)
            : await this.herramientas.consultarDisponibilidad(slug, a as never)
      const seguro = this.herramientas.paraElModelo(r)
      return { contenido: JSON.stringify(seguro.datos), procedencia: seguro.procedencia }
    } catch (e) {
      this.logger.warn(`[conserje] ${slug}: ${llamada.herramienta} falló: ${e}`)
      return { contenido: JSON.stringify({ error: 'no se pudo consultar ahora' }) }
    }
  }

  /** Cierre seguro: el texto lo pone el guardarraíl, no el modelo ni el error. */
  private cerrado(
    cierre: 'tope' | 'error',
    procedencias: Procedencia[],
    uso: Uso,
    vueltas: number,
    idioma?: 'es' | 'en',
  ): ResultadoDelTurno {
    // Se pasa una cadena que SIEMPRE bloquea, para que el texto de salida salga
    // del mismo sitio que en cualquier otro bloqueo. Un segundo texto «de
    // emergencia» sería una segunda redacción que mantener — y la que se
    // olvidaría de actualizar.
    const v = revisar('reserva confirmada', { procedencias: [], idioma })
    return {
      texto: v.texto,
      permitido: false,
      hallazgos: [{ regla: `cierre-${cierre}`, severidad: 'bloquea', motivo: cierre }],
      procedencias,
      uso,
      vueltas,
      cierre,
    }
  }
}
