import { AdaptadorSimulado } from './adaptador-simulado'
import { ConversacionService, HERRAMIENTAS_OFRECIDAS, LIMITES_POR_OMISION } from './conversacion'
import type { ConserjeHerramientasService } from './conserje-herramientas.service'
import { sellar } from './herramientas'

/**
 * El bucle de conversación, probado **sin modelo y sin base de datos**.
 *
 * Lo que se verifica aquí no es si el conserje contesta bien —eso necesita un
 * modelo real y cuesta dinero— sino que **si contesta mal, el sistema aguanta**.
 * Son dos preguntas distintas y sólo la segunda se puede responder gratis, en
 * milisegundos y en cada commit.
 */
describe('conversación del conserje', () => {
  /** Herramientas de mentira: devuelven lo que la prueba necesite. */
  function herramientasFalsas(firme = true) {
    const datos = { tipos: [{ roomTypeId: 'rt-1', nombre: 'Mar', hay: true }] }
    const respuesta = sellar('consultar_disponibilidad', datos, { firme })
    const stub = {
      consultarDisponibilidad: jest.fn().mockResolvedValue(respuesta),
      cotizar: jest.fn().mockResolvedValue(respuesta),
      calendarioDelMes: jest.fn().mockResolvedValue(respuesta),
      paraElModelo: jest.fn((r: unknown) => r),
    }
    return stub as unknown as ConserjeHerramientasService & typeof stub
  }

  const sistema = { sistema: 'eres el conserje' }

  it('el camino normal: consulta, contesta y sella la procedencia', async () => {
    const t = herramientasFalsas()
    const modelo = new AdaptadorSimulado([
      { llamadas: [{ herramienta: 'consultar_disponibilidad' }] },
      { texto: 'Sí, hay disponibilidad para esas fechas.' },
    ])
    const r = await new ConversacionService(t).turno(
      'hotel-tulum',
      '¿hay el 12?',
      [],
      modelo,
      sistema,
    )

    expect(r.cierre).toBe('contesto')
    expect(r.permitido).toBe(true)
    expect(r.texto).toBe('Sí, hay disponibilidad para esas fechas.')
    // La procedencia NO la declara el modelo: se acumula de lo que devolvieron
    // las herramientas de verdad. Por eso es auditable.
    expect(r.procedencias).toHaveLength(1)
    expect(r.vueltas).toBe(2)
    expect(t.consultarDisponibilidad).toHaveBeenCalledTimes(1)
  })

  it('🔴 sin consultar, la misma frase se bloquea', async () => {
    // El mismo texto, distinto contexto. Es LA regla del encargo.
    const modelo = new AdaptadorSimulado([{ texto: 'Sí, hay disponibilidad para esas fechas.' }])
    const r = await new ConversacionService(herramientasFalsas()).turno(
      'hotel-tulum',
      '¿hay el 12?',
      [],
      modelo,
      sistema,
    )
    expect(r.permitido).toBe(false)
    expect(r.hallazgos.map((h) => h.regla)).toContain('G5-procedencia')
    expect(r.texto).not.toMatch(/disponibilidad/)
  })

  it('el acumulado de uso suma todas las vueltas, para el presupuesto', async () => {
    const modelo = new AdaptadorSimulado([
      { llamadas: [{ herramienta: 'consultar_disponibilidad' }], uso: { salida: 50 } },
      { texto: 'Listo.', uso: { salida: 100 } },
    ])
    const r = await new ConversacionService(herramientasFalsas()).turno(
      'hotel-tulum',
      'hola',
      [],
      modelo,
      sistema,
    )
    expect(r.uso.salida).toBe(150)
    expect(r.uso.cacheLeida).toBe(20000)
  })

  describe('los topes, que son la factura', () => {
    it('corta cuando el modelo pide herramientas sin parar', async () => {
      // Sin techo, esto es un bucle infinito con tarjeta de crédito.
      const modelo = new AdaptadorSimulado([
        { llamadas: [{ herramienta: 'consultar_disponibilidad' }] },
      ])
      const r = await new ConversacionService(herramientasFalsas()).turno(
        'hotel-tulum',
        'hola',
        [],
        modelo,
        sistema,
      )
      expect(r.cierre).toBe('tope')
      expect(r.permitido).toBe(false)
      expect(r.vueltas).toBeLessThanOrEqual(LIMITES_POR_OMISION.maxVueltas)
    })

    it('corta también por número de llamadas, no sólo por vueltas', async () => {
      const t = herramientasFalsas()
      const modelo = new AdaptadorSimulado([
        {
          llamadas: [
            { herramienta: 'consultar_disponibilidad' },
            { herramienta: 'cotizar' },
            { herramienta: 'calendario_del_mes' },
          ],
        },
      ])
      const r = await new ConversacionService(t).turno('hotel-tulum', 'hola', [], modelo, {
        ...sistema,
        limites: { maxVueltas: 4, maxLlamadas: 2 },
      })
      expect(r.cierre).toBe('tope')
      // 🔴 Se corta ANTES de ejecutar ninguna: el tope protege del gasto, y
      // comprobarlo después de gastar no protege de nada.
      expect(t.consultarDisponibilidad).not.toHaveBeenCalled()
    })
  })

  describe('fallar cerrado', () => {
    it('si el adaptador revienta, sale el texto seguro y no el error', async () => {
      const modelo = new AdaptadorSimulado([{ lanza: 'timeout' }])
      const r = await new ConversacionService(herramientasFalsas()).turno(
        'hotel-tulum',
        'hola',
        [],
        modelo,
        sistema,
      )
      expect(r.cierre).toBe('error')
      expect(r.permitido).toBe(false)
      expect(r.texto).not.toMatch(/timeout/)
      expect(r.texto).toMatch(/hotel/)
    })

    it('si una herramienta falla, el modelo recibe un error CONTROLADO y sigue', async () => {
      // La diferencia importa: con un error controlado el modelo puede decir
      // «no pude consultar»; con el error crudo tiende a improvisar el dato.
      const t = herramientasFalsas()
      ;(t.consultarDisponibilidad as jest.Mock).mockRejectedValue(new Error('BD caída'))
      const modelo = new AdaptadorSimulado([
        { llamadas: [{ herramienta: 'consultar_disponibilidad' }] },
        { texto: 'No pude consultarlo ahora, ¿te paso con el hotel?' },
      ])
      const r = await new ConversacionService(t).turno('hotel-tulum', 'hola', [], modelo, sistema)

      expect(r.cierre).toBe('contesto')
      expect(r.permitido).toBe(true)
      expect(r.procedencias).toHaveLength(0)
      const paraElModelo = modelo.recibidas[1].mensajes.at(-1)!.contenido
      expect(paraElModelo).toContain('no se pudo consultar ahora')
      expect(paraElModelo).not.toContain('BD caída')
    })

    it('una herramienta fuera del catálogo se rechaza, no se intenta', async () => {
      const t = herramientasFalsas()
      const modelo = new AdaptadorSimulado([
        { llamadas: [{ herramienta: 'borrar_reservas' }] },
        { texto: 'Perdona, ¿me repites las fechas?' },
      ])
      const r = await new ConversacionService(t).turno('hotel-tulum', 'hola', [], modelo, sistema)
      expect(r.permitido).toBe(true)
      expect(t.consultarDisponibilidad).not.toHaveBeenCalled()
      expect(modelo.recibidas[1].mensajes.at(-1)!.contenido).toContain('no disponible')
    })
  })

  describe('lo que nunca entra al sistema', () => {
    it('🔴 la tarjeta del huésped se retira ANTES de llegar al modelo', async () => {
      // Única oportunidad: después el dato ya viajó al proveedor y al historial.
      const modelo = new AdaptadorSimulado([{ texto: 'Gracias.' }])
      await new ConversacionService(herramientasFalsas()).turno(
        'hotel-tulum',
        'mi tarjeta es 4539 5787 6362 1486',
        [],
        modelo,
        sistema,
      )
      const loQueVioElModelo = JSON.stringify(modelo.recibidas[0].mensajes)
      expect(loQueVioElModelo).not.toContain('4539')
      expect(loQueVioElModelo).toContain('[tarjeta retirada]')
    })

    it('sólo se le ofrecen las herramientas implementadas', async () => {
      // `estado_de_reserva` está en el catálogo y sin implementar: ofrecerla
      // sería invitar al modelo a llamar algo que no existe.
      const modelo = new AdaptadorSimulado([{ texto: 'Hola.' }])
      await new ConversacionService(herramientasFalsas()).turno(
        'hotel-tulum',
        'hola',
        [],
        modelo,
        sistema,
      )
      expect(modelo.recibidas[0].herramientas).toEqual(HERRAMIENTAS_OFRECIDAS)
      expect(modelo.recibidas[0].herramientas).not.toContain('estado_de_reserva')
    })
  })

  it('un precio sin respaldo firme no sale, aunque el modelo lo escriba bien', async () => {
    const modelo = new AdaptadorSimulado([
      { llamadas: [{ herramienta: 'cotizar' }] },
      { texto: 'Son $8,323.59 MXN con impuestos incluidos.' },
    ])
    const r = await new ConversacionService(herramientasFalsas(false)).turno(
      'hotel-tulum',
      '¿cuánto?',
      [],
      modelo,
      sistema,
    )
    expect(r.permitido).toBe(false)
    expect(r.hallazgos.map((h) => h.regla)).toContain('G3-impuestos')
  })
})
