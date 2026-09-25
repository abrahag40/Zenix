import { ALFABETO, generarCodigo, normalizar } from './codigo-corto'

/**
 * El código de la tableta, atacado: por el estafador que quiere enumerar y por
 * el recepcionista que teclea con prisa y el huésped delante.
 */
describe('el alfabeto', () => {
  it('🔴 no contiene caracteres que se confundan al leerlos', () => {
    for (const c of ['0', 'O', '1', 'I', 'L', 'U']) expect(ALFABETO).not.toContain(c)
  })
  it('da suficiente espacio para que acertar por casualidad sea improbable', () => {
    // 29^5 combinaciones de cuerpo. La defensa real es la sesión y el límite
    // de intentos; esto sólo evita el acierto fortuito.
    expect(ALFABETO.length ** 5).toBeGreaterThan(20_000_000)
  })
})

describe('generar y normalizar', () => {
  it('lo generado siempre se valida a sí mismo', () => {
    for (let i = 0; i < 500; i++) {
      const c = generarCodigo()
      expect(c).toHaveLength(6)
      expect(normalizar(c)).toBe(c)
    }
  })

  it('acepta minúsculas, espacios y guiones', () => {
    const c = generarCodigo()
    expect(normalizar(c.toLowerCase())).toBe(c)
    expect(normalizar(`${c.slice(0, 3)} ${c.slice(3)}`)).toBe(c)
    expect(normalizar(`${c.slice(0, 3)}-${c.slice(3)}`)).toBe(c)
  })

  it('traduce los confundibles que la gente sí teclea', () => {
    const c = generarCodigo()
    // Quien ve una `J` puede teclear `I` o `L`; quien ve `V` puede teclear `U`.
    const conI = c.replace(/J/g, 'I')
    if (conI !== c) expect(normalizar(conI)).toBe(c)
    const conU = c.replace(/V/g, 'U')
    if (conU !== c) expect(normalizar(conU)).toBe(c)
  })
})

describe('🔴 los dos errores de tecleo que harían firmar al huésped equivocado', () => {
  const distinto = (a: string, b: string) => a !== b

  it('SUSTITUIR un carácter produce un código inválido casi siempre', () => {
    let atrapados = 0, total = 0
    for (let i = 0; i < 300; i++) {
      const c = generarCodigo()
      const pos = i % 5
      for (const nuevo of ALFABETO) {
        if (nuevo === c[pos]) continue
        const roto = c.slice(0, pos) + nuevo + c.slice(pos + 1)
        if (!distinto(roto, c)) continue
        total++
        if (normalizar(roto) === null) atrapados++
      }
    }
    // El control es un carácter de 29 valores: atrapa ~28 de cada 29.
    expect(atrapados / total).toBeGreaterThan(0.95)
  })

  it('INTERCAMBIAR dos caracteres contiguos también se atrapa', () => {
    // Con pesos iguales la suma no cambiaría y la transposición pasaría
    // desapercibida. Por eso los pesos son crecientes.
    let atrapados = 0, total = 0
    for (let i = 0; i < 400; i++) {
      const c = generarCodigo()
      const p = i % 4
      if (c[p] === c[p + 1]) continue
      const roto = c.slice(0, p) + c[p + 1] + c[p] + c.slice(p + 2)
      total++
      if (normalizar(roto) === null) atrapados++
    }
    expect(atrapados / total).toBeGreaterThan(0.9)
  })

  it('🔴 un código mal tecleado NI SIQUIERA se consulta en la base', () => {
    // `normalizar` devuelve null antes de que nadie toque la base: no hay
    // enumeración gratis a base de códigos inventados.
    expect(normalizar('AAAAAA')).toBeNull()
    expect(normalizar('')).toBeNull()
    expect(normalizar('ABC')).toBeNull()
    expect(normalizar('ABCDEFGH')).toBeNull()
  })
})
