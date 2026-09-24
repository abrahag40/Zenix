import { ConserjeHerramientasService } from './conserje-herramientas.service'
import {
  FRASES_PROHIBIDAS,
  HERRAMIENTAS,
  PENDIENTES,
  contieneFraseProhibida,
  aEstadoParaElHuesped,
  aImporte,
  aNoches,
  aTiposDisponibles,
  hayPrecioFirme,
  nuevaLlamadaId,
  sellar,
  sinConteos,
} from './herramientas'

/**
 * Estas pruebas corren SIN modelo de lenguaje y sin base de datos, y eso es el
 * punto: la garantía anti-overbooking se verifica antes de que exista en la
 * sala algo capaz de mentir. Si alguna de éstas se pone roja, el conserje puede
 * vender una noche ocupada o publicar un precio que nadie respalda.
 */
describe('herramientas del conserje', () => {
  const tipoDelMotor = {
    roomTypeId: 'rt-1',
    name: 'Bungalow Mar',
    maxOccupancy: 2,
    availableRooms: 3,
    available: true,
    currency: 'MXN',
    pricing: { totalCents: 832359, taxesCents: 132359, currency: 'MXN', firm: true },
  }

  describe('el conteo no entra al contexto', () => {
    it('🔴 traduce availableRooms a un booleano y NO copia el número', () => {
      // El motor sabe que quedan 3. El modelo sólo puede saber que hay.
      const [t] = aTiposDisponibles([tipoDelMotor])
      expect(t.hay).toBe(true)
      expect(t as unknown as Record<string, unknown>).not.toHaveProperty('availableRooms')
      // Y el número tampoco viaja escondido en otro campo. Se compara por
      // VALOR, no por subcadena: "8323.59" contiene un «3» que no es el conteo,
      // y una prueba que fallara por eso enseñaría a relajarla.
      expect(Object.values(t)).not.toContain(tipoDelMotor.availableRooms)
    })

    it('«no hay» es no hay, aunque el motor cuente cero de otra forma', () => {
      const [t] = aTiposDisponibles([{ ...tipoDelMotor, availableRooms: 0, available: false }])
      expect(t.hay).toBe(false)
    })

    it('la red de seguridad quita conteos que nadie copió a mano', () => {
      // Simula el descuido real: un campo nuevo del motor heredado sin pensar.
      const filtrado = sinConteos({
        nombre: 'x',
        availableRooms: 4,
        anidado: { total: 9, hay: true },
      })
      expect(filtrado).toEqual({ nombre: 'x', anidado: { hay: true } })
    })

    it('...pero no confunde un campo de texto que se llame igual', () => {
      // `total: "8 323.59"` es una etiqueta, no un conteo de habitaciones.
      expect(sinConteos({ total: '8 323.59' })).toEqual({ total: '8 323.59' })
    })
  })

  describe('sin respaldo fiscal, «consultar»', () => {
    it('publica el total CON impuestos cuando el precio es firme', () => {
      expect(aImporte(tipoDelMotor.pricing, 'MXN')).toEqual({
        total: 8323.59,
        impuestos: 1323.59,
        moneda: 'MXN',
      })
    })

    it('🔴 con firm=false no aproxima: devuelve «consultar»', () => {
      // Es la regla que sobrevive a todo cambio de hechos: la ausencia de dato
      // se muestra como ausencia, nunca como un número optimista.
      expect(aImporte({ ...tipoDelMotor.pricing, firm: false }, 'MXN')).toBe('consultar')
    })

    it('sin pricing tampoco inventa', () => {
      expect(aImporte(null, 'MXN')).toBe('consultar')
    })

    it('el sello es firme sólo si ALGÚN tipo trae precio publicable', () => {
      const conPrecio = aTiposDisponibles([tipoDelMotor])
      const sinPrecio = aTiposDisponibles([
        { ...tipoDelMotor, pricing: { ...tipoDelMotor.pricing, firm: false } },
      ])
      expect(hayPrecioFirme(conPrecio)).toBe(true)
      expect(hayPrecioFirme(sinPrecio)).toBe(false)
    })
  })

  describe('el calendario se reduce a un booleano por noche', () => {
    const dias = [
      {
        date: '2026-10-12',
        roomTypes: [
          { roomTypeId: 'rt-1', name: 'Mar', available: 0, total: 4 },
          { roomTypeId: 'rt-2', name: 'Selva', available: 2, total: 6 },
        ],
      },
      {
        date: '2026-10-13',
        roomTypes: [
          { roomTypeId: 'rt-1', name: 'Mar', available: 0, total: 4 },
          { roomTypeId: 'rt-2', name: 'Selva', available: 0, total: 6 },
        ],
      },
    ]

    it('hay noche si algún tipo tiene sitio', () => {
      expect(aNoches(dias)).toEqual([
        { fecha: '2026-10-12', hay: true },
        { fecha: '2026-10-13', hay: false },
      ])
    })

    it('filtrado por tipo, el 12 deja de tener sitio para «Mar»', () => {
      // El mismo día es «hay» o «no hay» según lo que se pregunte. Por eso el
      // filtro va aquí y no en la cabeza del modelo.
      expect(aNoches(dias, 'rt-1')).toEqual([
        { fecha: '2026-10-12', hay: false },
        { fecha: '2026-10-13', hay: false },
      ])
    })

    it('🔴 ninguna noche lleva cuántas quedan', () => {
      expect(JSON.stringify(aNoches(dias))).not.toMatch(/\b(available|total)\b/)
    })
  })

  describe('procedencia: sin sello no hay afirmación', () => {
    it('sella con herramienta, instante e identificador', () => {
      const ahora = new Date('2026-09-24T18:00:00.000Z')
      const r = sellar(
        'consultar_disponibilidad',
        { x: 1 },
        { firme: true, ahora, llamadaId: 'zc_fijo' },
      )
      expect(r.procedencia).toEqual({
        herramienta: 'consultar_disponibilidad',
        llamadaId: 'zc_fijo',
        consultadoEn: '2026-09-24T18:00:00.000Z',
        fuente: 'zenix',
        firme: true,
      })
    })

    it('los identificadores son ordenables en el tiempo, para poder auditar por rango', () => {
      const antes = nuevaLlamadaId(new Date('2026-09-24T18:00:00Z'), () => 0)
      const despues = nuevaLlamadaId(new Date('2026-09-24T18:00:01Z'), () => 0)
      expect(despues > antes).toBe(true)
    })

    it('el catálogo de herramientas es cerrado', () => {
      // Añadir una herramienta obliga a pasar por aquí, que es donde se piensa
      // si esa herramienta puede devolver algo que el modelo no debería ver.
      expect([...HERRAMIENTAS]).toEqual([
        'consultar_disponibilidad',
        'calendario_del_mes',
        'cotizar',
        'apartar',
        'estado_de_reserva',
      ])
    })
  })

  describe('🔴 el conserje nunca dice «confirmada»', () => {
    it('con retención, la reserva está APARTADA — no confirmada', () => {
      expect(aEstadoParaElHuesped('PENDING', true)).toBe('apartada')
    })

    it('sin retención, es una SOLICITUD sujeta a confirmación', () => {
      expect(aEstadoParaElHuesped('PENDING', false)).toBe('solicitada')
    })

    it('ningún estado interno se traduce nunca a «confirmada»', () => {
      // La prueba que importa: aunque Zenix llame CONFIRMED a su estado, hacia
      // el huésped no sale esa palabra hasta que exista el cobro (H6.6).
      const internos = ['PENDING', 'CONFIRMED', 'HELD', 'PAID', 'EXPIRED', 'CANCELLED']
      const salidas = internos.flatMap((e) => [
        aEstadoParaElHuesped(e, true),
        aEstadoParaElHuesped(e, false),
      ])
      expect(salidas).not.toContain('confirmada')
      expect(new Set(salidas)).toEqual(new Set(['apartada', 'solicitada', 'caducada', 'cancelada']))
    })
  })

  describe('🔴 la frase prohibida no puede cruzar esta capa', () => {
    it('la detecta en cualquier idioma y anidada', () => {
      // El motor devuelve hoy `message: "Reserva confirmada. El pago se realiza
      // al llegar al hotel."`. Si algún día se copiara por herencia, salta aquí.
      expect(contieneFraseProhibida({ a: { message: 'Reserva CONFIRMADA. El pago…' } })).toBe(
        'reserva confirmada',
      )
      expect(contieneFraseProhibida('Booking Confirmed')).toBe('booking confirmed')
      expect(contieneFraseProhibida({ estado: 'apartada' })).toBeNull()
    })

    it('la lista es la misma que verifica el CI del sitio de Azucar', () => {
      expect([...FRASES_PROHIBIDAS]).toEqual(['reserva confirmada', 'booking confirmed'])
    })

    it('paraElModelo LANZA en vez de limpiar en silencio', () => {
      // Limpiarla dejaría el cambio de aguas arriba sin descubrir. Fail loudly.
      const servicio = new ConserjeHerramientasService({} as never, {} as never)
      const envenenada = sellar('apartar', { message: 'Reserva confirmada.' }, { firme: false })
      expect(() => servicio.paraElModelo(envenenada)).toThrow(/frase prohibida/)
    })

    it('y deja pasar lo que sí puede decirse, quitando conteos de paso', () => {
      const servicio = new ConserjeHerramientasService({} as never, {} as never)
      const limpia = sellar(
        'apartar',
        { estado: 'solicitada', availableRooms: 2 },
        { firme: false },
      )
      expect(servicio.paraElModelo(limpia).datos).toEqual({ estado: 'solicitada' })
    })
  })

  describe('«falta una herramienta» es un dato, no un olvido', () => {
    it('lo implementado es exactamente el catálogo menos PENDIENTES', () => {
      const metodo: Record<string, string> = {
        consultar_disponibilidad: 'consultarDisponibilidad',
        calendario_del_mes: 'calendarioDelMes',
        cotizar: 'cotizar',
        apartar: 'apartar',
        estado_de_reserva: 'estadoDeReserva',
      }
      const proto = ConserjeHerramientasService.prototype as unknown as Record<string, unknown>
      for (const h of HERRAMIENTAS) {
        const implementada = typeof proto[metodo[h]] === 'function'
        const pendiente = h in PENDIENTES
        expect(implementada).toBe(!pendiente)
      }
    })

    it('toda pendiente trae su motivo escrito', () => {
      for (const motivo of Object.values(PENDIENTES)) {
        expect(String(motivo).length).toBeGreaterThan(40)
      }
    })
  })
})
