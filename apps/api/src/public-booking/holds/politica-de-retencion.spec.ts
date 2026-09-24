import { caducaEn, resolverRetencion, type MedioDePago } from './politica-de-retencion'

/**
 * La caducidad depende del MEDIO DE PAGO, no de la propiedad. Esta prueba
 * existe porque el esquema decía lo contrario —`BookingEngineConfig.
 * holdTtlMinutes`, 24 h para todo— y nadie lo notó nunca: el campo no lo leía
 * nadie.
 */
describe('política de retención', () => {
  it('🔴 el mismo hotel necesita dos números a la vez', () => {
    // Éste es el hallazgo entero en dos líneas. 24 h de retención sobre una
    // tarjeta vacían la disponibilidad con carritos abandonados; 15 min sobre
    // un vale de OXXO venden la habitación de alguien que aún puede pagar.
    expect(resolverRetencion('TARJETA').minutos).toBe(15)
    expect(resolverRetencion('VALE_EFECTIVO').minutos).toBe(72 * 60)
  })

  it('pagar en el hotel no retiene nada: la reserva es firme ya', () => {
    expect(resolverRetencion('EN_EL_HOTEL').minutos).toBeNull()
    expect(caducaEn('EN_EL_HOTEL', new Date())).toBeNull()
  })

  it('la propiedad puede ajustar DENTRO del límite de su medio de pago', () => {
    expect(resolverRetencion('TARJETA', 30).minutos).toBe(30)   // alargar, sí
    expect(resolverRetencion('TARJETA', 5).minutos).toBe(5)     // acortar, sí
  })

  it('🔴 pero NO puede poner 24 h sobre una tarjeta', () => {
    // El daño de equivocar este número no lo paga quien lo configura: lo paga
    // el hotel en ocupación perdida, y no se entera hasta meses después.
    expect(resolverRetencion('TARJETA', 24 * 60).minutos).toBe(60)
    expect(resolverRetencion('VALE_EFECTIVO', 30 * 24 * 60).minutos).toBe(96 * 60)
  })

  it('cero no significa «sin retención»: eso es otra decisión', () => {
    // «Sin retención» se expresa con EN_EL_HOTEL. Un cero aquí sería una
    // retención que caduca antes de existir.
    expect(resolverRetencion('TARJETA', 0).minutos).toBe(1)
    expect(resolverRetencion('TARJETA', -99).minutos).toBe(1)
  })

  it('un medio desconocido no retiene nada — fail closed', () => {
    const r = resolverRetencion('BITCOIN' as MedioDePago)
    expect(r.minutos).toBeNull()
    expect(r.motivo).toMatch(/no reconocido/)
  })

  it('valores absurdos no producen una fecha absurda', () => {
    const ahora = new Date('2026-10-01T12:00:00Z')
    for (const v of [NaN, Infinity, -Infinity, 1e12, undefined, null]) {
      const f = caducaEn('TARJETA', ahora, v as never)
      expect(f).not.toBeNull()
      expect(Number.isFinite(f!.getTime())).toBe(true)
      expect(f!.getTime()).toBeGreaterThan(ahora.getTime())
      // Nunca por encima del techo de la tarjeta.
      expect(f!.getTime()).toBeLessThanOrEqual(ahora.getTime() + 60 * 60_000)
    }
  })

  it('todos los medios traen un motivo legible para el hotel', () => {
    const medios: MedioDePago[] = ['TARJETA', 'VALE_EFECTIVO', 'TRANSFERENCIA', 'EN_EL_HOTEL']
    for (const m of medios) {
      expect(resolverRetencion(m).motivo.length).toBeGreaterThan(20)
    }
  })
})
