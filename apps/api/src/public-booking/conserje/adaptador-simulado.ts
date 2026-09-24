import type { AdaptadorDeModelo, PeticionAlModelo, RespuestaDelModelo, Uso } from './conversacion'

/**
 * El adaptador SIMULADO: un modelo de guion, sin red y sin coste.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ES EL ADAPTADOR POR OMISIÓN Y NO UN JUGUETE DE PRUEBAS
 *
 * Es el mismo criterio que Zentor ya usa en `packages/ai`: **sin llave, sin
 * coste, y el arranque no degrada en silencio**. Aquí gana tres cosas:
 *
 *  1. **El bucle entero se prueba en el CI**, en milisegundos y sin gastar. Las
 *     invariantes de `conversacion.ts` —topes, procedencia, guardarraíles,
 *     fallar cerrado— se verifican sin depender de que un modelo se porte de
 *     cierta manera, que es justo lo que no se puede asumir.
 *  2. **Permite guionizar lo que un modelo real haría MAL.** Un modelo bueno no
 *     te da el caso adversario cuando lo necesitas; un guion sí, siempre, y de
 *     forma reproducible. Es la diferencia entre probar y esperar.
 *  3. **Deja el hueco del adaptador real medido por dentro**: cuando llegue, ya
 *     hay una suite que dice qué tiene que cumplir.
 *
 * 🔴 Lo que NO es: un sustituto del modelo. No prueba si el conserje contesta
 * bien; prueba que **si contesta mal, el sistema aguanta**. Son dos preguntas
 * distintas y sólo la segunda se puede responder sin gastar.
 */

/** Un turno guionizado. `llamadas` vacío ⇒ el modelo contesta y el turno cierra. */
export interface ActoDelGuion {
  texto?: string
  llamadas?: { herramienta: string; argumentos?: Record<string, unknown> }[]
  /** Para probar el camino de fallo del adaptador. */
  lanza?: string
  uso?: Partial<Uso>
}

const USO_TIPICO: Uso = { entrada: 1200, salida: 180, cacheLeida: 10000, cacheEscrita: 0 }

export class AdaptadorSimulado implements AdaptadorDeModelo {
  readonly nombre = 'simulado'
  /** Las peticiones recibidas, para poder afirmar sobre ellas en las pruebas. */
  readonly recibidas: PeticionAlModelo[] = []
  private paso = 0

  constructor(private readonly guion: ActoDelGuion[]) {}

  async responder(peticion: PeticionAlModelo): Promise<RespuestaDelModelo> {
    this.recibidas.push(peticion)
    // Agotado el guion se repite el último acto: así una prueba de «tope de
    // vueltas» no tiene que escribir cuatro actos idénticos para demostrarlo.
    const acto = this.guion[Math.min(this.paso, this.guion.length - 1)]
    this.paso++
    if (acto?.lanza) throw new Error(acto.lanza)
    return {
      texto: acto?.texto ?? '',
      llamadas: (acto?.llamadas ?? []).map((l, i) => ({
        id: `sim-${this.paso}-${i}`,
        herramienta: l.herramienta,
        argumentos: l.argumentos ?? {
          checkIn: '2026-10-12',
          checkOut: '2026-10-14',
          adults: 2,
        },
      })),
      uso: { ...USO_TIPICO, ...acto?.uso },
    }
  }
}
