import { GoneException, BadRequestException, NotFoundException } from '@nestjs/common'
import * as crypto from 'crypto'
import * as bcrypt from 'bcrypt'
import { InvitacionDeStaffService } from './invitacion-de-staff.service'

/**
 * La invitación, mirada por quien quiere entrar sin permiso.
 *
 * Lo que estas pruebas afirman no es «funciona», sino **que el enlace es la
 * única llave, que dura poco, que sirve una vez y que nadie más conoce la
 * contraseña**.
 */

function hacer(over: { staff?: any; propiedad?: any; porEmail?: any } = {}) {
  const update = jest.fn().mockResolvedValue({})
  const create = jest.fn().mockResolvedValue({ id: 'st-nuevo' })
  const prisma: any = {
    property: {
      findUnique: jest.fn().mockResolvedValue(
        'propiedad' in over ? over.propiedad : { id: 'p1', name: 'Hotel', organizationId: 'o1' },
      ),
    },
    staff: {
      findUnique: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(where.email !== undefined ? (over.porEmail ?? null) : (over.staff ?? null)),
      ),
      update,
      create,
    },
    $transaction: async (fn: any) => fn(prisma),
  }
  return { svc: new InvitacionDeStaffService(prisma), prisma, update, create }
}

const vivo = (extra: Record<string, unknown> = {}) => ({
  id: 'st1',
  email: 'gerencia@hotel.com',
  name: 'Gerencia',
  propertyId: 'p1',
  setupTokenExpiresAt: new Date(Date.now() + 3_600_000),
  setupTokenConsumedAt: null,
  ...extra,
})

describe('emitir', () => {
  it('🔴 el token que devuelve NO es el que se guarda: se guarda su hash', async () => {
    const { svc, create } = hacer()
    const r = await svc.emitir({ propertyId: 'p1', email: 'A@Hotel.com', nombre: 'Ger', rol: 'SUPERVISOR' })
    const guardado = create.mock.calls[0][0].data.setupTokenHash
    expect(guardado).not.toBe(r.token)
    expect(guardado).toBe(crypto.createHash('sha256').update(r.token).digest('hex'))
  })

  it('🔴 la contraseña inicial es inservible: nadie la conoce, ni este proceso', async () => {
    const { svc, create } = hacer()
    const r = await svc.emitir({ propertyId: 'p1', email: 'a@h.com', nombre: 'G', rol: 'SUPERVISOR' })
    const hash = create.mock.calls[0][0].data.passwordHash
    // No es un hash de vacío, ni del token, ni del correo. Es de algo que se
    // generó y se tiró: la ficha existe y es inaccesible hasta el canje.
    for (const intento of ['', r.token, 'a@h.com', 'password']) {
      expect(await bcrypt.compare(intento, hash)).toBe(false)
    }
  })

  it('el correo se normaliza a minúsculas', async () => {
    const { svc, create } = hacer()
    await svc.emitir({ propertyId: 'p1', email: '  GER@Hotel.COM ', nombre: 'G', rol: 'SUPERVISOR' })
    expect(create.mock.calls[0][0].data.email).toBe('ger@hotel.com')
  })

  it('caduca en 72 horas', async () => {
    const { svc } = hacer()
    const r = await svc.emitir({ propertyId: 'p1', email: 'a@h.com', nombre: 'G', rol: 'SUPERVISOR' })
    const horas = (r.expiraEn.getTime() - Date.now()) / 3_600_000
    expect(horas).toBeGreaterThan(71.9)
    expect(horas).toBeLessThan(72.1)
  })

  it('si ya existe la ficha, RENUEVA en vez de duplicar a la persona', async () => {
    const { svc, update, create } = hacer({ porEmail: { id: 'st1', propertyId: 'p1' } })
    const r = await svc.emitir({ propertyId: 'p1', email: 'a@h.com', nombre: 'G', rol: 'SUPERVISOR' })
    expect(r.creado).toBe(false)
    expect(create).not.toHaveBeenCalled()
    // Limpia el consumo: re-invitar tiene que servir para recuperar el acceso.
    expect(update.mock.calls[0][0].data.setupTokenConsumedAt).toBeNull()
  })

  it('🔴 no se lleva a alguien de OTRA propiedad en silencio', async () => {
    const { svc } = hacer({ porEmail: { id: 'st9', propertyId: 'otra' } })
    await expect(
      svc.emitir({ propertyId: 'p1', email: 'a@h.com', nombre: 'G', rol: 'SUPERVISOR' }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('una propiedad que no existe no emite nada', async () => {
    const { svc, create } = hacer({ propiedad: null })
    await expect(
      svc.emitir({ propertyId: 'nope', email: 'a@h.com', nombre: 'G', rol: 'SUPERVISOR' }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(create).not.toHaveBeenCalled()
  })
})

describe('activar', () => {
  const token = 'a'.repeat(64)

  it('fija la contraseña, consume el enlace y BORRA el hash', async () => {
    const { svc, update } = hacer({ staff: vivo() })
    await svc.activar(token, 'una-contrasena-larga')
    const d = update.mock.calls[0][0].data
    expect(await bcrypt.compare('una-contrasena-larga', d.passwordHash)).toBe(true)
    expect(d.setupTokenConsumedAt).toBeInstanceOf(Date)
    expect(d.setupTokenHash).toBeNull()
  })

  it('🔴 un enlace ya usado no sirve', async () => {
    const { svc, update } = hacer({ staff: vivo({ setupTokenConsumedAt: new Date() }) })
    await expect(svc.activar(token, 'una-contrasena-larga')).rejects.toBeInstanceOf(GoneException)
    expect(update).not.toHaveBeenCalled()
  })

  it('🔴 un enlace caducado no sirve', async () => {
    const { svc, update } = hacer({ staff: vivo({ setupTokenExpiresAt: new Date(Date.now() - 1000) }) })
    await expect(svc.activar(token, 'una-contrasena-larga')).rejects.toBeInstanceOf(GoneException)
    expect(update).not.toHaveBeenCalled()
  })

  it('un token inventado no dice si existió alguna vez', async () => {
    const { svc } = hacer({ staff: null })
    await expect(svc.activar(token, 'una-contrasena-larga')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('una contraseña corta se rechaza ANTES de tocar la base', async () => {
    const { svc, prisma } = hacer({ staff: vivo() })
    await expect(svc.activar(token, 'corta')).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.staff.findUnique).not.toHaveBeenCalled()
  })

  it('un token demasiado corto ni se consulta', async () => {
    const { svc, prisma } = hacer({ staff: vivo() })
    await expect(svc.activar('abc', 'una-contrasena-larga')).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.staff.findUnique).not.toHaveBeenCalled()
  })

  it('🔴 dos canjes a la vez: el segundo no puede fijar otra contraseña', async () => {
    // La comprobación del consumo vive DENTRO de la transacción justo para
    // esto. Se simula que entre la lectura y la escritura alguien ya canjeó.
    const { svc, prisma, update } = hacer({ staff: vivo() })
    let vuelta = 0
    prisma.staff.findUnique = jest.fn().mockImplementation(({ where }: any) => {
      if (where.setupTokenHash) return Promise.resolve(vivo())
      vuelta++
      return Promise.resolve({ setupTokenConsumedAt: vuelta === 1 ? new Date() : null })
    })
    await expect(svc.activar(token, 'una-contrasena-larga')).rejects.toBeInstanceOf(GoneException)
    expect(update).not.toHaveBeenCalled()
  })
})
