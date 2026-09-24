import { secretoDeEntorno } from './secreto-de-entorno'

/**
 * El caso que costó una tarde: un `\n` al final de un secreto.
 *
 * Las cuatro primeras pruebas son el defecto real, no variaciones inventadas:
 * un `.env` bien formado **termina en salto de línea**, y ese salto acabó
 * dentro del valor.
 */
describe('secretoDeEntorno', () => {
  const NOMBRE = 'PRUEBA_SECRETO_DE_ENTORNO'
  afterEach(() => { delete process.env[NOMBRE] })

  it('🔴 quita el salto de línea final — el defecto del 2026-09-24', () => {
    process.env[NOMBRE] = 'whsec_abc123\n'
    expect(secretoDeEntorno(NOMBRE)).toBe('whsec_abc123')
  })

  it('quita \\r\\n, que es lo que deja un .env escrito en Windows', () => {
    process.env[NOMBRE] = 'whsec_abc123\r\n'
    expect(secretoDeEntorno(NOMBRE)).toBe('whsec_abc123')
  })

  it('quita espacios por delante y por detrás', () => {
    process.env[NOMBRE] = '  whsec_abc123  '
    expect(secretoDeEntorno(NOMBRE)).toBe('whsec_abc123')
  })

  it('deja intacto un valor ya limpio', () => {
    process.env[NOMBRE] = 'whsec_abc123'
    expect(secretoDeEntorno(NOMBRE)).toBe('whsec_abc123')
  })

  it('una variable ausente es undefined', () => {
    expect(secretoDeEntorno(NOMBRE)).toBeUndefined()
  })

  it('una variable que sólo tiene espacios vale lo mismo que no estar', () => {
    // Si devolviera la cadena vacía, quien la lee la trataría como «hay
    // secreto» y fallaría más tarde y más lejos. Fail-safe: no hay.
    process.env[NOMBRE] = '   \n'
    expect(secretoDeEntorno(NOMBRE)).toBeUndefined()
  })

  it('🔴 NO toca el interior del valor', () => {
    // Recortar los extremos es seguro porque ningún token los lleva. Tocar el
    // interior sería corromper el secreto, que es peor que no limpiarlo.
    process.env[NOMBRE] = ' whsec_con espacio dentro \n'
    expect(secretoDeEntorno(NOMBRE)).toBe('whsec_con espacio dentro')
  })
})
