import * as bcrypt from 'bcrypt'
import { BookingApiKeyService } from './booking-api-key.service'

// BOOKING-ENGINE B7 — auth de la API pública (Tier 3).
describe('BookingApiKeyService', () => {
  let prisma: any
  let service: BookingApiKeyService

  beforeEach(() => {
    prisma = {
      bookingApiKey: {
        create: jest.fn().mockResolvedValue({ id: 'key-1' }),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    }
    service = new BookingApiKeyService(prisma)
  })

  it('🔴 genera una llave sk_, no pk_: pk_ promete «seguro en el navegador» y ésta crea reservas', async () => {
    const r = await service.generate({ propertyId: 'prop-1', label: 'Sitio', environment: 'live' })
    expect(r.plaintextKey).toMatch(/^sk_live_[0-9a-f]{48}$/)
    expect(r.keyPrefix.startsWith('sk_')).toBe(true)
    const data = prisma.bookingApiKey.create.mock.calls[0][0].data
    expect(data.keyHash).not.toContain(r.plaintextKey) // no se guarda en claro
    // El secret (últimos 32 hex) hashea contra keyHash.
    const secret = r.plaintextKey.slice('sk_live_'.length + 16)
    expect(await bcrypt.compare(secret, data.keyHash)).toBe(true)
  })

  it('verify acepta una llave válida y resuelve su property', async () => {
    const keyId = 'a'.repeat(16)
    const secret = 'b'.repeat(32)
    prisma.bookingApiKey.findUnique.mockResolvedValue({
      id: 'key-1', propertyId: 'prop-1', environment: 'live',
      keyHash: await bcrypt.hash(secret, 10), allowedOrigins: [], active: true, revokedAt: null,
    })
    const v = await service.verify(`pk_live_${keyId}${secret}`)
    expect(v).toMatchObject({ id: 'key-1', propertyId: 'prop-1' })
  })

  it('verify rechaza: formato inválido, secret incorrecto, llave revocada', async () => {
    expect(await service.verify(undefined)).toBeNull()
    expect(await service.verify('no-es-una-llave')).toBeNull()

    const keyId = 'c'.repeat(16)
    prisma.bookingApiKey.findUnique.mockResolvedValue({
      id: 'k', propertyId: 'p', environment: 'live',
      keyHash: await bcrypt.hash('correcto'.padEnd(32, '0'), 10), allowedOrigins: [], active: true, revokedAt: null,
    })
    expect(await service.verify(`pk_live_${keyId}${'x'.repeat(32)}`)).toBeNull() // secret incorrecto

    prisma.bookingApiKey.findUnique.mockResolvedValue({
      id: 'k', propertyId: 'p', keyHash: 'h', active: false, revokedAt: new Date(), allowedOrigins: [],
    })
    expect(await service.verify(`pk_live_${'d'.repeat(16)}${'e'.repeat(32)}`)).toBeNull() // revocada
  })

  it('revoke es scoped a la property (no revoca llaves de otra property)', async () => {
    prisma.bookingApiKey.findFirst.mockResolvedValue(null) // la llave no es de esta property
    expect(await service.revoke('prop-otra', 'key-1')).toEqual({ id: 'key-1', revoked: false })
    expect(prisma.bookingApiKey.update).not.toHaveBeenCalled()
  })
})

/**
 * El cambio de prefijo es incompatible, así que lo que importa no es sólo que
 * las llaves nuevas nazcan `sk_`, sino que **las viejas sigan funcionando**.
 * Un hotel con su sitio conectado no puede quedarse sin reservas porque
 * nosotros arreglemos un nombre.
 */
describe('BookingApiKeyService — compatibilidad del prefijo', () => {
  const bcryptMod = jest.requireActual('bcrypt') as typeof import('bcrypt')
  const keyId = 'a'.repeat(16)
  const secret = 'b'.repeat(32)

  const arma = async (environment = 'live') => {
    const keyHash = await bcryptMod.hash(secret, 4)
    const prisma: any = {
      bookingApiKey: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'k1', propertyId: 'prop-1', environment, keyHash,
          allowedOrigins: [], active: true, revokedAt: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    }
    const { BookingApiKeyService } = await import('./booking-api-key.service')
    return { service: new BookingApiKeyService(prisma), prisma }
  }

  it('🔑 una llave pk_ ya emitida SIGUE funcionando', async () => {
    const { service } = await arma()
    const v = await service.verify(`pk_live_${keyId}${secret}`)
    expect(v?.propertyId).toBe('prop-1')
  })

  it('y una sk_ con el mismo material también: el prefijo no es criptografía', async () => {
    const { service } = await arma()
    const v = await service.verify(`sk_live_${keyId}${secret}`)
    expect(v?.propertyId).toBe('prop-1')
  })

  it('🔴 una llave _test_ NO abre una property live', async () => {
    // La búsqueda es por `keyId`, que es el mismo, así que sin esta
    // comprobación el prefijo de entorno no significaba nada — y es justo lo
    // que separa una prueba de una reserva real.
    const { service } = await arma('live')
    expect(await service.verify(`sk_test_${keyId}${secret}`)).toBeNull()
  })

  it('un prefijo inventado no pasa', async () => {
    const { service } = await arma()
    expect(await service.verify(`xx_live_${keyId}${secret}`)).toBeNull()
    expect(await service.verify(`${keyId}${secret}`)).toBeNull()
  })
})
