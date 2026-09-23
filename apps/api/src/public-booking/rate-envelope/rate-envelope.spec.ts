import { createHmac } from 'crypto'
import {
  SCHEMA_VERSION,
  TOLERANCIA_FIRMA_MS,
  assertEnvelopeValido,
  cabeceraFirma,
  firmar,
  nuevoEnvelopeId,
  parsearCabecera,
  serializar,
  verificar,
  RateEnvelopeError,
  type RateEnvelope,
} from './rate-envelope'

const SECRETO = 'secreto-de-prueba'

const sobre = (over: Partial<RateEnvelope> = {}): RateEnvelope => ({
  schemaVersion: SCHEMA_VERSION,
  envelopeId: 'zzz-001',
  issuedAt: '2026-09-23T12:00:00.000Z',
  validUntil: '2026-09-24T12:00:00.000Z',
  propertyId: 'prop-1',
  propertySlug: 'hotel-demo',
  currency: 'MXN',
  taxPolicy: {
    displayMode: 'TAX_INCLUSIVE',
    lines: [{ code: 'IVA', rate: 0.16, base: 'ROOM_AND_SERVICES' }, { code: 'ISH', rate: 0.05, base: 'ROOM' }],
    verified: true,
    legalBasis: 'LIVA art. 1 · ISH QR art. 8',
  },
  roomTypes: [
    { id: 'rt-1', code: 'BUNGALOW_MAR', name: 'Bungalow Mar', maxOccupancy: 2,
      from: { net: 286_885, taxes: 63_115, total: 350_000 } },
  ],
  bookingUrl: 'https://book.zenix.com/hotel-demo',
  ...over,
})

describe('El sobre de tarifas — invariantes antes de firmar', () => {
  it('acepta un sobre bien formado', () => {
    expect(() => assertEnvelopeValido(sobre())).not.toThrow()
  })

  it('🔴 rechaza un desglose que no suma — firmar eso es peor que no mandarlo', () => {
    // Si se firma un sobre incoherente, el receptor lo ACEPTA (la firma cuadra)
    // y publica la incoherencia con el sello de Zenix encima.
    const malo = sobre({ roomTypes: [{ ...sobre().roomTypes[0], from: { net: 100, taxes: 20, total: 121 } }] })
    expect(() => assertEnvelopeValido(malo)).toThrow(/no suma/)
  })

  it('🔴 rechaza importes decimales: el dinero va en centavos enteros', () => {
    const malo = sobre({ roomTypes: [{ ...sobre().roomTypes[0], from: { net: 100.5, taxes: 20, total: 120.5 } }] })
    expect(() => assertEnvelopeValido(malo)).toThrow(/entero de centavos/)
  })

  it('rechaza un sobre que nace caducado', () => {
    expect(() => assertEnvelopeValido(sobre({ validUntil: '2026-09-23T11:00:00.000Z' }))).toThrow(/nace caducado/)
  })

  it('rechaza un sobre sin tipos de habitación', () => {
    expect(() => assertEnvelopeValido(sobre({ roomTypes: [] }))).toThrow(RateEnvelopeError)
  })

  it('rechaza una versión de esquema desconocida', () => {
    expect(() => assertEnvelopeValido(sobre({ schemaVersion: 99 }))).toThrow(/schemaVersion/)
  })

  it('`calendar` es opcional — su ausencia es válida, es la degradación por diseño', () => {
    expect(sobre().roomTypes[0].calendar).toBeUndefined()
    expect(() => assertEnvelopeValido(sobre())).not.toThrow()
  })
})

describe('La firma', () => {
  const cuerpo = serializar(sobre())
  const t = Math.floor(Date.parse('2026-09-23T12:00:00.000Z') / 1000)
  const ahora = t * 1000

  const cabecera = () => cabeceraFirma(t, firmar(SECRETO, t, cuerpo))

  it('una firma recién emitida verifica', () => {
    expect(verificar({ secreto: SECRETO, cuerpoCrudo: cuerpo, cabecera: cabecera(), ahora })).toEqual({ ok: true })
  })

  it('🔴 LA RAZÓN DE SER: el esquema viejo es reproducible, el nuevo no', () => {
    // V1 — `HMAC(cuerpo)`. Una entrega capturada hace un año sigue validando
    // hoy, porque nada en la firma dice cuándo se emitió.
    const v1 = createHmac('sha256', SECRETO).update(cuerpo).digest('hex')
    expect(createHmac('sha256', SECRETO).update(cuerpo).digest('hex')).toBe(v1)

    // V2 — la MISMA captura, un año después, se rechaza por la ventana.
    const unAnoDespues = ahora + 365 * 24 * 60 * 60 * 1000
    expect(verificar({ secreto: SECRETO, cuerpoCrudo: cuerpo, cabecera: cabecera(), ahora: unAnoDespues }))
      .toEqual({ ok: false, motivo: 'fuera de la ventana de tolerancia' })
  })

  it('un sobre del FUTURO también se rechaza — la ventana es de dos lados', () => {
    expect(verificar({ secreto: SECRETO, cuerpoCrudo: cuerpo, cabecera: cabecera(), ahora: ahora - 10 * 60 * 1000 }).ok).toBe(false)
  })

  it('el borde de la ventana: justo dentro pasa, justo fuera no', () => {
    const dentro = ahora + TOLERANCIA_FIRMA_MS
    const fuera = ahora + TOLERANCIA_FIRMA_MS + 1
    expect(verificar({ secreto: SECRETO, cuerpoCrudo: cuerpo, cabecera: cabecera(), ahora: dentro }).ok).toBe(true)
    expect(verificar({ secreto: SECRETO, cuerpoCrudo: cuerpo, cabecera: cabecera(), ahora: fuera }).ok).toBe(false)
  })

  it('🔴 un solo byte cambiado en el cuerpo invalida la firma', () => {
    const alterado = cuerpo.replace('350000', '250000')   // el atacante se rebaja el total
    expect(verificar({ secreto: SECRETO, cuerpoCrudo: alterado, cabecera: cabecera(), ahora }).ok).toBe(false)
  })

  it('otro secreto no verifica', () => {
    expect(verificar({ secreto: 'otro', cuerpoCrudo: cuerpo, cabecera: cabecera(), ahora }).ok).toBe(false)
  })

  it('no revienta con cabeceras basura', () => {
    for (const c of ['', 'basura', 't=,v1=', 'v1=abc', 't=abc,v1=def']) {
      expect(verificar({ secreto: SECRETO, cuerpoCrudo: cuerpo, cabecera: c, ahora }).ok).toBe(false)
    }
  })

  it('la cabecera tolera espacios y orden invertido', () => {
    const f = firmar(SECRETO, t, cuerpo)
    expect(parsearCabecera(` v1=${f} , t=${t} `)).toEqual({ t, v1: f })
  })

  it('🔴 no se parsea el cuerpo hasta haber verificado', () => {
    // Un cuerpo que no es JSON, con firma válida: la verificación NO debe
    // fallar por el parseo, porque no debe parsear. Verifica y ya.
    const basura = 'esto no es json {{{'
    const t2 = Math.floor(ahora / 1000)
    const cab = cabeceraFirma(t2, firmar(SECRETO, t2, basura))
    expect(verificar({ secreto: SECRETO, cuerpoCrudo: basura, cabecera: cab, ahora })).toEqual({ ok: true })
  })
})

describe('El identificador del sobre', () => {
  it('🔑 es monótono: dos emisiones seguidas ordenan como cadenas', () => {
    const ids = Array.from({ length: 200 }, () => nuevoEnvelopeId())
    const ordenados = [...ids].sort()
    expect(ids).toEqual(ordenados)
  })

  it('no repite dentro del mismo milisegundo', () => {
    const t = Date.now()
    const ids = Array.from({ length: 50 }, () => nuevoEnvelopeId(t))
    expect(new Set(ids).size).toBe(50)
  })

  it('un sobre emitido más tarde ordena después — así el receptor descarta el viejo', () => {
    const viejo = nuevoEnvelopeId(Date.parse('2026-09-23T12:00:00Z'))
    const nuevo = nuevoEnvelopeId(Date.parse('2026-09-23T12:00:01Z'))
    expect(nuevo > viejo).toBe(true)
  })
})
