import { BadRequestException, NotFoundException } from '@nestjs/common'
import { CartaDeRegistroService, type DocumentoDeRegistro } from './carta-de-registro.service'

/**
 * La carta de registro, mirada por quien quiere discutirla después: el huésped
 * que dice que no firmó eso, y el hotel que quisiera «corregirla» a posteriori.
 */

const doc: DocumentoDeRegistro = {
  version: 1,
  hotel: { nombre: 'Azucar Hotel Tulum', rfc: 'XAXX010101000' },
  huesped: { nombre: 'María González', correo: 'maria@ejemplo.com', documento: 'INE …1HDF' },
  estancia: {
    referencia: 'MX-W-1', entrada: '2026-10-05', salida: '2026-10-07', noches: 2,
    habitacion: 'Bungalow Mar',
  },
  importe: { totalCentavos: 832359, moneda: 'MXN', impuestosIncluidos: true },
  pago: { pasarela: 'stripe', ultimos4: '4242' },
  clausulas: ['Autorizo el cargo a mi tarjeta por el total indicado.'],
}

function hacer(existente: unknown = null) {
  const create = jest.fn().mockImplementation(({ data }: any) =>
    Promise.resolve({ id: 'rr1', huella: data.huella }))
  const prisma: any = {
    registrationRecord: {
      findUnique: jest.fn().mockResolvedValue(existente),
      create,
    },
  }
  return { svc: new CartaDeRegistroService(prisma), create, prisma }
}

const base = { propertyId: 'p1', guestStayId: 'gs1', documento: doc, firmaUrl: 'https://f/1.png' }

describe('la huella', () => {
  it('🔴 NO depende del orden de las claves', () => {
    // `JSON.stringify` conserva el orden de inserción. Sin canonicalizar, dos
    // objetos con los mismos datos darían huellas distintas y la verificación
    // fallaría sin que nada estuviera mal. Es el fallo clásico de firmar JSON.
    const a = { hotel: { nombre: 'X' }, version: 1 }
    const b = { version: 1, hotel: { nombre: 'X' } }
    expect(CartaDeRegistroService.huellaDe(a, null)).toBe(CartaDeRegistroService.huellaDe(b, null))
  })

  it('🔴 cambia si cambia UN carácter del documento', () => {
    const otro = { ...doc, importe: { ...doc.importe, totalCentavos: 832358 } }
    expect(CartaDeRegistroService.huellaDe(doc, null))
      .not.toBe(CartaDeRegistroService.huellaDe(otro, null))
  })

  it('🔴 cambia si cambia la FIRMA', () => {
    // Sellar sólo el texto dejaría sustituir la imagen de la firma sin que la
    // huella se entere. La firma entra en la huella.
    expect(CartaDeRegistroService.huellaDe(doc, 'https://f/1.png'))
      .not.toBe(CartaDeRegistroService.huellaDe(doc, 'https://f/2.png'))
  })

  it('es SHA-256: 64 caracteres hexadecimales', () => {
    expect(CartaDeRegistroService.huellaDe(doc, null)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('sellar', () => {
  it('guarda el documento ENTERO, no una plantilla', async () => {
    const { svc, create } = hacer()
    await svc.sellar(base)
    // Si se guardara «plantilla v3 + campos», cambiar la plantilla cambiaría
    // lo que parece que el huésped firmó.
    expect(create.mock.calls[0][0].data.documento).toEqual(doc)
  })

  it('🔴 sin firma NI código verificado se niega', async () => {
    const { svc, create } = hacer()
    await expect(svc.sellar({ ...base, firmaUrl: null })).rejects.toBeInstanceOf(BadRequestException)
    expect(create).not.toHaveBeenCalled()
  })

  it('con código verificado y sin firma, sí vale', async () => {
    // Un código de un solo uso al correo del huésped acredita que quien aceptó
    // controlaba ese contacto. Es lo que sube la firma de «simple» a difícil
    // de repudiar.
    const { svc, create } = hacer()
    await svc.sellar({ ...base, firmaUrl: null, otp: { verificado: true, canal: 'correo' } })
    expect(create.mock.calls[0][0].data.otpVerificado).toBe(true)
    expect(create.mock.calls[0][0].data.otpVerificadoEn).toBeInstanceOf(Date)
  })

  it('🔴 NO sobrescribe una carta que ya existe', async () => {
    // Dos cartas para una estancia serían dos versiones de lo que el huésped
    // firmó, y eso en una disputa no se puede explicar.
    const { svc, create } = hacer({ id: 'viejo', huella: 'abc' })
    const r = await svc.sellar(base)
    expect(r.id).toBe('viejo')
    expect(create).not.toHaveBeenCalled()
  })

  it('guarda el contexto del acto de firma', async () => {
    const { svc, create } = hacer()
    await svc.sellar({ ...base, testigoStaffId: 'st9', ip: '187.1.1.1', userAgent: 'iPad' })
    const d = create.mock.calls[0][0].data
    expect(d.testigoStaffId).toBe('st9')
    expect(d.ip).toBe('187.1.1.1')
    expect(d.firmadoEn).toBeInstanceOf(Date)
  })
})

describe('verificar', () => {
  const guardada = (over: Record<string, unknown> = {}) => ({
    documento: doc,
    firmaUrl: 'https://f/1.png',
    huella: CartaDeRegistroService.huellaDe(doc, 'https://f/1.png'),
    nom151Serial: null,
    ...over,
  })

  it('una carta intacta se verifica', async () => {
    const { svc } = hacer(guardada())
    const r = await svc.verificar('gs1')
    expect(r.integra).toBe(true)
    expect(r.conConstanciaNom151).toBe(false)
  })

  it('🔴 si alguien tocó la fila, se nota', async () => {
    // Guardar la huella y no volver a mirarla nunca es guardar un número.
    const tocado = { ...doc, importe: { ...doc.importe, totalCentavos: 1 } }
    const { svc } = hacer(guardada({ documento: tocado }))
    const r = await svc.verificar('gs1')
    expect(r.integra).toBe(false)
    expect(r.huellaRecalculada).not.toBe(r.huellaGuardada)
  })

  it('con constancia NOM-151 lo declara', async () => {
    const { svc } = hacer(guardada({ nom151Serial: 'PSC-0001' }))
    expect((await svc.verificar('gs1')).conConstanciaNom151).toBe(true)
  })

  it('una estancia sin carta no inventa una', async () => {
    const { svc } = hacer(null)
    await expect(svc.verificar('gs1')).rejects.toBeInstanceOf(NotFoundException)
  })
})
