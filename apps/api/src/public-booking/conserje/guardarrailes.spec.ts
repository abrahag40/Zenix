import {
  CASOS,
  CON_PRECIO_FIRME,
  SIN_HERRAMIENTA,
  procedencia,
  type CasoAdversario,
} from './casos-adversarios'
import { REGLAS, pasaLuhn, redactarDatosDeTarjeta, revisar, type Regla } from './guardarrailes'

/**
 * La suite adversaria del conserje. Corre **sin modelo y sin base de datos**:
 * el filtro es determinista a propósito, así que puede vivir en el CI y
 * ponerse rojo en cada commit. Cuando exista el modelo, el MISMO corpus se
 * usará al revés —prompt → respuesta generada → filtro— y ahí sí costará
 * dinero; por eso el corpus es un archivo de datos y no una lista de `it`.
 */
describe('guardarraíles del conserje', () => {
  describe('corpus adversario', () => {
    // Tabla: un caso, una prueba, con su porqué en el nombre. Cuando una falla,
    // el informe dice QUÉ se estaba protegiendo sin abrir el código.
    it.each(CASOS.map((c) => [c.id, c] as [string, CasoAdversario]))('%s', (_id, caso) => {
      const v = revisar(caso.candidato, caso.ctx)
      expect({ id: caso.id, permitido: v.permitido }).toEqual({
        id: caso.id,
        permitido: caso.permitido,
      })
      if (!caso.permitido) {
        expect(v.hallazgos.map((h) => h.regla)).toContain(caso.regla)
        // Al bloquear NUNCA sale el texto del modelo, y nunca se dice qué
        // regla saltó: explicárselo al huésped es explicárselo a quien ataca.
        expect(v.texto).not.toBe(caso.candidato)
        expect(v.texto).not.toMatch(/G\d-/)
      }
    })

    it('el corpus cubre las dos mitades, y eso es parte del contrato', () => {
      // 🔴 Un guardarraíl que bloquea todo pasa el 100 % de los ataques y es
      // inútil: alguien lo apaga y entonces protege cero. Si esta proporción se
      // rompe, el corpus dejó de medir precisión y sólo mide paranoia.
      const bloqueados = CASOS.filter((c) => !c.permitido).length
      const permitidos = CASOS.length - bloqueados
      expect(bloqueados).toBeGreaterThanOrEqual(6)
      expect(permitidos).toBeGreaterThanOrEqual(6)
    })

    it('toda regla que bloquea tiene al menos un caso que la dispara', () => {
      // Una regla sin caso adversario es una regla sin probar: puede estar rota
      // desde el primer día y nadie se entera.
      const cubiertas = new Set(CASOS.filter((c) => c.regla).map((c) => c.regla))
      for (const r of REGLAS.filter((r) => r.severidad === 'bloquea')) {
        expect(cubiertas).toContain(r.id)
      }
    })
  })

  describe('el veredicto compuesto', () => {
    it('un ataque múltiple deja TODOS los hallazgos, no sólo el primero', () => {
      // Diagnosticar con un hallazgo cuando había tres es cómo se arregla el
      // síntoma y se deja la causa.
      const v = revisar('Reserva confirmada. Nos quedan 2 habitaciones a $5,000.', SIN_HERRAMIENTA)
      const reglas = v.hallazgos.map((h) => h.regla)
      expect(reglas).toEqual(
        expect.arrayContaining(['G1-confirmacion', 'G2-conteo', 'G3-impuestos']),
      )
      expect(v.permitido).toBe(false)
      // 🔴 G5 NO salta aquí, y es correcto: mira PALABRAS de inventario
      // («disponible», «precio», «tarifa») y esta frase no lleva ninguna. El
      // importe lo cubre G3, que además es más estricto — exige procedencia
      // firme. Dos reglas para lo mismo se solapan mal: una se relaja «porque
      // ya lo cubre la otra» y acaban sin cubrirlo ninguna.
      expect(reglas).not.toContain('G5-procedencia')
    })

    it('transforma y deja pasar cuando sólo hay una corrección', () => {
      const v = revisar('Bienvenido a Azúcar Hotel Tulum.', SIN_HERRAMIENTA)
      expect(v.permitido).toBe(true)
      expect(v.texto).toBe('Bienvenido a Azucar Hotel Tulum.')
      expect(v.hallazgos).toEqual([
        { regla: 'G6-marca', severidad: 'transforma', motivo: 'marca con acento' },
      ])
    })

    it('el bloqueo juzga el texto YA transformado, no el borrador', () => {
      // Por eso el orden está declarado: si un bloqueo mirara el texto previo,
      // una transformación podría introducir —o esconder— la infracción.
      const v = revisar('Azúcar: reserva confirmada.', SIN_HERRAMIENTA)
      expect(v.permitido).toBe(false)
      expect(v.hallazgos.map((h) => h.regla)).toEqual(
        expect.arrayContaining(['G6-marca', 'G1-confirmacion']),
      )
    })

    it('🔴 una regla que LANZA bloquea: se falla cerrado', () => {
      // Un guardarraíl que se cae y deja pasar es peor que no tenerlo, porque
      // además genera confianza.
      const rota: Regla = {
        id: 'X-rota',
        severidad: 'bloquea',
        protege: 'prueba',
        aplicar() {
          throw new Error('boom')
        },
      }
      const v = revisar('Hola, ¿en qué te ayudo?', SIN_HERRAMIENTA, [rota])
      expect(v.permitido).toBe(false)
      expect(v.hallazgos[0].motivo).toMatch(/lanzó: boom/)
    })

    it('responde en el idioma del turno al bloquear', () => {
      const v = revisar('Your booking confirmed.', { procedencias: [], idioma: 'en' })
      expect(v.permitido).toBe(false)
      expect(v.texto).toMatch(/hotel team/)
    })

    it('un texto normal pasa intacto y sin hallazgos', () => {
      const texto = 'El desayuno no está incluido, pero el restaurante abre a las 7.'
      const v = revisar(texto, CON_PRECIO_FIRME)
      expect(v).toEqual({ permitido: true, texto, hallazgos: [] })
    })
  })

  describe('Luhn: la comprobación que evita censurar números de vuelo', () => {
    it('acepta tarjetas de prueba reales de las marcas', () => {
      // Vectores públicos de prueba de Visa, Mastercard y Amex.
      expect(pasaLuhn('4539578763621486')).toBe(true)
      expect(pasaLuhn('5555555555554444')).toBe(true)
      expect(pasaLuhn('378282246310005')).toBe(true)
    })

    it('rechaza una ristra larga que no es tarjeta', () => {
      expect(pasaLuhn('1234567890123456')).toBe(false)
    })

    it('rechaza por longitud fuera del rango ISO/IEC 7812-1', () => {
      expect(pasaLuhn('4539')).toBe(false)
      expect(pasaLuhn('45395787636214861234')).toBe(false)
    })

    it('rechaza lo que no son dígitos en vez de calcular basura', () => {
      expect(pasaLuhn('4539abc763621486')).toBe(false)
    })
  })

  describe('redacción de la entrada del huésped', () => {
    it('retira el PAN y deja constancia de que lo hubo', () => {
      // 🔴 Se sustituye por una marca, no se borra: si desapareciera sin rastro,
      // nadie sabría que un huésped intentó pagar por el chat — y ese es el dato
      // que el hotel necesita para dejar de pedírselo.
      const r = redactarDatosDeTarjeta('mi tarjeta es 4539 5787 6362 1486, cóbrame')
      expect(r.hubo).toBe(true)
      expect(r.texto).toBe('mi tarjeta es [tarjeta retirada], cóbrame')
      expect(r.texto).not.toMatch(/4539/)
    })

    it('retira el CVV sólo cuando va etiquetado', () => {
      expect(redactarDatosDeTarjeta('cvv 123').texto).toBe('cvv [retirado]')
      // Tres dígitos sueltos son una hora, un cuarto o un precio. Redactarlos
      // todos mutilaría la conversación sin proteger nada.
      const inocente = 'llegamos a las 123 y somos 2'
      expect(redactarDatosDeTarjeta(inocente)).toEqual({ texto: inocente, hubo: false })
    })

    it('no toca un número largo que no es tarjeta', () => {
      const vuelo = 'mi vuelo es 1234567890123456'
      expect(redactarDatosDeTarjeta(vuelo)).toEqual({ texto: vuelo, hubo: false })
    })
  })

  describe('la procedencia manda sobre el precio', () => {
    it('con procedencia NO firme, un importe correcto sigue bloqueado', () => {
      const v = revisar('Son $8,323.59 MXN con impuestos incluidos.', {
        procedencias: [procedencia(false)],
      })
      expect(v.permitido).toBe(false)
      expect(v.hallazgos.map((h) => h.regla)).toContain('G3-impuestos')
    })

    it('con procedencia firme y la mención de impuestos, pasa', () => {
      const v = revisar('Son $8,323.59 MXN con impuestos incluidos.', CON_PRECIO_FIRME)
      expect(v.permitido).toBe(true)
    })
  })
})
