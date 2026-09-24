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
      // El doble tiene que ofrecer lo mismo que el real: sin `findFirst`, las
      // pruebas fallaban por el doble y no por el código.
      findFirst: jest.fn().mockResolvedValue(null),
      create,
    },
  }
  return { svc: new CartaDeRegistroService(prisma), create, prisma }
}

const HASH_FIRMA = 'a'.repeat(64)
const base = {
  propertyId: 'p1', guestStayId: 'gs1', documento: doc,
  firmaUrl: 'https://f/1.png', firmaHash: HASH_FIRMA,
}

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

  it('🔴 cambia si cambian los BYTES de la firma, no su URL', () => {
    // EL FALLO QUE ENCONTRÉ ATACANDO ESTO. Antes se sellaba `firmaUrl`, así
    // que sustituir el PNG al que apunta no cambiaba la huella: `verificar()`
    // decía «íntegra» con una firma distinta dentro. Ahora entra el hash de
    // los bytes.
    const h1 = 'a'.repeat(64)
    const h2 = 'b'.repeat(64)
    expect(CartaDeRegistroService.huellaDe(doc, h1))
      .not.toBe(CartaDeRegistroService.huellaDe(doc, h2))
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
    await expect(svc.sellar({ ...base, firmaUrl: null, firmaHash: null }))
      .rejects.toBeInstanceOf(BadRequestException)
    expect(create).not.toHaveBeenCalled()
  })

  it('🔴 una firma SIN su hash se rechaza', async () => {
    // Aceptar la imagen sin sellarla sería volver al fallo con otra cara.
    const { svc, create } = hacer()
    await expect(svc.sellar({ ...base, firmaHash: null }))
      .rejects.toThrow(/hash de la imagen/i)
    expect(create).not.toHaveBeenCalled()
  })

  it('⚠️ avisa si la MISMA firma ya se usó en otra estancia', async () => {
    // Copiar el garabato de un huésped a la estancia de otro. No se bloquea
    // —dos estancias del mismo huésped firman casi igual— pero se deja dicho.
    const { svc, prisma } = hacer()
    prisma.registrationRecord.findUnique = jest.fn().mockResolvedValue(null)
    prisma.registrationRecord.findFirst = jest.fn().mockResolvedValue({ guestStayId: 'gs-otra' })
    const aviso = jest.spyOn((svc as never as { logger: { warn: () => void } }).logger, 'warn')
    await svc.sellar(base)
    expect(aviso).toHaveBeenCalledWith(expect.stringMatching(/IDÉNTICA a la de gs-otra/))
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
    firmaHash: HASH_FIRMA,
    huella: CartaDeRegistroService.huellaDe(doc, HASH_FIRMA),
    nom151Serial: null,
    ...over,
  })

  it('una carta intacta se verifica', async () => {
    const { svc } = hacer(guardada())
    const r = await svc.verificar('gs1')
    expect(r.integra).toBe(true)
    expect(r.conConstanciaNom151).toBe(false)
    expect(r.selloDeImagen).toBe(true)
  })

  it('🔴 ATAQUE: sustituir la imagen de la firma rompe la verificación', async () => {
    // El ataque concreto: alguien con acceso al almacén cambia el PNG. La URL
    // sigue igual, pero el hash de los bytes no.
    const { svc } = hacer(guardada({ firmaHash: 'c'.repeat(64) }))
    expect((await svc.verificar('gs1')).integra).toBe(false)
  })

  it('una carta vieja sin sello de imagen lo DECLARA', async () => {
    // No se finge que está bien: se dice que su firma no está sellada.
    const { svc } = hacer(guardada({
      firmaHash: null, huella: CartaDeRegistroService.huellaDe(doc, null),
    }))
    const r = await svc.verificar('gs1')
    expect(r.integra).toBe(true)
    expect(r.selloDeImagen).toBe(false)
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
